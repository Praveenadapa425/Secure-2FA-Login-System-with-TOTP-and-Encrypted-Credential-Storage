import bcrypt from 'bcrypt';
import { userRepository, UserRepository } from '../repositories/userRepository';
import { UserResponse } from '../models/user';
import { BadRequestError, ConflictError } from '../utils/errors';

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
}

export const authService = new AuthService();
