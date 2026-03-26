// ─── Country Data ──────────────────────────────────────────

export interface Country {
  code: string;   // ISO 3166-1 alpha-2
  name: string;
  flag: string;   // Emoji flag
}

/**
 * Comprehensive list of countries for the platform.
 * Sorted alphabetically by name.
 */
export const COUNTRIES: Country[] = [
  { code: "AE", name: "United Arab Emirates", flag: "\u{1F1E6}\u{1F1EA}" },
  { code: "AR", name: "Argentina", flag: "\u{1F1E6}\u{1F1F7}" },
  { code: "AT", name: "Austria", flag: "\u{1F1E6}\u{1F1F9}" },
  { code: "AU", name: "Australia", flag: "\u{1F1E6}\u{1F1FA}" },
  { code: "BD", name: "Bangladesh", flag: "\u{1F1E7}\u{1F1E9}" },
  { code: "BE", name: "Belgium", flag: "\u{1F1E7}\u{1F1EA}" },
  { code: "BR", name: "Brazil", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "CA", name: "Canada", flag: "\u{1F1E8}\u{1F1E6}" },
  { code: "CH", name: "Switzerland", flag: "\u{1F1E8}\u{1F1ED}" },
  { code: "CL", name: "Chile", flag: "\u{1F1E8}\u{1F1F1}" },
  { code: "CN", name: "China", flag: "\u{1F1E8}\u{1F1F3}" },
  { code: "CO", name: "Colombia", flag: "\u{1F1E8}\u{1F1F4}" },
  { code: "DE", name: "Germany", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "DZ", name: "Algeria", flag: "\u{1F1E9}\u{1F1FF}" },
  { code: "EG", name: "Egypt", flag: "\u{1F1EA}\u{1F1EC}" },
  { code: "ES", name: "Spain", flag: "\u{1F1EA}\u{1F1F8}" },
  { code: "FR", name: "France", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "GB", name: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}" },
  { code: "GH", name: "Ghana", flag: "\u{1F1EC}\u{1F1ED}" },
  { code: "HK", name: "Hong Kong", flag: "\u{1F1ED}\u{1F1F0}" },
  { code: "ID", name: "Indonesia", flag: "\u{1F1EE}\u{1F1E9}" },
  { code: "IE", name: "Ireland", flag: "\u{1F1EE}\u{1F1EA}" },
  { code: "IN", name: "India", flag: "\u{1F1EE}\u{1F1F3}" },
  { code: "IQ", name: "Iraq", flag: "\u{1F1EE}\u{1F1F6}" },
  { code: "IT", name: "Italy", flag: "\u{1F1EE}\u{1F1F9}" },
  { code: "JO", name: "Jordan", flag: "\u{1F1EF}\u{1F1F4}" },
  { code: "JP", name: "Japan", flag: "\u{1F1EF}\u{1F1F5}" },
  { code: "KE", name: "Kenya", flag: "\u{1F1F0}\u{1F1EA}" },
  { code: "KR", name: "South Korea", flag: "\u{1F1F0}\u{1F1F7}" },
  { code: "KW", name: "Kuwait", flag: "\u{1F1F0}\u{1F1FC}" },
  { code: "LK", name: "Sri Lanka", flag: "\u{1F1F1}\u{1F1F0}" },
  { code: "MA", name: "Morocco", flag: "\u{1F1F2}\u{1F1E6}" },
  { code: "MX", name: "Mexico", flag: "\u{1F1F2}\u{1F1FD}" },
  { code: "MY", name: "Malaysia", flag: "\u{1F1F2}\u{1F1FE}" },
  { code: "NG", name: "Nigeria", flag: "\u{1F1F3}\u{1F1EC}" },
  { code: "NL", name: "Netherlands", flag: "\u{1F1F3}\u{1F1F1}" },
  { code: "NP", name: "Nepal", flag: "\u{1F1F3}\u{1F1F5}" },
  { code: "NZ", name: "New Zealand", flag: "\u{1F1F3}\u{1F1FF}" },
  { code: "OM", name: "Oman", flag: "\u{1F1F4}\u{1F1F2}" },
  { code: "PE", name: "Peru", flag: "\u{1F1F5}\u{1F1EA}" },
  { code: "PH", name: "Philippines", flag: "\u{1F1F5}\u{1F1ED}" },
  { code: "PK", name: "Pakistan", flag: "\u{1F1F5}\u{1F1F0}" },
  { code: "PL", name: "Poland", flag: "\u{1F1F5}\u{1F1F1}" },
  { code: "PT", name: "Portugal", flag: "\u{1F1F5}\u{1F1F9}" },
  { code: "QA", name: "Qatar", flag: "\u{1F1F6}\u{1F1E6}" },
  { code: "RU", name: "Russia", flag: "\u{1F1F7}\u{1F1FA}" },
  { code: "SA", name: "Saudi Arabia", flag: "\u{1F1F8}\u{1F1E6}" },
  { code: "SG", name: "Singapore", flag: "\u{1F1F8}\u{1F1EC}" },
  { code: "TH", name: "Thailand", flag: "\u{1F1F9}\u{1F1ED}" },
  { code: "TR", name: "Turkey", flag: "\u{1F1F9}\u{1F1F7}" },
  { code: "TW", name: "Taiwan", flag: "\u{1F1F9}\u{1F1FC}" },
  { code: "TZ", name: "Tanzania", flag: "\u{1F1F9}\u{1F1FF}" },
  { code: "US", name: "United States", flag: "\u{1F1FA}\u{1F1F8}" },
  { code: "VN", name: "Vietnam", flag: "\u{1F1FB}\u{1F1F3}" },
  { code: "ZA", name: "South Africa", flag: "\u{1F1FF}\u{1F1E6}" },
];

/** Quick lookup: code → Country object */
export const COUNTRY_MAP: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c])
);

/**
 * Mapping: generation language code → default target country codes.
 * Used to auto-populate showcase target countries when a user requests
 * their generation to be shown publicly.
 */
export const LANGUAGE_COUNTRY_MAP: Record<string, string[]> = {
  ENGLISH: ["US", "GB", "AU", "CA", "NZ", "IE", "IN", "SG", "PH", "GH", "KE", "NG", "ZA"],
  HINDI: ["IN", "NP"],
  SPANISH: ["ES", "MX", "AR", "CO", "CL", "PE"],
  FRENCH: ["FR", "BE", "CH", "CA", "MA", "DZ"],
  ARABIC: ["SA", "AE", "EG", "IQ", "JO", "KW", "QA", "OM", "MA"],
  JAPANESE: ["JP"],
  CHINESE: ["CN", "TW", "HK", "SG"],
  KOREAN: ["KR"],
  PORTUGUESE: ["BR", "PT"],
  GERMAN: ["DE", "AT", "CH"],
};

/** Get display name for a country code */
export function getCountryName(code: string): string {
  return COUNTRY_MAP[code]?.name ?? code;
}

/** Get flag emoji for a country code */
export function getCountryFlag(code: string): string {
  return COUNTRY_MAP[code]?.flag ?? "";
}

/** Get target countries for a language code */
export function getTargetCountries(languageCode: string): string[] {
  return LANGUAGE_COUNTRY_MAP[languageCode] ?? [];
}
