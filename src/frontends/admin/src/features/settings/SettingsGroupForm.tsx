import { DeleteOutlined } from '@ant-design/icons';
import type { SettingGroupDto, SettingItemDto } from '@base/shared';
import { useApi, useNotifyError } from '@base/ui';
import { App, Button, Form, Input, InputNumber, Select, Switch, Tag, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type FormValue = string | number | boolean | string[] | null | undefined;

/** multiselect lưu DB dạng "a,b,c" */
const splitList = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

/** Giá trị từ server (chuỗi) → giá trị cho ô nhập */
function toFormValue(item: SettingItemDto): FormValue {
  if (item.isSecret) return '';
  const value = item.value ?? '';
  switch (item.type) {
    case 'boolean':
      return value === 'true';
    case 'number':
      return value === '' ? null : Number(value);
    case 'multiselect':
      return splitList(value);
    case 'select':
      return value === '' ? undefined : value;
    default:
      return value;
  }
}

/** Giá trị ô nhập → chuỗi lưu DB */
function toSettingValue(item: SettingItemDto, value: FormValue): string {
  if (item.type === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.join(',');
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Form 1 nhóm cài đặt, sinh ô nhập theo `type` / `options` server trả; chỉ gửi các key có thay đổi */
export function SettingsGroupForm({
  items,
  readOnly,
  hint,
  onSaved,
}: {
  items: SettingItemDto[];
  readOnly: boolean;
  hint?: ReactNode;
  onSaved: (groups: SettingGroupDto[]) => void;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const api = useApi();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();
  const [form] = Form.useForm<Record<string, FormValue>>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    form.setFieldsValue(Object.fromEntries(items.map((i) => [i.name, toFormValue(i)])));
  }, [items, form]);

  async function save(values: Record<string, FormValue>) {
    const changed: Record<string, string | null> = {};
    for (const item of items) {
      if (item.isSecret) {
        // Key bí mật: để trống = giữ nguyên giá trị cũ
        const typed = String(values[item.name] ?? '');
        if (typed) changed[item.name] = typed;
      } else {
        const next = toSettingValue(item, values[item.name]);
        if (next !== (item.value ?? '')) changed[item.name] = next;
      }
    }
    if (!Object.keys(changed).length) {
      void message.info(t('saved'));
      return;
    }
    setSaving(true);
    try {
      onSaved(await api.settings.update(changed));
      void message.success(t('saved'));
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  const clearSecret = (item: SettingItemDto) =>
    modal.confirm({
      title: t('common:confirm'),
      content: t('clearSecretConfirm', { name: item.label }),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          onSaved(await api.settings.update({ [item.name]: '' }));
          void message.success(t('saved'));
        } catch (err) {
          notifyError(err);
        }
      },
    });

  function renderInput(item: SettingItemDto) {
    const placeholder = item.placeholder ?? undefined;
    if (item.isSecret) {
      return (
        <Input.Password
          disabled={readOnly}
          autoComplete="new-password"
          placeholder={item.configured ? t('secretPlaceholder') : t('secretEmptyPlaceholder')}
        />
      );
    }
    switch (item.type) {
      case 'boolean':
        return <Switch disabled={readOnly} />;
      case 'number':
        return (
          <InputNumber disabled={readOnly} placeholder={placeholder} style={{ width: '100%' }} />
        );
      case 'select':
      case 'multiselect':
        return (
          <Select
            disabled={readOnly}
            mode={item.type === 'multiselect' ? 'multiple' : undefined}
            allowClear
            placeholder={placeholder}
            showSearch={{ optionFilterProp: 'label' }}
            options={item.options ?? []}
          />
        );
      case 'text':
        return <Input.TextArea rows={3} disabled={readOnly} placeholder={placeholder} />;
      default:
        return <Input disabled={readOnly} placeholder={placeholder} />;
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      onFinish={save}
      className="settings-form"
    >
      {hint}
      {items.map((item) => (
        <Form.Item
          key={item.name}
          name={item.name}
          valuePropName={item.type === 'boolean' && !item.isSecret ? 'checked' : 'value'}
          label={
            <span className="settings-label">
              <span>{item.label}</span>
              <Typography.Text type="secondary" code className="settings-label__key">
                {item.name}
              </Typography.Text>
              {item.isSecret && <Tag color="purple">{t('secret')}</Tag>}
              {item.isSecret && item.configured && <Tag color="success">{t('configured')}</Tag>}
            </span>
          }
          extra={
            (item.description || (item.isSecret && item.configured && !readOnly)) && (
              <span className="settings-extra">
                {item.description}
                {item.isSecret && item.configured && !readOnly && (
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => clearSecret(item)}
                    className="b-px-0"
                  >
                    {t('clearSecret')}
                  </Button>
                )}
              </span>
            )
          }
        >
          {renderInput(item)}
        </Form.Item>
      ))}
      {!readOnly && (
        <div className="b-form-actions">
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('save')}
          </Button>
        </div>
      )}
    </Form>
  );
}
