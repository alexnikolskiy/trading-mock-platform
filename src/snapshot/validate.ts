import { Ajv } from 'ajv';
import { MANIFEST_SCHEMA, BUNDLE_SCHEMA } from '../contract/snapshot/schema.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateManifest = ajv.compile(MANIFEST_SCHEMA);
const validateBundle = ajv.compile(BUNDLE_SCHEMA);

export function assertValidManifest(obj: unknown): void {
  if (!validateManifest(obj)) {
    throw new Error(`snapshot manifest failed schema validation: ${ajv.errorsText(validateManifest.errors)}`);
  }
}
export function assertValidBundle(obj: unknown): void {
  if (!validateBundle(obj)) {
    throw new Error(`snapshot bundle failed schema validation: ${ajv.errorsText(validateBundle.errors)}`);
  }
}
