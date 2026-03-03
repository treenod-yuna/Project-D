/**
 * eventBus.js — 전역 이벤트 발행/구독 시스템
 *
 * 모듈 간 느슨한 결합을 위한 이벤트 버스.
 * 싱글톤 인스턴스를 제공하며, 이벤트 이름 상수도 함께 관리한다.
 */

// ========================================
// 이벤트 이름 상수
// ========================================

/** 코어 이벤트 (16종) */
export const EVENTS = Object.freeze({
    // 스왑
    SWAP_ATTEMPTED: 'SWAP_ATTEMPTED',
    SWAP_SUCCESS: 'SWAP_SUCCESS',
    SWAP_FAILED: 'SWAP_FAILED',

    // 매치/제거
    MATCH_DETECTED: 'MATCH_DETECTED',
    BLOCKS_REMOVING: 'BLOCKS_REMOVING',
    BLOCKS_REMOVED: 'BLOCKS_REMOVED',

    // 특수 블록
    SPECIAL_CREATED: 'SPECIAL_CREATED',
    SPECIAL_ACTIVATED: 'SPECIAL_ACTIVATED',
    SPECIALS_COMBINED: 'SPECIALS_COMBINED',

    // 낙하
    GRAVITY_START: 'GRAVITY_START',
    GRAVITY_COMPLETE: 'GRAVITY_COMPLETE',

    // 연쇄/턴
    CASCADE_STEP: 'CASCADE_STEP',
    CASCADE_COMPLETE: 'CASCADE_COMPLETE',
    TURN_END: 'TURN_END',

    // 셔플
    SHUFFLE_NEEDED: 'SHUFFLE_NEEDED',
    SHUFFLE_COMPLETE: 'SHUFFLE_COMPLETE',

    // 기믹 (6종)
    GIMMICK_DAMAGED: 'GIMMICK_DAMAGED',
    GIMMICK_DESTROYED: 'GIMMICK_DESTROYED',
    GIMMICK_SPREAD: 'GIMMICK_SPREAD',
    GIMMICK_COLLECTED: 'GIMMICK_COLLECTED',
    GIMMICK_PLACED: 'GIMMICK_PLACED',
    GIMMICK_TRIGGERED: 'GIMMICK_TRIGGERED',

    // UI/렌더링 (5종)
    PARAMETER_CHANGED: 'PARAMETER_CHANGED',
    AI_GIMMICK_GENERATED: 'AI_GIMMICK_GENERATED',
    AI_GIMMICK_FAILED: 'AI_GIMMICK_FAILED',
    ANIMATION_COMPLETE: 'ANIMATION_COMPLETE',
    HINT_SHOW: 'HINT_SHOW'
});

// ========================================
// EventBus 클래스
// ========================================

class EventBus {
    constructor() {
        /** @type {Map<string, Array<{callback: Function, priority: number}>>} */
        this._listeners = new Map();
    }

    /**
     * 이벤트를 구독한다.
     * @param {string} eventName - 이벤트 이름
     * @param {Function} callback - 콜백 함수 (payload를 인자로 받음)
     * @param {number} priority - 우선순위 (낮을수록 먼저 실행, 기본 100)
     */
    on(eventName, callback, priority = 100) {
        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, []);
        }
        const list = this._listeners.get(eventName);
        list.push({ callback, priority });
        // 우선순위 정렬 (낮은 숫자 먼저)
        list.sort((a, b) => a.priority - b.priority);
    }

    /**
     * 이벤트 구독을 해제한다.
     * @param {string} eventName - 이벤트 이름
     * @param {Function} callback - 제거할 콜백 함수
     */
    off(eventName, callback) {
        const list = this._listeners.get(eventName);
        if (!list) return;
        const idx = list.findIndex(l => l.callback === callback);
        if (idx !== -1) list.splice(idx, 1);
    }

    /**
     * 이벤트를 발행한다.
     * @param {string} eventName - 이벤트 이름
     * @param {object} payload - 이벤트 데이터
     */
    emit(eventName, payload = {}) {
        const list = this._listeners.get(eventName);
        if (!list) return;
        for (const listener of list) {
            listener.callback(payload);
        }
    }

    /**
     * 이벤트를 1회만 구독한다.
     * @param {string} eventName - 이벤트 이름
     * @param {Function} callback - 콜백 함수
     */
    once(eventName, callback) {
        const wrapper = (payload) => {
            this.off(eventName, wrapper);
            callback(payload);
        };
        this.on(eventName, wrapper);
    }

    /**
     * 모든 이벤트 구독을 해제한다.
     */
    clear() {
        this._listeners.clear();
    }
}

// ========================================
// 싱글톤 인스턴스
// ========================================

/** 전역 이벤트 버스 싱글톤 */
export const eventBus = new EventBus();

export { EventBus };
