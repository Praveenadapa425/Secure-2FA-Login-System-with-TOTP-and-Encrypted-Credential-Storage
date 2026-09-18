import { encrypt, decrypt, EncryptedPayload } from '../../src/crypto/encryption';

describe('AES-256-GCM Encryption Module', () => {
  const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const wrongKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

  it('1. Encrypt/decrypt round trip succeeds', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const encrypted = encrypt(plaintext, validKey);

    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex characters
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes = 32 hex characters
    expect(encrypted.ciphertext).not.toEqual(plaintext);

    const decrypted = decrypt(encrypted, validKey);
    expect(decrypted).toEqual(plaintext);
  });

  it('2. Multiple encryptions of same plaintext generate different IVs', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const encrypted1 = encrypt(plaintext, validKey);
    const encrypted2 = encrypt(plaintext, validKey);

    expect(encrypted1.iv).not.toEqual(encrypted2.iv);
    expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);

    // Both should still decrypt to original plaintext
    expect(decrypt(encrypted1, validKey)).toEqual(plaintext);
    expect(decrypt(encrypted2, validKey)).toEqual(plaintext);
  });

  it('3. Decrypting with wrong key fails', () => {
    const plaintext = 'SecretTOTPKey123';
    const encrypted = encrypt(plaintext, validKey);

    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it('4. Modified ciphertext fails authenticated decryption', () => {
    const plaintext = 'SecretTOTPKey123';
    const encrypted = encrypt(plaintext, validKey);

    // Flip a character in ciphertext
    const tamperedChar = encrypted.ciphertext[0] === 'a' ? 'b' : 'a';
    const tamperedPayload: EncryptedPayload = {
      ...encrypted,
      ciphertext: tamperedChar + encrypted.ciphertext.slice(1),
    };

    expect(() => decrypt(tamperedPayload, validKey)).toThrow();
  });

  it('5. Modified authentication tag fails authenticated decryption', () => {
    const plaintext = 'SecretTOTPKey123';
    const encrypted = encrypt(plaintext, validKey);

    // Flip a character in authTag
    const tamperedChar = encrypted.authTag[0] === 'a' ? 'b' : 'a';
    const tamperedPayload: EncryptedPayload = {
      ...encrypted,
      authTag: tamperedChar + encrypted.authTag.slice(1),
    };

    expect(() => decrypt(tamperedPayload, validKey)).toThrow();
  });

  it('6. Invalid key configuration fails safely', () => {
    const shortKey = '123456';
    const nonHexKey = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';

    expect(() => encrypt('test', shortKey)).toThrow('MASTER_ENCRYPTION_KEY must be a 64-character hex string');
    expect(() => encrypt('test', nonHexKey)).toThrow('MASTER_ENCRYPTION_KEY must be a 64-character hex string');
    expect(() => decrypt({ iv: '00', ciphertext: '00', authTag: '00' }, shortKey)).toThrow();
  });
});
