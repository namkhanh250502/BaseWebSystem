---
name: frontend-page
description: Quy ước làm giao diện trong BaseWebSystem — thêm/sửa trang, form, modal, drawer, bảng danh sách ở app admin (src/frontends/admin) hoặc app user (src/frontends/user), thêm route + menu sidebar + guard quyền, gọi API bằng useApi + react-query, i18n frontend (namespace riêng app hoặc chung ở @base/ui), theme GPMPay. Dùng khi người dùng nói "thêm trang", "thêm màn hình", "sửa giao diện", "thêm menu", "thêm form", "UI", "dịch giao diện". Dùng kèm base-skill.
---

# Trang & component frontend

## Chọn chỗ đặt code

| Dùng ở đâu                                                | Đặt ở                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Chỉ app admin                                             | `src/frontends/admin/src/features/<feature>/` (trang lớn có thể ở `src/pages/`) |
| Chỉ app user                                              | `src/frontends/user/src/pages/` hoặc `src/features/<feature>/`                  |
| Cả 2 app (auth, tài khoản, thông báo, layout, hook, util) | `src/packages/ui/src/...`, export ở `src/packages/ui/src/index.ts`              |

Mẫu tham khảo: `admin/src/features/roles/RolesPage.tsx` (trang danh sách), `RoleFormModal.tsx` (form tạo/sửa), `RolePermissionsDrawer.tsx` (drawer), `users/UserInfoDrawer.tsx`, `settings/SettingsPage.tsx`, `pages/DashboardPage.tsx` (biểu đồ recharts).

## Khung trang danh sách

```tsx
<div className="b-page">
  <PageHeader icon={<XxxOutlined />} title={t('title')} subtitle={t('subtitle')}
    count={list.data?.meta.total} actions={can('x.create') && <Button type="primary" …/>} />
  <Card>
    <div className="b-toolbar">
      <Input.Search allowClear className="b-toolbar__search" … />
    </div>
    <Table<XDto> rowKey="id" columns={columns} dataSource={list.data?.items}
      loading={list.isFetching} scroll={{ x: 1100 }}
      pagination={{ current: page, pageSize, total: list.data?.meta.total, showSizeChanger: true,
        showTotal: (total) => t('common:total', { count: total }) }} />
  </Card>
</div>
```

- Ô tìm kiếm: `useDebouncedValue(search.trim(), 400)`, đổi search thì `setPage(1)`.
- Cột hành động: `fixed: 'right'`, nút `type="text"` + `Tooltip`, ẩn theo `can(...)`; xoá dùng `modal.confirm` với `common:deleteConfirmTitle` / `deleteConfirmContent`, `okButtonProps: { danger: true }`, `onOk: () => mutation.mutateAsync(r)`.
- Trạng thái: `<Badge status="success|error" text={t('common:active'|'common:inactive')} />`.
- Ngày giờ: `formatDateTime(value)` / `fromNow(value)` từ `@base/ui`. Người dùng: `UserCell` / `UserAvatar`, tên: `displayName(user)`.

## Gọi API

- `const api = useApi()`; endpoint chưa có thì thêm ở `src/packages/api-client/src/endpoints/*.ts` và đăng ký trong `createApi` (xem skill `feature-module` bước 5).
- Đọc: `useQuery({ queryKey: ['<resource>', query], queryFn: () => api.x.list(query), placeholderData: keepPreviousData })`.
- Ghi: `useMutation({ mutationFn, onSuccess: () => { void message.success(t('messages.saved')); void queryClient.invalidateQueries({ queryKey: ['<resource>'] }); }, onError: notifyError })` với `const notifyError = useNotifyError()`.
- Lỗi theo key cụ thể: `errorKey(err) === 'x.y'` (vd. đặt lỗi vào field form). Thông điệp chung: `getErrorMessage(err, t)`.
- `const { message, modal } = App.useApp()` — không dùng `message` import tĩnh từ antd. Gọi `message.*` bằng `void`.

## Form

- antd `Form` + `Form.useForm()`; validate client phản chiếu zod schema ở `@base/shared` (độ dài, bắt buộc). Có sẵn `passwordRules(t)`, `confirmPasswordRules(t, field)`, `emailRules(t)`.
- Modal tạo/sửa dùng chung 1 component, nhận `open`, `item?`, `onClose`, `onSaved`; reset form khi mở (dùng `afterOpenChange` / `destroyOnHidden`, **không** `setState` đồng bộ trong `useEffect` — rule React Compiler).
- Không đọc/ghi `ref.current` trong lúc render.

## Route, menu, quyền

- Admin: route trong `src/frontends/admin/src/app/router.tsx`, bọc `<RequirePermission permission="x.list">`; menu trong `AdminLayout.tsx` (`NavGroup` → `items`, `hidden: !can('x.list')`, icon `@ant-design/icons`), nhãn ở `menu.<key>`.
- User: `src/frontends/user/src/app/router.tsx` + `UserLayout.tsx`. Trang công khai (chưa đăng nhập) đặt dưới `<GuestOnly />`.
- Ẩn/hiện theo quyền: `useAuth().can('x.y')`, `<Can permission="x.y">`. Quyền chỉ là UX — backend luôn kiểm tra lại bằng `@RequirePermission`.
- Cài đặt công khai ở app user: `usePublicSettings()` (`src/frontends/user/src/lib/usePublicSettings.ts`).

## i18n

- `const { t } = useTranslation(['<ns>', 'common'])`; key namespace khác dùng `t('common:save')`.
- Bản dịch riêng app: `src/frontends/<app>/src/locales/vi.ts` + `en.ts` (thêm namespace mới là thêm key cấp 1). Dùng chung: `src/packages/ui/src/i18n/locales/{vi,en}.ts` (namespace `common`, `auth`, `account`, `notifications`).
- Luôn thêm key ở **cả** `vi` và `en`. Không hard-code chuỗi hiển thị trong JSX.
- Trước khi thêm key vào `common`, kiểm tra đã có chưa (`save`, `cancel`, `edit`, `delete`, `actions`, `status`, `active`, `total`…).

## Giao diện

- Theme antd: `src/packages/ui/src/providers/theme.ts`; CSS chung + biến `--b-*`: `src/packages/ui/src/styles.css`. Không hard-code màu/hex trong app — dùng token antd (`theme.useToken()`) hoặc biến CSS.
- Class có sẵn: `b-page`, `b-toolbar`, `b-toolbar__search`, `b-icon-btn`. Component có sẵn: `PageHeader`, `SettingsSection`, `ErrorPage`, `FullPageSpin`.
- Responsive: `useIsMobile()`; bảng rộng dùng `scroll={{ x }}`.
- Biểu đồ: recharts (xem `DashboardPage.tsx`).

## Kiểm tra

`pnpm lint` (rule `react-hooks` v7, `react-refresh/only-export-components` — file component chỉ export component) + `pnpm typecheck`. Muốn xem thật: skill `run` / `.claude/launch.json` (api 4000, user 5173, admin 5174).
