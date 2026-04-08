import { Response } from 'express';

export interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data?: T;
    errors?: unknown;
}

/**
 * Sends a successful JSON response.
 */
export const sendSuccess = <T>(
    res: Response,
    data: T,
    message = 'OK',
    statusCode = 200,
): void => {
    const body: ApiResponse<T> = { success: true, message, data };
    res.status(statusCode).json(body);
};

/**
 * Sends an error JSON response.
 */
export const sendError = (
    res: Response,
    message: string,
    statusCode = 500,
    errors?: unknown,
): void => {
    const body: ApiResponse = { success: false, message, errors };
    res.status(statusCode).json(body);
};
