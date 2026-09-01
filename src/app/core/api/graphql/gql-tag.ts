/**
 * An identity tag — no runtime parsing, just string concatenation. Its only
 * job is to be named `gql`: `@graphql-codegen/cli`'s document scanner
 * (`graphql-tag-pluck`) finds operation documents by matching the tag
 * identifier `gql` in source text, regardless of what it resolves to at
 * runtime, so this stands in for `graphql-tag`/`apollo-angular` without
 * adding either as a dependency — `GraphqlClient` sends plain strings.
 */
export function gql(strings: TemplateStringsArray, ...values: readonly unknown[]): string {
  return strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? String(values[i]) : ''),
    '',
  );
}
