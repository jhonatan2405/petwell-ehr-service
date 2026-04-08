import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.util';
import { env } from '../config/env';

/**
 * Global error handler – must be registered LAST among middlewares.
 * Catches any error propagated via next(err).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction,
): void => {
    console.error('[EHR ErrorHandler]', err);

    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = env.isProduction
        ? 'Internal Server Error'
        : err.message ?? 'Internal Server Error';

    sendError(res, message, statusCode);
};
