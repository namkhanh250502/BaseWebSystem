import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EmailVerificationModule } from '../email-verification/email-verification.module';
import { LoginHistoryModule } from '../login-history/login-history.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { GoogleService } from './google.service';
import { PrincipalService } from './principal';
import { SessionService } from './session.service';
import { AuthChallengeStore } from './two-factor/auth-challenge.store';
import { EmailOtpMethod } from './two-factor/email-otp.method';
import { PasskeyMethod } from './two-factor/passkey.method';
import { ReauthGuard } from './two-factor/reauth.guard';
import { TotpMethod } from './two-factor/totp.method';
import { TwoFactorService } from './two-factor/two-factor.service';

@Module({
  imports: [MailModule, NotificationsModule, LoginHistoryModule, EmailVerificationModule],
  controllers: [AuthController],
  providers: [
    // Guard toàn cục: mọi route cần đăng nhập trừ khi có @Public()
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    PrincipalService,
    SessionService,
    TwoFactorService,
    TotpMethod,
    EmailOtpMethod,
    PasskeyMethod,
    AuthChallengeStore,
    ReauthGuard,
    CaptchaService,
    GoogleService,
  ],
  exports: [PrincipalService, SessionService, TwoFactorService, ReauthGuard],
})
export class AuthModule {}
