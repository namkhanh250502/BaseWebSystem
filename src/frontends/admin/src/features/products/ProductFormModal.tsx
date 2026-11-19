import { PRODUCT_STATUSES, type CreateProductInput, type ProductDetailDto } from '@base/shared';
import { moneyInputFormatter, moneyInputParser, useApi, useAuth, useNotifyError } from '@base/ui';
import { App, Col, Form, Input, InputNumber, Modal, Row, Select, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CategorySelect } from './CategorySelect';

/** Form tạo / sửa sản phẩm. Không có ô tồn kho: tồn chỉ đổi qua nhập, bán, điều chỉnh (FR-005). */
export function ProductFormModal({
  open,
  product,
  onClose,
  onSaved,
}: {
  open: boolean;
  product?: ProductDetailDto;
  onClose: () => void;
  onSaved: (product: ProductDetailDto) => void;
}) {
  const { t } = useTranslation(['products', 'commerce', 'common']);
  const api = useApi();
  const { can } = useAuth();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const [form] = Form.useForm<CreateProductInput>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      product
        ? {
            sku: product.sku,
            name: product.name,
            description: product.description,
            categoryId: product.category.id,
            unit: product.unit,
            allowDecimalQuantity: product.allowDecimalQuantity,
            purchasePrice: product.purchasePrice,
            sellingPrice: product.sellingPrice,
            minStock: product.minStock,
            status: product.status,
          }
        : { status: 'ACTIVE', allowDecimalQuantity: false, minStock: '0', purchasePrice: '0' },
    );
  }, [open, product, form]);

  async function submit(values: CreateProductInput) {
    setSaving(true);
    try {
      const saved = product
        ? await api.products.update(product.id, values)
        : await api.products.create(values);
      void message.success(t(product ? 'messages.updated' : 'messages.created'));
      onSaved(saved);
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  const money = (
    <InputNumber<string>
      stringMode
      min="0"
      step="1000"
      style={{ width: '100%' }}
      formatter={moneyInputFormatter}
      parser={moneyInputParser}
      addonAfter="₫"
    />
  );

  return (
    <Modal
      open={open}
      width={720}
      title={product ? t('edit') : t('add')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('common:save')}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit} requiredMark="optional">
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item
              name="sku"
              label={t('commerce:sku')}
              rules={[
                { required: true, whitespace: true, max: 64 },
                { pattern: /^[A-Za-z0-9._-]+$/, message: t('skuFormat') },
              ]}
            >
              <Input autoFocus />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item
              name="name"
              label={t('commerce:name')}
              rules={[{ required: true, whitespace: true, max: 255 }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="categoryId"
              label={t('commerce:category')}
              rules={[{ required: true }]}
            >
              <CategorySelect activeOnly placeholder={t('selectCategory')} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item
              name="unit"
              label={t('commerce:unit')}
              rules={[{ required: true, whitespace: true, max: 30 }]}
            >
              <Input placeholder={t('unitPlaceholder')} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="minStock" label={t('commerce:minStock')}>
              <InputNumber<string> stringMode min="0" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="sellingPrice"
              label={t('commerce:sellingPrice')}
              rules={[{ required: true }]}
            >
              {money}
            </Form.Item>
          </Col>
          {(can('products.viewCost') || !product) && (
            <Col xs={24} sm={12}>
              <Form.Item
                name="purchasePrice"
                label={t('commerce:purchasePrice')}
                tooltip={t('purchasePriceHint')}
              >
                {money}
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={12}>
            <Form.Item name="status" label={t('common:status')}>
              <Select
                options={PRODUCT_STATUSES.map((s) => ({
                  value: s,
                  label: t(`commerce:productStatus.${s}`),
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="allowDecimalQuantity"
              label={t('allowDecimalQuantity')}
              tooltip={t('allowDecimalHint')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="description" label={t('common:description')} rules={[{ max: 5000 }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
