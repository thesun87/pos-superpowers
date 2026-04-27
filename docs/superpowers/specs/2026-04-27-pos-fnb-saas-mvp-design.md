# POS F&B SaaS — MVP Design

| | |
|---|---|
| **Ngày** | 2026-04-27 |
| **Trạng thái** | Đã chốt qua brainstorm, chờ user review trước khi viết plan |
| **Quy mô** | Solo dev, 2 tháng |
| **Lát cắt MVP** | Approach B — "Cafe Pilot" (SaaS-ready core + offline có giới hạn) |
| **Pilot** | 2 quán cafe / trà sữa cụ thể (manual onboarding) |

---

## 1. Tổng quan

Xây dựng MVP cho hệ thống POS F&B SaaS đa tenant, lấy cảm hứng từ KiotViet, nhắm phân khúc **quán cafe / trà sữa** ở Việt Nam. Pilot chạy thật tại 2 quán trong 2 tháng để xác thực luồng order → thanh toán → in bill → báo cáo, **đồng thời** đặt nền móng kiến trúc SaaS đa tenant để mở rộng sau pilot.

### Quyết định khung

| Quyết định | Giá trị | Lý do tóm tắt |
|---|---|---|
| Mô hình MVP | **B – SaaS-ready core** (multi-tenant từ đầu) | Multi-tenancy là đặc trưng cốt lõi của "SaaS giống KiotViet", không thể bù sau |
| Target persona | Cafe / trà sữa / quán nước | Phân khúc lớn nhất; luồng order đơn giản nhất |
| Form factor | **PWA** + offline cơ bản | Không cài đặt, dễ update; mất mạng vẫn bán được |
| Tech stack | **NestJS** (BE) + **Next.js** (FE), **Postgres**, **Prisma** | Tách FE/BE rõ, dễ scale team sau, type-safe |
| Onboarding | Manual qua super-admin endpoint | Pilot 2 quán không cần self-serve signup |
| Hosting | Render (BE) + Vercel (FE) + Neon Postgres | Cheap, deploy nhanh, đủ cho pilot |
| Timeline | 8 tuần dev + bàn giao pilot | Solo, ~35-40h/tuần |

### Guardrails của lát cắt B

1. Cuối **tuần 5** mà offline sync chưa ổn → hủy offline khỏi MVP, ship như Approach A. Nói trước với 2 quán pilot rằng offline có thể là tính năng v1.1.
2. Mọi thứ ngoài tài liệu này = **out of scope cứng**, không thương lượng. Nếu đổi quy mô, phải tạo spec mới.

---

## 2. Architecture & repo

### System map

```
                 [ 2 quán cafe pilot — mỗi quán 1-2 thiết bị quầy ]
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (tablet Android / PC tại quầy)                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Next.js PWA  (App Router, installable, offline-aware)        │  │
│  │  • /pos      — màn order & checkout (offline-first)           │  │
│  │  • /admin    — menu, báo cáo, quản lý nhân viên (online)      │  │
│  │  • Service Worker + IndexedDB (Dexie) — queue khi offline     │  │
│  └────────┬─────────────────────────────────────┬─────────────────┘  │
└───────────┼─────────────────────────────────────┼────────────────────┘
            │ HTTPS / REST + JWT                  │ WebUSB
            ▼                                     ▼
┌──────────────────────────────┐     ┌──────────────────────────────┐
│  NestJS API (Node 20 LTS)    │     │  Máy in nhiệt ESC/POS        │
│  • Tenant middleware         │     │  Xprinter XP-58 USB          │
│  • Modules: auth, tenants,   │     └──────────────────────────────┘
│    menu, orders, payments,   │
│    reports                   │
│  • JWT + RBAC (owner/cashier)│
└──────────────┬───────────────┘
               │ Prisma
               ▼
┌──────────────────────────────┐
│  PostgreSQL 16               │
│  • Single shared schema       │
│  • `tenant_id` column tách dữ liệu
│  • Row-level isolation qua middleware
└──────────────────────────────┘
```

### Repo structure (pnpm monorepo)

```
pos-superpowers/
├── apps/
│   ├── api/        # NestJS — REST API
│   └── web/        # Next.js — PWA POS + Admin
├── packages/
│   ├── contracts/  # Shared DTOs + Zod schemas (FE & BE)
│   ├── domain/     # Pure TS: Money, OrderCalc, ModifierApplier
│   └── ui/         # shadcn/ui components dùng chung
├── docs/superpowers/specs/
├── pnpm-workspace.yaml
└── package.json
```

**Lý do chọn:**
- 1 Next.js app cho cả POS lẫn Admin — share auth/layout/components, phân chia bằng route segment + RBAC.
- `packages/contracts` — Zod schema export từ BE, FE import dùng cho form + fetch wrapper. Tránh trôi DTO.
- `packages/domain` — pure TS, không phụ thuộc Nest hay React, dễ test logic tính tiền, modifier, làm tròn VND.

