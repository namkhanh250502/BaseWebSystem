import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ReportsController } from './reports.controller';
import { ReportsQueryService } from './reports-query.service';

@Module({
  imports: [InventoryModule],
  controllers: [ReportsController],
  providers: [ReportsQueryService],
  exports: [ReportsQueryService],
})
export class ReportsModule {}
