/**
 * specialBlock.js — 특수 블록 생성/발동/조합 관리
 *
 * 4매치→로켓, 5매치→레인보우, L/T→폭탄 생성 규칙.
 * 특수 블록 발동 효과 계산 (단일/조합/연쇄).
 * DFS 기반 연쇄 발동으로 특수 블록 체인 처리.
 */

import { getBlockType, getNormalTypes, BLOCK_CATEGORY } from './blockTypes.js';
import { createBlock } from './board.js';
// eventBus는 향후 이벤트 발행 시 사용 예정

// ========================================
// 상수 정의
// ========================================

/** 특수 블록 ID 상수 */
const SPECIAL_IDS = Object.freeze({
    H_ROCKET: 6,       // 가로 로켓
    V_ROCKET: 7,       // 세로 로켓
    BOMB: 8,           // 폭탄
    RAINBOW: 9,        // 레인보우
    GUIDED_BOMB: 10    // 타겟 유도형 폭탄
});

/** DFS 연쇄 최대 깊이 (무한루프 방지) */
const MAX_SPECIAL_CHAIN_DEPTH = 20;

// ========================================
// SpecialBlockManager 클래스
// ========================================

class SpecialBlockManager {
    /**
     * 특수 블록 매니저를 생성한다.
     * @param {object} board - Board 인스턴스
     */
    constructor(board) {
        /** @type {object} Board 인스턴스 */
        this.board = board;
    }

    // ========================================
    // 블록 판별
    // ========================================

    /**
     * 블록이 특수 블록인지 확인한다.
     * @param {object} block - Block 객체
     * @returns {boolean}
     */
    isSpecialBlock(block) {
        if (!block) return false;
        const typeDef = getBlockType(block.typeId);
        return typeDef && typeDef.blockType === BLOCK_CATEGORY.SPECIAL;
    }

    /**
     * 블록이 로켓인지 확인한다.
     * @param {object} block - Block 객체
     * @returns {boolean}
     */
    isRocket(block) {
        if (!block) return false;
        return block.typeId === SPECIAL_IDS.H_ROCKET ||
               block.typeId === SPECIAL_IDS.V_ROCKET;
    }

    /**
     * 블록이 타겟 유도형 폭탄인지 확인한다.
     * @param {object} block - Block 객체
     * @returns {boolean}
     */
    isGuidedBomb(block) {
        if (!block) return false;
        return block.typeId === SPECIAL_IDS.GUIDED_BOMB;
    }

    /**
     * 블록의 매치 색상을 반환한다.
     * 일반 블록: typeId (1~5)
     * 특수 블록/기믹/빈칸: null (매치 불가 — 특수 블록은 색상 독립)
     * @param {object} block - Block 객체
     * @returns {number|null}
     */
    getMatchColor(block) {
        if (!block) return null;
        const typeDef = getBlockType(block.typeId);
        if (!typeDef) return null;

        // 일반 블록만 매치 참여 (typeId가 색상)
        if (typeDef.blockType === BLOCK_CATEGORY.NORMAL) {
            return block.typeId;
        }

        // 특수 블록/기믹: 매치 불참 (색상 독립 오브젝트)
        return null;
    }

    // ========================================
    // 특수 블록 생성
    // ========================================

    /**
     * 매치 결과에서 특수 블록을 생성한다.
     * 매치 패턴에 따라 로켓/폭탄/레인보우를 생성한다.
     * 특수 블록은 색상 독립 오브젝트이므로 색상을 상속하지 않는다.
     * @param {object} matchResult - MatchResult 객체
     * @returns {object|null} 생성된 Block 또는 null
     */
    createSpecialFromMatch(matchResult) {
        if (!matchResult.specialBlockType || !matchResult.specialBlockPosition) {
            return null;
        }

        const pos = matchResult.specialBlockPosition;
        return createBlock(matchResult.specialBlockType, pos.row, pos.col);
    }

