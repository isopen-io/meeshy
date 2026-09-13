/**
 * Déclaration ambiante minimale pour `bun:test`.
 *
 * `bun-preload.ts` n'est chargé que par `bunfig.toml` (`[test].preload`),
 * c'est-à-dire uniquement quand la suite tourne sous le runtime `bun test` —
 * jamais sous ts-jest/Node, qui n'a pas les types de `bun:test` dans son
 * projet (`tsconfig.test.json` ne déclare que `["jest", "node"]"`). Sans
 * cette déclaration, `tsc -p tsconfig.test.json` lève TS2307 sur un module
 * qui existe bel et bien à l'exécution — c'est l'une des 19 occurrences de
 * #6160. Seule la forme réellement utilisée par `bun-preload.ts` est typée.
 */
declare module 'bun:test' {
  export const mock: {
    module(name: string, factory: () => unknown): void;
  };
}
