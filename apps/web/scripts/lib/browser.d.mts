/**
 * Les types du module voisin — même motif que `resolve-dist-dir.d.mts` : trois
 * runtimes consomment le `.mjs` (Vite, bun, node), seul `tsc` lit ces
 * déclarations.
 *
 * `Browser`, `BrowserContext` et `Page` viennent de Playwright ; ce module
 * n'ajoute que la SURVEILLANCE, et les enveloppes rendues sont, pour tout
 * appelant, le type qu'elles enveloppent — c'est la raison d'être du proxy.
 */
import type { Browser, Page } from '@playwright/test';

/** Une page surveillée : elle-même, ses erreurs de page, ses erreurs de console. */
export type WatchedPage = {
  readonly page: Pick<Page, 'url'>;
  readonly errors: string[];
  readonly consoleErrors: string[];
};

export declare function watchPage(page: Page): WatchedPage;
export declare function pageDiagnostics(entries: readonly WatchedPage[]): string;
export declare function reportOpenPages(): void;
export declare function launchChromium(): Promise<Browser>;
