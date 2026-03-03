/**
 * gimmick.test.js — 기믹 프레임워크 단위 테스트
 *
 * 기믹 검증:
 * - GimmickManager 등록/조회
 * - 가방 (블록형, 인접 매치 데미지)
 * - 꿀 (Floor 레이어, 확산)
 * - 곰인형 (수집형)
 * - 거대 상자 (2x2, 특수 블록으로만 파괴)
 * - invincible 기믹 보호
 * - 리소스 연결
 */

let Board, createBlock;
let MatchDetector;
let GravityHandler;
let GimmickManager;
let registerAllGimmickHandlers;
let SwapHandler;
let getBlockType, BLOCK_CATEGORY;

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
                board.removeBlock(row, col);
            }
        }
    }
}

// ========================================
// 테스트 실행
// ========================================

async function runTests() {
    console.log('========================================');
    console.log('  기믹 프레임워크 단위 테스트 시작');
    console.log('========================================\n');

    // 모듈 임포트
    const boardModule = await import('../../js/core/board.js');
    Board = boardModule.Board;
    createBlock = boardModule.createBlock;

    const matchModule = await import('../../js/core/match.js');
    MatchDetector = matchModule.MatchDetector;

    const gravityModule = await import('../../js/core/gravity.js');
    GravityHandler = gravityModule.GravityHandler;

    const gimmickModule = await import('../../js/gimmick/gimmickFramework.js');
    GimmickManager = gimmickModule.GimmickManager;

    const gimmickTypesModule = await import('../../js/gimmick/gimmickTypes.js');
    registerAllGimmickHandlers = gimmickTypesModule.registerAllGimmickHandlers;

    const blockTypesModule = await import('../../js/core/blockTypes.js');
    getBlockType = blockTypesModule.getBlockType;
    BLOCK_CATEGORY = blockTypesModule.BLOCK_CATEGORY;

    // ========================================
    // GimmickManager 등록/조회
    // ========================================

    test('등록: 핸들러 등록 후 typeId로 조회', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        const handler = gm.getHandler(11);  // 가방1
        assertTrue(handler !== undefined, '가방1 핸들러 존재');
        assertEqual(handler.category, 'bag', '가방1은 bag 카테고리');
    });

    test('등록: 모든 기믹 타입에 핸들러 매핑', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        const gimmickIds = [11, 12, 13, 14, 15, 16, 17, 18, 19];
        for (const id of gimmickIds) {
            assertTrue(gm.getHandler(id) !== undefined, `typeId ${id} 핸들러 존재`);
        }
    });

    test('등록: 일반/특수 블록은 핸들러 없음', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        assertEqual(gm.getHandler(1), undefined, '일반 블록(1)은 핸들러 없음');
        assertEqual(gm.getHandler(6), undefined, '특수 블록(6)은 핸들러 없음');
    });

    test('등록: 우선순위 정렬', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        for (let i = 1; i < gm._handlers.length; i++) {
            assertTrue(gm._handlers[i].priority >= gm._handlers[i - 1].priority,
                `핸들러 ${i}의 priority ≥ ${i - 1}의 priority`);
        }
    });

    // ========================================
    // 가방 기믹 (블록형, 인접 매치 데미지)
    // ========================================

    test('가방: 1단계 인접 매치 → HP 1→0 파괴', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(11, 2, 3); // 가방1 (블록형) at (2,3)

        const result = gm.processAdjacentDamage([{ row: 2, col: 2 }]);
        assertEqual(result.destroyed.length, 1, '파괴된 기믹 1개');
        assertEqual(result.destroyed[0].typeId, 11, '파괴된 것은 가방1');
        assertEqual(board.getBlock(2, 3), null, '블록 제거됨');
    });

    test('가방: 2단계 인접 매치 → HP 2→1 (파괴 안 됨)', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(12, 3, 3); // 가방2 (블록형) at (3,3)

        const result = gm.processAdjacentDamage([{ row: 3, col: 2 }]);
        assertEqual(result.damaged.length, 1, '데미지 받은 기믹 1개');
        assertEqual(result.damaged[0].remainingHp, 1, 'HP 1 남음');
        assertEqual(result.destroyed.length, 0, '파괴 안 됨');
    });

    test('가방: 2단계 두 번 데미지 → 파괴', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(12, 3, 3); // 가방2 at (3,3)

        gm.processAdjacentDamage([{ row: 3, col: 2 }]);
        const result = gm.processAdjacentDamage([{ row: 3, col: 4 }]);

        assertEqual(result.destroyed.length, 1, '두 번째 데미지로 파괴');
        assertEqual(board.getBlock(3, 3), null, '블록 제거됨');
    });

    test('가방: 블록형으로 배치 (레이어 아님)', () => {
        const board = new Board(8, 8);

        board.placeGimmick(11, 4, 4); // 가방1
        const block = board.getBlock(4, 4);
        assertTrue(block !== null, '블록으로 배치됨');
        assertEqual(block.typeId, 11, '가방1 블록');
        assertEqual(board.getLayersAt(4, 4).length, 0, '레이어 없음');
    });

    test('가방: 인접하지 않은 매치 → 데미지 없음', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(11, 0, 0); // 가방1 at (0,0)

        const result = gm.processAdjacentDamage([{ row: 5, col: 5 }]);
        assertEqual(result.damaged.length, 0, '데미지 없음');
        assertEqual(result.destroyed.length, 0, '파괴 없음');
    });

    test('가방: 폭탄으로도 파괴 가능', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        board.placeGimmick(11, 3, 3); // 가방1

        const result = gm.processSpecialDamage([{ row: 3, col: 3 }], 'bomb');
        assertEqual(result.destroyed.length, 1, '폭탄으로 가방 파괴');
    });

    // ========================================
    // 꿀 기믹 (Floor 레이어, 확산형)
    // ========================================

    test('꿀: Floor 레이어(zIndex=-1)로 배치', () => {
        const board = new Board(8, 8);

        board.placeGimmick(13, 3, 3); // 꿀 (Floor)
        const layers = board.getLayersAt(3, 3);
        assertEqual(layers.length, 1, '레이어 1개');
        assertEqual(layers[0].typeId, 13, '꿀 레이어');
        assertEqual(layers[0].zIndex, -1, 'Floor는 zIndex=-1');
    });

    test('꿀: 턴 종료 시 인접 칸에 확산', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(13, 3, 3); // 꿀 at (3,3)

        const result = gm.processSpread();
        assertTrue(result.spreads.length > 0, '꿀 확산 발생');
        assertEqual(result.spreads[0].typeId, 13, '확산된 것은 꿀');
    });

    test('꿀: 기존 기믹 있는 칸에 확산 불가', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        // 꿀 주변 4방향 모두 블록형 기믹으로 둘러싸기
        board.placeGimmick(13, 3, 3); // 꿀 (Floor 레이어)
        board.placeGimmick(11, 2, 3); // 가방 위 (블록형 기믹)
        board.placeGimmick(11, 4, 3); // 가방 아래
        board.placeGimmick(11, 3, 2); // 가방 왼
        board.placeGimmick(11, 3, 4); // 가방 오른

        const result = gm.processSpread();
        assertEqual(result.spreads.length, 0, '기믹 둘러싸인 칸에서 확산 불가');
    });

    test('꿀: 인접 매치로 HP 감소 → 파괴', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(13, 3, 3); // 꿀 HP=1

        const result = gm.processAdjacentDamage([{ row: 3, col: 2 }]);
        assertEqual(result.destroyed.length, 1, '꿀 파괴');
        assertEqual(board.getLayersAt(3, 3).length, 0, '레이어 제거됨');
    });

    // ========================================
    // 곰인형 (수집형)
    // ========================================

    test('수집: 곰인형 맨 아래 행 → 수집', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        const bear = createBlock(14, 7, 3); // 맨 아래 행
        board.setBlock(7, 3, bear);

        const result = gm.processCollection();
        assertEqual(result.collected.length, 1, '수집 1개');
        assertEqual(result.collected[0].typeId, 14, '수집된 것은 곰인형');
        assertEqual(board.getBlock(7, 3), null, '보드에서 제거됨');
    });

    test('수집: 곰인형 중간 행 → 미수집', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        const bear = createBlock(14, 3, 3);
        board.setBlock(3, 3, bear);

        const result = gm.processCollection();
        assertEqual(result.collected.length, 0, '중간 행에서 수집 안 됨');
        assertTrue(board.getBlock(3, 3) !== null, '보드에 여전히 존재');
    });

    test('수집: 일반 블록은 수집 대상 아님', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        const block = createBlock(1, 7, 3);
        board.setBlock(7, 3, block);

        const result = gm.processCollection();
        assertEqual(result.collected.length, 0, '일반 블록 수집 안 됨');
    });

    test('수집: invincible 곰인형은 폭탄 데미지 무시', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        const bear = createBlock(14, 3, 3);
        board.setBlock(3, 3, bear);

        const result = gm.processSpecialDamage([{ row: 3, col: 3 }], 'bomb');
        assertEqual(result.damaged.length, 0, '곰인형 데미지 없음');
        assertTrue(board.getBlock(3, 3) !== null, '곰인형 여전히 존재');
    });

    // ========================================
    // 거대 상자 (2x2, 특수 블록으로만 파괴)
    // ========================================

    test('거대상자: 배치 후 4칸 점유', () => {
        const board = new Board(8, 8);

        board.placeGimmick(15, 3, 3); // 거대상자 1단계 (3,3)~(4,4)

        const origin = board.getBlock(3, 3);
        assertTrue(origin !== null, 'origin 블록 존재');
        assertEqual(origin.typeId, 15, 'origin은 거대상자1');

        const sub1 = board.getBlock(3, 4);
        const sub2 = board.getBlock(4, 3);
        const sub3 = board.getBlock(4, 4);
        assertTrue(sub1 !== null, '서브 블록 (3,4) 존재');
        assertTrue(sub2 !== null, '서브 블록 (4,3) 존재');
        assertTrue(sub3 !== null, '서브 블록 (4,4) 존재');
    });

    test('거대상자: 인접 매치로는 파괴 불가 (indirectDamage=false)', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(17, 3, 3); // 거대상자 3단계 HP=3

        const result = gm.processAdjacentDamage([{ row: 3, col: 2 }]);
        assertEqual(result.damaged.length, 0, '인접 매치 데미지 없음');
        assertEqual(result.destroyed.length, 0, '파괴 안 됨');
        const origin = board.getBlock(3, 3);
        assertEqual(origin.hp, 3, 'HP 변화 없음');
    });

    test('거대상자: 폭탄으로 HP 감소', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(17, 3, 3); // 거대상자 3단계 HP=3

        const result = gm.processSpecialDamage([{ row: 3, col: 3 }], 'bomb');
        assertEqual(result.damaged.length, 1, '거대상자 데미지');

        const origin = board.getBlock(3, 3);
        assertEqual(origin.hp, 2, 'HP 3→2');
    });

    test('거대상자: 레인보우로는 파괴 불가', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        board.placeGimmick(17, 3, 3); // 거대상자 3단계

        const result = gm.processSpecialDamage([{ row: 3, col: 3 }], 'rainbow');
        assertEqual(result.damaged.length, 0, '레인보우 데미지 없음');
        const origin = board.getBlock(3, 3);
        assertEqual(origin.hp, 3, 'HP 변화 없음');
    });

    test('거대상자: HP=0 → 4칸 모두 제거', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(18, 3, 3); // 거대상자 4단계 HP=2

        // 2번 폭탄 데미지로 파괴
        gm.processSpecialDamage([{ row: 3, col: 3 }], 'bomb');
        const result = gm.processSpecialDamage([{ row: 3, col: 3 }], 'bomb');

        assertEqual(result.destroyed.length, 1, '거대상자 파괴');
        assertEqual(board.getBlock(3, 3), null, '(3,3) 비어있음');
        assertEqual(board.getBlock(3, 4), null, '(3,4) 비어있음');
        assertEqual(board.getBlock(4, 3), null, '(4,3) 비어있음');
        assertEqual(board.getBlock(4, 4), null, '(4,4) 비어있음');
    });

    test('거대상자: 서브 블록 위치에 폭탄 → origin에 데미지 위임', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(17, 3, 3); // 거대상자 3단계 HP=3

        // 서브 블록 (4,4) 위치에 폭탄 → origin (3,3)에 데미지
        const result = gm.processSpecialDamage([{ row: 4, col: 4 }], 'bomb');
        const origin = board.getBlock(3, 3);
        assertEqual(origin.hp, 2, '서브 블록 위치에서도 HP 감소 (3→2)');
    });

    test('거대상자: 5단계별 HP 확인', () => {
        const board = new Board(8, 8);

        // 각 단계별 HP 확인
        const expectedHp = { 15: 5, 16: 4, 17: 3, 18: 2, 19: 1 };
        for (const [typeId, hp] of Object.entries(expectedHp)) {
            const def = getBlockType(Number(typeId));
            assertEqual(def.hp, hp, `거대상자 ID${typeId} HP=${hp}`);
        }
    });

    // ========================================
    // 리소스 연결 확인
    // ========================================

    test('리소스: 일반 블록에 리소스 연결', () => {
        const def = getBlockType(1); // 빨강
        assertEqual(def.resources, 'block01', 'ID1 리소스');

        const def2 = getBlockType(2); // 파랑
        assertEqual(def2.resources, 'block04', 'ID2 리소스');
    });

    test('리소스: 특수 블록에 리소스 연결', () => {
        const def = getBlockType(8); // 폭탄
        assertEqual(def.resources, 'Booster_Bomb', 'ID8 리소스');

        const def2 = getBlockType(9); // 레인보우
        assertEqual(def2.resources, 'Booster_Cube_Make_015', 'ID9 리소스');
    });

    test('리소스: 기믹에 리소스 연결', () => {
        const def = getBlockType(11); // 가방1
        assertEqual(def.resources, 'Gimmick001_01', 'ID11 리소스');

        const def2 = getBlockType(15); // 거대상자1
        assertEqual(def2.resources, 'Gimmick011_Safe_05', 'ID15 리소스');

        const def3 = getBlockType(14); // 곰인형
        assertEqual(def3.resources, 'Gimmick015_Body_01', 'ID14 리소스');
    });

    // ========================================
    // 이동 제한 (낙하/스왑 차단)
    // ========================================

    test('낙하: immovable 블록형 기믹은 낙하 안 함', () => {
        const board = new Board(8, 8);
        const gh = new GravityHandler(board);

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                board.removeBlock(row, col);
            }
        }

        board.placeGimmick(11, 3, 0); // 가방1 (immovable)

        const falls = gh.calculateFalls();
        const fallsInCol0 = falls.filter(f => f.col === 0);
        assertEqual(fallsInCol0.length, 0, 'immovable 기믹은 낙하 안 함');
    });

    test('낙하: 곰인형(gravity=true)은 정상 낙하', () => {
        const board = new Board(8, 8);
        const gh = new GravityHandler(board);

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                board.removeBlock(row, col);
            }
        }

        const bear = createBlock(14, 2, 0); // 곰인형
        board.setBlock(2, 0, bear);

        const falls = gh.calculateFalls();
        const fallsInCol0 = falls.filter(f => f.col === 0);
        assertTrue(fallsInCol0.length > 0, '곰인형은 낙하');
        assertEqual(fallsInCol0[0].toRow, 7, '맨 아래로 낙하');
    });

    // ========================================
    // 중복 데미지 방지
    // ========================================

    test('중복방지: 같은 위치 인접 블록 여러 개 제거 시 1회만 데미지', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        setupBoard(board, [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3],
            [4, 4, 4, 4, 4, 4, 4, 4],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 1, 1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2, 2, 2, 2],
            [3, 3, 3, 3, 3, 3, 3, 3]
        ]);

        board.placeGimmick(12, 3, 3); // 가방2 HP=2

        // (3,2)와 (3,4) 동시 제거 → (3,3)에 인접 2곳이지만 processed Set으로 1회만
        const result = gm.processAdjacentDamage([
            { row: 3, col: 2 },
            { row: 3, col: 4 }
        ]);

        const block = board.getBlock(3, 3);
        assertTrue(block !== null, '블록 유지');
        assertEqual(block.hp, 1, 'HP 2→1 (1회만 데미지)');
    });

    // ========================================
    // 빈 보드 엣지케이스
    // ========================================

    test('빈 보드: processAdjacentDamage → 빈 결과', () => {
        const board = new Board(8, 8);
        const gm = new GimmickManager(board);
        registerAllGimmickHandlers(gm);

        const result = gm.processAdjacentDamage([{ row: 3, col: 3 }]);
        assertEqual(result.damaged.length, 0, '빈 보드 데미지 없음');
        assertEqual(result.destroyed.length, 0, '빈 보드 파괴 없음');
    });

    // ========================================
    // 결과 출력
    // ========================================

    console.log('\n========================================');
    console.log('  테스트 결과');
    console.log('========================================');
    for (const r of testResults) {
        console.log(`  ${r.status} ${r.name}`);
        if (r.error) {
            console.log(`     → ${r.error}`);
        }
    }
    console.log(`\n  총 ${passed + failed}개 중 ${passed}개 통과, ${failed}개 실패`);
    console.log('========================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('테스트 실행 오류:', err);
    process.exit(1);
});