    // ========================================
    // 효과 범위 계산
    // ========================================

    /**
     * 특수 블록의 효과 범위를 계산한다.
     * @param {object} block - 특수 Block 객체
     * @returns {Array<{row, col}>} 영향 받는 위치 배열
     */
    calculateEffect(block) {
        switch (block.typeId) {
            case SPECIAL_IDS.H_ROCKET:
                return this.calculateRocketEffect(block.row, block.col, 'horizontal');
            case SPECIAL_IDS.V_ROCKET:
                return this.calculateRocketEffect(block.row, block.col, 'vertical');
            case SPECIAL_IDS.BOMB:
                return this.calculateBombEffect(block.row, block.col, 1);
            case SPECIAL_IDS.RAINBOW:
                // 레인보우 더블탭: 임의 색상 1종 선택 → 해당 색 블록 전체 제거
                return this.calculateRainbowDoubleTapEffect(block.row, block.col);
            case SPECIAL_IDS.GUIDED_BOMB: {
                // 출발점 십자 폭발 (5칸: 중심 + 상하좌우)
                const originCross = this.calculateSmallCrossEffect(block.row, block.col);
                // 랜덤 타겟 선택
                const guidedTargets = this.calculateGuidedBombEffect(1);
                if (guidedTargets.length === 0) return originCross;
                // 도착점 1칸 범위 폭발 (3×3)
                const targetBomb = this.calculateBombEffect(
                    guidedTargets[0].row, guidedTargets[0].col, 1
                );
                // 합집합 반환
                return this._unionPositions(originCross, targetBomb);
            }
            default:
                return [];
        }
    }

    /**
     * 로켓 효과 범위를 계산한다.
     * 가로 로켓: 같은 행 전체, 세로 로켓: 같은 열 전체
     * @param {number} row - 로켓 행
     * @param {number} col - 로켓 열
     * @param {string} direction - 'horizontal' | 'vertical'
     * @returns {Array<{row, col}>}
     */
    calculateRocketEffect(row, col, direction) {
        const positions = [];
        const board = this.board;

        if (direction === 'horizontal') {
            // 같은 행 전체
            for (let c = 0; c < board.cols; c++) {
                positions.push({ row, col: c });
            }
        } else {
            // 같은 열 전체
            for (let r = 0; r < board.rows; r++) {
                positions.push({ row: r, col });
            }
        }

        return positions;
    }

    /**
     * 폭탄 효과 범위를 계산한다.
     * range=1: 3x3, range=2: 5x5
     * @param {number} row - 중심 행
     * @param {number} col - 중심 열
     * @param {number} range - 범위 (기본 1 = 3x3)
     * @returns {Array<{row, col}>}
     */
    calculateBombEffect(row, col, range) {
        const positions = [];
        const board = this.board;

        for (let r = row - range; r <= row + range; r++) {
            for (let c = col - range; c <= col + range; c++) {
                if (board.isValidPosition(r, c)) {
                    positions.push({ row: r, col: c });
                }
            }
        }

        return positions;
    }

    /**
     * 레인보우 효과 범위를 계산한다. (특정 색상 전체 제거)
     * @param {number} colorTypeId - 제거할 색상의 typeId
     * @returns {Array<{row, col}>}
     */
    calculateRainbowEffect(colorTypeId) {
        const positions = [];
        const board = this.board;

        for (let r = 0; r < board.rows; r++) {
            for (let c = 0; c < board.cols; c++) {
                const block = board.getBlock(r, c);
                if (block && this.getMatchColor(block) === colorTypeId) {
                    positions.push({ row: r, col: c });
                }
            }
        }

        return positions;
    }

