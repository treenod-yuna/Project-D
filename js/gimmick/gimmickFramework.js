/**
 * gimmickFramework.js — 기믹 프레임워크 코어
 *
 * 기믹 핸들러를 등록/관리하고, 코어 엔진 이벤트에 반응하여
 * 기믹 생명주기(데미지→파괴→확산→수집)를 처리한다.
 *
 * cascade.js에서 직접 호출하며, EventBus 이벤트는 UI/로깅용으로만 발행.
 */

import { getBlockType, BLOCK_CATEGORY } from '../core/blockTypes.js';
import { eventBus, EVENTS } from '../core/eventBus.js';

// ========================================
// 상수 정의
// ========================================

/** 확산 시 한 턴에 최대 확산 가능 횟수 (무한루프 방지) */
const MAX_SPREAD_PER_TURN = 50;

// ========================================
// GimmickManager 클래스
// ========================================

class GimmickManager {
    /**
     * 기믹 매니저를 생성한다.
     * @param {object} board - Board 인스턴스
     */
    constructor(board) {
        /** @type {object} Board 인스턴스 */
        this.board = board;

        /** @type {Map<number, object>} typeId → GimmickHandler 매핑 */
        this._handlerMap = new Map();

        /** @type {object[]} 등록된 핸들러 목록 (우선순위 정렬) */
        this._handlers = [];
    }

    // ========================================
    // 핸들러 등록/조회
    // ========================================

    /**
     * 기믹 핸들러를 등록한다.
     * 핸들러는 typeIds, category, priority, 콜백 함수를 포함한다.
     *
     * @param {object} handler - 기믹 핸들러
     * @param {number[]} handler.typeIds - 처리하는 기믹 typeId 목록
     * @param {string} handler.category - 'layer' | 'spread' | 'collect' | 'obstacle' | 'bigbox'
     * @param {number} handler.priority - 처리 우선순위 (낮을수록 먼저)
     */
    registerHandler(handler) {
        this._handlers.push(handler);
        // 우선순위 오름차순 정렬
        this._handlers.sort((a, b) => a.priority - b.priority);

        // typeId → handler 매핑
        for (const typeId of handler.typeIds) {
            this._handlerMap.set(typeId, handler);
        }
    }

    /**
     * typeId에 대응하는 핸들러를 조회한다.
     * @param {number} typeId - 기믹 타입 ID
     * @returns {object|undefined} GimmickHandler 또는 undefined
     */
    getHandler(typeId) {
        return this._handlerMap.get(typeId);
    }

    // ========================================
    // 매치 제거 후 인접 기믹 데미지
    // ========================================

    /**
     * 매치/레인보우 제거된 위치에 인접한 기믹의 HP를 감소시킨다.
     * damageFlag에 해당하는 플래그가 true인 기믹만 데미지를 받는다.
     *
     * @param {Array<{row:number, col:number}>} removedPositions - 제거된 블록 위치
     * @param {string} [damageFlag='indirectDamage'] - 확인할 플래그명 ('indirectDamage' | 'rainbowDamage')
     * @returns {{ damaged: object[], destroyed: object[] }}
     */
    processAdjacentDamage(removedPositions, damageFlag = 'indirectDamage') {
        const result = { damaged: [], destroyed: [] };
        const processed = new Set(); // 중복 처리 방지

        // 인접 4방향 오프셋
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        for (const pos of removedPositions) {
            for (const [dr, dc] of dirs) {
                const adjRow = pos.row + dr;
                const adjCol = pos.col + dc;

                // 범위 검사
                if (!this.board.isValidPosition(adjRow, adjCol)) continue;

                // 중복 체크
                const key = `${adjRow},${adjCol}`;
                if (processed.has(key)) continue;
                processed.add(key);

                // 해당 칸의 레이어 확인
                const layers = this.board.getLayersAt(adjRow, adjCol);
                for (const layer of layers) {
                    const typeDef = getBlockType(layer.typeId);
                    if (!typeDef) continue;

                    // 지정된 데미지 플래그가 true인 레이어만 데미지
                    if (!typeDef[damageFlag]) continue;

                    // HP 감소
                    this._damageLayer(adjRow, adjCol, layer, 1, result);
                }

                // 블록형 기믹도 확인 (거대상자 등)
                const block = this.board.getBlock(adjRow, adjCol);
                if (block) {
                    const blockDef = getBlockType(block.typeId);
                    if (blockDef && blockDef.blockType === BLOCK_CATEGORY.GIMMICK
                        && blockDef[damageFlag]) {
                        this._damageBlock(adjRow, adjCol, block, 1, result);
                    }
                }
            }
        }

        return result;
    }

