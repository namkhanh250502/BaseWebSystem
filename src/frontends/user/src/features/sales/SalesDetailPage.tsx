import { CloseOutlined, DollarOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { PageHeader, SalesOrderDetail, useApi, useAuth, useNotifyError } from '@base/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Result, Skeleton, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { cartFromDraft, saveCart } from '../pos/cart';

/** Chi tiết đơn bán: tiếp tục đơn nháp ở màn hình bán, huỷ nháp, ghi nhận thanh toán */
export function SalesDetailPage() {
  const { t } = useTranslation(['sales', 'commerce', 'common']);
  const { id } = useParams();
  const api = useApi();
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();
  const order = useQuery({
    queryKey: ['sales-orders', 'detail', id],
    queryFn: () => api.salesOrders.get(id!),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
  const pay = useMutation({
    mutationFn: () => api.salesOrders.pay(id!),
    onSuccess: () => {
      void message.success(t('paid'));
      void refresh();
    },
    onError: notifyError,
  });
  const cancelDraft = useMutation({
    mutationFn: (version: number) => api.salesOrders.cancel(id!, { version }),
    onSuccess: () => {
      void message.success(t('draftCancelled'));
      void refresh();
    },
    onError: notifyError,
  });

  if (order.isLoading) return <Skeleton active />;
  if (!order.data) return <Result status="404" title={t('notFound')} />;
  const o = order.data;
  const isOwnDraft = o.status === 'DRAFT' && o.createdBy?.id === user?.id;

  return (
    <div className="b-page">
      <PageHeader
        icon={<ShoppingCartOutlined />}
        title={o.code}
        actions={
          <Space wrap>
            {isOwnDraft && can('sales.update') && (
              <>
                <Button
                  type="primary"
                  onClick={() => {
                    saveCart(cartFromDraft(o));
                    navigate('/pos');
                  }}
                >
                  {t('continueDraft')}
                </Button>
                <Button
                  danger
                  icon={<CloseOutlined />}
                  loading={cancelDraft.isPending}
                  onClick={() =>
                    modal.confirm({
                      title: t('cancelDraftConfirm'),
                      okButtonProps: { danger: true },
                      onOk: () => cancelDraft.mutateAsync(o.version),
                    })
                  }
                >
                  {t('cancelDraft')}
                </Button>
              </>
            )}
            {o.status === 'CONFIRMED' && o.paymentStatus === 'UNPAID' && can('sales.pay') && (
              <Button
                type="primary"
                icon={<DollarOutlined />}
                loading={pay.isPending}
                onClick={() =>
                  modal.confirm({ title: t('payConfirm'), onOk: () => pay.mutateAsync() })
                }
              >
                {t('markPaid')}
              </Button>
            )}
          </Space>
        }
      />
      <Card>
        <SalesOrderDetail order={o} />
      </Card>
    </div>
  );
}
