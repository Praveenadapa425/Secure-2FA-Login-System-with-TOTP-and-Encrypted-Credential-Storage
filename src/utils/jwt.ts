import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface JwtPayload {
  sub: string;
  email: string;
  scope: 'full_access' | '2fa_challenge';
  iat?: number;
  exp?: number;
}

export function signFullAccessToken(user: { id: string; email: string }): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      scope: 'full_access',
    },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
}

export function signChallengeToken(user: { id: string; email: string }): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      scope: '2fa_challenge',
    },
    config.jwtSecret,
    { expiresIn: '5m' }
  );
}

export function verifyToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    if (!decoded || !decoded.sub || !decoded.scope) {
      throw new Error('Invalid token payload structure.');
    }
    return decoded;
  } catch (err) {
    throw err;
  }
}
