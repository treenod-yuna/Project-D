/**
 * swap.js — 스왑 처리
 *
 * 마우스/터치 입력을 받아 인접 블록 스왑을 처리한다.
 * 스왑 유효성을 검증하고, 매치 감지 결과를 반환한다.
 * 입력 차단/허용 상태를 관리한다.
 */

import { getBlockType, BLOCK_CATEGORY } from './blockTypes.js';
import { eventBus, EVENTS } from './eventBus.js';

// ========================================
// 상수 정의
// ========================================

/** 드래그 인식 최소 거리 (픽셀) */
const MIN_DRAG_DISTANCE = 10;

// ========================================
// SwapHandler 클래스
// ========================================

class SwapHandler {
    /**
     * 스왑 핸들러를 생성한다.
     * @param {object} board - Board 인스턴스
     * @param {HTMLCanvasElement} canvas - Canvas 엘리먼트
     * @param {object} renderer - Renderer 인스턴스
     * @param {object} matchDetector - MatchDetector 인스턴스
     */
    constructor(board, canvas, renderer, matchDetector) {
        /** @type {object} Board 인스턴스 */
        this.board = board;
        /** @type {HTMLCanvasElement} Canvas 엘리먼트 */
        this.canvas = canvas;
        /** @type {object} Renderer 인스턴스 */
        this.renderer = renderer;
        /** @type {object} MatchDetector 인스턴스 */
        this.matchDetector = matchDetector;

        /** @type {boolean} 입력 허용 상태 */
        this.isEnabled = true;
        /** @type {{row: number, col: number}|null} 선택된 블록 위치 */
        this.selectedBlock = null;
        /** @type {Function|null} 스왑 시도 콜백 */
        this.onSwapAttempt = null;
        /** @type {Function|null} 더블탭 발동 콜백 */
        this.onDoubleTap = null;

        // 드래그 상태
        this._dragStart = null; // { x, y, row, col }
        this._isDragging = false;
        this._hasDragged = false; // 드래그 발생 여부 (탭과 구분)

        // 더블탭 감지 상태
        this._lastTapTime = 0;
        this._lastTapRow = -1;
        this._lastTapCol = -1;

        // 이벤트 바인딩
        this._bindEvents();
    }

    // ========================================
    // 이벤트 바인딩
    // ========================================

