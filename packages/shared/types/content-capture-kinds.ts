/**
 * LES SORTES DE CAPTURE ET LEUR BORNE (#9617) — sans zod, pour que le rendu de
 * l'avis (`utils/capture-notice.ts`), que chaque client charge avec son fil,
 * n'emporte pas le validateur du contrat (`types/content-capture.ts`) : sur le
 * web, cet import tirait le chunk zod complet (18 Ko gzip) derrière le fil.
 */

export const CONTENT_CAPTURE_KINDS = ['screenshot', 'recording'] as const;
export type ContentCaptureKind = (typeof CONTENT_CAPTURE_KINDS)[number];

/** Messages déclarés au plus par capture — un écran n'en montre pas davantage. */
export const CONTENT_CAPTURE_MAX_MESSAGES = 50;
