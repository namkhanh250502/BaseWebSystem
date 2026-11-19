import { PictureOutlined } from '@ant-design/icons';
import { Image } from 'antd';
import { useState } from 'react';

export interface ProductThumbProps {
  url: string | null | undefined;
  alt: string;
  size?: number;
  /** Cho phép bấm xem ảnh lớn */
  preview?: boolean;
}

/**
 * Ảnh thu nhỏ của sản phẩm (URL ký sẵn có hạn). Không có ảnh / URL hết hạn / kho ảnh lỗi thì
 * hiện biểu tượng thay thế — nghiệp vụ không phụ thuộc kho ảnh.
 */
export function ProductThumb({ url, alt, size = 40, preview = false }: ProductThumbProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) {
    return (
      <span
        className="b-product-thumb b-product-thumb--empty"
        style={{ width: size, height: size }}
        aria-label={alt}
      >
        <PictureOutlined />
      </span>
    );
  }
  return (
    <Image
      className="b-product-thumb"
      src={url}
      alt={alt}
      width={size}
      height={size}
      preview={preview}
      onError={() => setFailedUrl(url)}
    />
  );
}
