import request from 'supertest';
import app from '../../src/app';
import { seedDatabase } from '../../src/database/seed';
import { pool } from '../../src/database/pool';
import { generateTotpCode, getCurrentTimeWindow } from '../../src/totp/totp';
import { verifyToken } from '../../src/utils/jwt';
import fs from 'fs';
import path from 'path';

describe('Phase 9 — Seed and Automated Evaluation User', () => {
  let submissionData: any;

  beforeAll(async () => {
    await pool.query('DELETE FROM users');
    await seedDatabase();

    const submissionPath = path.join(__dirname, '../../submission.json');
    const raw = fs.readFileSync(submissionPath, 'utf8');
    submissionData = JSON.parse(raw);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users');
    await pool.end();
  });

  it('1. submission.json exists with valid testUser structure', () => {
    expect(submissionData).toHaveProperty('testUser');
    expect(submissionData.testUser).toHaveProperty('email', 'test_2fa@example.com');
    expect(submissionData.testUser).toHaveProperty('password', 'securePassword123');
    expect(submissionData.testUser).toHaveProperty('plaintextTotpSecret', 'JBSWY3DPEHPK3PXP');
  });

  it('2. Seeded user exists in DB with totp_enabled = true and encrypted credentials', async () => {
    const { email, plaintextTotpSecret } = submissionData.testUser;
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

    expect(res.rows).toHaveLength(1);
    const user = res.rows[0];

    expect(user.totp_enabled).toBe(true);
    expect(user.totp_secret_encrypted).toBeDefined();
    expect(user.totp_iv).toBeDefined();
    expect(user.totp_tag).toBeDefined();

    // Plaintext secret must NOT be in DB
    expect(user.totp_secret_encrypted).not.toEqual(plaintextTotpSecret);
    expect(user.totp_secret_encrypted).not.toContain(plaintextTotpSecret);
  });

  it('3. Evaluator can generate live TOTP code from plaintextTotpSecret and complete 2FA login', async () => {
    const { email, password, plaintextTotpSecret } = submissionData.testUser;

    // 1. Primary login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.requires_2fa).toBe(true);
    const challengeToken = loginRes.body.challenge_token;
    expect(challengeToken).toBeDefined();

    // 2. Generate live TOTP code using plaintextTotpSecret from submission.json
    const nextWindow = getCurrentTimeWindow() + 1;
    const liveCode = generateTotpCode(plaintextTotpSecret, nextWindow);

    // 3. Complete 2FA login
    const login2faRes = await request(app)
      .post('/api/auth/2fa/login')
      .send({ challenge_token: challengeToken, code: liveCode });

    expect(login2faRes.status).toBe(200);
    expect(login2faRes.body.token).toBeDefined();

    const decoded = verifyToken(login2faRes.body.token);
    expect(decoded.scope).toBe('full_access');
    expect(decoded.email).toBe(email.toLowerCase());
  });
});
