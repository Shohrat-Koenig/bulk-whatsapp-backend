import { parsePhoneNumber, getCountryCallingCode, CountryCode, getCountries } from "libphonenumber-js";
import type { NormalizeResult } from "../types/index.js";

// Map country names (lowercase, normalized) to ISO 3166-1 alpha-2 codes
const COUNTRY_NAME_TO_CODE: Record<string, CountryCode> = {
  "afghanistan": "AF",
  "albania": "AL",
  "algeria": "DZ",
  "argentina": "AR",
  "australia": "AU",
  "austria": "AT",
  "bahrain": "BH",
  "bangladesh": "BD",
  "belarus": "BY",
  "belgium": "BE",
  "brazil": "BR",
  "bulgaria": "BG",
  "cambodia": "KH",
  "canada": "CA",
  "chile": "CL",
  "china": "CN",
  "colombia": "CO",
  "croatia": "HR",
  "cyprus": "CY",
  "czech republic": "CZ",
  "czechia": "CZ",
  "denmark": "DK",
  "dominican republic": "DO",
  "ecuador": "EC",
  "egypt": "EG",
  "estonia": "EE",
  "ethiopia": "ET",
  "finland": "FI",
  "france": "FR",
  "germany": "DE",
  "ghana": "GH",
  "greece": "GR",
  "hong kong": "HK",
  "hungary": "HU",
  "iceland": "IS",
  "india": "IN",
  "indonesia": "ID",
  "iran": "IR",
  "iraq": "IQ",
  "ireland": "IE",
  "israel": "IL",
  "italy": "IT",
  "japan": "JP",
  "jordan": "JO",
  "kazakhstan": "KZ",
  "kenya": "KE",
  "kuwait": "KW",
  "latvia": "LV",
  "lebanon": "LB",
  "lithuania": "LT",
  "luxembourg": "LU",
  "malaysia": "MY",
  "maldives": "MV",
  "malta": "MT",
  "mexico": "MX",
  "morocco": "MA",
  "nepal": "NP",
  "netherlands": "NL",
  "new zealand": "NZ",
  "nigeria": "NG",
  "norway": "NO",
  "oman": "OM",
  "pakistan": "PK",
  "panama": "PA",
  "peru": "PE",
  "philippines": "PH",
  "poland": "PL",
  "portugal": "PT",
  "qatar": "QA",
  "romania": "RO",
  "russia": "RU",
  "saudi arabia": "SA",
  "serbia": "RS",
  "singapore": "SG",
  "slovakia": "SK",
  "slovenia": "SI",
  "south africa": "ZA",
  "south korea": "KR",
  "korea": "KR",
  "spain": "ES",
  "sri lanka": "LK",
  "sweden": "SE",
  "switzerland": "CH",
  "taiwan": "TW",
  "tanzania": "TZ",
  "thailand": "TH",
  "tunisia": "TN",
  "turkey": "TR",
  "uae": "AE",
  "united arab emirates": "AE",
  "uganda": "UG",
  "ukraine": "UA",
  "uk": "GB",
  "united kingdom": "GB",
  "great britain": "GB",
  "england": "GB",
  "usa": "US",
  "united states": "US",
  "united states of america": "US",
  "america": "US",
  "us": "US",
  "vietnam": "VN",
  "zambia": "ZM",
  "zimbabwe": "ZW",
};

/**
 * Resolve a country name (e.g. "Nigeria", "Afghanistan", "united arab emirates")
 * to an ISO 3166-1 alpha-2 code (e.g. "NG", "AF", "AE").
 * Returns null if not found.
 */
export function resolveCountryCode(countryName: string | undefined | null): CountryCode | null {
  if (!countryName) return null;
  const normalized = countryName.toString().trim().toLowerCase();
  if (!normalized) return null;

  // Direct lookup in the map
  if (normalized in COUNTRY_NAME_TO_CODE) {
    return COUNTRY_NAME_TO_CODE[normalized];
  }

  // If the input is already a valid ISO code (e.g. "IN", "US")
  const upper = normalized.toUpperCase() as CountryCode;
  if (getCountries().includes(upper)) {
    return upper;
  }

  return null;
}

/**
 * Clean up a raw phone string before parsing:
 * - Strip whitespace, dashes, parens, dots (common formatting)
 * - Handle Excel scientific notation (e.g. "2.34907E+12" -> "2349070000000")
 * - Preserve leading + if present
 */
function cleanPhoneString(raw: string): string {
  let s = raw.toString().trim();
  if (!s) return s;

  // Excel scientific notation -> plain integer string
  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      s = n.toFixed(0);
    }
  }

  // Detect and preserve leading +
  const hasPlus = s.startsWith("+");
  // Remove everything that isn't a digit
  const digitsOnly = s.replace(/\D/g, "");
  return hasPlus ? "+" + digitsOnly : digitsOnly;
}

export function normalizePhone(
  rawPhone: string,
  defaultCountryCode?: string,
  countryName?: string | null
): NormalizeResult {
  const cleaned = cleanPhoneString(rawPhone);

  if (!cleaned) {
    return { rawPhone, e164: null, chatId: null, isValid: false, error: "Empty phone number" };
  }

  // Priority: (1) + prefix detects automatically, (2) Country column value, (3) defaultCountryCode (optional).
  // If none of these gives a country AND number lacks +, mark invalid.
  const countryFromName = resolveCountryCode(countryName);
  const fallback = defaultCountryCode ? (defaultCountryCode as CountryCode) : null;
  const resolvedCountry: CountryCode | null = cleaned.startsWith("+")
    ? (countryFromName || fallback) // Ignored by libphonenumber when + is present, but satisfies type
    : (countryFromName || fallback);

  if (!cleaned.startsWith("+") && !resolvedCountry) {
    return {
      rawPhone,
      e164: null,
      chatId: null,
      isValid: false,
      error: "Missing country — add a Country column value or use + prefix",
    };
  }

  // If the number starts with the country's calling code digits AND total length looks international,
  // prepend + so libphonenumber treats it as international rather than national.
  let toParse = cleaned;
  if (!toParse.startsWith("+") && resolvedCountry) {
    try {
      const callingCode = getCountryCallingCode(resolvedCountry);
      if (callingCode && toParse.startsWith(callingCode) && toParse.length > callingCode.length + 7) {
        const intlAttempt = parsePhoneNumber("+" + toParse);
        if (intlAttempt && intlAttempt.isValid()) {
          toParse = "+" + toParse;
        }
      }
    } catch {
      // Ignore — fall back to national parse
    }
  }

  try {
    const phoneNumber = parsePhoneNumber(toParse, resolvedCountry || undefined);

    if (!phoneNumber || !phoneNumber.isValid()) {
      return { rawPhone, e164: null, chatId: null, isValid: false, error: "Invalid phone number" };
    }

    const e164 = phoneNumber.format("E.164");
    const chatId = e164.slice(1) + "@c.us";

    return { rawPhone, e164, chatId, isValid: true };
  } catch {
    return { rawPhone, e164: null, chatId: null, isValid: false, error: "Could not parse phone number" };
  }
}

export function normalizePhones(
  phones: { rawPhone: string; rowIndex: number; country?: string | null }[],
  defaultCountryCode?: string
): (NormalizeResult & { rowIndex: number })[] {
  return phones.map(({ rawPhone, rowIndex, country }) => ({
    ...normalizePhone(rawPhone, defaultCountryCode, country),
    rowIndex,
  }));
}
