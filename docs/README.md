# PCB Inventory 구현 문서

이 문서는 현재 구현된 PCB/전자부품 재고관리 앱의 기능, 화면 구성, API, 데이터베이스 구조를 정리합니다.

## 개요

PCB Inventory는 React 클라이언트, Express API 서버, PostgreSQL 데이터베이스로 구성된 단일 저장소 앱입니다.

- 앱 이름: `PCB Inventory`
- 브랜드 표시: `죽동:이영일`
- 클라이언트: React + Vite + TypeScript
- 서버: Express + TypeScript
- 데이터베이스: PostgreSQL
- 주요 도메인: 부품 재고, 위치/랙, BOM, 입출고 이력, CSV import/export

## 실행 구조

```text
client/               React/Vite 프론트엔드
  src/main.tsx        화면 상태, API 호출, UI 렌더링
  src/styles.css      전체 스타일
  src/assets/         SVG 로고

server/               Express API 서버
  src/index.ts        API 라우트, 검증, CSV 처리
  src/db.ts           PostgreSQL Pool 및 query helper

db/
  schema.sql          테이블, 인덱스, updated_at 트리거
  seed.sql            샘플 위치, 부품, BOM 데이터
```

## 실행 명령

```bash
npm install
npm run db:init
npm run db:seed
npm run dev
```

- Client: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4000/api`
- Vite 개발 서버는 `/api` 요청을 `http://127.0.0.1:4000`으로 proxy합니다.

## 환경 변수

`.env` 또는 `.env.example` 기준:

```text
DATABASE_URL=postgres://postgres:postgres@localhost:5432/pcb_inventory
PORT=4000
```

## 화면 구성

프론트엔드는 3개 메인 탭으로 구성되어 있습니다.

### 재고/부품 탭

재고 조회, 필터링, 부품 등록/수정, 입출고 처리를 담당합니다.

구현된 기능:

- SKU, 품명, 제조사, 위치 기반 검색
- 분류 필터
- 위치 필터
- 부족 재고만 보기
- CSV export
- CSV import
- 재고 목록 표시
- 부족 재고 행 강조
- SKU 헤더 도움말
- 부품 등록/수정 폼
- 등록/수정 폼 라벨 표시
- 부품 삭제
- 입고, 출고, 실사조정
- 부품 등록/입출고 사이드 패널 sticky 고정

SKU는 `Stock Keeping Unit`의 약자로, 재고 품목을 구분하는 고유 관리 코드입니다.

### 위치/랙 탭

부품 보관 위치를 관리하고, 위치별 부품을 확인합니다.

구현된 기능:

- 위치 목록을 왼쪽 세로 리스트로 표시
- 위치 목록 sticky 고정
- 위치가 많을 때 위치 목록 내부 스크롤
- 위치 선택 시 위치 정보 폼에 값 반영
- 위치 선택 시 해당 위치의 부품 목록 표시
- `재고/부품에서 보기` 버튼으로 선택 위치를 재고 검색에 적용
- 위치 저장 또는 업데이트
- 마지막 위치 삭제
- 위치/랙 폼 라벨 표시
- 모바일에서는 위치 목록과 상세 영역을 세로 배치

위치 데이터는 `code`, `rack`, `shelf`, `bin`, `note`로 구성됩니다.

### BOM 관리 탭

BOM을 만들고, BOM에 필요한 부품과 수량을 구성합니다.

구현된 기능:

- BOM 생성 또는 설명 업데이트
- BOM 선택
- BOM 관리 폼 라벨 표시
- BOM에 부품 추가
- 부품 검색 키워드로 선택 목록 필터링
- 부품 추가 후 검색어 유지
- 수량 및 참조번호 입력
- BOM 항목 목록 표시
- 필요 수량 대비 재고 부족 항목 강조
- BOM 항목 삭제

BOM 항목은 같은 BOM 안에서 동일 부품을 중복 추가하지 않고, 기존 항목을 업데이트합니다.

## 주요 프론트엔드 상태

[client/src/main.tsx](../client/src/main.tsx)

- `parts`: 현재 재고 목록
- `locations`: 위치/랙 목록
- `boms`: BOM 목록
- `bomItems`: 선택 BOM의 항목 목록
- `search`: 재고 검색어
- `categoryFilter`: 재고 분류 필터
- `locationFilter`: 재고 위치 필터
- `lowStockOnly`: 부족 재고 필터
- `form`: 부품 등록/수정 폼
- `locationForm`: 위치/랙 폼
- `bomForm`: BOM 폼
- `activeMainTab`: 현재 선택 탭
- `selectedLocationCode`: 위치/랙 탭에서 선택된 위치
- `locationParts`: 선택 위치에 속한 부품 목록
- `bomPartSearch`: BOM 부품 선택 필터 키워드

## API

서버 파일: [server/src/index.ts](../server/src/index.ts)

