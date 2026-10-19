/**
 * One row of a search-as-you-type picker — a vendor, an event, a product.
 * Enough to choose from, and nothing a form would store beyond the id.
 */
export interface PickerOption {
  id: string;
  label: string;
  /** A muted second line — "Draft · Sat 19 Sept 2026", "Inactive". */
  detail: string;
}
