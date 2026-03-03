# 매치3 기믹 프로토타이핑 플랫폼 — 상세 구현 계획서

---

## 0. 분석 요약

### 현재 프로젝트 상태
- 코드 파일 없음 (코어 엔진부터 신규 구현)
- 리서치 완료 (오픈소스 매치3 분석, Gemini API, 기믹 시스템 패턴)
- 에이전트 정의 4개 (Explore, Plan, Bash, Match3 Test)

### 블록/기믹 정의
- 일반 블록 5종: 빨강(1), 파랑(2), 초록(3), 노랑(4), 보라(5)
- 특수 블록 4종: 가로로켓(6), 세로로켓(7), 폭탄(8), 레인보우(9)
- 기믹 9종: 얼음1단계(10), 얼음2단계(11), 체인(12), 꿀(13), 잡초(14), 곰인형(15), 나무상자(16), 돌(17), 거대상자(18)

### 진행 방향
A안 채택: 코어 엔진을 먼저 구현한 후 기믹 시스템을 얹는다.

---

## 1. 구현 단계 (Phase)

### Phase 1: 프로젝트 기반 + 보드 렌더링

**목표**: 빈 화면에서 8x8 보드가 그려지고 블록이 표시되는 상태까지

**구현 항목**:
1. 폴더 구조 생성 (CLAUDE.md 11절 기준)
2. `index.html` — Canvas 엘리먼트 + ES Module 스크립트 로딩
3. `css/style.css` — 기본 레이아웃 (보드 중앙 배치, 패널 영역)
4. `js/core/blockTypes.js` — 블록/기믹 타입 데이터를 JS 상수로 정의
5. `js/core/board.js` — Board 클래스, 2D Tile 배열 초기화, 블록 랜덤 배정
6. `js/render/renderer.js` — Canvas 렌더러, 보드/블록 그리기 (폴백 색상 + 이모지)

**완료 기준**:
- 브라우저에서 index.html을 열면 8x8 보드에 5색 블록이 랜덤 배치
- 초기 배치 시 3매치가 없어야 함
- 콘솔에서 `board.grid` 출력하여 2D 배열 구조 확인 가능

**검증 방법**: 브라우저 육안 확인 + 콘솔 board.grid 검사

**의존성**: 없음 (최초 단계)

---

### Phase 2: 스왑 + 매치 감지 + 제거

**목표**: 블록을 드래그하여 스왑하면 매치 감지 후 제거

**구현 항목**:
1. `js/core/swap.js` — 마우스/터치 입력 처리, 인접 블록 스왑 로직
2. `js/core/match.js` — 행/열 스캔, 3+매치 감지, T/L 교차점 감지
3. `js/render/animation.js` — 스왑 애니메이션, 제거 애니메이션 (scale-down)
4. `renderer.js` 확장 — requestAnimationFrame 게임 루프 구조

**완료 기준**:
- 블록 스왑 시 매치 감지 → 매칭 블록 제거 애니메이션 → 빈 칸 표시
- 유효하지 않은 스왑은 원위치로 되돌아감
- 3매치/4매치/5매치/L-T매치 모두 정확히 감지

**검증 방법**: 수동 플레이 테스트 + Node.js 매치 감지 단위 테스트

**의존성**: Phase 1 완료 필요

---

### Phase 3: 낙하 + 리필 + 연쇄 + 셔플

**목표**: 제거 후 중력 낙하, 리필, 연쇄 매치, 데드락 시 셔플까지 완전한 코어 루프

**구현 항목**:
1. `js/core/gravity.js` — 열 단위 낙하 계산, 위에서 새 블록 리필
2. `js/core/cascade.js` — 연쇄 루프 (감지→제거→낙하→리필→재감지 반복)
3. `animation.js` 확장 — 낙하 애니메이션 (ease-out + 바운스), 리필 진입 애니메이션
4. 셔플 감지 (모든 인접 쌍 시뮬레이션) + 셔플 실행 + 무한루프 방지

**완료 기준**:
- 스왑 한 번으로 매치→제거→낙하→리필→연쇄 전체 사이클 자동 진행
- 연쇄 3회 이상 정상 처리
- 가능한 수가 없으면 자동 셔플 발동
- 셔플 무한루프 방지 (최대 시도 횟수 제한)

**검증 방법**: 연쇄 시나리오 수동 테스트 + cascade/gravity 단위 테스트

**의존성**: Phase 2 완료 필요

---

### Phase 4: 특수 블록

**목표**: 4매치/5매치/L-T매치 시 특수 블록 생성 및 발동, 조합 효과

**구현 항목**:
1. `js/core/specialBlock.js` — 특수 블록 생성 규칙, 발동 효과, 조합 매트릭스
2. `match.js` 확장 — 매치 패턴 분류 (3/4/5/L/T)하여 MatchResult.type에 반영
3. `cascade.js` 확장 — 특수 블록 생성 타이밍 (매치 제거 직전, 스왑 위치 기준)
4. `renderer.js` 확장 — 특수 블록 시각 표현 (이모지 + 색상), 발동 애니메이션

**완료 기준**:
- 4매치 = 로켓 (가로/세로), 5매치 = 레인보우, L/T = 폭탄 정확히 생성
- 로켓+로켓 = 십자 제거
- 로켓+폭탄 = 3행+3열 제거
- 폭탄+폭탄 = 확대 범위 제거
- 레인보우+일반 = 해당 색 전체 제거
- 레인보우+특수 = 해당 색 전부를 해당 특수 블록으로 변환 후 발동
- 레인보우+레인보우 = 보드 전체 제거

**검증 방법**: 각 조합별 전용 보드 배치 테스트 + special.test.js

**의존성**: Phase 3 완료 필요

---

### Phase 5: 이벤트 시스템 + 기믹 프레임워크

**목표**: 이벤트 버스 도입 + 기믹 등록/발동/파괴 시스템 구축

**구현 항목**:
1. `js/core/eventBus.js` — 이벤트 발행/구독 시스템
2. 코어 엔진 이벤트 발행 연동 (match, cascade, gravity, swap에 emit 추가)
3. `js/gimmick/gimmickFramework.js` — 기믹 레지스트리, 생명주기 관리, GenericGimmickHandler
4. `js/gimmick/gimmickTypes.js` — 9종 기믹 핸들러 등록
5. `js/gimmick/gimmickInteraction.js` — 기믹 간 상호작용 매트릭스, 우선순위 처리, 연쇄 트리거

**완료 기준**:
- 얼음(1단계/2단계), 체인, 꿀, 잡초, 곰인형, 나무상자, 돌, 거대상자(2x2) 모두 보드에 배치 가능
- 각 기믹의 발동 조건에 따라 정확히 동작
- 기믹 간 연쇄 트리거 정상 동작 (폭탄→얼음 파괴→낙하 등)
- 확산형 기믹 턴 종료 시 전파

**검증 방법**: match3-test-agent 기준 전체 기믹 테스트 + interaction.test.js

**의존성**: Phase 4 완료 필요

---

### Phase 6: UI + 파라미터 패널

**목표**: 기획자가 파라미터를 수치 입력으로 실시간 제어

**구현 항목**:
1. `js/ui/parameterPanel.js` — 파라미터 패널 UI, 이전/현재 값 표시, 되돌리기/초기화
2. `css/style.css` 확장 — 패널 레이아웃, 변경 항목 하이라이트 스타일
3. 렌더러/애니메이션 파라미터 연결 (낙하 속도, 바운스 강도, 스왑 속도 등)
4. 기믹별 고유 파라미터 동적 생성 (HP, 확산 속도, 효과 범위 등)

**완료 기준**:
- 패널에서 낙하 속도를 0.3→0.5로 변경하면 즉시 반영
- 이전 값 표시, 변경된 항목 시각적 구분 (배경색 등)
- 되돌리기(이전 값 복원) 정상 동작
- 전체 초기화 정상 동작
- 기믹 배치 시 해당 기믹의 고유 파라미터가 패널에 자동 추가

**검증 방법**: 파라미터 변경 후 보드 동작 변화 육안 확인

**의존성**: Phase 5 완료 필요

---

### Phase 7: AI 기믹 생성

**목표**: 자연어 입력으로 기믹 생성, 보드에 배치, 저장

**구현 항목**:
1. `js/ai/llmApi.js` — LLM API 추상화 레이어, GeminiProvider 구현
2. `js/ai/gimmickParser.js` — API 응답 파싱, 검증, 규칙 기반 폴백 파서
3. `js/ui/gimmickInput.js` — 자연어 입력 UI, 이미지 업로드, API 키 입력, 저장 버튼
4. 생성된 기믹 → gimmickFramework 등록 → 보드 배치 파이프라인 연결