### 상태 확인

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/health` | API 상태 확인 |

### 부품

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/parts` | 부품 목록 조회 |
| GET | `/api/parts?search=...` | SKU, 품명, 분류, 제조사, MPN, 위치 검색 |
| GET | `/api/parts?lowStock=true` | 부족 재고 조회 |
| POST | `/api/parts` | 부품 생성 |
| PUT | `/api/parts/:id` | 부품 수정 |
| DELETE | `/api/parts/:id` | 부품 삭제 |
| GET | `/api/parts/export.csv` | 부품 CSV export |
| POST | `/api/parts/import-csv` | 부품 CSV import/upsert |

부품 생성/수정 필드:

```ts
{
  sku: string;
  name: string;
  category: string;
  manufacturer?: string | null;
  mpn?: string | null;
  footprint?: string | null;
  value?: string | null;
  location?: string | null;
  quantity: number;
  minQuantity: number;
  unit: string;
  notes?: string | null;
}
```

### 재고 이동

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/api/parts/:id/movements` | 입고, 출고, 실사조정 |
| GET | `/api/movements` | 최근 재고 이동 100건 조회 |

재고 이동 요청:

```ts
{
  movementType: 'IN' | 'OUT' | 'ADJUST';
  quantity: number;
  memo?: string | null;
}
```

동작:

- `IN`: 현재 수량에 더함
- `OUT`: 현재 수량에서 뺌
- `ADJUST`: 입력 수량으로 맞춤
- 결과 수량이 음수가 되면 `400` 오류
- 부품 행을 `FOR UPDATE`로 잠그고 트랜잭션 안에서 처리

### 위치/랙

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/locations` | 위치 목록 조회 |
| POST | `/api/locations` | 위치 생성 또는 code 기준 업데이트 |
| DELETE | `/api/locations/:id` | 위치 삭제 |

위치 저장 요청:

```ts
{
  code: string;
  rack: string;
  shelf?: string | null;
  bin?: string | null;
  note?: string | null;
}
```

### BOM

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/boms` | BOM 목록 조회 |
| POST | `/api/boms` | BOM 생성 또는 이름/Revision 기준 설명 업데이트 |
| GET | `/api/boms/:id/items` | BOM 항목 조회 |
| POST | `/api/boms/:id/items` | BOM 항목 추가 또는 업데이트 |
| DELETE | `/api/boms/:bomId/items/:itemId` | BOM 항목 삭제 |

BOM 저장 요청:

```ts
{
  name: string;
  revision: string;
  description?: string | null;
}
```

BOM 항목 저장 요청:

```ts
{
  partId: string;
  quantity: number;
  referenceDesignators?: string | null;
  note?: string | null;
}
```

## 데이터베이스

스키마 파일: [db/schema.sql](../db/schema.sql)

### locations

보관 위치를 저장합니다.

- `id`: UUID PK
- `code`: 위치 코드, unique
- `rack`: 랙
- `shelf`: 선반
- `bin`: 칸
- `note`: 메모
- `created_at`, `updated_at`

### parts

부품 재고 마스터입니다.

- `id`: UUID PK
- `sku`: 재고 관리 코드, unique
- `name`: 품명
- `category`: 분류
- `manufacturer`: 제조사
- `mpn`: 제조사 부품 번호
- `footprint`: 패키지/풋프린트
- `value`: 부품 값
- `location`: 위치 코드 문자열
- `quantity`: 현재 재고 수량
- `min_quantity`: 최소 재고
- `unit`: 단위
- `notes`: 메모
- `created_at`, `updated_at`

### stock_movements

입고, 출고, 실사조정 기록입니다.

- `part_id`: parts FK, 부품 삭제 시 함께 삭제
- `movement_type`: `IN`, `OUT`, `ADJUST`
- `quantity`: 이동 수량
- `memo`: 메모
- `created_at`

### boms

BOM 헤더입니다.

- `name`, `revision` 조합 unique
- `description`
- `created_at`, `updated_at`

### bom_items

BOM에 포함된 부품 항목입니다.

- `bom_id`: boms FK, BOM 삭제 시 함께 삭제
- `part_id`: parts FK, 부품 삭제 제한
- `quantity`: 필요 수량
- `reference_designators`: R1, C1 등 참조번호
- `note`: 메모
- `bom_id`, `part_id` 조합 unique

## 검증과 오류 처리

- 서버 입력 검증은 `zod`를 사용합니다.
- 검증 실패는 `400 Validation failed`로 응답합니다.
- 중복 키 오류는 `409 Duplicate value`로 응답합니다.
- 기타 서버 오류는 `500`으로 응답합니다.
- 클라이언트 API helper는 실패 응답의 `error` 필드를 메시지로 표시합니다.

## CSV 형식

CSV export/import 헤더:

```text
sku,name,category,manufacturer,mpn,footprint,value,location,quantity,minQuantity,unit,notes
```

CSV import는 `sku` 기준으로 upsert합니다.

## 현재 한계와 개선 후보

- `parts.location`은 `locations.code`를 참조하지만 DB FK로 강제되지는 않습니다.
- 위치 삭제 UI는 현재 마지막 위치 삭제만 제공합니다.
- 재고 필터의 분류/위치는 프론트엔드에서 현재 로드된 목록 기준으로 적용됩니다.
- BOM의 생산 가능 수량 계산은 아직 없습니다.
- 사용자 인증과 권한 관리는 없습니다.
