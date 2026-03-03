/**
 * cascade.js — 연쇄 처리 + 턴 오케스트레이션
 *
 * 매치→특수블록생성→제거→특수블록발동→낙하→리필→재매치를 반복하는 연쇄 루프.
 * 특수 블록 조합(스왑), 레인보우 발동도 처리한다.
 * 셔플 감지 및 실행도 담당한다.
 */

import { eventBus, EVENTS } from './eventBus.js';
import { getBlockType, BLOCK_CATEGORY, getNormalTypes } from './blockTypes.js';
import { createBlock } from './board.js';

// ========================================
// 상수 정의
// ========================================

/** 최대 연쇄 반복 횟수 (무한루프 방지) */
const MAX_CASCADE_ITERATIONS = 50;

/** 셔플 최대 시도 횟수 */
const MAX_SHUFFLE_ATTEMPTS = 100;

/** 특수 블록 생성 우선순위 (높을수록 우선) */
const SPECIAL_CREATION_PRIORITY = Object.freeze({
    9: 4,   // RAINBOW — 최우선
    8: 3,   // BOMB
    6: 2,   // H_ROCKET
    7: 2,   // V_ROCKET
    10: 1   // GUIDED_BOMB — 최하위
});

// ========================================
// CascadeManager 클래스
// ========================================

class CascadeManager {
    /**
     * 연쇄 매니저를 생성한다.
     * @param {object} board - Board 인스턴스
     * @param {object} matchDetector - MatchDetector 인스턴스
     * @param {object} gravityHandler - GravityHandler 인스턴스
     * @param {object} specialBlockManager - SpecialBlockManager 인스턴스
     * @param {object} animationManager - AnimationManager 인스턴스
     * @param {object} renderer - Renderer 인스턴스
     */
    constructor(board, matchDetector, gravityHandler, specialBlockManager, animationManager, renderer, gimmickManager) {
        /** @type {object} Board */
        this.board = board;
        /** @type {object} MatchDetector */
        this.matchDetector = matchDetector;
        /** @type {object} GravityHandler */
        this.gravityHandler = gravityHandler;
        /** @type {object} SpecialBlockManager */
        this.specialBlockManager = specialBlockManager;
        /** @type {object} AnimationManager */
        this.animationManager = animationManager;
        /** @type {object} Renderer */
        this.renderer = renderer;
        /** @type {object|null} GimmickManager (선택적) */
        this.gimmickManager = gimmickManager || null;

        /** @type {boolean} 턴 처리 중 여부 */
        this.isProcessing = false;
        /** @type {number} 현재 연쇄 단계 */
        this.currentStep = 0;
    }

    // ========================================
    // 턴 실행
    // ========================================

    /**
     * 더블탭으로 특수 블록을 제자리에서 발동하고 턴을 실행한다.
     * @param {object} block - 발동할 특수 블록
     * @returns {object} TurnResult
     */
    async executeDoubleTapTurn(block) {
        if (this.isProcessing) return null;
        this.isProcessing = true;
        this.currentStep = 0;

        const turnResult = {
            steps: [],
            totalRemoved: 0,
            totalCascades: 0,
            score: 0
        };

        try {
            // 특수 블록 발동 (DFS 연쇄 포함)
            const removedCount = await this._activateSpecials([block]);

            turnResult.steps.push({
                step: 0,
                matches: [],
                removedCount,
                removedBlocks: [],
                specialsCreated: 0,
                specialsActivated: 1
            });
            turnResult.totalRemoved += removedCount;
            turnResult.totalCascades++;

            // 연쇄 루프 (낙하→리필→재매치)
            const cascadeSteps = await this.executeCascadeLoop();
            for (const step of cascadeSteps) {
                turnResult.steps.push(step);
                turnResult.totalRemoved += step.removedCount;
                turnResult.totalCascades++;
            }

            // 확산형 기믹 처리 (턴당 1회)
            if (this.gimmickManager) {
                this.gimmickManager.processSpread();
            }

            // 셔플 검사
            if (!this.matchDetector.hasAnyValidMove()) {
                eventBus.emit(EVENTS.SHUFFLE_NEEDED, {});
                this._executeShuffle();
                eventBus.emit(EVENTS.SHUFFLE_COMPLETE, {});
            }

            turnResult.score = turnResult.totalRemoved * 10 * Math.max(1, turnResult.totalCascades);

            eventBus.emit(EVENTS.CASCADE_COMPLETE, { result: turnResult });
            eventBus.emit(EVENTS.TURN_END, { turnNumber: this.currentStep });

        } finally {
            this.isProcessing = false;
        }

        return turnResult;
    }