### Hosting (giai đoạn pilot)

| Layer | Lựa chọn | Ghi chú |
|---|---|---|
| API | Render hoặc Railway (Docker) | Deploy = `git push`, free SSL |
| FE | Vercel | Native cho Next.js, edge cache |
| DB | Neon Postgres managed | Free tier đủ pilot, có backup tự động |
| Object storage (ảnh menu) | Cloudflare R2 | Zero egress fee |
| Logs / errors | Sentry (free tier) | Wire FE + BE từ tuần 1 |

### Trade-off đã chốt

- **REST**, không tRPC / GraphQL — đơn giản, dễ debug, dễ replay khi offline. Bù DTO bằng Zod ở `contracts`.
- **Postgres**, không MySQL — RLS mạnh hơn (option upgrade tương lai), JSONB tốt hơn cho `modifierSnapshot`.
- **Prisma**, không Drizzle/TypeORM — DX tốt nhất, migrations rõ ràng.

---

## 3. Multi-tenancy & Auth

### Tenancy model: shared DB, shared schema, `tenant_id` column

- Quy mô pilot → đầu mở rộng (2 → 50 quán) shared schema rẻ hơn schema-per-tenant cả về infra, migration, báo cáo cross-tenant.
- Mỗi bảng business có `tenant_id UUID NOT NULL` + index `(tenant_id, …)` ở front của mọi composite index.
- Nâng cấp tương lai (khi thấy cần): chuyển sang schema-per-tenant hoặc dùng Postgres RLS.

### Tenant resolution: JWT claim, không subdomain trong MVP

- 1 domain duy nhất (vd `app.poshub.vn`).
- Tenant ID nằm trong JWT (claim `tid`).
- Subdomain `<slug>.poshub.vn` để v1.1.

### Auth flow

```
Cashier mở /pos → đăng nhập (email + password)
          │
          ▼
NestJS POST /auth/login
  • verify password (argon2)
  • issue access token JWT
        - role=OWNER  → 15 phút
        - role=CASHIER → 2 giờ (chấp nhận trade-off bảo mật ↔ availability offline)
  • issue refresh token (httpOnly secure cookie, 7 ngày)
          │
          ▼
FE lưu access token trong memory + IndexedDB (cho offline)
          │
          ▼
Mỗi request gắn `Authorization: Bearer <access>`
NestJS guard:
  • verify JWT signature
  • parse `tid` → đặt vào AsyncLocalStorage
  • Prisma extension auto-inject `where: { tenant_id }` cho mọi query
          │
          ▼
401 → FE thử refresh; nếu offline → tiếp tục dùng access token đã cache
       (server-side stateless verify, không cần DB call)
```

**Vì sao access token cashier 2h:** PWA + offline. Cashier mở app sáng sớm, mạng yếu, không refresh được mà phải bán cả buổi sáng. Trade-off chấp nhận được vì thiết bị vật lý ở quầy quán.

### RBAC: 2 role

| Action | OWNER | CASHIER |
|---|---|---|
| Đăng nhập, tạo order, thanh toán, in bill | ✓ | ✓ |
| Xem báo cáo doanh thu | ✓ | ✗ |
| CRUD menu, modifier, giá | ✓ | ✗ |
| Quản lý nhân viên | ✓ | ✗ |
| Hủy/cancel order *trước khi PAID* (PENDING → CANCELLED) | ✓ | ✓ |
| Cancel order *sau khi PAID* (PAID → CANCELLED) | ✓ | ✗ |

> **Refund flow:** OWNER có thể chuyển `PAID → CANCELLED`. Hoàn tiền (cash/chuyển khoản) thực hiện **ngoài hệ thống**, không track `refund_amount` riêng trong MVP. Báo cáo doanh thu lọc `status='PAID'` nên CANCELLED tự động loại khỏi tổng.

`@Roles('OWNER')` decorator + guard ở Nest. Không over-engineer permission system.

### Tenant onboarding: manual qua super-admin endpoint

- KHÔNG có self-serve signup UI trong MVP.
- Super-admin (dev) gọi endpoint nội bộ `POST /admin/tenants` (bảo vệ bằng `X-Admin-Key` env secret) → tạo tenant + owner account → gửi credential cho chủ quán qua kênh ngoài.

### Safety net (chống lộ dữ liệu cross-tenant)

Đây là rủi ro **lớn nhất** của shared schema. 3 lớp phòng vệ chồng nhau:

1. **Prisma extension** auto-inject `tenant_id` từ AsyncLocalStorage vào mọi `findMany/findFirst/update/delete`.
2. **Test integration bắt buộc**: với mỗi resource (Menu, Order, Payment), 1 test "tenant A không đọc/sửa được resource của tenant B".
3. **CI lint rule**: cấm gọi `prisma.<model>.<op>` trực tiếp; mọi truy cập phải qua repository base có enforce tenant guard. ESLint custom rule + import boundary.

