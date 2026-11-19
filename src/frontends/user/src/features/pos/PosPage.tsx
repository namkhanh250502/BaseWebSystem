import { DeleteOutlined, SaveOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import {
  PAYMENT_METHODS,
  type CreateSalesOrderInput,
  type ProductDto,
  type SalesOrderDetailDto,
} from '@base/shared';
import {
  isConnectivityError,
  lineErrorsOf,
  moneyInputFormatter,
  moneyInputParser,
  newRequestId,
  PageHeader,
  ProductThumb,
  StockStateTag,
  useApi,
  useAuth,
  useCommerceFormat,
  useDebouncedValue,
  useNotifyError,
  type LineError,
} from '@base/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Divider,
  Empty,
  Input,
  InputNumber,
  List,
  Result,
  Segmented,
  Space,
  Spin,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  emptyCart,
  lineFromProduct,
  loadCart,
  previewTotal,
  saveCart,
  type Cart,
  type CartLine,
} from './cart';

/** Lưới sản phẩm đang kinh doanh, tìm theo tên / SKU */
function ProductPicker({ onPick }: { onPick: (product: ProductDto) => void }) {
  const { t } = useTranslation(['pos', 'commerce']);
  const api = useApi();
  const format = useCommerceFormat();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);
  const products = useQuery({
    queryKey: ['products', 'pos', debounced],
    queryFn: () =>
      api.products.list({
        search: debounced || undefined,
        status: 'ACTIVE',
        pageSize: 24,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  return (
    <Card>
      <Input.Search
        allowClear
        autoFocus
        size="large"
        placeholder={t('commerce:productSearchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onSearch={() => {
          // Enter khi chỉ có 1 kết quả (quét mã SKU) → thêm thẳng vào giỏ
          const items = products.data?.items ?? [];
          if (items.length === 1) {
            onPick(items[0]!);
            setSearch('');
          }
        }}
        style={{ marginBottom: 16 }}
      />
      <Spin spinning={products.isFetching}>
        {products.data?.items.length ? (
          <div className="b-pos__products">
            {products.data.items.map((p) => (
              <Card
                key={p.id}
                size="small"
                hoverable
                className="b-pos__product"
                onClick={() => onPick(p)}
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <ProductThumb url={p.primaryImage?.url} alt={p.name} size={64} />
                  <Typography.Text strong ellipsis={{ tooltip: p.name }}>
                    {p.name}
                  </Typography.Text>
                  <Typography.Text type="secondary">{p.sku}</Typography.Text>
                  <Typography.Text>{format.money(p.sellingPrice)}</Typography.Text>
                  <Space size={4}>
                    <Typography.Text type="secondary">
                      {t('commerce:stock')}: {format.quantity(p.stock.quantity)}
                    </Typography.Text>
                    <StockStateTag state={p.stock.state} />
                  </Space>
                </Space>
              </Card>
            ))}
          </div>
        ) : (
          <Empty description={t('commerce:noProducts')} />
        )}
      </Spin>
    </Card>
  );
}

function CartLineRow({
  line,
  error,
  canOverridePrice,
  onChange,
  onRemove,
}: {
  line: CartLine;
  error?: LineError;
  canOverridePrice: boolean;
  onChange: (patch: Partial<CartLine>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation(['pos', 'commerce']);
  const format = useCommerceFormat();
  const overStock = line.stock !== '' && Number(line.quantity) > Number(line.stock);
  return (
    <List.Item className={error ? 'b-line-error' : undefined} style={{ display: 'block' }}>
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space align="start">
          <ProductThumb url={line.imageUrl} alt={line.name} size={36} />
          <span>
            <Typography.Text strong>{line.name}</Typography.Text>
            <br />
            <Typography.Text type="secondary">
              {line.sku} · {format.money(line.listPrice)}/{line.unit}
            </Typography.Text>
          </span>
        </Space>
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={onRemove}
          aria-label={t('remove')}
        />
      </Space>
      <Space wrap style={{ marginTop: 8 }}>
        <InputNumber<string>
          stringMode
          min={line.allowDecimalQuantity ? '0.001' : '1'}
          step={line.allowDecimalQuantity ? '0.1' : '1'}
          precision={line.allowDecimalQuantity ? undefined : 0}
          value={line.quantity}
          onChange={(v) => onChange({ quantity: v ?? '1' })}
          addonBefore={t('commerce:quantity')}
          style={{ width: 170 }}
        />
        <InputNumber<string>
          stringMode
          min="0"
          disabled={!canOverridePrice}
          value={line.unitPrice}
          formatter={moneyInputFormatter}
          parser={moneyInputParser}
          onChange={(v) => onChange({ unitPrice: v ?? line.listPrice })}
          addonBefore={t('commerce:unitPrice')}
          style={{ width: 210 }}
        />
        <InputNumber<string>
          stringMode
          min="0"
          value={line.discountAmount}
          formatter={moneyInputFormatter}
          parser={moneyInputParser}
          onChange={(v) => onChange({ discountAmount: v ?? '0' })}
          addonBefore={t('commerce:discount')}
          style={{ width: 200 }}
        />
      </Space>
      {error && (
        <Typography.Text type="danger" style={{ display: 'block', marginTop: 4 }}>
          {t(`commerce:lineError.${error.kind}`, {
            sku: error.sku,
            requested: error.requested,
            available: error.available,
          })}
        </Typography.Text>
      )}
      {!error && overStock && (
        <Typography.Text type="warning" style={{ display: 'block', marginTop: 4 }}>
          {t('overStock', { stock: format.quantity(line.stock) })}
        </Typography.Text>
      )}
    </List.Item>
  );
}

/**
 * Bán tại quầy: tìm sản phẩm → giỏ hàng → Chốt đơn (tạo + chốt một bước, idempotent theo
 * requestId của giỏ) hoặc Lưu nháp. Mọi số liệu cuối do server tính; giỏ chỉ xem trước.
 */
export function PosPage() {
  const { t } = useTranslation(['pos', 'commerce', 'common']);
  const api = useApi();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const format = useCommerceFormat();
  const [cart, setCart] = useState<Cart>(loadCart);
  const [lineErrors, setLineErrors] = useState<Map<string, LineError>>(new Map());
  const [submitting, setSubmitting] = useState<'confirm' | 'draft' | null>(null);
  const [completed, setCompleted] = useState<SalesOrderDetailDto | null>(null);
  const canOverridePrice = can('sales.overridePrice');

  useEffect(() => saveCart(cart), [cart]);

  const update = (patch: Partial<Cart>) => setCart((c) => ({ ...c, ...patch }));
  const updateLine = (productId: string, patch: Partial<CartLine>) => {
    setLineErrors((errors) => {
      if (!errors.has(productId)) return errors;
      const next = new Map(errors);
      next.delete(productId);
      return next;
    });
    setCart((c) => ({
      ...c,
      lines: c.lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)),
    }));
  };
  const addProduct = (product: ProductDto) =>
    setCart((c) => {
      const existing = c.lines.find((l) => l.productId === product.id);
      if (existing) {
        return {
          ...c,
          lines: c.lines.map((l) =>
            l.productId === product.id
              ? { ...l, quantity: String(Number(l.quantity) + 1), stock: product.stock.quantity }
              : l,
          ),
        };
      }
      return { ...c, lines: [...c.lines, lineFromProduct(product)] };
    });

  function input(): Omit<CreateSalesOrderInput, 'clientRequestId'> {
    return {
      customerName: cart.customerName.trim() || null,
      customerPhone: cart.customerPhone.trim() || null,
      paymentMethod: cart.paymentMethod,
      discountAmount: cart.discountAmount || '0',
      items: cart.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        // Bỏ trống = giá niêm yết (không cần quyền sửa giá)
        unitPrice: l.unitPrice !== l.listPrice ? l.unitPrice : undefined,
        discountAmount: l.discountAmount || '0',
      })),
    };
  }

  async function submit(mode: 'confirm' | 'draft') {
    setSubmitting(mode);
    setLineErrors(new Map());
    try {
      let order: SalesOrderDetailDto;
      if (cart.draft) {
        const saved = await api.salesOrders.update(cart.draft.id, {
          ...input(),
          version: cart.draft.version,
        });
        // Đã lưu nháp: nếu bước chốt lỗi (vd. thiếu hàng), lần sau phải gửi đúng phiên bản mới
        setCart((c) => (c.draft ? { ...c, draft: { ...c.draft, version: saved.version } } : c));
        order =
          mode === 'confirm'
            ? await api.salesOrders.confirm(saved.id, {
                version: saved.version,
                markPaid: cart.markPaid,
                paymentMethod: cart.paymentMethod,
              })
            : saved;
      } else {
        order = await api.salesOrders.create({
          ...input(),
          clientRequestId: cart.requestId,
          confirm: mode === 'confirm',
          markPaid: mode === 'confirm' && cart.markPaid,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setCart(emptyCart());
      if (mode === 'confirm') setCompleted(order);
      else void message.success(t('draftSaved', { code: order.code }));
    } catch (err) {
      setLineErrors(lineErrorsOf(err));
      // Lỗi nghiệp vụ: lần gửi sau là yêu cầu mới. Lỗi mạng: giữ requestId để gửi lại an toàn.
      if (!isConnectivityError(err)) update({ requestId: newRequestId() });
      notifyError(err);
    } finally {
      setSubmitting(null);
    }
  }

  if (completed) {
    return (
      <div className="b-page">
        <Result
          status="success"
          title={t('completedTitle', { code: completed.code })}
          subTitle={t('completedSubtitle', {
            total: format.money(completed.totalAmount),
            payment: t(`commerce:paymentStatus.${completed.paymentStatus}`),
          })}
          extra={[
            <Button key="new" type="primary" onClick={() => setCompleted(null)}>
              {t('newOrder')}
            </Button>,
            <Link key="view" to={`/sales/${completed.id}`}>
              <Button>{t('viewOrder')}</Button>
            </Link>,
          ]}
        />
      </div>
    );
  }

  const empty = cart.lines.length === 0;
  return (
    <div className="b-page">
      <PageHeader
        icon={<ShoppingCartOutlined />}
        title={t('title')}
        subtitle={cart.draft ? t('continuingDraft', { code: cart.draft.code }) : t('subtitle')}
      />
      <div className="b-pos">
        <ProductPicker onPick={addProduct} />
        <Card
          title={t('cart', { count: cart.lines.length })}
          extra={
            !empty && (
              <Button type="link" danger onClick={() => setCart(emptyCart())}>
                {t('clearCart')}
              </Button>
            )
          }
        >
          {empty ? (
            <Empty description={t('emptyCart')} />
          ) : (
            <List
              dataSource={cart.lines}
              renderItem={(line) => (
                <CartLineRow
                  line={line}
                  error={lineErrors.get(line.productId)}
                  canOverridePrice={canOverridePrice}
                  onChange={(patch) => updateLine(line.productId, patch)}
                  onRemove={() =>
                    setCart((c) => ({
                      ...c,
                      lines: c.lines.filter((l) => l.productId !== line.productId),
                    }))
                  }
                />
              )}
            />
          )}
          <Divider />
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input
              placeholder={t('commerce:customerName')}
              value={cart.customerName}
              maxLength={150}
              onChange={(e) => update({ customerName: e.target.value })}
            />
            <Input
              placeholder={t('commerce:customerPhone')}
              value={cart.customerPhone}
              maxLength={30}
              onChange={(e) => update({ customerPhone: e.target.value })}
            />
            <InputNumber<string>
              stringMode
              min="0"
              value={cart.discountAmount}
              formatter={moneyInputFormatter}
              parser={moneyInputParser}
              onChange={(v) => update({ discountAmount: v ?? '0' })}
              addonBefore={t('commerce:orderDiscount')}
              style={{ width: '100%' }}
            />
            <Segmented<string>
              block
              value={cart.paymentMethod}
              onChange={(v) => update({ paymentMethod: v as Cart['paymentMethod'] })}
              options={PAYMENT_METHODS.map((m) => ({
                value: m,
                label: t(`commerce:paymentMethod.${m}`),
              }))}
            />
            <Checkbox
              checked={cart.markPaid}
              onChange={(e) => update({ markPaid: e.target.checked })}
            >
              {t('markPaid')}
            </Checkbox>
            <Typography.Title level={3} style={{ margin: '8px 0', textAlign: 'right' }}>
              {format.money(previewTotal(cart))}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'right' }}>
              {t('commerce:previewTotal')}
            </Typography.Text>
            {!cart.markPaid && <Alert type="warning" showIcon message={t('unpaidHint')} />}
            <Button
              type="primary"
              size="large"
              block
              disabled={empty || submitting === 'draft'}
              loading={submitting === 'confirm'}
              onClick={() => void submit('confirm')}
            >
              {t('checkout')}
            </Button>
            <Button
              block
              icon={<SaveOutlined />}
              disabled={empty || submitting === 'confirm'}
              loading={submitting === 'draft'}
              onClick={() => void submit('draft')}
            >
              {t('saveDraft')}
            </Button>
          </Space>
        </Card>
      </div>
    </div>
  );
}