    /**
     * 스왑 결과를 받아 전체 턴을 실행한다.
     * 매치→제거→낙하→리필→연쇄→셔플 검사까지.
     * 특수 블록 조합/레인보우 스왑도 처리한다.
     * @param {object} swapResult - SwapHandler.trySwap() 반환값
     * @returns {object} TurnResult
     */
    async executeTurn(swapResult) {
        if (this.isProcessing) return null;
        this.isProcessing = true;
        this.currentStep = 0;

        const turnResult = {
            steps: [],
            totalRemoved: 0,
            totalCascades: 0,
            score: 0
        };

        try {
            // --- 특수 블록 조합 스왑 처리 ---
            if (swapResult.isCombination) {
                const step = await this._handleCombination(swapResult);
                if (step) {
                    turnResult.steps.push(step);
                    turnResult.totalRemoved += step.removedCount;
                    turnResult.totalCascades++;
                }
            }
            // --- 특수 블록 + 일반 블록 스왑: 즉시 발동 ---
            else if (swapResult.isSpecialActivation) {
                const step = await this._handleSpecialActivation(swapResult);
                if (step) {
                    turnResult.steps.push(step);
                    turnResult.totalRemoved += step.removedCount;
                    turnResult.totalCascades++;
                }
            }
            // --- 레인보우 + 일반 블록 스왑 처리 ---
            else if (swapResult.isRainbowActivation) {
                const step = await this._handleRainbowActivation(swapResult);
                if (step) {
                    turnResult.steps.push(step);
                    turnResult.totalRemoved += step.removedCount;
                    turnResult.totalCascades++;
                }
            }
            // --- 일반 매치 처리 ---
            else if (swapResult.matchResults && swapResult.matchResults.length > 0) {
                const step = await this._processCascadeStep(swapResult.matchResults);
                turnResult.steps.push(step);
                turnResult.totalRemoved += step.removedCount;
                turnResult.totalCascades++;
            }

            // 연쇄 루프
            const cascadeSteps = await this.executeCascadeLoop();
            for (const step of cascadeSteps) {
                turnResult.steps.push(step);
                turnResult.totalRemoved += step.removedCount;
                turnResult.totalCascades++;
            }

            // 확산형 기믹 처리 (턴당 1회)
            if (this.gimmickManager) {
                this.gimmickManager.processSpread();
            }

            // 셔플 검사
            if (!this.matchDetector.hasAnyValidMove()) {
                eventBus.emit(EVENTS.SHUFFLE_NEEDED, {});
                this._executeShuffle();
                eventBus.emit(EVENTS.SHUFFLE_COMPLETE, {});
            }

            // 점수 계산 (제거 블록 수 × 10 × 연쇄 보너스)
            turnResult.score = turnResult.totalRemoved * 10 * Math.max(1, turnResult.totalCascades);

            eventBus.emit(EVENTS.CASCADE_COMPLETE, { result: turnResult });
            eventBus.emit(EVENTS.TURN_END, { turnNumber: this.currentStep });

        } finally {
            this.isProcessing = false;
        }

        return turnResult;
    }

    /**
     * 연쇄 루프를 실행한다. (낙하/리필 후 재매치 반복)
     * @returns {object[]} CascadeStep 배열
     */
    async executeCascadeLoop() {
        const steps = [];
        let iteration = 0;

        while (iteration < MAX_CASCADE_ITERATIONS) {
            iteration++;
            this.currentStep++;

            // 낙하 + 리필
            await this._executeGravityAndRefill();

            // 재매치 감지
            const matches = this.matchDetector.findAllMatches();
            if (matches.length === 0) break;

            console.log(`[연쇄] ${iteration}단계: ${matches.length}개 매치 감지`);

            // 연쇄 매치 처리 (특수 블록 생성/발동 포함)
            const step = await this._processCascadeStep(matches);
            step.step = iteration;
            steps.push(step);

            eventBus.emit(EVENTS.CASCADE_STEP, { step });
        }

        if (iteration >= MAX_CASCADE_ITERATIONS) {
            console.warn(`[연쇄] 최대 반복 횟수(${MAX_CASCADE_ITERATIONS}) 도달!`);
        }

        return steps;
    }

    // ========================================
    // 연쇄 단계 처리
    // ========================================

