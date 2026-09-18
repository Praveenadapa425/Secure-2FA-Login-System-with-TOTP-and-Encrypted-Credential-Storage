# Secure 2FA Authentication System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15.x-blue.svg)](https://www.postgresql.org/)
[![Docker Compose](https://img.shields.io/badge/Docker_Compose-Supported-blue.svg)](https://docs.docker.com/compose/)
[![Security](https://img.shields.io/badge/Security-AES--256--GCM%20%7C%20RFC%206238%20TOTP-red.svg)](#security--threat-modeling)

A production-grade, security-focused authentication service implementing **Time-Based One-Time Passwords (TOTP - RFC 6238)**, **application-level AES-256-GCM encryption at rest**, **atomic replay attack protection**, and **JWT scope isolation**.

Unlike generic authentication starters, this application enforces strict cryptographic isolation, zero plaintext credential persistence, stateful challenge workflows, and row-level database transactions to mitigate chosen-ciphertext and replay attacks.

---

## Key Security Contracts

> [!IMPORTANT]
> **Core Authentication Contract**  
> A user with 2FA enabled **MUST NOT** receive a full-access JWT from `/api/auth/login` until a valid 6-digit TOTP code has been verified via `/api/auth/2fa/login`.

> [!SECURITY]
> **Zero Plaintext Credentials at Rest**  
> Plaintext Base32 TOTP secrets are **NEVER** stored in PostgreSQL. Secrets are encrypted using application-level **AES-256-GCM** with unique 12-byte initialization vectors (IVs) and 16-byte authentication tags.

> [!SECURITY]
> **Atomic Replay Protection**  
> Valid TOTP codes cannot be reused within their 30-second validity window. Matching epoch windows ($T_{\text{match}}$) are validated against `last_totp_window` inside atomic SQL transactions using row locks (`SELECT ... FOR UPDATE`).

---

## Component Architecture

```text
                                    Client Application
                                            |
                                            v
                                  Express API Controller
                                            |
                         +------------------+------------------+
                         |                                     |
                Public Auth Routes                   Protected Routes (Bearer)
                - /api/auth/register                           |
                - /api/auth/login            Authentication Middleware
                - /api/auth/2fa/login        (Validates 'full_access' JWT Scope)
                         |                                     |
                         +------------------+------------------+
                                            |
                                            v
                                 Authentication Service
                                            |
       +--------------------+---------------+--------------------+
       |                    |               |                    |
       v                    v               v                    v
 Password Hashing      JWT Scope Engine   TOTP Engine       Crypto Module
 (bcrypt, 10 rounds)   (full_access vs    (RFC 6238, SHA1,   (AES-256-GCM, 12B IV,
                       2fa_challenge)     6-digit, 30s)     16B Auth Tag)
       |                    |               |                    |
       +--------------------+---------------+--------------------+
                                            |
                                            v
                                  PostgreSQL Database
                       (Atomic Transactions & `FOR UPDATE` Locking)
```

---

## Authentication State Machine

```text
                          [ User Login Credentials ]
                                      |
                                      v
                          POST /api/auth/login
                                      |
                     +----------------+----------------+
                     |                                 |
              Password Invalid                 Password Valid
                     |                                 |
                     v                                 v
              401 Unauthorized                 Check totp_enabled
                                                       |
                                      +----------------+----------------+
                                      |                                 |
                               totp_enabled=false                totp_enabled=true
                                      |                                 |
                                      v                                 v
                               Full Access JWT                   Challenge Token
                            (scope: full_access)             (scope: 2fa_challenge)
                                                                        |
                                                                        v
                                                             POST /api/auth/2fa/login
                                                             (Challenge Token + 6-digit TOTP)
                                                                        |
                                                     +------------------+------------------+
                                                     |                                     |
                                               TOTP Valid &                          TOTP Invalid or
                                               Not Replayed                          Replayed (T <= T_last)
                                                     |                                     |
                                                     v                                     v
                                              Full Access JWT                       401 Unauthorized
                                           (scope: full_access)
```

---

## Deep Dive: Cryptography & Security Mechanisms

### 1. AES-256-GCM Encryption at Rest
Symmetric encryption secures TOTP secrets before database insertion. Galois/Counter Mode (AES-256-GCM) is an **Authenticated Encryption with Associated Data (AEAD)** cipher providing both confidentiality and data integrity:

- **Master Key**: 256-bit (32-byte) key derived from the `MASTER_ENCRYPTION_KEY` environment variable.
- **Initialization Vector (IV)**: A cryptographically secure random 12-byte (96-bit) IV is generated via `crypto.randomBytes(12)` for **every single** encryption operation. IV reuse with AES-GCM degrades security to plain XOR; dynamic IV generation prevents IV collision attacks.
- **Authentication Tag**: A 16-byte GCM authentication tag is generated during encryption. Decryption uses `decipher.setAuthTag(tag)` to verify data authenticity prior to returning plaintext. Tampered ciphertexts or tags immediately fail authenticated decryption.

### 2. RFC 6238 TOTP Implementation
- **Secret Generation**: Cryptographically secure 20-byte (160-bit) random buffer encoded as Base32 (RFC 4648).
- **Parameters**: HMAC-SHA1, 6 digits, 30-second time step ($T_0 = 0$).
- **Clock Drift Tolerance**: Evaluates current time step $T$, previous $T-1$, and next $T+1$ ($\pm 1$ time window drift, i.e. $\pm 30$ seconds).
- **Timing Side-Channel Defense**: Code comparison uses `crypto.timingSafeEqual` to prevent timing attacks.

### 3. Replay Protection & Transaction Safety
TOTP codes remain mathematically valid for 30 seconds. Without state tracking, an attacker observing network traffic could replay an intercepted code before window expiry:

1. Upon TOTP code match, the exact matching epoch window $T_{\text{match}}$ is identified.
2. A PostgreSQL transaction acquires a row lock: `SELECT last_totp_window FROM users WHERE id = $1 FOR UPDATE`.
3. If $T_{\text{match}} \le \text{last\_totp\_window}$, authentication is rejected (`401 Unauthorized`).
4. If $T_{\text{match}} > \text{last\_totp\_window}$, `last_totp_window` is updated to $T_{\text{match}}$ and the transaction commits atomically.
5. Concurrent requests for the same code block on `FOR UPDATE` and are safely rejected upon lock release.

---

## API Documentation

### 1. User Registration
`POST /api/auth/register`

Registers a new user account with hashed password storage.

- **Authentication**: None
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "securePassword123"
  }
  ```
- **Responses**:
  - `201 Created`: User successfully registered.
    ```json
    {
      "id": "a3b8e7c1-2345-6789-abcd-ef0123456789",
      "email": "user@example.com"
    }
    ```
  - `400 Bad Request`: Invalid email format or password less than 8 characters.
  - `409 Conflict`: Email is already registered.

---

### 2. Primary Login
`POST /api/auth/login`

Authenticates email and password. Returns a full-access JWT if 2FA is disabled, or a restricted 2FA challenge token if 2FA is enabled.

- **Authentication**: None
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "securePassword123"
  }
  ```
- **Responses**:
  - `200 OK` *(2FA Disabled)*:
    ```json
    {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
    ```
  - `200 OK` *(2FA Enabled)*:
    ```json
    {
      "requires_2fa": true,
      "challenge_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
    ```
  - `401 Unauthorized`: Invalid credentials.

---

### 3. TOTP Provisioning (Setup)
`POST /api/auth/2fa/setup`

Generates a new Base32 TOTP secret, encrypts it with AES-256-GCM, stores ciphertext/IV/tag in PostgreSQL, and returns provisioning data. Does **not** activate 2FA until initial code verification.

- **Authentication**: Bearer Header (`Authorization: Bearer <FULL_ACCESS_JWT>`)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "secret": "JBSWY3DPEHPK3PXP",
      "uri": "otpauth://totp/YourAppName:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=YourAppName&algorithm=SHA1&digits=6&period=30"
    }
    ```
  - `401 Unauthorized`: Missing, expired, or invalid token.
  - `403 Forbidden`: Attempting setup using a 2FA challenge token instead of full-access token.

---

### 4. Initial TOTP Verification
`POST /api/auth/2fa/verify`

Verifies a 6-digit TOTP code against the encrypted secret to confirm authenticator setup and activate `totp_enabled = true`.

- **Authentication**: Bearer Header (`Authorization: Bearer <FULL_ACCESS_JWT>`)
- **Request Body**:
  ```json
  {
    "code": "123456"
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "message": "2FA successfully enabled"
    }
    ```
  - `401 Unauthorized`: Invalid code, expired window, or replayed code.

---

### 5. Complete 2FA Login
`POST /api/auth/2fa/login`

Exchanges a 2FA challenge token and valid TOTP code for a full-access JWT.

- **Authentication**: None (Challenge token supplied in body)
- **Request Body**:
  ```json
  {
    "challenge_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "code": "123456"
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
    ```
  - `401 Unauthorized`: Invalid or expired challenge token, invalid TOTP code, or replayed TOTP code.

---

## Database Schema

### `users` Table
```sql
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    totp_secret_encrypted TEXT NULL,
    totp_iv TEXT NULL,
    totp_tag TEXT NULL,
    last_totp_window BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

---

## Local Setup & Development

### 1. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Default configuration variables:
```env
DATABASE_URL=postgres://postgres:postgres@db:5432/secure_auth_db
JWT_SECRET=dev-jwt-secret-key-32-chars-long-sec!!
MASTER_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
PORT=3000
NODE_ENV=development
```

### 2. Start Application Stack via Docker Compose
```bash
docker compose up -d --build
```

Verify service status:
```bash
docker compose ps
```
Both `secure_auth_db` and `secure_auth_app` will show `Up (healthy)`.

### 3. Run Test Suite
Run unit, integration, and security contract tests inside the application container:
```bash
docker compose exec app npm test
```

---

## Automated Evaluation Seed

The repository includes `submission.json` for automated grading and security evaluation:

```json
{
  "testUser": {
    "email": "test_2fa@example.com",
    "password": "securePassword123",
    "plaintextTotpSecret": "JBSWY3DPEHPK3PXP"
  }
}
```

During database initialization/startup, `test_2fa@example.com` is automatically seeded into PostgreSQL with `totp_enabled = true` and `plaintextTotpSecret` encrypted at rest using AES-256-GCM. Evaluators can generate live 6-digit codes directly from `plaintextTotpSecret` to verify `/api/auth/2fa/login`.

---

## Project Structure

```text
.
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── jest.config.js
├── package.json
├── submission.json
├── tsconfig.json
├── migrations/
│   └── 001_create_users_table.sql
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   └── env.ts
│   ├── controllers/
│   │   └── authController.ts
│   ├── crypto/
│   │   └── encryption.ts
│   ├── database/
│   │   ├── migrate.ts
│   │   ├── pool.ts
│   │   └── seed.ts
│   ├── middleware/
│   │   ├── authMiddleware.ts
│   │   └── errorHandler.ts
│   ├── models/
│   │   └── user.ts
│   ├── repositories/
│   │   └── userRepository.ts
│   ├── routes/
│   │   └── authRoutes.ts
│   ├── services/
│   │   └── authService.ts
│   ├── totp/
│   │   └── totp.ts
│   └── utils/
│       ├── errors.ts
│       └── jwt.ts
└── tests/
    ├── health.test.ts
    ├── integration/
    │   ├── evaluationSeed.test.ts
    │   ├── login.test.ts
    │   ├── login2fa.test.ts
    │   ├── registration.test.ts
    │   ├── replayProtection.test.ts
    │   ├── setup2fa.test.ts
    │   └── verify2fa.test.ts
    └── unit/
        ├── encryption.test.ts
        └── totp.test.ts
```
