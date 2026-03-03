/**
 * blockTypes.js — 블록/기믹 타입 데이터 중앙 저장소
 *
 * 모든 블록과 기믹의 정적 정의(BlockTypeDefinition)를 관리한다.
 * 일반 블록 5종, 특수 블록 4종, 기믹 9종을 기본 제공하며,
 * AI가 생성한 기믹을 런타임에 추가/제거할 수 있다.
 */

// ========================================
// 상수 정의
// ========================================

/** 블록 타입 분류 */
const BLOCK_CATEGORY = Object.freeze({
    NORMAL: 'Normal',
    SPECIAL: 'Special',
    GIMMICK: 'Gimmick'
});

/** 색상 타입 */
const COLOR_TYPE = Object.freeze({
    RED: 'Red',
    BLUE: 'Blue',
    GREEN: 'Green',
    YELLOW: 'Yellow',
    PURPLE: 'Purple'
});

/** 트리거 조건 */
const TRIGGER_CONDITION = Object.freeze({
    DIRECT_MATCH: 'directMatch',
    ADJACENT_MATCH: 'adjacentMatch',
    TURN_END: 'turnEnd',
    REACH_BOTTOM: 'reachBottom'
});

/** 효과 타입 */
const EFFECT_TYPE = Object.freeze({
    DESTROY: 'destroy',
    DESTROY_ROW: 'destroyRow',
    DESTROY_COLUMN: 'destroyColumn',
    DESTROY_AREA: 'destroyArea',
    DESTROY_COLOR: 'destroyColor',
    DESTROY_TARGET: 'destroyTarget',
    REDUCE_HP: 'reduceHp',
    COLLECT: 'collect'
});

// ========================================
// 기본 BlockTypeDefinition 템플릿
// ========================================

/**
 * BlockTypeDefinition 기본값을 생성한다.
 * 개별 정의에서 필요한 필드만 오버라이드하면 된다.
 * @param {object} overrides - 오버라이드할 필드
 * @returns {object} 완성된 BlockTypeDefinition
 */
function createBlockType(overrides) {
    return {
        id: 0,
        name: '',
        description: '',
        blockType: BLOCK_CATEGORY.NORMAL,
        colorType: null,
        layerType: null,

        // 미션/수집
        collectable: false,
        collectType: null,

        // 파괴 조건
        hp: 1,
        directDamage: true,
        indirectDamage: false,
        bombDamage: true,
        rainbowDamage: true,
        invincible: false,
        removed: true,

        // 이동/물리
        swap: true,
        gravity: true,
        slidable: false,
        immovable: false,

        // 확산
        spreadable: false,
        spreadRate: 0,
        spreadDirection: null,

        // 발동/효과
        triggerCondition: null,
        effectType: null,
        effectRange: 0,
        priority: 100,

        // 크기
        width: 1,
        height: 1,

        // 비주얼
        fallbackColor: '#CCCCCC',
        fallbackIcon: '?',
        resources: null,

        // 오버라이드 적용
        ...overrides
    };
}

// ========================================
// 기본 블록/기믹 정의 (18종)
// ========================================

/** 일반 블록 5종 */
const NORMAL_BLOCKS = [
    createBlockType({
        id: 1,
        name: '일반 블록 (빨강)',
        description: '기본 매치용 블록',
        blockType: BLOCK_CATEGORY.NORMAL,
        colorType: COLOR_TYPE.RED,
        layerType: 'Block',
        priority: 10,
        resources: 'block01',
        fallbackColor: '#FF4444',
        fallbackIcon: '🔴'
    }),
    createBlockType({
        id: 2,
        name: '일반 블록 (파랑)',
        description: '기본 매치용 블록',
        blockType: BLOCK_CATEGORY.NORMAL,
        colorType: COLOR_TYPE.BLUE,
        layerType: 'Block',
        priority: 10,
        resources: 'block04',
        fallbackColor: '#4444FF',
        fallbackIcon: '🔵'
    }),
    createBlockType({
        id: 3,
        name: '일반 블록 (초록)',
        description: '기본 매치용 블록',
        blockType: BLOCK_CATEGORY.NORMAL,
        colorType: COLOR_TYPE.GREEN,
        layerType: 'Block',
        priority: 10,
        resources: 'block03',
        fallbackColor: '#44CC44',
        fallbackIcon: '🟢'
    }),
    createBlockType({
        id: 4,
        name: '일반 블록 (노랑)',
        description: '기본 매치용 블록',
        blockType: BLOCK_CATEGORY.NORMAL,
        colorType: COLOR_TYPE.YELLOW,
        layerType: 'Block',
        priority: 10,
        resources: 'block02',
        fallbackColor: '#FFCC00',
        fallbackIcon: '🟡'
    }),
    createBlockType({
        id: 5,
        name: '일반 블록 (핑크)',
        description: '기본 매치용 블록',
        blockType: BLOCK_CATEGORY.NORMAL,
        colorType: COLOR_TYPE.PURPLE,
        layerType: 'Block',
        priority: 10,
        resources: 'block05',
        fallbackColor: '#AA44FF',
        fallbackIcon: '🟣'
    })
];