**완료 기준**:
- "3번 맞추면 깨지는 유리 블록" 입력 → Gemini JSON 반환 → 보드에 기믹 생성 → 플레이 가능
- 저장 시 blockTypes에 영구 추가
- API 실패 시 규칙 기반 폴백 파서로 기본 기믹 생성
- 이미지 업로드 → 기믹 외형 적용

**검증 방법**: 5가지 자연어 입력 시나리오 테스트, API 실패 시 폴백 동작 확인

**의존성**: Phase 5, Phase 6 완료 필요

---

### Phase 8: 연출 고도화 + 힌트 시스템

**목표**: 게임 느낌을 살리는 추가 연출

**구현 항목**:
1. 점수 텍스트 팝업 (매치 위치 위에 점수 상승 애니메이션)
2. 콤보 보드 흔들림 (연쇄 3회 이상 시)
3. 특수 블록 생성 시 강조 효과 (확대→축소 + 밝기)
4. 가능한 수 힌트 (5초 무입력 시 블록 살짝 흔들기)
5. 얼음 금 가는 단계 표현 (HP별 시각 변화)
6. 폭탄 터질 때 주변 블록 흔들림

**완료 기준**:
- 60fps 유지 (Chrome DevTools Performance 탭 확인)
- 기획자가 "재미 판단이 가능한" 수준의 시각 피드백
- 모든 연출 파라미터가 파라미터 패널에서 제어 가능

**검증 방법**: 60fps 프로파일링 + 연출 시각 확인

**의존성**: Phase 7 완료 필요 (기능적으로는 Phase 6 이후 가능하나 전체 흐름상 마지막)

---

## 2. 파일별 역할과 핵심 인터페이스

### 2.1 핵심 데이터 구조

#### BlockTypeDefinition (블록/기믹 정적 정의)

```
BlockTypeDefinition {
  id: number              // 고유 식별자 (자동 채번)
  name: string            // "얼음 (2단계)"
  description: string     // "2회 인접 매치로 파괴"
  blockType: "Normal" | "Special" | "Gimmick"
  colorType: "Red"|"Blue"|"Green"|"Yellow"|"Purple"|null
  layerType: string|null  // "Ice_Lv1", "Chain", "Honey", "Box", "Stone" 등

  // 미션/수집
  collectable: boolean
  collectType: "fallToBottom"|"directMatch"|null

  // 파괴 조건
  hp: number              // 파괴까지 필요한 타격 횟수 (0=파괴 불가)
  directDamage: boolean   // 직접 매치로 데미지
  indirectDamage: boolean // 인접 매치로 데미지
  bombDamage: boolean     // 특수 블록(로켓/폭탄)으로 데미지
  rainbowDamage: boolean  // 레인보우로 데미지
  invincible: boolean     // 무적 여부
  removed: boolean        // HP 0 되면 칸에서 제거 여부

  // 이동/물리
  swap: boolean           // 스왑 가능
  gravity: boolean        // 중력 낙하 여부
  slidable: boolean       // 대각선 흐름
  immovable: boolean      // 고정형

  // 확산
  spreadable: boolean
  spreadRate: number      // 턴당 확산 칸 수
  spreadDirection: "adjacent4"|"adjacent8"|null

  // 발동/효과
  triggerCondition: "directMatch"|"adjacentMatch"|"turnEnd"|"reachBottom"|null
  effectType: "destroy"|"destroyRow"|"destroyColumn"|"destroyArea"|"destroyColor"|"reduceHp"|"collect"|null
  effectRange: number     // 효과 범위 (칸 수)
  priority: number        // 처리 순서 (숫자 작을수록 먼저)

  // 크기
  width: number
  height: number

  // 비주얼
  fallbackColor: string   // "#A0D2FF"
  fallbackIcon: string    // "❄️"
  resources: string|null  // 업로드 이미지 경로
}
```

#### Tile (보드의 한 칸)

```
Tile {
  row: number
  col: number
  block: Block | null     // 해당 칸의 블록 (null = 빈 칸)
  layers: Layer[]         // 레이어형 기믹 (얼음, 체인 등), 최대 3개
  isActive: boolean       // 유효한 칸인지
}
```

#### Block (칸 위의 블록 엔티티)

```
Block {
  id: number              // 런타임 고유 ID (자동 채번)
  typeId: number          // BlockTypeDefinition.id 참조

  // 논리적 위치
  row: number
  col: number

  // 런타임 상태
  hp: number
  state: "idle"|"matched"|"falling"|"removing"|"swapping"

  // 애니메이션용 보간 위치
  visualX: number         // 렌더링 X (픽셀)
  visualY: number         // 렌더링 Y (픽셀)
  scale: number           // 제거 애니메이션용 (기본 1.0)
  alpha: number           // 투명도 (기본 1.0)

  // 다중 칸 블록용 (2x2 등)
  originRow: number
  originCol: number
  isOrigin: boolean
}
```

#### Layer (레이어형 기믹)

```
Layer {
  typeId: number          // BlockTypeDefinition.id 참조
  hp: number              // 현재 체력
  zIndex: number          // 렌더링 순서 (양수=블록 위, 음수=블록 아래)
}
```

#### MatchResult (매치 감지 결과)

```
MatchResult {
  positions: {row, col}[]
  type: "3"|"4"|"5"|"L"|"T"
  direction: "horizontal"|"vertical"|"cross"
  specialBlockType: number|null    // 생성할 특수 블록 typeId
  specialBlockPosition: {row, col}|null
}
```

#### AnimationItem (애니메이션 큐 항목)

```
AnimationItem {
  type: "swap"|"fall"|"remove"|"spawn"|"bounce"|"shake"|"scorePopup"|"hint"
  targets: Block[]|{row,col}[]
  startTime: number
  duration: number
  easing: string          // "easeOut"|"easeInOut"|"linear"|"bounce"
  params: object
  onComplete: function
}
```

---

### 2.2 파일별 역할 및 export

#### `js/core/blockTypes.js`

역할: 블록/기믹 타입 데이터 중앙 저장소.

```
export:
  BLOCK_TYPES: Map<number, BlockTypeDefinition>
  getBlockType(id): BlockTypeDefinition
  getTypesByCategory(blockType): BlockTypeDefinition[]
  getNormalTypes(): BlockTypeDefinition[]
  getSpecialTypes(): BlockTypeDefinition[]
  getGimmickTypes(): BlockTypeDefinition[]
  addBlockType(definition): number          // AI 생성 기믹 추가, 새 id 반환
  removeBlockType(id): boolean
```

의존성: 없음

---

#### `js/core/board.js`

역할: 2D Tile 배열 생성/관리. 보드 상태의 단일 진실 소스(source of truth).

```
export:
  class Board {
    constructor(rows, cols)
    grid: Tile[][]
    rows: number
    cols: number

    getTile(row, col): Tile
    getBlock(row, col): Block|null
    setBlock(row, col, block): void
    removeBlock(row, col): Block|null
    swapBlocks(row1, col1, row2, col2): void

    addLayer(row, col, layer): void
    removeLayer(row, col, layerTypeId): Layer|null
    getLayersAt(row, col): Layer[]

    initialize(config?): void
    placeGimmick(typeId, row, col): void

    isValidPosition(row, col): boolean
    isEmpty(row, col): boolean
    isOccupiedByLargeBlock(row, col): boolean
    getAdjacentTiles(row, col): Tile[]
    getAllBlocks(): Block[]
    getBlocksByType(typeId): Block[]
    getBlocksByColor(colorType): Block[]
  }
```

의존성: `blockTypes.js`

---

#### `js/core/match.js`

역할: 매치 감지 전담. 보드 상태를 읽기만 하고 수정하지 않음 (순수 함수).

```
export:
  class MatchDetector {
    constructor(board)
    findAllMatches(): MatchResult[]
    findMatchesAt(row, col): MatchResult[]
    classifyMatch(positions): MatchType
    hasAnyValidMove(): boolean
    findAllValidMoves(): {from, to}[]
    findBestHint(): {from, to}|null
  }
```

의존성: `board.js`

---

#### `js/core/swap.js`

역할: 사용자 입력 처리 + 스왑 유효성 검증.