    /**
     * 한 연쇄 단계를 처리한다.
     * 1. 매치 위치 수집
     * 2. 특수 블록 생성 (4+, L, T 매치)
     * 3. 매치된 블록 제거 (새 특수 블록 위치 제외)
     * 4. 기존 특수 블록 발동 (DFS 연쇄)
     * 5. 발동으로 제거된 추가 블록 처리
     *
     * @private
     * @param {object[]} matches - MatchResult 배열
     * @returns {object} CascadeStep
     */
    async _processCascadeStep(matches) {
        const sbm = this.specialBlockManager;

        // --- 1. 매치 위치 수집 + 특수 블록 분류 ---
        const removedPositions = new Set();
        const removedBlocks = [];
        const specialsToActivate = [];   // 발동할 기존 특수 블록 정보
        const specialsToCreate = [];     // 생성할 새 특수 블록
        const specialCreatedPositions = new Set(); // 새 특수 블록 배치 위치

        for (const match of matches) {
            // 새 특수 블록 생성 대상인지 확인
            if (match.specialBlockType && match.specialBlockPosition) {
                const specialBlock = sbm.createSpecialFromMatch(match);
                if (specialBlock) {
                    specialsToCreate.push({
                        block: specialBlock,
                        position: match.specialBlockPosition,
                        match
                    });
                }
            }

            // 매치에 포함된 기존 특수 블록 수집
            if (match.specialsToActivate) {
                for (const s of match.specialsToActivate) {
                    specialsToActivate.push({ ...s.block, row: s.row, col: s.col });
                }
            }

            // 매치 위치 수집
            for (const pos of match.positions) {
                const key = `${pos.row},${pos.col}`;
                if (!removedPositions.has(key)) {
                    removedPositions.add(key);
                    const block = this.board.getBlock(pos.row, pos.col);
                    if (block) {
                        removedBlocks.push({ ...pos, block });
                    }
                }
            }
        }

        // --- 1-b. 같은 위치에 여러 특수 블록 생성 시 우선순위 필터링 ---
        const filteredSpecials = this._filterSpecialsByPriority(specialsToCreate);
        for (const { position } of filteredSpecials) {
            specialCreatedPositions.add(
                `${position.row},${position.col}`
            );
        }

        eventBus.emit(EVENTS.MATCH_DETECTED, { matches, step: this.currentStep });

        // --- 2. 매치 강조 애니메이션 ---
        const highlightAnims = [];
        for (const { row, col } of removedBlocks) {
            const block = this.board.getBlock(row, col);
            if (block) {
                highlightAnims.push(
                    this.animationManager.createMatchHighlightAnimation(block)
                );
            }
        }
        if (highlightAnims.length > 0) {
            await this.animationManager.enqueueParallel(highlightAnims);
        }

        // --- 3. 제거 애니메이션 (새 특수 블록 위치 제외) ---
        eventBus.emit(EVENTS.BLOCKS_REMOVING, {
            blocks: removedBlocks,
            positions: Array.from(removedPositions)
        });

        const removeAnims = [];
        for (const { row, col } of removedBlocks) {
            const key = `${row},${col}`;
            // 새 특수 블록이 배치될 위치는 제거 애니메이션 스킵
            if (specialCreatedPositions.has(key)) continue;

            const block = this.board.getBlock(row, col);
            if (block) {
                removeAnims.push(
                    this.animationManager.createRemoveAnimation(block)
                );
            }
        }
        if (removeAnims.length > 0) {
            await this.animationManager.enqueueParallel(removeAnims);
        }

        // --- 4. 보드에서 제거 ---
        for (const { row, col } of removedBlocks) {
            this.board.removeBlock(row, col);
        }

        // --- 4-1. 인접 기믹 데미지 처리 ---
        if (this.gimmickManager) {
            this.gimmickManager.processAdjacentDamage(
                removedBlocks.map(b => ({ row: b.row, col: b.col }))
            );
        }

        // --- 5. 기존 특수 블록 발동 (DFS 연쇄) — 새 특수 배치 전에 먼저 발동 ---
        let additionalRemoved = 0;
        if (specialsToActivate.length > 0) {
            additionalRemoved = await this._activateSpecials(specialsToActivate);
        }

        // --- 6. 새 특수 블록 배치 (우선순위 필터링 적용) ---
        for (const { block, position } of filteredSpecials) {
            block.row = position.row;
            block.col = position.col;
            this.board.setBlock(position.row, position.col, block);

            console.log(`[특수블록] 생성: ${getBlockType(block.typeId)?.name} at (${position.row},${position.col})`);
            eventBus.emit(EVENTS.SPECIAL_CREATED, {
                block,
                matchType: block.typeId,
                position
            });
        }

        this._resetBlockVisuals();

        eventBus.emit(EVENTS.BLOCKS_REMOVED, {
            positions: removedBlocks.map(b => ({ row: b.row, col: b.col })),
            count: removedBlocks.length + additionalRemoved,
            step: this.currentStep
        });

        return {
            step: this.currentStep,
            matches,
            removedCount: removedBlocks.length - filteredSpecials.length + additionalRemoved,
            removedBlocks,
            specialsCreated: filteredSpecials.length,
            specialsActivated: specialsToActivate.length
        };
    }

    // ========================================
    // 특수 블록 생성 우선순위 필터링
    // ========================================

