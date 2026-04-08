import { parsePhoneNumber, CountryCode } from "libphonenumber-js";
import type { NormalizeResult } from "../types/index.js";

export function normalizePhone(
  rawPhone: string,
  defaultCountryCode: string
): NormalizeResult {
  const cleaned = rawPhone.toString().trim();

  if (!cleaned) {
    return { rawPhone, e164: null, chatId: null, isValid: false, error: "Empty phone number" };
  }

  try {
    const phoneNumber = parsePhoneNumber(cleaned, defaultCountryCode as CountryCode);

    if (!phoneNumber || !phoneNumber.isValid()) {
      return { rawPhone, e164: null, chatId: null, isValid: false, error: "Invalid phone number" };
    }

    const e164 = phoneNumber.format("E.164");
    // chatId: strip the leading + and append @c.us
    const chatId = e164.slice(1) + "@c.us";

    return { rawPhone, e164, chatId, isValid: true };
  } catch {
    return { rawPhone, e164: null, chatId: null, isValid: false, error: "Could not parse phone number" };
  }
}

export function normalizePhones(
  phones: { rawPhone: string; rowIndex: number }[],
  defaultCountryCode: string
): (NormalizeResult & { rowIndex: number })[] {
  return phones.map(({ rawPhone, rowIndex }) => ({
    ...normalizePhone(rawPhone, defaultCountryCode),
    rowIndex,
  }));
}
