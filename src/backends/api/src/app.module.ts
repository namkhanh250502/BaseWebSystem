import { Module } from '@nestjs/common';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core/core.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { SettingsModule } from './settings/settings.module';
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
  ],
})
export class AppModule {}
