# 리서치 결과 요약

## 1. 매치3 오픈소스 구현체 분석

### 주요 레퍼런스
- **Rembound/Match-3-Game-HTML5**: 가장 교육적, 알고리즘 상세 설명, HTML5 Canvas + Vanilla JS
- **Emanuele Feronato Match3 클래스**: 프레임워크 무관 순수 로직, 재사용 가능
- **Ghamza-Jd/Match-3**: "Always Have Move" 데드락 방지 알고리즘
- **MoonGateLabs/match-3-puzzle-javascript**: 알고리즘 벤치마크 + 단위 테스트
- **LibraStack/Match3-SDK**: 확장 가능한 구조, 낙하 전략 다양

### 핵심 구조
- **보드**: 2D 배열 board[row][col] = { type, state, mechanics[] }
- **매치 감지**: 행/열 스캔, 교차점=T/L 감지, 한번에 수집 후 일괄 제거
- **특수 블록**: 4직선→로켓, 5직선→레인보우, L/T→폭탄
- **조합**: 로켓+로켓=십자, 로켓+폭탄=3행3열, 폭탄+폭탄=확대, 레인보우+특수=강화
- **낙하**: 열 단위 shift 계산, 위에서 리필
- **연쇄**: while(hasMatches) { 감지→제거→낙하→리필 }
- **셔플**: 모든 인접 쌍 시뮬레이션으로 유효 이동 감지, 없으면 셔플
- **애니메이션**: Model-View 분리, 이징 함수 (ease-out 낙하, ease-in-out 스왑)

### 애니메이션 타이밍 기준
| 애니메이션 | 지속 시간 | 이징 |
|----------|---------|------|
| 스왑 | 0.2-0.3초 | ease-in-out |
| 낙하 | 0.1-0.2초/칸 | ease-out |
| 제거 | 0.2-0.3초 | ease-in-out (축소) |

---

## 2. Gemini 무료 API 연동

### 무료 모델 현황
| 모델 | RPM | 일당 요청 |
|------|-----|---------|
| 2.5 Flash (권장) | 10 | 250 |
| 2.5 Flash-Lite | 15 | 1,000 |
| 2.5 Pro | 5 | 100 |

### API 호출
- 엔드포인트: POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
- 인증: 헤더 x-goog-api-key
- CORS: 이슈 있음 → 프로토타입이므로 사용자가 API 키 직접 입력으로 처리 가능

### API 교체 설계
- 추상화 레이어 (Factory 패턴)
- GeminiProvider / ClaudeProvider 인터페이스 통일
- 환경변수로 프로바이더 선택

### 프롬프트 설계
- JSON 스키마를 프롬프트에 명시
- temperature: 0 (결정론적)
- Few-shot 예시 3-5개 제공
- 파싱 실패 시 재시도 → 3회 후 기본값 폴백

---

## 3. 기믹 시스템 패턴

### 기믹 유형별 상세
| 유형 | 예시 | 핵심 메커니즘 |
|------|------|-------------|
| 레이어형 | 얼음(인접매치로 파괴), 체인(파워업만 파괴) | HP 기반 단계별 파괴 |
| 확산형 | 꿀(인접매치2회+확산), 잡초(5회시 16타일확산) | 턴 기반 전파 |
| 수집형 | 아이템 낙하 | 보드 아래로 이동 |
| 발동형 | 폭탄(3x3), 로켓(행/열) | 매치 시 범위 효과 |
| 방해형 | 상자/돌 (인접매치1회 제거, 이동불가) | 제거 조건 |

### 기믹 간 상호작용 우선순위
1. 폭탄/로켓 발동
2. 얼음/체인 파괴
3. 확산형 전파 (다음 턴)
4. 일반 매치 제거
5. 중력/새 블록 생성

### 코드 설계 패턴 (권장)
- **이벤트 기반**: MatchDetected → 등록된 기믹의 OnMatch() 독립 실행
- **레지스트리 패턴**: MechanicRegistry.Register(mechanic)
- **상호작용 매트릭스**: InteractionMatrix로 기믹 쌍별 규칙 관리
- **타일 레이어**: 한 타일에 최대 3기믹 (레이어+확산+장애)
- **메타데이터 기반**: 각 기믹이 type, layers, interactions, priority 보유

### 처리 순서 (Cascade Loop)
1. FindMatches() → matched 상태
2. mechanic.OnMatch() 우선순위별 호출
3. matched 타일 제거, 레이어 차감
4. 중력 (빈 공간 낙하)
5. 새 타일 스폰
6. FindMatches() 재호출 (연쇄)
7. 매치 없을 때까지 반복

---

## 4. 특수 블록 연쇄 발동 순서 리서치

### 연쇄 발동 방식: DFS(깊이 우선)
- 폭탄 발동 → 범위 내 로켓 발견 → 로켓 즉시 발동(DFS) → 로켓 범위 내 다른 특수 블록 → 즉시 발동
- 오픈소스 구현체(Match3Algorithm, Cocos Creator) 대부분 DFS 기반
- BFS 미사용 이유: 조합 효과 계산이 복잡, 시각적으로 부자연스러움

### 근거
- Candy Crush: Wrapped(폭탄) 먼저 → Striped(로켓) 다음 (공식 Wiki 확인)
- Royal Match: 파워업이 범위 내 다른 파워업 활성화 (연쇄 트리거)
- 오픈소스: youssefmyh/Match3Algorithm(DFS+인접리스트), ninetailsrabbit/match3-board(우선순위 기반)

### 무한루프 방지
- Visited Set: 이미 발동된 특수 블록 재발동 차단
- 최대 재귀 깊이: MAX_SPECIAL_CHAIN_DEPTH = 20
- Cascade 루프 제한: MAX_CASCADE_ITERATIONS = 50

### 조합 발동 순서 (Candy Crush 기준)
| 조합 | 발동 순서 |
|------|---------|
| Striped+Wrapped | Wrapped 먼저(3x3) → Striped 다음(1줄) |
| Color Bomb+특수 | Color Bomb이 색상 결정 → 해당 색 전부 특수블록 변환 → 각각 발동 |
| Color Bomb+Color Bomb | 보드 전체 제거 (최고 우선순위) |

### 출처
- youssefmyh/Match3Algorthim (GitHub) — C++ DFS 기반
- AlexKutepov/Match3-algorithm-TS-Cocos-creator (GitHub) — BonusExecutor 시스템
- ninetailsrabbit/match3-board (GitHub) — 우선순위 기반 처리
- Candy Crush Saga Wiki, Candy Crush Soda Wiki — 공식 게임 규칙
- Royal Match Help Center — 파워업 조합 규칙

---

## 5. 추가 확정 사항 (기획자 결정)

### 특수 블록 생성 위치
- 유저 스왑: 스왑으로 이동한 블록의 최종 위치
- 자동 매칭(연쇄): 매치 영역 중앙 블록 위치

### 로켓 방향 결정
- 가로 스왑 → 가로 로켓
- 세로 스왑 → 세로 로켓
- 연쇄 중(스왑 없음): 매치 방향과 동일
