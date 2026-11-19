import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LoginHistoryModule } from '../login-history/login-history.module';
import { UsersAnalyticsService } from './users-analytics.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, LoginHistoryModule],
  controllers: [UsersController],
  providers: [UsersService, UsersAnalyticsService],
})
export class UsersModule {}
