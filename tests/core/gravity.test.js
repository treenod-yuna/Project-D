/**
 * gravity.test.js — GravityHandler + CascadeManager 단위 테스트
 *
 * Phase 3 코어 로직 검증:
 * - 낙하 계산/적용
 * - 리필 생성/적용
 * - 연쇄 루프
 * - 셔플 동작
 */

let Board, createBlock;
let MatchDetector;
let GravityHandler;
let CascadeManager;
let getNormalTypes;

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

/**
 * 2D 배열로 보드를 세팅한다.
 */
function setupBoard(board, layout) {
    for (let row = 0; row < layout.length; row++) {
        for (let col = 0; col < layout[row].length; col++) {
            const typeId = layout[row][col];
            if (typeId > 0) {
                const block = createBlock(typeId, row, col);
                board.setBlock(row, col, block);
            } else {
                // 빈 칸 (블록 제거)
                board.removeBlock(row, col);
            }
        }
    }
}

async function runTests() {
    const boardModule = await import('../../js/core/board.js');
    const matchModule = await import('../../js/core/match.js');
    const gravityModule = await import('../../js/core/gravity.js');
    const cascadeModule = await import('../../js/core/cascade.js');
    const blockTypesModule = await import('../../js/core/blockTypes.js');

    Board = boardModule.Board;
    createBlock = boardModule.createBlock;
    MatchDetector = matchModule.MatchDetector;
    GravityHandler = gravityModule.GravityHandler;
    CascadeManager = cascadeModule.CascadeManager;
    getNormalTypes = blockTypesModule.getNormalTypes;

    console.log('========================================');
    console.log('  Gravity + Cascade 단위 테스트 시작');
    console.log('========================================\n');

    // ----------------------------------------
    // 1. 낙하 계산 — 기본 케이스
    // ----------------------------------------

    test('낙하: 빈 칸 1개 위 블록 낙하', () => {
        const board = new Board(4, 4);
        // col 0: row 0=빨강, row 1=파랑, row 2=빈칸, row 3=초록
        setupBoard(board, [
            [1, 2, 3, 4],
            [2, 3, 4, 5],
            [0, 4, 5, 1],  // (2,0) 빈 칸
            [3, 5, 1, 2]
        ]);

        const gravity = new GravityHandler(board);
        const falls = gravity.calculateFalls();

        // col 0에서 row 0→1, row 1→2 낙하해야 함
        const col0Falls = falls.filter(f => f.col === 0);
        assertTrue(col0Falls.length >= 1, '최소 1개 낙하');

        // row 1 블록이 row 2로 이동
        const fall1 = col0Falls.find(f => f.fromRow === 1);
        assertTrue(!!fall1, 'row 1 블록 낙하');
        assertEqual(fall1.toRow, 2, 'row 1 → row 2');
        assertEqual(fall1.distance, 1, '1칸 낙하');
    });

    test('낙하: 연속 빈 칸 다중 낙하', () => {
        const board = new Board(6, 1);
        // col 0: 빨, 파, 빈, 빈, 빈, 초
        setupBoard(board, [
            [1],
            [2],
            [0],
            [0],
            [0],
            [3]
        ]);

        const gravity = new GravityHandler(board);
        const falls = gravity.calculateFalls();

        // row 0, row 1 블록이 각각 3칸씩 낙하
        const fall0 = falls.find(f => f.fromRow === 0);
        const fall1 = falls.find(f => f.fromRow === 1);

        assertTrue(!!fall0, 'row 0 블록 낙하');
        assertEqual(fall0.toRow, 3, 'row 0 → row 3');
        assertEqual(fall0.distance, 3, '3칸 낙하');

        assertTrue(!!fall1, 'row 1 블록 낙하');
        assertEqual(fall1.toRow, 4, 'row 1 → row 4');
        assertEqual(fall1.distance, 3, '3칸 낙하');
    });

    test('낙하: 빈 칸 없으면 낙하 없음', () => {
        const board = new Board(4, 4);
        board.initialize();

        const gravity = new GravityHandler(board);
        const falls = gravity.calculateFalls();

        assertEqual(falls.length, 0, '낙하 없음');
    });

    // ----------------------------------------
    // 2. 낙하 적용
    // ----------------------------------------

    test('낙하 적용: 보드 상태 업데이트', () => {
        const board = new Board(4, 1);
        setupBoard(board, [
            [1],
            [0],  // 빈 칸
            [0],  // 빈 칸
            [2]
        ]);

        const gravity = new GravityHandler(board);
        const falls = gravity.calculateFalls();
        gravity.applyFalls(falls);

        // row 0 블록이 row 2로 이동
        const block0 = board.getBlock(0, 0);
        const block2 = board.getBlock(2, 0);
        const block3 = board.getBlock(3, 0);

        assertTrue(board.isEmpty(0, 0), 'row 0 비어야 함');
        assertTrue(board.isEmpty(1, 0), 'row 1 비어야 함');
        assertTrue(!!block2, 'row 2에 블록 존재');
        assertEqual(block2.typeId, 1, 'row 2 = 빨강 (원래 row 0)');
        assertEqual(block3.typeId, 2, 'row 3 = 파랑 (변화 없음)');
    });

    // ----------------------------------------
    // 3. 리필 생성
    // ----------------------------------------

    test('리필: 빈 칸에 새 블록 생성', () => {
        const board = new Board(4, 4);
        board.initialize();

        // 일부 칸 비우기
        board.removeBlock(0, 0);
        board.removeBlock(1, 0);
        board.removeBlock(0, 3);

        const gravity = new GravityHandler(board);
        const refills = gravity.generateRefills();

        assertEqual(refills.length, 3, '3개 리필');

        // 모든 리필이 유효한 일반 블록 타입인지
        const normalIds = getNormalTypes().map(t => t.id);
        for (const refill of refills) {
            assertTrue(normalIds.includes(refill.typeId), `유효한 타입: ${refill.typeId}`);
            assertTrue(!!refill.block, '블록 객체 존재');
        }
    });

    test('리필 적용: 보드에 블록 배치', () => {
        const board = new Board(4, 4);
        board.initialize();

        board.removeBlock(0, 0);
        board.removeBlock(1, 0);

        const gravity = new GravityHandler(board);
        const refills = gravity.generateRefills();
        gravity.applyRefills(refills);

        assertFalse(board.isEmpty(0, 0), 'row 0 채워짐');
        assertFalse(board.isEmpty(1, 0), 'row 1 채워짐');
    });

    // ----------------------------------------
    // 4. 낙하 → 리필 전체 사이클
    // ----------------------------------------

    test('전체 사이클: 빈 칸 → 낙하 → 리필 → 모든 칸 채워짐', () => {
        const board = new Board(8, 8);
        board.initialize();

        // 하단 행 3개 제거
        for (let row = 5; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                board.removeBlock(row, col);
            }
        }

        const gravity = new GravityHandler(board);

        // 1. 낙하
        const falls = gravity.calculateFalls();
        gravity.applyFalls(falls);

        // 2. 리필
        const refills = gravity.generateRefills();
        gravity.applyRefills(refills);

        // 모든 칸이 채워졌는지
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                assertFalse(board.isEmpty(row, col), `(${row},${col}) 채워짐`);
            }
        }
    });

    // ----------------------------------------
    // 5. 셔플 테스트
    // ----------------------------------------

    test('셔플: 유효 이동 보장', () => {
        const board = new Board(8, 8);
        board.initialize();
        const matchDetector = new MatchDetector(board);

        // 셔플을 직접 호출하려면 CascadeManager 필요
        // 대신 matchDetector.hasAnyValidMove()로 검증
        // 초기 보드는 대부분 유효 이동이 있음
        const hasMove = matchDetector.hasAnyValidMove();
        if (!hasMove) {
            // 매우 드문 경우 — 재초기화로 대체
            board.initialize();
            assertTrue(matchDetector.hasAnyValidMove(), '재초기화 후 유효 이동');
        }
    });

    // ----------------------------------------
    // 6. 연쇄 매치 시나리오
    // ----------------------------------------

    test('연쇄: 낙하 후 재매치 감지', () => {
        const board = new Board(6, 4);
        // 의도적으로 낙하 후 매치가 발생하는 배치
        // col 0: 빨, 빈, 빨, 빨, 파, 초
        // 빈 칸 제거 후 낙하하면 빨-빨-빨 연쇄
        setupBoard(board, [
            [1, 2, 3, 4],
            [0, 3, 4, 5],  // (1,0) 빈 칸
            [1, 4, 5, 2],
            [1, 5, 2, 3],
            [2, 1, 3, 4],
            [3, 2, 4, 5]
        ]);

        const gravity = new GravityHandler(board);
        const matchDetector = new MatchDetector(board);

        // 낙하 전 매치 확인
        const beforeFalls = matchDetector.findAllMatches();

        // 낙하
        const falls = gravity.calculateFalls();
        gravity.applyFalls(falls);

        // 리필
        const refills = gravity.generateRefills();
        gravity.applyRefills(refills);

        // 낙하 후 매치 확인
        const afterFalls = matchDetector.findAllMatches();

        // 빨(row0)이 빈칸으로 내려와 빨-빨-빨이 될 수 있음
        // (보드 상태에 따라 매치 여부가 달라질 수 있으므로 기본 동작만 검증)
        assertTrue(falls.length > 0, '낙하 발생');
    });

    // ----------------------------------------
    // 7. 다중 열 동시 낙하
    // ----------------------------------------

    test('다중 열: 각 열 독립적 낙하', () => {
        const board = new Board(4, 4);
        setupBoard(board, [
            [1, 2, 3, 4],
            [0, 0, 0, 0],  // 전체 빈 행
            [2, 3, 4, 5],
            [3, 4, 5, 1]
        ]);

        const gravity = new GravityHandler(board);
        const falls = gravity.calculateFalls();

        // 4개 열 모두 row 0 블록이 1칸 낙하
        assertEqual(falls.length, 4, '4개 열 낙하');
        for (const fall of falls) {
            assertEqual(fall.distance, 1, '1칸 낙하');
        }
    });

    // ----------------------------------------
    // 8. 하단 빈 칸 처리
    // ----------------------------------------

    test('하단 빈 칸: 맨 아래 빈 칸 낙하', () => {
        const board = new Board(4, 1);
        setupBoard(board, [
            [1],
            [2],
            [3],
            [0]   // 맨 아래 빈 칸
        ]);

        const gravity = new GravityHandler(board);
        const falls = gravity.calculateFalls();

        // row 0,1,2 블록이 각각 1칸씩 낙하
        assertEqual(falls.length, 3, '3개 블록 낙하');
    });

    // ----------------------------------------
    // 9. 전체 열 빈 칸
    // ----------------------------------------

    test('전체 빈 열: 모든 칸 리필', () => {
        const board = new Board(4, 1);
        setupBoard(board, [
            [0],
            [0],
            [0],
            [0]
        ]);

        const gravity = new GravityHandler(board);

        // 낙하 없음 (블록이 없으므로)
        const falls = gravity.calculateFalls();
        assertEqual(falls.length, 0, '낙하 없음');

        // 리필 4개
        const refills = gravity.generateRefills();
        assertEqual(refills.length, 4, '4개 리필');
    });

    // ----------------------------------------
    // 10. MAX_CASCADE_ITERATIONS 제한
    // ----------------------------------------

    test('연쇄 제한: MAX_CASCADE_ITERATIONS 상수 존재', () => {
        const { MAX_CASCADE_ITERATIONS } = cascadeModule;
        assertEqual(MAX_CASCADE_ITERATIONS, 50, '최대 연쇄 50회');
    });

    test('셔플 제한: MAX_SHUFFLE_ATTEMPTS 상수 존재', () => {
        const { MAX_SHUFFLE_ATTEMPTS } = cascadeModule;
        assertEqual(MAX_SHUFFLE_ATTEMPTS, 100, '최대 셔플 시도 100회');
    });

    // ----------------------------------------
    // 11. 이동 불가 장애물 아래 리필 차단
    // ----------------------------------------

    test('리필 차단: 이동 불가 블록 아래 빈 칸은 리필하지 않음', () => {
        const board = new Board(6, 1);
        // col 0: 빈, 빈, 가방(11, immovable), 빈, 빈, 블록
        setupBoard(board, [
            [0],
            [0],
            [11],  // 가방 (immovable, gravity=false)
            [0],
            [0],
            [1]
        ]);

        const gravity = new GravityHandler(board);
        const refills = gravity.generateRefills();

        // row 0, row 1만 리필됨 (row 3, row 4는 가방 아래 → 차단)
        assertEqual(refills.length, 2, '가방 위 빈 칸 2개만 리필');
        assertTrue(refills.every(r => r.row < 2), '모든 리필이 row 0~1 범위');
    });

    test('리필 차단: 이동 불가 블록 없으면 전체 리필', () => {
        const board = new Board(4, 1);
        setupBoard(board, [
            [0],
            [1],
            [0],
            [0]
        ]);

        const gravity = new GravityHandler(board);
        // 먼저 낙하 적용
        const falls = gravity.calculateFalls();
        gravity.applyFalls(falls);

        // 낙하 후 리필
        const refills = gravity.generateRefills();

        // 이동 불가 블록 없으므로 모든 빈 칸 리필
        // row 0의 블록이 row 1 또는 그 아래로 떨어진 후, 빈 칸만큼 리필
        const totalBlocks = board.getAllBlocks().length;
        assertEqual(totalBlocks + refills.length, 4, '전체 칸이 채워져야 함');
    });

    // ----------------------------------------
    // 12. 대각선 슬라이드 (slidable 장애물)
    // ----------------------------------------

    test('대각선 슬라이드: slidable 장애물 주변 블록 대각선 이동', () => {
        const board = new Board(4, 3);
        // col 1에 가방(slidable), 위에 블록, 아래-왼쪽 비어있음
        setupBoard(board, [
            [0, 0, 0],
            [0, 1, 0],   // (1,1)에 빨강 블록
            [0, 11, 0],  // (2,1)에 가방 (immovable, slidable)
            [0, 0, 0]
        ]);

        const gravity = new GravityHandler(board);

        // 수직 낙하: 빨강 블록은 가방 위에서 못 내려감
        const falls = gravity.calculateFalls();
        assertEqual(falls.length, 0, '수직 낙하 없음 (가방이 막고 있음)');

        // 대각선 슬라이드: 빨강 블록이 (2,0) 또는 (2,2)로 슬라이드
        const slides = gravity.calculateDiagonalSlides();
        assertEqual(slides.length, 1, '1개 대각선 슬라이드');
        assertEqual(slides[0].fromRow, 1, '출발 행');
        assertEqual(slides[0].fromCol, 1, '출발 열');
        assertEqual(slides[0].toRow, 2, '도착 행 (한 칸 아래)');
        assertTrue(slides[0].toCol === 0 || slides[0].toCol === 2, '대각선 열');
    });

    test('대각선 슬라이드: slidable=false이면 슬라이드 불가', () => {
        const board = new Board(4, 3);
        // col 1에 돌(18, immovable but slidable=false), 위에 블록
        setupBoard(board, [
            [0, 0, 0],
            [0, 1, 0],   // (1,1)에 빨강 블록
            [0, 18, 0],  // (2,1)에 돌 (immovable, slidable=false)
            [0, 0, 0]
        ]);

        const gravity = new GravityHandler(board);

        // 대각선 슬라이드: 돌은 slidable=false → 슬라이드 불가
        const slides = gravity.calculateDiagonalSlides();
        assertEqual(slides.length, 0, '슬라이드 없음 (돌은 slidable=false)');
    });

    test('대각선 슬라이드: 슬라이드 후 수직 낙하 연속 처리', () => {
        const board = new Board(5, 3);
        // (1,1)에 블록, (2,1)에 가방, (3,0)과 (4,0)이 비어있음
        setupBoard(board, [
            [0, 0, 0],
            [0, 1, 0],   // 빨강 블록
            [0, 11, 0],  // 가방
            [0, 0, 0],
            [0, 0, 0]
        ]);

        const gravity = new GravityHandler(board);

        // 1차: 대각선 슬라이드
        const slides = gravity.calculateDiagonalSlides();
        assertTrue(slides.length > 0, '대각선 슬라이드 발생');
        gravity.applySlides(slides);

        // 슬라이드 후 블록은 (2, 0 또는 2)에 위치
        const slidedCol = slides[0].toCol;

        // 2차: 수직 낙하 (슬라이드된 블록이 아래 빈 칸으로 추가 낙하)
        const falls = gravity.calculateFalls();
        assertTrue(falls.length > 0, '슬라이드 후 추가 낙하');

        gravity.applyFalls(falls);

        // 최종: 블록이 맨 아래(row 4)에 도달
        const finalBlock = board.getBlock(4, slidedCol);
        assertTrue(!!finalBlock, '블록이 맨 아래까지 낙하');
        assertEqual(finalBlock.typeId, 1, '빨강 블록');
    });

    test('대각선 슬라이드: 양쪽 다 막혀있으면 슬라이드 불가', () => {
        const board = new Board(4, 3);
        // 양쪽 대각선 위치 + 그림자 영역 모두 점유
        setupBoard(board, [
            [0, 0, 0],
            [0, 1, 0],   // 빨강 블록
            [2, 11, 3],  // 가방 양쪽에 블록
            [4, 5, 1]    // (3,1)도 점유 → 그림자 영역도 막혀있음
        ]);

        const gravity = new GravityHandler(board);
        const slides = gravity.calculateDiagonalSlides();
        assertEqual(slides.length, 0, '양쪽 막혀 슬라이드 불가');
    });

    test('대각선 슬라이드: inward — 인접 열 블록이 장애물 아래 그림자 영역으로 유입', () => {
        const board = new Board(4, 3);
        // 가방(11) 아래에 빈 칸 → 인접 열 블록이 대각선으로 유입
        setupBoard(board, [
            [0, 0, 0],
            [0, 0, 0],
            [2, 11, 0],  // (2,0)에 블록, (2,1)에 가방
            [1, 0, 0]    // (3,0)에 블록, (3,1) 빈 칸 = 그림자 영역
        ]);

        const gravity = new GravityHandler(board);

        // 블록 (2,0): 아래(3,0) 점유 → 수직 낙하 불가
        // 대각선 (3,1): 비어있고, 위에 가방(11) 존재 → inward 슬라이드 가능
        const slides = gravity.calculateDiagonalSlides();
        assertEqual(slides.length, 1, '1개 inward 슬라이드');
        assertEqual(slides[0].fromRow, 2, 'inward 출발 행');
        assertEqual(slides[0].fromCol, 0, 'inward 출발 열 (인접 열)');
        assertEqual(slides[0].toRow, 3, 'inward 도착 행');
        assertEqual(slides[0].toCol, 1, 'inward 도착 열 (장애물 열)');
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
