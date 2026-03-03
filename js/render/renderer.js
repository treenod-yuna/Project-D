/**
 * renderer.js — Canvas 렌더러
 *
 * Board 상태를 Canvas에 그린다.
 * 폴백 색상 + 이모지(또는 아이콘)로 블록을 표시한다.
 * requestAnimationFrame 기반 게임 루프로 60fps를 유지한다.
 */

import { getBlockType, BLOCK_CATEGORY, BLOCK_TYPES } from '../core/blockTypes.js';

// ========================================
// roundRect 폴리필 (구형 브라우저 호환)
// ========================================

if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
        const r = typeof radii === 'number' ? radii : (radii?.[0] ?? 0);
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.arcTo(x + w, y, x + w, y + r, r);
        this.lineTo(x + w, y + h - r);
        this.arcTo(x + w, y + h, x + w - r, y + h, r);
        this.lineTo(x + r, y + h);
        this.arcTo(x, y + h, x, y + h - r, r);
        this.lineTo(x, y + r);
        this.arcTo(x, y, x + r, y, r);
        this.closePath();
        return this;
    };
}

// ========================================
// 상수 정의
// ========================================

/** 셀 크기 (픽셀) */
const CELL_SIZE = 64;

/** 셀 내부 블록 패딩 (픽셀) */
const CELL_PADDING = 4;

/** 보드 외곽 여백 (픽셀) */
const BOARD_PADDING = 20;

/** 그리드 선 색상 */
const GRID_LINE_COLOR = '#E0E0E0';

/** 보드 배경 색상 */
const BOARD_BG_COLOR = '#F5F5F5';

/** 블록 모서리 둥글기 (픽셀) */
const BLOCK_BORDER_RADIUS = 8;

/** 이모지 폰트 크기 (픽셀) */
const EMOJI_FONT_SIZE = 28;

/** 리소스 이미지 기본 경로 */
const RESOURCE_BASE_PATH = 'assets/gimmick-resources/';

/** 선택 강조 색상 */
const SELECTION_COLOR = 'rgba(255, 255, 0, 0.4)';

// ========================================
// Renderer 클래스
// ========================================

class Renderer {
    /**
     * 렌더러를 초기화한다.
     * @param {HTMLCanvasElement} canvas - Canvas 엘리먼트
     * @param {object} board - Board 인스턴스
     */
    constructor(canvas, board) {
        /** @type {HTMLCanvasElement} Canvas 엘리먼트 */
        this.canvas = canvas;
        /** @type {CanvasRenderingContext2D} 2D 컨텍스트 */
        this.ctx = canvas.getContext('2d');
        /** @type {object} Board 인스턴스 */
        this.board = board;

        /** @type {number} 셀 크기 */
        this.cellSize = CELL_SIZE;
        /** @type {number} 보드 여백 */
        this.boardPadding = BOARD_PADDING;

        /** @type {object|null} AnimationManager 인스턴스 */
        this._animationManager = null;

        /** @type {boolean} 게임 루프 실행 중 여부 */
        this._isRunning = false;
        /** @type {number|null} requestAnimationFrame ID */
        this._rafId = null;

        /** @type {{row: number, col: number}|null} 선택된 블록 위치 (강조 표시용) */
        this.selectedCell = null;

        /** @type {Map<string, HTMLImageElement>} 리소스 이미지 캐시 (resources명 → Image) */
        this._imageCache = new Map();
        /** @type {boolean} 이미지 로딩 완료 여부 */
        this._imagesLoaded = false;

        // Canvas 크기를 보드에 맞게 설정
        this._resizeCanvas();

        // 리소스 이미지 비동기 로딩
        this._loadImages();
    }

    // ========================================
    // 이미지 로딩
    // ========================================

    /**
     * 모든 블록 타입의 리소스 이미지를 비동기 로딩한다.
     * 로딩 실패 시 폴백(색상+아이콘)으로 표시한다.
     * @private
     */
    _loadImages() {
        const promises = [];

        for (const [_, typeDef] of BLOCK_TYPES) {
            if (!typeDef.resources) continue;

            const img = new Image();
            const resourceName = typeDef.resources;
            const src = `${RESOURCE_BASE_PATH}${resourceName}.png`;

            const promise = new Promise((resolve) => {
                img.onload = () => {
                    this._imageCache.set(resourceName, img);
                    resolve();
                };
                img.onerror = () => {
                    // 로딩 실패 → 폴백 사용 (캐시에 저장하지 않음)
                    console.warn(`[렌더러] 이미지 로딩 실패: ${src}`);
                    resolve();
                };
            });

            img.src = src;
            promises.push(promise);
        }

        Promise.all(promises).then(() => {
            this._imagesLoaded = true;
            console.log(`[렌더러] 이미지 로딩 완료: ${this._imageCache.size}개`);
        });
    }

