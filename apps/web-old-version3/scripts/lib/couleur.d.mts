export declare const estHex: (valeur: string) => boolean;

export declare const luminance: (hex: string) => number;

export declare const contraste: (a: string, b: string) => number;

export declare const resout: (
  table: Readonly<Record<string, string>>,
  nom: string,
) => string | null;

export declare const arrondi: (rapport: number) => number;