```
export:
  class SwapHandler {
    constructor(board, canvas, renderer)
    onPointerDown(x, y): void
    onPointerMove(x, y): void
    onPointerUp(x, y): void
    trySwap(fromRow, fromCol, toRow, toCol): SwapResult
    isValidSwap(from, to): boolean
    isEnabled: boolean
    selectedBlock: {row, col}|null
    onSwapAttempt: (from, to, result) => void
  }

  SwapResult {
    success: boolean
    from: {row, col}
    to: {row, col}
    matchResults: MatchResult[]
  }
```

의존성: `board.js`, `renderer.js`

---

#### `js/core/gravity.js`

역할: 낙하 계산 + 리필 블록 생성.

```
export:
  class GravityHandler {
    constructor(board)
    calculateFalls(): FallMove[]
    applyFalls(moves): void
    generateRefills(): RefillInfo[]
    applyRefills(refills): void
  }

  FallMove { block, fromRow, toRow, col, distance }
  RefillInfo { col, row, typeId, startY }
```

의존성: `board.js`, `blockTypes.js`

---

#### `js/core/cascade.js`

역할: 전체 턴 사이클 오케스트레이션.

```
export:
  class CascadeManager {
    constructor(board, matchDetector, gravityHandler, specialBlockManager, eventBus)
    async executeTurn(swapResult): TurnResult
    async executeCascadeLoop(): CascadeStep[]
    isProcessing: boolean
    currentStep: number
  }

  CascadeStep { step, matches, removedBlocks, createdSpecials, falls, refills, gimmickEvents }
  TurnResult { steps, totalRemoved, totalCascades, score }
```

의존성: `board.js`, `match.js`, `gravity.js`, `specialBlock.js`, `eventBus.js`

---

#### `js/core/specialBlock.js`

역할: 특수 블록 생성 규칙 + 발동 효과 + 조합 매트릭스.

```
export:
  class SpecialBlockManager {
    constructor(board)
    createSpecialFromMatch(match): Block|null
    getSpecialTypeForMatch(matchType): number|null
    activateSpecial(block): AffectedArea
    isSpecialBlock(block): boolean
    combineTwoSpecials(block1, block2): CombinationEffect
    getCombinationMatrix(): Map<string, CombinationRule>
    calculateRocketEffect(row, col, direction): {row,col}[]
    calculateBombEffect(row, col, range): {row,col}[]
    calculateRainbowEffect(colorType): {row,col}[]
    calculateCrossEffect(row, col): {row,col}[]
    calculateBigBombEffect(row, col): {row,col}[]
    calculateRainbowSpecialEffect(colorType, specialTypeId): {row,col}[]
  }
```

의존성: `board.js`, `blockTypes.js`

#### 특수 블록 연쇄 발동 시스템 (Phase 4 핵심 설계)

##### 발동 방식: DFS(깊이 우선) + Visited Set

```
activateSpecialChain(triggerBlock):
  visited = Set<blockId>()         // 재발동 방지
  activationQueue = []              // 발동 결과 수집

  function dfsActivate(block):
    if visited.has(block.id): return     // 이미 발동됨
    if !isSpecialBlock(block): return    // 특수 블록 아님
    visited.add(block.id)

    // 1. 이 블록의 효과 범위 계산
    affectedArea = calculateEffect(block)
    activationQueue.push({ block, affectedArea })

    // 2. 범위 내 다른 특수 블록 → 즉시 재귀 발동 (DFS)
    for pos in affectedArea.positions:
      targetBlock = board.getBlock(pos.row, pos.col)
      if targetBlock && isSpecialBlock(targetBlock):
        dfsActivate(targetBlock)         // 깊이 우선 재귀

  dfsActivate(triggerBlock)

  // 3. 모든 발동 결과의 합집합 = 최종 제거 대상
  allAffectedPositions = union(activationQueue.map(a => a.affectedArea))
  return allAffectedPositions
```

##### 무한루프 방지 (3중 안전장치)

| 안전장치 | 방식 | 값 |
|---------|------|---|
| Visited Set | 이미 발동된 특수 블록 blockId 기록, 재발동 차단 | - |
| 최대 재귀 깊이 | DFS 재귀 호출 횟수 제한 | MAX_SPECIAL_CHAIN_DEPTH = 20 |
| Cascade 루프 제한 | 전체 연쇄 루프(매치→제거→낙하→리필) 반복 횟수 제한 | MAX_CASCADE_ITERATIONS = 50 |

##### 특수 블록 조합 시 발동 순서

| 조합 | 처리 방식 |
|------|---------|
| 로켓+로켓 | 두 로켓 모두 consumed → 십자 효과 1회 발동 |
| 로켓+폭탄 | 두 블록 모두 consumed → 3행+3열 강화 효과 1회 발동 |
| 폭탄+폭탄 | 두 블록 모두 consumed → 5x5 확대 범위 1회 발동 |
| 레인보우+일반 | 레인보우 consumed → 해당 색 전체 제거 |
| 레인보우+로켓 | 레인보우 consumed → 해당 색 모두 로켓 변환 → 각 로켓 DFS 발동 |
| 레인보우+폭탄 | 레인보우 consumed → 해당 색 모두 폭탄 변환 → 각 폭탄 DFS 발동 |
| 레인보우+레인보우 | 둘 다 consumed → 보드 전체 제거 (최고 우선순위) |

- **조합은 스왑 시점에만 발생** (연쇄 중에는 조합 없음, 개별 발동)
- 조합 시 두 블록 모두 consumed 처리 → visited에 추가 → 범위 효과로 대체
- 강화 효과가 범위 내 다른 특수 블록을 건드리면 DFS 연쇄 발동

##### 특수 블록 생성 위치 규칙

| 시나리오 | 생성 위치 |
|---------|---------|
| 유저 스왑으로 매치 | 스왑으로 이동한 블록의 최종 위치 |
| 연쇄(자동) 매치 | 매치 영역의 중앙 블록 위치 (Math.floor(length/2)) |
| L/T 매치 | 교차점 위치 |

##### 로켓 방향 결정

| 시나리오 | 로켓 방향 |
|---------|---------|
| 가로 스왑 → 4매치 | 가로 로켓 |
| 세로 스왑 → 4매치 | 세로 로켓 |
| 연쇄 중 가로 4매치 (스왑 없음) | 가로 로켓 (매치 방향 동일) |
| 연쇄 중 세로 4매치 (스왑 없음) | 세로 로켓 (매치 방향 동일) |

---

#### `js/core/eventBus.js`

역할: 전역 이벤트 발행/구독 시스템.

```
export:
  class EventBus {
    on(eventName, callback, priority?): void
    off(eventName, callback): void
    emit(eventName, payload): void
    once(eventName, callback): void
    clear(): void
  }

  export const eventBus: EventBus  // 싱글톤

  export const EVENTS = {
    // 코어 (16종)
    SWAP_ATTEMPTED, SWAP_SUCCESS, SWAP_FAILED,
    MATCH_DETECTED, BLOCKS_REMOVING, BLOCKS_REMOVED,
    SPECIAL_CREATED, SPECIAL_ACTIVATED, SPECIALS_COMBINED,
    GRAVITY_START, GRAVITY_COMPLETE,
    CASCADE_STEP, CASCADE_COMPLETE, TURN_END,
    SHUFFLE_NEEDED, SHUFFLE_COMPLETE,
    // 기믹 (6종)
    GIMMICK_DAMAGED, GIMMICK_DESTROYED, GIMMICK_SPREAD,
    GIMMICK_COLLECTED, GIMMICK_PLACED, GIMMICK_TRIGGERED,
    // UI (5종)
    PARAMETER_CHANGED, AI_GIMMICK_GENERATED, AI_GIMMICK_FAILED,
    ANIMATION_COMPLETE, HINT_SHOW,
  }
```

의존성: 없음

---

#### `js/gimmick/gimmickFramework.js`

역할: 기믹 등록/생명주기/발동 관리.

```
export:
  class GimmickFramework {
    constructor(board, eventBus)
    registerGimmick(typeId, handler): void
    unregisterGimmick(typeId): void
    placeGimmick(typeId, row, col): void
    removeGimmickAt(row, col, layerTypeId?): void
    onMatchDetected(matchResult): GimmickEvent[]
    onBlockRemoved(row, col): GimmickEvent[]
    onTurnEnd(): GimmickEvent[]
    onSpecialActivated(block, affectedArea): GimmickEvent[]
    getGimmicksAt(row, col): Layer[]
    getAllActiveGimmicks(): {row, col, layer}[]
  }

  // 기믹 핸들러 인터페이스
  GimmickHandler {
    typeId: number
    onDirectMatch(tile, matchResult): GimmickEvent|null
    onAdjacentMatch(tile, matchResult): GimmickEvent|null
    onBombDamage(tile, source): GimmickEvent|null
    onRainbowDamage(tile): GimmickEvent|null
    onTurnEnd(tile): GimmickEvent|null
    onDestroy(tile): GimmickEvent|null
    canSwap(tile): boolean
    canFall(tile): boolean
    canOccupy(tile): boolean
    getVisualState(tile): object
  }

  // 범용 핸들러 — BlockTypeDefinition 속성만으로 동작
  class GenericGimmickHandler implements GimmickHandler {
    constructor(blockTypeDefinition)
  }
```

