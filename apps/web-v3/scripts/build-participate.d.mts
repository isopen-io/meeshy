export type Source = {
  readonly base: string;
  readonly chemin: string;
};

export declare const SOURCES: readonly Source[];

export type Poids = {
  readonly brut: number;
  readonly gzip: number;
};

export declare const compile: () => Record<string, Poids | null> & { readonly socket: Poids | null };

export declare const ecrisLaMesure: (poids: Readonly<Record<string, Poids>>, cheminMesures?: string) => void;
