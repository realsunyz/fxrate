import crypto from 'node:crypto';
import process from 'node:process';

import { handler } from 'handlers.js';

import {
    createSession,
    createSessionCookie,
} from './session';

const ENV_KEY_LIST = process.env.AUTH_SIGNED_RS256_KEYS;
const ENV_SINGLE_KEY = process.env.AUTH_SIGNED_RS256_KEY;
const MAX_SKEW_SECONDS = Number(process.env.AUTH_SIGNED_MAX_SKEW ?? 300);
const MAX_TOKEN_TTL = Number(process.env.AUTH_SIGNED_MAX_TTL ?? 600);

type KeyEntry = { kid: string; pem: string };

type VerifyError = {
    status: number;
    error: string;
    details?: Record<string, unknown>;
};

const decodeKeyMaterial = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.includes('BEGIN PUBLIC KEY')) {
        return trimmed.replace(/\\n/g, '\n');
    }
    try {
        return Buffer.from(trimmed, 'base64').toString('utf8');
    } catch (_e) {
        return trimmed;
    }
};

const parseKeyList = (): KeyEntry[] => {
    const entries: KeyEntry[] = [];
    const source = ENV_KEY_LIST ?? ENV_SINGLE_KEY;
    if (!source) return entries;

    const segments = source
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    segments.forEach((segment, idx) => {
        const colonIndex = segment.indexOf(':');
        let kid: string;
        let encoded: string;
        if (colonIndex === -1) {
            kid = `default_${idx}`;
            encoded = segment;
        } else {
            kid = segment.slice(0, colonIndex).trim();
            encoded = segment.slice(colonIndex + 1).trim();
        }
        if (!kid || !encoded) return;
        const pem = decodeKeyMaterial(encoded);
        if (!pem.includes('BEGIN')) return;
        entries.push({ kid, pem });
    });

    return entries;
};

const PUBLIC_KEYS = parseKeyList();

const findKey = (kid?: string | null): KeyEntry | undefined => {
    if (kid) {
        return PUBLIC_KEYS.find((entry) => entry.kid === kid);
    }
    if (PUBLIC_KEYS.length === 1) {
        return PUBLIC_KEYS[0];
    }
    return undefined;
};

const base64UrlDecode = (input: string): Buffer => {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (normalized.length % 4)) % 4;
    return Buffer.from(normalized + '='.repeat(pad), 'base64');
};

const parseJSON = (
    input: Buffer,
    err: VerifyError,
): Record<string, unknown> => {
    try {
        return JSON.parse(input.toString('utf8')) as Record<string, unknown>;
    } catch (_e) {
        throw err;
    }
};

const verifyToken = (
    token: string,
): { payload: Record<string, unknown> } | VerifyError => {
    if (PUBLIC_KEYS.length === 0) {
        return { status: 503, error: 'signed_disabled' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
        return { status: 400, error: 'token_malformed' };
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    let header: Record<string, unknown>;
    try {
        header = parseJSON(base64UrlDecode(headerPart), {
            status: 400,
            error: 'header_invalid',
        });
    } catch (err: any) {
        return err;
    }

    if (header['alg'] !== 'RS256') {
        return { status: 400, error: 'unsupported_algorithm' };
    }

    const kid = typeof header['kid'] === 'string' ? header['kid'] : undefined;
    const keyEntry = findKey(kid);
    if (!keyEntry) {
        return { status: 403, error: 'unknown_kid' };
    }

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerPart}.${payloadPart}`);
    verifier.end();
    const signature = base64UrlDecode(signaturePart);
    const valid = verifier.verify(keyEntry.pem, signature);
    if (!valid) {
        return { status: 401, error: 'invalid_signature' };
    }

    let payload: Record<string, unknown>;
    try {
        payload = parseJSON(base64UrlDecode(payloadPart), {
            status: 400,
            error: 'payload_invalid',
        });
    } catch (err: any) {
        return err;
    }

    const exp = payload['exp'];
    const iat = payload['iat'];
    const expNum = Number(exp);
    const iatNum = Number(iat);
    const now = Math.floor(Date.now() / 1000);

    if (!Number.isFinite(expNum) || !Number.isFinite(iatNum)) {
        return { status: 400, error: 'timestamp_invalid' };
    }

    if (iatNum > now + MAX_SKEW_SECONDS) {
        return { status: 403, error: 'iat_in_future' };
    }

    if (expNum < now - MAX_SKEW_SECONDS) {
        return { status: 403, error: 'token_expired' };
    }

    if (expNum - iatNum > MAX_TOKEN_TTL) {
        return { status: 403, error: 'token_too_long' };
    }

    return { payload };
};

const isVerifyError = (
    value: VerifyError | { payload: Record<string, unknown> },
): value is VerifyError => (value as VerifyError)?.error !== undefined;

const extractToken = (request: any): string => {
    const q = request.query;
    if (q) {
        const fromQuery = q.get?.('token');
        if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
    }

    const body = request.body;
    if (body && typeof body === 'object') {
        const direct = (body as Record<string, unknown>)['token'];
        if (typeof direct === 'string' && direct) return direct;
    }

    let raw = '';
    try {
        raw = String(body || '');
    } catch (_e) {
        raw = '';
    }

    if (!raw) return '';

    const contentType =
        request.headers?.get?.('Content-Type')?.toLowerCase() || '';
    if (contentType.includes('application/json')) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const value = (parsed as Record<string, unknown>)['token'];
                if (typeof value === 'string' && value) return value;
            }
        } catch (_e) {
            void 0;
        }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const usp = new URLSearchParams(raw);
        const value = usp.get('token');
        if (typeof value === 'string' && value) return value;
    }

    return '';
};

const toSessionData = (payload: Record<string, unknown>) => {
    const data: Record<string, unknown> = {};

    if (typeof payload['sub'] === 'string') data.sub = payload['sub'];
    if (typeof payload['iss'] === 'string') data.iss = payload['iss'];
    if (typeof payload['aud'] === 'string' || Array.isArray(payload['aud'])) {
        data.aud = payload['aud'];
    }

    return data;
};

const createSignedApiHandler = () =>
    new handler('POST', [
        async (request, response) => {
            response.headers.set('X-Auth-Source', 'api-signed');

            const token = extractToken(request);
            if (!token) {
                response.status = 400;
                response.body = JSON.stringify({
                    success: false,
                    error: 'token_missing',
                });
                return response;
            }

            const result = verifyToken(token);
            if (isVerifyError(result)) {
                response.status = result.status;
                response.body = JSON.stringify({
                    success: false,
                    error: result.error,
                    ...(result.details ? { details: result.details } : {}),
                });
                return response;
            }

            let session;
            try {
                session = createSession(toSessionData(result.payload));
            } catch (_e) {
                response.status = 500;
                response.body = JSON.stringify({
                    success: false,
                    error: 'server_misconfigured',
                    details: 'missing_session_signing_secret',
                });
                return response;
            }
            response.headers.set('Set-Cookie', createSessionCookie(session.id));
            response.status = 200;
            response.body = JSON.stringify({
                success: true,
                expiresAt: new Date(session.exp).toISOString(),
            });
            return response;
        },
    ]);

export default createSignedApiHandler;
