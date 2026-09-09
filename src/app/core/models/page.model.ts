/**
 * One page of a collection, and the vocabulary a screen asks for it in.
 *
 * A list screen that pages server-side never holds the whole collection: the
 * table renders {@link Page.items} and the paginator needs
 * {@link Page.total} — the number of rows *behind* the filters, which only the
 * server can know once it stopped sending them all. Ports that page take a
 * {@link PageRequest} and answer with a `Page<T>`; `PagedCollectionStore` is
 * the one caller of that shape.
 */
export interface PageRequest {
  /** Zero-based, the way `MatPaginator` counts. */
  index: number;
  size: number;
}

export interface Page<T> {
  items: readonly T[];
  /** Rows matching the request's filters, across every page. */
  total: number;
}

/** How many rows a list screen shows before paging. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Cuts one page out of a collection already in hand — what an adapter that
 * holds every row (the fixtures) or one that had to read them all (a filter
 * the API cannot express) returns, so the caller cannot tell the difference
 * between that and a page the server sliced.
 */
export function pageOf<T>(items: readonly T[], page: PageRequest): Page<T> {
  const start = page.index * page.size;
  return { items: items.slice(start, start + page.size), total: items.length };
}
