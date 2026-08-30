/** One row of the address autocomplete list, already flattened for the UI. */
export interface PlaceSuggestion {
  /** Google place ID — what `Places.resolve()` takes. */
  readonly id: string;
  /** "Ballincollig Regional Park" — the bold line. */
  readonly primaryText: string;
  /** "Ballincollig, Co. Cork, Ireland" — the muted line. */
  readonly secondaryText: string;
  /** Both lines joined, which is what lands in the address field. */
  readonly description: string;
}

/**
 * A place the organiser picked, in the shape the market form stores. This is
 * the domain boundary: nothing above `core/maps` sees a `google.maps.Place`.
 */
export interface ResolvedPlace {
  readonly address: string;
  readonly city: string;
  /** Bare county name matched against the console's list, or null if unknown. */
  readonly county: string | null;
  readonly eircode: string;
  readonly latitude: number;
  readonly longitude: number;
}
