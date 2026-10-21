export const TUS_CHECKPOINT_DB_NAME = 'meeshy-tus';
export const TUS_CHECKPOINT_STORE_NAME = 'checkpoints';
export const TUS_CHECKPOINT_MAX_AGE_MS = 22 * 60 * 60 * 1000;

export type TusCheckpoint = {
  readonly location: string;
  readonly offset: number;
  readonly fileSize: number;
  readonly fingerprint: string;
  readonly savedAt: number;
};

export type TusCheckpointStore = {
  readonly find: (fingerprint: string) => Promise<TusCheckpoint | null>;
  readonly save: (checkpoint: TusCheckpoint) => Promise<void>;
  readonly remove: (fingerprint: string) => Promise<void>;
};

export const tusFingerprint = (_params: { readonly file: File; readonly base: string; readonly uploadContext: string; readonly thumbHash?: string }): string => '';
export const idbTusCheckpointStore = (_factory: IDBFactory | undefined): TusCheckpointStore => ({
  find: async () => null,
  save: async () => undefined,
  remove: async () => undefined,
});
export const claimTusLease = (_fingerprint: string): (() => void) | null => null;
