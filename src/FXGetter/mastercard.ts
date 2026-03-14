import fxManager from "../fxm/fxManager";
import syncRequest from "sync-request";
import axios from "axios";

import { LRUCache } from "lru-cache";
import { currency } from "src/types";

const cache = new LRUCache<string, string>({
  max: 500,
  ttl: 1000 * 60 * 30,
  ttlAutopurge: true,
});

const currenciesList: string[] = [
  "AFN",
  "ALL",
  "DZD",
  "AOA",
  "ARS",
  "AMD",
  "AWG",
  "AUD",
  "AZN",
  "BSD",
  "BHD",
  "BDT",
  "BBD",
  "BYN",
  "BZD",
  "BMD",
  "BTN",
  "BOB",
  "BAM",
  "BWP",
  "BRL",
  "BND",
  "BGN",
  "BIF",
  "KHR",
  "CAD",
  "CVE",
  "KYD",
  "XOF",
  "XAF",
  "XPF",
  "CLP",
  "CNY",
  "COP",
  "KMF",
  "CDF",
  "CRC",
  "CUP",
  "CZK",
  "DKK",
  "DJF",
  "DOP",
  "XCD",
  "EGP",
  "SVC",
  "ETB",
  "EUR",
  "FKP",
  "FJD",
  "GMD",
  "GEL",
  "GHS",
  "GIP",
  "GBP",
  "GTQ",
  "GNF",
  "GYD",
  "HTG",
  "HNL",
  "HKD",
  "HUF",
  "ISK",
  "INR",
  "IDR",
  "IQD",
  "ILS",
  "JMD",
  "JPY",
  "JOD",
  "KZT",
  "KES",
  "KWD",
  "KGS",
  "LAK",
  "LBP",
  "LSL",
  "LRD",
  "LYD",
  "MOP",
  "MKD",
  "MGA",
  "MWK",
  "MYR",
  "MVR",
  "MRU",
  "MUR",
  "MXN",
  "MDL",
  "MNT",
  "MAD",
  "MZN",
  "MMK",
  "NAD",
  "NPR",
  "ANG",
  "NZD",
  "NIO",
  "NGN",
  "NOK",
  "OMR",
  "PKR",
  "PAB",
  "PGK",
  "PYG",
  "PEN",
  "PHP",
  "PLN",
  "QAR",
  "RON",
  "RUB",
  "RWF",
  "SHP",
  "WST",
  "STN",
  "SAR",
  "RSD",
  "SCR",
  "SLE",
  "SGD",
  "SBD",
  "SOS",
  "ZAR",
  "KRW",
  "SSP",
  "LKR",
  "SDG",
  "SRD",
  "SZL",
  "SEK",
  "CHF",
  "TWD",
  "TJS",
  "TZS",
  "THB",
  "TOP",
  "TTD",
  "TND",
  "TRY",
  "TMT",
  "UGX",
  "UAH",
  "AED",
  "USD",
  "UYU",
  "UZS",
  "VUV",
  "VES",
  "VND",
  "YER",
  "ZMW",
  "ZWL",
];

const headers = {
  "User-Agent":
    process.env.HEADER_USER_AGENT ??
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  Referer:
    "https://developer.mastercard.com/enhanced-currency-conversion-calculator/documentation/api-reference",
};

export default class mastercardFXM extends fxManager {
  ableToGetAllFXRate: boolean = false;

  public invalidate(from?: currency, to?: currency) {
    if (!from && !to) {
      cache.clear();
      return;
    }
    const _from = from as string as string;
    const _to = to as string as string;
    cache.delete(`${_from}${_to}`);
    cache.delete(`${_to}${_from}`);
  }

  public get fxRateList() {
    const fxRateList: fxManager["_fxRateList"] = {} as any;

    currenciesList.forEach((from) => {
      const _from = from;

      fxRateList[from] = {} as any;
      currenciesList.forEach((to) => {
        const _to = to;

        const currency = new Proxy(
          {},
          {
            get: (_obj, prop) => {
              if (!["cash", "remit", "middle", "updated", "provided"].includes(prop.toString())) {
                return undefined;
              }

              if (!cache.has(`${_from}${_to}`)) {
                const request = syncRequest(
                  "GET",
                  `https://developer.mastercard.com/apigwproxy/enhanced/settlement/currencyrate/subscribed/summary-rates?rate_date=0000-00-00&trans_curr=${_from}&trans_amt=1&crdhld_bill_curr=${_to}&bank_fee_pct=&bank_fee_fixed=`,
                  {
                    headers,
                  },
                );
                cache.set(`${_from}${_to}`, request.getBody().toString());
              }

              const raw = cache.get(`${_from}${_to}`)!;
              const data = JSON.parse(raw);

              if (
                prop.toString() === "cash" ||
                prop.toString() === "remit" ||
                prop.toString() === "middle"
              ) {
                return data.data.mastercard.crdhldBillAmtExclAllFees;
              }

              if (prop.toString() === "updated") {
                return new Date(data.data.mastercard.mastercardFxRateDate);
              }

              if (prop.toString() === "provided") {
                return true;
              }

              return undefined;
            },
          },
        );
        fxRateList[from][to] = currency;
      });
    });

    return fxRateList;
  }

  public async getfxRateList(from: currency, to: currency) {
    const _from = from;
    const _to = to;

    if (!(currenciesList.includes(from as string) && currenciesList.includes(to as string))) {
      throw new Error("Currency not supported");
    }

    if (cache.has(`${_from}${_to}`)) {
      return this.fxRateList[from][to];
    }

    const req = await axios.get(
      `https://developer.mastercard.com/apigwproxy/enhanced/settlement/currencyrate/subscribed/summary-rates?rate_date=0000-00-00&trans_curr=${_from}&trans_amt=1&crdhld_bill_curr=${_to}&bank_fee_pct=&bank_fee_fixed=`,
      {
        headers,
      },
    );

    const data = req.data;
    cache.set(`${_from}${_to}`, JSON.stringify(data));

    return this.fxRateList[from][to];
  }

  constructor() {
    super([]);
  }

  public update(): void {
    throw new Error("Method is deprecated");
  }
}
