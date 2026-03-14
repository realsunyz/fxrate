import axios from "axios";

import { load } from "cheerio";
import { currency, FXRate } from "src/types";
import { allowLegacyRenegotiationforNodeJsOptions } from "./abc";

const getBOCOMFXRates = async (): Promise<FXRate[]> => {
  const req = await axios.get("http://www.bankcomm.com/SITE/queryExchangeResult.do", {
    ...allowLegacyRenegotiationforNodeJsOptions,
    headers: {
      "User-Agent":
        process.env["HEADER_USER_AGENT"] ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.3405.119",
    },
  });

  const data = req.data["RSP_BODY"].fileContent;
  const $ = load(
    '<table><tbody><tr class="bgcolorTable" tabindex="0">' + data + "</tr></tbody></table>",
  );
  const updatedTime = new Date($('td[align="left"]').text().split("：")[1] + " UTC+8");

  return $("tr.data")
    .toArray()
    .map((el) => {
      const result: FXRate = {
        currency: {
          from: $($(el).children()[0])
            .text()
            .split("(")[1]
            .split("/")[0] as unknown as currency.unknown,
          to: "CNY" as currency.CNY,
        },
        rate: {
          buy: {},
          sell: {},
        },
        unit: parseInt($($(el).children()[1]).text()),
        updated: updatedTime,
      };

      if ($($(el).children()[2]).text() !== "-")
        result.rate.buy.remit = parseFloat($($(el).children()[2]).text());
      if ($($(el).children()[3]).text() !== "-")
        result.rate.sell.remit = parseFloat($($(el).children()[3]).text());
      if ($($(el).children()[4]).text() !== "-")
        result.rate.buy.cash = parseFloat($($(el).children()[4]).text());
      if ($($(el).children()[5]).text() !== "-")
        result.rate.sell.cash = parseFloat($($(el).children()[5]).text());

      return result;
    })
    .sort();
};

export default getBOCOMFXRates;
