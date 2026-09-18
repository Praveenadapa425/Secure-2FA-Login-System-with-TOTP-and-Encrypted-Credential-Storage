import crypto from 'crypto';
import { config } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96-bit IV standard for GCM

export interface EncryptedPayload {
  iv: string;        // 12-byte IV hex encoded
  ciphertext: string; // Encrypted data hex encoded
  authTag: string;   // 16-byte auth tag hex encoded
}

function getMasterKeyBuffer(customKeyHex?: string): Buffer {
  const keyHex = customKeyHex !== undefined ? customKeyHex : config.masterEncryptionKey;
  if (!keyHex || typeof keyHex !== 'string') {
    throw new Error('MASTER_ENCRYPTION_KEY is required and must be a hex string.');
  }

  const cleanHex = keyHex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    throw new Error('MASTER_ENCRYPTION_KEY must be a 64-character hex string (32 bytes / 256 bits).');
  }

  const keyBuffer = Buffer.from(cleanHex, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('Master encryption key must be exactly 32 bytes.');
  }

  return keyBuffer;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Generates a unique 12-byte IV for every encryption.
 */
export function encrypt(plaintext: string, customKeyHex?: string): EncryptedPayload {
  if (typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a string.');
  }

  const key = getMasterKeyBuffer(customKeyHex);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return {
    iv: iv.toString('hex'),
    ciphertext,
    authTag,
  };
}

/**
 * Decrypts an EncryptedPayload using AES-256-GCM.
 * Validates the authentication tag to ensure data integrity.
 */
export function decrypt(payload: EncryptedPayload, customKeyHex?: string): string {
  if (
    !payload ||
    typeof payload.iv !== 'string' ||
    typeof payload.ciphertext !== 'string' ||
    typeof payload.authTag !== 'string'
  ) {
    throw new Error('Invalid encrypted payload format.');
  }

  const key = getMasterKeyBuffer(customKeyHex);
  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error('Invalid IV length.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
