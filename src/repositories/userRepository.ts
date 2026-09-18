import { pool } from '../database/pool';
import { User } from '../models/user';

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const res = await pool.query<User>(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return res.rows[0] || null;
  }

  async findById(id: string): Promise<User | null> {
    const res = await pool.query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  }

  async createUser(email: string, passwordHash: string): Promise<User> {
    const res = await pool.query<User>(
      `INSERT INTO users (email, password_hash)
       VALUES (LOWER($1), $2)
       RETURNING *`,
      [email, passwordHash]
    );
    return res.rows[0];
  }
}

export const userRepository = new UserRepository();
