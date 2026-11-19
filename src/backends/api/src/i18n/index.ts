import { createTranslator } from '@base/server-kit';
import { en } from './en';
import { vi } from './vi';

/** Bản dịch phía server: thông báo lỗi, email, thông báo hệ thống */
export const t = createTranslator({ vi, en });
