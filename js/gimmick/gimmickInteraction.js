/**
 * gimmickInteraction.js — 기믹 간 상호작용 규칙
 *
 * 확산 가능 여부, 기믹 공존 규칙, 충돌 해결 등을 처리한다.
 */

import { getBlockType, BLOCK_CATEGORY } from '../core/blockTypes.js';
import { LAYER_PLACEMENT_TYPES } from '../core/board.js';

// ========================================
// GimmickInteractionResolver 클래스
// ========================================

class GimmickInteractionResolver {
    /**
     * 기믹 상호작용 해결기를 생성한다.
     * @param {object} board - Board 인스턴스
     */
    constructor(board) {
        /** @type {object} Board 인스턴스 */
        this.board = board;
    }

    /**
     * 지정 위치에 기믹 확산이 가능한지 확인한다.
     * @param {number} typeId - 확산할 기믹 타입 ID
     * @param {number} row - 대상 행
     * @param {number} col - 대상 열
     * @returns {boolean}
     */
    canSpreadTo(typeId, row, col) {
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

    /**
     * 같은 칸에 두 기믹이 공존 가능한지 확인한다.
     * 기본 규칙: 같은 칸에 레이어형 기믹은 1개만 가능.
     *
     * @param {number} existingTypeId - 기존 기믹 타입 ID
     * @param {number} newTypeId - 새 기믹 타입 ID
     * @returns {boolean}
     */
    canCoexist(existingTypeId, newTypeId) {
        const existingDef = getBlockType(existingTypeId);
        const newDef = getBlockType(newTypeId);

        if (!existingDef || !newDef) return false;

        // LAYER_PLACEMENT_TYPES에 포함되면 레이어 배치, 아니면 블록 배치
        const existingIsLayer = LAYER_PLACEMENT_TYPES.includes(existingDef.layerType);
        const newIsLayer = LAYER_PLACEMENT_TYPES.includes(newDef.layerType);

        // 같은 배치 타입(레이어+레이어 또는 블록+블록) → 공존 불가
        if (existingIsLayer === newIsLayer) return false;

        // 레이어 + 블록 → 공존 가능
        return true;
    }
}

// ========================================
// 내보내기
// ========================================

export { GimmickInteractionResolver };
