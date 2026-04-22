import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx     = host.switchToHttp();
    const res     = ctx.getResponse<Response>();
    const req     = ctx.getRequest<Request>();

    const status  = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw     = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error';

    const message = typeof raw === 'object' && raw !== null
      ? (raw as any).message ?? raw
      : raw;

    this.logger.error(
      `[${req.method}] ${req.url} → ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    res.status(status).json({
      success:    false,
      statusCode: status,
      timestamp:  new Date().toISOString(),
      path:       req.url,
      message,
    });
  }
}