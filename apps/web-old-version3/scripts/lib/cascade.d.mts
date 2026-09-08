export type Feuille = {
  readonly nom: string;
  readonly source: string;
};

export declare const feuillesDepuis: (racine: string, entree: string) => readonly Feuille[];

export declare const resoutLightDark: (valeur: string, schema: 'light' | 'dark') => string;

export declare const schemaResolu: (
  colorScheme: string | undefined,
  schemaOs: 'light' | 'dark',
) => 'light' | 'dark';

export declare const tableServie: (args: {
  readonly feuilles: readonly Feuille[];
  readonly classes: readonly string[];
  readonly osSombre: boolean;
}) => Readonly<Record<string, string>>;