    /**
     * 같은 위치에 여러 특수 블록이 생성되려 할 때 우선순위가 높은 것만 남긴다.
     * 우선순위: RAINBOW(9) > BOMB(8) > ROCKET(6,7) > GUIDED_BOMB(10)
     * @private
     * @param {object[]} specialsToCreate - { block, position, match } 배열
     * @returns {object[]} 필터링된 배열
     */
    _filterSpecialsByPriority(specialsToCreate) {
        if (specialsToCreate.length <= 1) return specialsToCreate;

        // 위치별로 그룹핑
        const positionMap = new Map();
        for (const entry of specialsToCreate) {
            const key = `${entry.position.row},${entry.position.col}`;
            if (!positionMap.has(key)) {
                positionMap.set(key, []);
            }
            positionMap.get(key).push(entry);
        }

        // 각 위치에서 우선순위가 가장 높은 것만 선택
        const result = [];
        for (const entries of positionMap.values()) {
            if (entries.length === 1) {
                result.push(entries[0]);
            } else {
                // 우선순위 비교로 최고 우선순위 선택
                let best = entries[0];
                let bestPriority = SPECIAL_CREATION_PRIORITY[best.block.typeId] || 0;
                for (let i = 1; i < entries.length; i++) {
                    const p = SPECIAL_CREATION_PRIORITY[entries[i].block.typeId] || 0;
                    if (p > bestPriority) {
                        best = entries[i];
                        bestPriority = p;
                    }
                }
                result.push(best);
                console.log(`[우선순위] 위치 (${best.position.row},${best.position.col}): ${getBlockType(best.block.typeId)?.name} 선택 (${entries.length}개 중)`);
            }
        }

        return result;
    }

    // ========================================
    // 특수 블록 발동 처리
    // ========================================

    /**
     * 특수 블록 목록을 발동한다. (DFS 연쇄 포함)
     * @private
     * @param {object[]} specials - 발동할 특수 블록 정보 배열
     * @returns {number} 추가 제거된 블록 수
     */
    async _activateSpecials(specials) {
        const sbm = this.specialBlockManager;
        const allAffectedMap = new Map();

        for (const special of specials) {
            console.log(`[특수블록] 발동: ${getBlockType(special.typeId)?.name} at (${special.row},${special.col})`);

            // DFS 연쇄 발동
            const { allAffected, activations } = sbm.activateSpecialChain(special);

            for (const pos of allAffected) {
                allAffectedMap.set(`${pos.row},${pos.col}`, pos);
            }

            eventBus.emit(EVENTS.SPECIAL_ACTIVATED, {
                block: special,
                affectedPositions: allAffected,
                activations
            });
        }

        // 영향 받은 위치의 블록 제거
        const affectedPositions = Array.from(allAffectedMap.values());

        // --- 특수 블록 범위 내 기믹 데미지 ---
        if (this.gimmickManager) {
            this.gimmickManager.processSpecialDamage(affectedPositions, 'bomb');
        }

        const blocksToRemove = [];

        for (const pos of affectedPositions) {
            const block = this.board.getBlock(pos.row, pos.col);
            if (!block) continue;

            // invincible 기믹은 제거 대상에서 제외
            const typeDef = getBlockType(block.typeId);
            if (typeDef && typeDef.invincible) continue;

            blocksToRemove.push({ ...pos, block });
        }

        if (blocksToRemove.length > 0) {
            // 제거 애니메이션
            const removeAnims = [];
            for (const { row, col } of blocksToRemove) {
                const block = this.board.getBlock(row, col);
                if (block) {
                    removeAnims.push(
                        this.animationManager.createRemoveAnimation(block)
                    );
                }
            }
            if (removeAnims.length > 0) {
                await this.animationManager.enqueueParallel(removeAnims);
            }

            // 보드에서 제거
            for (const { row, col } of blocksToRemove) {
                this.board.removeBlock(row, col);
            }

            this._resetBlockVisuals();
        }

        return blocksToRemove.length;
    }

    // ========================================
    // 특수 블록 조합 처리
    // ========================================

    /**
     * 특수+특수 스왑 조합을 처리한다.
     * @private
     * @param {object} swapResult - 조합 정보 포함된 SwapResult
     * @returns {object} CascadeStep
     */
    async _handleCombination(swapResult) {
        const sbm = this.specialBlockManager;
        const [block1, block2] = swapResult.combinationBlocks;

        if (!block1 || !block2) return null;

        console.log(`[조합] ${getBlockType(block1.typeId)?.name} + ${getBlockType(block2.typeId)?.name}`);

        // 조합 효과 계산
        const combo = sbm.combineTwoSpecials(block1, block2);

        eventBus.emit(EVENTS.SPECIALS_COMBINED, {
            block1, block2, effect: combo
        });

        // 두 블록 제거
        this.board.removeBlock(block1.row, block1.col);
        this.board.removeBlock(block2.row, block2.col);

        // 레인보우+특수 조합: 색상 블록을 특수 블록으로 변환 후 발동
        if (combo.conversions && combo.conversions.length > 0) {
            return await this._handleRainbowSpecialCombo(combo);
        }

        // 일반 조합: 영향 범위 블록 제거
        return await this._removeAffectedBlocks(combo.affected, combo.type);
    }

