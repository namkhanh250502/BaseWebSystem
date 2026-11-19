import { DeleteOutlined, PlusOutlined, ToolOutlined } from '@ant-design/icons';
import { ADJUSTMENT_REASONS, type AdjustmentReason, type ProductDto } from '@base/shared';
import {
  lineErrorsOf,
  newRequestId,
  PageHeader,
  ProductSelect,
  useApi,
  useCommerceFormat,
  useNotifyError,
  type LineError,
} from '@base/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

interface LineValues {
  productId?: string;
  quantityChange?: string;
  countedQuantity?: string;
}

interface Values {
  reason: AdjustmentReason;
  note?: string;
  items: LineValues[];
}

/**
 * Phiếu điều chỉnh tồn: chọn lý do (bắt buộc). Kiểm kê → nhập số đếm thực tế, hệ thống tự tính
 * chênh lệch; lý do khác → nhập chênh lệch (+ tăng / − giảm). Áp dụng ngay khi lưu.
 */
export function AdjustmentFormPage() {
  const { t } = useTranslation(['inventory', 'commerce', 'common']);
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const format = useCommerceFormat();
  const [form] = Form.useForm<Values>();
  const reason = Form.useWatch('reason', form);
  const lines = Form.useWatch('items', form);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Record<string, ProductDto>>({});
  const [lineErrors, setLineErrors] = useState<Map<string, LineError>>(new Map());
  // Một id cho mỗi lần mở form: bấm lưu lại sau lỗi mạng không tạo phiếu trùng
  const [requestId, setRequestId] = useState(newRequestId);
  const stocktake = reason === 'STOCKTAKE';

  async function submit(v: Values) {
    setSaving(true);
    setLineErrors(new Map());
    try {
      const adjustment = await api.inventory.adjust({
        clientRequestId: requestId,
        reason: v.reason,
        note: v.note?.trim() || null,
        items: v.items.map((l) =>
          v.reason === 'STOCKTAKE'
            ? { productId: l.productId!, countedQuantity: l.countedQuantity! }
            : { productId: l.productId!, quantityChange: l.quantityChange! },
        ),
      });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void message.success(t('messages.adjusted', { code: adjustment.code }));
      navigate(`/inventory/adjustments/${adjustment.id}`);
    } catch (err) {
      setLineErrors(lineErrorsOf(err));
      // Lỗi nghiệp vụ (không phải mạng) → lần gửi sau là yêu cầu mới
      setRequestId(newRequestId());
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="b-page">
      <PageHeader icon={<ToolOutlined />} title={t('adjust')} subtitle={t('adjustSubtitle')} />
      <Form<Values>
        form={form}
        layout="vertical"
        onFinish={submit}
        requiredMark="optional"
        initialValues={{ items: [{}] }}
      >
        <Card>
          <Space wrap align="start" size={16}>
            <Form.Item
              name="reason"
              label={t('commerce:reason')}
              rules={[{ required: true }]}
              style={{ minWidth: 220 }}
            >
              <Select
                placeholder={t('selectReason')}
                options={ADJUSTMENT_REASONS.map((r) => ({
                  value: r,
                  label: t(`commerce:adjustmentReason.${r}`),
                }))}
              />
            </Form.Item>
            <Form.Item
              name="note"
              label={t('commerce:notes')}
              rules={[
                { required: reason === 'OTHER', whitespace: true, message: t('noteRequired') },
                { max: 1000 },
              ]}
              style={{ minWidth: 360 }}
            >
              <Input />
            </Form.Item>
          </Space>
          {stocktake && <Alert type="info" showIcon message={t('stocktakeHint')} />}
        </Card>
        <Card title={t('lines')} style={{ marginTop: 16 }}>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                <Table
                  rowKey="key"
                  size="small"
                  pagination={false}
                  dataSource={fields}
                  scroll={{ x: 800 }}
                  rowClassName={(field) =>
                    lineErrors.has(lines?.[field.name]?.productId ?? '') ? 'b-line-error' : ''
                  }
                  columns={[
                    {
                      key: 'product',
                      title: t('commerce:product'),
                      render: (_, field) => {
                        const error = lineErrors.get(lines?.[field.name]?.productId ?? '');
                        return (
                          <Form.Item
                            name={[field.name, 'productId']}
                            rules={[{ required: true }]}
                            style={{ margin: 0 }}
                            help={
                              error
                                ? t(`commerce:lineError.${error.kind}`, {
                                    sku: error.sku,
                                    requested: error.requested,
                                    available: error.available,
                                  })
                                : undefined
                            }
                            validateStatus={error ? 'error' : undefined}
                          >
                            <ProductSelect
                              activeOnly={false}
                              style={{ minWidth: 280 }}
                              onChange={(id, product) =>
                                setProducts((prev) => ({ ...prev, [id]: product }))
                              }
                            />
                          </Form.Item>
                        );
                      },
                    },
                    {
                      key: 'current',
                      title: t('currentStock'),
                      align: 'right',
                      width: 130,
                      render: (_, field) => {
                        const p = products[lines?.[field.name]?.productId ?? ''];
                        return p ? `${format.quantity(p.stock.quantity)} ${p.unit}` : '—';
                      },
                    },
                    {
                      key: 'qty',
                      title: stocktake ? t('counted') : t('change'),
                      width: 180,
                      render: (_, field) =>
                        stocktake ? (
                          <Form.Item
                            name={[field.name, 'countedQuantity']}
                            rules={[{ required: true }]}
                            style={{ margin: 0 }}
                          >
                            <InputNumber<string> stringMode min="0" style={{ width: '100%' }} />
                          </Form.Item>
                        ) : (
                          <Form.Item
                            name={[field.name, 'quantityChange']}
                            rules={[
                              { required: true },
                              {
                                validator: async (_r, v?: string) => {
                                  if (v !== undefined && Number(v) === 0)
                                    throw new Error(t('nonZero'));
                                },
                              },
                            ]}
                            style={{ margin: 0 }}
                          >
                            <InputNumber<string>
                              stringMode
                              style={{ width: '100%' }}
                              placeholder="-2 / +3"
                            />
                          </Form.Item>
                        ),
                    },
                    {
                      key: 'remove',
                      width: 56,
                      render: (_, field) => (
                        <Button
                          type="text"
                          danger
                          disabled={fields.length === 1}
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      ),
                    },
                  ]}
                />
                <Button icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={() => add({})}>
                  {t('addLine')}
                </Button>
              </>
            )}
          </Form.List>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            {t('adjustCostHint')}
          </Typography.Paragraph>
        </Card>
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('applyAdjustment')}
          </Button>
          <Button onClick={() => navigate('/inventory/adjustments')}>{t('common:cancel')}</Button>
        </Space>
      </Form>
    </div>
  );
}
