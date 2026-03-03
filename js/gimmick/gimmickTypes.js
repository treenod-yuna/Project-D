/**
 * gimmickTypes.js — 기믹 유형별 핸들러 정의 및 등록
 *
 * 가방(블록형), 꿀(Floor 확산형), 곰인형(수집형),
 * 거대 상자(2x2 블록형) 핸들러를 생성하여 GimmickManager에 등록한다.
 */

// ========================================
// 핸들러 생성 함수
// ========================================

/**
 * 가방 기믹 핸들러를 생성한다.
 * 대상: 가방 1단계(11), 가방 2단계(12) — 블록형 (layerType=Normal)
 *
 * - 인접 매치 시 indirectDamage=true면 HP-1
 * - 폭탄/로켓 범위 내: bombDamage=true면 HP-1
 * - HP=0 → 블록 파괴
 *
 * @returns {object} GimmickHandler
 */
function createBagGimmickHandler() {
    return {
        typeIds: [11, 12],
        category: 'bag',
        priority: 20
    };
}

/**
 * 확산형 기믹 핸들러를 생성한다.
 * 대상: 꿀(13) — Floor 레이어
 *
 * - 인접 매치 시 HP 감소 (indirectDamage=true)
 * - 턴 종료 시 인접 칸으로 확산 (spreadable=true)
 *
 * @returns {object} GimmickHandler
 */
function createSpreadGimmickHandler() {
    return {
        typeIds: [13],
        category: 'spread',
        priority: 15
    };
}

/**
 * 수집형 기믹 핸들러를 생성한다.
 * 대상: 곰인형(14)
 *
 * - 블록형 기믹 (레이어 아님)
 * - gravity=true → 낙하 가능
 * - invincible=true → 매치/폭탄 파괴 불가
 * - 맨 아래 행 도달 시 수집 (collectable=true)
 *
 * @returns {object} GimmickHandler
 */
function createCollectGimmickHandler() {
    return {
        typeIds: [14],
        category: 'collect',
        priority: 8
    };
}

/**
 * 거대 상자 기믹 핸들러를 생성한다.
 * 대상: 거대 상자 1~5단계(15~19)
 *
 * - 2x2 크기, 4칸 점유
 * - origin 블록에서 HP 공유
 * - 특수 블록(폭탄/로켓)으로만 파괴 가능 (bombDamage=true, indirectDamage=false)
 * - HP=0 → 4칸 모두 제거
 *
 * @returns {object} GimmickHandler
 */
function createBigBoxGimmickHandler() {
    return {
        typeIds: [15, 16, 17, 18, 19],
        category: 'bigbox',
        priority: 25
    };
}

// ========================================
// 전체 핸들러 등록
// ========================================

/**
 * 모든 기믹 핸들러를 GimmickManager에 등록한다.
 * @param {object} gimmickManager - GimmickManager 인스턴스
 */
function registerAllGimmickHandlers(gimmickManager) {
    gimmickManager.registerHandler(createBagGimmickHandler());
    gimmickManager.registerHandler(createSpreadGimmickHandler());
    gimmickManager.registerHandler(createCollectGimmickHandler());
    gimmickManager.registerHandler(createBigBoxGimmickHandler());
}

// ========================================
// 내보내기
// ========================================

export {
    registerAllGimmickHandlers,
    createBagGimmickHandler,
    createSpreadGimmickHandler,
    createCollectGimmickHandler,
    createBigBoxGimmickHandler
};
