import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtPayload } from '../models/ehr.model';

/**
 * Verifies and decodes a JWT token.
 * Throws JsonWebTokenError or TokenExpiredError on failure.
 * Token generation is handled exclusively by the User Service.
 */
export const verifyToken = (token: string): JwtPayload => {
    return jwt.verify(token, env.jwtSecret) as JwtPayload;
};