    /**
     * 레인보우 더블탭 효과를 계산한다.
     * 보드에서 임의의 색상 1종을 선택한 뒤, 해당 색상 블록 전체를 제거한다.
     * @param {number} selfRow - 레인보우 자신의 행
     * @param {number} selfCol - 레인보우 자신의 열
     * @returns {Array<{row, col}>}
     */
    calculateRainbowDoubleTapEffect(selfRow, selfCol) {
        const board = this.board;
        const normalTypeIds = getNormalTypes().map(t => t.id);

        // 보드에 실제로 존재하는 색상만 후보로 수집
        const colorsOnBoard = new Set();
        for (let r = 0; r < board.rows; r++) {
            for (let c = 0; c < board.cols; c++) {
                const block = board.getBlock(r, c);
                if (block && normalTypeIds.includes(block.typeId)) {
                    colorsOnBoard.add(block.typeId);
                }
            }
        }

        if (colorsOnBoard.size === 0) return [{ row: selfRow, col: selfCol }];

        // 임의의 색상 1종 선택
        const colorArray = Array.from(colorsOnBoard);
        const chosenColor = colorArray[Math.floor(Math.random() * colorArray.length)];

        // 해당 색상 블록 전체 + 레인보우 자신 위치 반환
        const colorPositions = this.calculateRainbowEffect(chosenColor);
        return [{ row: selfRow, col: selfCol }, ...colorPositions];
    }

    /**
     * 타겟 유도형 폭탄 효과를 계산한다.
     * 보드의 일반 블록 중 랜덤으로 대상을 선택한다.
     * @param {number} [count=1] - 선택할 대상 수 (기본 1개)
     * @returns {Array<{row, col}>}
     */
    calculateGuidedBombEffect(count = 1) {
        const candidates = [];
        const board = this.board;

        // 보드에서 일반 블록 후보 수집
        for (let r = 0; r < board.rows; r++) {
            for (let c = 0; c < board.cols; c++) {
                const block = board.getBlock(r, c);
                if (block) {
                    const typeDef = getBlockType(block.typeId);
                    if (typeDef && typeDef.blockType === BLOCK_CATEGORY.NORMAL) {
                        candidates.push({ row: r, col: c });
                    }
                }
            }
        }

        // 랜덤으로 count개 선택 (중복 없이)
        const selected = [];
        const pool = [...candidates];
        const selectCount = Math.min(count, pool.length);
        for (let i = 0; i < selectCount; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            selected.push(pool[idx]);
            pool.splice(idx, 1);
        }

        return selected;
    }

    /**
     * 유도타겟 + 로켓 조합 효과를 계산한다.
     * 랜덤 타겟 1곳으로 날아가서 십자(행+열) 제거
     * @returns {Array<{row, col}>}
     */
    calculateGuidedRocketCombo() {
        const targets = this.calculateGuidedBombEffect(1);
        if (targets.length === 0) return [];

        const target = targets[0];
        // 랜덤으로 가로 또는 세로 한 방향만 선택 (십자 아님)
        const direction = Math.random() < 0.5 ? 'horizontal' : 'vertical';
        return this.calculateRocketEffect(target.row, target.col, direction);
    }

    /**
     * 유도타겟 + 폭탄 조합 효과를 계산한다.
     * 랜덤 타겟 1곳으로 날아가서 3×3 범위 폭발
     * @returns {Array<{row, col}>}
     */
    calculateGuidedBombCombo() {
        const targets = this.calculateGuidedBombEffect(1);
        if (targets.length === 0) return [];

        const target = targets[0];
        return this.calculateBombEffect(target.row, target.col, 1);
    }

    /**
     * 십자 효과 범위를 계산한다. (로켓+로켓 조합)
     * 전체 행 + 전체 열 제거
     * @param {number} row - 중심 행
     * @param {number} col - 중심 열
     * @returns {Array<{row, col}>}
     */
    calculateCrossEffect(row, col) {
        const posSet = new Map();

        // 전체 행
        for (let c = 0; c < this.board.cols; c++) {
            posSet.set(`${row},${c}`, { row, col: c });
        }
        // 전체 열
        for (let r = 0; r < this.board.rows; r++) {
            posSet.set(`${r},${col}`, { row: r, col });
        }

        return Array.from(posSet.values());
    }

