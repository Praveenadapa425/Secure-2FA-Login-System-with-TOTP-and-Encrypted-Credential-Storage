import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(base32Str: string): Buffer {
  const cleanStr = base32Str.replace(/=+$/, '').toUpperCase().trim();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleanStr.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanStr[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleanStr[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Generates a random Base32 TOTP secret (20 bytes = 160 bits).
 */
export function generateTotpSecret(numBytes: number = 20): string {
  const randomBytes = crypto.randomBytes(numBytes);
  return base32Encode(randomBytes);
}

/**
 * Generates a 6-digit TOTP code for a given base32 secret and time window (epoch step).
 */
export function generateTotpCode(base32Secret: string, timeWindow: number): string {
  const key = base32Decode(base32Secret);

  // Pack timeWindow as an 8-byte big-endian integer
  const buffer = Buffer.alloc(8);
  // In JS, bitwise ops operate on 32-bit ints. We write the high 32 bits and low 32 bits.
  const high = Math.floor(timeWindow / 0x100000000);
  const low = timeWindow & 0xffffffff;
  buffer.writeUInt32BE(high, 0);
  buffer.writeUInt32BE(low, 4);

  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();

  // Dynamic truncation (RFC 4226 / RFC 6238)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binaryCode % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Calculates current time window for a timestamp (default: Date.now() in ms).
 */
export function getCurrentTimeWindow(timestampMs: number = Date.now(), periodSeconds: number = 30): number {
  return Math.floor(timestampMs / 1000 / periodSeconds);
}

export interface TotpVerificationResult {
  valid: boolean;
  matchedWindow: number | null;
}

/**
 * Verifies a 6-digit TOTP code against a secret for a given timestamp with clock drift tolerance (±1 window).
 */
export function verifyTotpCode(
  base32Secret: string,
  userCode: string,
  timestampMs: number = Date.now(),
  driftWindows: number = 1
): TotpVerificationResult {
  if (!userCode || !/^\d{6}$/.test(userCode.trim())) {
    return { valid: false, matchedWindow: null };
  }

  const currentWindow = getCurrentTimeWindow(timestampMs);
  const cleanCode = userCode.trim();

  for (let offset = -driftWindows; offset <= driftWindows; offset++) {
    const windowToCheck = currentWindow + offset;
    const expectedCode = generateTotpCode(base32Secret, windowToCheck);

    // Constant-time string comparison to prevent timing side channels
    const expectedBuf = Buffer.from(expectedCode, 'utf8');
    const userBuf = Buffer.from(cleanCode, 'utf8');

    if (expectedBuf.length === userBuf.length && crypto.timingSafeEqual(expectedBuf, userBuf)) {
      return {
        valid: true,
        matchedWindow: windowToCheck,
      };
    }
  }

  return { valid: false, matchedWindow: null };
}

/**
 * Generates an OTPAuth URI for authenticator QR codes.
 */
export function generateOtpAuthUri(
  base32Secret: string,
  email: string,
  appName: string = 'Secure2FASystem'
): string {
  const label = encodeURIComponent(`${appName}:${email}`);
  const issuer = encodeURIComponent(appName);
  return `otpauth://totp/${label}?secret=${base32Secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