의존성: `board.js`, `eventBus.js`, `blockTypes.js`

---

#### `js/gimmick/gimmickTypes.js`

역할: 9종 내장 기믹 핸들러 등록.

```
export:
  registerAllBuiltinGimmicks(framework): void
```

의존성: `gimmickFramework.js`, `blockTypes.js`

---

#### `js/gimmick/gimmickInteraction.js`

역할: 기믹 간 상호작용 규칙 + 우선순위 처리 + 연쇄 트리거.

```
export:
  class InteractionManager {
    constructor(gimmickFramework)
    setInteraction(typeA, typeB, rule): void
    getInteraction(typeA, typeB): InteractionRule|null
    executeGimmickEvents(events): GimmickEvent[]
    processChainReactions(initialEvents): GimmickEvent[]
    getMaxChainDepth(): number       // 기본 20
  }
```

의존성: `gimmickFramework.js`

---

#### `js/render/renderer.js`

역할: Canvas 렌더링 전담.

```
export:
  class Renderer {
    constructor(canvas, board)
    startGameLoop(): void
    stopGameLoop(): void
    render(timestamp): void
    drawBoard(): void
    drawBlock(block): void
    drawLayer(tile): void
    gridToPixel(row, col): {x, y}
    pixelToGrid(x, y): {row, col}
    cellSize: number
    loadImage(path): Promise<Image>
    setAnimationManager(animManager): void
  }
```

의존성: `board.js`, `blockTypes.js`

---

#### `js/render/animation.js`

역할: 애니메이션 큐 관리 + 이징 함수 + 보간 계산.

```
export:
  class AnimationManager {
    constructor(renderer)
    enqueue(animation): void
    enqueueParallel(animations): void
    enqueueSequential(animations): void
    isPlaying(): boolean
    clear(): void
    update(deltaTime): void
    waitForAll(): Promise<void>
    // 팩토리 메서드
    createSwapAnimation(block1, block2): AnimationItem
    createFallAnimation(block, fromRow, toRow): AnimationItem
    createRemoveAnimation(block): AnimationItem
    createBounceAnimation(block): AnimationItem
    createShakeAnimation(targets, intensity): AnimationItem
    createScorePopup(row, col, score, comboLevel): AnimationItem
    createHintAnimation(block): AnimationItem
    // ... 등
  }

  export const Easing = { linear, easeIn, easeOut, easeInOut, bounce, elastic }
```

의존성: `renderer.js`

---

#### `js/ai/llmApi.js`

역할: LLM API 호출 추상화. Provider 패턴으로 교체 가능.

```
export:
  LLMProvider { name, async generateGimmick(prompt, schema), isAvailable() }
  class GeminiProvider implements LLMProvider { constructor(apiKey) }
  class LLMApiManager {
    setProvider(provider): void
    setApiKey(key): void
    async generate(prompt): Promise<object>
    maxRetries: number     // 기본 3
    onFallback: (prompt) => object
  }
```

의존성: 없음

---

#### `js/ai/gimmickParser.js`

역할: AI 응답 JSON 검증/변환 + 규칙 기반 폴백 파서.

```
export:
  class GimmickParser {
    parseAIResponse(response): BlockTypeDefinition|null
    validateGimmickJson(json): {valid, errors}
    fillDefaults(partialDef): BlockTypeDefinition
    parseByKeywords(naturalLanguage): BlockTypeDefinition
    buildPrompt(naturalLanguage): string
    getSystemPrompt(): string
    getFewShotExamples(): object[]
    getJsonSchema(): object
  }
```

의존성: `blockTypes.js`

---

#### `js/ui/parameterPanel.js`

역할: 실시간 파라미터 제어 UI.

```
export:
  class ParameterPanel {
    constructor(containerElement)
    addParameter(name, key, defaultValue, category?): void
    addGimmickParameters(gimmickTypeId): void
    getValue(key): number
    setValue(key, value): void
    revert(key): void
    revertAll(): void
    resetAll(): void
    onChange: (key, oldValue, newValue) => void
  }
```

의존성: `eventBus.js`

---

#### `js/ui/gimmickInput.js`

역할: AI 기믹 생성 입력 UI + 이미지 업로드 + 저장.

```
export:
  class GimmickInputPanel {
    constructor(containerElement, llmApiManager, gimmickParser, gimmickFramework)
    render(): void
    async generateGimmick(naturalLanguage): BlockTypeDefinition
    previewGimmick(definition): void
    applyImageToGimmick(file, gimmickId): void
    saveGimmickToTypes(gimmickId): void
  }
```

의존성: `llmApi.js`, `gimmickParser.js`, `gimmickFramework.js`, `blockTypes.js`, `eventBus.js`

---

### 2.3 파일 간 의존성 그래프

```
[의존성 없음 — 기반 모듈]
  blockTypes.js
  eventBus.js

[코어 엔진]
  board.js ← blockTypes.js
    ├── match.js ← board.js
    ├── swap.js ← board.js, renderer.js
    ├── gravity.js ← board.js, blockTypes.js
    ├── specialBlock.js ← board.js, blockTypes.js
    └── cascade.js ← board.js, match.js, gravity.js, specialBlock.js, eventBus.js

[기믹 시스템]
  gimmickFramework.js ← board.js, eventBus.js, blockTypes.js
    ├── gimmickTypes.js ← gimmickFramework.js, blockTypes.js
    └── gimmickInteraction.js ← gimmickFramework.js

[렌더링]
  renderer.js ← board.js, blockTypes.js
    └── animation.js ← renderer.js

[AI]
  llmApi.js (의존성 없음)
    └── gimmickParser.js ← llmApi.js, blockTypes.js

[UI]
  parameterPanel.js ← eventBus.js
  gimmickInput.js ← llmApi.js, gimmickParser.js, gimmickFramework.js, blockTypes.js, eventBus.js

[진입점]
  index.html ← 모든 모듈 로딩 + 초기화 오케스트레이션
```

---

## 3. 이벤트 시스템 설계

### 3.1 이벤트 종류와 페이로드

#### 코어 엔진 이벤트 (16종)

| 이벤트 이름 | 발행 주체 | 페이로드 |
|------------|----------|---------|
| `SWAP_ATTEMPTED` | swap.js | `{ from: {row,col}, to: {row,col} }` |
| `SWAP_SUCCESS` | swap.js | `{ from, to, block1, block2 }` |
| `SWAP_FAILED` | swap.js | `{ from, to }` |
| `MATCH_DETECTED` | cascade.js | `{ matches: MatchResult[], step }` |
| `BLOCKS_REMOVING` | cascade.js | `{ blocks, positions }` |
| `BLOCKS_REMOVED` | cascade.js | `{ positions, count, step }` |
| `SPECIAL_CREATED` | cascade.js | `{ block, matchType, position }` |
| `SPECIAL_ACTIVATED` | cascade.js | `{ block, affectedPositions, effectType }` |
| `SPECIALS_COMBINED` | cascade.js | `{ block1, block2, effect }` |
| `GRAVITY_START` | cascade.js | `{ falls: FallMove[] }` |
| `GRAVITY_COMPLETE` | cascade.js | `{ falls, refills }` |
| `CASCADE_STEP` | cascade.js | `{ step: CascadeStep }` |
| `CASCADE_COMPLETE` | cascade.js | `{ result: TurnResult }` |
| `TURN_END` | cascade.js | `{ turnNumber }` |
| `SHUFFLE_NEEDED` | cascade.js | `{}` |
| `SHUFFLE_COMPLETE` | cascade.js | `{ shuffledCount }` |

#### 기믹 이벤트 (6종)

| 이벤트 이름 | 발행 주체 | 페이로드 |
|------------|----------|---------|
| `GIMMICK_DAMAGED` | gimmickFramework.js | `{ row, col, typeId, layerType, oldHp, newHp }` |
| `GIMMICK_DESTROYED` | gimmickFramework.js | `{ row, col, typeId, layerType }` |
| `GIMMICK_SPREAD` | gimmickFramework.js | `{ sourceRow, sourceCol, targetPositions, typeId }` |
| `GIMMICK_COLLECTED` | gimmickFramework.js | `{ row, col, typeId }` |
| `GIMMICK_PLACED` | gimmickFramework.js | `{ row, col, typeId, width, height }` |
| `GIMMICK_TRIGGERED` | gimmickInteraction.js | `{ sourceTypeId, targetTypeId, row, col, triggerType }` |

