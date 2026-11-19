import { Module } from '@nestjs/common';
import { DocumentCodeService } from './document-code.service';
import { InventoryService } from './inventory.service';

/** Tồn kho: InventoryService là nơi duy nhất ghi tồn + sổ cái; DocumentCodeService sinh mã chứng từ */
@Module({
  providers: [InventoryService, DocumentCodeService],
  exports: [InventoryService, DocumentCodeService],
})
export class InventoryModule {}
