import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/database/pool';
import { generateTotpCode, getCurrentTimeWindow } from '../../src/totp/totp';

describe('POST /api/auth/2fa/verify', () => {
  let email = 'verify_2fa_user@example.com';
  let password = 'securePassword123';
  let fullAccessToken: string;
  let userId: string;
  let plaintextSecret: string;

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

    // Call /2fa/setup to get the provisioned secret
    const setupRes = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${fullAccessToken}`);
    plaintextSecret = setupRes.body.secret;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users');
    await pool.end();
  });

  it('1. Rejects verification without authentication (401 Unauthorized)', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ code: '123456' });
    expect(res.status).toBe(401);
  });

  it('2. Rejects invalid TOTP code and does NOT enable 2FA', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .set('Authorization', `Bearer ${fullAccessToken}`)
      .send({ code: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid 2FA verification code');

    const dbRes = await pool.query('SELECT totp_enabled FROM users WHERE id = $1', [userId]);
    expect(dbRes.rows[0].totp_enabled).toBe(false);
  });

  it('3. Successfully verifies valid TOTP code and enables 2FA', async () => {
    const currentWindow = getCurrentTimeWindow();
    const validCode = generateTotpCode(plaintextSecret, currentWindow);

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .set('Authorization', `Bearer ${fullAccessToken}`)
      .send({ code: validCode });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('2FA successfully enabled');

    // Verify database flag totp_enabled is now true
    const dbRes = await pool.query('SELECT totp_enabled FROM users WHERE id = $1', [userId]);
    expect(dbRes.rows[0].totp_enabled).toBe(true);
  });
});
