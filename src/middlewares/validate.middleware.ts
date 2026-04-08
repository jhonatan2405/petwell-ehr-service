import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { sendError } from '../utils/response.util';

/**
 * Reads express-validator results and short-circuits the request
 * with a 422 if any validation errors exist.
 */
export const validate = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        sendError(res, 'Validation failed', 422, errors.array());
        return;
    }

    next();
};
