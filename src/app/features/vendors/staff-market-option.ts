/**
 * One market a vendor trades at, as the team dialogs offer it — the label a
 * person reads and the slug the write addresses.
 *
 * At the feature root rather than inside either dialog: both take the same
 * list, built once by the Staff tab from the vendor's memberships, and a copy
 * per dialog would be two shapes that have to agree.
 */
export interface StaffMarketOption {
  slug: string;
  name: string;
}