    /**
     * 특수 블록 + 일반 블록 스왑을 처리한다.
     * 스왑된 위치에서 특수 블록을 즉시 발동한다.
     * @private
     * @param {object} swapResult - 특수 블록 정보 포함된 SwapResult
     * @returns {object} CascadeStep
     */
    async _handleSpecialActivation(swapResult) {
        const special = swapResult.specialBlock;
        if (!special) return null;

        console.log(`[특수 발동] ${getBlockType(special.typeId)?.name} at (${special.row},${special.col})`);

        // 특수 블록 발동 (DFS 연쇄 포함)
        const removedCount = await this._activateSpecials([special]);

        return {
            step: this.currentStep,
            matches: [],
            removedCount,
            removedBlocks: [],
            specialsCreated: 0,
            specialsActivated: 1
        };
    }

    /**
     * 레인보우 + 일반 블록 스왑을 처리한다.
     * @private
     * @param {object} swapResult - 레인보우 정보 포함된 SwapResult
     * @returns {object} CascadeStep
     */
    async _handleRainbowActivation(swapResult) {
        const sbm = this.specialBlockManager;
        const rainbow = swapResult.rainbowBlock;
        const target = swapResult.targetBlock;

        if (!rainbow || !target) return null;

        // 레인보우 블록 제거
        this.board.removeBlock(rainbow.row, rainbow.col);

        // 대상이 특수 블록이면 조합 처리
        if (sbm.isSpecialBlock(target)) {
            const combo = sbm.combineTwoSpecials(rainbow, target);
            this.board.removeBlock(target.row, target.col);

            if (combo.conversions && combo.conversions.length > 0) {
                return await this._handleRainbowSpecialCombo(combo);
            }
            return await this._removeAffectedBlocks(combo.affected, combo.type);
        }

        // 일반 블록이면 해당 색상 전체 제거
        const combo = sbm.rainbowNormalCombo(target);
        console.log(`[레인보우] 색상 ${target.typeId} 전체 제거: ${combo.affected.length}개`);

        return await this._removeAffectedBlocks(combo.affected, 'rainbowNormal');
    }

    /**
     * 레인보우+특수 조합: 해당 색 블록을 특수 블록으로 변환 후 개별 발동
     * @private
     * @param {object} combo - 조합 결과
     * @returns {object} CascadeStep
     */
    async _handleRainbowSpecialCombo(combo) {
        const convertedSpecials = [];

        // 색상 블록을 특수 블록으로 변환 (색상 독립)
        for (const conv of combo.conversions) {
            const existing = this.board.getBlock(conv.row, conv.col);
            if (!existing) continue;

            const newBlock = createBlock(conv.convertToTypeId, conv.row, conv.col);
            this.board.setBlock(conv.row, conv.col, newBlock);
            convertedSpecials.push(newBlock);
        }

        // 변환된 특수 블록 각각 발동
        let totalRemoved = 0;
        for (const special of convertedSpecials) {
            totalRemoved += await this._activateSpecials([special]);
        }

        this._resetBlockVisuals();

        return {
            step: this.currentStep,
            matches: [],
            removedCount: totalRemoved,
            removedBlocks: [],
            specialsCreated: 0,
            specialsActivated: convertedSpecials.length
        };
    }