    // ========================================
    // 특수 블록 범위 내 기믹 데미지
    // ========================================

    /**
     * 특수 블록 폭발 범위 내 기믹에 데미지를 준다.
     * damageType에 따라 bombDamage/rainbowDamage 플래그를 확인한다.
     *
     * @param {Array<{row:number, col:number}>} affectedPositions - 폭발 영향 위치
     * @param {string} damageType - 'bomb' | 'rocket' | 'rainbow'
     * @returns {{ damaged: object[], destroyed: object[] }}
     */
    processSpecialDamage(affectedPositions, damageType) {
        const result = { damaged: [], destroyed: [] };

        for (const pos of affectedPositions) {
            if (!this.board.isValidPosition(pos.row, pos.col)) continue;

            // 레이어 확인
            const layers = this.board.getLayersAt(pos.row, pos.col);
            for (const layer of layers) {
                const typeDef = getBlockType(layer.typeId);
                if (!typeDef) continue;

                // 데미지 타입별 플래그 확인
                if (damageType === 'rainbow' && !typeDef.rainbowDamage) continue;
                if ((damageType === 'bomb' || damageType === 'rocket') && !typeDef.bombDamage) continue;

                this._damageLayer(pos.row, pos.col, layer, 1, result);
            }

            // 블록형 기믹도 확인
            const block = this.board.getBlock(pos.row, pos.col);
            if (block) {
                const blockDef = getBlockType(block.typeId);
                if (blockDef && blockDef.blockType === BLOCK_CATEGORY.GIMMICK) {
                    if (damageType === 'rainbow' && !blockDef.rainbowDamage) continue;
                    if ((damageType === 'bomb' || damageType === 'rocket') && !blockDef.bombDamage) continue;

                    this._damageBlock(pos.row, pos.col, block, 1, result);
                }
            }
        }

        return result;
    }

    // ========================================
    // 수집형 기믹 처리
    // ========================================

    /**
     * 맨 아래 행에 도달한 수집형 기믹(곰인형 등)을 처리한다.
     * collectable=true인 블록이 맨 아래 행에 있으면 수집한다.
     *
     * @returns {{ collected: object[] }}
     */
    processCollection() {
        const result = { collected: [] };
        const bottomRow = this.board.rows - 1;

        for (let col = 0; col < this.board.cols; col++) {
            const block = this.board.getBlock(bottomRow, col);
            if (!block) continue;

            const typeDef = getBlockType(block.typeId);
            if (!typeDef || !typeDef.collectable) continue;

            // 수집 처리
            this.board.removeBlock(bottomRow, col);
            result.collected.push({
                typeId: block.typeId,
                row: bottomRow,
                col
            });

            eventBus.emit(EVENTS.GIMMICK_COLLECTED, {
                typeId: block.typeId,
                row: bottomRow,
                col
            });

            console.log(`[기믹] 수집: ${typeDef.name} at (${bottomRow},${col})`);
        }

        return result;
    }

    // ========================================
    // 확산형 기믹 처리
    // ========================================

