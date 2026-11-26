export type EmittedAddress = { readonly file: string; readonly line: number; readonly path: string; readonly open: boolean };

export type ServingTable = {
  readonly redirects: ReadonlyArray<(path: string) => string | null>;
  readonly documents: readonly string[];
  readonly appPrefix: RegExp | null;
  readonly screens: readonly string[];
  readonly aliases: Readonly<Record<string, string>>;
  readonly isFile: (path: string) => boolean;
};

export type Serving =
  | { readonly kind: 'screen' | 'document' | 'file' | 'redirect' | 'alias'; readonly target: string }
  | { readonly kind: 'dead'; readonly reason: string };

export declare const SAMPLE: string;
export declare const PATH_TABLES: Readonly<Record<'CONTENT_WEB_PATHS' | 'EMAIL_LINK_PATHS', (value: string) => string>>;
export declare function emittedPathsIn(text: string, file: string): EmittedAddress[];
export declare function selfLinksIn(text: string, file: string): EmittedAddress[];
export declare function pathTableIn(text: string, file: string, name: keyof typeof PATH_TABLES): EmittedAddress[];
export declare function emailSecretLinksIn(text: string, file: string): EmittedAddress[];
export declare function emailLinkAliases(text: string): Record<string, string>;
export declare function nginxServing(text: string): Pick<ServingTable, 'redirects' | 'documents' | 'appPrefix'>;
export declare function resolveServing(path: string, table: ServingTable, depth?: number): Serving;
export declare function deadAddresses(emitted: readonly EmittedAddress[], table: ServingTable): Array<EmittedAddress & { readonly message: string }>;
export declare function documentVerdict(
  document: { readonly title: string; readonly bytes: number } | null,
  shell: { readonly title: string; readonly bytes: number },
): string | null;
