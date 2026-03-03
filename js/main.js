/**
 * main.js — 메인 진입점
 *
 * 모든 모듈을 초기화하고 연결한다.
 * Board → Renderer → AnimationManager → MatchDetector → GravityHandler
 * → SpecialBlockManager → CascadeManager → SwapHandler
 * 게임 루프를 시작하고 사용자 입력을 처리한다.
 */

import { Board, createBlock } from './core/board.js';
import { Renderer } from './render/renderer.js';
import { AnimationManager } from './render/animation.js';
import { MatchDetector } from './core/match.js';
import { SwapHandler } from './core/swap.js';
import { GravityHandler } from './core/gravity.js';
import { SpecialBlockManager } from './core/specialBlock.js';
import { CascadeManager } from './core/cascade.js';
import { GimmickManager } from './gimmick/gimmickFramework.js';
import { registerAllGimmickHandlers } from './gimmick/gimmickTypes.js';
import { eventBus, EVENTS } from './core/eventBus.js';
import { getNormalTypes, getBlockType, BLOCK_CATEGORY } from './core/blockTypes.js';
import { ParameterPanel } from './ui/parameterPanel.js';

// === 진단: 코드 버전 확인 ===
console.log('%c[main] 코드 버전: v8 — 파라미터 패널', 'color: lime; font-size: 14px;');

// ========================================
// 초기화
// ========================================

/**
 * 앱을 초기화하고 게임을 시작한다.
 */
function init() {
    // Canvas 엘리먼트
    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
        console.error('[main] Canvas 엘리먼트를 찾을 수 없습니다.');
        return;
    }

    // 1. 보드 생성 (8x8)
    const board = new Board(8, 8);
    board.initialize();

    // 2. 렌더러 생성
    const renderer = new Renderer(canvas, board);

    // 3. 애니메이션 매니저 생성 및 연결
    const animationManager = new AnimationManager(renderer);
    renderer.setAnimationManager(animationManager);

    // 4. 매치 감지기 생성
    const matchDetector = new MatchDetector(board);

    // 5. 중력 핸들러 생성
    const gravityHandler = new GravityHandler(board);

    // 6. 특수 블록 매니저 생성
    const specialBlockManager = new SpecialBlockManager(board);

    // 6-1. 기믹 매니저 생성 및 핸들러 등록
    const gimmickManager = new GimmickManager(board);
    registerAllGimmickHandlers(gimmickManager);

    // 7. 연쇄 매니저 생성 (특수 블록 매니저 + 기믹 매니저 포함)
    const cascadeManager = new CascadeManager(
        board, matchDetector, gravityHandler, specialBlockManager, animationManager, renderer, gimmickManager
    );

    // 8. 스왑 핸들러 생성
    const swapHandler = new SwapHandler(board, canvas, renderer, matchDetector);

    // 9. 스왑 결과 처리 연결
    swapHandler.onSwapAttempt = async (from, to, result) => {
        await _handleSwapResult(
            board, renderer, animationManager, matchDetector,
            swapHandler, cascadeManager, from, to, result
        );
    };

    // 9-1. 더블탭 발동 연결
    swapHandler.onDoubleTap = async (block) => {
        console.log(`[더블탭] 콜백 진입 — typeId=${block.typeId}, pos=(${block.row},${block.col}), isProcessing=${cascadeManager.isProcessing}`);
        if (cascadeManager.isProcessing) return;
        swapHandler.isEnabled = false;

        try {
            const turnResult = await cascadeManager.executeDoubleTapTurn(block);
            if (turnResult) {
                console.log(`[더블탭 턴 완료] 제거: ${turnResult.totalRemoved}개, 연쇄: ${turnResult.totalCascades}단계, 점수: ${turnResult.score}`);
            }
        } catch (err) {
            console.error('[더블탭] 실행 중 에러:', err);
        }

        swapHandler.isEnabled = true;
    };

    // 10. 디버그용 키패드 블록/기믹 배치
    // 1~5: 특수 블록, 6~0: 기믹
    const KEYPAD_MAP = {
        '1': 6,   // 가로 로켓
        '2': 7,   // 세로 로켓
        '3': 8,   // 폭탄
        '4': 9,   // 레인보우
        '5': 10,  // 타겟 유도형 폭탄
        '6': 11,  // 가방 (1단계)
        '7': 12,  // 가방 (2단계)
        '8': 13,  // 꿀
        '9': 14,  // 곰인형
        '0': 15   // 거대 상자 (1단계)
    };

    document.addEventListener('keydown', (e) => {
        // 입력 필드에 포커스 시 키패드 무시
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const typeId = KEYPAD_MAP[e.key];
        if (!typeId) return;

        const pos = swapHandler.selectedBlock;
        console.log(`[키패드] 선택된 블록:`, pos);
        if (!pos) {
            console.log('[키패드] 먼저 블록을 클릭하세요.');
            return;
        }

        if (cascadeManager.isProcessing) return;

        const typeDef = getBlockType(typeId);
        if (!typeDef) return;

        if (typeDef.blockType === BLOCK_CATEGORY.GIMMICK) {
            // 기믹: placeGimmick으로 배치 (레이어형/블록형 자동 분류)
            board.placeGimmick(typeId, pos.row, pos.col);
            console.log(`[키패드] 기믹 ${typeDef.name} 배치: (${pos.row},${pos.col})`);
        } else {
            // 특수 블록: 직접 배치
            const newBlock = createBlock(typeId, pos.row, pos.col);
            board.setBlock(pos.row, pos.col, newBlock);
            console.log(`[키패드] ${typeDef.name} 배치: (${pos.row},${pos.col})`);
        }
    });

    // 11. 파라미터 패널 초기화
    const panelContainer = document.getElementById('parameter-panel-container');
    let paramPanel = null;
    if (panelContainer) {
        paramPanel = new ParameterPanel(panelContainer, {
            renderer,
            animationManager
        });
    }

    // 12. 게임 루프 시작
    renderer.startGameLoop();

    // 13. 콘솔 디버깅용 전역 노출
    window.board = board;
    window.renderer = renderer;
    window.animationManager = animationManager;
    window.matchDetector = matchDetector;
    window.swapHandler = swapHandler;
    window.gravityHandler = gravityHandler;
    window.specialBlockManager = specialBlockManager;
    window.cascadeManager = cascadeManager;
    window.gimmickManager = gimmickManager;
    window.eventBus = eventBus;
    window.paramPanel = paramPanel;

    // 14. 보드 정보 패널 업데이트
    _updateBoardInfo(board);

    // 15. 이벤트 구독 (UI 업데이트용)
    eventBus.on(EVENTS.CASCADE_COMPLETE, () => _updateBoardInfo(board));

    // 16. 초기 상태 출력
    console.log('[main] 매치3 프로토타입 초기화 완료');
    console.log('[main] 블록을 드래그하여 스왑하세요.');
    board.debugPrint();
}

