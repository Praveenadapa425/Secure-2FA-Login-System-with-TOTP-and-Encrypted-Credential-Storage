import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/database/pool';
import { generateTotpCode, getCurrentTimeWindow } from '../../src/totp/totp';

describe('Replay Protection Security Contract', () => {
  let email = 'replay_test_user@example.com';
  let password = 'securePassword123';
  let plaintextSecret: string;
  let userId: string;

  beforeEach(async () => {
    await pool.query('DELETE FROM users');

    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password });
    userId = regRes.body.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    const fullToken = loginRes.body.token;

    const setupRes = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${fullToken}`);
    plaintextSecret = setupRes.body.secret;

    const currentWindow = getCurrentTimeWindow();
    const setupCode = generateTotpCode(plaintextSecret, currentWindow);
    await request(app)
      .post('/api/auth/2fa/verify')
      .set('Authorization', `Bearer ${fullToken}`)
      .send({ code: setupCode });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users');
    await pool.end();
  });

  it('1. First valid code succeeds and updates last_totp_window in DB', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    const challengeToken = loginRes.body.challenge_token;

    const currentWindow = getCurrentTimeWindow();
    const nextWindow = currentWindow + 1;
    const code = generateTotpCode(plaintextSecret, nextWindow);

    const res = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challenge_token: challengeToken, code });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    // Verify DB stored exact matched window
    const dbRes = await pool.query('SELECT last_totp_window FROM users WHERE id = $1', [userId]);
    expect(parseInt(dbRes.rows[0].last_totp_window, 10)).toBe(nextWindow);
  });

  it('2. Same code immediately reused fails (Replay Protection)', async () => {
    const loginRes1 = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    const challengeToken1 = loginRes1.body.challenge_token;

    const currentWindow = getCurrentTimeWindow();
    const nextWindow = currentWindow + 1;
    const code = generateTotpCode(plaintextSecret, nextWindow);

    // First attempt succeeds
    const res1 = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challenge_token: challengeToken1, code });
    expect(res1.status).toBe(200);

    // Second attempt with SAME code fails
    const loginRes2 = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    const challengeToken2 = loginRes2.body.challenge_token;

    const res2 = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challenge_token: challengeToken2, code });

    expect(res2.status).toBe(401);
    expect(res2.body.error).toContain('already been used');
  });

  it('3. Code from an older window fails', async () => {
    const currentWindow = getCurrentTimeWindow();
    const nextWindow = currentWindow + 1;
    const codeNew = generateTotpCode(plaintextSecret, nextWindow);

    const loginRes1 = await request(app).post('/api/auth/login').send({ email, password });
    await request(app).post('/api/auth/2fa/login').send({ challenge_token: loginRes1.body.challenge_token, code: codeNew });

    // Older code (currentWindow) must fail because last_totp_window is now nextWindow
    const oldCode = generateTotpCode(plaintextSecret, currentWindow);
    const loginRes2 = await request(app).post('/api/auth/login').send({ email, password });
    const resOld = await request(app).post('/api/auth/2fa/login').send({ challenge_token: loginRes2.body.challenge_token, code: oldCode });

    expect(resOld.status).toBe(401);
    expect(resOld.body.error).toContain('already been used');
  });

  it('4. Concurrent identical requests cannot both succeed (Atomicity check)', async () => {
    const currentWindow = getCurrentTimeWindow();
    const nextWindow = currentWindow + 1;
    const code = generateTotpCode(plaintextSecret, nextWindow);

    const loginRes1 = await request(app).post('/api/auth/login').send({ email, password });
    const loginRes2 = await request(app).post('/api/auth/login').send({ email, password });

    const [resA, resB] = await Promise.all([
      request(app).post('/api/auth/2fa/login').send({ challenge_token: loginRes1.body.challenge_token, code }),
      request(app).post('/api/auth/2fa/login').send({ challenge_token: loginRes2.body.challenge_token, code }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 401]); // Exactly one 200 and one 401
  });
});