    /**
     * 턴 종료 시 확산형 기믹을 인접 칸으로 확산시킨다.
     * spreadable=true인 레이어가 인접 4방향의 빈 레이어 칸으로 확산.
     *
     * @returns {{ spreads: object[] }}
     */
    processSpread() {
        const result = { spreads: [] };
        const spreadSources = [];

        // 확산 가능한 레이어 수집
        for (let row = 0; row < this.board.rows; row++) {
            for (let col = 0; col < this.board.cols; col++) {
                const layers = this.board.getLayersAt(row, col);
                for (const layer of layers) {
                    const typeDef = getBlockType(layer.typeId);
                    if (typeDef && typeDef.spreadable) {
                        spreadSources.push({
                            typeId: layer.typeId,
                            row,
                            col,
                            spreadRate: typeDef.spreadRate || 1
                        });
                    }
                }
            }
        }

        // 확산 실행
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        let totalSpread = 0;

        for (const source of spreadSources) {
            if (totalSpread >= MAX_SPREAD_PER_TURN) break;

            let spreadCount = 0;
            // 인접 칸 후보를 셔플하여 랜덤 방향으로 확산
            const shuffledDirs = [...dirs].sort(() => Math.random() - 0.5);

            for (const [dr, dc] of shuffledDirs) {
                if (spreadCount >= source.spreadRate) break;
                if (totalSpread >= MAX_SPREAD_PER_TURN) break;

                const toRow = source.row + dr;
                const toCol = source.col + dc;

                // 확산 가능 여부 확인
                if (!this._canSpreadTo(source.typeId, toRow, toCol)) continue;

                // 확산 실행: 같은 타입의 레이어 추가
                const typeDef = getBlockType(source.typeId);
                const zIndex = typeDef.layerType === 'Floor' ? -1 : 1;
                const newLayer = {
                    typeId: source.typeId,
                    hp: typeDef.hp,
                    zIndex
                };
                this.board.addLayer(toRow, toCol, newLayer);

                result.spreads.push({
                    typeId: source.typeId,
                    fromRow: source.row,
                    fromCol: source.col,
                    toRow,
                    toCol
                });

                eventBus.emit(EVENTS.GIMMICK_SPREAD, {
                    typeId: source.typeId,
                    fromRow: source.row,
                    fromCol: source.col,
                    toRow,
                    toCol
                });

                console.log(`[기믹] 확산: ${typeDef.name} (${source.row},${source.col}) → (${toRow},${toCol})`);

                spreadCount++;
                totalSpread++;
            }
        }

        return result;
    }

    // ========================================
    // 확산 가능 여부 확인
    // ========================================

    /**
     * 지정 위치에 확산이 가능한지 확인한다.
     * @param {number} typeId - 확산할 기믹 타입 ID
     * @param {number} row - 대상 행
     * @param {number} col - 대상 열
     * @returns {boolean}
     */
    _canSpreadTo(typeId, row, col) {
        // 범위 검사
        if (!this.board.isValidPosition(row, col)) return false;

        // 기존 레이어가 있으면 확산 불가
        const layers = this.board.getLayersAt(row, col);
        if (layers.length > 0) return false;

        // 블록형 기믹이 있으면 확산 불가
        const block = this.board.getBlock(row, col);
        if (block) {
            const blockDef = getBlockType(block.typeId);
            if (blockDef && blockDef.blockType === BLOCK_CATEGORY.GIMMICK) return false;
        }

        return true;
    }

    // ========================================
    // 내부: 레이어 데미지/파괴
    // ========================================

    /**
     * 레이어의 HP를 감소시킨다. HP≤0이면 파괴한다.
     * @private
     * @param {number} row - 행
     * @param {number} col - 열
     * @param {object} layer - Layer 객체
     * @param {number} amount - 데미지량
     * @param {object} result - 결과 객체 (damaged/destroyed 배열)
     */
    _damageLayer(row, col, layer, amount, result) {
        const hpBefore = layer.hp;
        layer.hp = Math.max(0, layer.hp - amount);

        eventBus.emit(EVENTS.GIMMICK_DAMAGED, {
            typeId: layer.typeId,
            row, col,
            hpBefore,
            hpAfter: layer.hp
        });

        const typeDef = getBlockType(layer.typeId);
        console.log(`[기믹] 데미지: ${typeDef?.name} at (${row},${col}) HP ${hpBefore}→${layer.hp}`);

        if (layer.hp <= 0) {
            this._destroyLayer(row, col, layer, result);
        } else {
            result.damaged.push({
                typeId: layer.typeId,
                row, col,
                remainingHp: layer.hp
            });
        }
    }