    /**
     * 영향 범위의 블록을 제거한다. (조합/레인보우 효과용)
     * 범위 내 특수 블록은 DFS 연쇄 발동한다.
     * @private
     * @param {Array<{row,col}>} affected - 영향 위치 배열
     * @param {string} effectType - 효과 타입명 (로그용)
     * @returns {object} CascadeStep
     */
    async _removeAffectedBlocks(affected, effectType) {
        const sbm = this.specialBlockManager;
        const blocksToRemove = [];
        const chainingSpecials = [];

        // --- 범위 내 기믹 데미지 ---
        if (this.gimmickManager) {
            const damageType = effectType === 'rainbowNormal' ? 'rainbow' : 'bomb';
            this.gimmickManager.processSpecialDamage(affected, damageType);
        }

        for (const pos of affected) {
            const block = this.board.getBlock(pos.row, pos.col);
            if (!block) continue;

            // invincible 기믹은 제거 대상에서 제외
            const typeDef = getBlockType(block.typeId);
            if (typeDef && typeDef.invincible) continue;

            // 범위 내 특수 블록은 연쇄 발동 목록에 추가
            if (sbm.isSpecialBlock(block)) {
                chainingSpecials.push({ ...block });
            }
            blocksToRemove.push({ ...pos, block });
        }

        // 연쇄 대상 특수 블록 위치 (보드에 유지하여 DFS 탐색 가능하게)
        const chainingPositions = new Set(
            chainingSpecials.map(s => `${s.row},${s.col}`)
        );

        // 제거 애니메이션 (연쇄 대상 특수 블록 제외 — DFS 발동 시 개별 제거됨)
        if (blocksToRemove.length > 0) {
            const removeAnims = [];
            for (const { row, col } of blocksToRemove) {
                if (chainingPositions.has(`${row},${col}`)) continue;
                const block = this.board.getBlock(row, col);
                if (block) {
                    removeAnims.push(
                        this.animationManager.createRemoveAnimation(block)
                    );
                }
            }
            if (removeAnims.length > 0) {
                await this.animationManager.enqueueParallel(removeAnims);
            }

            // 보드에서 제거 (연쇄 대상은 유지 — DFS에서 탐색 후 제거됨)
            for (const { row, col } of blocksToRemove) {
                if (chainingPositions.has(`${row},${col}`)) continue;
                this.board.removeBlock(row, col);
            }

            // --- 레인보우 인접 기믹 간접 데미지 ---
            if (this.gimmickManager && effectType === 'rainbowNormal') {
                this.gimmickManager.processAdjacentDamage(
                    blocksToRemove.map(b => ({ row: b.row, col: b.col })),
                    'rainbowDamage'
                );
            }
        }

        this._resetBlockVisuals();

        // 연쇄 발동 (특수 블록이 보드에 남아있어 DFS가 정상 탐색)
        let chainRemoved = 0;
        if (chainingSpecials.length > 0) {
            chainRemoved = await this._activateSpecials(chainingSpecials);
        }

        return {
            step: this.currentStep,
            matches: [],
            removedCount: (blocksToRemove.length - chainingSpecials.length) + chainRemoved,
            removedBlocks: blocksToRemove,
            specialsCreated: 0,
            specialsActivated: chainingSpecials.length
        };
    }

    // ========================================
    // 중력 + 리필
    // ========================================

    /**
     * 중력 낙하 + 리필 + 대각선 슬라이드를 실행한다.
     *
     * 핵심 원칙: "수직 리필이 대각선 슬라이드보다 항상 우선한다."
     *
     *   Step 1: Falls  — 기존 블록 수직 낙하
     *   Step 2: Refill — 빈칸을 새 블록으로 채움 (슬라이드보다 먼저!)
     *   Step 3: Settle — Falls → Slides → PostFalls (리필이 못 채운 영역만 슬라이드)
     *   Step 4: Refill — 슬라이드로 빠진 자리 보조 리필 + 낙하
     *
     * 이 순서로 실행하면:
     * - 로켓 등으로 비어진 열은 리필 블록이 먼저 채움
     * - 대각선 슬라이드는 리필이 도달 못하는 영역(장애물 아래)만 처리
     * - 가방 위 블록이 불필요하게 옆으로 쏟아지는 드레인 현상 방지
     *
     * @private
     */
    async _executeGravityAndRefill() {
        // 블록별 경로 추적: blockId → [{row, col}, ...]
        const blockPaths = new Map();
        const allRefills = [];

        // 초기 위치 기록
        for (let row = 0; row < this.board.rows; row++) {
            for (let col = 0; col < this.board.cols; col++) {
                const block = this.board.getBlock(row, col);
                if (block) {
                    blockPaths.set(block.id, [{ row, col }]);
                }
            }
        }

        // ── Step 1: 수직 낙하 (기존 블록) ──
        const falls = this.gravityHandler.calculateFalls();
        if (falls.length > 0) {
            this.gravityHandler.applyFalls(falls);
            for (const f of falls) {
                this._trackBlockPath(blockPaths, f.block, {
                    row: f.toRow, col: f.col
                });
            }
        }

        // ── Step 2: 리필 (슬라이드보다 먼저!) ──
        // 빈 열을 새 블록으로 채워서 불필요한 대각선 드레인 방지
        // generateRefills는 immovable 아래 차단 영역은 건너뜀 → 그 영역은 Step 3 슬라이드가 담당
        const refills = this.gravityHandler.generateRefills();
        if (refills.length > 0) {
            this.gravityHandler.applyRefills(refills);
            allRefills.push(...refills);

            for (const refill of refills) {
                blockPaths.set(refill.block.id, [
                    { row: -1, col: refill.col },      // 스폰 포인트 (보드 위)
                    { row: refill.row, col: refill.col } // 배치 위치
                ]);
            }
        }

        // ── Step 3: 리필 후 안정화 (Falls → Slides → PostFalls) ──
        // 리필이 못 채운 영역(장애물 아래 그림자)만 슬라이드 대상
        this._settleGravity(blockPaths);

        // ── Step 4: 슬라이드로 빠진 자리 보조 리필 ──
        // 슬라이드로 인접 열에서 블록이 빠져나간 경우 상단 빈칸을 채움
        const extraRefills = this.gravityHandler.generateRefills();
        if (extraRefills.length > 0) {
            this.gravityHandler.applyRefills(extraRefills);
            allRefills.push(...extraRefills);

            for (const refill of extraRefills) {
                blockPaths.set(refill.block.id, [
                    { row: -1, col: refill.col },
                    { row: refill.row, col: refill.col }
                ]);
            }

            // 보조 리필 블록 낙하
            const extraFalls = this.gravityHandler.calculateFalls();
            if (extraFalls.length > 0) {
                this.gravityHandler.applyFalls(extraFalls);
                for (const f of extraFalls) {
                    this._trackBlockPath(blockPaths, f.block, {
                        row: f.toRow, col: f.col
                    });
                }
            }
        }

        // ── 이동 목록 생성 + 애니메이션 재생 ──
        const movements = this._buildMovementsFromPaths(blockPaths);
        if (movements.length > 0) {
            eventBus.emit(EVENTS.GRAVITY_START, { falls: movements });
            await this._animateMovements(movements);
            eventBus.emit(EVENTS.GRAVITY_COMPLETE, {
                falls: movements,
                refills: allRefills
            });
        }

        // ── 수집형 기믹 확인 (맨 아래 행 곰인형 등) ──
        if (this.gimmickManager) {
            this.gimmickManager.processCollection();
        }
    }