---

## 4. Domain model

### ER diagram

```
┌─────────────┐  1   ∞ ┌─────────────┐
│   Tenant    │───────►│    User     │  (OWNER | CASHIER)
└──────┬──────┘        └─────────────┘
       │ 1
       │ ∞   ┌──────────────┐  1   ∞ ┌──────────────┐  ∞   ∞ ┌────────────────┐  1   ∞ ┌──────────────────┐
       ├────►│ MenuCategory │───────►│   MenuItem   │◄──────►│ ModifierGroup  │───────►│ ModifierOption   │
       │     └──────────────┘        └──────┬───────┘  via   └────────────────┘        └──────────────────┘
       │                                    │   MenuItemModifierGroup (join)
       │                                    │ ∞ (snapshot)
       │ ∞   ┌─────────┐  1   ∞ ┌──────────┴──┐  1   ∞ ┌──────────┐
       ├────►│  Order  │───────►│  OrderLine   │       │ Payment  │
       │     └─────────┘        └──────────────┘       └──────────┘
       │          ▲                                          ▲
       │          └──────────────────────────────────────────┘
       │                       (Order has 0..n Payments)
```

### Schema (Prisma-style)

```prisma
model Tenant {
  id             String   @id @default(uuid())
  name           String
  slug           String   @unique
  timezone       String   @default("Asia/Ho_Chi_Minh")
  currency       String   @default("VND")  // MVP chỉ support "VND"; field giữ cho forward-compat
  address        String?
  phone          String?
  receiptFooter  String?
  wifiQrPayload  String?
  createdAt      DateTime @default(now())
}

model User {
  id           String   @id @default(uuid())
  tenantId     String
  email        String
  passwordHash String
  fullName     String
  role         Role     // OWNER | CASHIER
  isActive     Boolean  @default(true)
  @@unique([tenantId, email])
  @@index([tenantId])
}

model MenuCategory {
  id        String  @id @default(uuid())
  tenantId  String
  name      String
  sortOrder Int     @default(0)
  isActive  Boolean @default(true)
  @@index([tenantId, isActive, sortOrder])
}

model MenuItem {
  id             String  @id @default(uuid())
  tenantId       String
  categoryId     String
  name           String
  basePrice      Int     // VND, integer (đồng), không float
  imageUrl       String?
  sortOrder      Int     @default(0)
  isActive       Boolean @default(true)
  modifierGroups MenuItemModifierGroup[]
  @@index([tenantId, categoryId, isActive])
}

model ModifierGroup {
  id            String         @id @default(uuid())
  tenantId      String
  name          String         // "Size", "Đường", "Đá"
  selectionType SelectionType  // SINGLE | MULTIPLE
  minSelect     Int            @default(0)
  maxSelect     Int            @default(1)
  isRequired    Boolean        @default(false)
  options       ModifierOption[]
}

model ModifierOption {
  id              String  @id @default(uuid())
  tenantId        String
  modifierGroupId String
  name            String
  priceDelta      Int     @default(0)  // VND, có thể âm
  isDefault       Boolean @default(false)
  sortOrder       Int     @default(0)
}

model MenuItemModifierGroup {
  menuItemId      String
  modifierGroupId String
  tenantId        String
  sortOrder       Int     @default(0)
  @@id([menuItemId, modifierGroupId])
}

model Order {
  id            String        @id @default(uuid())
  tenantId      String
  orderNumber   String?                   // server gán khi sync. Format: "yymmdd-NNNN", NNNN reset mỗi business_date per tenant, padding 4 chữ số. Vd "240427-0123"
  clientId      String                    // UUID v7 từ FE — idempotency key
  status        OrderStatus               // PENDING | PAID | CANCELLED
  subtotal      Int                       // VND tổng line trước discount
  discount      Int           @default(0)
  total         Int                       // VND cuối cùng (subtotal - discount)
  paymentMethod PaymentMethod?            // CASH | QR_STATIC | BANK_TRANSFER
  notes         String?
  createdById   String                    // user.id
  businessDate  DateTime      @db.Date    // ngày kinh doanh, cutoff 04:00 theo tenant TZ
  createdAt     DateTime      @default(now())
  paidAt        DateTime?
  syncedAt      DateTime?                 // null = chưa sync (offline)
  lines         OrderLine[]
  payments      Payment[]
  @@unique([tenantId, clientId])          // idempotency offline replay
  @@index([tenantId, businessDate, status])
  @@index([tenantId, paidAt])
}

model OrderLine {
  id                   String  @id @default(uuid())
  orderId              String
  tenantId             String
  menuItemId           String
  menuItemNameSnapshot String
  basePriceSnapshot    Int
  quantity             Int
  modifierSnapshot     Json    // [{groupName, optionName, priceDelta}]
  lineSubtotal         Int     // (base + sum(delta)) * qty
  notes                String?
  @@index([tenantId, menuItemId])
}

model Payment {
  id        String        @id @default(uuid())
  orderId   String
  tenantId  String
  method    PaymentMethod
  amount    Int
  reference String?       // mã giao dịch QR (manual nhập)
  paidAt    DateTime      @default(now())
  @@index([tenantId, paidAt])
}

enum Role          { OWNER  CASHIER }
enum SelectionType { SINGLE MULTIPLE }
enum OrderStatus   { PENDING PAID CANCELLED }
enum PaymentMethod { CASH QR_STATIC BANK_TRANSFER }
```

