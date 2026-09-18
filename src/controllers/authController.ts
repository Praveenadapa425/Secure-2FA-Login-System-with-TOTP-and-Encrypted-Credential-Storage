import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';

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
}

export const authController = new AuthController();