#### UI/렌더링 이벤트 (5종)

| 이벤트 이름 | 발행 주체 | 페이로드 |
|------------|----------|---------|
| `PARAMETER_CHANGED` | parameterPanel.js | `{ key, oldValue, newValue, category }` |
| `AI_GIMMICK_GENERATED` | gimmickInput.js | `{ definition, fromFallback }` |
| `AI_GIMMICK_FAILED` | gimmickInput.js | `{ error, prompt }` |
| `ANIMATION_COMPLETE` | animation.js | `{ type, groupId }` |
| `HINT_SHOW` | swap.js | `{ from, to }` |

---

### 3.2 한 턴의 완전한 이벤트 흐름

```
사용자 드래그 입력
    │
    ▼
SwapHandler.trySwap(from, to)
    ├── emit SWAP_ATTEMPTED
    ├── board.swapBlocks() 실행
    ├── matchDetector.findMatchesAt() 유효성 검증
    │   ├── [매치 없음] → board.swapBlocks() 되돌림
    │   │   ├── emit SWAP_FAILED
    │   │   └── AnimationManager: 스왑 되돌리기 애니메이션
    │   │
    │   └── [매치 있음] → emit SWAP_SUCCESS
    │       └── AnimationManager: 스왑 애니메이션
    ▼
CascadeManager.executeTurn(swapResult)
    ├── SwapHandler.isEnabled = false  (입력 차단)
    │
    ├── [연쇄 루프 시작] ─────────────────────────────
    │   │
    │   ▼
    │   MatchDetector.findAllMatches()
    │       ├── emit MATCH_DETECTED
    │       ▼
    │   GimmickFramework.onMatchDetected(matches)  ← 이벤트 수신
    │       ├── 직접/인접 매치 기믹 HP 차감
    │       ├── emit GIMMICK_DAMAGED / GIMMICK_DESTROYED
    │       ▼
    │   InteractionManager.processChainReactions()
    │       ├── A기믹 파괴 → B기믹 트리거 확인
    │       ├── emit GIMMICK_TRIGGERED
    │       ▼
    │   SpecialBlockManager.createSpecialFromMatch(match)
    │       ├── emit SPECIAL_CREATED
    │       ▼
    │   블록 제거
    │       ├── emit BLOCKS_REMOVING
    │       ├── AnimationManager: 제거 애니메이션
    │       ├── await waitForAll()
    │       ├── emit BLOCKS_REMOVED
    │       ▼
    │   특수 블록 발동
    │       ├── emit SPECIAL_ACTIVATED
    │       ├── GimmickFramework.onSpecialActivated() ← 이벤트 수신
    │       ▼
    │   GravityHandler.calculateFalls() + applyFalls()
    │       ├── emit GRAVITY_START
    │       ├── AnimationManager: 낙하 애니메이션
    │       ├── await waitForAll()
    │       ▼
    │   GravityHandler.generateRefills() + applyRefills()
    │       ├── AnimationManager: 리필 + 바운스
    │       ├── await waitForAll()
    │       ├── emit GRAVITY_COMPLETE
    │       ▼
    │   emit CASCADE_STEP
    │   └── 매치 존재? → Y: 루프 반복 / N: 루프 종료
    │
    ▼
emit TURN_END
    ├── GimmickFramework.onTurnEnd() ← 이벤트 수신
    │   ├── 확산형 기믹 전파 (꿀, 잡초)
    │   └── emit GIMMICK_SPREAD
    ▼
MatchDetector.hasAnyValidMove()
    ├── [유효 이동 없음] → emit SHUFFLE_NEEDED → 셔플 → emit SHUFFLE_COMPLETE
    ▼
emit CASCADE_COMPLETE
    ├── SwapHandler.isEnabled = true  (입력 허용)
    └── 힌트 타이머 시작 (5초 후 HINT_SHOW)
```

---

### 3.3 이벤트 구독 맵

| 구독자 | 수신 이벤트 | 용도 |
|--------|-----------|------|
| GimmickFramework | MATCH_DETECTED | 매치 위치/인접 기믹 HP 차감 |
| GimmickFramework | BLOCKS_REMOVED | 파괴된 위치 기믹 후처리 |
| GimmickFramework | SPECIAL_ACTIVATED | 특수 블록 범위 내 기믹 처리 |
| GimmickFramework | TURN_END | 확산형 기믹 전파 |
| InteractionManager | GIMMICK_DESTROYED | 연쇄 트리거 확인 |
| AnimationManager | SWAP_SUCCESS / SWAP_FAILED | 스왑 애니메이션 |
| AnimationManager | BLOCKS_REMOVING | 제거 애니메이션 |
| AnimationManager | GRAVITY_START | 낙하 애니메이션 |
| AnimationManager | SPECIAL_CREATED / ACTIVATED | 특수 블록 연출 |
| AnimationManager | GIMMICK_DAMAGED / DESTROYED / SPREAD | 기믹 연출 |
| AnimationManager | SHUFFLE_NEEDED / HINT_SHOW | 셔플/힌트 연출 |
| Renderer | PARAMETER_CHANGED | 렌더링 파라미터 즉시 반영 |
| ParameterPanel | AI_GIMMICK_GENERATED | 기믹 파라미터 패널 추가 |

---

## 4. 기믹 프레임워크 인터페이스

### 4.1 GimmickHandler 인터페이스 상세

```
GimmickHandler {
  typeId: number

  // 생명주기 훅 (해당 없으면 null 반환)
  onDirectMatch(tile, matchResult): GimmickEvent|null    // directDamage=Y인 기믹
  onAdjacentMatch(tile, matchResult): GimmickEvent|null  // indirectDamage=Y인 기믹
  onBombDamage(tile, source): GimmickEvent|null          // bombDamage=Y인 기믹
  onRainbowDamage(tile): GimmickEvent|null               // rainbowDamage=Y인 기믹
  onTurnEnd(tile): GimmickEvent|null                     // triggerCondition="turnEnd"
  onDestroy(tile): GimmickEvent|null                     // HP 0 시 부가 효과

  // 이동/물리 제약
  canSwap(tile): boolean
  canFall(tile): boolean
  canOccupy(tile): boolean

  // 시각 상태
  getVisualState(tile): object
}
```

### 4.2 등록 과정

```
1. 앱 초기화 시: registerAllBuiltinGimmicks(framework)
2. 내부: framework.registerGimmick(typeId, handler) × 9종
3. registerGimmick 내부:
   a. handlers Map에 typeId → handler 저장
   b. EventBus 구독 설정 (MATCH_DETECTED, BLOCKS_REMOVED, TURN_END, SPECIAL_ACTIVATED)
```

### 4.3 기믹 배치 흐름

```
framework.placeGimmick(typeId, row, col)
  1. blockTypes.getBlockType(typeId) 정의 조회
  2. 크기 확인: definition.width, definition.height
  3. 배치 가능 여부 검증
  4. Layer 객체 생성: { typeId, hp, zIndex }
  5. tile.layers에 추가 (2x2는 4칸 모두)
  6. emit GIMMICK_PLACED
```

### 4.4 기믹 발동 처리 (MATCH_DETECTED 수신 시)

```
GimmickFramework.onMatchDetected(matches):
  1. 각 매치 위치 → 해당 tile layers 순회 → directDamage=Y 확인 → onDirectMatch()
  2. 인접 4방향 tile → indirectDamage=Y 확인 → onAdjacentMatch()
  3. GimmickEvent[] 수집 → priority 순 정렬
  4. InteractionManager.executeGimmickEvents() 호출
  5. 각 이벤트 실행: damage → HP 차감 / destroy → 레이어 제거 / spread → 전파
  6. processChainReactions(): 연쇄 깊이 제한 maxChainDepth=20
```

### 4.5 우선순위 (priority 기준)

```
레인보우: 3 / 폭탄: 4 / 로켓: 5 / 곰인형: 8 / 일반 블록: 10
꿀: 15 / 잡초: 15 / 체인: 19 / 얼음: 20 / 상자: 25 / 거대상자: 25 / 돌: 30
```

### 4.6 GenericGimmickHandler — AI 기믹 즉시 동작

