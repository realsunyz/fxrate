import axios from "axios";
import cheerio from "cheerio";

import { FXRate, currency } from "src/types";
import { allowLegacyRenegotiationforNodeJsOptions } from "./abc";

export const enName: Record<string, currency> = {
  "美元(USD)": "USD" as currency.USD,
  "英镑(GBP)": "GBP" as currency.GBP,
  "港币(HKD)": "HKD" as currency.HKD,
  "瑞士法郎(CHF)": "CHF" as currency.CHF,
  瑞典克朗: "SEK" as currency.SEK,
  丹麦克朗: "DKK" as currency.DKK,
  挪威克朗: "NOK" as currency.NOK,
  "日元(JPY)": "JPY" as currency.JPY,
  "加拿大元(CAD)": "CAD" as currency.CAD,
  "澳大利亚元(AUD)": "AUD" as currency.AUD,
  "新加坡元(SGD)": "SGD" as currency.SGD,
  "欧元(EUR)": "EUR" as currency.EUR,
  "澳门元(MOP)": "MOP" as currency.MOP,
  "泰国铢(THB)": "THB" as currency.THB,
  新台币: "TWD" as currency.TWD,
  "新西兰元(NZD)": "NZD" as currency.NZD,
  韩元: "KRW" as currency.KRW,
};

const getCEBFXRates = async (): Promise<FXRate[]> => {
  const res = await axios.get("https://www.cebbank.com/eportal/ui?pageId=477257", {
    ...allowLegacyRenegotiationforNodeJsOptions,
    headers: {
      "User-Agent": process.env["HEADER_USER_AGENT"] ?? "fxrate axios/latest",
    },
  });

  const $ = cheerio.load(res.data);

  const items: FXRate[] = $(".lczj_box tbody tr")
    .map((i, e) => {
      if (i < 2) {
        return null;
      }
      const c = cheerio.load(e, { decodeEntities: false });
      return {
        currency: {
          from: enName[c("td:nth-child(1)").text()],
          to: "CNY" as currency.CNY,
        },
        rate: {
          sell: {
            remit: parseFloat(c("td:nth-child(2)").text()),
            cash: parseFloat(c("td:nth-child(3)").text()),
          },
          buy: {
            remit: parseFloat(c("td:nth-child(4)").text()),
            cash: parseFloat(c("td:nth-child(5)").text()),
          },
        },
        unit: 100,
        updated: new Date($("#t_id span").text().substring(5) + " UTC+8"),
      };
    })
    .get();

  return items.filter((i) => i !== null).sort() as FXRate[];
};

export default getCEBFXRates;
