import axios from "axios";

import { load } from "cheerio";
import { currency, FXRate } from "src/types";
import { allowPSBCCertificateforNodeJsOptions } from "./psbc";

const getSPDBFXRates = async (): Promise<FXRate[]> => {
  const req = await axios.get("https://www.spdb.com.cn/wh_pj/index.shtml", {
    ...allowPSBCCertificateforNodeJsOptions,
    headers: {
      "User-Agent":
        process.env["HEADER_USER_AGENT"] ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.3405.119",
    },
  });

  const $ = load(req.data);

  const updatedTime = new Date($(".fine_title > p").text() + " UTC+8");

  return $(".table04 > tbody > tr")
    .toArray()
    .map((el) => {
      const toCurrency = $($(el).children()[0]).text().split(" ")[1].replace("\n", "") as currency;

      const result: FXRate = {
        currency: {
          from: toCurrency,
          to: "CNY" as currency.CNY,
        },

        rate: {
          buy: {
            cash: parseFloat($($(el).children()[3]).text()),
            remit: parseFloat($($(el).children()[2]).text()),
          },
          sell: {
            cash: parseFloat($($(el).children()[4]).text()),
            remit: parseFloat($($(el).children()[4]).text()),
          },
          middle: parseFloat($($(el).children()[1]).text()),
        },

        unit: toCurrency == "JPY" ? 100000 : 100,
        updated: updatedTime,
      };
      return result;
    })
    .sort();
};

export default getSPDBFXRates;
