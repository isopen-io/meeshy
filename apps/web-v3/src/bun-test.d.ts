/* Les types de `bun:test` reduits a ce que les temoins de ce POC emploient.
 * Preferable a une dependance de plus : le type-check ne doit pas dependre
 * d'une installation reseau pour rendre son verdict. */
declare module 'bun:test' {
  export function test(nom: string, corps: () => void | Promise<void>): void;
  export function expect(valeur: unknown): {
    toBe(attendu: unknown): void;
    toEqual(attendu: unknown): void;
  };
}
