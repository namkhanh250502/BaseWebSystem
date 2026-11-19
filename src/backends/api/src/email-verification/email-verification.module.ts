import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { EmailVerificationService } from './email-verification.service';

/** Tách riêng vì cả auth (gửi mã khi đăng ký) và account (gửi lại / nhập mã) đều dùng */
@Module({
  imports: [MailModule],
  providers: [EmailVerificationService],
  exports: [EmailVerificationService],
})
export class EmailVerificationModule {}
