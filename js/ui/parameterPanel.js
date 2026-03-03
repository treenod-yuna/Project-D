/**
 * parameterPanel.js — 실시간 파라미터 제어 패널
 *
 * 기획자가 애니메이션/렌더링 파라미터를 수치 입력으로 실시간 조절한다.
 * 이전 값 표시, 변경 강조, 되돌리기, 전체 초기화를 지원한다.
 * 보드에 기믹 배치 시 해당 기믹의 고유 파라미터를 동적으로 추가한다.
 */

import { eventBus, EVENTS } from '../core/eventBus.js';
import { getBlockType, BLOCK_CATEGORY } from '../core/blockTypes.js';

// ========================================
// 파라미터 정의
// ========================================

/**
 * 기본 파라미터 정의 목록
 * - id: 대상 객체의 속성명 (AnimationManager 또는 Renderer)
 * - label: UI에 표시할 한글 이름
 * - default: 기본값
 * - min/max/step: 입력 범위 제한
 * - unit: 단위 표시 (ms, px 등)
 * - target: 대상 객체 키 ('animationManager' 또는 'renderer')
 * - resizeOnChange: true면 값 변경 시 Canvas 리사이즈 트리거
 */
const PARAM_DEFINITIONS = [
    {
        category: '애니메이션',
        params: [
            { id: 'swapDuration', label: '스왑 속도', default: 200, min: 50, max: 1000, step: 10, unit: 'ms', target: 'animationManager' },
            { id: 'removeDuration', label: '제거 속도', default: 150, min: 50, max: 1000, step: 10, unit: 'ms', target: 'animationManager' },
            { id: 'fallDurationPerCell', label: '낙하 속도/칸', default: 115, min: 30, max: 500, step: 5, unit: 'ms', target: 'animationManager' },
            { id: 'fallAcceleration', label: '낙하 가속', default: 0.3, min: 0, max: 1, step: 0.05, unit: '', target: 'animationManager' },
            { id: 'bounceDuration', label: '바운스 시간', default: 200, min: 0, max: 800, step: 10, unit: 'ms', target: 'animationManager' },
        ]
    },
    {
        category: '렌더링',
        params: [
            { id: 'cellSize', label: '셀 크기', default: 64, min: 32, max: 128, step: 4, unit: 'px', target: 'renderer', resizeOnChange: true },
            { id: 'cellPadding', label: '셀 패딩', default: 4, min: 0, max: 16, step: 1, unit: 'px', target: 'renderer' },
            { id: 'boardPadding', label: '보드 여백', default: 20, min: 0, max: 60, step: 2, unit: 'px', target: 'renderer', resizeOnChange: true },
        ]
    }
];

// ========================================
// ParameterPanel 클래스
// ========================================

export class ParameterPanel {
    /**
     * 파라미터 패널을 생성한다.
     * @param {HTMLElement} containerEl - DOM 컨테이너
     * @param {object} targets - 대상 객체들 { renderer, animationManager }
     */
    constructor(containerEl, targets) {
        /** @type {HTMLElement} 컨테이너 엘리먼트 */
        this._container = containerEl;

        /** @type {object} 대상 객체 맵 */
        this._targets = targets;

        /** @type {Map<string, object>} 파라미터 상태 (id → { def, prevValue, currentValue, rowEl, inputEl, prevEl }) */
        this._paramStates = new Map();

        /** @type {number} 변경된 파라미터 수 */
        this._changeCount = 0;

        /** @type {HTMLElement|null} 변경 카운트 뱃지 */
        this._changeCountEl = null;

        /** @type {Map<number, HTMLElement>} 기믹 카테고리 섹션 (typeId → sectionEl) */
        this._gimmickSections = new Map();

        // UI 빌드
        this._buildUI();

        // 기믹 배치 이벤트 구독 (동적 파라미터 추가)
        eventBus.on(EVENTS.GIMMICK_PLACED, (payload) => {
            if (payload && payload.typeId) {
                const typeDef = getBlockType(payload.typeId);
                if (typeDef) {
                    this.addGimmickParams(payload.typeId, typeDef);
                }
            }
        });
    }

    // ========================================
    // UI 빌드
    // ========================================

    /**
     * 전체 패널 UI를 DOM으로 생성한다.
     * @private
     */
    _buildUI() {
        // 각 카테고리별 섹션 생성
        for (const categoryDef of PARAM_DEFINITIONS) {
            const sectionEl = this._createCategorySection(categoryDef.category, categoryDef.params);
            this._container.appendChild(sectionEl);
        }

        // 하단 액션 버튼 영역
        const actionsEl = document.createElement('div');
        actionsEl.className = 'param-actions';

        // 전체 되돌리기 버튼
        const revertAllBtn = document.createElement('button');
        revertAllBtn.className = 'param-btn';
        revertAllBtn.textContent = '전체 되돌리기';
        revertAllBtn.addEventListener('click', () => this.revertAll());

        // 전체 초기화 버튼
        const resetBtn = document.createElement('button');
        resetBtn.className = 'param-btn';
        resetBtn.textContent = '전체 초기화';
        resetBtn.addEventListener('click', () => this.resetAll());

        // 변경 카운트 뱃지
        this._changeCountEl = document.createElement('span');
        this._changeCountEl.className = 'param-change-count';
        this._changeCountEl.textContent = '';

        actionsEl.appendChild(revertAllBtn);
        actionsEl.appendChild(resetBtn);
        actionsEl.appendChild(this._changeCountEl);
        this._container.appendChild(actionsEl);
    }