    /**
     * 수직 낙하 + 대각선 슬라이드를 1회 실행한다.
     *
     * 순서:
     *   ① Falls  — 수직 낙하 (모든 열, 1 pass로 완전 처리)
     *   ② Slides — 수직 낙하 완전 불가한 블록만 대각선 이동 (1 pass)
     *   ③ Falls  — 슬라이드 후 생긴 빈칸 수직 낙하 (1 pass)
     *
     * 루프 없이 1회만 실행하여 캐스케이딩 드레인을 방지한다.
     * calculateFalls()는 열별 bottom-up emptyCount 누적으로 1회 호출이면
     * 해당 열의 모든 수직 낙하를 완전 처리한다.
     *
     * _executeGravityAndRefill()이 Phase1/Phase3에서 2회 호출하므로
     * 장애물 주변 슬라이드는 자연스럽게 최대 2회까지 허용된다.
     *
     * @private
     * @param {Map} blockPaths - blockId → [{row, col}, ...] 경로 맵 (in-place 업데이트)
     * @returns {boolean} 이동이 하나라도 있었으면 true
     */
    _settleGravity(blockPaths) {
        let anyMovement = false;

        // ① Falls — 수직 낙하 (모든 열 완전 처리)
        const falls = this.gravityHandler.calculateFalls();
        if (falls.length > 0) {
            this.gravityHandler.applyFalls(falls);
            anyMovement = true;

            for (const f of falls) {
                this._trackBlockPath(blockPaths, f.block, {
                    row: f.toRow, col: f.col
                });
            }
        }

        // ② Slides — 수직 낙하 완전 불가한 블록만 (1 pass)
        const slides = this.gravityHandler.calculateDiagonalSlides();
        if (slides.length > 0) {
            this.gravityHandler.applySlides(slides);
            anyMovement = true;

            for (const s of slides) {
                this._trackBlockPath(blockPaths, s.block, {
                    row: s.toRow, col: s.toCol
                });
            }

            // ③ Falls — 슬라이드 후 생긴 빈칸 수직 낙하 (1 pass)
            const postFalls = this.gravityHandler.calculateFalls();
            if (postFalls.length > 0) {
                this.gravityHandler.applyFalls(postFalls);

                for (const f of postFalls) {
                    this._trackBlockPath(blockPaths, f.block, {
                        row: f.toRow, col: f.col
                    });
                }
            }
        }

        return anyMovement;
    }

    /**
     * 블록의 이동 경로에 새 위치를 추가한다.
     * @private
     * @param {Map} blockPaths - blockId → [{row, col}, ...] 맵
     * @param {object} block - Block 객체
     * @param {object} position - { row, col }
     */
    _trackBlockPath(blockPaths, block, position) {
        if (!blockPaths.has(block.id)) {
            blockPaths.set(block.id, []);
        }
        blockPaths.get(block.id).push(position);
    }

    /**
     * 블록별 경로 맵에서 이동 정보 배열을 생성한다.
     * @private
     * @param {Map} blockPaths - blockId → [{row, col}, ...] 맵
     * @returns {object[]} 이동 정보 배열
     */
    _buildMovementsFromPaths(blockPaths) {
        const movements = [];

        for (const [blockId, path] of blockPaths) {
            // 이동하지 않은 블록은 제외
            if (path.length < 2) continue;

            const start = path[0];
            const end = path[path.length - 1];

            // 리필 블록 (스폰 row=-1) 또는 기존 블록
            const block = this.board.getBlock(end.row, end.col);
            if (!block || block.id !== blockId) continue;

            movements.push({
                block,
                fromRow: start.row,
                fromCol: start.col,
                toRow: end.row,
                toCol: end.col,
                col: end.col,
                distance: end.row - start.row,
                path // 전체 이동 경로 (웨이포인트)
            });
        }

        return movements;
    }

