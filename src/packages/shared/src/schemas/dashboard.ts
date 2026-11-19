import { z } from 'zod';

export const userGrowthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export interface UserGrowthDto {
  year: number;
  /** 12 phần tử, month = 1..12 */
  months: { month: number; newUsers: number }[];
  totalNewUsers: number;
  /** Năm sớm nhất có người dùng đăng ký (để dựng ô chọn năm) */
  firstYear: number;
}
