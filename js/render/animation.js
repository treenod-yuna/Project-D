/**
 * animation.js — 애니메이션 큐 관리 + 이징 함수
 *
 * 스왑, 제거, 낙하, 바운스 등 모든 애니메이션을 큐로 관리한다.
 * 병렬/순차 실행을 지원하며, Promise 기반으로 완료를 대기할 수 있다.
 */

import { eventBus, EVENTS } from '../core/eventBus.js';

// ========================================
// 이징 함수
// ========================================

export const Easing = Object.freeze({
    /** 선형 */
    linear: (t) => t,

    /** 가속 */
    easeIn: (t) => t * t,

    /** 감속 */
    easeOut: (t) => 1 - (1 - t) * (1 - t),

    /** 가속 후 감속 */
    easeInOut: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,

    /** 바운스 */
    bounce: (t) => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
        if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
    },

    /** 탄성 */
    elastic: (t) => {
        if (t === 0 || t === 1) return t;
        return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI / 3));
    }
});

// ========================================
// 애니메이션 타이밍 기본값 (런타임 변경 가능)
// ========================================

/** 스왑 애니메이션 시간 기본값 (ms) */
const DEFAULT_SWAP_DURATION = 200;

/** 제거 애니메이션 시간 기본값 (ms) */
const DEFAULT_REMOVE_DURATION = 150;

/** 낙하 애니메이션 시간/칸 기본값 (ms) */
const DEFAULT_FALL_DURATION_PER_CELL = 115;

/** 낙하 가속 계수 기본값 (0=등속, 1=최대 가속) */
const DEFAULT_FALL_ACCELERATION = 0.3;

/** 바운스 애니메이션 시간 기본값 (ms) */
const DEFAULT_BOUNCE_DURATION = 200;

/** 블록 선택 강조 시간 기본값 (ms) */
const DEFAULT_HIGHLIGHT_PULSE_DURATION = 500;

// ========================================
// AnimationManager 클래스
// ========================================

class AnimationManager {
    /**
     * 애니메이션 매니저를 생성한다.
     * @param {object} renderer - Renderer 인스턴스
     */
    constructor(renderer) {
        /** @type {object} Renderer 인스턴스 */
        this.renderer = renderer;

        /** @type {object[]} 현재 재생 중인 애니메이션 목록 */
        this._activeAnimations = [];

        /** @type {Array<{animations: object[], resolve: Function}>} 대기 큐 (순차 실행용) */
        this._queue = [];

        /** @type {boolean} 큐 처리 중 여부 */
        this._isProcessingQueue = false;

        /** @type {Function|null} waitForAll 대기 resolve */
        this._waitResolve = null;

        // 런타임 변경 가능한 애니메이션 파라미터
        /** @type {number} 스왑 애니메이션 시간 (ms) */
        this.swapDuration = DEFAULT_SWAP_DURATION;
        /** @type {number} 제거 애니메이션 시간 (ms) */
        this.removeDuration = DEFAULT_REMOVE_DURATION;
        /** @type {number} 낙하 애니메이션 시간/칸 (ms) */
        this.fallDurationPerCell = DEFAULT_FALL_DURATION_PER_CELL;
        /** @type {number} 바운스 애니메이션 시간 (ms) */
        this.bounceDuration = DEFAULT_BOUNCE_DURATION;
        /** @type {number} 블록 선택 강조 시간 (ms) */
        this.highlightPulseDuration = DEFAULT_HIGHLIGHT_PULSE_DURATION;
        /** @type {number} 낙하 가속 계수 (0=등속, 1=최대 가속) */
        this.fallAcceleration = DEFAULT_FALL_ACCELERATION;
    }

    // ========================================
    // 큐 관리
    // ========================================

    /**
     * 애니메이션을 큐에 추가한다. (다음 배치로 실행)
     * @param {object} animation - AnimationItem
     */
    enqueue(animation) {
        this.enqueueParallel([animation]);
    }