// ========================================
// 스왑 결과 처리 (Phase 3: CascadeManager 통합)
// ========================================

/**
 * 스왑 결과를 처리한다.
 * 매치 성공 시: 스왑 애니메이션 → CascadeManager가 전체 턴 관리
 * 매치 실패 시: 스왑 애니메이션 → 되돌리기 애니메이션
 */
async function _handleSwapResult(
    board, renderer, animManager, matchDetector,
    swapHandler, cascadeManager, from, to, result
) {
    if (cascadeManager.isProcessing) return;
    swapHandler.isEnabled = false;

    const block1 = board.getBlock(from.row, from.col);
    const block2 = board.getBlock(to.row, to.col);

    // 블록 visualX/visualY 초기화
    _initBlockVisuals(board, renderer);

    if (result.success) {
        // === 매치 성공 ===
        console.log(`[스왑] 성공: (${from.row},${from.col}) ↔ (${to.row},${to.col})`);

        // 1. 스왑 애니메이션
        const swapAnim = animManager.createSwapAnimation(block2, block1, renderer);
        await animManager.enqueueParallel([swapAnim]);
        _resetBlockVisuals(board);

        // 2. CascadeManager가 전체 턴 처리
        //    (매치 제거 → 낙하 → 리필 → 연쇄 → 셔플)
        const turnResult = await cascadeManager.executeTurn(result);

        if (turnResult) {
            console.log(`[턴 완료] 제거: ${turnResult.totalRemoved}개, 연쇄: ${turnResult.totalCascades}단계, 점수: ${turnResult.score}`);
        }

    } else {
        // === 매치 실패 → 되돌리기 ===
        console.log(`[스왑] 실패: (${from.row},${from.col}) ↔ (${to.row},${to.col}) — 매치 없음`);

        if (block1 && block2) {
            _initBlockVisuals(board, renderer);

            // 스왑 방향으로 갔다가
            const fakeSwapAnim = animManager.createSwapAnimation(block1, block2, renderer);
            await animManager.enqueueParallel([fakeSwapAnim]);

            // 되돌아오기
            const swapBackAnim = animManager.createSwapBackAnimation(block1, block2, renderer);
            await animManager.enqueueParallel([swapBackAnim]);

            _resetBlockVisuals(board);
        }
    }

    // 보드 정보 업데이트
    _updateBoardInfo(board);

    swapHandler.isEnabled = true;
}

// ========================================
// 블록 비주얼 관리
// ========================================

/**
 * 모든 블록의 visualX/visualY를 현재 그리드 위치로 초기화한다.
 */
function _initBlockVisuals(board, renderer) {
    for (let row = 0; row < board.rows; row++) {
        for (let col = 0; col < board.cols; col++) {
            const block = board.getBlock(row, col);
            if (block) {
                const pos = renderer.cellToPixel(row, col);
                block.visualX = pos.x;
                block.visualY = pos.y;
            }
        }
    }
}

/**
 * 모든 블록의 visualX/visualY를 리셋한다.
 */
function _resetBlockVisuals(board) {
    for (let row = 0; row < board.rows; row++) {
        for (let col = 0; col < board.cols; col++) {
            const block = board.getBlock(row, col);
            if (block) {
                block.visualX = 0;
                block.visualY = 0;
                block.scale = 1.0;
                block.alpha = 1.0;
            }
        }
    }
}

// ========================================
// UI 업데이트
// ========================================

/**
 * 보드 정보 패널을 업데이트한다.
 */
function _updateBoardInfo(board) {
    const infoEl = document.getElementById('panel-board-info');
    if (!infoEl) return;

    const blocks = board.getAllBlocks();
    const normalTypes = getNormalTypes();

    // 색상별 블록 수 집계
    const colorCounts = {};
    for (const block of blocks) {
        const id = block.typeId;
        colorCounts[id] = (colorCounts[id] || 0) + 1;
    }

    // 정보 HTML 생성
    const colorInfo = normalTypes.map(t =>
        `<span style="color:${t.fallbackColor}">${t.fallbackIcon} ${t.name}: ${colorCounts[t.id] || 0}</span>`
    ).join('<br>');

    infoEl.innerHTML = `
        <p>크기: ${board.rows} x ${board.cols}</p>
        <p>블록 수: ${blocks.length}</p>
        <br>
        ${colorInfo}
    `;
}

// ========================================
// 실행
// ========================================

document.addEventListener('DOMContentLoaded', init);
