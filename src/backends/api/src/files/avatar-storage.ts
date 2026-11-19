import path from 'node:path';
import { getEnv } from '../config/env';

/** Đường dẫn URL công khai của avatar (phục vụ bởi FilesController) */
export const AVATAR_URL_PREFIX = '/api/v1/files/avatars/';

/** Thư mục lưu avatar trên đĩa */
export function avatarDir() {
  return path.join(getEnv().uploadDir, 'avatars');
}
