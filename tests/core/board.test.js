/**
 * board.test.js — Board 클래스 단위 테스트
 *
 * Phase 1 코어 로직 검증:
 * - 보드 초기화
 * - 3매치 방지
 * - 타일/블록 접근
 * - 레이어 관리
 * - 유틸리티
 */

// ========================================
// ES Module 동적 임포트 (Node.js 호환)
// ========================================

let Board, createBlock, createTile, createLayer;
let getBlockType, getNormalTypes, BLOCK_TYPES;

/** 테스트 결과 카운터 */
let passed = 0;
let failed = 0;
let testResults = [];

/**
 * 단일 테스트 실행
 * @param {string} name - 테스트 이름
 * @param {Function} fn - 테스트 함수
 */
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
 * 단언: 값이 같은지 확인
 */
function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} — 기대값: ${expected}, 실제값: ${actual}`);
    }
}

/**
 * 단언: 값이 참인지 확인
 */
function assertTrue(value, msg = '') {
    if (!value) {
        throw new Error(`${msg} — 기대값: true, 실제값: ${value}`);
    }
}

/**
 * 단언: 값이 거짓인지 확인
 */
function assertFalse(value, msg = '') {
    if (value) {
        throw new Error(`${msg} — 기대값: false, 실제값: ${value}`);
    }
}

/**
 * 단언: 값이 null이 아닌지 확인
 */
function assertNotNull(value, msg = '') {
    if (value === null || value === undefined) {
        throw new Error(`${msg} — 기대값: not null, 실제값: ${value}`);
    }
}

/**
 * 단언: 값이 null인지 확인
 */
function assertNull(value, msg = '') {
    if (value !== null && value !== undefined) {
        throw new Error(`${msg} — 기대값: null, 실제값: ${value}`);
    }
}

// ========================================
// 테스트 스위트
// ========================================

async function runTests() {
    // 모듈 임포트
    const boardModule = await import('../../js/core/board.js');
    const blockTypesModule = await import('../../js/core/blockTypes.js');

    Board = boardModule.Board;
    createBlock = boardModule.createBlock;
    createTile = boardModule.createTile;
    createLayer = boardModule.createLayer;
    getBlockType = blockTypesModule.getBlockType;
    getNormalTypes = blockTypesModule.getNormalTypes;
    BLOCK_TYPES = blockTypesModule.BLOCK_TYPES;

    console.log('========================================');
    console.log('  Board 단위 테스트 시작');
    console.log('========================================\n');

    // ----------------------------------------
    // 1. blockTypes.js 테스트
    // ----------------------------------------

    test('blockTypes: 일반 블록 5종 등록 확인', () => {
        const normals = getNormalTypes();
        assertEqual(normals.length, 5, '일반 블록 수');
    });

    test('blockTypes: 특수 블록 5종 등록 확인', () => {
        const specials = blockTypesModule.getSpecialTypes();
        assertEqual(specials.length, 5, '특수 블록 수');
    });

    test('blockTypes: 기믹 9종 등록 확인', () => {
        const gimmicks = blockTypesModule.getGimmickTypes();
        assertEqual(gimmicks.length, 9, '기믹 수');
    });

    test('blockTypes: 전체 19종 등록 확인', () => {
        assertEqual(BLOCK_TYPES.size, 19, '전체 블록 타입 수');
    });

    test('blockTypes: getBlockType(1) → 일반 블록 (빨강)', () => {
        const red = getBlockType(1);
        assertNotNull(red, '빨강 블록 타입');
        assertEqual(red.name, '일반 블록 (빨강)', '빨강 이름');
        assertEqual(red.colorType, 'Red', '빨강 색상');
    });

    test('blockTypes: getBlockType(8) → 범위 폭탄', () => {
        const bomb = getBlockType(8);
        assertNotNull(bomb, '폭탄 블록 타입');
        assertEqual(bomb.name, '범위 폭탄', '폭탄 이름');
        assertEqual(bomb.blockType, 'Special', '폭탄 카테고리');
    });

    test('blockTypes: addBlockType → 새 ID 반환', () => {
        const newId = blockTypesModule.addBlockType({
            name: '테스트 기믹',
            description: '테스트용',
            blockType: 'Gimmick',
            fallbackColor: '#FF00FF',
            fallbackIcon: '🔮'
        });
        assertTrue(newId >= 19, '새 ID는 19 이상');
        const def = getBlockType(newId);
        assertNotNull(def, '추가된 타입 조회 가능');
        assertEqual(def.name, '테스트 기믹', '추가된 타입 이름');

        // 정리
        blockTypesModule.removeBlockType(newId);
    });

    test('blockTypes: removeBlockType → 기본 타입 보호', () => {
        const result = blockTypesModule.removeBlockType(1);
        assertFalse(result, '기본 타입(id=1) 제거 불가');
        assertNotNull(getBlockType(1), '빨강 블록 여전히 존재');
    });

    // ----------------------------------------
    // 2. Board 생성 테스트
    // ----------------------------------------

    test('Board: 기본 생성 (8x8)', () => {
        const board = new Board();
        assertEqual(board.rows, 8, '행 수');
        assertEqual(board.cols, 8, '열 수');
        assertEqual(board.grid.length, 8, '그리드 행 배열');
        assertEqual(board.grid[0].length, 8, '그리드 열 배열');
    });

    test('Board: 커스텀 크기 생성 (6x10)', () => {
        const board = new Board(6, 10);
        assertEqual(board.rows, 6, '행 수');
        assertEqual(board.cols, 10, '열 수');
    });

    test('Board: 초기화 후 모든 칸에 블록 배치', () => {
        const board = new Board(8, 8);
        board.initialize();

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const block = board.getBlock(row, col);
                assertNotNull(block, `블록 존재 (${row}, ${col})`);
                assertTrue(block.typeId >= 1 && block.typeId <= 5,
                    `일반 블록 타입 범위 (${row}, ${col}): ${block.typeId}`);
            }
        }
    });

    // ----------------------------------------
    // 3. 3매치 방지 테스트 (핵심!)
    // ----------------------------------------

    test('Board: 초기화 시 가로 3매치 없음', () => {
        // 10회 반복으로 안정성 확인
        for (let trial = 0; trial < 10; trial++) {
            const board = new Board(8, 8);
            board.initialize();

            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 6; col++) {
                    const b1 = board.getBlock(row, col);
                    const b2 = board.getBlock(row, col + 1);
                    const b3 = board.getBlock(row, col + 2);
                    if (b1.typeId === b2.typeId && b2.typeId === b3.typeId) {
                        throw new Error(
                            `가로 3매치 발견 (trial=${trial}): (${row},${col}) typeId=${b1.typeId}`
                        );
                    }
                }
            }
        }
    });

    test('Board: 초기화 시 세로 3매치 없음', () => {
        for (let trial = 0; trial < 10; trial++) {
            const board = new Board(8, 8);
            board.initialize();

            for (let row = 0; row < 6; row++) {
                for (let col = 0; col < 8; col++) {
                    const b1 = board.getBlock(row, col);
                    const b2 = board.getBlock(row + 1, col);
                    const b3 = board.getBlock(row + 2, col);
                    if (b1.typeId === b2.typeId && b2.typeId === b3.typeId) {
                        throw new Error(
                            `세로 3매치 발견 (trial=${trial}): (${row},${col}) typeId=${b1.typeId}`
                        );
                    }
                }
            }
        }
    });

    test('Board: 5색 블록이 골고루 분포', () => {
        const board = new Board(8, 8);
        board.initialize();

        const counts = {};
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const block = board.getBlock(row, col);
                counts[block.typeId] = (counts[block.typeId] || 0) + 1;
            }
        }

        // 5색 모두 사용되었는지 확인
        for (let id = 1; id <= 5; id++) {
            assertTrue((counts[id] || 0) > 0, `색상 ${id}가 최소 1개 이상`);
        }
    });

    // ----------------------------------------
    // 4. 타일/블록 접근 테스트
    // ----------------------------------------

    test('Board: getTile 정상 동작', () => {
        const board = new Board(8, 8);
        board.initialize();

        const tile = board.getTile(3, 4);
        assertNotNull(tile, '타일 존재');
        assertEqual(tile.row, 3, '타일 행');
        assertEqual(tile.col, 4, '타일 열');
    });

    test('Board: getTile 범위 밖 → null', () => {
        const board = new Board(8, 8);
        assertNull(board.getTile(-1, 0), '음수 행');
        assertNull(board.getTile(8, 0), '초과 행');
        assertNull(board.getTile(0, -1), '음수 열');
        assertNull(board.getTile(0, 8), '초과 열');
    });

    test('Board: setBlock / getBlock 정상 동작', () => {
        const board = new Board(8, 8);
        const block = createBlock(1, 2, 3);
        board.setBlock(2, 3, block);

        const retrieved = board.getBlock(2, 3);
        assertNotNull(retrieved, '블록 존재');
        assertEqual(retrieved.typeId, 1, '블록 타입 ID');
        assertEqual(retrieved.row, 2, '블록 행');
        assertEqual(retrieved.col, 3, '블록 열');
    });

    test('Board: removeBlock 정상 동작', () => {
        const board = new Board(8, 8);
        board.initialize();

        const before = board.getBlock(0, 0);
        assertNotNull(before, '제거 전 블록 존재');

        const removed = board.removeBlock(0, 0);
        assertNotNull(removed, '제거된 블록 반환');
        assertTrue(board.isEmpty(0, 0), '제거 후 빈 칸');
    });

    test('Board: swapBlocks 정상 동작', () => {
        const board = new Board(8, 8);
        board.initialize();

        const block1 = board.getBlock(0, 0);
        const block2 = board.getBlock(0, 1);
        const type1 = block1.typeId;
        const type2 = block2.typeId;

        board.swapBlocks(0, 0, 0, 1);

        const swapped1 = board.getBlock(0, 0);
        const swapped2 = board.getBlock(0, 1);
        assertEqual(swapped1.typeId, type2, '스왑 후 (0,0) 타입');
        assertEqual(swapped2.typeId, type1, '스왑 후 (0,1) 타입');
        assertEqual(swapped1.row, 0, '스왑 후 행 업데이트');
        assertEqual(swapped1.col, 0, '스왑 후 열 업데이트');
    });

    // ----------------------------------------
    // 5. 레이어 관리 테스트
    // ----------------------------------------

    test('Board: addLayer / getLayersAt 정상 동작', () => {
        const board = new Board(8, 8);
        const layer = createLayer(10, 1, 1); // 얼음 1단계
        board.addLayer(3, 3, layer);

        const layers = board.getLayersAt(3, 3);
        assertEqual(layers.length, 1, '레이어 수');
        assertEqual(layers[0].typeId, 10, '레이어 타입');
        assertEqual(layers[0].hp, 1, '레이어 HP');
    });

    test('Board: removeLayer 정상 동작', () => {
        const board = new Board(8, 8);
        const layer = createLayer(10, 1, 1);
        board.addLayer(3, 3, layer);

        const removed = board.removeLayer(3, 3, 10);
        assertNotNull(removed, '제거된 레이어 반환');
        assertEqual(removed.typeId, 10, '제거된 레이어 타입');

        const remaining = board.getLayersAt(3, 3);
        assertEqual(remaining.length, 0, '레이어 완전 제거');
    });

    // ----------------------------------------
    // 6. 유틸리티 테스트
    // ----------------------------------------

    test('Board: isValidPosition 경계 검사', () => {
        const board = new Board(8, 8);
        assertTrue(board.isValidPosition(0, 0), '(0,0) 유효');
        assertTrue(board.isValidPosition(7, 7), '(7,7) 유효');
        assertFalse(board.isValidPosition(-1, 0), '(-1,0) 무효');
        assertFalse(board.isValidPosition(8, 0), '(8,0) 무효');
    });

    test('Board: isEmpty 정상 동작', () => {
        const board = new Board(8, 8);
        assertTrue(board.isEmpty(0, 0), '초기화 전 빈 칸');

        board.initialize();
        assertFalse(board.isEmpty(0, 0), '초기화 후 채워진 칸');
    });

    test('Board: getAdjacentTiles 중앙', () => {
        const board = new Board(8, 8);
        const adj = board.getAdjacentTiles(4, 4);
        assertEqual(adj.length, 4, '중앙 인접 타일 4개');
    });

    test('Board: getAdjacentTiles 모서리', () => {
        const board = new Board(8, 8);
        const adj = board.getAdjacentTiles(0, 0);
        assertEqual(adj.length, 2, '모서리 인접 타일 2개');
    });

    test('Board: getAdjacentTiles 가장자리', () => {
        const board = new Board(8, 8);
        const adj = board.getAdjacentTiles(0, 4);
        assertEqual(adj.length, 3, '가장자리 인접 타일 3개');
    });

    test('Board: getAllBlocks 정상 동작', () => {
        const board = new Board(8, 8);
        board.initialize();
        const blocks = board.getAllBlocks();
        assertEqual(blocks.length, 64, '8x8=64개 블록');
    });

    test('Board: getBlocksByType 정상 동작', () => {
        const board = new Board(8, 8);
        board.initialize();

        const redBlocks = board.getBlocksByType(1);
        assertTrue(redBlocks.length > 0, '빨강 블록 존재');
        for (const b of redBlocks) {
            assertEqual(b.typeId, 1, '빨강 타입만');
        }
    });

    test('Board: getBlocksByColor 정상 동작', () => {
        const board = new Board(8, 8);
        board.initialize();

        const redBlocks = board.getBlocksByColor('Red');
        assertTrue(redBlocks.length > 0, '빨강 색상 블록 존재');
    });

    // ----------------------------------------
    // 7. 기믹 배치 테스트
    // ----------------------------------------

    test('Board: placeGimmick 레이어형 (꿀)', () => {
        const board = new Board(8, 8);
        board.initialize();

        board.placeGimmick(13, 2, 2); // 꿀 (id=13, Floor 레이어)
        const layers = board.getLayersAt(2, 2);
        assertEqual(layers.length, 1, '레이어 추가됨');
        assertEqual(layers[0].typeId, 13, '꿀 타입');

        // 기존 블록은 그대로
        const block = board.getBlock(2, 2);
        assertNotNull(block, '블록 유지');
    });

    test('Board: placeGimmick 블록형 (곰인형)', () => {
        const board = new Board(8, 8);
        board.placeGimmick(14, 3, 3); // 곰인형 (id=14)

        const block = board.getBlock(3, 3);
        assertNotNull(block, '블록 배치');
        assertEqual(block.typeId, 14, '곰인형 타입');
    });

    // ----------------------------------------
    // 8. Block 생성 테스트
    // ----------------------------------------

    test('Block: createBlock 기본값', () => {
        const block = createBlock(1, 0, 0);
        assertNotNull(block, '블록 생성');
        assertEqual(block.typeId, 1, '타입 ID');
        assertEqual(block.state, 'idle', '초기 상태');
        assertEqual(block.scale, 1.0, '초기 스케일');
        assertEqual(block.alpha, 1.0, '초기 투명도');
        assertTrue(block.isOrigin, '원점 블록');
    });

    test('Block: 각 블록 고유 ID', () => {
        const b1 = createBlock(1, 0, 0);
        const b2 = createBlock(1, 0, 1);
        assertTrue(b1.id !== b2.id, '블록 ID 고유성');
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

    // 종료 코드 (CI용)
    if (failed > 0) {
        process.exit(1);
    }
}

// 실행
runTests().catch(err => {
    console.error('테스트 실행 오류:', err);
    process.exit(1);
});