/** 특수 블록 5종 */
const SPECIAL_BLOCKS = [
    createBlockType({
        id: 6,
        name: '로켓 (가로)',
        description: '가로 한 줄 전체 제거',
        blockType: BLOCK_CATEGORY.SPECIAL,
        colorType: null,
        layerType: 'Special',
        triggerCondition: TRIGGER_CONDITION.DIRECT_MATCH,
        effectType: EFFECT_TYPE.DESTROY_ROW,
        effectRange: 0, // 보드 전체 행
        priority: 5,
        resources: 'Booster_LineW',
        fallbackColor: '#FF8800',
        fallbackIcon: '🚀'
    }),
    createBlockType({
        id: 7,
        name: '로켓 (세로)',
        description: '세로 한 줄 전체 제거',
        blockType: BLOCK_CATEGORY.SPECIAL,
        colorType: null,
        layerType: 'Special',
        triggerCondition: TRIGGER_CONDITION.DIRECT_MATCH,
        effectType: EFFECT_TYPE.DESTROY_COLUMN,
        effectRange: 0, // 보드 전체 열
        priority: 5,
        resources: 'Booster_LineH',
        fallbackColor: '#FF8800',
        fallbackIcon: '🚀'
    }),
    createBlockType({
        id: 8,
        name: '범위 폭탄',
        description: '주변 3x3 범위 제거',
        blockType: BLOCK_CATEGORY.SPECIAL,
        colorType: null,
        layerType: 'Special',
        triggerCondition: TRIGGER_CONDITION.DIRECT_MATCH,
        effectType: EFFECT_TYPE.DESTROY_AREA,
        effectRange: 1, // 중심 기준 1칸 = 3x3
        priority: 4,
        resources: 'Booster_Bomb',
        fallbackColor: '#FF0000',
        fallbackIcon: '💣'
    }),
    createBlockType({
        id: 9,
        name: '레인보우',
        description: '같은 색 블록 전체 제거',
        blockType: BLOCK_CATEGORY.SPECIAL,
        colorType: null,
        layerType: 'Special',
        swap: true,
        triggerCondition: TRIGGER_CONDITION.DIRECT_MATCH,
        effectType: EFFECT_TYPE.DESTROY_COLOR,
        effectRange: 0, // 보드 전체
        priority: 3, // 최우선
        resources: 'Booster_Cube_Make_015',
        fallbackColor: '#FFFFFF',
        fallbackIcon: '🌈'
    }),
    createBlockType({
        id: 10,
        name: '유도 타겟',
        description: '탭하여 원하는 블록 1개를 제거',
        blockType: BLOCK_CATEGORY.SPECIAL,
        colorType: null,
        layerType: 'Special',
        triggerCondition: TRIGGER_CONDITION.DIRECT_MATCH,
        effectType: EFFECT_TYPE.DESTROY_TARGET,
        effectRange: 1, // 단일 대상
        priority: 6,
        resources: 'Booster_Fly',
        fallbackColor: '#FF4488',
        fallbackIcon: '🎯'
    })
];