### 6 quyết định thiết kế quan trọng

1. **Tiền lưu `Int` (đồng VND)**, không `Decimal`/`Float`. Một Int 32-bit chứa được tới 2.1 tỷ đồng/dòng → đủ.
2. **Snapshot trên `OrderLine`** (`menuItemNameSnapshot`, `basePriceSnapshot`, `modifierSnapshot`) — đổi giá ngày mai, đơn hôm qua giữ giá cũ. Vẫn giữ `menuItemId` để báo cáo.
3. **`modifierSnapshot` là JSONB**, không bảng `OrderLineModifier` — modifier append-only, query luôn theo `order_id`, không cần join. Bớt 1 bảng nóng.
4. **`Order.clientId` (UUID v7) + UNIQUE `(tenant_id, client_id)`** — *idempotency key* của toàn bộ luồng offline. FE gen UUID lúc tạo, replay nhiều lần ra cùng 1 row.
5. **`businessDate`** (`@db.Date`) — ngày kinh doanh (cutoff 04:00 theo timezone tenant). Tách field này để báo cáo doanh thu *theo ngày kinh doanh* không bị lệch do đơn 23h vs 03h sáng.
6. **Soft-delete bằng `isActive`** cho Menu/ModifierGroup; **Order không bao giờ xóa**, chỉ `CANCELLED`. Dữ liệu kế toán bất biến.

### Out of scope cứng (không có trong MVP)

`Customer`, `Branch`, `Inventory`, `Recipe (BOM)`, `PurchaseOrder`, `Supplier`, `Promotion`, `Shift`, `KDS`, `VAT/hóa đơn điện tử`, `Refund` phức tạp.

---

## 5. Offline sync strategy

### Phạm vi offline (cứng)

| Thao tác | Offline OK? |
|---|---|
| Xem menu, modifier (cached) | ✓ |
| Tạo order, thêm/sửa line, modifier, ghi chú | ✓ |
| Thu tiền (cash + nhập tay mã QR) | ✓ |
| In bill (printer là thiết bị local) | ✓ |
| Hủy order *trước khi sync* | ✓ |
| Báo cáo, sửa menu, quản lý NV | ✗ (online-only) |
| Đa thiết bị share queue offline | ✗ (mỗi tablet 1 queue riêng) |

### Component layout phía FE

```
Browser
├── Service Worker (Workbox)
│   ├── Precache static assets (Next.js build)
│   └── Cache GET /menu, /modifiers, /me (NetworkFirst, fallback cache)
│
├── IndexedDB (Dexie)
│   ├── menu_cache         — full menu + modifiers, refresh mỗi 5 phút khi online
│   ├── local_orders       — order tạo offline, status: pending_sync | synced | sync_failed
│   ├── outbox_events      — phụ trợ: cancel
│   └── session            — user info + JWT (cho phép tiếp tục khi mất mạng)
│
└── Sync Worker (in-tab)
    └── Trigger: navigator.online | mỗi 20s khi có pending | manual "Đồng bộ ngay"
```

**Vì sao không dùng Background Sync API:** iOS Safari hỗ trợ kém, debug khó. POS quầy luôn để tab mở cả ngày → foreground sync trong tab đủ tin cậy và đơn giản hơn cho solo dev.

### Luồng tạo order

```
Cashier bấm "Thanh toán"
    │
    ▼
1. FE gen UUID v7 → clientId
2. Tính total bằng pure TS (packages/domain) — không gọi BE
3. INSERT vào IDB.local_orders { ...orderData, status:'pending_sync', clientId }
4. Hiển thị "Tạm #" + 4 ký tự cuối clientId trên màn hình + bill
5. In bill ngay qua **ESC/POS (WebUSB)** — printer local, không cần mạng. Fallback `window.print()` chỉ dùng giai đoạn dev tuần 4 hoặc khi WebUSB lỗi tạm thời.
6. Trigger sync (online → sync ngay; offline → chờ)
    │
    ▼
[Sync Worker — khi online]
For each order pending_sync (FIFO):
    POST /orders
       headers: Idempotency-Key: <clientId>
       body:    { lines, payments, businessDate, ... }
    │
    ├── 201 Created   → IDB.update { status:'synced', orderNumber, syncedAt }
    ├── 200 OK        → server thấy clientId đã tồn tại → cùng cập nhật như 201
    ├── 409 Conflict  → coi như 200 (đã có rồi)
    ├── 4xx khác      → status:'sync_failed' + alert chủ quán
    └── 5xx / timeout → backoff (1s, 5s, 30s, 2m, 10m); 5 lần thất bại → 'sync_failed'
```

