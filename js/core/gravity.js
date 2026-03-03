/**
 * gravity.js — 낙하 계산 + 대각선 슬라이드 + 리필 블록 생성
 *
 * 열 단위로 빈 칸을 계산하여 위의 블록을 아래로 낙하시킨다.
 * 이동 불가 + 대각선흐름(slidable) 장애물 주변에서는 대각선 슬라이드를 수행한다.
 * 낙하 후 빈 칸에는 새 블록을 리필한다 (차단된 영역 제외).
 */

import { getBlockType, getNormalTypes } from './blockTypes.js';
import { createBlock } from './board.js';

// ========================================
// GravityHandler 클래스
// ========================================

class GravityHandler {
    /**
     * 중력 핸들러를 생성한다.
     * @param {object} board - Board 인스턴스
     */
    constructor(board) {
        /** @type {object} Board 인스턴스 */
        this.board = board;
    }

    // ========================================
    // 낙하 계산
    // ========================================

    /**
     * 모든 열에서 낙하해야 할 블록을 계산한다.
     * 빈 칸 위의 블록들을 아래로 이동시킨다.
     * @returns {object[]} FallMove 배열 [{ block, fromRow, toRow, col, distance }]
     */
    calculateFalls() {
        const falls = [];
        const board = this.board;

        for (let col = 0; col < board.cols; col++) {
            // 아래에서 위로 스캔하며 빈 칸 개수 추적
            let emptyCount = 0;

            for (let row = board.rows - 1; row >= 0; row--) {
                const block = board.getBlock(row, col);

                if (!block) {
                    // 빈 칸 → 카운트 증가
                    emptyCount++;
                } else {
                    // 블록 존재
                    const typeDef = getBlockType(block.typeId);

                    // 이동 불가 블록(기믹 등)은 낙하하지 않고, 빈 칸 카운트를 리셋
                    if (typeDef && (typeDef.immovable || !typeDef.gravity)) {
                        emptyCount = 0;
                        continue;
                    }

                    // 레이어(얼음 등)가 있는 칸의 블록은 낙하 불가
                    if (this._hasBlockingLayer(row, col)) {
                        emptyCount = 0;
                        continue;
                    }

                    // 빈 칸이 있으면 낙하
                    if (emptyCount > 0) {
                        falls.push({
                            block,
                            fromRow: row,
                            toRow: row + emptyCount,
                            col,
                            distance: emptyCount
                        });
                    }
                }
            }
        }

        return falls;
    }

    /**
     * 계산된 낙하를 보드에 적용한다.
     * @param {object[]} moves - FallMove 배열
     */
    applyFalls(moves) {
        // 아래에서 위로 처리해야 겹침 방지
        const sorted = [...moves].sort((a, b) => b.fromRow - a.fromRow);

        for (const move of sorted) {
            // 원래 위치에서 블록 제거
            this.board.removeBlock(move.fromRow, move.col);
            // 새 위치에 배치
            this.board.setBlock(move.toRow, move.col, move.block);
        }
    }

    // ========================================
    // 대각선 슬라이드
    // ========================================

    /**
     * 대각선 슬라이드를 계산한다. (outward + inward 양방향)
     *
     * Outward: 블록 바로 아래가 slidable 장애물 → 대각선 옆으로 이동
     * Inward:  인접 열의 블록이 대각선으로 slidable 장애물 아래 빈 칸(그림자 영역)에 유입
     *
     * 조건:
     * - 블록이 이동 가능(gravity=true, immovable=false)
     * - 바로 아래 칸이 비어있지 않음 (수직 낙하 불가)
     * - 대각선 아래(좌 또는 우) 칸이 비어있음
     * - outward: 아래 칸이 slidable+이동불가 장애물
     * - inward: 타겟 열 위에 slidable 장애물이 존재 (그림자 영역)
     *
     * @returns {object[]} SlideMove 배열 [{ block, fromRow, fromCol, toRow, toCol }]
     */
    calculateDiagonalSlides() {
        const slides = [];
        const board = this.board;
        const reserved = new Set(); // 이미 슬라이드 대상인 위치 추적

        // 아래에서 위로 스캔 (아래쪽 블록 우선 슬라이드)
        for (let row = board.rows - 2; row >= 0; row--) {
            for (let col = 0; col < board.cols; col++) {
                const block = board.getBlock(row, col);
                if (!block) continue;

                const typeDef = getBlockType(block.typeId);
                // 이동 불가 블록은 슬라이드하지 않음
                if (!typeDef || typeDef.immovable || !typeDef.gravity) continue;

                // 레이어에 의해 고정된 블록도 슬라이드하지 않음
                if (this._hasBlockingLayer(row, col)) continue;

                // 아래 칸이 비어있으면 수직 낙하 가능 → 슬라이드 불필요
                if (board.isEmpty(row + 1, col)) continue;

                // 아래 칸의 블록이 slidable 장애물인지 확인 (outward 조건)
                const below = board.getBlock(row + 1, col);
                if (!below) continue;

                const belowDef = getBlockType(below.typeId);
                const isOutward = belowDef && belowDef.slidable &&
                    (belowDef.immovable || !belowDef.gravity);

                // 대각선 이동 가능한 위치 탐색 (아래-왼쪽, 아래-오른쪽)
                const targets = [];
                for (const dc of [-1, 1]) {
                    const newCol = col + dc;
                    if (!board.isValidPosition(row + 1, newCol)) continue;
                    if (!board.isEmpty(row + 1, newCol)) continue;

                    const targetKey = `${row + 1},${newCol}`;
                    if (reserved.has(targetKey)) continue;

                    // outward: 아래가 slidable 장애물 → 대각선 이동 가능
                    // inward: 타겟 열 위에 slidable 장애물 → 그림자 영역으로 유입
                    if (isOutward || this._hasSlidableObstacleAbove(row + 1, newCol)) {
                        targets.push({ row: row + 1, col: newCol });
                    }
                }

                if (targets.length === 0) continue;

                // 빈 칸이 더 아래까지 이어지는 쪽 우선 (더 깊은 곳으로 유도)
                let bestTarget = targets[0];
                if (targets.length > 1) {
                    const depth0 = this._countEmptyBelow(targets[0].row, targets[0].col);
                    const depth1 = this._countEmptyBelow(targets[1].row, targets[1].col);
                    bestTarget = depth1 > depth0 ? targets[1] : targets[0];
                }

                slides.push({
                    block,
                    fromRow: row,
                    fromCol: col,
                    toRow: bestTarget.row,
                    toCol: bestTarget.col
                });
                reserved.add(`${bestTarget.row},${bestTarget.col}`);
            }
        }

        return slides;
    }