    /**
     * 소형 십자 효과 범위를 계산한다. (타겟 유도형 폭탄 출발점)
     * 중심 + 상하좌우 = 5칸
     * @param {number} row - 중심 행
     * @param {number} col - 중심 열
     * @returns {Array<{row, col}>}
     */
    calculateSmallCrossEffect(row, col) {
        const positions = [{ row, col }];
        const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        for (const [dr, dc] of deltas) {
            const r = row + dr;
            const c = col + dc;
            if (this.board.isValidPosition(r, c)) {
                positions.push({ row: r, col: c });
            }
        }

        return positions;
    }

    /**
     * 확대 폭탄 효과를 계산한다. (폭탄+폭탄 조합: 5x5)
     * @param {number} row - 중심 행
     * @param {number} col - 중심 열
     * @returns {Array<{row, col}>}
     */
    calculateBigBombEffect(row, col) {
        return this.calculateBombEffect(row, col, 2);
    }

    /**
     * 로켓+폭탄 조합 효과를 계산한다. (3행 + 3열 제거)
     * @param {number} row - 중심 행
     * @param {number} col - 중심 열
     * @returns {Array<{row, col}>}
     */
    calculateRocketBombEffect(row, col) {
        const posSet = new Map();
        const board = this.board;

        // 3행 (row-1, row, row+1)
        for (let r = row - 1; r <= row + 1; r++) {
            if (r >= 0 && r < board.rows) {
                for (let c = 0; c < board.cols; c++) {
                    posSet.set(`${r},${c}`, { row: r, col: c });
                }
            }
        }

        // 3열 (col-1, col, col+1)
        for (let c = col - 1; c <= col + 1; c++) {
            if (c >= 0 && c < board.cols) {
                for (let r = 0; r < board.rows; r++) {
                    posSet.set(`${r},${c}`, { row: r, col: c });
                }
            }
        }

        return Array.from(posSet.values());
    }

    // ========================================
    // DFS 연쇄 발동
    // ========================================

    /**
     * 특수 블록 연쇄 발동을 실행한다.
     * DFS로 범위 내 다른 특수 블록을 재귀 발동한다.
     * visited Set으로 중복 발동을 방지하고,
     * MAX_SPECIAL_CHAIN_DEPTH로 재귀 깊이를 제한한다.
     *
     * @param {object} triggerBlock - 발동 시작 블록 정보
     *   ({id, typeId, row, col, colorType})
     * @returns {{ allAffected: Array<{row,col}>, activations: object[] }}
     */
    activateSpecialChain(triggerBlock) {
        const visited = new Set();
        const activations = [];
        const allAffectedMap = new Map();

        const dfsActivate = (block, depth) => {
            // 안전장치: 최대 깊이 초과
            if (depth > MAX_SPECIAL_CHAIN_DEPTH) return;
            // 이미 발동된 블록 스킵
            if (visited.has(block.id)) return;
            // 특수 블록이 아니면 스킵
            if (!this.isSpecialBlock(block)) return;

            visited.add(block.id);

            // 효과 범위 계산
            const affected = this.calculateEffect(block);
            activations.push({
                block: { ...block },
                affected,
                depth
            });

            // 영향 위치 수집
            for (const pos of affected) {
                allAffectedMap.set(`${pos.row},${pos.col}`, pos);
            }

            // 범위 내 다른 특수 블록 → 재귀 발동 (DFS)
            for (const pos of affected) {
                const targetBlock = this.board.getBlock(pos.row, pos.col);
                if (targetBlock &&
                    this.isSpecialBlock(targetBlock) &&
                    !visited.has(targetBlock.id)) {
                    dfsActivate(targetBlock, depth + 1);
                }
            }
        };

        dfsActivate(triggerBlock, 0);

        return {
            allAffected: Array.from(allAffectedMap.values()),
            activations
        };
    }