### Server-side đảm bảo idempotency

`POST /orders` chấp nhận header `Idempotency-Key: <clientId>`. Pseudocode:

```ts
const existing = await prisma.order.findUnique({
  where: { tenantId_clientId: { tenantId, clientId } },
  include: { lines: true, payments: true },
});
if (existing) return existing;

return prisma.$transaction(async (tx) => {
  const orderNumber = await nextOrderNumber(tx, tenantId, businessDate);
  return tx.order.create({ data: { ..., orderNumber, syncedAt: new Date() } });
});
```

UNIQUE constraint `(tenant_id, client_id)` ở DB là lưới an toàn cuối — kể cả race 2 request cùng lúc, chỉ insert 1 row.

### Conflict resolution

| Tình huống | Xử lý |
|---|---|
| Quán đổi giá menu khi cashier offline | Snapshot giá cũ trong `OrderLine` đã ghi local → giá cũ giữ nguyên khi sync. Báo cáo có thể thấy lệch — chấp nhận. |
| 2 thiết bị cùng quán offline tạo order | Khác `clientId` → không xung đột. `orderNumber` server gán theo thứ tự sync. |
| Cashier hủy đơn offline trước khi sync | `status='CANCELLED'` local + xóa khỏi sync queue. Không lên server. Có log local. |
| Cashier hủy đơn *sau khi sync* | Online action: `POST /orders/:id/cancel`. |
| JWT hết hạn khi offline | Khóa app, banner "Cần kết nối để đăng nhập lại". Đơn pending an toàn. |

### Giới hạn cứng

- **Tối đa 200 đơn pending_sync / thiết bị**. Vượt → cảnh báo cần kết nối.
- **Menu cache TTL 24h**. Sau 24h offline, từ chối tạo order mới — banner cảnh báo.
- **Không edit đơn đã `synced`**. Muốn sửa = `CANCELLED` + tạo đơn mới.

---

## 6. ESC/POS printing

### Quyết định: WebUSB + ESC/POS bytes trực tiếp

| Phương án | Đánh giá | MVP? |
|---|---|---|
| **WebUSB** | Pure browser, không cài thêm, latency thấp. Hỗ trợ Chrome/Edge/Chromium Android. | ✅ Chọn |
| Print Bridge (Node app) | Reliable nhất nhưng phải distribute & update native app | ❌ Để v1.1 |
| Web Bluetooth | Phạm vi printer support hẹp | ❌ |
| `window.print()` | Zero work nhưng chậm, không cut được giấy | ❌ Chỉ làm fallback khẩn |

**Hệ quả:** Pilot yêu cầu Chromium browser (Chrome/Edge desktop hoặc Android Chromium). Hand-pick hardware: **Xprinter XP-58IIH USB + tablet Android Chromium** cho 2 quán pilot.

### Implementation

```
packages/domain/receipt
├── escpos.ts       — wrapper trên `escpos-buffer`
└── template.ts     — render(order, tenant) → Uint8Array

apps/web/src/lib/printer
├── webusb-client.ts  — connect, persist permission, transferOut(bytes)
└── usePrinter.tsx    — hook: { isReady, print(bytes), error }
```

### Permission flow

1. Lần đầu mở `/pos`, cashier bấm "Kết nối máy in" → browser dialog chooser (yêu cầu user gesture).
2. Browser nhớ permission cho origin — auto-reconnect lần sau.
3. Mất kết nối → hook trả `error: 'disconnected'` → banner "Đã mất máy in". Đơn vẫn lưu local; có thể "In lại" sau khi kết nối.

### Receipt template (cafe VN, 58mm = 32 ký tự/dòng)

```
        TRÀ SỮA NHÀ MÌNH
       12 Lý Thường Kiệt, Q1
           0901 234 567
────────────────────────────────
HD: 240427-0123    27/04 14:23
Thu ngân: Trang
────────────────────────────────
Trà đào cam sả x1            45.000
  Size L                   +5.000
  Ít đá, 70% đường
Bánh flan x2                30.000
────────────────────────────────
Tổng tiền hàng:             80.000
Giảm giá:                        0
TỔNG CỘNG:                  80.000
Thanh toán:    Tiền mặt
────────────────────────────────
   Cảm ơn quý khách, hẹn gặp lại!
              [QR Wifi]
```

### Out of scope

- Cash drawer kick → v1.1.
- Multi-printer (thu ngân + bếp/bar) — không có KDS trong MVP.
- LAN/Bluetooth printer — chỉ USB cho pilot.
- iOS Safari support — tablet Android cho pilot.

