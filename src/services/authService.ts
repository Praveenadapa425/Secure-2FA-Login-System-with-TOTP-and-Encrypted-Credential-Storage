import bcrypt from 'bcrypt';
import { userRepository, UserRepository } from '../repositories/userRepository';
import { UserResponse } from '../models/user';
import { BadRequestError, ConflictError, UnauthorizedError } from '../utils/errors';
import { signFullAccessToken, signChallengeToken, verifyToken } from '../utils/jwt';
import { generateTotpSecret, generateOtpAuthUri, verifyTotpCode } from '../totp/totp';
import { encrypt, decrypt } from '../crypto/encryption';

export type LoginResult =
  | { token: string }
  | { requires_2fa: true; challenge_token: string };

export interface Setup2FAResponse {
  secret: string;
  uri: string;
}

export class AuthService {
  constructor(private userRepo: UserRepository = userRepository) {}

  async registerUser(email: string, password: string): Promise<UserResponse> {
    if (!email || typeof email !== 'string') {
      throw new BadRequestError('Email is required.');
    }

    if (!password || typeof password !== 'string') {
      throw new BadRequestError('Password is required.');
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      throw new BadRequestError('Invalid email format.');
    }

    if (password.length < 8) {
      throw new BadRequestError('Password must be at least 8 characters long.');
    }

    const existingUser = await this.userRepo.findByEmail(trimmedEmail);
    if (existingUser) {
      throw new ConflictError('User with this email already exists.');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await this.userRepo.createUser(trimmedEmail, passwordHash);

    return {
      id: newUser.id,
      email: newUser.email,
    };
  }

  async loginUser(email: string, password: string): Promise<LoginResult> {
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      throw new UnauthorizedError('Invalid credentials.');
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(trimmedEmail);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid credentials.');
    }

    if (user.totp_enabled) {
      const challengeToken = signChallengeToken({ id: user.id, email: user.email });
      return {
        requires_2fa: true,
        challenge_token: challengeToken,
      };
    }

    const fullAccessToken = signFullAccessToken({ id: user.id, email: user.email });
    return {
      token: fullAccessToken,
    };
  }

  async setup2FA(userId: string): Promise<Setup2FAResponse> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found.');
    }

    const base32Secret = generateTotpSecret(20);
    const uri = generateOtpAuthUri(base32Secret, user.email, 'YourAppName');

    const encrypted = encrypt(base32Secret);

    await this.userRepo.updateTotpSecret(
      user.id,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag
    );

    return {
      secret: base32Secret,
      uri,
    };
  }

  async verifyInitial2FA(userId: string, code: string): Promise<{ message: string }> {
    if (!code || typeof code !== 'string') {
      throw new BadRequestError('TOTP code is required.');
    }

    const user = await this.userRepo.findById(userId);
    if (!user || !user.totp_secret_encrypted || !user.totp_iv || !user.totp_tag) {
      throw new BadRequestError('2FA has not been provisioned for this user.');
    }

    const decryptedSecret = decrypt({
      iv: user.totp_iv,
      ciphertext: user.totp_secret_encrypted,
      authTag: user.totp_tag,
    });

    const verificationResult = verifyTotpCode(decryptedSecret, code);
    if (!verificationResult.valid || verificationResult.matchedWindow === null) {
      throw new UnauthorizedError('Invalid 2FA verification code.');
    }

    const recorded = await this.userRepo.verifyAndRecordTotpWindow(
      userId,
      verificationResult.matchedWindow,
      { enableTotpOnSuccess: true }
    );

    if (!recorded) {
      throw new UnauthorizedError('TOTP code has already been used.');
    }

    return {
      message: '2FA successfully enabled',
    };
  }

  async loginWith2FA(challengeToken: string, code: string): Promise<{ token: string }> {
    if (!challengeToken || typeof challengeToken !== 'string') {
      throw new UnauthorizedError('Challenge token is required.');
    }

    if (!code || typeof code !== 'string') {
      throw new UnauthorizedError('TOTP code is required.');
    }

    let payload;
    try {
      payload = verifyToken(challengeToken);
    } catch (err) {
      throw new UnauthorizedError('Invalid or expired challenge token.');
    }

    if (payload.scope !== '2fa_challenge') {
      throw new UnauthorizedError('Invalid challenge token scope.');
    }

    const user = await this.userRepo.findById(payload.sub);
    if (!user || !user.totp_enabled || !user.totp_secret_encrypted || !user.totp_iv || !user.totp_tag) {
      throw new UnauthorizedError('2FA is not enabled or provisioned for this user.');
    }

    const decryptedSecret = decrypt({
      iv: user.totp_iv,
      ciphertext: user.totp_secret_encrypted,
      authTag: user.totp_tag,
    });

    const verificationResult = verifyTotpCode(decryptedSecret, code);
    if (!verificationResult.valid || verificationResult.matchedWindow === null) {
      throw new UnauthorizedError('Invalid 2FA code.');
    }

    const recorded = await this.userRepo.verifyAndRecordTotpWindow(
      user.id,
      verificationResult.matchedWindow
    );

    if (!recorded) {
      throw new UnauthorizedError('TOTP code has already been used.');
    }

    const fullAccessToken = signFullAccessToken({ id: user.id, email: user.email });
    return { token: fullAccessToken };
  }
}

export const authService = new AuthService();
