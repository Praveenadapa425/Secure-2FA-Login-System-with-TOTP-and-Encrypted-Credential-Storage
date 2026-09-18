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

  async updateTotpSecret(
    userId: string,
    encryptedSecret: string,
    iv: string,
    tag: string
  ): Promise<void> {
    await pool.query(
      `UPDATE users
       SET totp_secret_encrypted = $1,
           totp_iv = $2,
           totp_tag = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [encryptedSecret, iv, tag, userId]
    );
  }

  async setTotpEnabled(userId: string, enabled: boolean): Promise<void> {
    await pool.query(
      `UPDATE users
       SET totp_enabled = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [enabled, userId]
    );
  }

  /**
   * Atomically checks if matchedWindow > last_totp_window and updates last_totp_window.
   * Uses FOR UPDATE row-level locking inside a database transaction to prevent concurrent replay attacks.
   */
  async verifyAndRecordTotpWindow(
    userId: string,
    matchedWindow: number,
    options?: { enableTotpOnSuccess?: boolean }
  ): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<{ last_totp_window: string | number | null; totp_enabled: boolean }>(
        'SELECT last_totp_window, totp_enabled FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (res.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      const user = res.rows[0];
      const lastWindow = user.last_totp_window !== null ? parseInt(String(user.last_totp_window), 10) : null;

      if (lastWindow !== null && matchedWindow <= lastWindow) {
        await client.query('ROLLBACK');
        return false;
      }

      if (options?.enableTotpOnSuccess) {
        await client.query(
          `UPDATE users
           SET last_totp_window = $1,
               totp_enabled = true,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [matchedWindow, userId]
        );
      } else {
        await client.query(
          `UPDATE users
           SET last_totp_window = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [matchedWindow, userId]
        );
      }

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const userRepository = new UserRepository();
