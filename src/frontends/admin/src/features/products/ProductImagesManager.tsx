import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  StarFilled,
  StarOutlined,
  SwapOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { IMAGE_MIME_TYPES, PRODUCT_IMAGE_LIMIT, type ProductImageDto } from '@base/shared';
import { ProductThumb, useApi, useNotifyError } from '@base/ui';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Image, Space, Tooltip, Typography, Upload } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Dung lượng tối đa kiểm tra trước ở trình duyệt (server + MinIO kiểm tra lại) */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Quản lý ảnh sản phẩm: tải nhiều ảnh (thẳng lên MinIO qua form ký sẵn), xem trước, đặt ảnh chính,
 * đổi thứ tự, thay ảnh, xoá. Mọi thay đổi xong đều tải lại chi tiết sản phẩm.
 */
export function ProductImagesManager({
  productId,
  images,
  editable,
}: {
  productId: string;
  images: ProductImageDto[];
  editable: boolean;
}) {
  const { t } = useTranslation(['products', 'common']);
  const api = useApi();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();
  const [busy, setBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['products'] });

  /** Kiểm tra loại + dung lượng trước khi gửi; trả false để chặn tải */
  function validate(file: File): boolean {
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      void message.error(t('images.invalidType'));
      return false;
    }
    if (file.size > MAX_BYTES) {
      void message.error(t('images.tooLarge', { maxMb: MAX_BYTES / 1048576 }));
      return false;
    }
    return true;
  }

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await action();
      if (success) void message.success(success);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function uploadMany(files: File[]) {
    const room = PRODUCT_IMAGE_LIMIT - images.length;
    const accepted = files.filter(validate).slice(0, Math.max(room, 0));
    if (files.length > room)
      void message.warning(t('images.limit', { limit: PRODUCT_IMAGE_LIMIT }));
    for (const file of accepted) {
      await run(() => api.products.images.upload(productId, file));
    }
    if (accepted.length) void message.success(t('images.uploaded', { count: accepted.length }));
  }

  function move(index: number, delta: number) {
    const ids = images.map((i) => i.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    void run(() => api.products.images.reorder(productId, ids));
  }

  return (
    <div>
      <Image.PreviewGroup>
        <div className="b-image-grid">
          {images.map((image, index) => (
            <div key={image.id} className="b-image-grid__item">
              <ProductThumb url={image.url} alt={image.originalName ?? ''} size={112} preview />
              {image.isPrimary && (
                <span className="b-image-grid__badge">
                  <StarFilled /> {t('images.primary')}
                </span>
              )}
              {editable && (
                <Space size={0} className="b-image-grid__actions">
                  <Tooltip title={t('images.moveLeft')}>
                    <Button
                      size="small"
                      type="text"
                      disabled={busy || index === 0}
                      icon={<ArrowLeftOutlined />}
                      onClick={() => move(index, -1)}
                    />
                  </Tooltip>
                  <Tooltip title={t('images.setPrimary')}>
                    <Button
                      size="small"
                      type="text"
                      disabled={busy || image.isPrimary}
                      icon={<StarOutlined />}
                      onClick={() =>
                        void run(() => api.products.images.setPrimary(productId, image.id))
                      }
                    />
                  </Tooltip>
                  <Upload
                    accept={IMAGE_MIME_TYPES.join(',')}
                    showUploadList={false}
                    beforeUpload={(file) => {
                      if (validate(file)) {
                        void run(
                          () =>
                            api.products.images.upload(productId, file, {
                              replaceImageId: image.id,
                            }),
                          t('images.replaced'),
                        );
                      }
                      return false;
                    }}
                  >
                    <Tooltip title={t('images.replace')}>
                      <Button size="small" type="text" disabled={busy} icon={<SwapOutlined />} />
                    </Tooltip>
                  </Upload>
                  <Tooltip title={t('common:delete')}>
                    <Button
                      size="small"
                      type="text"
                      danger
                      disabled={busy}
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        modal.confirm({
                          title: t('images.deleteConfirm'),
                          okButtonProps: { danger: true },
                          onOk: () =>
                            run(
                              () => api.products.images.remove(productId, image.id),
                              t('images.deleted'),
                            ),
                        })
                      }
                    />
                  </Tooltip>
                  <Tooltip title={t('images.moveRight')}>
                    <Button
                      size="small"
                      type="text"
                      disabled={busy || index === images.length - 1}
                      icon={<ArrowRightOutlined />}
                      onClick={() => move(index, 1)}
                    />
                  </Tooltip>
                </Space>
              )}
            </div>
          ))}
        </div>
      </Image.PreviewGroup>
      {!images.length && <Typography.Text type="secondary">{t('images.none')}</Typography.Text>}
      {editable && images.length < PRODUCT_IMAGE_LIMIT && (
        <Upload
          multiple
          accept={IMAGE_MIME_TYPES.join(',')}
          showUploadList={false}
          beforeUpload={(_file, fileList) => {
            // antd gọi beforeUpload cho từng file; chỉ xử lý một lần với cả danh sách
            if (_file === fileList[0]) void uploadMany(fileList);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />} loading={busy} style={{ marginTop: 12 }}>
            {t('images.upload')}
          </Button>
        </Upload>
      )}
      <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
        {t('images.hint', { limit: PRODUCT_IMAGE_LIMIT, maxMb: MAX_BYTES / 1048576 })}
      </Typography.Paragraph>
    </div>
  );
}
