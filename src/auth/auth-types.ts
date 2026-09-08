export type UserRole =
  | "MEMBER"
  | "ADMIN"
  | "EXCO_MANAGEMENT";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

export interface LoginResult {
  success: boolean;
  requiresOtp: boolean;
  otpChallengeId?: string;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}