    /**
     * 레이어를 파괴한다 (보드에서 제거 + 이벤트 발행).
     * @private
     * @param {number} row - 행
     * @param {number} col - 열
     * @param {object} layer - Layer 객체
     * @param {object} result - 결과 객체
     */
    _destroyLayer(row, col, layer, result) {
        this.board.removeLayer(row, col, layer.typeId);

        const typeDef = getBlockType(layer.typeId);
        console.log(`[기믹] 파괴: ${typeDef?.name} at (${row},${col})`);

        result.destroyed.push({
            typeId: layer.typeId,
            row, col
        });

        eventBus.emit(EVENTS.GIMMICK_DESTROYED, {
            typeId: layer.typeId,
            row, col
        });
    }

    // ========================================
    // 내부: 블록형 기믹 데미지/파괴
    // ========================================

    /**
     * 블록형 기믹의 HP를 감소시킨다.
     * @private
     * @param {number} row - 행
     * @param {number} col - 열
     * @param {object} block - Block 객체
     * @param {number} amount - 데미지량
     * @param {object} result - 결과 객체
     */
    _damageBlock(row, col, block, amount, result) {
        // 무적 기믹은 데미지 무시
        const typeDef = getBlockType(block.typeId);
        if (typeDef && typeDef.invincible) return;

        // 거대상자(2x2): origin 블록으로 데미지 전달
        if (block.originRow !== undefined && block.originCol !== undefined && !block.isOrigin) {
            const originBlock = this.board.getBlock(block.originRow, block.originCol);
            if (originBlock) {
                this._damageBlock(block.originRow, block.originCol, originBlock, amount, result);
                return;
            }
        }

        const hpBefore = block.hp;
        block.hp = Math.max(0, block.hp - amount);

        eventBus.emit(EVENTS.GIMMICK_DAMAGED, {
            typeId: block.typeId,
            row, col,
            hpBefore,
            hpAfter: block.hp
        });

        console.log(`[기믹] 데미지: ${typeDef?.name} at (${row},${col}) HP ${hpBefore}→${block.hp}`);

        if (block.hp <= 0) {
            this._destroyBlock(row, col, block, result);
        } else {
            result.damaged.push({
                typeId: block.typeId,
                row, col,
                remainingHp: block.hp
            });
        }
    }

    /**
     * 블록형 기믹을 파괴한다.
     * 다중 칸 블록(2x2 등)은 모든 서브 블록도 함께 제거한다.
     * @private
     * @param {number} row - 행
     * @param {number} col - 열
     * @param {object} block - Block 객체
     * @param {object} result - 결과 객체
     */
    _destroyBlock(row, col, block, result) {
        const typeDef = getBlockType(block.typeId);

        // 다중 칸 블록: origin이면 모든 서브 블록도 제거
        if (typeDef && (typeDef.width > 1 || typeDef.height > 1)) {
            const originRow = block.isOrigin !== false ? row : block.originRow;
            const originCol = block.isOrigin !== false ? col : block.originCol;

            for (let dr = 0; dr < typeDef.height; dr++) {
                for (let dc = 0; dc < typeDef.width; dc++) {
                    const subRow = originRow + dr;
                    const subCol = originCol + dc;
                    if (this.board.isValidPosition(subRow, subCol)) {
                        this.board.removeBlock(subRow, subCol);
                    }
                }
            }
        } else {
            this.board.removeBlock(row, col);
        }

        console.log(`[기믹] 파괴: ${typeDef?.name} at (${row},${col})`);

        result.destroyed.push({
            typeId: block.typeId,
            row, col
        });

        eventBus.emit(EVENTS.GIMMICK_DESTROYED, {
            typeId: block.typeId,
            row, col
        });
    }
}

// ========================================
// 내보내기
// ========================================

export { GimmickManager, MAX_SPREAD_PER_TURN };
