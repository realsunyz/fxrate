import axios from "axios";
import { FXRate, currency } from "src/types";
import { parseYYYYMMDDHHmmss } from "./ncb.cn";

import https from "https";
import crypto from "crypto";

export const allowPSBCCertificateforNodeJsOptions = {
  httpsAgent: new https.Agent({
    // Do not vertify PSBC SSL Certificate (They do not send full certificate chain now)
    rejectUnauthorized: false,
    // Allow sb PSBC to use legacy renegotiation
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  }),
};

const getPSBCFXRates = async () => {
  const res = await axios.get("https://s.psbc.com/portal/PsbcService/foreignexchange/curr", {
    ...allowPSBCCertificateforNodeJsOptions,
    headers: {
      "User-Agent":
        process.env["HEADER_USER_AGENT"] ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.3405.119",
    },
  });

  const data = JSON.parse(res.data.replaceAll("empty(", "").replaceAll(")", "")).resultList;

  const answer = data
    .filter((k) => k.flag == 2)
    .map((fx) => {
      return {
        currency: {
          from: fx.cur as currency.unknown,
          to: "CNY" as currency.CNY,
        },
        rate: {
          buy: {
            remit: fx.fe_buy_prc,
            cash: fx.fc_buy_prc,
          },
          sell: {
            remit: fx.fe_sell_prc,
            cash: fx.fe_sell_prc,
          },
          middle: fx.mid_prc,
        },
        unit: 100,
        updated: parseYYYYMMDDHHmmss(`${fx.effect_date}${fx.effect_time}`),
      } as FXRate;
    })
    .sort();

  return answer;
};

export default getPSBCFXRates;
