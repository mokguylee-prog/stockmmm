# PCB Inventory

React + Express + PostgreSQL 기반 PCB/전자부품 재고관리 앱입니다.

## 기능

- 부품 등록/수정/삭제
- 재고 수량, 최소재고, 위치, 제조사/MPN 관리
- 카테고리/키워드 검색
- 입고/출고/조정 이력 기록
- 부족 재고 표시

## 실행

```bash
cp .env.example .env
# PostgreSQL에서 DB 생성 후:
createdb pcb_inventory
npm install
npm run db:init
npm run db:seed
npm run dev
```

- Client: http://127.0.0.1:5173
- API: http://127.0.0.1:4000/api

`psql`/PostgreSQL이 없다면 먼저 PostgreSQL을 설치해야 합니다.
