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
  export function test(name: string, body: () => void | Promise<void>): void;
  export function describe(name: string, body: () => void): void;
  export function afterEach(body: () => void | Promise<void>): void;
  /**
   * `beforeEach` (#5814) — remet un état de MODULE (magasin, bouchon) à son
   * défaut avant CHAQUE témoin, symétrique à `afterEach` déjà déclaré
   * ci-dessus. Requis dès qu'un fichier de témoins partage un état mutable
   * entre plusieurs `test()` (`reactionStore`, `fixtures-reactions.ts`).
   */
  export function beforeEach(body: () => void | Promise<void>): void;
  /**
   * `beforeAll`/`afterAll` (#5813, revue-correction) — le SEUL couple de ce
   * fichier qui enregistre/désenregistre une ressource GLOBALE scopée à un
   * `describe` (happy-dom, `composer.test.tsx`) plutôt qu'un état par test.
   */
  export function beforeAll(body: () => void | Promise<void>): void;
  export function afterAll(body: () => void | Promise<void>): void;

  type Expectations = {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeCloseTo(expected: number, decimals?: number): void;
    toHaveLength(expected: number): void;
    toContain(expected: unknown): void;
    toContainEqual(expected: unknown): void;
    toMatch(expected: RegExp | string): void;
    toBeTruthy(): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeInstanceOf(expected: unknown): void;
    toThrow(expected?: RegExp | string): void;
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

/**
 * `__APP_VERSION__` — la version de `package.json`, LUE par `vite.config.ts`
 * au moment de la construction (même mécanique que `__SHELL__`). Le pied de
 * marque de l'écran de connexion la rend ; le préchauffage institutionnel lit
 * le MÊME `package.json` depuis le disque. Une source, deux lecteurs — jamais
 * un littéral recopié dans un écran.
 */
declare const __APP_VERSION__: string;
