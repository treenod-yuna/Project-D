/**
 * board.js — 보드 생성 및 관리
 *
 * 2D Tile 배열을 생성/관리하며, 보드 상태의 단일 진실 소스(source of truth)이다.
 * 초기 블록 랜덤 배정 시 3매치가 발생하지 않도록 보장한다.
 */

import {
    BLOCK_TYPES,
    BLOCK_CATEGORY,
    getBlockType,
    getNormalTypes
} from './blockTypes.js';

// ========================================
// 상수 정의
// ========================================

/** 기본 보드 크기 */
const DEFAULT_ROWS = 8;
const DEFAULT_COLS = 8;

/** 초기 배치 시 3매치 방지 최대 재시도 횟수 */
const MAX_INIT_RETRIES = 100;

/** 레이어로 배치되는 LayerType (Cover2=블록 위, Floor=블록 아래) */
const LAYER_PLACEMENT_TYPES = ['Cover2', 'Floor'];

// ========================================
// 블록 ID 자동 채번
// ========================================

let _nextBlockId = 1;

/**
 * 런타임 고유 블록 ID를 생성한다.
 * @returns {number} 새 블록 ID
 */
function generateBlockId() {
    return _nextBlockId++;
}

// ========================================
// 데이터 구조 생성 함수
// ========================================

/**
 * Tile 객체를 생성한다. (보드의 한 칸)
 * @param {number} row - 행 인덱스
 * @param {number} col - 열 인덱스
 * @returns {object} Tile 객체
 */
function createTile(row, col) {
    return {
        row,
        col,
        block: null,        // 해당 칸의 블록 (null = 빈 칸)
        layers: [],          // 레이어형 기믹 (얼음, 체인 등)
        isActive: true       // 유효한 칸인지
    };
}

/**
 * Block 객체를 생성한다. (칸 위의 블록 엔티티)
 * @param {number} typeId - BlockTypeDefinition.id 참조
 * @param {number} row - 행 인덱스
 * @param {number} col - 열 인덱스
 * @returns {object} Block 객체
 */
function createBlock(typeId, row, col) {
    const typeDef = getBlockType(typeId);
    return {
        id: generateBlockId(),
        typeId,

        // 논리적 위치
        row,
        col,

        // 런타임 상태
        hp: typeDef ? typeDef.hp : 1,
        state: 'idle', // 'idle' | 'matched' | 'falling' | 'removing' | 'swapping'

        // 애니메이션용 보간 위치 (렌더러에서 사용)
        visualX: 0,
        visualY: 0,
        scale: 1.0,
        alpha: 1.0,

        // 다중 칸 블록용 (2x2 등)
        originRow: row,
        originCol: col,
        isOrigin: true
    };
}

/**
 * Layer 객체를 생성한다. (레이어형 기믹)
 * @param {number} typeId - BlockTypeDefinition.id 참조
 * @param {number} hp - 초기 체력
 * @param {number} zIndex - 렌더링 순서 (양수=블록 위, 음수=블록 아래)
 * @returns {object} Layer 객체
 */
function createLayer(typeId, hp, zIndex) {
    return {
        typeId,
        hp,
        zIndex
    };
}

// ========================================
// Board 클래스
// ========================================

class Board {
    /**
     * 보드를 생성한다.
     * @param {number} rows - 행 수 (기본 8)
     * @param {number} cols - 열 수 (기본 8)
     */
    constructor(rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
        /** @type {number} 보드 행 수 */
        this.rows = rows;
        /** @type {number} 보드 열 수 */
        this.cols = cols;
        /** @type {object[][]} 2D Tile 배열 (board.grid[row][col]) */
        this.grid = [];

        // 빈 그리드 초기화
        this._initGrid();
    }

    // ========================================
    // 초기화
    // ========================================

    /**
     * 빈 그리드를 초기화한다.
     * @private
     */
    _initGrid() {
        this.grid = [];
        for (let row = 0; row < this.rows; row++) {
            this.grid[row] = [];
            for (let col = 0; col < this.cols; col++) {
                this.grid[row][col] = createTile(row, col);
            }
        }
    }