---

## 7. Frontend architecture & state

### Next.js App Router — 3 route groups

```
apps/web/src/app/
├── (auth)/
│   └── login/page.tsx                    — public, server component (form là client)
│
├── (pos)/                                — PWA, CSR-only, offline-aware
│   ├── layout.tsx                        — RequireRole(OWNER|CASHIER) + Printer + Sync providers
│   ├── pos/page.tsx                      — màn order chính (3 pane)
│   ├── pos/orders/page.tsx               — đơn hôm nay (in lại, xem chi tiết)
│   └── pos/settings/page.tsx             — kết nối printer, test in
│
└── (admin)/                              — owner-only, server-rendered + form client
    ├── layout.tsx                        — RequireRole(OWNER)
    ├── admin/page.tsx                    — dashboard tóm tắt hôm nay
    ├── admin/menu/{categories,items,modifiers}/...
    ├── admin/staff/page.tsx
    ├── admin/reports/page.tsx
    └── admin/settings/page.tsx           — tenant info, receipt template, in test
```

### Code layout trong `apps/web/src/`

```
src/
├── app/                  ← routes
├── features/             ← module theo domain (song song với BE module)
│   ├── auth/  menu/  pos/  orders/  reports/
├── components/           ← UI primitives shadcn + composed
├── lib/
│   ├── api/              ← apiClient (fetch wrapper + JWT + offline-aware)
│   ├── db/               ← Dexie schemas + repos
│   ├── printer/          ← WebUSB hook + ESC/POS gen
│   ├── sync/             ← Sync worker
│   └── money/            ← VND format/parse
└── providers/            ← QueryClient, Auth, Toast, PWAUpdater
```

### State management — 4 lớp tách bạch

| Lớp | Tooling | Lưu ở đâu | Vd dùng |
|---|---|---|---|
| Server state | TanStack Query | RAM + Service Worker cache | `useMenu()`, `useTodayOrders()` |
| Offline-first state | Dexie + custom hooks | IndexedDB | `local_orders`, `menu_cache`, `outbox` |
| Ephemeral UI state | Zustand (1 store) | RAM | giỏ đang gõ, modifier sheet open, printer status |
| Form state | React Hook Form + Zod | component-local | menu CRUD, login, settings |

**Quy tắc cứng:** không duplicate server state vào Zustand. Cart hiện tại = ephemeral (Zustand); đơn đã chốt = offline-first (Dexie).

### Offline-aware mutation pattern

```ts
async function createOrder(input: NewOrder) {
  const order = buildOrderLocal(input);          // total, clientId UUID v7
  await db.local_orders.add({ ...order, status: 'pending_sync' });
  syncWorker.kick();                              // không await
  return order;                                   // optimistic
}
```

UI **không phân biệt** online/offline — luôn nhận order ngay, badge "Tạm" khi `status='pending_sync'`. `useTodayOrders` merge data từ server + Dexie.