    /**
     * 여러 애니메이션을 동시에 실행한다.
     * @param {object[]} animations - AnimationItem 배열
     * @returns {Promise<void>} 모든 애니메이션 완료 시 resolve
     */
    enqueueParallel(animations) {
        return new Promise(resolve => {
            // 즉시 active에 추가
            for (const anim of animations) {
                anim._startTime = performance.now();
                anim._resolved = false;
                this._activeAnimations.push(anim);
            }

            // 모든 애니메이션 완료 감시
            const checkDone = () => {
                if (animations.every(a => a._resolved)) {
                    resolve();
                } else {
                    requestAnimationFrame(checkDone);
                }
            };
            requestAnimationFrame(checkDone);
        });
    }

    /**
     * 여러 애니메이션 그룹을 순차적으로 실행한다.
     * @param {Array<object[]>} groups - AnimationItem 배열의 배열
     * @returns {Promise<void>}
     */
    async enqueueSequential(groups) {
        for (const group of groups) {
            await this.enqueueParallel(group);
        }
    }

    /**
     * 현재 재생 중인 애니메이션이 있는지 확인한다.
     * @returns {boolean}
     */
    isPlaying() {
        return this._activeAnimations.length > 0;
    }

    /**
     * 모든 애니메이션을 즉시 중단한다.
     */
    clear() {
        for (const anim of this._activeAnimations) {
            if (anim.onComplete) anim.onComplete();
            anim._resolved = true;
        }
        this._activeAnimations = [];
        this._queue = [];
    }

    /**
     * 현재 모든 애니메이션이 완료될 때까지 대기한다.
     * @returns {Promise<void>}
     */
    waitForAll() {
        if (this._activeAnimations.length === 0) {
            return Promise.resolve();
        }
        return new Promise(resolve => {
            this._waitResolve = resolve;
        });
    }

    // ========================================
    // 프레임 업데이트
    // ========================================

    /**
     * 매 프레임 호출하여 애니메이션을 업데이트한다.
     * @param {number} timestamp - performance.now() 값
     */
    update(timestamp) {
        const completed = [];

        for (const anim of this._activeAnimations) {
            const elapsed = timestamp - anim._startTime;
            const progress = Math.min(elapsed / anim.duration, 1);
            const easingFn = Easing[anim.easing] || Easing.linear;
            const easedProgress = easingFn(progress);

            // 애니메이션 유형별 업데이트
            if (anim.updateFn) {
                anim.updateFn(easedProgress, anim);
            }

            // 완료 처리
            if (progress >= 1) {
                if (anim.onComplete) anim.onComplete();
                anim._resolved = true;
                completed.push(anim);
            }
        }

        // 완료된 애니메이션 제거
        if (completed.length > 0) {
            this._activeAnimations = this._activeAnimations.filter(
                a => !completed.includes(a)
            );

            // waitForAll 대기 해제
            if (this._activeAnimations.length === 0 && this._waitResolve) {
                this._waitResolve();
                this._waitResolve = null;
            }
        }
    }

    // ========================================
    // 낙하 시간 계산 (가속 반영)
    // ========================================

    /**
     * 낙하 거리에 따른 애니메이션 시간을 계산한다.
     * fallAcceleration이 클수록 먼 거리의 낙하가 상대적으로 빨라진다.
     * 공식: fallDurationPerCell × distance^(1 - fallAcceleration × 0.5)
     * - accel=0: 등속 (시간 = 거리에 비례)
     * - accel=0.3: 가벼운 가속
     * - accel=1.0: 강한 가속 (√distance 비례)
     * @param {number} distance - 낙하 거리 (칸 수, 소수점 가능)
     * @returns {number} 애니메이션 시간 (ms)
     */
    _calcFallDuration(distance) {
        if (distance <= 0) return this.fallDurationPerCell;
        const exponent = 1 - this.fallAcceleration * 0.5;
        return this.fallDurationPerCell * Math.pow(distance, exponent);
    }

    // ========================================
    // 팩토리 메서드 — 애니메이션 생성
    // ========================================

