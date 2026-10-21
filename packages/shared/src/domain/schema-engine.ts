import Ajv2020, { type AnySchema, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type Ajv from 'ajv';
import type { SchemaIssue } from './contract-error.js';

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictTypes: false,
});

addFormats(ajv as unknown as Ajv);

export function compileSchema(schema: object): ValidateFunction {
  return ajv.compile(schema as AnySchema);
}

export function toSchemaIssues(errors: ErrorObject[] | null | undefined): SchemaIssue[] {
  if (errors === null || errors === undefined) {
    return [];
  }
  return errors.map((error) => ({
    path: error.instancePath,
    keyword: error.keyword,
  }));
}
