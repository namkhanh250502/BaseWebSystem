import { Injectable } from '@nestjs/common';
import { documentSequences, sql } from '@base/db';
import { businessDate } from '@base/shared';
import type { DbOrTx } from '../core/database';

/**
 * Sinh mã chứng từ duy nhất theo tiền tố + ngày (giờ VN): `PN-20261119-0001`.
 * Bộ đếm là 1 dòng / (tiền tố, ngày); `ON CONFLICT DO UPDATE` khoá dòng nên các giao dịch
 * đồng thời nhận số liên tiếp, không trùng (research R14). Gọi trong transaction tạo chứng từ:
 * giao dịch rollback thì số đó bị bỏ qua (chấp nhận nhảy số, không bao giờ trùng).
 */
@Injectable()
export class DocumentCodeService {
  async next(tx: DbOrTx, prefix: string, at: Date = new Date()): Promise<string> {
    const date = businessDate(at);
    const [row] = await tx
      .insert(documentSequences)
      .values({ prefix, seqDate: date, lastValue: 1 })
      .onConflictDoUpdate({
        target: [documentSequences.prefix, documentSequences.seqDate],
        set: { lastValue: sql`${documentSequences.lastValue} + 1` },
      })
      .returning({ value: documentSequences.lastValue });
    return `${prefix}-${date.replaceAll('-', '')}-${String(row!.value).padStart(4, '0')}`;
  }
}
