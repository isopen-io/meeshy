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
 * `scripts/check-git-tracking.mjs` garde désormais la classe entière.
 */
declare module 'bun:test' {
  export function describe(name: string, body: () => void): void;
  export function test(name: string, body: () => void | Promise<void>): void;
  export function afterEach(body: () => void | Promise<void>): void;

  type Expectations = {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeCloseTo(expected: number, decimals?: number): void;
    toHaveLength(expected: number): void;
    toContain(expected: unknown): void;
    toBeTruthy(): void;
    toThrow(): void;
  };

  export function expect(value: unknown): Expectations & { readonly not: Expectations };
}

/**
 * `__BENCH__` — le nombre de messages que la fixture fabrique en plus, posé en
 * littéral par `vite.config.ts`. Vaut `0` partout sauf dans la variante de banc
 * (`MEESHY_BENCH=500 bun run build`), que seul le témoin de virtualisation
 * construit.
 */
declare const __BENCH__: number;

/**
 * `__SHELL__` — `true` sous `MEESHY_TARGET=capacitor` (la coque native),
 * `false` en web nu. Posé en littéral par `vite.config.ts` (même mécanique
 * que `__BENCH__`) ; `src/lib/api/config.ts` en dérive `apiConfig.base` — une
 * coque ne peut jamais résoudre une base RELATIVE (`capacitor://localhost/…`
 * ne mène nulle part), le web nu le peut (proxée en dev, même origine en
 * déploiement). Sous `bun test`, `bunfig.toml` (`[define]`) fournit la
 * valeur du build NORMAL (`false`) — cette déclaration ne fait que TYPER la
 * constante, elle ne la RÉSOUT pas.
 */
declare const __SHELL__: boolean;