```
class GenericGimmickHandler implements GimmickHandler {
  constructor(definition: BlockTypeDefinition)
  // 모든 훅이 definition의 속성(directDamage, indirectDamage 등)을 읽어서 자동 동작
  // AI 생성 기믹도 BlockTypeDefinition만 있으면 즉시 등록/동작 가능
}
```

AI 기믹 연동 흐름:
1. GimmickParser → BlockTypeDefinition 변환
2. blockTypes.addBlockType(definition) → 새 id
3. new GenericGimmickHandler(definition) 생성
4. framework.registerGimmick(newId, handler) 등록
5. framework.placeGimmick(newId, row, col) 배치
6. 이후 모든 코어 이벤트에 자동 반응

---

## 5. AI 기믹 생성 파이프라인

### 5.1 전체 흐름

```
[1] 기획자 자연어 입력
    "3번 맞추면 깨지는 유리 블록, 반투명 하늘색"
         │
         ▼
[2] GimmickParser.buildPrompt(input)
    시스템 프롬프트 + JSON 스키마 + Few-shot 3~5개 + 사용자 입력
         │
         ▼
[3] LLMApiManager.generate(prompt)
    GeminiProvider.generateGimmick() 호출
    POST .../gemini-2.5-flash:generateContent
    헤더: x-goog-api-key
    body: { contents, generationConfig: {temperature: 0, responseMimeType: "application/json"} }
         │
         ▼
[4] 응답 파싱 + 검증
    parseAIResponse() → validateGimmickJson()
    [유효] → [5]로 진행
    [무효] → 재시도 (최대 3회) → 3회 실패 → parseByKeywords() 폴백
         │
         ▼
[5] BlockTypeDefinition 생성
    fillDefaults() → addBlockType() → emit AI_GIMMICK_GENERATED
         │
         ▼
[6] 보드 배치
    GenericGimmickHandler 생성 → registerGimmick → placeGimmick
         │
         ▼
[7] 기획자 테스트 플레이
    파라미터 패널에 기믹 고유 파라미터 자동 추가
         │
         ▼
[8] 저장 (선택)
    blockTypes에 영구 등록 + localStorage 저장
```

### 5.2 프롬프트 설계

#### 시스템 프롬프트

```
당신은 매치3 퍼즐 게임의 기믹(블록 메카닉) 설계 전문가입니다.
사용자가 자연어로 기믹을 설명하면, 아래 JSON 스키마에 맞는 기믹 정의를 생성하세요.

## JSON 스키마
{
  "name": "string (필수)",
  "description": "string",
  "blockType": "Gimmick (고정값)",
  "layerType": "string",
  "hp": "number (필수, 0~10)",
  "directDamage": "boolean (기본: false)",
  "indirectDamage": "boolean (기본: true)",
  "bombDamage": "boolean (기본: true)",
  "rainbowDamage": "boolean (기본: true)",
  "invincible": "boolean (기본: false)",
  "removed": "boolean (기본: true)",
  "swap": "boolean (기본: false)",
  "gravity": "boolean (기본: false)",
  "immovable": "boolean (기본: true)",
  "spreadable": "boolean (기본: false)",
  "spreadRate": "number (기본: 0)",
  "spreadDirection": "adjacent4 / adjacent8 / null",
  "triggerCondition": "directMatch / adjacentMatch / turnEnd / reachBottom (필수)",
  "effectType": "destroy / destroyRow / destroyColumn / destroyArea / destroyColor / reduceHp / collect (필수)",
  "effectRange": "number (기본: 0)",
  "priority": "number (1~30, 기본: 20)",
  "width": "number (1~3, 기본: 1)",
  "height": "number (1~3, 기본: 1)",
  "fallbackColor": "string (#hex, 기본: #CCCCCC)",
  "fallbackIcon": "string (이모지 1글자, 기본: ⬜)"
}

반드시 유효한 JSON 객체만 반환하세요. 설명 텍스트 없이 JSON만 출력하세요.
```

#### Few-shot 예시

**예시 1**: "2번 매칭해야 깨지는 얼음 블록"
```json
{
  "name": "얼음 블록", "description": "2회 인접 매치로 파괴되는 레이어형 기믹",
  "blockType": "Gimmick", "layerType": "Ice_Custom",
  "hp": 2, "indirectDamage": true, "bombDamage": true, "rainbowDamage": true,
  "removed": true, "immovable": true,
  "triggerCondition": "adjacentMatch", "effectType": "reduceHp", "priority": 20,
  "width": 1, "height": 1, "fallbackColor": "#A0D2FF", "fallbackIcon": "❄️"
}
```

**예시 2**: "매턴 주변으로 퍼지는 꿀"
```json
{
  "name": "꿀", "description": "턴마다 인접 1칸 확산, 2회 매치로 파괴",
  "blockType": "Gimmick", "layerType": "Honey_Custom",
  "hp": 2, "indirectDamage": true, "bombDamage": true, "removed": true,
  "immovable": true, "spreadable": true, "spreadRate": 1, "spreadDirection": "adjacent4",
  "triggerCondition": "turnEnd", "effectType": "reduceHp", "priority": 15,
  "fallbackColor": "#FFB300", "fallbackIcon": "🍯"
}
```

**예시 3**: "보드 아래로 떨어뜨려야 하는 곰인형"
```json
{
  "name": "곰인형", "description": "보드 아래로 이동시켜 수집하는 기믹",
  "blockType": "Gimmick", "layerType": "Collect_Bear",
  "collectable": true, "collectType": "fallToBottom",
  "hp": 1, "invincible": true, "gravity": true, "immovable": false,
  "triggerCondition": "reachBottom", "effectType": "collect", "priority": 8,
  "fallbackColor": "#FFD700", "fallbackIcon": "🧸"
}
```

### 5.3 폴백 처리 (규칙 기반 키워드 파싱)

API 3회 실패 시 `parseByKeywords(naturalLanguage)` 실행.

#### 키워드 매핑 규칙

| 카테고리 | 키워드 | 매핑 결과 |
|---------|--------|---------|
| 파괴 | "깨/파괴/부수/제거" | effectType: "reduceHp" |
| HP | "번/회/단계" + 숫자N | hp: N |
| 인접 매치 | "인접/옆/주변 매치" | triggerCondition: "adjacentMatch" |
| 직접 매치 | "직접/매치/매칭" | triggerCondition: "directMatch" |
| 확산 | "퍼/확산/전파/번식" | spreadable: true, triggerCondition: "turnEnd" |
| 수집 | "떨어/낙하/내려/수집" | triggerCondition: "reachBottom", collectType: "fallToBottom" |
| 범위 | "폭발/터/범위" + 숫자N | effectType: "destroyArea", effectRange: N |
| 행/열 | "줄/행/가로" / "열/세로" | effectType: "destroyRow" / "destroyColumn" |
| 고정 | "고정/움직이지" | immovable: true |
| 무적 | "무적/파괴 불가" | invincible: true, hp: 0 |
| 크기 | "2x2/큰/거대" | width: 2, height: 2 |

#### 색상 키워드

| 키워드 | fallbackColor |
|--------|-------------|
| 빨/적/레드 | #FF4444 |
| 파/청/블루 | #4444FF |
| 초/녹/그린 | #44CC44 |
| 노/황/옐로우 | #FFCC00 |
| 하늘/스카이 | #87CEEB |
| 주황/오렌지 | #FF8800 |
| 분홍/핑크 | #FF69B4 |

#### 아이콘 키워드

| 키워드 | fallbackIcon |
|--------|-------------|
| 얼음/빙 | ❄️ |
| 불/화염 | 🔥 |
| 꿀 | 🍯 |
| 잡초/풀 | 🌿 |
| 상자/박스 | 📦 |
| 돌/바위 | 🪨 |
| 유리 | 🪟 |
| 폭탄 | 💣 |
| 별/스타 | ⭐ |

---

## 6. 렌더링/애니메이션 아키텍처

### 6.1 게임 루프 구조

```
Renderer.startGameLoop()
  └── requestAnimationFrame(gameLoop)

gameLoop(timestamp):
  1.  deltaTime 계산
  2.  animationManager.update(deltaTime)
  3.  updateBlockVisualPositions()
  4.  ctx.clearRect()
  5.  drawBackground()          // 보드 배경, 격자
  6.  drawLayersBelow()         // zIndex < 0 레이어 (꿀 등)
  7.  drawBlocks()              // 모든 블록 (이미지 or 폴백)
  8.  drawLayersAbove()         // zIndex > 0 레이어 (얼음, 체인)
  9.  drawEffects()             // 폭발, 셰이크
  10. drawUI()                  // 점수 팝업, 힌트
  11. requestAnimationFrame(gameLoop)
```

