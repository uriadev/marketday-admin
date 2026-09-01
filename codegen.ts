import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * Generates TypeScript types for every operation document under
 * `core/api/graphql/operations/` against the checked-in `schema.gql`, so a
 * backend schema change becomes a compile error here instead of a runtime
 * surprise. Run with `pnpm gql:generate`; commit the output.
 */
const config: CodegenConfig = {
  schema: './schema.gql',
  documents: ['src/app/core/api/graphql/operations/**/*.ts'],
  generates: {
    'src/app/core/api/graphql/generated.ts': {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        scalars: {
          DateTime: 'string',
          GeoJSON: '{ type: string; coordinates: number[] }',
          JSON: 'unknown',
        },
        strictScalars: true,
        avoidOptionals: { field: true },
      },
    },
  },
};

export default config;
