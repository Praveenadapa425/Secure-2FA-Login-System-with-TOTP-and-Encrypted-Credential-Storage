import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/database/pool';
import { verifyToken } from '../../src/utils/jwt';
import bcrypt from 'bcrypt';

describe('POST /api/auth/login', () => {
  let user2faDisabledEmail = 'login_no2fa@example.com';
  let user2faEnabledEmail = 'login_2fa@example.com';
  let password = 'securePassword123';

  beforeAll(async () => {
    await pool.query('DELETE FROM users');

    // Register user with 2FA disabled
    await request(app)
      .post('/api/auth/register')
      .send({ email: user2faDisabledEmail, password });

    // Register user and manually enable 2FA in DB for testing
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    await pool.query(
      `INSERT INTO users (email, password_hash, totp_enabled)
       VALUES ($1, $2, true)`,
      [user2faEnabledEmail, passwordHash]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users');
    await pool.end();
  });

  it('1. Returns full access JWT when 2FA is disabled', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user2faDisabledEmail, password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.requires_2fa).toBeUndefined();

    const decoded = verifyToken(res.body.token);
    expect(decoded.scope).toBe('full_access');
  });

  it('2. Returns challenge token when 2FA is enabled (and MUST NOT return full access token)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user2faEnabledEmail, password });

    expect(res.status).toBe(200);
    expect(res.body.requires_2fa).toBe(true);
    expect(res.body.challenge_token).toBeDefined();

    // CRITICAL SECURITY CONTRACT ASSERTION:
    // A 2FA-enabled user MUST NOT receive a full-access token property from /api/auth/login
    expect(res.body.token).toBeUndefined();

    const decoded = verifyToken(res.body.challenge_token);
    expect(decoded.scope).toBe('2fa_challenge');
  });

  it('3. Returns 401 Unauthorized for incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user2faDisabledEmail, password: 'wrongPassword123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid credentials');
  });

  it('4. Returns 401 Unauthorized for non-existent user email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid credentials');
  });
});
