import { GlobalOutlined } from '@ant-design/icons';
import { LOCALES } from '@base/shared';
import { Button, Dropdown } from 'antd';
import { useTranslation } from 'react-i18next';
import { currentLocale } from '../i18n/createI18n';

/** Nút chọn ngôn ngữ (Tiếng Việt / English) */
export function LanguageSwitcher({ showLabel = false }: { showLabel?: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = currentLocale(i18n.language);
  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        selectable: true,
        selectedKeys: [locale],
        items: LOCALES.map((lng) => ({ key: lng, label: t(`common:languages.${lng}`) })),
        onClick: ({ key }) => void i18n.changeLanguage(key),
      }}
    >
      <Button type="text" icon={<GlobalOutlined />} aria-label={t('common:language')}>
        {showLabel ? t(`common:languages.${locale}`) : locale.toUpperCase()}
      </Button>
    </Dropdown>
  );
}
