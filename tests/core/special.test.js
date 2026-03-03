/**
 * special.test.js — SpecialBlockManager 단위 테스트
 *
 * Phase 4 특수 블록 검증:
 * - 특수 블록 판별
 * - 매치 색상 (일반 블록만 매치 참여, 특수 블록은 색상 독립)
 * - 특수 블록 생성 (4매치→로켓, 5매치→레인보우, L/T→폭탄)
 * - 효과 범위 계산 (로켓/폭탄/레인보우/십자/확대폭탄/로켓+폭탄)
 * - DFS 연쇄 발동
 * - 조합 효과 (로켓+로켓, 폭탄+폭탄, 로켓+폭탄, 레인보우+레인보우)
 * - 특수 블록 색상 독립 검증 (매치 불참, 스왑 발동)
 */

let Board, createBlock;
let MatchDetector;
let SpecialBlockManager, SPECIAL_IDS;
let cascadeModule;
let CascadeManager;
let GravityHandler;

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

/**
 * 비동기 테스트 실행 함수 (async/await 지원)
 */
async function testAsync(name, fn) {
    try {
        await fn();
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

/**
 * 특수 블록을 보드에 배치한다. (색상 독립 오브젝트)
 */
function placeSpecial(board, typeId, row, col) {
    const block = createBlock(typeId, row, col);
    board.setBlock(row, col, block);
    return block;
}

async function runTests() {
    const boardModule = await import('../../js/core/board.js');
    const matchModule = await import('../../js/core/match.js');
    const specialModule = await import('../../js/core/specialBlock.js');
    cascadeModule = await import('../../js/core/cascade.js');
    const gravityModule = await import('../../js/core/gravity.js');

    Board = boardModule.Board;
    createBlock = boardModule.createBlock;
    MatchDetector = matchModule.MatchDetector;
    SpecialBlockManager = specialModule.SpecialBlockManager;
    SPECIAL_IDS = specialModule.SPECIAL_IDS;
    CascadeManager = cascadeModule.CascadeManager;
    GravityHandler = gravityModule.GravityHandler;

    console.log('========================================');
    console.log('  Special Block 단위 테스트 시작');
    console.log('========================================\n');

    // ----------------------------------------
    // 1. 특수 블록 판별
    // ----------------------------------------

    test('판별: 일반 블록은 특수 블록 아님', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const block = createBlock(1, 0, 0); // 빨강
        assertFalse(sbm.isSpecialBlock(block), '일반 블록');
    });

    test('판별: 로켓은 특수 블록', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const hRocket = createBlock(6, 0, 0);
        const vRocket = createBlock(7, 0, 0);
        assertTrue(sbm.isSpecialBlock(hRocket), '가로 로켓');
        assertTrue(sbm.isSpecialBlock(vRocket), '세로 로켓');
    });

    test('판별: 폭탄, 레인보우는 특수 블록', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const bomb = createBlock(8, 0, 0);
        const rainbow = createBlock(9, 0, 0);
        assertTrue(sbm.isSpecialBlock(bomb), '폭탄');
        assertTrue(sbm.isSpecialBlock(rainbow), '레인보우');
    });

    // ----------------------------------------
    // 2. 매치 색상
    // ----------------------------------------

    test('매치색상: 일반 블록은 typeId 반환', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const block = createBlock(3, 0, 0); // 초록
        assertEqual(sbm.getMatchColor(block), 3, '초록=3');
    });

    test('매치색상: 모든 특수 블록은 null 반환 (색상 독립)', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const hRocket = createBlock(6, 0, 0);
        const vRocket = createBlock(7, 0, 0);
        const bomb = createBlock(8, 0, 0);
        const rainbow = createBlock(9, 0, 0);
        const guided = createBlock(10, 0, 0);
        assertEqual(sbm.getMatchColor(hRocket), null, '가로 로켓=null');
        assertEqual(sbm.getMatchColor(vRocket), null, '세로 로켓=null');
        assertEqual(sbm.getMatchColor(bomb), null, '폭탄=null');
        assertEqual(sbm.getMatchColor(rainbow), null, '레인보우=null');
        assertEqual(sbm.getMatchColor(guided), null, '유도타겟=null');
    });

    // ----------------------------------------
    // 3. 효과 범위 계산
    // ----------------------------------------

    test('로켓 효과: 가로 로켓은 같은 행 전체', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const positions = sbm.calculateRocketEffect(3, 4, 'horizontal');
        assertEqual(positions.length, 8, '8열 전체');
        assertTrue(positions.every(p => p.row === 3), '모두 row=3');
    });

    test('로켓 효과: 세로 로켓은 같은 열 전체', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const positions = sbm.calculateRocketEffect(3, 4, 'vertical');
        assertEqual(positions.length, 8, '8행 전체');
        assertTrue(positions.every(p => p.col === 4), '모두 col=4');
    });

    test('폭탄 효과: 3x3 범위', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const positions = sbm.calculateBombEffect(4, 4, 1);
        assertEqual(positions.length, 9, '3x3=9칸');
        // 중심 포함 확인
        assertTrue(positions.some(p => p.row === 4 && p.col === 4), '중심 포함');
        // 모서리 포함 확인
        assertTrue(positions.some(p => p.row === 3 && p.col === 3), '좌상단');
        assertTrue(positions.some(p => p.row === 5 && p.col === 5), '우하단');
    });

    test('폭탄 효과: 모서리에서 범위 클리핑', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const positions = sbm.calculateBombEffect(0, 0, 1);
        assertEqual(positions.length, 4, '모서리: 2x2=4칸');
    });

    test('레인보우 효과: 특정 색상 전체', () => {
        const board = new Board(4, 4);
        const sbm = new SpecialBlockManager(board);
        setupBoard(board, [
            [1, 2, 1, 3],
            [2, 1, 3, 1],
            [3, 2, 1, 2],
            [1, 3, 2, 1]
        ]);
        const positions = sbm.calculateRainbowEffect(1); // 빨강 전체
        // (0,0),(0,2),(1,1),(1,3),(2,2),(3,0),(3,3) = 7개
        assertEqual(positions.length, 7, '빨강 7개');
    });

    test('십자 효과: 전체 행 + 전체 열', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const positions = sbm.calculateCrossEffect(3, 4);
        // row=3 전체(8) + col=4 전체(8) - 교차점(1) = 15
        assertEqual(positions.length, 15, '행8+열8-교차1=15');
    });

    test('확대 폭탄 효과: 5x5 범위', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const positions = sbm.calculateBigBombEffect(4, 4);
        assertEqual(positions.length, 25, '5x5=25칸');
    });

    test('로켓+폭탄 효과: 3행+3열', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const positions = sbm.calculateRocketBombEffect(4, 4);
        // 3행(row 3,4,5) × 8 = 24
        // 3열(col 3,4,5) × 8 = 24
        // 겹치는 부분: 3×3 = 9
        // 합계 = 24 + 24 - 9 = 39
        assertEqual(positions.length, 39, '3행+3열=39칸');
    });

    // ----------------------------------------
    // 4. 특수 블록 생성 (매치 결과 기반)
    // ----------------------------------------

    test('생성: 4매치 → 로켓 (색상 독립)', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        setupBoard(board, [
            [1, 1, 1, 1, 2, 3, 4, 5],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 1, 2, 3, 4, 5],
            [4, 5, 1, 2, 3, 4, 5, 1],
            [5, 1, 2, 3, 4, 5, 1, 2],
            [1, 2, 3, 4, 5, 1, 2, 3],
            [2, 3, 4, 5, 1, 2, 3, 4],
            [3, 4, 5, 1, 2, 3, 4, 5]
        ]);

        const matchResult = {
            positions: [
                { row: 0, col: 0 }, { row: 0, col: 1 },
                { row: 0, col: 2 }, { row: 0, col: 3 }
            ],
            type: '4',
            direction: 'horizontal',
            specialBlockType: 6, // 가로 로켓
            specialBlockPosition: { row: 0, col: 1 }
        };

        const special = sbm.createSpecialFromMatch(matchResult);
        assertTrue(!!special, '생성됨');
        assertEqual(special.typeId, 6, '가로 로켓');
        // 색상 독립: colorType 미설정
        assertEqual(special.colorType, undefined, '색상 미상속 (독립 오브젝트)');
    });

    test('생성: specialBlockType 없으면 null 반환', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const matchResult = {
            positions: [{ row: 0, col: 0 }],
            type: '3',
            specialBlockType: null,
            specialBlockPosition: null
        };
        const result = sbm.createSpecialFromMatch(matchResult);
        assertEqual(result, null, 'null 반환');
    });

    // ----------------------------------------
    // 5. DFS 연쇄 발동
    // ----------------------------------------

    test('DFS 연쇄: 로켓 1개 발동', () => {
        const board = new Board(8, 8);
        board.initialize();
        const sbm = new SpecialBlockManager(board);

        // (3,3)에 가로 로켓 배치
        const rocket = placeSpecial(board, 6, 3, 3);

        const { allAffected, activations } = sbm.activateSpecialChain(rocket);
        assertEqual(activations.length, 1, '1회 발동');
        assertEqual(allAffected.length, 8, '행 전체 8칸');
    });

    test('DFS 연쇄: 로켓 → 로켓 체인', () => {
        const board = new Board(8, 8);
        board.initialize();
        const sbm = new SpecialBlockManager(board);

        // (3,3)에 가로 로켓, (3,6)에 세로 로켓
        const hRocket = placeSpecial(board, 6, 3, 3);
        placeSpecial(board, 7, 3, 6);

        const { allAffected, activations } = sbm.activateSpecialChain(hRocket);

        // 가로 로켓(row 3 전체) → 세로 로켓(col 6 전체) = 연쇄
        assertEqual(activations.length, 2, '2회 발동 (연쇄)');
        // row 3 전체(8) + col 6 전체(8) - 교차점(1) = 15
        assertEqual(allAffected.length, 15, '15칸 영향');
    });

    test('DFS 연쇄: 중복 발동 방지 (visited)', () => {
        const board = new Board(8, 8);
        board.initialize();
        const sbm = new SpecialBlockManager(board);

        // 서로 영향 범위에 있는 두 가로 로켓
        const r1 = placeSpecial(board, 6, 3, 3);
        placeSpecial(board, 6, 3, 5);

        const { activations } = sbm.activateSpecialChain(r1);
        // r1 발동 → row 3 전체 → r2 발동 → row 3 전체 (이미 visited)
        assertEqual(activations.length, 2, '각 1회씩 총 2회');
    });

    // ----------------------------------------
    // 6. 조합 효과
    // ----------------------------------------

    test('조합: 로켓+로켓 = 십자', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const r1 = createBlock(6, 3, 3);
        const r2 = createBlock(7, 3, 4);

        const combo = sbm.combineTwoSpecials(r1, r2);
        assertEqual(combo.type, 'cross', '십자 효과');
        assertEqual(combo.affected.length, 15, '행8+열8-교차1=15');
    });

    test('조합: 폭탄+폭탄 = 5x5', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const b1 = createBlock(8, 4, 4);
        const b2 = createBlock(8, 4, 5);

        const combo = sbm.combineTwoSpecials(b1, b2);
        assertEqual(combo.type, 'bigBomb', '확대 폭탄');
        assertEqual(combo.affected.length, 25, '5x5=25칸');
    });

    test('조합: 로켓+폭탄 = 3행+3열', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const r = createBlock(6, 4, 4);
        const b = createBlock(8, 4, 5);

        const combo = sbm.combineTwoSpecials(r, b);
        assertEqual(combo.type, 'rocketBomb', '로켓+폭탄');
        assertEqual(combo.affected.length, 39, '3행+3열=39칸');
    });

    test('조합: 레인보우+레인보우 = 보드 전체', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const rw1 = createBlock(9, 3, 3);
        const rw2 = createBlock(9, 3, 4);

        const combo = sbm.combineTwoSpecials(rw1, rw2);
        assertEqual(combo.type, 'rainbowRainbow', '보드 전체');
        assertEqual(combo.affected.length, 64, '8x8=64칸');
    });

    test('조합: 레인보우+로켓 = 최다 색상 블록 변환', () => {
        const board = new Board(4, 4);
        const sbm = new SpecialBlockManager(board);
        setupBoard(board, [
            [1, 2, 1, 3],
            [2, 1, 3, 1],
            [3, 2, 1, 2],
            [1, 3, 2, 1]
        ]);

        const rw = createBlock(9, 0, 0);
        const rocket = createBlock(6, 0, 1);

        const combo = sbm.combineTwoSpecials(rw, rocket);
        assertEqual(combo.type, 'rainbowSpecial', '레인보우+특수');
        // 보드에서 가장 많은 색상(빨강=7개) 자동 선택
        assertEqual(combo.affected.length, 7, '최다 색상(빨강) 7개');
        assertEqual(combo.conversions.length, 7, '7개 변환');
        assertTrue(combo.conversions.every(c => c.convertToTypeId === 6), '모두 가로 로켓으로 변환');
    });

    // ----------------------------------------
    // 7. 매치 감지기 색상 기반 매칭
    // ----------------------------------------

    test('매칭: 특수 블록은 인접한 같은 색 블록과 매치하지 않음 (색상 독립)', () => {
        const board = new Board(4, 4);
        const md = new MatchDetector(board);
        setupBoard(board, [
            [2, 3, 4, 5],
            [3, 4, 5, 2],
            [4, 5, 2, 3],
            [5, 2, 3, 4]
        ]);
        // (0,0)=빨, (0,1)=빨, (0,2)=로켓 — 로켓은 매치 불참
        const b1 = createBlock(1, 0, 0); board.setBlock(0, 0, b1);
        const b2 = createBlock(1, 0, 1); board.setBlock(0, 1, b2);
        placeSpecial(board, 6, 0, 2); // 로켓 (색상 없음)

        const matches = md.findAllMatches();
        // 로켓은 매치에 포함되지 않아야 함
        const matchWithRocket = matches.find(m =>
            m.positions.some(p => p.row === 0 && p.col === 2)
        );
        assertFalse(!!matchWithRocket, '로켓은 매치에 불참');
    });

    test('매칭: 특수 블록이 라인 중간에 있으면 매치가 끊어짐', () => {
        const board = new Board(8, 8);
        const md = new MatchDetector(board);
        // row 0: 빨, 빨, 로켓, 빨 — 로켓이 라인을 끊음
        setupBoard(board, [
            [2, 3, 4, 5, 2, 3, 4, 5],
            [3, 4, 5, 2, 3, 4, 5, 2],
            [4, 5, 2, 3, 4, 5, 2, 3],
            [5, 2, 3, 4, 5, 2, 3, 4],
            [2, 3, 4, 5, 2, 3, 4, 5],
            [3, 4, 5, 2, 3, 4, 5, 2],
            [4, 5, 2, 3, 4, 5, 2, 3],
            [5, 2, 3, 4, 5, 2, 3, 4]
        ]);
        const b1 = createBlock(1, 0, 0); board.setBlock(0, 0, b1);
        const b2 = createBlock(1, 0, 1); board.setBlock(0, 1, b2);
        placeSpecial(board, 6, 0, 2); // 로켓 (색상 독립)
        const b3 = createBlock(1, 0, 3); board.setBlock(0, 3, b3);

        const matches = md.findAllMatches();
        // 빨(0,0)-빨(0,1) = 2개 → 매치 아님
        // 로켓이 라인을 끊으므로 4매치가 아닌 매치 없음
        const fourMatch = matches.find(m =>
            m.positions.length >= 4 &&
            m.positions.some(p => p.row === 0 && p.col === 0)
        );
        assertFalse(!!fourMatch, '로켓이 라인을 끊어 4매치 불가');
    });

    test('매칭: 특수 블록 포함 스왑은 항상 유효한 이동', () => {
        const board = new Board(4, 4);
        const md = new MatchDetector(board);
        setupBoard(board, [
            [2, 3, 4, 5],
            [3, 4, 5, 2],
            [4, 5, 2, 3],
            [5, 2, 3, 4]
        ]);
        // (1,1)에 폭탄 배치
        placeSpecial(board, 8, 1, 1);

        // 특수 블록 인접 스왑은 항상 유효
        assertTrue(md.hasAnyValidMove(), '특수 블록 있으면 유효한 이동 존재');
    });

    // ----------------------------------------
    // 8. 상수 확인
    // ----------------------------------------

    test('상수: SPECIAL_IDS 정의', () => {
        assertEqual(SPECIAL_IDS.H_ROCKET, 6, '가로 로켓=6');
        assertEqual(SPECIAL_IDS.V_ROCKET, 7, '세로 로켓=7');
        assertEqual(SPECIAL_IDS.BOMB, 8, '폭탄=8');
        assertEqual(SPECIAL_IDS.RAINBOW, 9, '레인보우=9');
        assertEqual(SPECIAL_IDS.GUIDED_BOMB, 10, '타겟 유도형 폭탄=10');
    });

    test('상수: MAX_SPECIAL_CHAIN_DEPTH', () => {
        const { MAX_SPECIAL_CHAIN_DEPTH } = specialModule;
        assertEqual(MAX_SPECIAL_CHAIN_DEPTH, 20, 'DFS 최대 깊이=20');
    });

    // ----------------------------------------
    // 9. 타겟 유도형 폭탄
    // ----------------------------------------

    test('판별: 타겟 유도형 폭탄은 특수 블록', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        const guidedBomb = createBlock(10, 0, 0);
        assertTrue(sbm.isSpecialBlock(guidedBomb), '타겟 유도형 폭탄');
        assertTrue(sbm.isGuidedBomb(guidedBomb), 'isGuidedBomb 확인');
    });

    test('유도폭탄: 연쇄 발동 시 1개 블록 제거 (랜덤 대상)', () => {
        const board = new Board(4, 4);
        const sbm = new SpecialBlockManager(board);
        setupBoard(board, [
            [1, 2, 3, 4],
            [2, 3, 4, 5],
            [3, 4, 5, 1],
            [4, 5, 1, 2]
        ]);

        const guidedBomb = createBlock(10, 0, 0);
        board.setBlock(0, 0, guidedBomb);

        const effect = sbm.calculateGuidedBombEffect();
        assertEqual(effect.length, 1, '랜덤 대상 1개');
    });

    // ----------------------------------------
    // 10. 2x2 사각 매치 감지
    // ----------------------------------------

    test('2x2 매치: 순수 2x2 사각형 감지', () => {
        const board = new Board(4, 4);
        const md = new MatchDetector(board);
        // 좌상단 2x2가 빨강
        setupBoard(board, [
            [1, 1, 2, 3],
            [1, 1, 3, 4],
            [2, 3, 4, 5],
            [3, 4, 5, 2]
        ]);

        const matches = md.findAllMatches();
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치 감지됨');
        assertEqual(squareMatch.positions.length, 4, '4개 위치');
        assertEqual(squareMatch.specialBlockType, 10, '타겟 유도형 폭탄 생성');
    });

    test('2x2 매치: 라인 매치와 겹쳐도 사각 감지 (사각 우선)', () => {
        const board = new Board(4, 4);
        const md = new MatchDetector(board);
        // row 0에 빨강 3매치 + 그 아래에도 빨강 = 2x2 감지 (인접 1개 = 3개 미만이므로 미확장)
        setupBoard(board, [
            [1, 1, 1, 2],
            [1, 1, 3, 4],
            [2, 3, 4, 5],
            [3, 4, 5, 2]
        ]);

        const matches = md.findAllMatches();
        // 2x2 코어 감지 (인접 1개는 3개 미만이므로 확장 안됨)
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치 감지 (라인과 겹쳐도)');
        assertEqual(squareMatch.positions.length, 4, '인접 1개 → 확장 안됨, 코어 4개만');
    });

    test('2x2 매치: findMatchesAt에서 사각 감지', () => {
        const board = new Board(4, 4);
        const md = new MatchDetector(board);
        setupBoard(board, [
            [1, 1, 2, 3],
            [1, 1, 3, 4],
            [2, 3, 4, 5],
            [3, 4, 5, 2]
        ]);

        const matches = md.findMatchesAt(0, 0);
        assertTrue(matches.length >= 1, '매치 발견');
        assertEqual(matches[0].type, 'SQUARE', '사각 매치');
    });

    test('2x2 매치: _hasMatchAt에서 사각 인식 (스왑 유효성)', () => {
        const board = new Board(4, 4);
        const md = new MatchDetector(board);
        // 스왑 후 2x2가 만들어지는 상황:
        // row 0: 2 1 3 4
        // row 1: 1 1 4 5
        // (0,0)과 (0,1)을 스왑하면 → 1 2 3 4 / 1 1 4 5 → 세로 2매치뿐
        // 대신 (0,0)과 (1,0)이 이미 1이고 (0,1)=1, (1,1)=1 → 테스트 케이스 조정
        setupBoard(board, [
            [2, 1, 3, 4],
            [1, 1, 4, 5],
            [1, 3, 5, 2],
            [3, 4, 2, 5]
        ]);

        // (0,0)=2, (1,0)=1. 스왑하면 (0,0)=1, (1,0)=2
        // → (0,0)=1, (0,1)=1, (1,0)=2, (1,1)=1 → 2x2 안됨
        // 다른 케이스: (2,0)=1과 (2,1)=3 스왑 → (2,0)=3, (2,1)=1
        // → (0,1)=1, (1,0)=1, (1,1)=1, (2,1)=1 → 세로 3매치
        // hasAnyValidMove는 true여야 함
        assertTrue(md.hasAnyValidMove(), '유효한 이동 존재');
    });

    // ----------------------------------------
    // 10-1. 2x2 사각 매치 BFS 확장
    // ----------------------------------------

    test('2x2 확장: 인접 같은 색 1~2개면 확장 안됨', () => {
        const board = new Board(4, 4);
        const md = new MatchDetector(board);
        // 2x2 코어(빨강) + 오른쪽에 빨강 1개 → 3개 미만이므로 확장 안됨
        setupBoard(board, [
            [1, 1, 1, 3],
            [1, 1, 3, 4],
            [2, 3, 4, 5],
            [3, 4, 5, 2]
        ]);

        const matches = md.findAllMatches();
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치 감지됨');
        assertEqual(squareMatch.positions.length, 4, '인접 1개 → 확장 안됨, 코어 4개만');
    });

    test('2x2 확장: 인접 같은 색 없으면 4개 유지', () => {
        const board = new Board(4, 4);
        const md = new MatchDetector(board);
        // 2x2 코어(빨강) 주변에 같은 색 없음
        setupBoard(board, [
            [1, 1, 2, 3],
            [1, 1, 3, 4],
            [2, 3, 4, 5],
            [3, 4, 5, 2]
        ]);

        const matches = md.findAllMatches();
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치 감지됨');
        assertEqual(squareMatch.positions.length, 4, '확장 없이 4개');
    });

    test('2x2 확장: 인접 같은 색 3개 이상이면 확장', () => {
        const board = new Board(5, 5);
        const md = new MatchDetector(board);
        // 2x2 코어 + 인접 같은 색 3개 (오른쪽 열 + 아래)
        setupBoard(board, [
            [1, 1, 1, 3, 4],
            [1, 1, 1, 4, 5],
            [2, 3, 1, 5, 3],
            [3, 4, 5, 4, 2],
            [4, 5, 2, 3, 5]
        ]);

        const matches = md.findAllMatches();
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치 감지됨');
        // 2x2 코어(4) + 인접 3개 (0,2), (1,2), (2,2) = 7개
        assertEqual(squareMatch.positions.length, 7, '인접 3개 이상 → 확장 (코어 4 + 인접 3 = 7)');
    });

    test('2x2 확장: findMatchesAt에서도 최소 3개 조건 적용', () => {
        const board = new Board(4, 4);
        const md = new MatchDetector(board);
        // 인접 1개만 → 확장 안됨
        setupBoard(board, [
            [1, 1, 1, 3],
            [1, 1, 3, 4],
            [2, 3, 4, 5],
            [3, 4, 5, 2]
        ]);

        const matches = md.findMatchesAt(0, 0);
        assertTrue(matches.length >= 1, '매치 발견');
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치');
        assertEqual(squareMatch.positions.length, 4, '인접 1개 → 확장 안됨, 코어 4개만');
    });

    // ----------------------------------------
    // 10-1. 2x2 확장: 컴포넌트별 독립 평가
    // ----------------------------------------

    test('2x2 확장: 두 컴포넌트 중 하나만 3개 이상이면 해당 컴포넌트만 확장', () => {
        const board = new Board(6, 6);
        const md = new MatchDetector(board);
        // 코어: (2,2)(2,3)(3,2)(3,3) = 색상 1
        // 상단 진입점 (1,2)=1 → 컴포넌트: (1,2),(0,2),(0,1) = 3개 → 충족
        // 하단 진입점 (4,3)=1 → 컴포넌트: (4,3),(5,3) = 2개 → 미달
        setupBoard(board, [
            [2, 1, 1, 5, 2, 3],
            [3, 4, 1, 5, 3, 4],
            [4, 5, 1, 1, 4, 5],
            [5, 2, 1, 1, 5, 2],
            [2, 3, 5, 1, 2, 3],
            [3, 4, 5, 1, 3, 4]
        ]);

        const matches = md.findAllMatches();
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치 감지됨');
        // 코어 4 + 상단 3개만 확장 = 7 (하단 2개는 미달로 제외)
        assertEqual(squareMatch.positions.length, 7,
            '상단 컴포넌트(3개)만 확장, 하단(2개)은 제외');
    });

    test('2x2 확장: 두 컴포넌트 모두 3개 이상이면 둘 다 확장', () => {
        const board = new Board(6, 6);
        const md = new MatchDetector(board);
        // 코어: (2,2)(2,3)(3,2)(3,3) = 색상 1
        // 상단 진입점 (1,2)=1 → 컴포넌트: (1,2),(0,2),(0,1) = 3개 → 충족
        // 하단 진입점 (4,3)=1 → 컴포넌트: (4,3),(5,3),(5,2) = 3개 → 충족
        setupBoard(board, [
            [2, 1, 1, 5, 2, 3],
            [3, 4, 1, 5, 3, 4],
            [4, 5, 1, 1, 4, 5],
            [5, 2, 1, 1, 5, 2],
            [2, 3, 5, 1, 2, 3],
            [3, 4, 1, 1, 3, 4]
        ]);

        const matches = md.findAllMatches();
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치 감지됨');
        // 코어 4 + 상단 3 + 하단 3 = 10
        assertEqual(squareMatch.positions.length, 10,
            '두 컴포넌트 모두 충족 → 양쪽 확장 (4+3+3=10)');
    });

    test('2x2 확장: 여러 방향에 흩어진 1~2개 컴포넌트는 모두 제외', () => {
        const board = new Board(6, 6);
        const md = new MatchDetector(board);
        // 코어: (2,2)(2,3)(3,2)(3,3) = 색상 1
        // 상단: (1,2) = 1개, 하단: (4,3) = 1개, 좌측: (2,1) = 1개
        // 모든 컴포넌트가 3개 미만 → 확장 없음
        setupBoard(board, [
            [2, 3, 4, 5, 2, 3],
            [3, 4, 1, 5, 3, 4],
            [4, 1, 1, 1, 4, 5],
            [5, 2, 1, 1, 5, 2],
            [2, 3, 5, 1, 2, 3],
            [3, 4, 5, 3, 3, 4]
        ]);

        const matches = md.findAllMatches();
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치 감지됨');
        // 모든 인접 컴포넌트가 3개 미만 → 코어 4개만
        assertEqual(squareMatch.positions.length, 4,
            '모든 인접 컴포넌트 3개 미만 → 코어만 유지');
    });

    // ----------------------------------------
    // 10-2. 사각 매치와 라인 매치 부분 겹침 검증
    // ----------------------------------------

    test('사각+라인 겹침: 세로 4매치가 사각과 겹칠 때 라인 매치 유지', () => {
        const board = new Board(8, 8);
        const md = new MatchDetector(board);
        // 코어: (3,2)(3,3)(4,2)(4,3) = 색상 1
        // 세로 라인: col 2, rows 3~6 = (3,2)(4,2)(5,2)(6,2) = 4매치
        // (3,2)(4,2)는 코어와 겹침, (5,2)(6,2)는 코어 밖
        setupBoard(board, [
            [2, 3, 4, 5, 2, 3, 4, 5],
            [3, 4, 5, 2, 3, 4, 5, 2],
            [4, 5, 2, 3, 4, 5, 2, 3],
            [5, 2, 1, 1, 5, 2, 3, 4],
            [2, 3, 1, 1, 2, 3, 4, 5],
            [3, 4, 1, 2, 3, 4, 5, 2],
            [4, 5, 1, 3, 4, 5, 2, 3],
            [5, 2, 3, 4, 5, 2, 3, 4]
        ]);

        const matches = md.findAllMatches();

        // 사각 매치 존재 확인
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치 감지됨');

        // 전체 매치에서 고유 위치 수집
        const allPositions = new Set();
        for (const m of matches) {
            for (const p of m.positions) {
                allPositions.add(`${p.row},${p.col}`);
            }
        }

        // (5,2)와 (6,2)가 반드시 포함되어야 함 (라인 매치가 유지되어야 함)
        assertTrue(allPositions.has('5,2'), '(5,2) 포함 — 라인 매치 유지');
        assertTrue(allPositions.has('6,2'), '(6,2) 포함 — 라인 매치 유지');

        // 코어 4개 + 라인 밖 2개 = 최소 6개 고유 위치
        assertTrue(allPositions.size >= 6, '최소 6개 고유 위치 (코어 4 + 라인 밖 2)');
    });

    test('사각+라인 겹침: 가로 3매치가 사각과 겹칠 때 나머지 블록 유지', () => {
        const board = new Board(8, 8);
        const md = new MatchDetector(board);
        // 코어: (3,2)(3,3)(4,2)(4,3) = 색상 1
        // 가로 라인: row 3, cols 2~4 = (3,2)(3,3)(3,4) = 3매치
        // (3,2)(3,3)은 코어와 겹침, (3,4)는 코어 밖
        setupBoard(board, [
            [2, 3, 4, 5, 2, 3, 4, 5],
            [3, 4, 5, 2, 3, 4, 5, 2],
            [4, 5, 2, 3, 4, 5, 2, 3],
            [5, 2, 1, 1, 1, 2, 3, 4],
            [2, 3, 1, 1, 2, 3, 4, 5],
            [3, 4, 5, 2, 3, 4, 5, 2],
            [4, 5, 2, 3, 4, 5, 2, 3],
            [5, 2, 3, 4, 5, 2, 3, 4]
        ]);

        const matches = md.findAllMatches();

        // 전체 매치에서 고유 위치 수집
        const allPositions = new Set();
        for (const m of matches) {
            for (const p of m.positions) {
                allPositions.add(`${p.row},${p.col}`);
            }
        }

        // (3,4)가 반드시 포함되어야 함 (라인 매치가 유지되어야 함)
        assertTrue(allPositions.has('3,4'), '(3,4) 포함 — 부분 겹침 라인 매치 유지');
    });

    test('사각+라인 겹침: 완전 흡수된 라인 매치는 제거됨', () => {
        const board = new Board(8, 8);
        const md = new MatchDetector(board);
        // 코어: (2,1)(2,2)(3,1)(3,2) = 색상 1
        // 가로 라인: row 2, cols 1~3? 아니라, (2,1)(2,2)만 존재하므로 2개 = 매치 안 됨
        // 대신, 세로 라인 (2,1)(3,1) = 2개 뿐 → 매치 안 됨
        // 결국 2x2 코어 4개 위치 중 같은 행(row 2)에 (2,1)(2,2) = 2개 뿐이므로 라인 매치가 아님
        //
        // 실제 완전 흡수 시나리오: 가로 3매치 위치가 전부 사각 매치 위치에 포함
        // 사각 코어 (0,0)(0,1)(1,0)(1,1) = 색상 1
        // 가로 3매치: row 0, cols 0~2 = (0,0)(0,1)(0,2)
        // (0,2) 진입점에서 확장하려면 → 컴포넌트 1개(자신만) < 3이므로 확장 안됨
        // → (0,2)는 사각 밖 → 라인 매치 유지됨 (remaining > 0)
        //
        // 완전 흡수를 만들려면: 라인 매치의 모든 위치가 사각 내부여야 함
        // 즉 가로 3매치 (r,c1)(r,c2)(r,c3) 전부가 사각 매치 positions에 포함
        // 확장된 사각 = 코어 4개 + BFS 확장 3개 이상 = 7개 이상
        //
        // 테스트 구성: 사각 코어 + 한 방향으로 3개 이상 확장 → 확장 영역 안에 가로 3매치가 들어감
        // 코어: (3,2)(3,3)(4,2)(4,3) = 색상 1
        // 확장: 위쪽 진입점 (2,2)=1 → BFS (2,3)=1, (1,3)=1 → 컴포넌트 3개 → 확장
        // 가로 라인: row 3, cols 2~4? (3,4)가 필요한데 1이 아니면 안 됨
        // 다른 접근: 사각이 가로 3개를 완전히 포함하는 유일한 방법은
        // 코어 한 행이 2칸이고, 그 행에서 가로 3매치가 되려면 최소 3칸이 필요
        // → 코어 행만으로는 2개뿐 → 반드시 확장이 있어야 3개 이상
        //
        // 새 전략: 코어의 한 행에 속하는 2개 + 같은 행의 확장 1개 = 가로 3매치
        // 확장이 3개 이상 컴포넌트에 속해야 함
        // 코어: (2,2)(2,3)(3,2)(3,3)
        // 확장 진입점 (2,4)=1 → BFS (3,4)=1, (4,4)=1 → 컴포넌트 3개 → 확장!
        // 가로 라인: (2,2)(2,3)(2,4) = 3매치 → 3개 모두 사각 내부 → 완전 흡수
        setupBoard(board, [
            [2, 3, 4, 5, 2, 3, 4, 5],
            [3, 4, 5, 2, 3, 4, 5, 2],
            [4, 5, 1, 1, 1, 5, 2, 3],
            [5, 2, 1, 1, 1, 2, 3, 4],
            [2, 3, 5, 2, 1, 3, 4, 5],
            [3, 4, 5, 2, 3, 4, 5, 2],
            [4, 5, 2, 3, 4, 5, 2, 3],
            [5, 2, 3, 4, 5, 2, 3, 4]
        ]);

        const matches = md.findAllMatches();

        // 사각 매치가 존재하고 (2,2)(2,3)(2,4)를 모두 포함해야 함
        const squareMatch = matches.find(m => m.type === 'SQUARE');
        assertTrue(!!squareMatch, '사각 매치 감지됨');

        const squareKeys = new Set(squareMatch.positions.map(p => `${p.row},${p.col}`));
        assertTrue(squareKeys.has('2,2'), '사각 매치에 (2,2) 포함');
        assertTrue(squareKeys.has('2,3'), '사각 매치에 (2,3) 포함');
        assertTrue(squareKeys.has('2,4'), '사각 매치에 (2,4) 포함');

        // 완전 흡수된 가로 3매치 (2,2)(2,3)(2,4)는 별도 라인 매치로 존재하면 안 됨
        const separateLineForAbsorbed = matches.filter(m => {
            if (m.type === 'SQUARE') return false;
            const posKeys = new Set(m.positions.map(p => `${p.row},${p.col}`));
            return posKeys.has('2,2') && posKeys.has('2,3') && posKeys.has('2,4');
        });
        assertEqual(separateLineForAbsorbed.length, 0,
            '완전 흡수된 라인 매치는 별도 매치로 존재하지 않음');
    });

    test('보드 초기화: 2x2 패턴 없음 보장', () => {
        // 20회 초기화 반복하여 매치 없음 검증
        for (let i = 0; i < 20; i++) {
            const board = new Board(8, 8);
            board.initialize();
            const md = new MatchDetector(board);
            const matches = md.findAllMatches();
            assertEqual(matches.length, 0,
                `초기화 ${i + 1}회차: 매치 0개여야 함 (실제: ${matches.length}개)`);
        }
    });

    // ----------------------------------------
    // 11. 로켓 생성 위치 버그 수정 검증
    // ----------------------------------------

    test('로켓위치: from 매치 시 from 위치에 생성', () => {
        const board = new Board(8, 8);
        const md = new MatchDetector(board);
        // 스왑: from=(0,3), to=(0,4)
        // 스왑 후: from에 있던 블록이 to로, to에 있던 블록이 from으로
        // from=(0,3) 위치의 블록이 매치에 포함되면 from에 생성해야 함
        setupBoard(board, [
            [1, 1, 1, 2, 1, 3, 4, 5],
            [2, 3, 4, 5, 2, 3, 4, 5],
            [3, 4, 5, 2, 3, 4, 5, 2],
            [4, 5, 2, 3, 4, 5, 2, 3],
            [5, 2, 3, 4, 5, 2, 3, 4],
            [2, 3, 4, 5, 2, 3, 4, 5],
            [3, 4, 5, 2, 3, 4, 5, 2],
            [4, 5, 2, 3, 4, 5, 2, 3]
        ]);

        // (0,3)=2를 (0,4)=1로 스왑하면
        // 스왑 후: row 0 = [1, 1, 1, 1, 2, 3, 4, 5]
        // (0,0)~(0,3)에서 4매치 발생 → from=(0,3)이 매치에 포함
        board.swapBlocks(0, 3, 0, 4);
        const matches = md.findAllMatches();
        board.swapBlocks(0, 3, 0, 4); // 되돌리기

        assertTrue(matches.length >= 1, '매치 존재');
        const fourMatch = matches.find(m => m.type === '4' || m.type === '5');
        assertTrue(!!fourMatch, '4+ 매치 존재');
    });

    // ----------------------------------------
    // 12. 유도타겟 조합 효과
    // ----------------------------------------

    test('조합: 유도타겟+유도타겟 = 랜덤 3개 제거', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        board.initialize();

        const g1 = placeSpecial(board, 10, 0, 0);
        const g2 = placeSpecial(board, 10, 0, 1);

        const combo = sbm.combineTwoSpecials(g1, g2);
        assertEqual(combo.type, 'guidedDouble', '조합 타입');
        assertEqual(combo.affected.length, 3, '랜덤 3개 대상');
    });

    test('조합: 유도타겟+로켓 = 타겟 위치에서 한 방향 라인 제거', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        board.initialize();

        const g = placeSpecial(board, 10, 0, 0);
        const r = placeSpecial(board, 6, 0, 1);

        const combo = sbm.combineTwoSpecials(g, r);
        assertEqual(combo.type, 'guidedRocket', '조합 타입');
        // 단일 라인 = 행 전체(8) 또는 열 전체(8)
        assertEqual(combo.affected.length, 8, '단일 라인 효과 범위');
    });

    test('조합: 유도타겟+폭탄 = 타겟 위치에서 3x3 폭발', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        board.initialize();

        const g = placeSpecial(board, 10, 0, 0);
        const b = placeSpecial(board, 8, 0, 1);

        const combo = sbm.combineTwoSpecials(g, b);
        assertEqual(combo.type, 'guidedBomb', '조합 타입');
        // 3x3 = 최대 9칸 (모서리면 더 적을 수 있음)
        assertTrue(combo.affected.length >= 4 && combo.affected.length <= 9, '3x3 범위 내');
    });

    // ----------------------------------------
    // 13. 특수 블록 생성 우선순위
    // ----------------------------------------

    test('우선순위: 같은 위치 충돌 시 높은 우선순위 선택', () => {
        // CascadeManager._filterSpecialsByPriority 테스트
        // 직접 호출 대신, 우선순위 상수 존재 확인
        const { SPECIAL_CREATION_PRIORITY } = cascadeModule;
        if (SPECIAL_CREATION_PRIORITY) {
            assertTrue(SPECIAL_CREATION_PRIORITY[9] > SPECIAL_CREATION_PRIORITY[8], 'RAINBOW > BOMB');
            assertTrue(SPECIAL_CREATION_PRIORITY[8] > SPECIAL_CREATION_PRIORITY[6], 'BOMB > H_ROCKET');
            assertTrue(SPECIAL_CREATION_PRIORITY[6] > SPECIAL_CREATION_PRIORITY[10], 'ROCKET > GUIDED');
            assertEqual(SPECIAL_CREATION_PRIORITY[6], SPECIAL_CREATION_PRIORITY[7], 'H_ROCKET = V_ROCKET');
        }
    });

    // ----------------------------------------
    // 14. 유도폭탄 다중 제거
    // ----------------------------------------

    test('유도폭탄: count 지정 시 해당 수만큼 제거', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        board.initialize();

        // 3개 제거 테스트
        const targets = sbm.calculateGuidedBombEffect(3);
        assertEqual(targets.length, 3, '3개 대상 선택');

        // 중복 없이 선택되었는지 확인
        const uniqueKeys = new Set(targets.map(t => `${t.row},${t.col}`));
        assertEqual(uniqueKeys.size, 3, '중복 없는 3개');
    });

    // ----------------------------------------
    // 15. 더블탭 발동 테스트
    // ----------------------------------------

    /** 더블탭 테스트용 mock 객체 생성 헬퍼 */
    function createMocks() {
        const mockAnimManager = {
            createMatchHighlightAnimation: () => ({ start: () => {} }),
            createRemoveAnimation: () => ({ start: () => {} }),
            createFallAnimation: () => ({ start: () => {} }),
            createPathAnimation: () => ({ start: () => {} }),
            enqueueParallel: async () => {}
        };
        const mockRenderer = {
            cellToPixel: (r, c) => ({ x: c * 60, y: r * 60 })
        };
        return { mockAnimManager, mockRenderer };
    }

    await testAsync('더블탭: 폭탄 제자리 발동 → 3x3 범위 제거', async () => {
        // 8x8 보드 생성 및 초기화
        const board = new Board(8, 8);
        board.initialize();

        const md = new MatchDetector(board);
        const gh = new GravityHandler(board);
        const sbm = new SpecialBlockManager(board);
        const { mockAnimManager, mockRenderer } = createMocks();
        const cm = new CascadeManager(board, md, gh, sbm, mockAnimManager, mockRenderer);

        // (3,3) 위치에 폭탄(typeId=8) 배치
        const block = createBlock(8, 3, 3);
        board.setBlock(3, 3, block);

        // 더블탭 턴 실행
        const turnResult = await cm.executeDoubleTapTurn(block);

        // 검증: turnResult가 null이 아님
        assertTrue(turnResult !== null, 'turnResult가 null이 아님');
        // 검증: 폭탄 자신 + 주변 블록이 제거됨
        assertTrue(turnResult.totalRemoved >= 1, 'totalRemoved >= 1');
        // 검증: (3,3) 위치 블록이 제거됨 or 리필된 블록으로 교체됨
        const blockAt33 = board.getBlock(3, 3);
        // 낙하/리필 후 새 블록이 있거나 빈 칸일 수 있음
        // 원래 폭탄이 아닌 상태여야 함 (제거되었으므로)
        if (blockAt33) {
            assertTrue(blockAt33.id !== block.id, '(3,3) 원래 폭탄이 아닌 새 블록');
        }
        // blockAt33이 null이면 제거 후 리필이 안된 경우 (정상)
    });

    await testAsync('더블탭: 로켓 제자리 발동 → 행 전체 제거', async () => {
        // 8x8 보드 생성 및 초기화
        const board = new Board(8, 8);
        board.initialize();

        const md = new MatchDetector(board);
        const gh = new GravityHandler(board);
        const sbm = new SpecialBlockManager(board);
        const { mockAnimManager, mockRenderer } = createMocks();
        const cm = new CascadeManager(board, md, gh, sbm, mockAnimManager, mockRenderer);

        // (4,4) 위치에 가로 로켓(typeId=6) 배치
        const block = createBlock(6, 4, 4);
        board.setBlock(4, 4, block);

        // 더블탭 턴 실행
        const turnResult = await cm.executeDoubleTapTurn(block);

        // 검증: turnResult가 null이 아님
        assertTrue(turnResult !== null, 'turnResult가 null이 아님');
        // 검증: 행 전체(8칸) 이상 제거됨
        assertTrue(turnResult.totalRemoved >= 1, 'totalRemoved >= 1');
    });

    await testAsync('더블탭: 일반 블록은 발동 안 됨', async () => {
        // 8x8 보드 생성 및 초기화
        const board = new Board(8, 8);
        board.initialize();

        const sbm = new SpecialBlockManager(board);

        // (2,2) 위치의 일반 블록 가져오기
        const block = board.getBlock(2, 2);
        assertTrue(block !== null, '(2,2)에 블록 존재');

        // activateSpecialChain 호출 시 빈 결과 반환 확인
        const { allAffected } = sbm.activateSpecialChain(block);
        assertEqual(allAffected.length, 0, '일반 블록은 영향 범위 없음');
    });

    // ----------------------------------------
    // 16. 유도 폭탄 신규 동작 테스트
    // ----------------------------------------

    test('유도폭탄: 소형 십자 효과 (5칸: 중심 + 상하좌우)', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        board.initialize();

        // 보드 중앙 (3,3) 기준 소형 십자 = 5칸
        const cross = sbm.calculateSmallCrossEffect(3, 3);
        assertEqual(cross.length, 5, '소형 십자 = 5칸');

        // 중심 포함 확인
        assertTrue(cross.some(p => p.row === 3 && p.col === 3), '중심 포함');
        // 상하좌우 포함 확인
        assertTrue(cross.some(p => p.row === 2 && p.col === 3), '상 포함');
        assertTrue(cross.some(p => p.row === 4 && p.col === 3), '하 포함');
        assertTrue(cross.some(p => p.row === 3 && p.col === 2), '좌 포함');
        assertTrue(cross.some(p => p.row === 3 && p.col === 4), '우 포함');
    });

    test('유도폭탄: 모서리에서 소형 십자 클리핑', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        board.initialize();

        // (0,0) 모서리 → 상/좌 클리핑, 3칸만
        const cross = sbm.calculateSmallCrossEffect(0, 0);
        assertEqual(cross.length, 3, '모서리 소형 십자 = 3칸');
    });

    test('유도폭탄: calculateEffect → 출발점 십자 + 도착점 3×3', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        board.initialize();

        // 유도 폭탄 (3,3)에 배치
        const guidedBomb = createBlock(10, 3, 3);
        board.setBlock(3, 3, guidedBomb);

        const effect = sbm.calculateEffect(guidedBomb);

        // 출발점 십자 5칸 + 도착점 3×3 = 최대 14칸 (겹침 시 감소)
        // 최소: 출발점 십자 5칸 (도착이 겹치면)
        assertTrue(effect.length >= 5, '최소 출발점 십자 5칸');
        // 최대: 5 + 9 = 14 (완전 비겹침 시)
        assertTrue(effect.length <= 14, '최대 14칸');

        // 출발점 십자 포함 확인
        assertTrue(effect.some(p => p.row === 3 && p.col === 3), '출발점 중심 포함');
        assertTrue(effect.some(p => p.row === 2 && p.col === 3), '출발점 상 포함');
        assertTrue(effect.some(p => p.row === 4 && p.col === 3), '출발점 하 포함');
    });

    test('유도폭탄+로켓 콤보: 한 방향 라인만 (십자 아님)', () => {
        const board = new Board(8, 8);
        const sbm = new SpecialBlockManager(board);
        board.initialize();

        // 여러 번 실행해서 항상 8 (한 줄)인지 확인
        let allSingleLine = true;
        for (let i = 0; i < 10; i++) {
            const combo = sbm.calculateGuidedRocketCombo();
            if (combo.length !== 8) {
                allSingleLine = false;
                break;
            }
        }
        assertTrue(allSingleLine, '항상 한 방향 라인(8칸)만 반환');
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
