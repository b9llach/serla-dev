import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'serla_session';

// Lazy initialization of JWT secret to avoid build-time errors
let _secret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (_secret) return _secret;

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  // HS256 hash output is 256 bits = 64 hex chars. 32 chars (128 bits) is still
  // practically secure but theoretically below algorithm strength. Warn but
  // don't fail - hard-failing here logs every user out on a deploy.
  if (jwtSecret.length < 64) {
    console.warn('[serla] JWT_SECRET is shorter than 64 characters. Recommend regenerating with: openssl rand -hex 32');
  }

  _secret = new TextEncoder().encode(jwtSecret);
  return _secret;
}

// Determine if we should use secure cookies based on the app URL
function shouldUseSecureCookie(): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  return appUrl.startsWith('https://');
}

export interface SessionPayload {
  userId: string;
  email: string;
  [key: string]: unknown;
}

export async function createSession(payload: SessionPayload, options: { remember?: boolean } = {}): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(options.remember ? '30d' : '7d')
    .sign(getSecret());

  return token;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string, options: { remember?: boolean } = {}): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: options.remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7,
    path: '/',
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