    /**
     * 리소스명으로 캐시된 이미지를 가져온다.
     * @private
     * @param {string} resourceName - 리소스명 (확장자 제외)
     * @returns {HTMLImageElement|null} 이미지 또는 null
     */
    _getImage(resourceName) {
        return this._imageCache.get(resourceName) || null;
    }

    // ========================================
    // 게임 루프
    // ========================================

    /**
     * AnimationManager를 연결한다.
     * @param {object} animManager - AnimationManager 인스턴스
     */
    setAnimationManager(animManager) {
        this._animationManager = animManager;
    }

    /**
     * 게임 루프를 시작한다.
     */
    startGameLoop() {
        if (this._isRunning) return;
        this._isRunning = true;
        this._gameLoop(performance.now());
    }

    /**
     * 게임 루프를 정지한다.
     */
    stopGameLoop() {
        this._isRunning = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    /**
     * 게임 루프 (매 프레임 호출).
     * @private
     * @param {number} timestamp - performance.now()
     */
    _gameLoop(timestamp) {
        if (!this._isRunning) return;

        // 애니메이션 업데이트
        if (this._animationManager) {
            this._animationManager.update(timestamp);
        }

        // 렌더링
        this.render();

        // 다음 프레임 예약
        this._rafId = requestAnimationFrame((ts) => this._gameLoop(ts));
    }

    // ========================================
    // 초기화
    // ========================================

    /**
     * Canvas 크기를 보드 크기에 맞춰 설정한다.
     * @private
     */
    _resizeCanvas() {
        const width = this.board.cols * this.cellSize + this.boardPadding * 2;
        const height = this.board.rows * this.cellSize + this.boardPadding * 2;

        // 고해상도 디스플레이 대응 (DPR)
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.ctx.scale(dpr, dpr);
    }

    // ========================================
    // 좌표 변환
    // ========================================

    /**
     * 보드 좌표(row, col)를 Canvas 픽셀 좌표로 변환한다.
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     * @returns {{x: number, y: number}} 셀 좌상단 픽셀 좌표
     */
    cellToPixel(row, col) {
        return {
            x: this.boardPadding + col * this.cellSize,
            y: this.boardPadding + row * this.cellSize
        };
    }

    /**
     * Canvas 픽셀 좌표를 보드 좌표(row, col)로 변환한다.
     * @param {number} x - 픽셀 X
     * @param {number} y - 픽셀 Y
     * @returns {{row: number, col: number}|null} 보드 좌표 또는 null (범위 밖)
     */
    pixelToCell(x, y) {
        const col = Math.floor((x - this.boardPadding) / this.cellSize);
        const row = Math.floor((y - this.boardPadding) / this.cellSize);

        if (row >= 0 && row < this.board.rows && col >= 0 && col < this.board.cols) {
            return { row, col };
        }
        return null;
    }

    // ========================================
    // 렌더링
    // ========================================

    /**
     * 전체 보드를 다시 그린다.
     */
    render() {
        const ctx = this.ctx;
        const width = this.board.cols * this.cellSize + this.boardPadding * 2;
        const height = this.board.rows * this.cellSize + this.boardPadding * 2;

        // 전체 클리어
        ctx.clearRect(0, 0, width, height);

        // 보드 배경
        this._drawBoardBackground();

        // 그리드 선
        this._drawGrid();

        // 선택 강조
        if (this.selectedCell) {
            this._drawSelection(this.selectedCell.row, this.selectedCell.col);
        }

        // 레이어 (블록 아래, zIndex < 0)
        this._drawLayers(false);

        // 블록
        this._drawBlocks();

        // 레이어 (블록 위, zIndex >= 0)
        this._drawLayers(true);
    }

    /**
     * 보드 배경을 그린다.
     * @private
     */
    _drawBoardBackground() {
        const ctx = this.ctx;
        const x = this.boardPadding;
        const y = this.boardPadding;
        const w = this.board.cols * this.cellSize;
        const h = this.board.rows * this.cellSize;

        ctx.fillStyle = BOARD_BG_COLOR;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 12);
        ctx.fill();

        // 체커보드 패턴으로 셀 구분
        for (let row = 0; row < this.board.rows; row++) {
            for (let col = 0; col < this.board.cols; col++) {
                const pos = this.cellToPixel(row, col);
                const isLight = (row + col) % 2 === 0;
                ctx.fillStyle = isLight ? '#FAFAFA' : '#F0F0F0';
                ctx.fillRect(pos.x, pos.y, this.cellSize, this.cellSize);
            }
        }
    }

