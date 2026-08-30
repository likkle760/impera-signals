// Shared portal types. Kept separate so both the store and its persistence
// backend can import them without a circular dependency.

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  licenseKey: string;
  deviceFingerprint: string;
  createdAt: string;
  lastLoginAt: string | null;
  revoked: boolean;
  passwordHash: string;
}

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  licenseKey: string;
  deviceFingerprint: string;
  createdAt: string;
  lastLoginAt: string | null;
  revoked: boolean;
}

export interface LicenseKey {
  key: string;
  status: "available" | "active" | "revoked";
  assignedEmail: string | null;
  deviceFingerprint: string | null;
  activatedAt: string | null;
  createdAt: string;
}

export interface PortalSession {
  token: string;
  userId: string;
  email: string;
  role: "admin" | "user";
  expiresAt: string;
}

export interface PortalData {
  version: number;
  users: StoredUser[];
  licenses: LicenseKey[];
  sessions: PortalSession[];
}