### 6.2 Model-View 분리

```
Model (board.js):
  - block.row, block.col = 논리적 위치 (정수), 즉시 변경

View (renderer.js + animation.js):
  - block.visualX, block.visualY = 렌더링 위치 (실수, 픽셀)
  - block.scale, block.alpha = 시각 효과
  - 애니메이션이 이 속성들을 보간하여 부드럽게 변화

규칙:
  1. 모델 변경은 즉시 (동기적)
  2. 애니메이션은 모델 변경 후 요청
  3. CascadeManager: 모델 변경 → 애니메이션 요청 → waitForAll() 대기
  4. 렌더러: 매 프레임 visual 속성 값을 읽어 그림
```

### 6.3 애니메이션 큐/상태 관리

```
AnimationManager {
  activeAnimations: AnimationItem[]     // 현재 재생 중
  pendingGroups: AnimationGroup[]       // 대기열

  AnimationGroup {
    items: AnimationItem[]
    mode: "parallel"|"sequential"
    resolvePromise: Function
  }
}

실행 흐름:
1. enqueueParallel([anim1, anim2]) → Promise 반환
2. update(deltaTime):
   a. 대기 그룹 → 활성화
   b. progress = (now - startTime) / duration
   c. 타입별 보간:
      swap: visualX/Y lerp
      fall: visualY lerp
      remove: scale/alpha → 0
      bounce: sin(progress) * intensity
      shake: sin(progress * 6π) * intensity * (1-progress)
   d. progress >= 1.0 → onComplete() → 제거
3. waitForAll(): 모든 큐 완료 대기
```

### 6.4 애니메이션 타이밍 기본값

| 파라미터 키 | 애니메이션 | 기본값 | 이징 |
|-----------|-----------|-------|------|
| `SWAP_DURATION` | 스왑 | 250ms | easeInOut |
| `SWAP_REVERT_DURATION` | 스왑 되돌리기 | 200ms | easeInOut |
| `FALL_DURATION_PER_CELL` | 낙하 (칸당) | 150ms | easeOut |
| `BOUNCE_DURATION` | 착지 바운스 | 200ms | bounce |
| `BOUNCE_INTENSITY` | 바운스 강도 | 0.3 | - |
| `REMOVE_DURATION` | 제거 (축소) | 250ms | easeIn |
| `REMOVE_STAGGER` | 제거 딜레이 (순차) | 50ms/블록 | - |
| `SPECIAL_CREATE_DURATION` | 특수 블록 생성 | 400ms | easeOut |
| `SHAKE_DURATION` | 흔들림 | 300ms | easeOut |
| `SHAKE_INTENSITY` | 흔들림 강도 | 4px | - |
| `SCORE_POPUP_DURATION` | 점수 팝업 | 800ms | easeOut |
| `HINT_DURATION` | 힌트 흔들기 | 600ms | easeInOut |
| `HINT_DELAY` | 힌트 대기 시간 | 5000ms | - |
| `BOARD_SHAKE_DURATION` | 보드 흔들림 (콤보) | 400ms | easeOut |
| `BOARD_SHAKE_INTENSITY` | 보드 흔들림 강도 | 6px | - |
| `SPREAD_DURATION` | 확산 | 300ms | easeInOut |

### 6.5 블록 렌더링 방식

#### 일반/특수 블록

```
drawBlock(block):
  1. definition = getBlockType(block.typeId)
  2. ctx.save() → globalAlpha, translate, scale 적용
  3. 이미지 있으면: drawImage
  4. 없으면 폴백: 둥근 사각형(fallbackColor) + 이모지(fallbackIcon)
  5. 특수 블록: 테두리 빛남 + 방향 표시
  6. ctx.restore()
```

#### 레이어(기믹)

```
얼음: 반투명 파란색 오버레이 + HP별 금 패턴
체인: 회색 X자 패턴
꿀: 반투명 노란색 (zIndex < 0, 블록 아래)
잡초: 반투명 초록색 + 덩굴 패턴
상자/돌: 블록 대체 (block=null), 자체 렌더링
```

---

## 7. 검증 가능한 엣지케이스 목록

### 7.1 코어 엔진 엣지케이스

#### 매치 감지 (M1~M6)

| # | 엣지케이스 | 설명 | 검증 방법 |
|---|-----------|------|---------|
| M1 | T자 매치 | 가로3 + 세로3이 교차 | type="T", 5개 위치 포함 확인 |
| M2 | L자 매치 | 가로3 + 세로3이 꺾임 | type="L", 5개 위치 확인 |
| M3 | 양쪽 동시 매치 | 한 스왑으로 from/to 모두 매치 | matchResults.length === 2 |
| M4 | 5매치+4매치 동시 | 같은 색 5+4 동시 | 레인보우 + 로켓 각각 생성 |
| M5 | 6개 이상 직선 | 같은 색 6개 이상 연속 | 5매치로 분류, 레인보우 1개 |
| M6 | 빈 칸 주변 매치 | 빈 칸 근처 | 빈 칸에서 매치 끊김 확인 |

#### 특수 블록 (S1~S8)

| # | 엣지케이스 | 설명 | 검증 방법 |
|---|-----------|------|---------|
| S1 | 로켓 관통 로켓 | 로켓 줄에 다른 로켓 | 2차 로켓도 발동, 범위 확인 |
| S2 | 폭탄 범위 내 폭탄 | 3x3 안에 다른 폭탄 | 2차 폭탄 발동, 합산 범위 |
| S3 | 레인보우+로켓 | 조합 스왑 | 해당 색 모두 로켓 변환 후 발동 |
| S4 | 레인보우+레인보우 | 조합 스왑 | 보드 전체 제거 |
| S5 | 레인보우+폭탄 | 조합 스왑 | 해당 색 모두 폭탄 변환 후 발동 |
| S6 | 특수 블록 생성 위치 | 4매치 로켓 위치 | 스왑 블록 위치에 생성 확인 |
| S7 | 연쇄 중 특수 블록 생성 | 2단계 연쇄에서 4매치 | 연쇄 도중 특수 블록 정상 생성 |
| S8 | 동시 발동 순서 | 같은 턴에 로켓 2개 | priority 기반, 결정적 결과 |

#### 낙하/리필 (G1~G5)

| # | 엣지케이스 | 설명 | 검증 방법 |
|---|-----------|------|---------|
| G1 | 연속 3칸 빈 칸 | 한 열 3칸 제거 | FallMove.distance === 3 |
| G2 | 고정형 기믹 위 낙하 | 돌 위에 블록 | 돌 위에 쌓이지 않음 |
| G3 | 리필 후 즉시 매치 | 리필 블록이 매치 형성 | 연쇄로 정상 처리 |
| G4 | 2x2 기믹 아래 빈 칸 | 거대상자 아래 빈 칸 | 거대상자 고정, 양옆 리필 |
| G5 | 전체 열 비어있음 | 한 열 전체 제거 | 8개 리필 정상 |

#### 연쇄 (C1~C3)

| # | 엣지케이스 | 설명 | 검증 방법 |
|---|-----------|------|---------|
| C1 | 10단계 이상 연쇄 | 매우 긴 연쇄 | 최대 깊이(50) 미만이면 완료 |
| C2 | 연쇄 중 로켓 생성 발동 | 1→2→3단계 연쇄 | 각 단계 순서 정확성 |
| C3 | 낙하 중 매치 재발생 | 낙하 후 의도치 않은 매치 | cascade while 루프 확인 |

#### 셔플/데드락 (D1~D3)

| # | 엣지케이스 | 설명 | 검증 방법 |
|---|-----------|------|---------|
| D1 | 유효 이동 1개 | 딱 한 쌍만 가능 | hasAnyValidMove() === true |
| D2 | 셔플 후에도 없음 | 극히 드문 경우 | 최대 100회 → 보드 리셋 |
| D3 | 기믹 많은 보드 셔플 | 기믹 6개 + 일반 부족 | 일반 블록만 셔플, 기믹 고정 |

---

### 7.2 기믹 상호작용 엣지케이스 (I1~I12)

