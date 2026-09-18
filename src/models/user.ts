export interface User {
  id: string;
  email: string;
  password_hash: string;
  totp_enabled: boolean;
  totp_secret_encrypted: string | null;
  totp_iv: string | null;
  totp_tag: string | null;
  last_totp_window: number | string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserResponse {
  id: string;
  email: string;
}
