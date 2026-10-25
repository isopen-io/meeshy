/**
 * Les types du module voisin — même motif que `await-fact.d.mts` : node lit le
 * `.mjs` (le cadre téléphone), bun le témoigne, seul `tsc` lit ces déclarations.
 */

type NetworkRequest = {
  url(): string;
  isNavigationRequest(): boolean;
  frame(): unknown;
};

type NetworkPage = {
  on(event: 'request' | 'requestfinished' | 'requestfailed', listener: (request: NetworkRequest) => void): unknown;
  on(event: 'framenavigated', listener: (frame: unknown) => void): unknown;
  mainFrame(): unknown;
};

export type DocumentNetwork = {
  (): string | undefined;
  enVol(): string[];
};

export declare function documentNetwork(page: NetworkPage): DocumentNetwork;
