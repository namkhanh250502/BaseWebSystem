import { Module } from '@nestjs/common';
import { AdjustmentsService } from './adjustments.service';
import { DocumentCodeService } from './document-code.service';
import { InventoryQueryService } from './inventory-query.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * Tồn kho: InventoryService là nơi duy nhất ghi tồn + sổ cái; DocumentCodeService sinh mã chứng
 * từ; InventoryQueryService đọc tồn / sổ biến động (dùng lại cho dashboard).
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService, DocumentCodeService, InventoryQueryService, AdjustmentsService],
  exports: [InventoryService, DocumentCodeService, InventoryQueryService],
})
export class InventoryModule {}
