export type DevHttpsPlan = {
  readonly args: readonly string[];
  readonly servesLocalDomain: boolean;
  readonly notice: string;
};

export declare const SHARED_CERTIFICATE: string;
export declare const SHARED_KEY: string;
export declare const SHARED_CERT_NOTICE: string;
export declare const SELF_SIGNED_FALLBACK: string;

export declare const planDevHttps: (input: {
  readonly nextArgs: readonly string[];
  readonly certificate: string;
  readonly key: string;
  readonly exists: (path: string) => boolean;
}) => DevHttpsPlan;
