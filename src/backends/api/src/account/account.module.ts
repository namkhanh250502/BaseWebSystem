import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailVerificationModule } from '../email-verification/email-verification.module';
import { LoginHistoryModule } from '../login-history/login-history.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { TwoFactorController } from './two-factor.controller';

@Module({
  imports: [AuthModule, EmailVerificationModule, LoginHistoryModule, NotificationsModule],
  controllers: [AccountController, TwoFactorController],
  providers: [AccountService],
})
export class AccountModule {}
