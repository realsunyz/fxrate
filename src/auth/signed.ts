import axios from "axios";
import { handler } from "../vendor/handlers";
import process from "node:process";

import { CAPTCHA_ENABLED, createSession, createSessionCookie } from "./session";

type VerifyOk = { success: true; payload: any };
type VerifyErr = {
  success: false;
  status: number;
  response: { success: false; error: string; details?: any };
};
type VerifyResult = VerifyOk | VerifyErr;

type CaptchaHandlerOptions = {
  tokenKeys: string[];
  verify: (token: string, request: any) => Promise<VerifyResult>;
};

const isVerifyErr = (value: VerifyResult): value is VerifyErr => value.success !== true;

const appendTokenFallback = (keys: string[]): string[] => {
  const merged = [...keys, "token"];
  return Array.from(new Set(merged.filter(Boolean)));
};

const extractTokenFromObject = (source: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
};

const extractToken = (request: any, keys: string[]): string => {
  const tokenKeys = appendTokenFallback(keys);
  const q = request.query;
  if (q) {
    for (const key of tokenKeys) {
      const val = q.get?.(key);
      if (val) return val;
    }
  }

  if (request.body && typeof request.body === "object") {
    const direct = extractTokenFromObject(request.body as Record<string, unknown>, tokenKeys);
    if (direct) return direct;
  }

  let body = "";
  try {
    body = String(request.body || "");
  } catch (_e) {
    body = "";
  }

  if (!body) return "";

  try {
    const contentType = request.headers?.get?.("Content-Type")?.toLowerCase() || "";
    if (contentType.includes("application/json")) {
      const parsed = JSON.parse(body || "{}");
      if (parsed && typeof parsed === "object")
        return extractTokenFromObject(parsed as Record<string, unknown>, tokenKeys);
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const usp = new URLSearchParams(body);
      for (const key of tokenKeys) {
        const val = usp.get(key);
        if (val) return val;
      }
    }
  } catch (_e) {
    void 0;
  }

  return "";
};

const verifyTurnstile = async (token: string, request: any): Promise<VerifyResult> => {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) {
    return {
      success: false,
      status: 500,
      response: {
        success: false,
        error: "server_misconfigured",
        details: "missing_turnstile_secret",
      },
    };
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (request.ip) form.set("remoteip", request.ip);

  const verify = await axios
    .post("https://challenges.cloudflare.com/turnstile/v0/siteverify", form, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "fxrate/turnstile-verify",
      },
      timeout: 5000,
    })
    .then((r) => r.data)
    .catch((e) => ({
      success: false,
      error: e?.message ?? "request_error",
    }));

  if (verify?.success === true) {
    return { success: true, payload: verify };
  }

  const errCodes = (verify && verify["error-codes"]) || [];
  const isExpired = Array.isArray(errCodes)
    ? errCodes.includes("timeout-or-duplicate")
    : String(errCodes).includes("timeout-or-duplicate");

  return {
    success: false,
    status: 403,
    response: {
      success: false,
      error: isExpired ? "token expired" : "token invalid",
    },
  };
};

const createCaptchaHandler = ({ tokenKeys, verify }: CaptchaHandlerOptions) =>
  new handler("POST", [
    async (request, response) => {
      if (!CAPTCHA_ENABLED) {
        response.status = 503;
        response.body = JSON.stringify({
          success: false,
          error: "captcha_disabled",
        });
        return response;
      }

      const token = extractToken(request, tokenKeys);
      if (!token) {
        response.status = 403;
        response.body = JSON.stringify({
          success: false,
          error: "token invalid",
        });
        return response;
      }

      const result = await verify(token, request);
      if (isVerifyErr(result)) {
        response.status = result.status;
        response.body = JSON.stringify(result.response);
        return response;
      }

      let session;
      try {
        session = createSession();
      } catch (_e) {
        response.status = 500;
        response.body = JSON.stringify({
          success: false,
          error: "server_misconfigured",
          details: "missing_session_signing_secret",
        });
        return response;
      }
      response.headers.set("Set-Cookie", createSessionCookie(session.id));
      response.status = 200;
      response.body = JSON.stringify({
        success: true,
        expiresAt: new Date(session.exp).toISOString(),
      });
      return response;
    },
  ]);

const TURNSTILE_TOKEN_KEYS = ["turnstile-token"];

export const createTurnstileHandler = () =>
  createCaptchaHandler({
    tokenKeys: TURNSTILE_TOKEN_KEYS,
    verify: verifyTurnstile,
  });

export { createCaptchaHandler };
