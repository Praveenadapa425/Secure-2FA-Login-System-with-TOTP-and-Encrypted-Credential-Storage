import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { UnauthorizedError } from '../utils/errors';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const user = await authService.registerUser(email, password);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await authService.loginUser(email, password);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async setup2FA(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.sub) {
        throw new UnauthorizedError('Authentication required.');
      }
      const result = await authService.setup2FA(req.user.sub);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async verify2FA(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.sub) {
        throw new UnauthorizedError('Authentication required.');
      }
      const { code } = req.body;
      const result = await authService.verifyInitial2FA(req.user.sub, code);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
