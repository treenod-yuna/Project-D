/**
 * match.js — 매치 감지 로직
 *
 * 보드 상태를 읽기만 하고 수정하지 않는 순수 함수 기반 매치 감지기.
 * 행/열 스캔으로 3+매치를 감지하고, T/L 교차점을 병합한다.
 * 매치 패턴을 분류하여 특수 블록 생성에 필요한 정보를 제공한다.
 * 특수 블록은 색상 매칭에 참여하지 않는 독립 오브젝트로 취급한다.
 */

import { getBlockType, BLOCK_CATEGORY } from './blockTypes.js';

// ========================================
// 상수 정의
// ========================================

/** 최소 매치 개수 */
const MIN_MATCH_LENGTH = 3;

/** 매치 타입 */
const MATCH_TYPE = Object.freeze({
    THREE: '3',
    FOUR: '4',
    FIVE: '5',
    L_SHAPE: 'L',
    T_SHAPE: 'T',
    SQUARE: 'SQUARE'
});

// ========================================
// MatchDetector 클래스
// ========================================

class MatchDetector {
    /**
     * 매치 감지기를 생성한다.
     * @param {object} board - Board 인스턴스
     */
    constructor(board) {
        /** @type {object} Board 인스턴스 */
        this.board = board;
    }

    // ========================================
    // 매치 감지
    // ========================================

    /**
     * 보드 전체에서 모든 매치를 감지한다.
     * 가로/세로 매치를 각각 찾은 후, 교차점이 있는 매치를 병합하여
     * L/T 모양을 감지한다.
     * @returns {object[]} MatchResult 배열
     */
    findAllMatches() {
        // 1단계: 가로 매치 수집
        const horizontalMatches = this._findHorizontalMatches();

        // 2단계: 세로 매치 수집
        const verticalMatches = this._findVerticalMatches();

        // 3단계: 교차점 있는 가로+세로 매치 병합 (L/T 감지)
        const mergedMatches = this._mergeIntersectingMatches(
            horizontalMatches,
            verticalMatches
        );

        // 4단계: 라인 매치에 사용된 위치 수집
        const lineMatchPositions = new Set();
        for (const match of mergedMatches) {
            for (const p of match.positions) {
                lineMatchPositions.add(`${p.row},${p.col}`);
            }
        }

        // 5단계: 2x2 사각 매치 감지 (라인 매치와 독립적으로 탐색, BFS 확장)
        const squareMatches = this._findSquareMatches(lineMatchPositions);

        // 6단계: 사각 매치에 완전히 흡수된 라인 매치만 제거
        //   부분 겹침(라인 일부가 사각 밖에 있는 경우)은 유지하여 블록 누락 방지
        const squarePositions = new Set();
        for (const sq of squareMatches) {
            for (const p of sq.positions) {
                squarePositions.add(`${p.row},${p.col}`);
            }
        }
        const filteredLineMatches = mergedMatches.filter(match => {
            // 사각 매치 밖에 위치가 1개라도 있으면 라인 매치 유지
            const remaining = match.positions.filter(
                p => !squarePositions.has(`${p.row},${p.col}`)
            );
            return remaining.length > 0;
        });

        // 7단계: 모든 매치 분류 (3/4/5/L/T/SQUARE)
        const allMatches = [...filteredLineMatches, ...squareMatches];
        return allMatches.map(match => this._classifyAndBuild(match));
    }

