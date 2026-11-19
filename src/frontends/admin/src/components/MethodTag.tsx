import type { HttpMethod } from '@base/shared';

/** Nhãn HTTP method có màu theo hệ thống gốc: GET xanh trời, POST xanh lá, PUT vàng, PATCH cam, DELETE đỏ */
export function MethodTag({ method }: { method: HttpMethod | string | null }) {
  if (!method) return null;
  return <span className={`method-tag method-tag--${method.toLowerCase()}`}>{method}</span>;
}