    /**
     * 보드를 초기화하고 블록을 랜덤 배정한다.
     * 초기 배치 시 3매치가 발생하지 않도록 보장한다.
     * @param {object} config - 초기화 설정 (옵션)
     * @param {number[]} config.normalTypeIds - 사용할 일반 블록 타입 ID 목록
     */
    initialize(config = {}) {
        // 사용할 일반 블록 타입 ID 목록
        const normalTypeIds = config.normalTypeIds || getNormalTypes().map(t => t.id);

        // 그리드 초기화
        this._initGrid();

        // 각 칸에 3매치가 발생하지 않는 블록을 배정
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                this._placeBlockWithoutMatch(row, col, normalTypeIds);
            }
        }
    }

    /**
     * 3매치가 발생하지 않는 블록을 해당 칸에 배정한다.
     * 왼쪽 2칸, 위쪽 2칸을 검사하여 3연속이 되지 않는 타입을 선택한다.
     * @private
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @param {number[]} normalTypeIds - 사용 가능한 타입 ID 목록
     */
    _placeBlockWithoutMatch(row, col, normalTypeIds) {
        // 금지 타입 수집 (3매치 및 2x2가 되는 타입)
        const forbidden = new Set();

        // 가로 검사: 왼쪽 2칸이 같은 타입이면 해당 타입 금지
        if (col >= 2) {
            const left1 = this.getBlock(row, col - 1);
            const left2 = this.getBlock(row, col - 2);
            if (left1 && left2 && left1.typeId === left2.typeId) {
                forbidden.add(left1.typeId);
            }
        }

        // 세로 검사: 위쪽 2칸이 같은 타입이면 해당 타입 금지
        if (row >= 2) {
            const up1 = this.getBlock(row - 1, col);
            const up2 = this.getBlock(row - 2, col);
            if (up1 && up2 && up1.typeId === up2.typeId) {
                forbidden.add(up1.typeId);
            }
        }

        // 2x2 검사: 왼쪽 위 3칸이 같은 타입이면 해당 타입 금지
        if (row >= 1 && col >= 1) {
            const diagBlock = this.getBlock(row - 1, col - 1);
            const upBlock = this.getBlock(row - 1, col);
            const leftBlock = this.getBlock(row, col - 1);
            if (diagBlock && upBlock && leftBlock &&
                diagBlock.typeId === upBlock.typeId &&
                diagBlock.typeId === leftBlock.typeId) {
                forbidden.add(diagBlock.typeId);
            }
        }

        // 금지 타입을 제외한 후보 목록
        const candidates = normalTypeIds.filter(id => !forbidden.has(id));

        // 후보 중 랜덤 선택 (후보가 없으면 전체에서 선택 — 이론상 발생하지 않음)
        const pool = candidates.length > 0 ? candidates : normalTypeIds;
        const typeId = pool[Math.floor(Math.random() * pool.length)];

        // 블록 생성 및 배치
        const block = createBlock(typeId, row, col);
        this.setBlock(row, col, block);
    }

    // ========================================
    // 타일/블록 접근
    // ========================================

    /**
     * 지정 위치의 Tile을 반환한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {object|null} Tile 또는 null (범위 밖)
     */
    getTile(row, col) {
        if (!this.isValidPosition(row, col)) return null;
        return this.grid[row][col];
    }

    /**
     * 지정 위치의 Block을 반환한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {object|null} Block 또는 null
     */
    getBlock(row, col) {
        const tile = this.getTile(row, col);
        return tile ? tile.block : null;
    }

    /**
     * 지정 위치에 Block을 배치한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @param {object} block - Block 객체
     */
    setBlock(row, col, block) {
        const tile = this.getTile(row, col);
        if (!tile) return;
        tile.block = block;
        if (block) {
            block.row = row;
            block.col = col;
        }
    }

    /**
     * 지정 위치의 Block을 제거하고 반환한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {object|null} 제거된 Block 또는 null
     */
    removeBlock(row, col) {
        const tile = this.getTile(row, col);
        if (!tile || !tile.block) return null;
        const removed = tile.block;
        tile.block = null;
        return removed;
    }

    /**
     * 두 위치의 Block을 교환한다.
     * @param {number} row1 - 첫 번째 행
     * @param {number} col1 - 첫 번째 열
     * @param {number} row2 - 두 번째 행
     * @param {number} col2 - 두 번째 열
     */
    swapBlocks(row1, col1, row2, col2) {
        const block1 = this.getBlock(row1, col1);
        const block2 = this.getBlock(row2, col2);

        this.setBlock(row1, col1, block2);
        this.setBlock(row2, col2, block1);
    }

    // ========================================
    // 레이어 관리
    // ========================================

    /**
     * 지정 위치에 레이어를 추가한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @param {object} layer - Layer 객체
     */
    addLayer(row, col, layer) {
        const tile = this.getTile(row, col);
        if (!tile) return;
        tile.layers.push(layer);
        // zIndex 기준 정렬
        tile.layers.sort((a, b) => a.zIndex - b.zIndex);
    }

    /**
     * 지정 위치에서 특정 타입의 레이어를 제거한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @param {number} layerTypeId - 제거할 레이어 타입 ID
     * @returns {object|null} 제거된 Layer 또는 null
     */
    removeLayer(row, col, layerTypeId) {
        const tile = this.getTile(row, col);
        if (!tile) return null;

        const idx = tile.layers.findIndex(l => l.typeId === layerTypeId);
        if (idx === -1) return null;

        return tile.layers.splice(idx, 1)[0];
    }

    /**
     * 지정 위치의 모든 레이어를 반환한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {object[]} Layer 배열
     */
    getLayersAt(row, col) {
        const tile = this.getTile(row, col);
        return tile ? [...tile.layers] : [];
    }

    // ========================================
    // 기믹 배치
    // ========================================

    /**
     * 지정 위치에 기믹을 배치한다.
     * 레이어형 기믹은 Layer로, 블록형 기믹은 Block으로 배치된다.
     * @param {number} typeId - 기믹 타입 ID
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     */
    placeGimmick(typeId, row, col) {
        const typeDef = getBlockType(typeId);
        if (!typeDef) return;

        if (LAYER_PLACEMENT_TYPES.includes(typeDef.layerType)) {
            // 레이어형 기믹: Cover2는 블록 위(zIndex 1), Floor는 블록 아래(zIndex -1)
            const zIndex = typeDef.layerType === 'Floor' ? -1 : 1;
            const layer = createLayer(typeId, typeDef.hp, zIndex);
            this.addLayer(row, col, layer);
        } else {
            // 블록형 기믹: Block으로 배치
            const block = createBlock(typeId, row, col);
            this.setBlock(row, col, block);

            // 다중 칸 블록 처리 (2x2 등)
            if (typeDef.width > 1 || typeDef.height > 1) {
                for (let dr = 0; dr < typeDef.height; dr++) {
                    for (let dc = 0; dc < typeDef.width; dc++) {
                        if (dr === 0 && dc === 0) continue; // 원점은 이미 배치됨
                        const subRow = row + dr;
                        const subCol = col + dc;
                        if (this.isValidPosition(subRow, subCol)) {
                            const subBlock = createBlock(typeId, subRow, subCol);
                            subBlock.originRow = row;
                            subBlock.originCol = col;
                            subBlock.isOrigin = false;
                            this.setBlock(subRow, subCol, subBlock);
                        }
                    }
                }
            }
        }
    }

    // ========================================
    // 유틸리티
    // ========================================

    /**
     * 위치가 보드 범위 내인지 확인한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {boolean}
     */
    isValidPosition(row, col) {
        return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
    }

    /**
     * 해당 칸이 비어있는지 확인한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {boolean}
     */
    isEmpty(row, col) {
        const tile = this.getTile(row, col);
        return tile ? tile.block === null : false;
    }

    /**
     * 해당 칸이 다중 칸 블록(2x2 등)에 의해 점유되었는지 확인한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {boolean}
     */
    isOccupiedByLargeBlock(row, col) {
        const block = this.getBlock(row, col);
        if (!block) return false;
        const typeDef = getBlockType(block.typeId);
        return typeDef && (typeDef.width > 1 || typeDef.height > 1);
    }

    /**
     * 인접한 4방향 타일을 반환한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {object[]} 인접 Tile 배열 (유효한 위치만)
     */
    getAdjacentTiles(row, col) {
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // 상하좌우
        const result = [];
        for (const [dr, dc] of directions) {
            const tile = this.getTile(row + dr, col + dc);
            if (tile) result.push(tile);
        }
        return result;
    }

    /**
     * 보드의 모든 블록을 반환한다.
     * @returns {object[]} Block 배열
     */
    getAllBlocks() {
        const blocks = [];
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const block = this.getBlock(row, col);
                if (block) blocks.push(block);
            }
        }
        return blocks;
    }

    /**
     * 특정 타입의 블록 목록을 반환한다.
     * @param {number} typeId - 블록 타입 ID
     * @returns {object[]} Block 배열
     */
    getBlocksByType(typeId) {
        return this.getAllBlocks().filter(b => b.typeId === typeId);
    }

    /**
     * 특정 색상의 블록 목록을 반환한다.
     * @param {string} colorType - 색상 타입
     * @returns {object[]} Block 배열
     */
    getBlocksByColor(colorType) {
        return this.getAllBlocks().filter(b => {
            const typeDef = getBlockType(b.typeId);
            return typeDef && typeDef.colorType === colorType;
        });
    }

    /**
     * 보드 상태를 콘솔에 출력한다. (디버그용)
     */
    debugPrint() {
        const rows = [];
        for (let row = 0; row < this.rows; row++) {
            const cells = [];
            for (let col = 0; col < this.cols; col++) {
                const block = this.getBlock(row, col);
                cells.push(block ? block.typeId.toString() : '.');
            }
            rows.push(cells.join(' '));
        }
        console.log(rows.join('\n'));
    }
}

// ========================================
// 내보내기
// ========================================

export { Board, createBlock, createTile, createLayer, LAYER_PLACEMENT_TYPES };
