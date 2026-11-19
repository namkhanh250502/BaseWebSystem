import { DeleteOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons';
import { businessDate, type PurchaseInput, type PurchaseReceiptDetailDto } from '@base/shared';
import {
  isStaleError,
  lineErrorsOf,
  moneyInputFormatter,
  moneyInputParser,
  PageHeader,
  ProductSelect,
  useApi,
  useCommerceFormat,
  useNotifyError,
  type LineError,
} from '@base/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Skeleton,
  Space,
  Table,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import { SupplierSelect } from './SupplierSelect';

interface LineValues {
  productId?: string;
  quantity?: string;
  unitPrice?: string;
  discountAmount?: string;
}

interface Values {
  supplierId: string;
  receiptDate: Dayjs;
  discountAmount?: string;
  notes?: string;
  items: LineValues[];
}

/** Tổng xem trước (chỉ hiển thị; số liệu cuối do server tính khi lưu) */
function previewTotal(values: Partial<Values> | undefined): number {
  const lines = (values?.items ?? []).reduce(
    (sum, l) =>
      sum + Number(l?.quantity || 0) * Number(l?.unitPrice || 0) - Number(l?.discountAmount || 0),
    0,
  );
  return lines - Number(values?.discountAmount || 0);
}

/** Tạo / sửa phiếu nhập nháp (route /purchases/new và /purchases/:id/edit) */
export function PurchaseFormPage() {
  const { t } = useTranslation(['purchases', 'commerce', 'common']);
  const { id } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();
  const format = useCommerceFormat();
  const [form] = Form.useForm<Values>();
  const values = Form.useWatch([], form);
  const [saving, setSaving] = useState(false);
  const [lineErrors, setLineErrors] = useState<Map<string, LineError>>(new Map());

  const existing = useQuery({
    queryKey: ['purchases', 'detail', id],
    queryFn: () => api.purchases.get(id!),
    enabled: Boolean(id),
  });
  const receipt: PurchaseReceiptDetailDto | undefined = existing.data;

  useEffect(() => {
    if (id && !receipt) return;
    form.setFieldsValue(
      receipt
        ? {
            supplierId: receipt.supplier.id,
            receiptDate: dayjs(receipt.receiptDate),
            discountAmount: receipt.discountAmount,
            notes: receipt.notes ?? undefined,
            items: receipt.items.map((i) => ({
              productId: i.product.id,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discountAmount: i.discountAmount,
            })),
          }
        : { receiptDate: dayjs(businessDate()), discountAmount: '0', items: [{}] },
    );
  }, [id, receipt, form]);

  async function submit(v: Values) {
    setSaving(true);
    setLineErrors(new Map());
    const input: PurchaseInput = {
      supplierId: v.supplierId,
      receiptDate: v.receiptDate.format('YYYY-MM-DD'),
      discountAmount: v.discountAmount || '0',
      notes: v.notes?.trim() || null,
      items: v.items.map((l) => ({
        productId: l.productId!,
        quantity: l.quantity!,
        unitPrice: l.unitPrice!,
        discountAmount: l.discountAmount || '0',
      })),
    };
    try {
      const saved = receipt
        ? await api.purchases.update(receipt.id, { ...input, version: receipt.version })
        : await api.purchases.create(input);
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void message.success(t(receipt ? 'messages.updated' : 'messages.created'));
      navigate(`/purchases/${saved.id}`);
    } catch (err) {
      setLineErrors(lineErrorsOf(err));
      if (isStaleError(err)) {
        modal.confirm({
          title: t('commerce:staleReload'),
          okText: t('commerce:reload'),
          onOk: () => existing.refetch(),
        });
      } else notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  if (id && existing.isLoading) return <Skeleton active />;
  // Phiếu đã xác nhận / huỷ là bất biến → chuyển về trang chi tiết
  if (receipt && receipt.status !== 'DRAFT')
    return <Navigate to={`/purchases/${receipt.id}`} replace />;

  const lineError = (productId?: string) => (productId ? lineErrors.get(productId) : undefined);
  const initialLabel = (productId?: string) => {
    const item = receipt?.items.find((i) => i.product.id === productId);
    return item
      ? { id: item.product.id, label: `${item.product.sku} — ${item.product.name}` }
      : undefined;
  };

  return (
    <div className="b-page">
      <PageHeader
        icon={<InboxOutlined />}
        title={receipt ? t('editTitle', { code: receipt.code }) : t('add')}
        subtitle={t('formSubtitle')}
      />
      <Form form={form} layout="vertical" onFinish={submit} requiredMark="optional">
        <Card>
          <Row gutter={16}>
            <Col xs={24} md={10}>
              <Form.Item
                name="supplierId"
                label={t('commerce:supplier')}
                rules={[{ required: true }]}
              >
                <SupplierSelect
                  activeOnly
                  extraOption={receipt?.supplier}
                  placeholder={t('selectSupplier')}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                name="receiptDate"
                label={t('fields.receiptDate')}
                rules={[{ required: true }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="discountAmount" label={t('commerce:documentDiscount')}>
                <InputNumber<string>
                  stringMode
                  min="0"
                  style={{ width: '100%' }}
                  formatter={moneyInputFormatter}
                  parser={moneyInputParser}
                  addonAfter="₫"
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="notes" label={t('commerce:notes')} rules={[{ max: 2000 }]}>
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Card>
        <Card title={t('lines')} style={{ marginTop: 16 }}>
          <Form.List
            name="items"
            rules={[
              {
                validator: async (_, items: LineValues[] | undefined) => {
                  if (!items?.length) throw new Error(t('atLeastOneLine'));
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                <Table
                  rowKey="key"
                  size="small"
                  pagination={false}
                  dataSource={fields}
                  scroll={{ x: 900 }}
                  rowClassName={(field) =>
                    lineError(values?.items?.[field.name]?.productId) ? 'b-line-error' : ''
                  }
                  columns={[
                    {
                      key: 'product',
                      title: t('commerce:product'),
                      render: (_, field) => {
                        const productId = values?.items?.[field.name]?.productId;
                        const error = lineError(productId);
                        return (
                          <Form.Item
                            name={[field.name, 'productId']}
                            rules={[{ required: true, message: t('selectProduct') }]}
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
                              style={{ minWidth: 280 }}
                              initialOption={initialLabel(productId)}
                              onChange={(_, product) => {
                                if (
                                  product.purchasePrice &&
                                  !values?.items?.[field.name]?.unitPrice
                                ) {
                                  form.setFieldValue(
                                    ['items', field.name, 'unitPrice'],
                                    product.purchasePrice,
                                  );
                                }
                              }}
                            />
                          </Form.Item>
                        );
                      },
                    },
                    {
                      key: 'quantity',
                      title: t('commerce:quantity'),
                      width: 140,
                      render: (_, field) => (
                        <Form.Item
                          name={[field.name, 'quantity']}
                          rules={[{ required: true }]}
                          style={{ margin: 0 }}
                        >
                          <InputNumber<string> stringMode min="0.001" style={{ width: '100%' }} />
                        </Form.Item>
                      ),
                    },
                    {
                      key: 'unitPrice',
                      title: t('commerce:unitPrice'),
                      width: 180,
                      render: (_, field) => (
                        <Form.Item
                          name={[field.name, 'unitPrice']}
                          rules={[{ required: true }]}
                          style={{ margin: 0 }}
                        >
                          <InputNumber<string>
                            stringMode
                            min="0"
                            style={{ width: '100%' }}
                            formatter={moneyInputFormatter}
                            parser={moneyInputParser}
                          />
                        </Form.Item>
                      ),
                    },
                    {
                      key: 'discount',
                      title: t('commerce:discount'),
                      width: 160,
                      render: (_, field) => (
                        <Form.Item name={[field.name, 'discountAmount']} style={{ margin: 0 }}>
                          <InputNumber<string>
                            stringMode
                            min="0"
                            style={{ width: '100%' }}
                            formatter={moneyInputFormatter}
                            parser={moneyInputParser}
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
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      ),
                    },
                  ]}
                />
                <Form.ErrorList errors={errors} />
                <Button icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={() => add({})}>
                  {t('addLine')}
                </Button>
              </>
            )}
          </Form.List>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Typography.Text type="secondary">{t('commerce:previewTotal')}: </Typography.Text>
            <Typography.Text strong>{format.money(previewTotal(values))}</Typography.Text>
          </div>
        </Card>
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('saveDraft')}
          </Button>
          <Button onClick={() => navigate(receipt ? `/purchases/${receipt.id}` : '/purchases')}>
            {t('common:cancel')}
          </Button>
        </Space>
      </Form>
    </div>
  );
}
