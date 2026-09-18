# Secure 2FA Login System with TOTP and Encrypted Credential Storage

Production-grade, security-focused authentication API built with Node.js, TypeScript, PostgreSQL, and Docker. Implements multi-stage 2FA authentication using Time-Based One-Time Passwords (TOTP - RFC 6238), application-level AES-256-GCM encryption at rest, atomic replay attack protection, and JWT scope isolation.

---

## Technical Architecture

```text
Client Application
   |
   v
API Controller / Express Router
   |
   +---> Auth Service & JWT Engine (Scope Isolation)
   |        |
   |        +---> Password Hashing (bcrypt)
   |        |
   |        +---> TOTP Verification Engine (RFC 6238, SHA1, 6 digits, 30s)
   |        |
   |        +---> Cryptography Module (AES-256-GCM)
   |                 |-- 32-byte Master Encryption Key
   |                 |-- 12-byte Cryptographic Random IV (per operation)
   |                 |-- 16-byte Authentication Tag (Integrity Verification)
   |
   v
PostgreSQL Database (Atomic Transactions & Row Locking `FOR UPDATE`)
```

---

## Authentication State Machine

The critical security contract enforced by this system is:
> A user with 2FA enabled MUST NOT receive a full-access JWT from `/api/auth/login` until a valid TOTP code has been verified via `/api/auth/2fa/login`.

```text
                      [ User Input Credentials ]
                                  |
                                  v
                      POST /api/auth/login
                                  |
                   +--------------+--------------+
                   |                             |
             Password Invalid             Password Valid
                   |                             |
                   v                             v
            401 Unauthorized             Check 2FA Status
                                                 |
                                  +--------------+--------------+
                                  |                             |
                           totp_enabled=false            totp_enabled=true
                                  |                             |
                                  v                             v
                           Full Access JWT               Challenge Token
                                                       (scope: 2fa_challenge)
                                                                |
                                                                v
                                                     POST /api/auth/2fa/login
                                                     (Challenge Token + 6-digit TOTP)
                                                                |
                                                 +--------------+--------------+
                                                 |                             |
                                           TOTP Valid &                  TOTP Invalid or
                                           Not Replayed                  Replayed (T <= T_last)
                                                 |                             |
                                                 v                             v
                                          Full Access JWT               401 Unauthorized
```

---

## Cryptography & Credential Security at Rest

### AES-256-GCM Secret Encryption
TOTP secrets are never stored in plaintext in the database. The system uses Galois/Counter Mode (AES-256-GCM), an Authenticated Encryption with Associated Data (AEAD) cipher mode:
- **Master Encryption Key**: 256-bit (32-byte) key passed via `MASTER_ENCRYPTION_KEY` environment variable.
- **Initialization Vector (IV)**: Cryptographically secure random 12-byte (96-bit) IV generated dynamically for **every** single encryption operation. IV reuse is strictly forbidden.
- **Authentication Tag**: 16-byte GCM authentication tag generated during encryption and validated via `decipher.setAuthTag()` during decryption. Any ciphertext or tag tampering causes immediate decryption failure.

---

## Replay Protection Mechanism

TOTP codes remain valid for a 30-second time window. To prevent adversary replay attacks within the validity window:
- For every successful TOTP code validation, the system identifies the exact matching epoch window $T_{\text{match}}$ (checking current window $T$, previous $T-1$, and next $T+1$ for clock-drift tolerance).
- A database transaction acquires an exclusive row lock using SQL `SELECT last_totp_window FROM users WHERE id = $1 FOR UPDATE`.
- The system checks if $T_{\text{match}} \le \text{last\_totp\_window}$.
  - If **true**: The request is rejected as a replay attempt (`401 Unauthorized`).
  - If **false**: Authentication succeeds, `last_totp_window` is updated to $T_{\text{match}}$, and the transaction commits atomically.
- This prevents race conditions and concurrent replay attempts.

---

## API Documentation

### 1. Register User
`POST /api/auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (201 Created):**
```json
{
  "id": "c1f7a012-3456-789a-bcde-f0123456789a",
  "email": "user@example.com"
}
```

---

### 2. Primary Login
`POST /api/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200 OK - 2FA Disabled):**
```json
{
  "token": "<FULL_ACCESS_JWT>"
}
```

**Response (200 OK - 2FA Enabled):**
```json
{
  "requires_2fa": true,
  "challenge_token": "<CHALLENGE_JWT>"
}
```

---

### 3. Setup 2FA Provisioning
`POST /api/auth/2fa/setup`  
*Header:* `Authorization: Bearer <FULL_ACCESS_JWT>`

**Response (200 OK):**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "uri": "otpauth://totp/YourAppName:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=YourAppName&algorithm=SHA1&digits=6&period=30"
}
```

---

### 4. Verify Initial 2FA Setup
`POST /api/auth/2fa/verify`  
*Header:* `Authorization: Bearer <FULL_ACCESS_JWT>`

**Request Body:**
```json
{
  "code": "123456"
}
```

**Response (200 OK):**
```json
{
  "message": "2FA successfully enabled"
}
```

---

### 5. Complete 2FA Login
`POST /api/auth/2fa/login`

**Request Body:**
```json
{
  "challenge_token": "<CHALLENGE_JWT>",
  "code": "123456"
}
```

**Response (200 OK):**
```json
{
  "token": "<FULL_ACCESS_JWT>"
}
```

---

## Local Setup & Container Deployment

### Prerequisites
- Docker & Docker Compose

### Step 1: Clone & Configure Environment
```bash
cp .env.example .env
```

### Step 2: Build & Start Stack
```bash
docker compose up -d --build
```

### Step 3: Run Full Automated Test Suite
```bash
docker compose exec app npm test
```

---

## Automated Evaluation Seed

The project includes a deterministic evaluation seed in `submission.json`:
```json
{
  "testUser": {
    "email": "test_2fa@example.com",
    "password": "securePassword123",
    "plaintextTotpSecret": "JBSWY3DPEHPK3PXP"
  }
}
```
During container startup, the database automatically seeds `test_2fa@example.com` with `totp_enabled = true` and the TOTP secret encrypted at rest. Automated evaluators can generate live codes from `plaintextTotpSecret` to test the 2FA login pipeline.
