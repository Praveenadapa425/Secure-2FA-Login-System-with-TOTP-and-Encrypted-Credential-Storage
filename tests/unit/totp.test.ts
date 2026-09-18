import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateOtpAuthUri,
  getCurrentTimeWindow,
} from '../../src/totp/totp';

describe('RFC 6238 TOTP Engine & Base32 Implementation', () => {
  it('1. Base32 round trip encoding and decoding', () => {
    const rawBuffer = Buffer.from('Hello World 12345!', 'utf8');
    const encoded = base32Encode(rawBuffer);
    expect(encoded).toMatch(/^[A-Z2-7]+$/);

    const decoded = base32Decode(encoded);
    expect(decoded.toString('utf8')).toEqual('Hello World 12345!');
  });

  it('2. Generates a valid Base32 TOTP secret', () => {
    const secret = generateTotpSecret(20);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  it('3. Generates and verifies valid TOTP code for current window', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const now = Date.now();
    const currentWindow = getCurrentTimeWindow(now);
    const code = generateTotpCode(secret, currentWindow);

    expect(code).toMatch(/^\d{6}$/);

    const result = verifyTotpCode(secret, code, now);
    expect(result.valid).toBe(true);
    expect(result.matchedWindow).toBe(currentWindow);
  });

  it('4. Verifies TOTP code with clock drift tolerance (±1 window)', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const now = Date.now();
    const currentWindow = getCurrentTimeWindow(now);

    const prevCode = generateTotpCode(secret, currentWindow - 1);
    const nextCode = generateTotpCode(secret, currentWindow + 1);

    expect(verifyTotpCode(secret, prevCode, now).valid).toBe(true);
    expect(verifyTotpCode(secret, nextCode, now).valid).toBe(true);

    const farCode = generateTotpCode(secret, currentWindow - 2);
    expect(verifyTotpCode(secret, farCode, now).valid).toBe(false);
  });

  it('5. Generates valid OTPAuth URI format', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const uri = generateOtpAuthUri(secret, 'user@example.com', 'YourAppName');

    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=YourAppName');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});
