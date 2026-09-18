import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticateFullAccess, AuthenticatedRequest } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', (req, res, next) => authController.register(req, res, next));
router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/2fa/setup', authenticateFullAccess, (req, res, next) =>
  authController.setup2FA(req as AuthenticatedRequest, res, next)
);
router.post('/2fa/verify', authenticateFullAccess, (req, res, next) =>
  authController.verify2FA(req as AuthenticatedRequest, res, next)
);
router.post('/2fa/login', (req, res, next) => authController.login2FA(req, res, next));

export default router;