    /**
     * 특정 위치에서 매치를 감지한다. (스왑 검증용)
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {object[]} MatchResult 배열
     */
    findMatchesAt(row, col) {
        const block = this.board.getBlock(row, col);
        if (!block) return [];

        // 매치 가능한 블록이어야 함 (일반 + 색상 있는 특수)
        if (!this._isMatchable(block)) return [];

        const lineResults = [];

        // 가로 매치 탐색
        const hPositions = this._scanLine(row, col, 0, 1);
        if (hPositions.length >= MIN_MATCH_LENGTH) {
            lineResults.push({ positions: hPositions, direction: 'horizontal' });
        }

        // 세로 매치 탐색
        const vPositions = this._scanLine(row, col, 1, 0);
        if (vPositions.length >= MIN_MATCH_LENGTH) {
            lineResults.push({ positions: vPositions, direction: 'vertical' });
        }

        // 2x2 사각 매치 확인 (라인 매치와 독립적으로)
        const squareMatch = this._findSquareMatchAt(row, col);

        // 사각 매치가 있으면 완전히 흡수된 라인 매치만 제거
        if (squareMatch) {
            const squarePositions = new Set(
                squareMatch.positions.map(p => `${p.row},${p.col}`)
            );

            // 사각 밖에 위치가 1개라도 있는 라인 매치는 유지
            const remainingLines = lineResults.filter(match => {
                const remaining = match.positions.filter(
                    p => !squarePositions.has(`${p.row},${p.col}`)
                );
                return remaining.length > 0;
            });

            // 교차점 병합
            if (remainingLines.length === 2) {
                const merged = this._mergeTwoMatches(remainingLines[0], remainingLines[1]);
                return [this._classifyAndBuild(squareMatch), this._classifyAndBuild(merged)];
            }

            const classified = remainingLines.map(m => this._classifyAndBuild(m));
            return [this._classifyAndBuild(squareMatch), ...classified];
        }

        // 교차점 병합
        if (lineResults.length === 2) {
            const merged = this._mergeTwoMatches(lineResults[0], lineResults[1]);
            return [this._classifyAndBuild(merged)];
        }

        if (lineResults.length > 0) {
            return lineResults.map(m => this._classifyAndBuild(m));
        }

        return [];
    }

