/**
 * Les types de `bun:test`, RÉDUITS à ce que les témoins de cette application
 * emploient. Préférable à une dépendance de plus (`bun-types` traîne tout le
 * runtime) : le type-check ne doit pas dépendre d'une installation réseau pour
 * rendre son verdict.
 *
 * Ce fichier est une SOURCE, pas une déclaration générée — la racine ignore
 * `**​/*.d.*`, et une négation le rattrape dans `.gitignore`. Il a manqué au
 * dépôt depuis la création de l'application, ce qui n'est apparu qu'à la
 * première exécution CI qui type-checkait cette application (TS2307 ×3).
 * `scripts/verifie-suivi-git.mjs` garde désormais la classe entière.
 */
declare module 'bun:test' {
  export function describe(nom: string, corps: () => void): void;
  export function test(nom: string, corps: () => void | Promise<void>): void;

  type Attentes = {
    toBe(attendu: unknown): void;
    toEqual(attendu: unknown): void;
    toBeNull(): void;
    toBeCloseTo(attendu: number, decimales?: number): void;
  };

  export function expect(valeur: unknown): Attentes & { readonly not: Attentes };
}
