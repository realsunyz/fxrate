import crypto from "node:crypto";
import process from "node:process";

type SessionData = { exp: number; data?: any };

export const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 300);
export const SESSION_COOKIE_NAME = "fxrate_session";
const TURNSTILE_SECRET = (process.env.TURNSTILE_SECRET || "").trim();
const SESSION_SIGNING_SECRET = (
  process.env.SESSION_SIGNING_SECRET ||
  TURNSTILE_SECRET ||
  ""
).trim();
export const CAPTCHA_ENABLED = Boolean(TURNSTILE_SECRET);

const base64UrlEncode = (input: string): string => Buffer.from(input, "utf8").toString("base64url");

const base64UrlDecode = (input: string): string => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(pad), "base64").toString("utf8");
};

const signValue = (value: string): string =>
  crypto.createHmac("sha256", SESSION_SIGNING_SECRET).update(value).digest("base64url");

const parseSessionToken = (token: string): SessionData | null => {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex <= 0) return null;

  const payloadPart = token.slice(0, dotIndex);
  const signaturePart = token.slice(dotIndex + 1);
  if (!payloadPart || !signaturePart) return null;

  const expectedSignature = signValue(payloadPart);
  const actual = Buffer.from(signaturePart, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payloadPart)) as SessionData;
    if (!parsed || typeof parsed !== "object" || !Number.isFinite(parsed.exp)) {
      return null;
    }
    return parsed;
  } catch (_e) {
    return null;
  }
};

const createSessionToken = (data?: any): { id: string; exp: number } => {
  if (!SESSION_SIGNING_SECRET) {
    throw new Error("missing_session_signing_secret");
  }

  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload: SessionData = { exp, data };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signaturePart = signValue(payloadPart);
  return { id: `${payloadPart}.${signaturePart}`, exp };
};

const buildCookieValue = (value: string, maxAge: number): string => {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Path=/",
  ].join("; ");
};

export const getSessionWithReason = (
  id?: string | null,
): {
  session: SessionData | null;
  reason?: "expired" | "missing" | "invalid" | "misconfigured";
} => {
  if (!id) return { session: null, reason: "missing" };
  if (!SESSION_SIGNING_SECRET) {
    return { session: null, reason: "misconfigured" };
  }
  const s = parseSessionToken(id);
  if (!s) return { session: null, reason: "invalid" };
  if (s.exp <= Date.now()) {
    return { session: null, reason: "expired" };
  }
  return { session: s };
};

export const parseCookies = (cookieHeader: string | null | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("="));
  });
  return out;
};

export const createSession = (data?: any) => {
  return createSessionToken(data);
};

export const createSessionCookie = (id: string): string =>
  buildCookieValue(id, SESSION_TTL_SECONDS);

export const createExpiredSessionCookie = (): string => buildCookieValue("", 0);