    /**
     * 스왑 애니메이션을 생성한다.
     * 두 블록이 서로의 위치로 부드럽게 이동한다.
     * @param {object} block1 - 첫 번째 Block
     * @param {object} block2 - 두 번째 Block
     * @param {object} renderer - Renderer 인스턴스
     * @returns {object} AnimationItem
     */
    createSwapAnimation(block1, block2, renderer) {
        const cellSize = renderer.cellSize;
        const padding = renderer.boardPadding;

        // 시작 위치 (스왑 전)
        const start1X = padding + block1.col * cellSize;
        const start1Y = padding + block1.row * cellSize;
        const start2X = padding + block2.col * cellSize;
        const start2Y = padding + block2.row * cellSize;

        // 목표 위치 (서로 교환)
        const end1X = start2X;
        const end1Y = start2Y;
        const end2X = start1X;
        const end2Y = start1Y;

        return {
            type: 'swap',
            targets: [block1, block2],
            duration: this.swapDuration,
            easing: 'easeInOut',
            updateFn: (progress) => {
                block1.visualX = start1X + (end1X - start1X) * progress;
                block1.visualY = start1Y + (end1Y - start1Y) * progress;
                block2.visualX = start2X + (end2X - start2X) * progress;
                block2.visualY = start2Y + (end2Y - start2Y) * progress;
            },
            onComplete: () => {
                block1.visualX = end1X;
                block1.visualY = end1Y;
                block2.visualX = end2X;
                block2.visualY = end2Y;
            }
        };
    }

    /**
     * 스왑 되돌리기 애니메이션을 생성한다.
     * @param {object} block1
     * @param {object} block2
     * @param {object} renderer
     * @returns {object} AnimationItem
     */
    createSwapBackAnimation(block1, block2, renderer) {
        // 되돌리기는 스왑과 동일하지만 타입이 다름
        const anim = this.createSwapAnimation(block1, block2, renderer);
        anim.type = 'swapBack';
        return anim;
    }

    /**
     * 제거 애니메이션을 생성한다.
     * 블록이 축소되며 투명해진다.
     * @param {object} block - Block 객체
     * @returns {object} AnimationItem
     */
    createRemoveAnimation(block) {
        return {
            type: 'remove',
            targets: [block],
            duration: this.removeDuration,
            easing: 'easeInOut',
            updateFn: (progress) => {
                block.scale = 1.0 - progress * 0.8; // 1.0 → 0.2
                block.alpha = 1.0 - progress;        // 1.0 → 0.0
            },
            onComplete: () => {
                block.scale = 0;
                block.alpha = 0;
                block.state = 'removing';
            }
        };
    }

    /**
     * 낙하 애니메이션을 생성한다.
     * @param {object} block - Block 객체
     * @param {number} fromRow - 시작 행
     * @param {number} toRow - 목표 행
     * @param {object} renderer - Renderer 인스턴스
     * @returns {object} AnimationItem
     */
    createFallAnimation(block, fromRow, toRow, renderer) {
        const distance = toRow - fromRow;
        const cellSize = renderer.cellSize;
        const padding = renderer.boardPadding;

        const startY = padding + fromRow * cellSize;
        const endY = padding + toRow * cellSize;
        const startX = padding + block.col * cellSize;

        return {
            type: 'fall',
            targets: [block],
            duration: this._calcFallDuration(distance),
            easing: 'easeOut',
            updateFn: (progress) => {
                block.visualX = startX;
                block.visualY = startY + (endY - startY) * progress;
            },
            onComplete: () => {
                block.visualX = startX;
                block.visualY = endY;
            }
        };
    }

    /**
     * 바운스 애니메이션을 생성한다. (착지 시)
     * @param {object} block - Block 객체
     * @returns {object} AnimationItem
     */
    createBounceAnimation(block) {
        return {
            type: 'bounce',
            targets: [block],
            duration: this.bounceDuration,
            easing: 'bounce',
            updateFn: (progress) => {
                // 살짝 압축 후 복원
                block.scale = 1.0 - 0.1 * Math.sin(progress * Math.PI);
            },
            onComplete: () => {
                block.scale = 1.0;
            }
        };
    }

    /**
     * 흔들림 애니메이션을 생성한다.
     * @param {object[]} targets - Block 배열
     * @param {number} intensity - 흔들림 강도 (픽셀)
     * @returns {object} AnimationItem
     */
    createShakeAnimation(targets, intensity = 3) {
        const originalPositions = targets.map(t => ({
            x: t.visualX,
            y: t.visualY
        }));

        return {
            type: 'shake',
            targets,
            duration: 300,
            easing: 'linear',
            updateFn: (progress) => {
                const shake = Math.sin(progress * Math.PI * 6) * intensity * (1 - progress);
                targets.forEach((t, i) => {
                    t.visualX = originalPositions[i].x + shake;
                });
            },
            onComplete: () => {
                targets.forEach((t, i) => {
                    t.visualX = originalPositions[i].x;
                });
            }
        };
    }

