import process from "node:process";
import http from "node:http";
import path from "node:path";

import rootRouter, { handler } from "./vendor/handlers";

import fxmManager from "./fxmManager";
import { useBasic } from "./fxmManager";
import { createTurnstileHandler } from "./auth/signed";
import {
  CAPTCHA_ENABLED,
  SESSION_COOKIE_NAME,
  createExpiredSessionCookie,
  getSessionWithReason,
  parseCookies,
} from "./auth/session";
import { hasInternalAuthBypass } from "./auth/internal";

import getBOCFXRatesFromBOC from "./FXGetter/boc";
// import getBOCHKFxRates from './FXGetter/bochk';
import getICBCFXRates from "./FXGetter/icbc";
import getCIBFXRates, { getCIBHuanyuFXRates } from "./FXGetter/cib";
import getCCBFXRates from "./FXGetter/ccb";
import getABCFXRates from "./FXGetter/abc";
import getBOCOMFXRates from "./FXGetter/bocom";
import getPSBCFXRates from "./FXGetter/psbc";
import getCMBFXRates from "./FXGetter/cmb";
import getPBOCFXRates from "./FXGetter/pboc";
import getUnionPayFXRates from "./FXGetter/unionpay";
// import getJCBFXRates from './FXGetter/jcb';
// import getWiseFXRates from './FXGetter/wise';
// import getHSBCHKFXRates from './FXGetter/hsbc.hk';
import getHSBCCNFXRates from "./FXGetter/hsbc.cn";
// import getHSBCAUFXRates from './FXGetter/hsbc.au';
import getCITICCNFXRates from "./FXGetter/citic.cn";
// import getSPDBFXRates from './FXGetter/spdb';
// import getNCBCNFXRates from './FXGetter/ncb.cn';
// import getNCBHKFXRates from './FXGetter/ncb.hk';
// import getXIBFXRates from './FXGetter/xib';
import getPABFXRates from "./FXGetter/pab";
// import getCEBFXRates from './FXGetter/ceb';

import mastercardFXM from "./FXGetter/mastercard";
import visaFXM from "./FXGetter/visa";
// import { RSSHandler } from './handler/rss';
const Manager = new fxmManager({
  boc: getBOCFXRatesFromBOC,
  // bochk: getBOCHKFxRates,
  icbc: getICBCFXRates,
  cib: getCIBFXRates,
  cibHuanyu: getCIBHuanyuFXRates,
  ccb: getCCBFXRates,
  abc: getABCFXRates,
  bocom: getBOCOMFXRates,
  psbc: getPSBCFXRates,
  cmb: getCMBFXRates,
  pboc: getPBOCFXRates,
  unionpay: getUnionPayFXRates,
  // jcb: getJCBFXRates,
  // 'hsbc.hk': getHSBCHKFXRates,
  "hsbc.cn": getHSBCCNFXRates,
  // 'hsbc.au': getHSBCAUFXRates,
  "citic.cn": getCITICCNFXRates,
  // 'ncb.cn': getNCBCNFXRates,
  // 'ncb.hk': getNCBHKFXRates,
  // spdb: getSPDBFXRates,
  // xib: getXIBFXRates,
  pab: getPABFXRates,
  // ceb: getCEBFXRates,
});

Manager.registerFXM("mastercard", new mastercardFXM());
Manager.registerFXM("visa", new visaFXM());

// if (process.env.ENABLE_WISE != '0') {
//     if (process.env.WISE_TOKEN == undefined) {
//         console.error('WISE_TOKEN is not set. Use Wise Token from web.');
//         process.env.WISE_USE_TOKEN_FROM_WEB = '1';
//     }
//     Manager.registerGetter(
//         'wise',
//         getWiseFXRates(
//             process.env.WISE_SANDBOX_API == '1',
//             process.env.WISE_USE_TOKEN_FROM_WEB != '0',
//             process.env.WISE_TOKEN,
//         ),
//     );
// }