### POS screen layout (tablet ngang)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [☕ Tên quán]  [🟢 Online]  [🖨 Printer OK]  [🔄 0 đơn chờ]  [👤 Trang ▾] │
├──────────────┬───────────────────────────────────┬──────────────────┤
│  CATEGORIES  │          MENU GRID                │  ORDER HIỆN TẠI  │
│  ─ All       │  [card] [card] [card] [card]      │  Trà đào x1   45 │
│  ─ Trà sữa   │  [card] [card] [card] [card]      │   Size L     +5  │
│  ─ Cafe      │  [card] [card] [card] [card]      │   Ít đá          │
│  ─ Bánh      │  [card] [card] [card] [card]      │  Bánh flan x2 30 │
│  ─ Topping   │                                   │  ────────────    │
│              │                                   │  Tổng:        80 │
│              │                                   │  ────────────    │
│              │                                   │  THANH TOÁN: 80  │
│              │                                   │  [💵 Tiền mặt]    │
│              │                                   │  [📱 QR]          │
└──────────────┴───────────────────────────────────┴──────────────────┘
```

Modifier flow: tap card có modifier → bottom sheet/modal chọn size/đường/đá → "Thêm vào đơn" → line xuất hiện ở panel phải.

### PWA setup

- `@ducanh2912/next-pwa` (Workbox config minimal).
- `manifest.json`: name, icons (192/512), `display: standalone`, `start_url: /pos`.
- Workbox runtime cache: `GET /api/menu*` NetworkFirst fallback 24h; `GET /api/me` 7 ngày; static precache.
- Update strategy: toast "Có bản cập nhật" + nút "Tải lại" — không tự reload (đang bán).

### UI choices

- Tailwind v3 + shadcn/ui (Radix). Components copy vào `packages/ui`.
- Lucide icons, Sonner toast, Vaul bottom sheet.
- Font: Inter + Be Vietnam Pro (heading).
- Format VND: `Intl.NumberFormat('vi-VN')` — `80.000`.

### Out of scope

- i18n (chỉ tiếng Việt).
- Dark mode (light only — POS sáng dễ nhìn).
- Animation cầu kỳ.
- Mobile portrait POS (tablet ngang cho pilot; portrait là v1.1).

---

## 8. Reports & analytics

### 4 màn

```
/admin                          → Dashboard hôm nay (auto-refresh 30s)
/admin/reports/daily            → Báo cáo theo ngày
/admin/reports/range            → Báo cáo theo khoảng (≤ 31 ngày)
/admin/reports/cashier          → Đơn theo thu ngân + ngày
```

### Widget tối thiểu

**Dashboard hôm nay**

| Widget | Truy vấn |
|---|---|
| Doanh thu hôm nay (PAID) | `SUM(total) WHERE status='PAID' AND businessDate=today` |
| Số đơn (PAID + CANCELLED riêng) | `COUNT(*) GROUP BY status` |
| Giá trị đơn TB | `AVG(total)` |
| Top 5 món | `SUM(quantity), SUM(lineSubtotal) GROUP BY menuItemId LIMIT 5` |
| Phân bổ thanh toán | `SUM(amount) GROUP BY method` |
| Phân bố giờ | `GROUP BY date_trunc('hour', paidAt)` |

**Daily / Range / Cashier:** cùng widgets với filter, plus export CSV.

### Implementation

- Query trực tiếp transactional tables — không OLAP, không materialized view.
- 2 quán × ~200-500 đơn/ngày → query với index `(tenant_id, business_date, status)` chạy < 50ms.
- BE: module `reports`, Prisma `groupBy` hoặc raw SQL. Stateless, dễ test.
- FE: Recharts cho biểu đồ cột/đường đơn giản. Bảng + summary card là chính.
- Cache: TanStack Query `staleTime: 30s` cho dashboard, `5 phút` cho range.
- Timezone: mọi truy vấn dùng `tenant.timezone` để compute `businessDate`. Không UTC trực tiếp.

### Export CSV

- Server-side stream. `text/csv; charset=utf-8` + BOM (Excel VN không lỗi font).
- Cột v1: `order_number, business_date, paid_at, cashier, payment_method, subtotal, discount, total, line_count`.
- v1.1: thêm export chi tiết line.

### Permissions

- Chỉ OWNER xem báo cáo. Cashier không thấy menu Reports.

### Out of scope

Profit/margin, COGS, customer/retention, promotion ROI, cohort/funnel, real-time websocket dashboard.

---

## 9. Testing strategy

### Pyramid

| Lớp | Tool | Phạm vi | Khi nào chạy |
|---|---|---|---|
| Unit | Vitest (FE) + Jest (BE) | `packages/domain` (Money, OrderCalc, ModifierApplier), pure utilities | Pre-commit + CI |
| Integration BE | Jest + Testcontainers (Postgres thật) | Nest module: auth, tenant guard, order POST + idempotency, reports | CI |
| Integration FE | Vitest + Testing Library | Hooks (`useCart`, `useOfflineMutation`), Dexie schema migrations | CI |
| E2E | Playwright (Chromium) | Login → tạo order online → tạo order offline → in bill (mock printer) | Pre-pilot + nightly |

### Acceptance test bắt buộc

```
✓ tenant_isolation.spec       — tenant A không read/write tenant B (mỗi resource)
✓ idempotency.spec            — POST /orders 100 lần cùng clientId → 1 row
✓ offline_create_then_sync.spec — tạo 5 đơn offline → sync → server có đủ 5
✓ jwt_expired_offline.spec    — token expire khi offline → app khóa, đơn pending an toàn
✓ printer_disconnected.spec   — printer off → app không crash, đơn lưu, có "In lại"
✓ business_date_cutoff.spec   — đơn 23:30 và 03:30 thuộc đúng business_date
```

Coverage target: **70% line / 80% trên `packages/domain`**.

CI: GitHub Actions, matrix Node 20, Postgres 16 service, cache pnpm. Mỗi PR pass trước merge `main`.

---

## 10. Timeline 8 tuần

| Tuần | Mục tiêu | Done = |
|---|---|---|
| 1 | Foundation | Monorepo (pnpm), NestJS + Next.js scaffold, Prisma schema initial, deploy pipeline (Render + Vercel + Neon), Sentry wired |
| 2 | Auth & multi-tenant skeleton | Login + refresh, JWT guard, tenant middleware, Prisma extension auto-inject `tenant_id`, super-admin endpoint tạo tenant; `tenant_isolation.spec` pass |
| 3 | Menu module (BE + Admin UI) | CRUD categories/items/modifier groups, image upload (R2), tenant-scoped; admin UI table + form bằng RHF + Zod |
| 4 | POS order online + cart UX | POS layout 3-pane, modifier sheet, totals tính client-side via `packages/domain`, optimistic create, in bill bằng `window.print()` (tạm) |
| 5 | Offline sync (tuần khó nhất) | Dexie schemas, sync worker, idempotency BE+FE, 6 acceptance tests offline pass, error toast UX |
| 6 | ESC/POS printer + hardware test thật | WebUSB hook, receipt template, test trên Xprinter XP-58 thật; reprint từ "đơn hôm nay"; settings page test in |
| 7 | Reports + admin polish + bug fix | 4 màn báo cáo, CSV export, dashboard auto-refresh, audit toàn bộ tenant guards, fix bug tích lũy |
| 8 | Pilot deploy & on-site | Lên 2 quán: setup tablet + printer, train 30 phút cho cashier, cài Sentry alerts, đứng sau quầy 1 ca quan sát; viết runbook |

**Buffer:** không có. Trượt tuần 5 → kích Guardrail (hủy offline). Trượt tuần 6 → fallback `window.print()`, WebUSB sang v1.1.

---

## 11. Risk register

| # | Rủi ro | P | I | Mitigation |
|---|---|---|---|---|
| 1 | Offline sync sót edge case → mất/dup đơn | H | H | 6 acceptance tests cứng; idempotency-key DB-enforced; tuần 5 dành riêng |
| 2 | WebUSB không tương thích printer cụ thể | M | H | Hand-pick Xprinter XP-58 USB; test hardware tuần 6; fallback `window.print()` |
| 3 | Solo dev burnout / scope creep | H | H | Out-of-scope list cứng; review scope cuối tuần 4 và 6; v1.1 backlog có sẵn |
| 4 | Pilot owner đòi tính năng ngoài scope | M | H | Scope letter ký từ đầu; demo từng phần để cùng đồng thuận |
| 5 | Lỗi cross-tenant rò dữ liệu | L | C | 3 lớp phòng vệ Section 3 (Prisma extension + test + lint); audit tuần 7 |
| 6 | Tablet hỏng / mạng kém tại quán | M | H | Mang dự phòng tablet; test 4G dự phòng; offline đủ tốt từ tuần 5 |
| 7 | Thanh toán QR/cash sai sót → khiếu nại | L | H | Test rounding kỹ ở `packages/domain/money`; in bill rõ; field `notes` |
| 8 | DB migration phá production | L | H | Prisma migrate review; backup trước mỗi deploy; rollback bằng Neon snapshot |

P/I = Probability/Impact. C = Critical.

---

## 12. Definition of Done cho MVP

Trước khi gọi "ship" và bàn giao 2 quán pilot:

- [ ] Tất cả 6 acceptance tests offline pass
- [ ] Hardware test thật (Xprinter XP-58 + Android tablet) qua 50 đơn liên tiếp
- [ ] Pilot 1 ngày tại quán đầu tiên: ≥ 100 đơn, ≤ 1 bug critical
- [ ] Sentry không có error chưa biết trong 24h cuối
- [ ] Owner training tài liệu (1 trang PDF, có ảnh)
- [ ] Runbook xử lý sự cố: mất mạng, printer kẹt, JWT expire, restore backup

---

## 13. Out of scope (consolidated)

Tất cả những gì sau đây **không** có trong MVP, không thương lượng. Nếu phát sinh nhu cầu, ghi vào v1.1 backlog:

- **Tính năng F&B nâng cao:** Customer/CRM/loyalty, Branch/multi-store, Inventory/Recipe/BOM, Supplier/PO, Promotion/coupon, Shift/chấm công, KDS (kitchen display), VAT/hóa đơn điện tử, Refund đa hình thức.
- **SaaS platform:** Self-serve signup, real subscription billing, gói cước, payment gateway tenant-side, marketing landing, email transactional.
- **Integrations:** GrabFood/ShopeeFood/BeFood, MISA/accounting, hóa đơn điện tử (Viettel/VNPT), cổng thanh toán (VNPay/MoMo/ZaloPay), QR động (auto reconcile).
- **UX:** Dark mode, i18n (chỉ tiếng Việt), mobile portrait POS, animation cầu kỳ.
- **Tech:** Background Sync API, Web Bluetooth printer, LAN printer, Print Bridge native app, Postgres RLS (Prisma extension thay thế), schema-per-tenant, materialized views, OLAP/data warehouse, real-time websocket dashboard.
- **Hardware:** Cash drawer, multi-printer (thu ngân + bếp), barcode scanner, NFC/RFID.
- **Auth nâng cao:** SSO, OAuth provider, 2FA, magic link, biometric.

---

## 14. Open items / cần user xác nhận

Không có gì cần user xác nhận thêm — tất cả quyết định trong tài liệu này đã được chốt qua 8 lượt brainstorm. Tài liệu này được dùng làm input duy nhất cho bước tiếp theo (`writing-plans`).

Nếu có điểm cần thay đổi sau khi review, sửa trực tiếp file này và tag commit "spec: revise after review" trước khi sang plan.