    /**
     * 블록 이동 애니메이션을 재생한다.
     * 경로(path) 데이터가 있으면 웨이포인트 기반 애니메이션으로,
     * 없으면 기존 수직 낙하 애니메이션으로 재생한다.
     * @private
     * @param {object[]} movements - 이동 정보 배열
     */
    async _animateMovements(movements) {
        if (movements.length === 0) return;

        this._initBlockVisuals();

        const anims = movements.map(m => {
            // 경로가 2개 이상 웨이포인트를 가지면 경로 기반 애니메이션
            if (m.path && m.path.length > 1) {
                return this.animationManager.createPathAnimation(
                    m.block, m.path, this.renderer
                );
            }
            // 단순 수직 낙하 (하위 호환)
            return this.animationManager.createFallAnimation(
                m.block, m.fromRow, m.toRow, this.renderer
            );
        });

        if (anims.length > 0) {
            await this.animationManager.enqueueParallel(anims);
        }

        this._resetBlockVisuals();
    }

    // ========================================
    // 셔플
    // ========================================

    /**
     * 보드를 셔플한다. (유효 이동이 없을 때)
     * Fisher-Yates 알고리즘으로 블록 위치를 무작위로 섞는다.
     * 셔플 후 3매치가 있거나 유효 이동이 없으면 재시도한다.
     * @private
     */
    _executeShuffle() {
        console.log('[셔플] 유효 이동 없음 — 셔플 실행');

        for (let attempt = 0; attempt < MAX_SHUFFLE_ATTEMPTS; attempt++) {
            // 셔플 가능한 블록만 수집 (기믹/이동불가 제외)
            const movableBlocks = [];
            const movablePositions = [];
            const fixedPositions = new Set();

            for (let row = 0; row < this.board.rows; row++) {
                for (let col = 0; col < this.board.cols; col++) {
                    const block = this.board.getBlock(row, col);
                    if (!block) continue;

                    const typeDef = getBlockType(block.typeId);
                    const layers = this.board.getLayersAt(row, col);
                    const hasBlockingLayer = layers.some(l => {
                        const ld = getBlockType(l.typeId);
                        return ld && ld.immovable;
                    });

                    // 이동 불가 블록이나 기믹 레이어 위 블록은 고정
                    if ((typeDef && (typeDef.immovable || !typeDef.gravity)) || hasBlockingLayer) {
                        fixedPositions.add(`${row},${col}`);
                    } else {
                        movableBlocks.push(block);
                        movablePositions.push({ row, col });
                    }
                }
            }

            // Fisher-Yates 셔플 (이동 가능한 블록만)
            for (let i = movableBlocks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [movableBlocks[i], movableBlocks[j]] = [movableBlocks[j], movableBlocks[i]];
            }

            // 셔플된 블록 재배치 (이동 가능한 위치에만)
            for (let i = 0; i < movablePositions.length; i++) {
                const pos = movablePositions[i];
                this.board.setBlock(pos.row, pos.col, movableBlocks[i]);
            }

            // 셔플 결과 검증: 3매치 없고, 유효 이동 있어야 함
            const matches = this.matchDetector.findAllMatches();
            if (matches.length === 0 && this.matchDetector.hasAnyValidMove()) {
                console.log(`[셔플] ${attempt + 1}회 시도 후 성공`);
                return;
            }
        }

        // 최대 시도 초과 — 보드 재초기화 (안전장치)
        console.warn(`[셔플] 최대 시도(${MAX_SHUFFLE_ATTEMPTS}) 초과 — 보드 재초기화`);
        this.board.initialize();
    }

    // ========================================
    // 비주얼 관리
    // ========================================

    /**
     * 모든 블록의 visualX/visualY를 현재 그리드 위치로 초기화한다.
     * @private
     */
    _initBlockVisuals() {
        for (let row = 0; row < this.board.rows; row++) {
            for (let col = 0; col < this.board.cols; col++) {
                const block = this.board.getBlock(row, col);
                if (block) {
                    const pos = this.renderer.cellToPixel(row, col);
                    block.visualX = pos.x;
                    block.visualY = pos.y;
                }
            }
        }
    }

    /**
     * 모든 블록의 비주얼 상태를 리셋한다.
     * @private
     */
    _resetBlockVisuals() {
        for (let row = 0; row < this.board.rows; row++) {
            for (let col = 0; col < this.board.cols; col++) {
                const block = this.board.getBlock(row, col);
                if (block) {
                    block.visualX = 0;
                    block.visualY = 0;
                    block.scale = 1.0;
                    block.alpha = 1.0;
                }
            }
        }
    }
}

// ========================================
// 내보내기
// ========================================

export { CascadeManager, MAX_CASCADE_ITERATIONS, MAX_SHUFFLE_ATTEMPTS, SPECIAL_CREATION_PRIORITY };
