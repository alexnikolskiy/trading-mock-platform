export type OpsErrorCategory =
  | 'validation_error'
  | 'not_found'
  | 'unsupported_query'
  | 'internal_read_error';

export interface OpsError {
  readonly category: OpsErrorCategory;
  readonly code: string;
  readonly message: string;
}

export function isOpsError(value: unknown): value is OpsError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'category' in value &&
    'code' in value &&
    'message' in value
  );
}
