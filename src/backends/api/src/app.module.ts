import { Module } from '@nestjs/common';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { CoreModule } from './core/core.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ProductsModule } from './products/products.module';
import { PurchasesModule } from './purchases/purchases.module';
import { RolesModule } from './roles/roles.module';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    CoreModule,
    SettingsModule,
    AuthModule,
    AccountModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    NotificationsModule,
    DashboardModule,
    FilesModule,
    HealthModule,
    InventoryModule,
    StorageModule,
    CategoriesModule,
    ProductsModule,
    SuppliersModule,
    PurchasesModule,
  ],
})
export class AppModule {}