/** 기믹 9종 (id 11~19) */
const GIMMICK_BLOCKS = [
    // 가방: 블록형 기믹, 인접 매치로 파괴
    createBlockType({
        id: 11,
        name: '가방 (1단계)',
        description: '1회 인접 매치로 파괴',
        blockType: BLOCK_CATEGORY.GIMMICK,
        layerType: 'Normal',
        hp: 1,
        directDamage: false,
        indirectDamage: true,
        swap: false,
        gravity: false,
        slidable: true,
        immovable: true,
        triggerCondition: TRIGGER_CONDITION.ADJACENT_MATCH,
        effectType: EFFECT_TYPE.REDUCE_HP,
        priority: 20,
        resources: 'Gimmick001_01',
        fallbackColor: '#A0D2FF',
        fallbackIcon: '❄️'
    }),
    createBlockType({
        id: 12,
        name: '가방 (2단계)',
        description: '2회 인접 매치로 파괴',
        blockType: BLOCK_CATEGORY.GIMMICK,
        layerType: 'Normal',
        hp: 2,
        directDamage: false,
        indirectDamage: true,
        swap: false,
        gravity: false,
        slidable: true,
        immovable: true,
        triggerCondition: TRIGGER_CONDITION.ADJACENT_MATCH,
        effectType: EFFECT_TYPE.REDUCE_HP,
        priority: 20,
        resources: 'Gimmick001_02',
        fallbackColor: '#70B8FF',
        fallbackIcon: '❄️'
    }),
    // 꿀: Floor 레이어, 확산형
    createBlockType({
        id: 13,
        name: '꿀',
        description: '턴마다 인접 1칸 확산, 1회 매치로 파괴',
        blockType: BLOCK_CATEGORY.GIMMICK,
        layerType: 'Floor',
        hp: 1,
        directDamage: false,
        indirectDamage: true,
        swap: false,
        gravity: false,
        immovable: true,
        spreadable: true,
        spreadRate: 1,
        spreadDirection: 'adjacent4',
        triggerCondition: TRIGGER_CONDITION.TURN_END,
        effectType: EFFECT_TYPE.REDUCE_HP,
        priority: 15,
        resources: 'Gimmick01001_Honey_0-0',
        fallbackColor: '#228B22',
        fallbackIcon: '🌿'
    }),
    // 곰인형: 수집형 블록 기믹
    createBlockType({
        id: 14,
        name: '곰인형',
        description: '보드 아래로 이동시켜 수집',
        blockType: BLOCK_CATEGORY.GIMMICK,
        layerType: 'Normal',
        collectable: true,
        collectType: 'fallToBottom',
        hp: 1,
        directDamage: false,
        indirectDamage: false,
        bombDamage: false,
        rainbowDamage: false,
        invincible: true,
        swap: false,
        gravity: true,
        triggerCondition: TRIGGER_CONDITION.REACH_BOTTOM,
        effectType: EFFECT_TYPE.COLLECT,
        priority: 8,
        resources: 'Gimmick015_Body_01',
        fallbackColor: '#FFD700',
        fallbackIcon: '🧸'
    }),
    // 거대 상자 1~5단계: 2x2 블록형, 특수 블록으로만 파괴
    createBlockType({
        id: 15,
        name: '거대 상자 (1단계)',
        description: '특수 블록으로 5회 파괴 (2x2 크기)',
        blockType: BLOCK_CATEGORY.GIMMICK,
        layerType: 'Normal',
        hp: 5,
        directDamage: false,
        indirectDamage: false,
        bombDamage: true,
        rainbowDamage: false,
        swap: false,
        gravity: false,
        immovable: true,
        width: 2,
        height: 2,
        triggerCondition: TRIGGER_CONDITION.ADJACENT_MATCH,
        effectType: EFFECT_TYPE.REDUCE_HP,
        priority: 25,
        resources: 'Gimmick011_Safe_05',
        fallbackColor: '#8B6914',
        fallbackIcon: '🗃️'
    }),
    createBlockType({
        id: 16,
        name: '거대 상자 (2단계)',
        description: '특수 블록으로 4회 파괴 (2x2 크기)',
        blockType: BLOCK_CATEGORY.GIMMICK,
        layerType: 'Normal',
        hp: 4,
        directDamage: false,
        indirectDamage: false,
        bombDamage: true,
        rainbowDamage: false,
        swap: false,
        gravity: false,
        immovable: true,
        width: 2,
        height: 2,
        triggerCondition: TRIGGER_CONDITION.ADJACENT_MATCH,
        effectType: EFFECT_TYPE.REDUCE_HP,
        priority: 25,
        resources: 'Gimmick011_Safe_04',
        fallbackColor: '#8B6914',
        fallbackIcon: '🗃️'
    }),
    createBlockType({
        id: 17,
        name: '거대 상자 (3단계)',
        description: '특수 블록으로 3회 파괴 (2x2 크기)',
        blockType: BLOCK_CATEGORY.GIMMICK,
        layerType: 'Normal',
        hp: 3,
        directDamage: false,
        indirectDamage: false,
        bombDamage: true,
        rainbowDamage: false,
        swap: false,
        gravity: false,
        immovable: true,
        width: 2,
        height: 2,
        triggerCondition: TRIGGER_CONDITION.ADJACENT_MATCH,
        effectType: EFFECT_TYPE.REDUCE_HP,
        priority: 25,
        resources: 'Gimmick011_Safe_03',
        fallbackColor: '#8B6914',
        fallbackIcon: '🗃️'
    }),
    createBlockType({
        id: 18,
        name: '거대 상자 (4단계)',
        description: '특수 블록으로 2회 파괴 (2x2 크기)',
        blockType: BLOCK_CATEGORY.GIMMICK,
        layerType: 'Normal',
        hp: 2,
        directDamage: false,
        indirectDamage: false,
        bombDamage: true,
        rainbowDamage: false,
        swap: false,
        gravity: false,
        immovable: true,
        width: 2,
        height: 2,
        triggerCondition: TRIGGER_CONDITION.ADJACENT_MATCH,
        effectType: EFFECT_TYPE.REDUCE_HP,
        priority: 25,
        resources: 'Gimmick011_Safe_02',
        fallbackColor: '#8B6914',
        fallbackIcon: '🗃️'
    }),
    createBlockType({
        id: 19,
        name: '거대 상자 (5단계)',
        description: '특수 블록으로 1회 파괴 (2x2 크기)',
        blockType: BLOCK_CATEGORY.GIMMICK,
        layerType: 'Normal',
        collectable: true,
        hp: 1,
        directDamage: false,
        indirectDamage: false,
        bombDamage: true,
        rainbowDamage: false,
        swap: false,
        gravity: false,
        immovable: true,
        width: 2,
        height: 2,
        triggerCondition: TRIGGER_CONDITION.ADJACENT_MATCH,
        effectType: EFFECT_TYPE.REDUCE_HP,
        priority: 25,
        resources: 'Gimmick011_Safe_01',
        fallbackColor: '#8B6914',
        fallbackIcon: '🗃️'
    })
];

