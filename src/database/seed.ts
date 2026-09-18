import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { pool } from './pool';
import { encrypt } from '../crypto/encryption';

export async function seedDatabase(): Promise<void> {
  const submissionPath = path.join(__dirname, '../../submission.json');
  if (!fs.existsSync(submissionPath)) {
    console.log('No submission.json found, skipping seeding.');
    return;
  }

  try {
    const rawData = fs.readFileSync(submissionPath, 'utf8');
    const { testUser } = JSON.parse(rawData);

    if (!testUser || !testUser.email || !testUser.password || !testUser.plaintextTotpSecret) {
      console.log('Invalid testUser format in submission.json.');
      return;
    }

    const { email, password, plaintextTotpSecret } = testUser;
    const lowerEmail = email.trim().toLowerCase();

    const passwordHash = await bcrypt.hash(password, 10);
    const encryptedSecret = encrypt(plaintextTotpSecret);

    // Upsert test user into database
    await pool.query(
      `INSERT INTO users (email, password_hash, totp_enabled, totp_secret_encrypted, totp_iv, totp_tag, last_totp_window, updated_at)
       VALUES ($1, $2, true, $3, $4, $5, NULL, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           totp_enabled = true,
           totp_secret_encrypted = EXCLUDED.totp_secret_encrypted,
           totp_iv = EXCLUDED.totp_iv,
           totp_tag = EXCLUDED.totp_tag,
           last_totp_window = NULL,
           updated_at = CURRENT_TIMESTAMP`,
      [
        lowerEmail,
        passwordHash,
        encryptedSecret.ciphertext,
        encryptedSecret.iv,
        encryptedSecret.authTag,
      ]
    );

    console.log(`Successfully seeded evaluation user: ${lowerEmail}`);
  } catch (err) {
    console.error('Failed to seed database:', err);
    throw err;
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Seeding process completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding process failed:', err);
      process.exit(1);
    });
}
