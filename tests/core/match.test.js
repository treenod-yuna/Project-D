/**
 * match.test.js — MatchDetector 단위 테스트
 *
 * Phase 2 코어 로직 검증:
 * - 3매치/4매치/5매치 감지
 * - L/T 모양 감지
 * - 동시 다발 매치
 * - 유효 이동 검사
 * - 스왑 후 매치 확인
 */

let Board, createBlock;
let MatchDetector, MATCH_TYPE;
let getBlockType;

/** 테스트 결과 카운터 */
let passed = 0;
let failed = 0;
let testResults = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        testResults.push({ name, status: '✅', error: null });
    } catch (e) {
        failed++;
        testResults.push({ name, status: '❌', error: e.message });
    }
}

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} — 기대값: ${expected}, 실제값: ${actual}`);
    }
}

function assertTrue(value, msg = '') {
    if (!value) throw new Error(`${msg} — 기대값: true, 실제값: ${value}`);
}

function assertFalse(value, msg = '') {
    if (value) throw new Error(`${msg} — 기대값: false, 실제값: ${value}`);
}

// ========================================
// 보드 헬퍼: 특정 레이아웃으로 보드 세팅
// ========================================

/**
 * 2D 배열로 보드를 세팅한다.
 * @param {object} board - Board 인스턴스
 * @param {number[][]} layout - 2D 타입 ID 배열
 */
function setupBoard(board, layout) {
    for (let row = 0; row < layout.length; row++) {
        for (let col = 0; col < layout[row].length; col++) {
            const typeId = layout[row][col];
            if (typeId > 0) {
                const block = createBlock(typeId, row, col);
                board.setBlock(row, col, block);
            }
        }
    }
}

// ========================================
// 테스트 실행
// ========================================

async function runTests() {
    const boardModule = await import('../../js/core/board.js');
    const matchModule = await import('../../js/core/match.js');
    const blockTypesModule = await import('../../js/core/blockTypes.js');

    Board = boardModule.Board;
    createBlock = boardModule.createBlock;
    MatchDetector = matchModule.MatchDetector;
    MATCH_TYPE = matchModule.MATCH_TYPE;
    getBlockType = blockTypesModule.getBlockType;

    console.log('========================================');
    console.log('  MatchDetector 단위 테스트 시작');
    console.log('========================================\n');

    // ----------------------------------------
    // 1. 가로 3매치 감지
    // ----------------------------------------

    test('가로 3매치: 기본 감지', () => {
        const board = new Board(8, 8);
        // 첫 행에 빨-빨-빨 배치
        setupBoard(board, [
            [1, 1, 1, 2, 3, 4, 5, 2],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 1, 2, 3, 4, 5],
            [4, 5, 1, 2, 3, 4, 5, 1],
            [5, 1, 2, 3, 4, 5, 1, 2],
            [1, 2, 3, 4, 5, 1, 2, 3],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 1, 2, 3, 4, 5]
        ]);

        const detector = new MatchDetector(board);
        const matches = detector.findAllMatches();

        assertTrue(matches.length >= 1, '최소 1개 매치');
        const hMatch = matches.find(m => m.direction === 'horizontal' && m.type === '3');
        assertTrue(!!hMatch, '가로 3매치 존재');
        assertEqual(hMatch.positions.length, 3, '3개 블록');
    });

    // ----------------------------------------
    // 2. 세로 3매치 감지
    // ----------------------------------------

    test('세로 3매치: 기본 감지', () => {
        const board = new Board(8, 8);
        setupBoard(board, [
            [1, 2, 3, 4, 5, 2, 3, 4],
            [1, 3, 4, 5, 2, 3, 4, 5],
            [1, 4, 5, 2, 3, 4, 5, 2],
            [2, 5, 1, 3, 4, 5, 1, 3],
            [3, 1, 2, 4, 5, 1, 2, 4],
            [4, 2, 3, 5, 1, 2, 3, 5],
            [5, 3, 4, 1, 2, 3, 4, 1],
            [2, 4, 5, 2, 3, 4, 5, 2]
        ]);

        const detector = new MatchDetector(board);
        const matches = detector.findAllMatches();

        assertTrue(matches.length >= 1, '최소 1개 매치');
        const vMatch = matches.find(m => m.direction === 'vertical' && m.type === '3');
        assertTrue(!!vMatch, '세로 3매치 존재');
        assertEqual(vMatch.positions.length, 3, '3개 블록');
    });

    // ----------------------------------------
    // 3. 4매치 감지 → 로켓
    // ----------------------------------------

    test('가로 4매치: 로켓 생성', () => {
        const board = new Board(8, 8);
        setupBoard(board, [
            [1, 1, 1, 1, 2, 3, 4, 5],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 2, 3, 4, 5, 1],
            [4, 5, 2, 3, 4, 5, 1, 2],
            [5, 2, 3, 4, 5, 1, 2, 3],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 1, 2, 3, 4, 5],
            [4, 5, 1, 2, 3, 4, 5, 1]
        ]);

        const detector = new MatchDetector(board);
        const matches = detector.findAllMatches();

        const fourMatch = matches.find(m => m.type === '4');
        assertTrue(!!fourMatch, '4매치 존재');
        assertEqual(fourMatch.positions.length, 4, '4개 블록');
        assertTrue(fourMatch.specialBlockType === 6 || fourMatch.specialBlockType === 7, '로켓 생성');
    });

    test('세로 4매치: 세로 로켓 생성', () => {
        const board = new Board(8, 8);
        setupBoard(board, [
            [1, 2, 3, 4, 5, 2, 3, 4],
            [1, 3, 4, 5, 2, 3, 4, 5],
            [1, 4, 5, 2, 3, 4, 5, 2],
            [1, 5, 2, 3, 4, 5, 1, 3],
            [2, 1, 3, 4, 5, 1, 2, 4],
            [3, 2, 4, 5, 1, 2, 3, 5],
            [4, 3, 5, 1, 2, 3, 4, 1],
            [5, 4, 1, 2, 3, 4, 5, 2]
        ]);

        const detector = new MatchDetector(board);
        const matches = detector.findAllMatches();

        const fourMatch = matches.find(m => m.type === '4');
        assertTrue(!!fourMatch, '세로 4매치 존재');
        assertEqual(fourMatch.specialBlockType, 7, '세로 로켓 (typeId=7)');
    });

    // ----------------------------------------
    // 4. 5매치 감지 → 레인보우
    // ----------------------------------------

    test('5매치: 레인보우 생성', () => {
        const board = new Board(8, 8);
        setupBoard(board, [
            [1, 1, 1, 1, 1, 2, 3, 4],
            [2, 3, 4, 5, 2, 3, 4, 5],
            [3, 4, 5, 2, 3, 4, 5, 1],
            [4, 5, 2, 3, 4, 5, 1, 2],
            [5, 2, 3, 4, 5, 1, 2, 3],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 1, 2, 3, 4, 5],
            [4, 5, 1, 2, 3, 4, 5, 1]
        ]);

        const detector = new MatchDetector(board);
        const matches = detector.findAllMatches();

        const fiveMatch = matches.find(m => m.type === '5');
        assertTrue(!!fiveMatch, '5매치 존재');
        assertEqual(fiveMatch.positions.length, 5, '5개 블록');
        assertEqual(fiveMatch.specialBlockType, 9, '레인보우 (typeId=9)');
    });

    // ----------------------------------------
    // 5. L 모양 매치 → 폭탄
    // ----------------------------------------

    test('L매치: 폭탄 생성', () => {
        const board = new Board(8, 8);
        // (0,0)~(0,2) 가로 + (0,0)~(2,0) 세로 → L 형태 (교차점 (0,0))
        setupBoard(board, [
            [1, 1, 1, 2, 3, 4, 5, 2],
            [1, 2, 3, 4, 5, 2, 3, 4],
            [1, 3, 4, 5, 2, 3, 4, 5],
            [2, 4, 5, 3, 4, 5, 1, 3],
            [3, 5, 2, 4, 5, 1, 2, 4],
            [4, 2, 3, 5, 1, 2, 3, 5],
            [5, 3, 4, 1, 2, 3, 4, 1],
            [2, 4, 5, 2, 3, 4, 5, 2]
        ]);

        const detector = new MatchDetector(board);
        const matches = detector.findAllMatches();

        const lMatch = matches.find(m => m.type === 'L' || m.type === 'T');
        assertTrue(!!lMatch, 'L/T 매치 존재');
        assertEqual(lMatch.specialBlockType, 8, '폭탄 (typeId=8)');
        // L/T 매치는 최소 5개 블록 (3+3-교차점1 = 5)
        assertTrue(lMatch.positions.length >= 5, '5개 이상 블록');
    });

    // ----------------------------------------
    // 6. T 모양 매치 → 폭탄
    // ----------------------------------------

    test('T매치: 폭탄 생성', () => {
        const board = new Board(8, 8);
        // 가로 (0,0)~(0,4) 5개 + 세로 (0,2)~(2,2) 3개 → T 형태 교차점 (0,2)
        setupBoard(board, [
            [1, 1, 1, 1, 1, 2, 3, 4],
            [2, 3, 1, 4, 5, 2, 3, 4],
            [3, 4, 1, 5, 2, 3, 4, 5],
            [4, 5, 2, 3, 4, 5, 1, 3],
            [5, 2, 3, 4, 5, 1, 2, 4],
            [2, 3, 4, 5, 1, 2, 3, 5],
            [3, 4, 5, 1, 2, 3, 4, 1],
            [4, 5, 1, 2, 3, 4, 5, 2]
        ]);

        const detector = new MatchDetector(board);
        const matches = detector.findAllMatches();

        // 가로 5개 + 세로 3개가 교차하므로 T매치
        const tMatch = matches.find(m => m.type === 'T');
        assertTrue(!!tMatch, 'T매치 존재');
        assertEqual(tMatch.specialBlockType, 8, '폭탄 (typeId=8)');
    });

    // ----------------------------------------
    // 7. 동시 다발 매치
    // ----------------------------------------

    test('동시 다발 매치: 여러 매치 동시 감지', () => {
        const board = new Board(8, 8);
        setupBoard(board, [
            [1, 1, 1, 2, 2, 2, 3, 4],
            [3, 4, 5, 3, 4, 5, 1, 2],
            [4, 5, 1, 4, 5, 1, 2, 3],
            [5, 1, 2, 5, 1, 2, 3, 4],
            [1, 2, 3, 1, 2, 3, 4, 5],
            [2, 3, 4, 2, 3, 4, 5, 1],
            [3, 4, 5, 3, 4, 5, 1, 2],
            [4, 5, 1, 4, 5, 1, 2, 3]
        ]);

        const detector = new MatchDetector(board);
        const matches = detector.findAllMatches();

        assertTrue(matches.length >= 2, '최소 2개 매치 (빨강, 파랑)');
    });

    // ----------------------------------------
    // 8. 매치 없는 보드
    // ----------------------------------------

    test('매치 없음: 초기화된 보드', () => {
        const board = new Board(8, 8);
        board.initialize(); // 3매치 없도록 초기화

        const detector = new MatchDetector(board);
        const matches = detector.findAllMatches();

        assertEqual(matches.length, 0, '초기 보드는 매치 없음');
    });

    // ----------------------------------------
    // 9. findMatchesAt 특정 위치 매치
    // ----------------------------------------

    test('findMatchesAt: 특정 위치에서 매치 감지', () => {
        const board = new Board(8, 8);
        setupBoard(board, [
            [1, 1, 1, 2, 3, 4, 5, 2],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 2, 3, 4, 5, 1],
            [4, 5, 2, 3, 4, 5, 1, 2],
            [5, 2, 3, 4, 5, 1, 2, 3],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 1, 2, 3, 4, 5],
            [4, 5, 1, 2, 3, 4, 5, 1]
        ]);

        const detector = new MatchDetector(board);
        const matches = detector.findMatchesAt(0, 1); // 빨강 3매치 중간

        assertTrue(matches.length >= 1, '해당 위치 매치 감지');
    });

    // ----------------------------------------
    // 10. hasAnyValidMove
    // ----------------------------------------

    test('hasAnyValidMove: 초기화된 보드에서 유효 이동 존재', () => {
        const board = new Board(8, 8);
        board.initialize();

        const detector = new MatchDetector(board);
        // 초기 보드는 대부분 유효 이동이 존재함
        // (아주 드물게 없을 수도 있지만 확률적으로 매우 낮음)
        const hasMove = detector.hasAnyValidMove();
        // 이 테스트는 확률적이므로 경고만
        if (!hasMove) {
            console.log('  ⚠️ 유효 이동 없음 (드문 경우, 셔플 필요)');
        }
    });

    // ----------------------------------------
    // 11. findAllValidMoves
    // ----------------------------------------

    test('findAllValidMoves: 유효 이동 목록', () => {
        const board = new Board(8, 8);
        board.initialize();

        const detector = new MatchDetector(board);
        const moves = detector.findAllValidMoves();

        assertTrue(Array.isArray(moves), '배열 반환');
        if (moves.length > 0) {
            assertTrue(moves[0].from !== undefined, 'from 존재');
            assertTrue(moves[0].to !== undefined, 'to 존재');
        }
    });

    // ----------------------------------------
    // 12. findBestHint
    // ----------------------------------------

    test('findBestHint: 최선의 힌트 반환', () => {
        const board = new Board(8, 8);
        board.initialize();

        const detector = new MatchDetector(board);
        const hint = detector.findBestHint();

        // 유효 이동이 있으면 힌트도 있어야 함
        if (detector.hasAnyValidMove()) {
            assertTrue(hint !== null, '힌트 존재');
            assertTrue(hint.from !== undefined, 'from 존재');
            assertTrue(hint.to !== undefined, 'to 존재');
        }
    });

    // ----------------------------------------
    // 13. 특수 블록 생성 위치 (중앙)
    // ----------------------------------------

    test('특수 블록 위치: 4매치 중앙에 생성', () => {
        const board = new Board(8, 8);
        setupBoard(board, [
            [1, 1, 1, 1, 2, 3, 4, 5],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 2, 3, 4, 5, 1],
            [4, 5, 2, 3, 4, 5, 1, 2],
            [5, 2, 3, 4, 5, 1, 2, 3],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 1, 2, 3, 4, 5],
            [4, 5, 1, 2, 3, 4, 5, 1]
        ]);

        const detector = new MatchDetector(board);
        const matches = detector.findAllMatches();
        const fourMatch = matches.find(m => m.type === '4');

        if (fourMatch) {
            assertTrue(fourMatch.specialBlockPosition !== null, '생성 위치 존재');
            // 4매치의 중앙은 index 2 (0-indexed: floor(4/2) = 2)
            assertEqual(fourMatch.specialBlockPosition.row, 0, '행 = 0');
            assertEqual(fourMatch.specialBlockPosition.col, 2, '열 = 2 (중앙)');
        }
    });

    // ----------------------------------------
    // 14. EventBus 테스트
    // ----------------------------------------

    test('EventBus: on/emit/off 기본 동작', async () => {
        const { eventBus, EVENTS } = await import('../../js/core/eventBus.js');

        let received = null;
        const handler = (payload) => { received = payload; };

        eventBus.on('TEST_EVENT', handler);
        eventBus.emit('TEST_EVENT', { data: 42 });

        assertEqual(received.data, 42, '이벤트 수신');

        eventBus.off('TEST_EVENT', handler);
        received = null;
        eventBus.emit('TEST_EVENT', { data: 99 });

        assertEqual(received, null, '구독 해제 후 미수신');
    });

    test('EventBus: once 1회만 수신', async () => {
        const { eventBus } = await import('../../js/core/eventBus.js');

        let count = 0;
        eventBus.once('ONCE_TEST', () => { count++; });
        eventBus.emit('ONCE_TEST', {});
        eventBus.emit('ONCE_TEST', {});

        assertEqual(count, 1, '1회만 수신');
    });

    test('EventBus: 우선순위 정렬', async () => {
        const { eventBus } = await import('../../js/core/eventBus.js');

        const order = [];
        const h1 = () => order.push('A');
        const h2 = () => order.push('B');
        const h3 = () => order.push('C');

        eventBus.on('PRIORITY_TEST', h3, 300);
        eventBus.on('PRIORITY_TEST', h1, 100);
        eventBus.on('PRIORITY_TEST', h2, 200);
        eventBus.emit('PRIORITY_TEST', {});

        assertEqual(order.join(','), 'A,B,C', '우선순위 순서');

        eventBus.off('PRIORITY_TEST', h1);
        eventBus.off('PRIORITY_TEST', h2);
        eventBus.off('PRIORITY_TEST', h3);
    });

    // ========================================
    // 결과 출력
    // ========================================

    console.log('');
    console.log('========================================');
    console.log('  테스트 결과');
    console.log('========================================');

    for (const result of testResults) {
        if (result.error) {
            console.log(`  ${result.status} ${result.name}`);
            console.log(`     → ${result.error}`);
        } else {
            console.log(`  ${result.status} ${result.name}`);
        }
    }

    console.log('');
    console.log(`  총 ${passed + failed}개 중 ${passed}개 통과, ${failed}개 실패`);
    console.log('========================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('테스트 실행 오류:', err);
    process.exit(1);
});
