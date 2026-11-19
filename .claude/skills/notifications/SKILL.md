---
name: notifications
description: Cách làm việc với tính năng thông báo của BaseWebSystem — gửi thông báo hệ thống cho user khi có sự kiện (NotificationsService.notifyUser + key i18n backend), thông báo toàn hệ thống, API admin POST /notifications (quyền notifications.send), API /me/notifications, chuông + trang thông báo dùng chung ở @base/ui, và xây giao diện admin gửi thông báo (hiện chưa có). Dùng khi người dùng nhắc "thông báo", "notification", "chuông", "gửi thông báo cho user", "thông báo toàn hệ thống", "báo cho người dùng khi…". Dùng kèm base-skill.
---

# Thông báo

## Mô hình

- Bảng `notifications` (`src/packages/db/src/schema/notifications.ts`): thông báo riêng (`userId`) hoặc toàn hệ thống (`isGlobal = true`, `userId = null`); `type` ∈ `NOTIFICATION_TYPES` = `info | success | warning | error`; `title`, `message`, `link?`.
- Bảng `notification_reads`: ai đã đọc thông báo nào (cả thông báo global). User "thấy" = của mình **hoặc** global.
- Tiêu đề/nội dung lưu **đã dịch** tại thời điểm gửi (theo `users.lang`), không dịch lại khi đọc.

| Phần          | File                                                                                                                                                                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service       | `src/backends/api/src/notifications/notifications.service.ts` (`list`, `unreadCount`, `markRead`, `markAllRead`, `send`, `sendFromAdmin`, `notifyUser`)                                                                                                                                                   |
| API admin     | `notifications.controller.ts` → `POST /notifications` (`notifications.send`)                                                                                                                                                                                                                              |
| API của user  | `account/account.controller.ts` → `GET /me/notifications`, `GET /me/notifications/unread-count`, `POST /me/notifications/read`, `POST /me/notifications/read-all`                                                                                                                                         |
| Schema/DTO    | `src/packages/shared/src/schemas/notification.ts`                                                                                                                                                                                                                                                         |
| SDK           | `api.me.notifications.*` (`endpoints/me.ts`), `api.notifications.send` (`endpoints/admin.ts`)                                                                                                                                                                                                             |
| UI dùng chung | `src/packages/ui/src/notifications/` — `NotificationBell` (gắn qua `AppShell` `headerExtra`, poll 60 giây), `NotificationsPage` (route `/notifications`), hook `useUnreadCount` / `useNotificationList` / `useMarkNotifications`; bản dịch namespace `notifications` ở `src/packages/ui/src/i18n/locales` |

## Gửi thông báo hệ thống khi có sự kiện

1. Thêm nội dung vào `src/backends/api/src/i18n/vi.ts` **và** `en.ts`:

   ```ts
   notifications: {
     // ...
     orderApproved: {
       title: 'Đơn hàng {{code}} đã được duyệt',
       message: 'Đơn hàng của bạn đã được duyệt lúc {{time}}.',
     },
   },
   ```

2. Inject `NotificationsService` vào service nghiệp vụ. Module của service đó phải `imports: [NotificationsModule]` (kiểm tra `NotificationsModule` có `exports: [NotificationsService]`).
3. Gọi **sau khi** thao tác chính thành công (ngoài transaction, hoặc sau commit):

   ```ts
   await this.notifications.notifyUser(user, 'orderApproved', {
     type: 'success',
     params: { code: order.code, time: … },
     link: `/orders/${order.id}`, // đường dẫn trong app frontend, không phải URL API
   });
   ```

   `user` chỉ cần `{ id, lang }`. Thông báo là phụ: nếu lỗi gửi thông báo không được làm hỏng thao tác chính thì bọc try/catch và log bằng logger của `@base/server-kit`.

4. Ví dụ đang có: `welcome` (đăng ký, `auth.service.ts`), `passwordChanged`, `twoFactorEnabled|Disabled`, `twoFactorMethodAdded|Removed` (`two-factor.service.ts`).

Gửi cho nhiều user: lặp `notifyUser` (mỗi người một ngôn ngữ) hoặc, nếu nội dung không cần dịch theo user, `send({ isGlobal: true, … })` một dòng duy nhất — **không** insert một dòng cho mỗi user của toàn hệ thống.

## Giao diện admin gửi thông báo (chưa có)

API và SDK đã sẵn (`api.notifications.send(input)`, input theo `sendNotificationSchema`: `userId` hoặc `isGlobal`, `type`, `title`, `message`, `link`). Khi được yêu cầu làm UI, theo skill `frontend-page`:

- Feature `src/frontends/admin/src/features/notifications/` (vd. `SendNotificationModal.tsx`), chọn người nhận bằng danh sách `api.users.list({ search })`, hoặc tick "Toàn hệ thống".
- Đặt nút ở trang Người dùng (gửi cho 1 user) và/hoặc trang riêng + menu; ẩn theo `can('notifications.send')`.
- Bản dịch ở locale admin; refine lỗi `notification.targetRequired` đã có key ở i18n backend.
- Muốn có lịch sử thông báo đã gửi thì cần API mới `GET /notifications` + permission `notifications.list` (base-skill → `permissions.md`).

## Thay đổi hành vi đọc/hiển thị

- Đổi tần suất poll: `POLL_INTERVAL_MS` trong `useNotifications.ts`. Query key chung `['notifications', …]` — mutation đánh dấu đọc invalidates toàn bộ.
- Thêm `type` mới: sửa `NOTIFICATION_TYPES` (shared) → đây là `pgEnum` nên phải `pnpm db:generate` + migrate (skill `db-schema`) → cập nhật màu/icon ở `NotificationItem.tsx`.

## Kiểm tra

Lint + typecheck. Thêm test e2e: thao tác tạo thông báo → `GET /me/notifications` của user thấy đúng tiêu đề theo `lang`; user khác không thấy; `unread-count` giảm sau `read`. Hỏi cập nhật `docs/architecture.md` § Thông báo, `README.md` (dòng về giao diện gửi thông báo), `docs/TEST-CASES.md`.