    /**
     * Canvas에 마우스/터치 이벤트를 바인딩한다.
     * @private
     */
    _bindEvents() {
        // 마우스 이벤트
        this.canvas.addEventListener('mousedown', (e) => this._onPointerDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onPointerMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onPointerUp(e));

        // 터치 이벤트
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this._onPointerDown(touch);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this._onPointerMove(touch);
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this._onPointerUp(e);
        }, { passive: false });

        // 더블클릭 이벤트 (마우스 네이티브 감지 — 수동 더블탭 감지 보완)
        this.canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));
    }

    // ========================================
    // 포인터 이벤트 핸들러
    // ========================================

    /**
     * 포인터 다운 이벤트를 처리한다.
     * @private
     * @param {MouseEvent|Touch} e
     */
    _onPointerDown(e) {
        if (!this.isEnabled) return;

        const { x, y } = this._getCanvasPosition(e);
        const cell = this.renderer.pixelToCell(x, y);
        if (!cell) return;

        const block = this.board.getBlock(cell.row, cell.col);
        if (!block) return;

        // 스왑 불가능한 블록 확인
        const typeDef = getBlockType(block.typeId);
        if (typeDef && !typeDef.swap) return;

        this._dragStart = { x, y, row: cell.row, col: cell.col };
        this._isDragging = true;
        this._hasDragged = false;
        this.selectedBlock = { row: cell.row, col: cell.col };
    }

    /**
     * 포인터 이동 이벤트를 처리한다.
     * @private
     * @param {MouseEvent|Touch} e
     */
    _onPointerMove(e) {
        if (!this.isEnabled || !this._isDragging || !this._dragStart) return;

        const { x, y } = this._getCanvasPosition(e);
        const dx = x - this._dragStart.x;
        const dy = y - this._dragStart.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 최소 드래그 거리 이상 이동했으면 방향 판별 후 스왑
        if (distance >= MIN_DRAG_DISTANCE && !this._hasDragged) {
            this._hasDragged = true;
            const direction = this._getDragDirection(dx, dy);
            const from = { row: this._dragStart.row, col: this._dragStart.col };
            const to = {
                row: from.row + direction.dRow,
                col: from.col + direction.dCol
            };

            // 드래그 종료
            this._isDragging = false;
            this._dragStart = null;

            // 스왑 시도
            this.trySwap(from.row, from.col, to.row, to.col);
        }
    }

    /**
     * 포인터 업 이벤트를 처리한다.
     * 드래그 없이 끝나면 탭으로 판별하고, 더블탭 시 특수 블록을 발동한다.
     * @private
     * @param {MouseEvent|TouchEvent} e
     */
    _onPointerUp(_e) {
        // 드래그 없이 끝난 경우 → 탭으로 처리 (터치 더블탭 보조용)
        if (!this._hasDragged && this._dragStart) {
            this._handleTap(this._dragStart.row, this._dragStart.col);
        }

        this._isDragging = false;
        this._dragStart = null;
    }

    /** 더블탭 인식 시간 (ms) */
    static DOUBLE_TAP_THRESHOLD = 400;

    /**
     * 탭(클릭)을 처리한다. 같은 위치를 연속 탭하면 더블탭으로 인식한다.
     * @private
     * @param {number} row
     * @param {number} col
     */
    _handleTap(row, col) {
        const now = Date.now();
        const timeDiff = now - this._lastTapTime;
        const samePosition = (row === this._lastTapRow && col === this._lastTapCol);

        if (samePosition && timeDiff <= SwapHandler.DOUBLE_TAP_THRESHOLD) {
            // 더블탭 감지 → 특수 블록 발동 시도
            this._tryDoubleTapActivation(row, col);
            // 더블탭 후 상태 초기화
            this._lastTapTime = 0;
            this._lastTapRow = -1;
            this._lastTapCol = -1;
        } else {
            // 첫 번째 탭 기록
            this._lastTapTime = now;
            this._lastTapRow = row;
            this._lastTapCol = col;
        }
    }

    /**
     * 더블탭으로 특수 블록을 제자리에서 발동한다.
     * @private
     * @param {number} row
     * @param {number} col
     */
    _tryDoubleTapActivation(row, col) {
        if (!this.isEnabled) return;

        const block = this.board.getBlock(row, col);
        if (!block) return;

        // 특수 블록인지 확인
        const typeDef = getBlockType(block.typeId);
        if (!typeDef || typeDef.blockType !== BLOCK_CATEGORY.SPECIAL) return;

        console.log(`[더블탭] 특수 블록 발동: ${typeDef.name} at (${row},${col})`);

        eventBus.emit(EVENTS.SWAP_ATTEMPTED, {
            from: { row, col }, to: { row, col }, isDoubleTap: true
        });

        // 콜백 호출 → cascade에서 턴 처리
        if (this.onDoubleTap) {
            this.onDoubleTap(block);
        }
    }

    /**
     * 더블클릭 이벤트로 특수 블록을 발동한다.
     * 브라우저 네이티브 dblclick 이벤트 기반으로, 수동 더블탭 감지의 보완 역할.
     * 수동 감지가 먼저 성공하면 cascadeManager.isProcessing이 true가 되어
     * 이 핸들러의 콜백에서 자동으로 무시된다.
     * @private
     * @param {MouseEvent} e
     */
    _onDoubleClick(e) {
        console.log('[더블클릭] dblclick 이벤트 감지');

        const { x, y } = this._getCanvasPosition(e);
        const cell = this.renderer.pixelToCell(x, y);
        if (!cell) {
            console.log('[더블클릭] cell 변환 실패');
            return;
        }

        const block = this.board.getBlock(cell.row, cell.col);
        if (!block) {
            console.log(`[더블클릭] (${cell.row},${cell.col}) 블록 없음`);
            return;
        }

        // 특수 블록인지 확인
        const typeDef = getBlockType(block.typeId);
        console.log(`[더블클릭] (${cell.row},${cell.col}) typeId=${block.typeId}, blockType=${typeDef?.blockType}`);
        if (!typeDef || typeDef.blockType !== BLOCK_CATEGORY.SPECIAL) return;

        console.log(`[더블클릭] ★ 특수 블록 발동: ${typeDef.name} at (${cell.row},${cell.col})`);

        // 콜백 호출 (cascadeManager.isProcessing 중이면 콜백에서 무시됨)
        if (this.onDoubleTap) {
            this.onDoubleTap(block);
        } else {
            console.warn('[더블클릭] onDoubleTap 콜백 미연결!');
        }
    }

    // ========================================
    // 스왑 로직
    // ========================================

    /**
     * 스왑을 시도한다.
     * 특수 블록 조합/레인보우 스왑도 처리한다.
     * @param {number} fromRow
     * @param {number} fromCol
     * @param {number} toRow
     * @param {number} toCol
     * @returns {object} SwapResult
     */
    trySwap(fromRow, fromCol, toRow, toCol) {
        const from = { row: fromRow, col: fromCol };
        const to = { row: toRow, col: toCol };

        // 이벤트 발행: 스왑 시도
        eventBus.emit(EVENTS.SWAP_ATTEMPTED, { from, to });

        // 유효성 검증
        if (!this.isValidSwap(from, to)) {
            const result = { success: false, from, to, matchResults: [] };
            eventBus.emit(EVENTS.SWAP_FAILED, { from, to });
            if (this.onSwapAttempt) this.onSwapAttempt(from, to, result);
            return result;
        }

        // 스왑 전 블록 참조 (스왑 후 위치가 바뀌므로 미리 저장)
        const blockAtFrom = this.board.getBlock(fromRow, fromCol);
        const blockAtTo = this.board.getBlock(toRow, toCol);
        const typeFrom = getBlockType(blockAtFrom.typeId);
        const typeTo = getBlockType(blockAtTo.typeId);
        const isSpecialFrom = typeFrom.blockType === BLOCK_CATEGORY.SPECIAL;
        const isSpecialTo = typeTo.blockType === BLOCK_CATEGORY.SPECIAL;

        // 보드에서 스왑 실행
        this.board.swapBlocks(fromRow, fromCol, toRow, toCol);

        // --- 특수 블록 조합: 특수+특수 스왑 ---
        if (isSpecialFrom && isSpecialTo) {
            const result = {
                success: true, from, to, matchResults: [],
                isCombination: true,
                // 스왑 후 위치가 교환되었으므로 현재 위치로 참조
                combinationBlocks: [
                    this.board.getBlock(fromRow, fromCol),
                    this.board.getBlock(toRow, toCol)
                ]
            };
            eventBus.emit(EVENTS.SWAP_SUCCESS, { from, to, block1: blockAtFrom, block2: blockAtTo });
            if (this.onSwapAttempt) this.onSwapAttempt(from, to, result);
            return result;
        }

        // --- 레인보우 + 일반 블록 스왑 ---
        const rainbowId = 9;
        if (blockAtFrom.typeId === rainbowId || blockAtTo.typeId === rainbowId) {
            const rainbow = blockAtFrom.typeId === rainbowId
                ? this.board.getBlock(toRow, toCol)   // 스왑 후 from→to 위치
                : this.board.getBlock(fromRow, fromCol);
            const target = blockAtFrom.typeId === rainbowId
                ? this.board.getBlock(fromRow, fromCol)
                : this.board.getBlock(toRow, toCol);

            const result = {
                success: true, from, to, matchResults: [],
                isRainbowActivation: true,
                rainbowBlock: rainbow,
                targetBlock: target
            };
            eventBus.emit(EVENTS.SWAP_SUCCESS, { from, to, block1: blockAtFrom, block2: blockAtTo });
            if (this.onSwapAttempt) this.onSwapAttempt(from, to, result);
            return result;
        }

        // --- 특수 블록 + 일반 블록 스왑: 스왑 후 즉시 발동 ---
        if (isSpecialFrom !== isSpecialTo) {
            // 스왑 후: blockAtFrom은 to 위치에, blockAtTo는 from 위치에 있음
            const specialBlock = isSpecialFrom
                ? this.board.getBlock(toRow, toCol)     // from이 특수 → to로 이동됨
                : this.board.getBlock(fromRow, fromCol); // to가 특수 → from으로 이동됨

            const result = {
                success: true, from, to, matchResults: [],
                isSpecialActivation: true,
                specialBlock
            };
            eventBus.emit(EVENTS.SWAP_SUCCESS, { from, to, block1: blockAtFrom, block2: blockAtTo });
            if (this.onSwapAttempt) this.onSwapAttempt(from, to, result);
            return result;
        }

        // --- 일반 매치 감지 ---
        const matches = this.matchDetector.findAllMatches();

        if (matches.length > 0) {
            // 매치 성공 — 스왑 방향 정보를 매치에 추가
            this._applySwapDirection(matches, from, to);

            const block1 = this.board.getBlock(fromRow, fromCol);
            const block2 = this.board.getBlock(toRow, toCol);
            const result = { success: true, from, to, matchResults: matches };

            eventBus.emit(EVENTS.SWAP_SUCCESS, { from, to, block1, block2 });
            if (this.onSwapAttempt) this.onSwapAttempt(from, to, result);
            return result;
        } else {
            // 매치 실패 — 되돌리기
            this.board.swapBlocks(fromRow, fromCol, toRow, toCol);
            const result = { success: false, from, to, matchResults: [] };

            eventBus.emit(EVENTS.SWAP_FAILED, { from, to });
            if (this.onSwapAttempt) this.onSwapAttempt(from, to, result);
            return result;
        }
    }

    /**
     * 스왑이 유효한지 검증한다.
     * @param {{row: number, col: number}} from
     * @param {{row: number, col: number}} to
     * @returns {boolean}
     */
    isValidSwap(from, to) {
        // 범위 검사
        if (!this.board.isValidPosition(from.row, from.col)) return false;
        if (!this.board.isValidPosition(to.row, to.col)) return false;

        // 인접 여부 검사 (상하좌우만)
        const dRow = Math.abs(from.row - to.row);
        const dCol = Math.abs(from.col - to.col);
        if (dRow + dCol !== 1) return false;

        // 블록 존재 여부
        const block1 = this.board.getBlock(from.row, from.col);
        const block2 = this.board.getBlock(to.row, to.col);
        if (!block1 || !block2) return false;

        // 스왑 가능 여부
        const type1 = getBlockType(block1.typeId);
        const type2 = getBlockType(block2.typeId);
        if (!type1 || !type2) return false;
        if (!type1.swap || !type2.swap) return false;

        // 레이어(얼음 등)가 있는 칸의 블록은 스왑 불가
        const layers1 = this.board.getLayersAt(from.row, from.col);
        const layers2 = this.board.getLayersAt(to.row, to.col);
        const hasBlocking1 = layers1.some(l => {
            const ld = getBlockType(l.typeId);
            return ld && ld.immovable;
        });
        const hasBlocking2 = layers2.some(l => {
            const ld = getBlockType(l.typeId);
            return ld && ld.immovable;
        });
        if (hasBlocking1 || hasBlocking2) return false;

        return true;
    }

    // ========================================
    // 유틸리티
    // ========================================

    /**
     * 스왑 방향 정보를 매치에 추가한다.
     * (로켓 방향 결정에 사용)
     * @private
     * @param {object[]} matches - MatchResult 배열
     * @param {{row, col}} from - 스왑 출발 위치
     * @param {{row, col}} to - 스왑 도착 위치
     */
    _applySwapDirection(matches, from, to) {
        const swapDirection = (from.row === to.row) ? 'horizontal' : 'vertical';
        for (const match of matches) {
            match.swapDirection = swapDirection;
            match.swapFrom = from;
            match.swapTo = to;

            // 4매치 로켓 방향: 스왑 방향 우선
            if (match.type === '4' && match.specialBlockType) {
                match.specialBlockType = swapDirection === 'horizontal' ? 6 : 7;
            }

            // 유저 스왑 매치: 스왑 위치에 특수 블록 생성
            if (match.specialBlockType) {
                // to 위치 우선 (유저가 드래그한 블록의 도착 위치)
                const toInMatch = match.positions.some(
                    p => p.row === to.row && p.col === to.col
                );
                const fromInMatch = match.positions.some(
                    p => p.row === from.row && p.col === from.col
                );

                if (toInMatch) {
                    match.specialBlockPosition = { ...to };
                } else if (fromInMatch) {
                    match.specialBlockPosition = { ...from };
                }
            }
        }
    }

    /**
     * 드래그 방향을 판별한다.
     * @private
     * @param {number} dx - X축 이동량
     * @param {number} dy - Y축 이동량
     * @returns {{dRow: number, dCol: number}}
     */
    _getDragDirection(dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) {
            return { dRow: 0, dCol: dx > 0 ? 1 : -1 };
        } else {
            return { dRow: dy > 0 ? 1 : -1, dCol: 0 };
        }
    }

    /**
     * 이벤트에서 Canvas 좌표를 추출한다.
     * @private
     * @param {MouseEvent|Touch} e
     * @returns {{x: number, y: number}}
     */
    _getCanvasPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
}

// ========================================
// 내보내기
// ========================================

export { SwapHandler };