    /**
     * 카테고리 섹션을 생성한다.
     * @private
     * @param {string} categoryName - 카테고리 이름
     * @param {object[]} params - 파라미터 정의 배열
     * @returns {HTMLElement} 섹션 DOM
     */
    _createCategorySection(categoryName, params) {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'param-category-section';

        // 카테고리 헤더
        const headerEl = document.createElement('div');
        headerEl.className = 'param-category';
        headerEl.textContent = categoryName;
        sectionEl.appendChild(headerEl);

        // 파라미터 행들
        for (const param of params) {
            const rowEl = this._createParamRow(param);
            sectionEl.appendChild(rowEl);
        }

        return sectionEl;
    }

    /**
     * 개별 파라미터 행을 생성한다.
     * @private
     * @param {object} param - 파라미터 정의
     * @returns {HTMLElement} 행 DOM
     */
    _createParamRow(param) {
        const rowEl = document.createElement('div');
        rowEl.className = 'param-row';
        rowEl.dataset.paramId = param.id;

        // 레이블
        const labelEl = document.createElement('span');
        labelEl.className = 'param-label';
        labelEl.textContent = param.label;

        // 이전 값 표시
        const prevEl = document.createElement('span');
        prevEl.className = 'param-prev';
        prevEl.textContent = param.default;

        // 화살표
        const arrowEl = document.createElement('span');
        arrowEl.className = 'param-arrow';
        arrowEl.textContent = '→';

        // 숫자 입력
        const inputEl = document.createElement('input');
        inputEl.type = 'number';
        inputEl.className = 'param-input';
        inputEl.value = param.default;
        inputEl.min = param.min;
        inputEl.max = param.max;
        inputEl.step = param.step;

        // 단위
        const unitEl = document.createElement('span');
        unitEl.className = 'param-unit';
        unitEl.textContent = param.unit;

        // 되돌리기 버튼
        const revertBtn = document.createElement('button');
        revertBtn.className = 'param-revert';
        revertBtn.textContent = '↩';
        revertBtn.title = '이전 값으로 되돌리기';

        // DOM 조립
        rowEl.appendChild(labelEl);
        rowEl.appendChild(prevEl);
        rowEl.appendChild(arrowEl);
        rowEl.appendChild(inputEl);
        rowEl.appendChild(unitEl);
        rowEl.appendChild(revertBtn);

        // 상태 저장
        const state = {
            def: param,
            prevValue: param.default,
            currentValue: param.default,
            rowEl,
            inputEl,
            prevEl
        };
        this._paramStates.set(param.id, state);

        // 이벤트: 값 변경
        inputEl.addEventListener('change', () => {
            const newValue = this._parseValue(inputEl.value, param);
            if (newValue !== null) {
                this._onValueChange(param, newValue, state);
            }
        });

        // 이벤트: Enter 키로 즉시 반영
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                inputEl.blur();
            }
        });

        // 이벤트: 되돌리기
        revertBtn.addEventListener('click', () => {
            this.revert(param.id);
        });

        return rowEl;
    }

    // ========================================
    // 값 변경 처리
    // ========================================

    /**
     * 입력값을 검증하고 숫자로 변환한다.
     * @private
     * @param {string} rawValue - 입력 문자열
     * @param {object} param - 파라미터 정의
     * @returns {number|null} 유효한 숫자 또는 null
     */
    _parseValue(rawValue, param) {
        const num = Number(rawValue);
        if (isNaN(num)) return null;
        // min/max 범위 클램핑
        return Math.min(Math.max(num, param.min), param.max);
    }

    /**
     * 파라미터 값 변경을 처리한다.
     * @private
     * @param {object} param - 파라미터 정의
     * @param {number} newValue - 새 값
     * @param {object} state - 파라미터 상태 객체
     */
    _onValueChange(param, newValue, state) {
        const oldValue = state.currentValue;
        if (newValue === oldValue) return;

        // 대상 객체에 값 적용
        const target = this._targets[param.target];
        if (target) {
            // 기믹 파라미터인 경우 blockTypes 정의 수정
            if (param.typeId !== undefined && param.field) {
                const typeDef = getBlockType(param.typeId);
                if (typeDef) {
                    typeDef[param.field] = newValue;
                }
            } else {
                target[param.id] = newValue;
            }
        }

        // 상태 업데이트
        state.prevValue = oldValue;
        state.currentValue = newValue;

        // UI 업데이트
        state.inputEl.value = newValue;
        state.prevEl.textContent = oldValue;

        // 변경 강조
        const isChanged = newValue !== param.default;
        state.rowEl.classList.toggle('changed', isChanged);

        // 변경 카운트 업데이트
        this._updateChangeCount();

        // Canvas 리사이즈 트리거 (cellSize, boardPadding 변경 시)
        if (param.resizeOnChange && this._targets.renderer) {
            this._targets.renderer.resize();
        }

        // 이벤트 발행
        eventBus.emit(EVENTS.PARAMETER_CHANGED, {
            paramId: param.id,
            oldValue,
            newValue,
            target: param.target
        });
    }

    /**
     * 변경 카운트를 업데이트한다.
     * @private
     */
    _updateChangeCount() {
        let count = 0;
        for (const [_, state] of this._paramStates) {
            if (state.currentValue !== state.def.default) {
                count++;
            }
        }
        this._changeCount = count;
        if (this._changeCountEl) {
            this._changeCountEl.textContent = count > 0 ? `${count}개 변경됨` : '';
        }
    }

    // ========================================
    // 되돌리기 / 초기화
    // ========================================

    /**
     * 특정 파라미터를 이전 값으로 되돌린다.
     * @param {string} paramId - 파라미터 ID
     */
    revert(paramId) {
        const state = this._paramStates.get(paramId);
        if (!state) return;

        const prevValue = state.prevValue;
        this._onValueChange(state.def, prevValue, state);
    }

    /**
     * 모든 파라미터를 이전 값으로 되돌린다.
     */
    revertAll() {
        for (const [paramId] of this._paramStates) {
            this.revert(paramId);
        }
    }

    /**
     * 모든 파라미터를 기본값으로 초기화한다.
     */
    resetAll() {
        for (const [_, state] of this._paramStates) {
            this._onValueChange(state.def, state.def.default, state);
        }
    }

    // ========================================
    // 기믹 파라미터 동적 추가/제거
    // ========================================

    /**
     * 보드에 기믹이 배치될 때 해당 기믹의 고유 파라미터를 패널에 추가한다.
     * @param {number} typeId - 기믹 타입 ID
     * @param {object} typeDef - 블록 타입 정의
     */
    addGimmickParams(typeId, typeDef) {
        // 이미 추가된 기믹은 중복 방지
        if (this._gimmickSections.has(typeId)) return;

        // 기믹이 아니면 무시
        if (typeDef.blockType !== BLOCK_CATEGORY.GIMMICK) return;

        // 동적 파라미터 목록 생성
        const gimmickParams = [];

        if (typeDef.hp > 0) {
            gimmickParams.push({
                id: `gimmick_${typeId}_hp`,
                label: 'HP',
                default: typeDef.hp,
                min: 1,
                max: 20,
                step: 1,
                unit: '',
                target: 'renderer', // 더미 (실제로는 blockTypes 직접 수정)
                typeId,
                field: 'hp'
            });
        }

        if (typeDef.spreadRate > 0) {
            gimmickParams.push({
                id: `gimmick_${typeId}_spreadRate`,
                label: '확산 속도',
                default: typeDef.spreadRate,
                min: 0,
                max: 5,
                step: 1,
                unit: '칸/턴',
                target: 'renderer',
                typeId,
                field: 'spreadRate'
            });
        }

        if (typeDef.effectRange > 0) {
            gimmickParams.push({
                id: `gimmick_${typeId}_effectRange`,
                label: '효과 범위',
                default: typeDef.effectRange,
                min: 1,
                max: 8,
                step: 1,
                unit: '칸',
                target: 'renderer',
                typeId,
                field: 'effectRange'
            });
        }

        // 파라미터가 없으면 추가하지 않음
        if (gimmickParams.length === 0) return;

        // 카테고리 섹션 생성
        const sectionEl = this._createCategorySection(
            `기믹: ${typeDef.name}`,
            gimmickParams
        );

        // 액션 버튼 영역 앞에 삽입
        const actionsEl = this._container.querySelector('.param-actions');
        if (actionsEl) {
            this._container.insertBefore(sectionEl, actionsEl);
        } else {
            this._container.appendChild(sectionEl);
        }

        this._gimmickSections.set(typeId, sectionEl);
    }

    /**
     * 기믹 파라미터 섹션을 제거한다.
     * @param {number} typeId - 기믹 타입 ID
     */
    removeGimmickParams(typeId) {
        const sectionEl = this._gimmickSections.get(typeId);
        if (sectionEl) {
            // 관련 파라미터 상태 정리
            for (const [paramId] of this._paramStates) {
                if (paramId.startsWith(`gimmick_${typeId}_`)) {
                    this._paramStates.delete(paramId);
                }
            }
            sectionEl.remove();
            this._gimmickSections.delete(typeId);
            this._updateChangeCount();
        }
    }
}