    /**
     * 유효한 이동이 하나라도 있는지 확인한다.
     * 모든 인접 쌍에 대해 스왑 시뮬레이션으로 매치 발생 여부를 검사한다.
     * @returns {boolean}
     */
    hasAnyValidMove() {
        const board = this.board;
        for (let row = 0; row < board.rows; row++) {
            for (let col = 0; col < board.cols; col++) {
                // 오른쪽 스왑 검사
                if (col < board.cols - 1 && this._wouldMatch(row, col, row, col + 1)) {
                    return true;
                }
                // 아래쪽 스왑 검사
                if (row < board.rows - 1 && this._wouldMatch(row, col, row + 1, col)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 모든 유효한 이동을 찾는다.
     * @returns {Array<{from: {row, col}, to: {row, col}}>}
     */
    findAllValidMoves() {
        const moves = [];
        const board = this.board;
        for (let row = 0; row < board.rows; row++) {
            for (let col = 0; col < board.cols; col++) {
                if (col < board.cols - 1 && this._wouldMatch(row, col, row, col + 1)) {
                    moves.push({
                        from: { row, col },
                        to: { row, col: col + 1 }
                    });
                }
                if (row < board.rows - 1 && this._wouldMatch(row, col, row + 1, col)) {
                    moves.push({
                        from: { row, col },
                        to: { row: row + 1, col }
                    });
                }
            }
        }
        return moves;
    }

    /**
     * 최선의 힌트를 찾는다. (가장 큰 매치를 만드는 이동)
     * @returns {{from: {row, col}, to: {row, col}}|null}
     */
    findBestHint() {
        const moves = this.findAllValidMoves();
        if (moves.length === 0) return null;

        let bestMove = null;
        let bestScore = 0;

        for (const move of moves) {
            // 임시 스왑
            this.board.swapBlocks(move.from.row, move.from.col, move.to.row, move.to.col);
            const matches = this.findAllMatches();
            const score = matches.reduce((sum, m) => sum + m.positions.length, 0);
            // 되돌리기
            this.board.swapBlocks(move.from.row, move.from.col, move.to.row, move.to.col);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        return bestMove;
    }

    // ========================================
    // 내부 매치 탐색
    // ========================================

    /**
     * 보드 전체에서 가로 매치를 찾는다.
     * @private
     * @returns {Array<{positions: Array<{row, col}>, direction: string}>}
     */
    _findHorizontalMatches() {
        const matches = [];
        const board = this.board;

        for (let row = 0; row < board.rows; row++) {
            let col = 0;
            while (col < board.cols) {
                const block = board.getBlock(row, col);
                if (!block || !this._isMatchable(block)) {
                    col++;
                    continue;
                }

                // 같은 색상 연속 찾기 (색상 기반 비교)
                const matchColor = this._getMatchColor(block);
                const positions = [{ row, col }];
                let nextCol = col + 1;
                while (nextCol < board.cols) {
                    const nextBlock = board.getBlock(row, nextCol);
                    if (!nextBlock || this._getMatchColor(nextBlock) !== matchColor) break;
                    positions.push({ row, col: nextCol });
                    nextCol++;
                }

                if (positions.length >= MIN_MATCH_LENGTH) {
                    matches.push({ positions, direction: 'horizontal' });
                }

                col = nextCol;
            }
        }

        return matches;
    }

    /**
     * 보드 전체에서 세로 매치를 찾는다.
     * @private
     * @returns {Array<{positions: Array<{row, col}>, direction: string}>}
     */
    _findVerticalMatches() {
        const matches = [];
        const board = this.board;

        for (let col = 0; col < board.cols; col++) {
            let row = 0;
            while (row < board.rows) {
                const block = board.getBlock(row, col);
                if (!block || !this._isMatchable(block)) {
                    row++;
                    continue;
                }

                // 같은 색상 연속 찾기 (색상 기반 비교)
                const matchColor = this._getMatchColor(block);
                const positions = [{ row, col }];
                let nextRow = row + 1;
                while (nextRow < board.rows) {
                    const nextBlock = board.getBlock(nextRow, col);
                    if (!nextBlock || this._getMatchColor(nextBlock) !== matchColor) break;
                    positions.push({ row: nextRow, col });
                    nextRow++;
                }

                if (positions.length >= MIN_MATCH_LENGTH) {
                    matches.push({ positions, direction: 'vertical' });
                }

                row = nextRow;
            }
        }

        return matches;
    }

    /**
     * 특정 위치에서 지정 방향으로 같은 타입 블록 라인을 탐색한다.
     * @private
     * @param {number} row - 시작 행
     * @param {number} col - 시작 열
     * @param {number} dRow - 행 방향 (0 또는 1)
     * @param {number} dCol - 열 방향 (0 또는 1)
     * @returns {Array<{row, col}>} 같은 타입 블록 위치 배열
     */
    _scanLine(row, col, dRow, dCol) {
        const block = this.board.getBlock(row, col);
        if (!block) return [];

        const matchColor = this._getMatchColor(block);
        if (matchColor === null) return []; // 매치 불가 블록
        const positions = [{ row, col }];

        // 양방향 탐색 (음의 방향)
        let r = row - dRow;
        let c = col - dCol;
        while (this.board.isValidPosition(r, c)) {
            const b = this.board.getBlock(r, c);
            if (!b || this._getMatchColor(b) !== matchColor) break;
            positions.unshift({ row: r, col: c });
            r -= dRow;
            c -= dCol;
        }

        // 양방향 탐색 (양의 방향)
        r = row + dRow;
        c = col + dCol;
        while (this.board.isValidPosition(r, c)) {
            const b = this.board.getBlock(r, c);
            if (!b || this._getMatchColor(b) !== matchColor) break;
            positions.push({ row: r, col: c });
            r += dRow;
            c += dCol;
        }

        return positions;
    }

    // ========================================
    // 매치 병합 (L/T 감지)
    // ========================================

    /**
     * 교차점이 있는 가로/세로 매치를 병합한다.
     * @private
     * @param {Array} horizontals - 가로 매치 목록
     * @param {Array} verticals - 세로 매치 목록
     * @returns {Array} 병합된 매치 목록
     */
    _mergeIntersectingMatches(horizontals, verticals) {
        const usedH = new Set();
        const usedV = new Set();
        const merged = [];

        // 모든 가로-세로 조합에서 교차점 탐색
        for (let hi = 0; hi < horizontals.length; hi++) {
            for (let vi = 0; vi < verticals.length; vi++) {
                if (usedH.has(hi) || usedV.has(vi)) continue;

                const h = horizontals[hi];
                const v = verticals[vi];

                // 같은 매치 색상인지 확인
                const hBlock = this.board.getBlock(h.positions[0].row, h.positions[0].col);
                const vBlock = this.board.getBlock(v.positions[0].row, v.positions[0].col);
                const hColor = this._getMatchColor(hBlock);
                const vColor = this._getMatchColor(vBlock);
                if (!hColor || !vColor || hColor !== vColor) continue;

                // 교차점 찾기
                const intersection = this._findIntersection(h.positions, v.positions);
                if (intersection) {
                    usedH.add(hi);
                    usedV.add(vi);
                    merged.push(this._mergeTwoMatches(h, v));
                }
            }
        }

        // 병합되지 않은 가로 매치 추가
        for (let hi = 0; hi < horizontals.length; hi++) {
            if (!usedH.has(hi)) {
                merged.push(horizontals[hi]);
            }
        }

        // 병합되지 않은 세로 매치 추가
        for (let vi = 0; vi < verticals.length; vi++) {
            if (!usedV.has(vi)) {
                merged.push(verticals[vi]);
            }
        }

        return merged;
    }

    /**
     * 두 위치 배열의 교차점을 찾는다.
     * @private
     * @param {Array<{row, col}>} posA
     * @param {Array<{row, col}>} posB
     * @returns {{row, col}|null} 교차점 또는 null
     */
    _findIntersection(posA, posB) {
        const setB = new Set(posB.map(p => `${p.row},${p.col}`));
        for (const p of posA) {
            if (setB.has(`${p.row},${p.col}`)) {
                return p;
            }
        }
        return null;
    }

    /**
     * 두 매치를 하나로 병합한다. (교차점 중복 제거)
     * @private
     * @param {object} matchA
     * @param {object} matchB
     * @returns {object} 병합된 매치
     */
    _mergeTwoMatches(matchA, matchB) {
        const posMap = new Map();
        for (const p of matchA.positions) {
            posMap.set(`${p.row},${p.col}`, p);
        }
        for (const p of matchB.positions) {
            posMap.set(`${p.row},${p.col}`, p);
        }
        return {
            positions: Array.from(posMap.values()),
            direction: 'cross',
            _hMatch: matchA.direction === 'horizontal' ? matchA : matchB,
            _vMatch: matchA.direction === 'vertical' ? matchA : matchB
        };
    }

    // ========================================
    // 매치 분류
    // ========================================

    /**
     * 매치를 분류하고 MatchResult를 생성한다.
     * @private
     * @param {object} match - 내부 매치 데이터
     * @returns {object} MatchResult
     */
    _classifyAndBuild(match) {
        const { positions, direction } = match;
        let type;
        let specialBlockType = null;
        let specialBlockPosition = null;

        // 매치에 이미 특수 블록이 포함되어 있는지 확인
        const specialsInMatch = [];
        for (const p of positions) {
            const block = this.board.getBlock(p.row, p.col);
            if (block) {
                const typeDef = getBlockType(block.typeId);
                if (typeDef && typeDef.blockType === BLOCK_CATEGORY.SPECIAL) {
                    specialsInMatch.push({ row: p.row, col: p.col, block });
                }
            }
        }

        if (direction === 'square') {
            // 2x2 사각 매치 → 타겟 유도형 폭탄
            type = MATCH_TYPE.SQUARE;
            specialBlockType = 10; // 타겟 유도형 폭탄 ID
            // 기존 특수 블록이 없는 위치를 우선 선택, 없으면 좌상단
            specialBlockPosition = this._findNonSpecialPosition(positions, specialsInMatch) || positions[0];
        } else if (direction === 'cross') {
            // L/T 모양 판별
            const hLen = match._hMatch ? match._hMatch.positions.length : 0;
            const vLen = match._vMatch ? match._vMatch.positions.length : 0;

            if (hLen >= 3 && vLen >= 3) {
                type = (hLen === 3 && vLen === 3) ? MATCH_TYPE.L_SHAPE : MATCH_TYPE.T_SHAPE;
            } else {
                type = MATCH_TYPE.L_SHAPE;
            }

            specialBlockType = 8; // 폭탄 ID

            // 교차점 위치에 특수 블록 생성
            const intersection = this._findIntersection(
                match._hMatch ? match._hMatch.positions : positions,
                match._vMatch ? match._vMatch.positions : positions
            );
            specialBlockPosition = intersection || positions[Math.floor(positions.length / 2)];
        } else {
            // 직선 매치 분류
            const len = positions.length;
            if (len >= 5) {
                type = MATCH_TYPE.FIVE;
                specialBlockType = 9; // 레인보우 ID
            } else if (len === 4) {
                type = MATCH_TYPE.FOUR;
                // 로켓 방향은 매치 방향과 동일 (연쇄 중)
                specialBlockType = direction === 'horizontal' ? 6 : 7;
            } else {
                type = MATCH_TYPE.THREE;
            }

            // 특수 블록 생성 위치 (중앙, 기존 특수 블록 위치 회피)
            if (specialBlockType) {
                specialBlockPosition = this._findNonSpecialPosition(positions, specialsInMatch)
                    || positions[Math.floor(positions.length / 2)];
            }
        }

        return {
            positions: [...positions],
            type,
            direction,
            specialBlockType,
            specialBlockPosition,
            specialsToActivate: specialsInMatch // 발동할 기존 특수 블록 목록
        };
    }

    /**
     * 매치 위치 중 기존 특수 블록이 아닌 위치를 찾는다.
     * 새 특수 블록 생성 시 기존 특수 블록 위치를 피하기 위함.
     * @private
     * @param {Array<{row, col}>} positions - 매치 위치 배열
     * @param {Array<{row, col}>} specials - 기존 특수 블록 위치 배열
     * @returns {{row, col}|null} 특수 블록이 아닌 위치, 없으면 null
     */
    _findNonSpecialPosition(positions, specials) {
        if (specials.length === 0) {
            return positions[Math.floor(positions.length / 2)];
        }
        const specialKeys = new Set(specials.map(s => `${s.row},${s.col}`));
        // 중앙부터 검색하여 가능한 가운데에 배치
        const mid = Math.floor(positions.length / 2);
        for (let offset = 0; offset < positions.length; offset++) {
            const idx = mid + (offset % 2 === 0 ? offset / 2 : -Math.ceil(offset / 2));
            if (idx >= 0 && idx < positions.length) {
                const p = positions[idx];
                if (!specialKeys.has(`${p.row},${p.col}`)) {
                    return p;
                }
            }
        }
        return null;
    }

    // ========================================
    // 2x2 사각 매치 감지
    // ========================================

    /**
     * 보드 전체에서 2x2 사각 매치를 찾는다.
     * 라인 매치에 포함된 위치는 제외한다.
     * @private
     * @param {Set<string>} lineMatchPositions - 라인 매치에 사용된 위치 ("row,col" 형식)
     * @returns {Array<{positions: Array<{row, col}>, direction: string}>}
     */
    _findSquareMatches(lineMatchPositions) {
        const matches = [];
        const usedPositions = new Set();
        const board = this.board;

        for (let row = 0; row < board.rows - 1; row++) {
            for (let col = 0; col < board.cols - 1; col++) {
                // 2x2 영역의 4개 블록
                const tl = board.getBlock(row, col);
                const tr = board.getBlock(row, col + 1);
                const bl = board.getBlock(row + 1, col);
                const br = board.getBlock(row + 1, col + 1);

                if (!tl || !tr || !bl || !br) continue;

                // 4개 블록이 모두 같은 매치 색상인지 확인
                const color = this._getMatchColor(tl);
                if (color === null) continue;
                if (this._getMatchColor(tr) !== color) continue;
                if (this._getMatchColor(bl) !== color) continue;
                if (this._getMatchColor(br) !== color) continue;

                const corePositions = [
                    { row, col },
                    { row, col: col + 1 },
                    { row: row + 1, col },
                    { row: row + 1, col: col + 1 }
                ];

                // 다른 사각 매치와 코어가 겹치는지만 확인 (라인 매치 겹침 허용)
                const anyOverlap = corePositions.some(p => {
                    const key = `${p.row},${p.col}`;
                    return usedPositions.has(key);
                });

                if (!anyOverlap) {
                    // BFS로 인접 같은 색 블록 확장 (다른 사각 매치만 제외)
                    const expandedPositions = this._expandSquareMatch(
                        corePositions, color, usedPositions
                    );

                    for (const p of expandedPositions) {
                        usedPositions.add(`${p.row},${p.col}`);
                    }
                    matches.push({ positions: expandedPositions, direction: 'square' });
                }
            }
        }

        return matches;
    }

    /**
     * 2x2 코어에서 인접한 같은 색 블록을 컴포넌트별로 독립 평가하여 확장한다.
     * 코어 경계에 인접한 진입점에서 BFS로 연결 컴포넌트를 탐색하고,
     * 각 컴포넌트가 독립적으로 3개 이상이면 해당 컴포넌트를 확장 그룹에 추가한다.
     * @private
     * @param {Array<{row, col}>} corePositions - 2x2 코어 위치 (4개)
     * @param {number} matchColor - 매치 색상
     * @param {Set<string>} excludePositions - 제외할 위치 (다른 사각 매치)
     * @returns {Array<{row, col}>} 확장된 위치 배열 (코어 포함)
     */
    _expandSquareMatch(corePositions, matchColor, excludePositions) {
        const coreSet = new Set();
        const coreResult = [];

        // 코어 위치 등록
        for (const p of corePositions) {
            coreSet.add(`${p.row},${p.col}`);
            coreResult.push({ row: p.row, col: p.col });
        }

        // 상하좌우 방향
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        // 1단계: 코어 경계에 인접한 같은 색 진입점 수집
        const entryPoints = [];
        const entrySet = new Set();

        for (const p of corePositions) {
            for (const [dr, dc] of dirs) {
                const nr = p.row + dr;
                const nc = p.col + dc;
                const key = `${nr},${nc}`;

                // 코어 내부, 제외 위치, 이미 수집된 진입점은 건너뛴다
                if (coreSet.has(key)) continue;
                if (excludePositions.has(key)) continue;
                if (entrySet.has(key)) continue;
                if (!this.board.isValidPosition(nr, nc)) continue;

                const block = this.board.getBlock(nr, nc);
                if (!block) continue;
                if (this._getMatchColor(block) !== matchColor) continue;

                entryPoints.push({ row: nr, col: nc });
                entrySet.add(key);
            }
        }

        // 2단계: 각 진입점에서 BFS로 연결 컴포넌트를 독립적으로 탐색
        const globalVisited = new Set();  // 이미 처리된 진입점/블록 추적
        const qualifiedBlocks = [];       // 3개 이상 조건을 충족한 블록들

        for (const entry of entryPoints) {
            const entryKey = `${entry.row},${entry.col}`;
            if (globalVisited.has(entryKey)) continue;

            // BFS로 이 진입점의 연결 컴포넌트 탐색 (코어 영역 제외)
            const component = [];
            const queue = [entry];
            globalVisited.add(entryKey);

            while (queue.length > 0) {
                const current = queue.shift();
                component.push({ row: current.row, col: current.col });

                for (const [dr, dc] of dirs) {
                    const nr = current.row + dr;
                    const nc = current.col + dc;
                    const key = `${nr},${nc}`;

                    if (globalVisited.has(key)) continue;
                    if (coreSet.has(key)) continue;
                    if (excludePositions.has(key)) continue;
                    if (!this.board.isValidPosition(nr, nc)) continue;

                    const block = this.board.getBlock(nr, nc);
                    if (!block) continue;
                    if (this._getMatchColor(block) !== matchColor) continue;

                    globalVisited.add(key);
                    queue.push({ row: nr, col: nc });
                }
            }

            // 3단계: 컴포넌트가 3개 이상이면 확장 그룹에 추가
            if (component.length >= MIN_MATCH_LENGTH) {
                qualifiedBlocks.push(...component);
            }
        }

        // 코어 + 조건을 충족한 확장 블록들 반환
        return [...coreResult, ...qualifiedBlocks];
    }

    /**
     * 특정 위치가 2x2 사각 매치의 일부인지 확인한다.
     * (스왑 유효성 검사용 - 빠른 확인)
     * @private
     * @param {number} row
     * @param {number} col
     * @returns {boolean}
     */
    _hasSquareAt(row, col) {
        const block = this.board.getBlock(row, col);
        if (!block) return false;

        const matchColor = this._getMatchColor(block);
        if (matchColor === null) return false;

        // (row,col)을 포함하는 4가지 2x2 패턴 확인
        // 각 패턴: 나머지 3개 위치의 오프셋
        const offsets = [
            [[0, 1], [1, 0], [1, 1]],       // (row,col)이 좌상단
            [[0, -1], [1, -1], [1, 0]],      // (row,col)이 우상단
            [[-1, 0], [-1, 1], [0, 1]],      // (row,col)이 좌하단
            [[-1, -1], [-1, 0], [0, -1]]     // (row,col)이 우하단
        ];

        for (const square of offsets) {
            let allMatch = true;
            for (const [dr, dc] of square) {
                const r = row + dr;
                const c = col + dc;
                if (!this.board.isValidPosition(r, c)) { allMatch = false; break; }
                const b = this.board.getBlock(r, c);
                if (!b || this._getMatchColor(b) !== matchColor) { allMatch = false; break; }
            }
            if (allMatch) return true;
        }

        return false;
    }

    /**
     * 특정 위치에서 2x2 사각 매치를 찾는다.
     * (findMatchesAt용 - 매치 결과 반환)
     * @private
     * @param {number} row
     * @param {number} col
     * @returns {{positions: Array<{row, col}>, direction: string}|null}
     */
    _findSquareMatchAt(row, col) {
        const block = this.board.getBlock(row, col);
        if (!block) return null;

        const matchColor = this._getMatchColor(block);
        if (matchColor === null) return null;

        // (row,col)을 포함하는 4가지 2x2 패턴
        const patterns = [
            [[0, 0], [0, 1], [1, 0], [1, 1]],       // 좌상단
            [[0, -1], [0, 0], [1, -1], [1, 0]],      // 우상단
            [[-1, 0], [-1, 1], [0, 0], [0, 1]],      // 좌하단
            [[-1, -1], [-1, 0], [0, -1], [0, 0]]     // 우하단
        ];

        for (const pattern of patterns) {
            const corePositions = [];
            let allMatch = true;

            for (const [dr, dc] of pattern) {
                const r = row + dr;
                const c = col + dc;
                if (!this.board.isValidPosition(r, c)) { allMatch = false; break; }
                const b = this.board.getBlock(r, c);
                if (!b || this._getMatchColor(b) !== matchColor) { allMatch = false; break; }
                corePositions.push({ row: r, col: c });
            }

            if (allMatch) {
                // BFS로 인접 같은 색 블록 확장
                const expandedPositions = this._expandSquareMatch(
                    corePositions, matchColor, new Set()
                );
                return { positions: expandedPositions, direction: 'square' };
            }
        }

        return null;
    }

    // ========================================
    // 유틸리티
    // ========================================

    /**
     * 블록의 매치 색상을 반환한다.
     * 일반 블록: typeId (1~5)
     * 특수 블록/기믹/빈칸: null (매치 불가 — 특수 블록은 색상 독립)
     * @private
     * @param {object} block - Block 객체
     * @returns {number|null}
     */
    _getMatchColor(block) {
        if (!block) return null;
        const typeDef = getBlockType(block.typeId);
        if (!typeDef) return null;

        // 일반 블록만 매치 참여 (typeId가 색상)
        if (typeDef.blockType === BLOCK_CATEGORY.NORMAL) {
            return block.typeId;
        }

        // 특수 블록/기믹: 매치 불참 (색상 독립 오브젝트)
        return null;
    }

    /**
     * 블록이 매치 가능한지 확인한다.
     * 일반 블록만 매치 대상이다. (특수 블록은 색상 독립)
     * @private
     * @param {object} block - Block 객체
     * @returns {boolean}
     */
    _isMatchable(block) {
        return this._getMatchColor(block) !== null;
    }

    /**
     * 두 위치의 블록을 스왑했을 때 매치가 발생하는지 확인한다.
     * @private
     * @param {number} r1 - 첫 번째 행
     * @param {number} c1 - 첫 번째 열
     * @param {number} r2 - 두 번째 행
     * @param {number} c2 - 두 번째 열
     * @returns {boolean}
     */
    _wouldMatch(r1, c1, r2, c2) {
        const b1 = this.board.getBlock(r1, c1);
        const b2 = this.board.getBlock(r2, c2);

        if (!b1 || !b2) return false;

        const t1 = getBlockType(b1.typeId);
        const t2 = getBlockType(b2.typeId);
        if (!t1 || !t2) return false;

        // 특수 블록이 포함된 스왑은 항상 유효 (조합/즉시 발동)
        if (t1.blockType === BLOCK_CATEGORY.SPECIAL || t2.blockType === BLOCK_CATEGORY.SPECIAL) {
            return true;
        }

        // 둘 중 하나라도 매치 가능해야 스왑 시뮬레이션 의미 있음
        if (!this._isMatchable(b1) && !this._isMatchable(b2)) return false;

        // 임시 스왑
        this.board.swapBlocks(r1, c1, r2, c2);

        // 두 위치에서 매치 확인
        const hasMatch = this._hasMatchAt(r1, c1) || this._hasMatchAt(r2, c2);

        // 되돌리기
        this.board.swapBlocks(r1, c1, r2, c2);

        return hasMatch;
    }

    /**
     * 특정 위치에서 3매치 이상이 존재하는지 빠르게 확인한다.
     * @private
     * @param {number} row
     * @param {number} col
     * @returns {boolean}
     */
    _hasMatchAt(row, col) {
        const block = this.board.getBlock(row, col);
        if (!block || !this._isMatchable(block)) return false;

        // 가로 확인
        const hLine = this._scanLine(row, col, 0, 1);
        if (hLine.length >= MIN_MATCH_LENGTH) return true;

        // 세로 확인
        const vLine = this._scanLine(row, col, 1, 0);
        if (vLine.length >= MIN_MATCH_LENGTH) return true;

        // 2x2 사각 확인
        if (this._hasSquareAt(row, col)) return true;

        return false;
    }
}

// ========================================
// 내보내기
// ========================================

export { MatchDetector, MATCH_TYPE, MIN_MATCH_LENGTH };