    /**
     * 그리드 선을 그린다.
     * @private
     */
    _drawGrid() {
        const ctx = this.ctx;
        ctx.strokeStyle = GRID_LINE_COLOR;
        ctx.lineWidth = 0.5;

        // 세로 선
        for (let col = 0; col <= this.board.cols; col++) {
            const x = this.boardPadding + col * this.cellSize;
            ctx.beginPath();
            ctx.moveTo(x, this.boardPadding);
            ctx.lineTo(x, this.boardPadding + this.board.rows * this.cellSize);
            ctx.stroke();
        }

        // 가로 선
        for (let row = 0; row <= this.board.rows; row++) {
            const y = this.boardPadding + row * this.cellSize;
            ctx.beginPath();
            ctx.moveTo(this.boardPadding, y);
            ctx.lineTo(this.boardPadding + this.board.cols * this.cellSize, y);
            ctx.stroke();
        }
    }

    /**
     * 선택된 셀 강조를 그린다.
     * @private
     * @param {number} row
     * @param {number} col
     */
    _drawSelection(row, col) {
        const ctx = this.ctx;
        const pos = this.cellToPixel(row, col);
        ctx.fillStyle = SELECTION_COLOR;
        ctx.fillRect(pos.x, pos.y, this.cellSize, this.cellSize);

        // 선택 테두리
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x + 1, pos.y + 1, this.cellSize - 2, this.cellSize - 2);
    }

    /**
     * 모든 블록을 그린다.
     * @private
     */
    _drawBlocks() {
        for (let row = 0; row < this.board.rows; row++) {
            for (let col = 0; col < this.board.cols; col++) {
                const block = this.board.getBlock(row, col);
                if (block && block.alpha > 0) {
                    this._drawBlock(block, row, col);
                }
            }
        }
    }

    /**
     * 개별 블록을 그린다.
     * 애니메이션 중에는 visualX/visualY를 사용하여 부드럽게 이동한다.
     * @private
     * @param {object} block - Block 객체
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     */
    _drawBlock(block, row, col) {
        const ctx = this.ctx;
        const typeDef = getBlockType(block.typeId);
        if (!typeDef) return;

        // 블록 위치 계산: 애니메이션 중이면 visualX/visualY, 아니면 그리드 기반
        const defaultPos = this.cellToPixel(row, col);
        const useVisual = block.visualX !== 0 || block.visualY !== 0;
        const baseX = useVisual ? block.visualX : defaultPos.x;
        const baseY = useVisual ? block.visualY : defaultPos.y;

        const x = baseX + CELL_PADDING;
        const y = baseY + CELL_PADDING;
        const size = this.cellSize - CELL_PADDING * 2;

        // 블록 스케일/투명도 적용
        ctx.save();
        ctx.globalAlpha = block.alpha;

        if (block.scale !== 1.0) {
            const cx = baseX + this.cellSize / 2;
            const cy = baseY + this.cellSize / 2;
            ctx.translate(cx, cy);
            ctx.scale(block.scale, block.scale);
            ctx.translate(-cx, -cy);
        }

        // 특수 블록은 고유 색상 사용 (색상 독립 오브젝트)
        const isSpecial = typeDef.blockType === BLOCK_CATEGORY.SPECIAL;
        const bgColor = typeDef.fallbackColor;

        // 리소스 이미지가 있으면 이미지로 렌더링
        const img = typeDef.resources ? this._getImage(typeDef.resources) : null;

        if (img) {
            // 이미지 렌더링 (둥근 모서리 클리핑)
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, size, size, BLOCK_BORDER_RADIUS);
            ctx.clip();
            ctx.drawImage(img, x, y, size, size);
            ctx.restore();

            // 특수 블록 빛남 테두리
            if (isSpecial) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(x + 1, y + 1, size - 2, size - 2, BLOCK_BORDER_RADIUS);
                ctx.stroke();
            }
        } else {
            // 폴백: 색상 + 아이콘

            // 블록 배경
            ctx.fillStyle = bgColor;
            ctx.beginPath();
            ctx.roundRect(x, y, size, size, BLOCK_BORDER_RADIUS);
            ctx.fill();

            // 블록 테두리 (약간 어둡게)
            ctx.strokeStyle = this._darkenColor(bgColor, 0.2);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(x, y, size, size, BLOCK_BORDER_RADIUS);
            ctx.stroke();

            // 특수 블록 빛남 테두리
            if (isSpecial) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(x + 1, y + 1, size - 2, size - 2, BLOCK_BORDER_RADIUS);
                ctx.stroke();
            }

            // 하이라이트 효과 (상단에 밝은 반투명)
            const gradient = ctx.createLinearGradient(x, y, x, y + size);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
            gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(x, y, size, size, BLOCK_BORDER_RADIUS);
            ctx.fill();

            // 이모지 아이콘
            if (typeDef.fallbackIcon) {
                ctx.font = `${EMOJI_FONT_SIZE}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(
                    typeDef.fallbackIcon,
                    baseX + this.cellSize / 2,
                    baseY + this.cellSize / 2
                );
            }
        }

        // 특수 블록 방향 표시 (이미지 없을 때만 폴백)
        if (isSpecial && !img) {
            this._drawSpecialIndicator(ctx, block, baseX, baseY);
        }

        ctx.restore();
    }

    /**
     * 레이어를 그린다. (얼음, 체인 등)
     * @private
     * @param {boolean} aboveBlock - true면 블록 위 레이어만, false면 블록 아래 레이어만
     */
    _drawLayers(aboveBlock) {
        for (let row = 0; row < this.board.rows; row++) {
            for (let col = 0; col < this.board.cols; col++) {
                const layers = this.board.getLayersAt(row, col);
                for (const layer of layers) {
                    const isAbove = layer.zIndex >= 0;
                    if (isAbove === aboveBlock) {
                        this._drawLayer(layer, row, col);
                    }
                }
            }
        }
    }

    /**
     * 개별 레이어를 그린다.
     * @private
     * @param {object} layer - Layer 객체
     * @param {number} row - 행 인덱스
     * @param {number} col - 열 인덱스
     */
    _drawLayer(layer, row, col) {
        const ctx = this.ctx;
        const typeDef = getBlockType(layer.typeId);
        if (!typeDef) return;

        const pos = this.cellToPixel(row, col);
        const x = pos.x + 2;
        const y = pos.y + 2;
        const size = this.cellSize - 4;

        // 리소스 이미지가 있으면 이미지로 렌더링
        const img = typeDef.resources ? this._getImage(typeDef.resources) : null;

        ctx.save();

        if (img) {
            // 이미지 렌더링 (반투명 + 둥근 모서리)
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.roundRect(x, y, size, size, BLOCK_BORDER_RADIUS);
            ctx.clip();
            ctx.drawImage(img, x, y, size, size);
        } else {
            // 폴백: 색상 + 아이콘
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = typeDef.fallbackColor;
            ctx.beginPath();
            ctx.roundRect(x, y, size, size, BLOCK_BORDER_RADIUS);
            ctx.fill();

            // 레이어 아이콘
            if (typeDef.fallbackIcon) {
                ctx.globalAlpha = 0.8;
                ctx.font = `${EMOJI_FONT_SIZE - 4}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(
                    typeDef.fallbackIcon,
                    pos.x + this.cellSize / 2,
                    pos.y + this.cellSize / 2
                );
            }
        }

        // HP 표시 (2 이상일 때)
        if (layer.hp > 1) {
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            const hpText = `HP:${layer.hp}`;
            const hpX = pos.x + this.cellSize - 6;
            const hpY = pos.y + this.cellSize - 4;
            ctx.strokeText(hpText, hpX, hpY);
            ctx.fillText(hpText, hpX, hpY);
        }

        ctx.restore();
    }

    /**
     * 특수 블록의 방향/타입 인디케이터를 그린다.
     * @private
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} block - Block 객체
     * @param {number} baseX - 블록 좌상단 X
     * @param {number} baseY - 블록 좌상단 Y
     */
    _drawSpecialIndicator(ctx, block, baseX, baseY) {
        const cx = baseX + this.cellSize / 2;
        const cy = baseY + this.cellSize / 2;
        const half = this.cellSize / 2 - CELL_PADDING;

        ctx.save();
        ctx.globalAlpha = 0.6;

        if (block.typeId === 6) {
            // 가로 로켓: 좌우 화살표
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            // 왼쪽 화살표
            ctx.beginPath();
            ctx.moveTo(baseX + CELL_PADDING + 6, cy);
            ctx.lineTo(baseX + CELL_PADDING + 14, cy - 5);
            ctx.moveTo(baseX + CELL_PADDING + 6, cy);
            ctx.lineTo(baseX + CELL_PADDING + 14, cy + 5);
            ctx.stroke();
            // 오른쪽 화살표
            ctx.beginPath();
            ctx.moveTo(baseX + this.cellSize - CELL_PADDING - 6, cy);
            ctx.lineTo(baseX + this.cellSize - CELL_PADDING - 14, cy - 5);
            ctx.moveTo(baseX + this.cellSize - CELL_PADDING - 6, cy);
            ctx.lineTo(baseX + this.cellSize - CELL_PADDING - 14, cy + 5);
            ctx.stroke();
        } else if (block.typeId === 7) {
            // 세로 로켓: 상하 화살표
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            // 위 화살표
            ctx.beginPath();
            ctx.moveTo(cx, baseY + CELL_PADDING + 6);
            ctx.lineTo(cx - 5, baseY + CELL_PADDING + 14);
            ctx.moveTo(cx, baseY + CELL_PADDING + 6);
            ctx.lineTo(cx + 5, baseY + CELL_PADDING + 14);
            ctx.stroke();
            // 아래 화살표
            ctx.beginPath();
            ctx.moveTo(cx, baseY + this.cellSize - CELL_PADDING - 6);
            ctx.lineTo(cx - 5, baseY + this.cellSize - CELL_PADDING - 14);
            ctx.moveTo(cx, baseY + this.cellSize - CELL_PADDING - 6);
            ctx.lineTo(cx + 5, baseY + this.cellSize - CELL_PADDING - 14);
            ctx.stroke();
        } else if (block.typeId === 9) {
            // 레인보우: 무지개색 테두리
            const colors = ['#FF0000', '#FF8800', '#FFFF00', '#00FF00', '#0088FF', '#8800FF'];
            const segments = colors.length;
            for (let i = 0; i < segments; i++) {
                const startAngle = (i / segments) * Math.PI * 2 - Math.PI / 2;
                const endAngle = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, half - 2, startAngle, endAngle);
                ctx.strokeStyle = colors[i];
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        } else if (block.typeId === 10) {
            // 타겟 유도형 폭탄: 조준선 (십자 + 원)
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            const r = half * 0.5;
            // 원형 조준선
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            // 십자선
            ctx.beginPath();
            ctx.moveTo(cx - r - 4, cy);
            ctx.lineTo(cx + r + 4, cy);
            ctx.moveTo(cx, cy - r - 4);
            ctx.lineTo(cx, cy + r + 4);
            ctx.stroke();
        }

        ctx.restore();
    }

    // ========================================
    // 유틸리티
    // ========================================

    /**
     * 색상을 어둡게 만든다.
     * @private
     * @param {string} hex - HEX 색상 코드
     * @param {number} amount - 어둡게 할 비율 (0~1)
     * @returns {string} 어두워진 HEX 색상
     */
    _darkenColor(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, ((num >> 16) & 0xFF) * (1 - amount)) | 0;
        const g = Math.max(0, ((num >> 8) & 0xFF) * (1 - amount)) | 0;
        const b = Math.max(0, (num & 0xFF) * (1 - amount)) | 0;
        return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
    }

    /**
     * Canvas 크기를 재조정한다. (보드 크기 변경 시)
     */
    resize() {
        this._resizeCanvas();
    }
}

// ========================================
// 내보내기
// ========================================

export { Renderer, CELL_SIZE, BOARD_PADDING };