export const makeInstance = async (App: rootRouter, Manager: fxmManager) => {
  App.binding(
    "/(.*)",
    new handler("ANY", [
      async (_request, response) => {
        useBasic(response);
        response.status = 404;
      },
    ]),
  );

  App.useMappingAdapter();

  App.binding(
    "/",
    App.create("ANY", async () => "200 OK\n\n/info - Instance Info\n"),
  );

  App.binding(
    "/(.*)",
    new handler("ANY", [
      async (request, response) => {
        Manager.log(`${request.ip} ${request.method} ${request.originURL}`);

        response.headers.set("Content-Type", `application/json; charset=utf-8`);
        response.headers.set("X-Powered-By", `fxrate/latest`);
        response.headers.set(
          "X-License",
          "MIT, Data copyright belongs to its source. More details at <https://github.com/realSunyz/fxrate>.",
        );
        response.headers.set("X-Frame-Options", "deny");
        response.headers.set("Referrer-Policy", "no-referrer-when-downgrade");
        response.headers.set(
          "Permissions-Policy",
          "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
        );
        response.headers.set("Cache-Control", "no-store");

        const origin = request.headers.get("Origin");
        const allowOrigin = process.env.CORS_ORIGIN || "*";
        if (allowOrigin === "*" && origin) {
          response.headers.set("Access-Control-Allow-Origin", "*");
        } else {
          response.headers.set("Access-Control-Allow-Origin", allowOrigin);
          response.headers.set("Access-Control-Allow-Credentials", "true");
          response.headers.set("Vary", "Origin");
        }
        response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if (request.method === "OPTIONS") {
          response.status = 204;
          response.body = "";
          throw response;
        }

        try {
          const custom = (request as any).custom || {};
          (request as any).custom = custom;
          const status: Record<string, any> = {};

          if (!CAPTCHA_ENABLED) {
            status.success = true;
            status.disabled = true;
            custom.captcha = status;
            custom.turnstile = status;
            response.headers.set("X-Session", "disabled");
            return;
          }

          if (hasInternalAuthBypass(request)) {
            status.success = true;
            status.internal = true;
            custom.captcha = status;
            custom.turnstile = status;
            response.headers.set("X-Auth", "internal");
            return;
          }

          const cookies = parseCookies(
            request.headers.get("Cookie") || request.headers.get("cookie"),
          );
          const { session, reason } = getSessionWithReason(cookies[SESSION_COOKIE_NAME]);
          if (session) {
            status.success = true;
            status.session = session.data;
            custom.captcha = status;
            custom.turnstile = status;
            response.headers.set("X-Session", "valid");
          } else {
            status.success = false;
            status.error = (() => {
              if (reason === "expired") return "token expired";
              if (reason === "misconfigured") return "server misconfigured";
              return "token invalid";
            })();
            if (reason) status.reason = reason;
            custom.captcha = status;
            custom.turnstile = status;
            response.headers.set(
              "X-Session",
              reason === "expired"
                ? "expired"
                : reason === "misconfigured"
                  ? "misconfigured"
                  : "missing",
            );
          }
        } catch (_e) {
          void 0;
        }
      },
    ]),
  );

  App.binding("/auth/turnstile", createTurnstileHandler());

  App.binding(
    "/auth/logout",
    new handler("POST", [
      async (_request, response) => {
        response.headers.set("Set-Cookie", createExpiredSessionCookie());
        response.status = 200;
        response.body = JSON.stringify({ success: true });
        return response;
      },
    ]),
  );

  App.use([Manager], "/(.*)");
  App.use([Manager], "/v1/(.*)");

  return App;
};

const isDirectExecution = (() => {
  const entry = process.argv[1];

  if (!entry) return false;

  const resolvedEntry = path.resolve(entry);

  return (
    resolvedEntry.endsWith(`${path.sep}src${path.sep}index.ts`) ||
    (typeof __filename !== "undefined" && resolvedEntry === __filename)
  );
})();

if (process.env.VERCEL == "1" || globalThis.esBuilt === true || isDirectExecution) {
  (async () => {
    globalThis.App = await makeInstance(new rootRouter(), Manager);

    if (process.env.VERCEL != "1") globalThis.App.listen(Number(process?.env?.PORT) || 8080);

    console.log(
      `[${new Date().toUTCString()}] Server is started at ${Number(process?.env?.PORT) || 8080} with NODE_ENV ${process.env.NODE_ENV || "development"}.`,
    );
  })();
}

export default async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const request = await globalThis.App.adapater.handleRequest(req);
  const response = await globalThis.App.adapater.router.respond(request);
  globalThis.App.adapater.handleResponse(response, res);
};

export { Manager };