| # | 기믹 A | 기믹 B | 상황 | 예상 결과 |
|---|--------|--------|------|---------|
| I1 | 폭탄 | 얼음(HP2) | 폭탄 범위에 얼음 | 얼음 HP 2→1 |
| I2 | 로켓 | 체인(HP1) | 로켓 줄에 체인 | 체인 파괴, 블록 해방 |
| I3 | 꿀(확산) | 얼음 | 꿀→얼음 칸 확산 시도 | 확산 차단 (immovable) |
| I4 | 폭탄 | 돌(무적) | 폭탄 범위에 돌 | 돌 무효 (invincible) |
| I5 | 인접매치 | 거대상자(HP3, 2x2) | 4칸 중 1칸 인접 매치 | HP 3→2, 같은 턴 2면 인접해도 1회 |
| I6 | 잡초(확산) | 곰인형 | 잡초→곰인형 칸 확산 | 잡초 레이어 추가, 곰인형 이동 차단 |
| I7 | 인접매치 | 얼음(HP1) | 얼음 파괴 | 아래 블록 노출, 낙하 가능 |
| I8 | 스왑 시도 | 체인 | 체인 있는 블록 스왑 | 체인 있으면 거부, 체인 파괴 후 가능 |
| I9 | 꿀(확산) | 잡초(확산) | 동일 칸 확산 충돌 | priority 동일(15), 먼저 처리된 쪽 |
| I10 | 폭탄 | 거대상자(HP3, 2x2) | 4칸 중 2칸만 범위 | HP 3→2 (부분 포함도 1회 데미지) |
| I11 | AI 생성 기믹 | 얼음 | 양쪽 인접 매치 동시 | priority 기반 순서, 두 기믹 모두 HP 감소 |
| I12 | 레인보우 | 얼음 | 얼음 아래 빨간블록 선택 | 블록 제거 + 얼음 rainbowDamage 적용 |

---

### 7.3 검증 전략

#### 테스트 패턴

```
1. [Setup] 보드 상태 직접 설정
   board.setBlock(row, col, block)
   framework.placeGimmick(typeId, row, col)

2. [Action] 액션 실행
   swapHandler.trySwap() / cascadeManager.executeCascadeLoop()

3. [Assert] 결과 검증
   board.getBlock(row, col) / board.getTile(row, col).layers

4. [Events] 이벤트 검증
   eventBus 스파이 리스너로 수집
```

#### 테스트 파일 구조

```
tests/
  core/
    match.test.js         // M1~M6
    special.test.js       // S1~S8
    gravity.test.js       // G1~G5
    cascade.test.js       // C1~C3
    shuffle.test.js       // D1~D3
  gimmick/
    interaction.test.js   // I1~I12
  ai/
    parser.test.js        // AI 파싱/폴백 테스트
  helpers/
    boardSetup.js         // 테스트용 유틸리티
```

#### 엣지케이스 총괄

| 카테고리 | 항목 수 | 테스트 파일 |
|---------|--------|-----------|
| 매치 감지 (M) | 6 | match.test.js |
| 특수 블록 (S) | 8 | special.test.js |
| 낙하/리필 (G) | 5 | gravity.test.js |
| 연쇄 (C) | 3 | cascade.test.js |
| 셔플/데드락 (D) | 3 | shuffle.test.js |
| 기믹 상호작용 (I) | 12 | interaction.test.js |
| **합계** | **37** | **6개 파일** |

---

## 부록 A: index.html 초기화 오케스트레이션

```
초기화 순서:
  1.  ES Module로 모든 js 파일 import
  2.  blockTypes 초기화
  3.  Board 인스턴스 생성 (8행 x 8열)
  4.  EventBus 싱글톤 획득
  5.  MatchDetector 생성 (board 주입)
  6.  GravityHandler 생성 (board 주입)
  7.  SpecialBlockManager 생성 (board 주입)
  8.  CascadeManager 생성 (board, matchDetector, gravityHandler,
      specialBlockManager, eventBus 주입)
  9.  GimmickFramework 생성 (board, eventBus 주입)
  10. registerAllBuiltinGimmicks(framework) — 9종 기믹 등록
  11. InteractionManager 생성 (framework 주입)
  12. Renderer 생성 (canvas, board 주입)
  13. AnimationManager 생성 (renderer 주입)
  14. renderer.setAnimationManager(animManager)
  15. 이벤트 구독 연결
  16. SwapHandler 생성 + cascadeManager.executeTurn 콜백 연결
  17. LLMApiManager + GeminiProvider 생성
  18. GimmickParser 생성
  19. ParameterPanel 생성 + 기본 파라미터 등록
  20. GimmickInputPanel 생성
  21. Board.initialize() — 블록 랜덤 배치 (3매치 없이)
  22. Renderer.startGameLoop() — 게임 루프 시작
```

---

## 부록 B: UI 레이아웃 구조

```
+------------------------------------------------------------------+
|  [기믹 설명 입력 텍스트 영역]                [API키 입력]  [생성]    |
|  [이미지 업로드]  [저장]  [생성된 기믹 목록 v]                      |
+------------------------------------------------------------------+
|                              |                                    |
|                              |  [파라미터 패널]                    |
|                              |  +----------------------------+    |
|                              |  | [애니메이션]                 |    |
|     [게임 보드]               |  | 낙하 속도    이전:0.15 [0.15]|    |
|     (Canvas 8x8)             |  | 바운스 강도  이전:0.30 [0.30]|    |
|                              |  | 스왑 속도    이전:0.25 [0.25]|    |
|                              |  | 제거 딜레이  이전:0.05 [0.05]|    |
|                              |  |                              |    |
|                              |  | [기믹: 얼음]                 |    |
|                              |  | HP          이전:2    [2]   |    |
|                              |  |                              |    |
|                              |  | [기믹: 꿀]                   |    |
|                              |  | HP          이전:2    [2]   |    |
|                              |  | 확산 속도    이전:1    [1]   |    |
|                              |  |                              |    |
|                              |  | [되돌리기]  [전체 초기화]     |    |
|                              |  +----------------------------+    |
|                              |                                    |
|                              |  [기믹 배치 도구]                  |
|                              |  [얼음][체인][꿀][잡초][상자]...   |
|                              |  -> 클릭 후 보드에 클릭하여 배치    |
+------------------------------------------------------------------+
```

---

## 부록 C: 파일 생성 순서 체크리스트

### Phase 1
- [ ] 폴더 구조 생성 (js/core, js/gimmick, js/ai, js/render, js/ui, css, assets)
- [ ] `index.html`
- [ ] `css/style.css`
- [ ] `js/core/blockTypes.js`
- [ ] `js/core/board.js`
- [ ] `js/render/renderer.js`

### Phase 2
- [ ] `js/core/match.js`
- [ ] `js/core/swap.js`
- [ ] `js/render/animation.js`
- [ ] `js/render/renderer.js` (게임 루프 추가)

### Phase 3
- [ ] `js/core/gravity.js`
- [ ] `js/core/cascade.js`
- [ ] `js/render/animation.js` (낙하/바운스/리필 애니메이션 추가)
- [ ] `js/core/match.js` (hasAnyValidMove 추가)

### Phase 4
- [ ] `js/core/specialBlock.js`
- [ ] `js/core/match.js` (패턴 분류 확장)
- [ ] `js/core/cascade.js` (특수 블록 타이밍 추가)
- [ ] `js/render/renderer.js` (특수 블록 시각 표현)

### Phase 5
- [ ] `js/core/eventBus.js`
- [ ] `js/core/cascade.js` (이벤트 emit 추가)
- [ ] `js/core/match.js` (이벤트 emit 추가)
- [ ] `js/core/gravity.js` (이벤트 emit 추가)
- [ ] `js/core/swap.js` (이벤트 emit 추가)
- [ ] `js/gimmick/gimmickFramework.js`
- [ ] `js/gimmick/gimmickTypes.js`
- [ ] `js/gimmick/gimmickInteraction.js`

### Phase 6
- [ ] `js/ui/parameterPanel.js`
- [ ] `css/style.css` (패널 스타일 확장)

### Phase 7
- [ ] `js/ai/llmApi.js`
- [ ] `js/ai/gimmickParser.js`
- [ ] `js/ui/gimmickInput.js`

### Phase 8
- [ ] `js/render/animation.js` (점수 팝업, 힌트, 콤보 흔들림 추가)
- [ ] `js/render/renderer.js` (연출 고도화)

### 테스트 (각 Phase 완료 시)
- [ ] `tests/core/match.test.js`
- [ ] `tests/core/special.test.js`
- [ ] `tests/core/gravity.test.js`
- [ ] `tests/core/cascade.test.js`
- [ ] `tests/core/shuffle.test.js`
- [ ] `tests/gimmick/interaction.test.js`
- [ ] `tests/ai/parser.test.js`
- [ ] `tests/helpers/boardSetup.js`
