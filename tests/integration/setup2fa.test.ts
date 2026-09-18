import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/database/pool';
import { signChallengeToken } from '../../src/utils/jwt';

describe('POST /api/auth/2fa/setup', () => {
  let email = 'totp_setup_user@example.com';
  let password = 'securePassword123';
  let fullAccessToken: string;
  let userId: string;

  beforeAll(async () => {
    await pool.query('DELETE FROM users');

    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password });
    userId = regRes.body.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    fullAccessToken = loginRes.body.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users');
    await pool.end();
  });

  it('1. Rejects unauthenticated setup request (401 Unauthorized)', async () => {
    const res = await request(app).post('/api/auth/2fa/setup');
    expect(res.status).toBe(401);
  });

  it('2. Rejects challenge token for setup request (403 Forbidden)', async () => {
    const challengeToken = signChallengeToken({ id: userId, email });
    const res = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${challengeToken}`);
    expect(res.status).toBe(403);
  });

  it('3. Successfully provisions 2FA for authenticated user', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${fullAccessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('secret');
    expect(res.body).toHaveProperty('uri');

    // Secret must be valid Base32
    expect(res.body.secret).toMatch(/^[A-Z2-7]+$/);

    // URI format check
    expect(res.body.uri).toContain('otpauth://totp/');
    expect(res.body.uri).toContain(`secret=${res.body.secret}`);

    // Verify DB state
    const dbRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = dbRes.rows[0];

    expect(user.totp_enabled).toBe(false);
    expect(user.totp_secret_encrypted).toBeDefined();
    expect(user.totp_iv).toBeDefined();
    expect(user.totp_tag).toBeDefined();

    // Plaintext secret must NOT equal ciphertext or be contained in ciphertext
    expect(user.totp_secret_encrypted).not.toEqual(res.body.secret);
    expect(user.totp_secret_encrypted).not.toContain(res.body.secret);
  });

  it('4. Repeated setup generates a different IV and secret', async () => {
    const dbRes1 = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const oldIv = dbRes1.rows[0].totp_iv;
    const oldEncrypted = dbRes1.rows[0].totp_secret_encrypted;

    const res2 = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${fullAccessToken}`);

    expect(res2.status).toBe(200);

    const dbRes2 = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const newIv = dbRes2.rows[0].totp_iv;
    const newEncrypted = dbRes2.rows[0].totp_secret_encrypted;

    expect(newIv).not.toEqual(oldIv);
    expect(newEncrypted).not.toEqual(oldEncrypted);
    expect(dbRes2.rows[0].totp_enabled).toBe(false);
  });
});