    // ========================================
    // 조합 효과 (스왑 시점에만 발생)
    // ========================================

    /**
     * 두 특수 블록의 조합 효과를 계산한다.
     * 스왑 시점에만 호출되며, 두 블록 모두 consumed 처리된다.
     *
     * 조합 매트릭스:
     * - 로켓+로켓 = 십자 제거 (전체 행+열)
     * - 로켓+폭탄 = 3행+3열 제거
     * - 폭탄+폭탄 = 5x5 범위 제거
     * - 레인보우+레인보우 = 보드 전체 제거
     * - 레인보우+특수 = 해당 색 블록 → 특수 블록 변환 후 발동
     *
     * @param {object} block1 - 첫 번째 특수 블록
     * @param {object} block2 - 두 번째 특수 블록
     * @returns {{ type: string, affected: Array<{row,col}>, conversions?: object[] }}
     */
    combineTwoSpecials(block1, block2) {
        const id1 = block1.typeId;
        const id2 = block2.typeId;

        // 발동 위치 = block2 (스왑 도착점)
        const row = block2.row;
        const col = block2.col;

        // 레인보우 + 레인보우 = 보드 전체 제거
        if (id1 === SPECIAL_IDS.RAINBOW && id2 === SPECIAL_IDS.RAINBOW) {
            return this._rainbowRainbowCombo();
        }

        // 레인보우 + 기타 특수
        if (id1 === SPECIAL_IDS.RAINBOW || id2 === SPECIAL_IDS.RAINBOW) {
            const other = id1 === SPECIAL_IDS.RAINBOW ? block2 : block1;
            return this._rainbowSpecialCombo(other);
        }

        // 로켓 + 로켓 = 십자
        if (this._isRocketId(id1) && this._isRocketId(id2)) {
            return {
                type: 'cross',
                affected: this.calculateCrossEffect(row, col)
            };
        }

        // 폭탄 + 폭탄 = 5x5
        if (id1 === SPECIAL_IDS.BOMB && id2 === SPECIAL_IDS.BOMB) {
            return {
                type: 'bigBomb',
                affected: this.calculateBigBombEffect(row, col)
            };
        }

        // 로켓 + 폭탄 = 3행+3열
        if ((this._isRocketId(id1) && id2 === SPECIAL_IDS.BOMB) ||
            (id1 === SPECIAL_IDS.BOMB && this._isRocketId(id2))) {
            return {
                type: 'rocketBomb',
                affected: this.calculateRocketBombEffect(row, col)
            };
        }

        // 유도타겟 + 유도타겟 = 랜덤 3곳 제거
        if (id1 === SPECIAL_IDS.GUIDED_BOMB && id2 === SPECIAL_IDS.GUIDED_BOMB) {
            return {
                type: 'guidedDouble',
                affected: this.calculateGuidedBombEffect(3)
            };
        }

        // 유도타겟 + 로켓 = 랜덤 타겟에 날아가서 십자(행+열) 제거
        if ((id1 === SPECIAL_IDS.GUIDED_BOMB && this._isRocketId(id2)) ||
            (this._isRocketId(id1) && id2 === SPECIAL_IDS.GUIDED_BOMB)) {
            return {
                type: 'guidedRocket',
                affected: this.calculateGuidedRocketCombo()
            };
        }

        // 유도타겟 + 폭탄 = 랜덤 타겟에 날아가서 3×3 폭발
        if ((id1 === SPECIAL_IDS.GUIDED_BOMB && id2 === SPECIAL_IDS.BOMB) ||
            (id1 === SPECIAL_IDS.BOMB && id2 === SPECIAL_IDS.GUIDED_BOMB)) {
            return {
                type: 'guidedBomb',
                affected: this.calculateGuidedBombCombo()
            };
        }

        // 기타 알 수 없는 조합 — 개별 효과 합산
        return {
            type: 'default',
            affected: this._unionPositions(
                this.calculateEffect(block1),
                this.calculateEffect(block2)
            )
        };
    }

