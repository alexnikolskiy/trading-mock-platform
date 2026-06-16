/** Surface A (Ops Read) authority declaration — all non-readOnly flags are literally false. */
export interface OpsCapabilities {
  readonly readOnly: true;
  readonly execution: false;
  readonly credentials: false;
  readonly ingestion: false;
  readonly mutation: false;
}

export const OPS_CAPABILITIES: OpsCapabilities = {
  readOnly: true,
  execution: false,
  credentials: false,
  ingestion: false,
  mutation: false,
};
