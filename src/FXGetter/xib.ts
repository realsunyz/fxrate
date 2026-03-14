import axios from "axios";

import { currency, FXRate } from "src/types";
import { parseYYYYMMDDHHmmss } from "./ncb.cn";
import { allowLegacyRenegotiationforNodeJsOptions } from "./abc";

const getXIBFXRates = async (): Promise<FXRate[]> => {
  const req = await axios.post(
    "https://ifsp.xib.com.cn/ifsptsi/api/ITSI125005",
    {
      ccyPairCode: "",
      transactionType: "0",
      header: {
        appId: "XEIP",
        locale: "zh_CN",
        termType: "",
        termNo: "",
        termMac: "",
        appVersion: "",
      },
    },
    {
      headers: {
        "User-Agent":
          process.env["HEADER_USER_AGENT"] ??
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.3405.119",
      },
      ...allowLegacyRenegotiationforNodeJsOptions,
    },
  );

  const data: {
    baseRate: number;
    cashBuyPrice: number;
    cashSellPrice: number;
    companyType: "XIB";
    currency: string;
    currencyBuyPrice: number;
    currencySellPrice: number;
    squareBuyRate: number;
    squareSellRate: number;
    term: null;
    updateDate: string;
    updateTime: string;
  }[] = req.data.rateList;

  const FXRates: FXRate[] = [];

  data.forEach((fx) => {
    FXRates.push({
      currency: {
        from: fx.currency as unknown as currency.unknown,
        to: "CNY" as currency.CNY,
      },
      rate: {
        buy: {
          remit: fx.currencyBuyPrice,
          cash: fx.cashBuyPrice,
        },
        sell: {
          remit: fx.currencySellPrice,
          cash: fx.cashSellPrice,
        },
      },
      unit: 100,
      updated: parseYYYYMMDDHHmmss(`${fx.updateDate}${fx.updateTime}`),
    });
  });

  return FXRates;
};

export default getXIBFXRates;
