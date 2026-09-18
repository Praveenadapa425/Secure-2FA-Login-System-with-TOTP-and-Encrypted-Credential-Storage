import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/database/pool';
import { generateTotpCode, getCurrentTimeWindow } from '../../src/totp/totp';
import { verifyToken } from '../../src/utils/jwt';

describe('POST /api/auth/2fa/login', () => {
  let email = 'login_2fa_full_test@example.com';
  let password = 'securePassword123';
  let plaintextSecret: string;

  beforeAll(async () => {
    await pool.query('DELETE FROM users');

    // 1. Register
    await request(app)
      .post('/api/auth/register')
      .send({ email, password });

    // 2. Initial Login (2FA disabled)
    const login1 = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    const initialFullToken = login1.body.token;

    // 3. Setup 2FA
    const setup = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${initialFullToken}`);
    plaintextSecret = setup.body.secret;

    // 4. Verify 2FA to enable it
    const code = generateTotpCode(plaintextSecret, getCurrentTimeWindow());
    await request(app)
      .post('/api/auth/2fa/verify')
      .set('Authorization', `Bearer ${initialFullToken}`)
      .send({ code });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users');
    await pool.end();
  });

  it('1. Successfully logs in with 2FA challenge token and valid TOTP code', async () => {
    // Primary login yields challenge token
    const primaryLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(primaryLogin.status).toBe(200);
    expect(primaryLogin.body.requires_2fa).toBe(true);
    const challengeToken = primaryLogin.body.challenge_token;
    expect(challengeToken).toBeDefined();

    // Use currentWindow + 1 so window is strictly greater than last_totp_window and within drift range
    const currentWindow = getCurrentTimeWindow();
    const totpCode = generateTotpCode(plaintextSecret, currentWindow + 1);

    const res = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challenge_token: challengeToken, code: totpCode });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    const decoded = verifyToken(res.body.token);
    expect(decoded.scope).toBe('full_access');
  });

  it('2. Rejects 2FA login with invalid TOTP code (401 Unauthorized)', async () => {
    const primaryLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    const challengeToken = primaryLogin.body.challenge_token;

    const res = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challenge_token: challengeToken, code: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid 2FA code');
  });

  it('3. Rejects 2FA login with invalid/malformed challenge token (401 Unauthorized)', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challenge_token: 'invalid-token-string', code: '123456' });

    expect(res.status).toBe(401);
  });
});
