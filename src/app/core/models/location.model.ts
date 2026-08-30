/**
 * The 26 counties of the Republic, as bare names. This is reference data the
 * whole console agrees on: the market list filters by it, the wizard's select
 * offers it, and geocoding normalises Google's "County Cork" back onto it.
 */
export const IRISH_COUNTIES: readonly string[] = [
  'Carlow',
  'Cavan',
  'Clare',
  'Cork',
  'Donegal',
  'Dublin',
  'Galway',
  'Kerry',
  'Kildare',
  'Kilkenny',
  'Laois',
  'Leitrim',
  'Limerick',
  'Longford',
  'Louth',
  'Mayo',
  'Meath',
  'Monaghan',
  'Offaly',
  'Roscommon',
  'Sligo',
  'Tipperary',
  'Waterford',
  'Westmeath',
  'Wexford',
  'Wicklow',
];

/**
 * Google returns "County Cork", "Co. Cork" or plain "Cork" depending on the
 * place; the console stores the bare name. Anything that is not one of the 26
 * — Northern Irish counties, a mis-parse — comes back null so the organiser
 * picks a county themselves rather than being given a wrong one.
 */
export function normaliseCounty(value: string | null | undefined): string | null {
  if (!value) return null;
  const bare = value.replace(/^(county|co\.?)\s+/i, '').trim();
  return IRISH_COUNTIES.find((county) => county.toLowerCase() === bare.toLowerCase()) ?? null;
}