    /**
     * 레인보우 + 일반 블록 스왑: 해당 색상 전체 제거
     * @param {object} normalBlock - 일반 블록
     * @returns {{ type: string, affected: Array<{row,col}> }}
     */
    rainbowNormalCombo(normalBlock) {
        const color = this.getMatchColor(normalBlock);
        if (!color) return { type: 'rainbowNormal', affected: [] };

        return {
            type: 'rainbowNormal',
            affected: this.calculateRainbowEffect(color)
        };
    }

    // ========================================
    // 조합 내부 메서드
    // ========================================

    /**
     * 레인보우 + 레인보우: 보드 전체 제거
     * @private
     */
    _rainbowRainbowCombo() {
        const positions = [];
        for (let r = 0; r < this.board.rows; r++) {
            for (let c = 0; c < this.board.cols; c++) {
                positions.push({ row: r, col: c });
            }
        }
        return { type: 'rainbowRainbow', affected: positions };
    }

    /**
     * 레인보우 + 특수 블록: 해당 색 블록을 특수 블록으로 변환 후 발동
     * 보드에서 가장 많은 색상을 자동으로 선택한다.
     * @private
     * @param {object} specialBlock - 레인보우가 아닌 특수 블록
     */
    _rainbowSpecialCombo(specialBlock) {
        // 보드에서 가장 많은 색상 선택
        const colorCounts = {};
        for (let r = 0; r < this.board.rows; r++) {
            for (let c = 0; c < this.board.cols; c++) {
                const b = this.board.getBlock(r, c);
                const mc = this.getMatchColor(b);
                if (mc) colorCounts[mc] = (colorCounts[mc] || 0) + 1;
            }
        }
        const maxColor = Object.entries(colorCounts)
            .sort((a, b) => b[1] - a[1])[0];
        if (!maxColor) return { type: 'rainbowSpecial', affected: [], conversions: [] };

        return this._buildRainbowSpecialResult(Number(maxColor[0]), specialBlock.typeId);
    }

    /**
     * 레인보우+특수 조합 결과를 구성한다.
     * @private
     * @param {number} colorTypeId - 대상 색상 ID
     * @param {number} convertToTypeId - 변환할 특수 블록 typeId
     */
    _buildRainbowSpecialResult(colorTypeId, convertToTypeId) {
        const targets = [];

        for (let r = 0; r < this.board.rows; r++) {
            for (let c = 0; c < this.board.cols; c++) {
                const block = this.board.getBlock(r, c);
                if (block && this.getMatchColor(block) === colorTypeId) {
                    targets.push({ row: r, col: c });
                }
            }
        }

        return {
            type: 'rainbowSpecial',
            affected: targets,
            conversions: targets.map(t => ({
                row: t.row,
                col: t.col,
                convertToTypeId
            }))
        };
    }

    // ========================================
    // 유틸리티
    // ========================================

    /**
     * typeId가 로켓인지 확인한다.
     * @private
     * @param {number} typeId
     * @returns {boolean}
     */
    _isRocketId(typeId) {
        return typeId === SPECIAL_IDS.H_ROCKET || typeId === SPECIAL_IDS.V_ROCKET;
    }

    /**
     * 두 위치 배열을 합집합으로 합친다. (중복 제거)
     * @private
     * @param {Array<{row,col}>} posA
     * @param {Array<{row,col}>} posB
     * @returns {Array<{row,col}>}
     */
    _unionPositions(posA, posB) {
        const map = new Map();
        for (const p of posA) map.set(`${p.row},${p.col}`, p);
        for (const p of posB) map.set(`${p.row},${p.col}`, p);
        return Array.from(map.values());
    }
}

// ========================================
// 내보내기
// ========================================

export { SpecialBlockManager, SPECIAL_IDS, MAX_SPECIAL_CHAIN_DEPTH };
