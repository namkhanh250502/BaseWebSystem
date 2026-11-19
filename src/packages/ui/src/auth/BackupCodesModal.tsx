import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Modal, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { downloadFile } from '../utils';

export interface BackupCodesModalProps {
  codes: string[] | null;
  onDone: () => void;
}

/** Hiển thị mã dự phòng 2FA đúng 1 lần, cho phép sao chép / tải file */
export function BackupCodesModal({ codes, onDone }: BackupCodesModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const text = codes?.join('\n') ?? '';

  return (
    <Modal
      open={Boolean(codes)}
      title={t('account:backupCodes.title')}
      closable={false}
      mask={{ closable: false }}
      keyboard={false}
      footer={
        <Button type="primary" onClick={onDone}>
          {t('account:backupCodes.saved')}
        </Button>
      }
    >
      <Alert
        type="warning"
        showIcon
        title={t('account:backupCodes.description')}
        className="b-mb-16"
      />
      <div className="b-backup-codes">
        {codes?.map((code) => (
          <code key={code}>{code}</code>
        ))}
      </div>
      <Space className="b-mt-16">
        <Button
          icon={<CopyOutlined />}
          onClick={() =>
            void navigator.clipboard.writeText(text).then(() => message.success(t('common:copied')))
          }
        >
          {t('account:backupCodes.copyAll')}
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => downloadFile(text + '\n', 'backup-codes.txt')}
        >
          {t('account:backupCodes.download')}
        </Button>
      </Space>
    </Modal>
  );
}
