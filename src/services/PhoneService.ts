import { parsePhoneNumber, CountryCode, getCountries } from "libphonenumber-js";
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

export function normalizePhone(
  rawPhone: string,
  defaultCountryCode: string,
  countryName?: string | null
): NormalizeResult {
  const cleaned = rawPhone.toString().trim();

  if (!cleaned) {
    return { rawPhone, e164: null, chatId: null, isValid: false, error: "Empty phone number" };
  }

  // If the number already has a + prefix, country code doesn't matter — libphonenumber will use it
  // Otherwise, try to resolve from the country name, falling back to defaultCountryCode
  const resolvedCountry = cleaned.startsWith("+")
    ? (defaultCountryCode as CountryCode)
    : (resolveCountryCode(countryName) || (defaultCountryCode as CountryCode));

  try {
    const phoneNumber = parsePhoneNumber(cleaned, resolvedCountry);

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
  defaultCountryCode: string
): (NormalizeResult & { rowIndex: number })[] {
  return phones.map(({ rawPhone, rowIndex, country }) => ({
    ...normalizePhone(rawPhone, defaultCountryCode, country),
    rowIndex,
  }));
}
