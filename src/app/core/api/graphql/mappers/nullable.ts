/**
 * A field the form leaves empty is sent to the API as an explicit `null`, never
 * as `''` and never omitted.
 *
 * The three read differently server-side. `''` is a value — it is stored as an
 * empty string and it is what an optional field's format check (a phone
 * number's pattern, say) runs against. An omitted key means "leave it alone"
 * on an update, so a value the admin just cleared would quietly survive. `null`
 * is the one that says "no value": `@IsOptional()` skips validation for it and
 * an update writes it, which is how a field gets emptied.
 */
export function blankToNull(value: string | null | undefined): string | null {
  return value != null && value.trim() !== '' ? value : null;
}
