import { InboxOutlined } from '@ant-design/icons';
import type { SettingsExportFile } from '@base/shared';
import { getErrorMessage, useApi } from '@base/ui';
import { Alert, App, Checkbox, Modal, Table, Tag, Typography, Upload } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Row = { name: string; value: string | null };

/**
 * Đọc file JSON theo 1 trong 3 dạng:
 * - file export: { version, settings: [{ name, value }] }
 * - mảng: [{ name, value }]
 * - object: { "key": "value" }
 */
function parseSettingsFile(text: string): Row[] | null {
  const json: unknown = JSON.parse(text);
  const toValue = (v: unknown) =>
    v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v);

  const fromArray = (arr: unknown[]) =>
    arr.every((i) => i && typeof i === 'object' && typeof (i as Row).name === 'string')
      ? arr.map((i) => ({ name: (i as Row).name.trim(), value: toValue((i as Row).value) }))
      : null;

  if (Array.isArray(json)) return fromArray(json);
  if (json && typeof json === 'object') {
    const file = json as Partial<SettingsExportFile>;
    if (Array.isArray(file.settings)) return fromArray(file.settings);
    return Object.entries(json).map(([name, value]) => ({
      name: name.trim(),
      value: typeof value === 'boolean' || typeof value === 'number' ? String(value) : toValue(value),
    }));
  }
  return null;
}

export function ImportSettingsModal({
  open,
  knownKeys,
  onClose,
  onImported,
}: {
  open: boolean;
  /** Key hệ thống (lấy từ GET /settings) để đánh dấu key sẽ bị bỏ qua */
  knownKeys: ReadonlySet<string>;
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const api = useApi();
  const { message } = App.useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setRows(null);
    setFileName('');
    setError(null);
    setOverwrite(true);
  };

  async function readFile(file: File) {
    setError(null);
    setRows(null);
    setFileName(file.name);
    try {
      const parsed = parseSettingsFile(await file.text());
      if (!parsed) setError(t('importInvalid', { reason: t('importInvalidFormat') }));
      else if (!parsed.length) setError(t('importInvalid', { reason: t('importEmpty') }));
      else setRows(parsed);
    } catch (err) {
      setError(t('importInvalid', { reason: (err as Error).message }));
    }
  }

  async function submit() {
    if (!rows) return;
    setImporting(true);
    try {
      const result = await api.settings.import({ settings: rows, overwrite });
      const { unknown, ...counts } = result;
      void message.success(t('importResult', counts));
      if (unknown.length) {
        void message.warning(t('importUnknown', { count: unknown.length, keys: unknown.join(', ') }));
      }
      onImported();
      reset();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, t));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal
      open={open}
      width={680}
      title={t('importTitle')}
      onCancel={() => {
        reset();
        onClose();
      }}
      onOk={submit}
      okText={t('import')}
      okButtonProps={{ disabled: !rows }}
      confirmLoading={importing}
      destroyOnHidden
    >
      <Upload.Dragger
        accept=".json,application/json"
        maxCount={1}
        showUploadList={false}
        beforeUpload={(file) => {
          void readFile(file);
          return false;
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{fileName || t('importDrop')}</p>
        <p className="ant-upload-hint">{t('importFormats')}</p>
      </Upload.Dragger>

      {error && <Alert type="error" showIcon title={error} className="b-mt-16" />}

      {rows && (
        <>
          <Typography.Paragraph strong className="b-mt-16">
            {t('importPreview', { count: rows.length })}
          </Typography.Paragraph>
          <Table<Row>
            size="small"
            rowKey="name"
            dataSource={rows}
            pagination={rows.length > 8 ? { pageSize: 8, size: 'small' } : false}
            columns={[
              {
                title: t('columns.name'),
                dataIndex: 'name',
                render: (v: string) => (
                  <>
                    <code>{v}</code>{' '}
                    {!knownKeys.has(v) && <Tag>{t('importUnknownTag')}</Tag>}
                  </>
                ),
              },
              {
                title: t('columns.value'),
                dataIndex: 'value',
                ellipsis: true,
                render: (v: string | null) => v ?? <Typography.Text type="secondary">null</Typography.Text>,
              },
            ]}
          />
          <Checkbox checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="b-mt-16">
            {t('overwrite')}
          </Checkbox>
        </>
      )}
    </Modal>
  );
}
