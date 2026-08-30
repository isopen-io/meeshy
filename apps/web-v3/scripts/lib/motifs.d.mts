export type PorteurDeMotifs = { readonly motifs: readonly string[] };

export declare const precision: (motif: string) => number;

export declare const couvre: (motif: string, cible: string) => boolean;

export declare const plusPrecis: <T extends PorteurDeMotifs>(
  candidats: readonly T[],
  cibleDe: (motif: string) => string,
) => { readonly choix: T | null; readonly ambigu: readonly T[] };
