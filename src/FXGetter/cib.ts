import axios from "axios";

import { load } from "cheerio";
import { FXRate, currency } from "src/types";
import { allowLegacyRenegotiationforNodeJsOptions } from "./abc";

import { round, fraction, divide, subtract, add, max, min, Fraction } from "mathjs";

const getCIBFXRates = async (): Promise<FXRate[]> => {
  const resHTML = await axios.get(
    "https://personalbank.cib.com.cn/pers/main/pubinfo/ifxQuotationQuery.do",
    {
      ...allowLegacyRenegotiationforNodeJsOptions,
      headers: {
        "User-Agent":
          process.env["HEADER_USER_AGENT"] ??
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.3405.119",
      },
    },
  );

  const res = await axios.get(
    `https://personalbank.cib.com.cn/pers/main/pubinfo/ifxQuotationQuery/list?_search=false&dataSet.nd=${Date.now()}&dataSet.rows=80&dataSet.page=1&dataSet.sidx=&dataSet.sord=asc`,
    {
      ...allowLegacyRenegotiationforNodeJsOptions,
      headers: {
        "User-Agent": process.env["HEADER_USER_AGENT"] ?? "fxrate axios/latest",
        Cookie: resHTML.headers["set-cookie"].map((cookie) => cookie.split(";")[0]).join("; "),
      },
    },
  );

  const FXRates: FXRate[] = [];

  if (res.status != 200 || resHTML.status != 200) throw new Error(`Get CIB FX Rates failed.`);

  const $ = load(resHTML.data);

  const updateTime = new Date(
    $($(".labe_text")[0])
      .text()
      .replaceAll("\n\t", "")
      .replaceAll("  ", "")
      .replaceAll("日期： ", "")
      .replaceAll("年", "-")
      .replaceAll("月", "-")
      .replaceAll("日", "")
      .split(" ")
      .filter((_, i) => i != 1)
      .join(" ") + " UTC+8",
  );

  res.data.rows.forEach((row) => {
    row = row.cell;
    const FXRate = {
      currency: {
        from: row[1] as currency.unknown,
        to: "CNY" as currency.CNY,
      },
      unit: parseFloat(row[2]) as number,
      updated: updateTime,
      rate: {
        buy: {
          remit: parseFloat(row[3]) as number,
          cash: parseFloat(row[5]) as number,
        },
        sell: {
          remit: parseFloat(row[4]) as number,
          cash: parseFloat(row[6]) as number,
        },
        middle: undefined as number,
      },
    };
    FXRate.rate.middle =
      (FXRate.rate.buy.remit +
        FXRate.rate.sell.remit +
        FXRate.rate.buy.cash +
        FXRate.rate.sell.cash) /
      4;
    FXRates.push(FXRate);
  });

  return FXRates;
};

function promotePrice(a: number, b: number) {
  const mid = divide(add(fraction(a), fraction(b)), 2);
  const diff = subtract(fraction(a), mid);
  return round(subtract(a, divide(diff, 2)) as Fraction, 2);
}

const getCIBHuanyuFXRates = async (): Promise<FXRate[]> => {
  const origin = await getCIBFXRates();
  return origin
    .map((rate) => {
      const originRate = JSON.parse(JSON.stringify(rate.rate));
      rate.rate.buy.remit = promotePrice(
        originRate.buy.remit as number,
        originRate.sell.remit as number,
      );
      rate.rate.sell.remit = promotePrice(
        originRate.sell.remit as number,
        originRate.buy.remit as number,
      );
      // Free cash to remit conversion
      rate.rate.buy.cash = max(originRate.buy.cash as number, rate.rate.buy.remit) as number;
      // Use Huanyu rate to buy remit online
      rate.rate.sell.cash = min(originRate.sell.cash as number, rate.rate.sell.remit) as number;

      rate.rate.middle = divide(
        add(rate.rate.buy.remit, rate.rate.sell.remit, rate.rate.buy.cash, rate.rate.sell.cash),
        4,
      ) as number;

      return rate;
    })
    .sort();
};

export default getCIBFXRates;
export { getCIBHuanyuFXRates };