    /**
     * 대각선 슬라이드를 보드에 적용한다.
     * @param {object[]} slides - SlideMove 배열
     */
    applySlides(slides) {
        for (const slide of slides) {
            this.board.removeBlock(slide.fromRow, slide.fromCol);
            this.board.setBlock(slide.toRow, slide.toCol, slide.block);
        }
    }

    // ========================================
    // 리필 계산
    // ========================================

    /**
     * 보드 상단의 빈 칸을 계산하여 새 블록 리필 정보를 생성한다.
     * 이동 불가 장애물 아래의 차단된 영역에는 리필하지 않는다.
     * @returns {object[]} RefillInfo 배열 [{ col, row, typeId, block }]
     */
    generateRefills() {
        const refills = [];
        const board = this.board;
        const normalTypeIds = getNormalTypes().map(t => t.id);

        for (let col = 0; col < board.cols; col++) {
            let blocked = false;

            // 위에서 아래로 스캔하며 차단 여부 추적
            for (let row = 0; row < board.rows; row++) {
                const block = board.getBlock(row, col);

                if (block) {
                    const typeDef = getBlockType(block.typeId);
                    // 이동 불가 블록을 만나면 이 아래로는 리필 차단
                    if (typeDef && (typeDef.immovable || !typeDef.gravity)) {
                        blocked = true;
                    }
                    continue;
                }

                // 이동 불가 레이어가 있는 셀도 차단
                if (this._hasBlockingLayer(row, col)) {
                    blocked = true;
                    continue;
                }

                // 차단된 영역이면 리필하지 않음
                if (blocked) continue;

                // 빈 칸 → 리필 생성
                if (board.isEmpty(row, col)) {
                    const typeId = normalTypeIds[
                        Math.floor(Math.random() * normalTypeIds.length)
                    ];

                    const block = createBlock(typeId, row, col);

                    refills.push({
                        col,
                        row,
                        typeId,
                        block
                    });
                }
            }
        }

        return refills;
    }

    /**
     * 리필 정보를 보드에 적용한다.
     * @param {object[]} refills - RefillInfo 배열
     */
    applyRefills(refills) {
        for (const refill of refills) {
            this.board.setBlock(refill.row, refill.col, refill.block);
        }
    }

    // ========================================
    // 내부 유틸리티
    // ========================================

    /**
     * 지정 위치에 이동 불가 레이어가 있는지 확인한다.
     * @private
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {boolean}
     */
    _hasBlockingLayer(row, col) {
        const layers = this.board.getLayersAt(row, col);
        return layers.some(l => {
            const ld = getBlockType(l.typeId);
            return ld && ld.immovable;
        });
    }

    /**
     * 지정 위치의 열에서 위쪽으로 slidable 장애물이 있는지 확인한다.
     * 블록이 대각선으로 장애물 아래 그림자 영역에 유입(inward slide)할 수 있는지 판단.
     * 위로 스캔하다 처음 만나는 블록이 slidable+이동불가 장애물이면 true.
     * @private
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {boolean}
     */
    _hasSlidableObstacleAbove(row, col) {
        const board = this.board;
        for (let r = row - 1; r >= 0; r--) {
            const block = board.getBlock(r, col);
            if (!block) continue; // 빈 칸 → 위로 계속 스캔

            const typeDef = getBlockType(block.typeId);
            if (!typeDef) return false;

            // 첫 번째로 만나는 블록이 slidable + 이동불가 → 그림자 영역
            if (typeDef.slidable && (typeDef.immovable || !typeDef.gravity)) {
                return true;
            }

            // 다른 블록(이동 가능/불가 불문)을 만나면 그림자가 차단됨
            return false;
        }
        return false;
    }

    /**
     * 지정 위치에서 아래로 연속된 빈 칸 수를 세다.
     * 대각선 슬라이드 시 더 깊은 쪽을 우선하기 위해 사용.
     * @private
     * @param {number} startRow - 시작 행
     * @param {number} col - 열 인덱스
     * @returns {number} 연속 빈 칸 수
     */
    _countEmptyBelow(startRow, col) {
        let count = 0;
        for (let row = startRow; row < this.board.rows; row++) {
            if (this.board.isEmpty(row, col)) count++;
            else break;
        }
        return count;
    }
}

// ========================================
// 내보내기
// ========================================

export { GravityHandler };