// ========================================
// BLOCK_TYPES 맵 (중앙 저장소)
// ========================================

/** @type {Map<number, object>} 모든 블록 타입의 중앙 저장소 */
const BLOCK_TYPES = new Map();

/** 자동 채번용 카운터 (기본 19종 이후부터 시작) */
let _nextId = 20;

// 기본 블록 타입 등록
[...NORMAL_BLOCKS, ...SPECIAL_BLOCKS, ...GIMMICK_BLOCKS].forEach(blockType => {
    BLOCK_TYPES.set(blockType.id, Object.freeze(blockType));
});

// ========================================
// 공개 API
// ========================================

/**
 * 블록 타입 ID로 정의를 조회한다.
 * @param {number} id - 블록 타입 ID
 * @returns {object|undefined} BlockTypeDefinition 또는 undefined
 */
export function getBlockType(id) {
    return BLOCK_TYPES.get(id);
}

/**
 * 블록 카테고리별 타입 목록을 반환한다.
 * @param {string} blockType - 'Normal' | 'Special' | 'Gimmick'
 * @returns {object[]} 해당 카테고리의 BlockTypeDefinition 배열
 */
export function getTypesByCategory(blockType) {
    const result = [];
    for (const def of BLOCK_TYPES.values()) {
        if (def.blockType === blockType) {
            result.push(def);
        }
    }
    return result;
}

/**
 * 일반 블록 타입 목록을 반환한다.
 * @returns {object[]} 일반 블록 정의 배열
 */
export function getNormalTypes() {
    return getTypesByCategory(BLOCK_CATEGORY.NORMAL);
}

/**
 * 특수 블록 타입 목록을 반환한다.
 * @returns {object[]} 특수 블록 정의 배열
 */
export function getSpecialTypes() {
    return getTypesByCategory(BLOCK_CATEGORY.SPECIAL);
}

/**
 * 기믹 타입 목록을 반환한다.
 * @returns {object[]} 기믹 정의 배열
 */
export function getGimmickTypes() {
    return getTypesByCategory(BLOCK_CATEGORY.GIMMICK);
}

/**
 * AI 생성 기믹 등 새 블록 타입을 추가한다.
 * @param {object} definition - BlockTypeDefinition (id 필드는 무시, 자동 채번)
 * @returns {number} 새로 할당된 ID
 */
export function addBlockType(definition) {
    const newId = _nextId++;
    const newDef = createBlockType({ ...definition, id: newId });
    BLOCK_TYPES.set(newId, Object.freeze(newDef));
    return newId;
}

/**
 * 블록 타입을 제거한다 (AI 생성 기믹 제거용).
 * 기본 제공 타입(id 1~18)은 제거할 수 없다.
 * @param {number} id - 제거할 블록 타입 ID
 * @returns {boolean} 제거 성공 여부
 */
export function removeBlockType(id) {
    if (id <= 19) return false; // 기본 타입 보호
    return BLOCK_TYPES.delete(id);
}

// ========================================
// 내보내기
// ========================================

export {
    BLOCK_TYPES,
    BLOCK_CATEGORY,
    COLOR_TYPE,
    TRIGGER_CONDITION,
    EFFECT_TYPE,
    createBlockType
};
