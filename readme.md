# fxRate

A TypeScript service that aggregates foreign-exchange rates from Chinese banks and card networks.

> [!NOTE]
> This project is based on [186526/fxrate](https://github.com/186526/fxrate) with several enhancements.

## Features

- Aggregates buy, sell, and mid rates from major Chinese banks and card networks.
- Flexible query parameters for amount conversion, reverse lookup, precision control, and fee adjustments.
- Built-in RS256 Signature, Cloudflare Turnstile validation, and session management to protect public deployments.
- Compatible with Docker and serverless platforms (e.g. Vercel).

## Quick Start

### Prerequisites

- Node.js 24 or later
- pnpm

### Local Development

```bash
pnpm install
pnpm dev
```

### Docker

```bash
docker pull sjc.vultrcr.com/seven/fxrate:latest
```

## Configuration

> [!IMPORTANT]
> Always deploy behind HTTPS and enable captcha in production to prevent potential attacks and unauthorized queries.

| Variable                 | Default            | Description                              |
| ------------------------ | ------------------ | ---------------------------------------- |
| `PORT`                   | `8080`             | Listening Port                           |
| `TURNSTILE_SECRET`       | —                  | Turnstile Site Secret                    |
| `SESSION_SIGNING_SECRET` | `TURNSTILE_SECRET` | HMAC Secret for Stateless Session Cookie |
| `SESSION_TTL_SECONDS`    | `300`              | Session Lifetime (seconds)               |
| `CORS_ORIGIN`            | `*`                | Allowed CORS Origin                      |

- Turnstile protection is enabled automatically when `TURNSTILE_SECRET` is set; leaving it empty disables captcha checks.
- Session cookies are stateless and HMAC-signed, so the server does not keep session state in memory. Set `SESSION_SIGNING_SECRET` explicitly if you do not want to reuse `TURNSTILE_SECRET`.

## Usage

This project supports RESTful API.

### Public Endpoints

- `GET (/v1)/info` - show instance's details.

This endpoint is always publicly accessible and does not require authentication, even if Turnstile validation is enabled.

```typescript
interface InfoResponse {
  apiVersion: "v1";
  environment: "production" | "development";
  sources: string[];
  status: "ok";
  version: string;
}
```

- `GET (/v1)/:source/:from/:to` - show currency's FX rates to a specific currency in source's db.

```typescript
interface FXRate {
  cash: string | false;
  remit: string | false;
  middle: string | false;
  provided: boolean;
  updated: UTCString;
  error: string;
  success: boolean;
}
```

- `GET (/v1)/:source/:from` - show currency's FX rates to all other currencies in source's db.

```typescript
interface FXRateList {
  [currencyCode: string]: FXRate | string | boolean;
  error: string;
  success: boolean;
}
```

Optional query parameters:

- `amount` (number): Convert a specific amount (defaults to 100).
- `reverse` (boolean): Interpret the query as "how much of `:from` is required to obtain the amount of `:to`."
- `precision` (number): Control decimal places (defaults to `2` if unset); use `-1` to return recurring decimals.
- `fees` (number): Apply a percentage handling fee for card transactions.

### Authentication Endpoints

- `POST /auth/turnstile` - Verify a Turnstile token and issue a session cookie.

Query parameter: `turnstile-token` or `token` (equivalent).

```bash
POST /auth/turnstile HTTP/1.1
Host: api.example.com
Content-Type: application/json

{
  "turnstile-token": "xxxx-xxxx-xxxx"
}
```

- `POST /v1/auth/logout` - Clear the current session.

Send an empty POST request to clear the cookie. The request body will be ignored.

## Contributing

Issues and Pull Requests are definitely welcome!

Please make sure you have tested your code locally before submitting a PR.

## License

Source code is released under the MIT License ([LICENSE.MIT](https://github.com/realSunyz/fxrate/blob/main/LICENSE.MIT)).

Currency data remains the property of its original providers ([LICENSE.DATA](https://github.com/realSunyz/fxrate/blob/main/LICENSE.DATA)).
