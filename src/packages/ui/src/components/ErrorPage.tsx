import { Button, Result } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

export function ErrorPage({ status }: { status: 403 | 404 }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const key = status === 403 ? 'forbidden' : 'notFound';
  return (
    <Result
      status={status}
      title={t(`common:errors.${key}Title`)}
      subTitle={t(`common:errors.${key}Description`)}
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          {t('common:errors.goHome')}
        </Button>
      }
    />
  );
}
