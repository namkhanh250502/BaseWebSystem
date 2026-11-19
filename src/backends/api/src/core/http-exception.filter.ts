import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  AppError,
  badRequest,
  errorBody,
  forbidden,
  notFound,
  payloadTooLarge,
  resolveLocale,
  unauthorized,
} from '@base/server-kit';
import { t } from '../i18n';
import { toRequestLike } from './request-context';

/** Lỗi của Nest / body-parser / multer → AppError để trả về cùng định dạng { data, error } */
function toAppError(exception: unknown): unknown {
  if (exception instanceof AppError) return exception;

  // Lỗi của body-parser (http-errors): JSON sai cú pháp, body quá lớn
  const type = (exception as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') return badRequest('errors.invalidJson');
  if (type === 'entity.too.large') return payloadTooLarge();

  if (exception instanceof HttpException) {
    switch (exception.getStatus()) {
      case 400:
        return badRequest();
      case 401:
        return unauthorized();
      case 403:
        return forbidden();
      case 404:
        return notFound();
      case 413:
        return payloadTooLarge();
    }
  }
  return exception;
}

function send(req: Request, res: Response, exception: unknown) {
  const locale = resolveLocale(toRequestLike(req));
  const { status, body } = errorBody(toAppError(exception), t, locale);
  res.status(status).json(body);
}

/** Bắt mọi lỗi trong controller / guard / pipe, dịch thông báo theo ngôn ngữ của request */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    if (res.headersSent) return;
    send(ctx.getRequest<Request>(), res, exception);
  }
}

/** Middleware lỗi của Express, đặt ngay sau body-parser (lỗi ở tầng này chưa vào tới Nest) */
export function bodyParserErrorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) return next(error);
  send(req, res, error);
}
