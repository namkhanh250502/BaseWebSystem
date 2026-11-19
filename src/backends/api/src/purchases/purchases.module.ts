import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [InventoryModule, SuppliersModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
