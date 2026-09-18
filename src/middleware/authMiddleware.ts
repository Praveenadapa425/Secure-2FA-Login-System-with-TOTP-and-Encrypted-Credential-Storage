import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export function authenticateFullAccess(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid Authorization header.'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token);
    if (payload.scope !== 'full_access') {
      return next(new ForbiddenError('Challenge tokens cannot be used to access protected endpoints.'));
    }

    req.user = payload;
    next();
  } catch (error) {
    return next(new UnauthorizedError('Invalid or expired authentication token.'));
  }
}
