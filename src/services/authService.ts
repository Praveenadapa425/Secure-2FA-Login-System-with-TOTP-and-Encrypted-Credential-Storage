import bcrypt from 'bcrypt';
import { userRepository, UserRepository } from '../repositories/userRepository';
import { UserResponse } from '../models/user';
import { BadRequestError, ConflictError, UnauthorizedError } from '../utils/errors';
import { signFullAccessToken, signChallengeToken } from '../utils/jwt';
import { generateTotpSecret, generateOtpAuthUri } from '../totp/totp';
import { encrypt } from '../crypto/encryption';

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
}

export const authService = new AuthService();
