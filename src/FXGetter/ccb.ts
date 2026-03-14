import { XMLParser } from "fast-xml-parser";
import { FXRate, currency } from "src/types";
import axios from "axios";

const parser = new XMLParser();

// ISO 4217
const currencyMap = {
  "840": { name: "USD" as currency.USD },
  "978": { name: "EUR" as currency.EUR },
  "826": { name: "GBP" as currency.GBP },
  "392": { name: "JPY" as currency.JPY },
  "344": { name: "HKD" as currency.HKD },
  "036": { name: "AUD" as currency.AUD },
  "124": { name: "CAD" as currency.CAD },
  "756": { name: "CHF" as currency.CHF },
  "702": { name: "SGD" as currency.SGD },
  "208": { name: "DKK" as currency.DKK },
  "578": { name: "NOK" as currency.NOK },
  "752": { name: "SEK" as currency.SEK },
  "410": { name: "KRW" as currency.KRW },
  "554": { name: "NZD" as currency.NZD },
  "446": { name: "MOP" as currency.MOP },
  "710": { name: "ZAR" as currency.ZAR },
  "764": { name: "THB" as currency.THB },
  "458": { name: "MYR" as currency.MYR },
  "643": { name: "RUB" as currency.RUB },
  "398": { name: "KZT" as currency.KZT },
  "784": { name: "AED" as currency.AED },
  "682": { name: "SAR" as currency.SAR },
  "348": { name: "HUF" as currency.HUF },
  "484": { name: "MXN" as currency.MXN },
  "985": { name: "PLN" as currency.PLN },
  "949": { name: "TRY" as currency.TRY },
  "203": { name: "CZK" as currency.CZK },
  "376": { name: "ILS" as currency.ILS },
  "496": { name: "MNT" as currency.MNT },
};

const getCCBFXRates = async (): Promise<FXRate[]> => {
  const req = await axios.get("http://www.ccb.com/cn/home/news/jshckpj_new2.xml", {
    headers: {
      "User-Agent":
        process.env["HEADER_USER_AGENT"] ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.3405.119",
    },
  });

  const parsed = parser.parse(req.data);
  const settlements = parsed?.ReferencePriceSettlements?.ReferencePriceSettlement ?? [];

  const list = Array.isArray(settlements) ? settlements : [settlements];

  const toNum = (v: any) => (v === null || v === undefined || v === "" ? undefined : Number(v));

  const inv = (v: number | undefined) => (v && Number.isFinite(v) && v !== 0 ? 1 / v : undefined);

  const result: FXRate[] = [];

  for (const data of list) {
    // Offered Currency Code (Convert From)
    const ofrd = String(data?.["Ofrd_Ccy_CcyCd"] ?? "").padStart(3, "0");
    // Offer Currency Code (Convert To)
    const ofr = String(data?.["Ofr_Ccy_CcyCd"] ?? "").padStart(3, "0");

    if (ofrd !== "156" && ofr !== "156") continue;

    let fromCode3 = ofrd;
    let invert = false;

    if (ofrd === "156" && ofr !== "156") {
      // CNY -> Foreign Currency
      fromCode3 = ofr;
      invert = true;
    } else if (ofr === "156" && ofrd !== "156") {
      // Foreign Currency -> CNY
      fromCode3 = ofrd;
      invert = false;
    } else {
      continue;
    }

    const mapped = (currencyMap as any)[fromCode3];
    if (!mapped?.name) {
      console.warn("[CCB] Unknown foreign currency code:", fromCode3, "row =", data);
      continue;
    }

    const buyCash = toNum(data["BidRateOfCash"]);
    const buyRemit = toNum(data["BidRateOfCcy"]);
    const sellCash = toNum(data["OfrRateOfCash"]);
    const sellRemit = toNum(data["OfrRateOfCcy"]);
    const middle = toNum(data["Mdl_ExRt_Prc"]);

    const rate = invert
      ? {
          buy: { cash: inv(buyCash), remit: inv(buyRemit) },
          sell: { cash: inv(sellCash), remit: inv(sellRemit) },
          middle: inv(middle),
        }
      : {
          buy: { cash: buyCash, remit: buyRemit },
          sell: { cash: sellCash, remit: sellRemit },
          middle,
        };

    function bankUpdated(lstPrDt: string | number, lstPrTm: string | number): Date {
      const d = String(lstPrDt ?? "");
      const t = String(lstPrTm ?? "").padStart(6, "0");
      const iso =
        `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T` +
        `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}+08:00`;
      return new Date(iso);
    }

    result.push({
      currency: { from: mapped.name, to: "CNY" as currency.CNY },
      rate,
      unit: 1,
      updated: bankUpdated(data["LstPr_Dt"], data["LstPr_Tm"]),
    } as FXRate);
  }
  return result.sort();
};

export default getCCBFXRates;
