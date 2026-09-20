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
  /**
   * `timeoutMs` (#7142) — le délai par défaut de `bun test` est de 5 s, et
   * deux témoins de la fermeture d'une fenêtre de révélation attendent plus
   * longtemps qu'elle ne dure (`REVEAL_DURATION_SECONDS` + `FOG_DURATION_MS`
   * = 5,4 s). `ThreadModes` ne transmet aucune horloge injectable aux peaux :
   * il n'y a pas d'autre chemin que le temps qui passe, donc pas d'autre
   * moyen que de déclarer le délai.
   *
   * Ajouté ICI plutôt que contourné dans le témoin : ce fichier est réduit à
   * ce que les témoins emploient, et c'est exactement ce que l'un d'eux
   * emploie désormais. Le taire aurait laissé `bun test` vert sur un appel que
   * `tsc` refuse — l'écart que ce fichier existe pour fermer.
   */
  export function test(name: string, body: () => void | Promise<void>, timeoutMs?: number): void;
  /**
   * `describe.each` (#7142) — le même corps de témoins rejoué sur une TABLE de
   * cas, le nom recevant les valeurs par `%s`.
   *
   * Employé pour les DEUX peaux du fil (Focal, Bulles) : c'est en les jouant
   * toutes les deux qu'on a vu qu'un masque d'accessibilité n'avait jamais été
   * porté sur l'une d'elles. Une boucle `for` ferait la même chose sans type à
   * déclarer — mais elle place le corps des témoins deux niveaux plus à droite,
   * et ce fichier préfère la forme que le témoin lit le mieux.
   */
  export const describe: {
    (name: string, body: () => void): void;
    each<Cas extends readonly unknown[]>(table: readonly Cas[]): (name: string, body: (...cas: [...Cas]) => void) => void;
  };
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
 * `__FIXTURES__` — `false` sous `VITE_DATA_SOURCE=gateway`, `true` partout
 * ailleurs (revue #5815). Même mécanique que `__SHELL__` : un littéral posé
 * par `vite.config.ts`, fourni sous `bun test` par `bunfig.toml`.
 *
 * Il ne DÉCIDE rien — `apiConfig.source` reste la source de vérité du
 * comportement, et `__FIXTURES__ && source === 'fixtures'` rend exactement ce
 * que rendait `source === 'fixtures'`. Il DIT à Rollup ce que la construction
 * sait déjà, pour qu'elle puisse élaguer `src/lib/api/fixtures*.ts` : sans
 * lui, une coque de recette construite contre la passerelle embarquait quand
 * même tout le jeu de fixtures (`build-shells.mjs::auditShellBundle`).
 */
declare const __FIXTURES__: boolean;

/**
 * `__APP_VERSION__` — la version de `package.json`, LUE par `vite.config.ts`
 * au moment de la construction (même mécanique que `__SHELL__`). Le pied de
 * marque de l'écran de connexion la rend ; le préchauffage institutionnel lit
 * le MÊME `package.json` depuis le disque. Une source, deux lecteurs — jamais
 * un littéral recopié dans un écran.
 */
declare const __APP_VERSION__: string;
