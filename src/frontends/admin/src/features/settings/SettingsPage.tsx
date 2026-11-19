import { DownloadOutlined, DownOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons';
import type { SettingGroupDto, SettingHintDto } from '@base/shared';
import {
  downloadFile,
  PageHeader,
  SettingsSection,
  useApi,
  useAuth,
  useNotifyError,
} from '@base/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Dropdown, Skeleton } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImportSettingsModal } from './ImportSettingsModal';
import { SettingsGroupForm } from './SettingsGroupForm';

/**
 * Cấu hình hệ thống. Toàn bộ nhóm, key, nhãn, mô tả, kiểu ô nhập, lựa chọn đều lấy từ
 * GET /settings — thêm key ở backend là trang tự hiện, không phải sửa file này.
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const api = useApi();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const [importOpen, setImportOpen] = useState(false);
  const canEdit = can('settings.update');

  // Nhãn / mô tả do backend dịch theo ngôn ngữ → đổi ngôn ngữ thì tải lại
  const queryKey = ['settings', 'groups', i18n.language] as const;
  const settings = useQuery({ queryKey, queryFn: () => api.settings.list() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['settings'] });
  const onSaved = (groups: SettingGroupDto[]) => queryClient.setQueryData(queryKey, groups);

  const knownKeys = useMemo(
    () => new Set(settings.data?.flatMap((g) => g.items.map((i) => i.name)) ?? []),
    [settings.data],
  );

  async function exportJson(includeSecrets: boolean) {
    try {
      const file = await api.settings.export(includeSecrets);
      downloadFile(
        JSON.stringify(file, null, 2),
        `settings-${dayjs().format('YYYYMMDD-HHmmss')}.json`,
        'application/json',
      );
      void message.success(t('exported', { count: file.settings.length }));
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <div className="b-page">
      <PageHeader
        icon={<SettingOutlined />}
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <>
            {can('settings.export') && (
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'public', label: t('exportPublic') },
                    ...(canEdit ? [{ key: 'secrets', label: t('exportWithSecrets') }] : []),
                  ],
                  onClick: ({ key }) => void exportJson(key === 'secrets'),
                }}
              >
                <Button icon={<DownloadOutlined />}>
                  {t('export')} <DownOutlined />
                </Button>
              </Dropdown>
            )}
            {can('settings.import') && (
              <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
                {t('import')}
              </Button>
            )}
          </>
        }
      />

      <Card>
        {settings.isPending ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          settings.data?.map((group) => (
            <SettingsSection key={group.name} title={group.title} description={group.description}>
              <SettingsGroupForm
                items={group.items}
                readOnly={!canEdit}
                hint={group.hint ? <GroupHint hint={group.hint} /> : undefined}
                onSaved={onSaved}
              />
            </SettingsSection>
          ))
        )}
      </Card>

      <ImportSettingsModal
        open={importOpen}
        knownKeys={knownKeys}
        onClose={() => setImportOpen(false)}
        onImported={() => void refresh()}
      />
    </div>
  );
}

/** Gợi ý đầu nhóm do backend trả (vd. redirect URI cần khai báo trên Google) */
function GroupHint({ hint }: { hint: SettingHintDto }) {
  return (
    <div className="settings-hint">
      {hint.text && <div>{hint.text}</div>}
      {hint.code.map((line) => (
        <code key={line}>{line}</code>
      ))}
    </div>
  );
}