    /**
     * 매치 강조 애니메이션을 생성한다.
     * 매치된 블록이 잠깐 커졌다가 제거된다.
     * @param {object} block - Block 객체
     * @returns {object} AnimationItem
     */
    createMatchHighlightAnimation(block) {
        return {
            type: 'matchHighlight',
            targets: [block],
            duration: 150,
            easing: 'easeOut',
            updateFn: (progress) => {
                // 약간 확대 후 원래 크기
                block.scale = 1.0 + 0.15 * Math.sin(progress * Math.PI);
            },
            onComplete: () => {
                block.scale = 1.0;
            }
        };
    }

    /**
     * 경로(웨이포인트) 기반 낙하 애니메이션을 생성한다.
     * 대각선 슬라이드를 포함한 다단계 이동을 정확히 재현한다.
     *
     * @param {object} block - Block 객체
     * @param {object[]} path - 웨이포인트 배열 [{row, col}, ...]
     * @param {object} renderer - Renderer 인스턴스
     * @returns {object} AnimationItem
     */
    createPathAnimation(block, path, renderer) {
        const cellSize = renderer.cellSize;
        const padding = renderer.boardPadding;

        // 각 세그먼트의 거리 계산
        const segments = [];
        let totalDistance = 0;

        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            const dx = to.col - from.col;
            const dy = to.row - from.row;
            const dist = Math.sqrt(dx * dx + dy * dy);
            segments.push({ from, to, dist });
            totalDistance += dist;
        }

        // 총 이동 거리 기반 시간 계산 (가속 반영, 최소 1칸 시간 보장)
        const duration = Math.max(
            this._calcFallDuration(totalDistance),
            this.fallDurationPerCell
        );

        // 최종 위치 미리 계산
        const lastPoint = path[path.length - 1];
        const finalX = padding + lastPoint.col * cellSize;
        const finalY = padding + lastPoint.row * cellSize;

        return {
            type: 'path',
            targets: [block],
            duration,
            easing: 'easeOut',
            updateFn: (progress) => {
                // progress(0~1)를 거리 기반으로 세그먼트 위치로 변환
                const targetDist = progress * totalDistance;
                let accumulated = 0;

                for (let i = 0; i < segments.length; i++) {
                    const seg = segments[i];

                    if (accumulated + seg.dist >= targetDist || i === segments.length - 1) {
                        // 이 세그먼트 내에서의 진행률
                        const segProgress = seg.dist > 0
                            ? Math.min(Math.max((targetDist - accumulated) / seg.dist, 0), 1)
                            : 1;

                        const fromX = padding + seg.from.col * cellSize;
                        const fromY = padding + seg.from.row * cellSize;
                        const toX = padding + seg.to.col * cellSize;
                        const toY = padding + seg.to.row * cellSize;

                        block.visualX = fromX + (toX - fromX) * segProgress;
                        block.visualY = fromY + (toY - fromY) * segProgress;
                        return;
                    }
                    accumulated += seg.dist;
                }
            },
            onComplete: () => {
                block.visualX = finalX;
                block.visualY = finalY;
            }
        };
    }

    /**
     * 선택 블록 강조 (펄스) 애니메이션을 생성한다.
     * @param {object} block - Block 객체
     * @returns {object} AnimationItem
     */
    createSelectionPulse(block) {
        return {
            type: 'selectionPulse',
            targets: [block],
            duration: this.highlightPulseDuration,
            easing: 'linear',
            updateFn: (progress) => {
                block.scale = 1.0 + 0.05 * Math.sin(progress * Math.PI * 2);
            },
            onComplete: () => {
                block.scale = 1.0;
            }
        };
    }
}

// ========================================
// 내보내기
// ========================================

export { AnimationManager, DEFAULT_SWAP_DURATION, DEFAULT_REMOVE_DURATION, DEFAULT_FALL_DURATION_PER_CELL, DEFAULT_FALL_ACCELERATION };
