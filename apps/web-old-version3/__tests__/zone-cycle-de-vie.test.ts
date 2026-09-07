/**
 * @jest-environment node
 *
 * La garde de zone du cycle de vie — issue #4447.
 *
 * `cycle-de-vie.test.ts` prouve que `lib/realtime/lifecycle.ts` fait ce que le
 * § 6.2 exige. Il ne prouve PAS la seconde moitié du critère de fin : que
 * personne d'autre ne le fait aussi. Un module « unique » que rien n'empêche de
 * dédoubler n'est unique que jusqu'au prochain écran — et la divergence ne se
 * verrait dans aucun test de comportement, puisque les deux boucles marchent.
 *
 * Ce fichier lint donc une sonde AUX ENDROITS où le défaut apparaîtrait :
 * `app/`, `components/`, et le reste de `lib/` — puis au site unique lui-même,
 * où la même sonde doit passer, faute de quoi la règle interdirait sa propre
 * implémentation.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const ESLINT = join(ROOT, 'node_modules', '.bin', 'eslint');
const SITE_UNIQUE = join('lib', 'realtime', 'lifecycle.ts');

type LintMessage = { readonly ruleId: string | null; readonly line: number; readonly message: string };
type LintResult = { readonly messages: readonly LintMessage[] };

const hasStdout = (value: unknown): value is { stdout: string } =>
  typeof value === 'object' && value !== null && typeof (value as { stdout?: unknown }).stdout === 'string';

const lint = (source: string, fichier: string): readonly LintMessage[] => {
  const args = ['--no-color', '--format', 'json', '--stdin', '--stdin-filename', join(ROOT, fichier)];

  const stdout = ((): string => {
    try {
      return execFileSync(ESLINT, args, { cwd: ROOT, input: source, encoding: 'utf8' });
    } catch (error: unknown) {
      if (hasStdout(error)) return error.stdout;
      throw error;
    }
  })();

  const results: readonly LintResult[] = JSON.parse(stdout);
  return results.flatMap((result) => result.messages).filter((m) => m.ruleId === 'no-restricted-syntax');
};

const FORMES_INTERDITES: readonly (readonly [string, string])[] = [
  ["l'écoute de visibilitychange sur le document", "document.addEventListener('visibilitychange', f);"],
  ['le retour de bfcache écouté à part', "window.addEventListener('pageshow', f);"],
  ['le départ de page écouté à part', "window.addEventListener('pagehide', f);"],
  ['la bannière hors-ligne câblée sur place', "window.addEventListener('offline', f);"],
  ['le retour du réseau câblé sur place', "window.addEventListener('online', f);"],
  ['le jeton surveillé par un second écouteur', "window.addEventListener('storage', f);"],
  ['la forme sans receveur explicite', "addEventListener('visibilitychange', f);"],
  ["la forme par propriété, que l'énumération des appels raterait", 'document.onvisibilitychange = f;'],
  ['un second canal des invités', "const c = new BroadcastChannel('meeshy-guest');"],
  // `focus`/`blur` sur un receveur GLOBAL sont la réécriture classique de la
  // visibilité — une seconde machine à états, que la zone existe pour empêcher.
  ['la visibilité réécrite en focus de fenêtre', "window.addEventListener('focus', f);"],
  ['la visibilité réécrite en blur de fenêtre', "window.addEventListener('blur', f);"],
];

const SONDE = `declare const f: () => void;\n${FORMES_INTERDITES.map(([, ligne]) => ligne).join('\n')}\nexport const sonde = c;\n`;

const LIGNE_DE_LA_PREMIERE_FORME = 2;

/**
 * Les adieux ne sont pas « à centraliser » : ils sont INTERDITS, site unique
 * COMPRIS. Un seul `beforeunload` posé où que ce soit rend le document
 * inéligible au bfcache — donc `pageshow{persisted:true}` cesse de se
 * produire, donc `reprise{cause:'bfcache'}` devient une branche morte et
 * l'onglet « revient muet » (§ 6.2, ligne barrée). La régression serait
 * SILENCIEUSE : `cycle-de-vie.test.ts` continuerait de prouver la branche en
 * la déclenchant à la main pendant qu'aucun navigateur ne la déclenche plus.
 */
const FORMES_D_ADIEU: readonly (readonly [string, string])[] = [
  ['le beforeunload qui tue le bfcache', "window.addEventListener('beforeunload', f);"],
  ['le unload que WebKit ignore', "window.addEventListener('unload', f);"],
  ['la forme par propriété du beforeunload', 'window.onbeforeunload = f;'],
  ['la forme sans receveur explicite du unload', "addEventListener('unload', f);"],
];

const SONDE_D_ADIEU = `declare const f: () => void;\n${FORMES_D_ADIEU.map(([, ligne]) => ligne).join('\n')}\nexport const adieu = f;\n`;

jest.setTimeout(180_000);

describe('le cycle de vie ne s’écoute qu’à un seul endroit', () => {
  describe.each([
    ['un écran', join('app', '(public)', 'sonde.tsx')],
    ['un composant', join('components', 'reader', 'sonde.tsx')],
    ['un autre module de lib', join('lib', 'api', 'sonde.ts')],
    ['un voisin du site unique', join('lib', 'realtime', 'sonde.ts')],
  ])('dans %s', (_zone, fichier) => {
    const refuse = lint(SONDE, fichier);

    it.each(FORMES_INTERDITES.map(([label], index) => [label, index + LIGNE_DE_LA_PREMIERE_FORME] as const))(
      'refuse %s',
      (_label, ligne) => {
        expect(refuse.map((message) => message.line)).toContain(ligne);
      },
    );

    it('dit POURQUOI, en nommant le site unique', () => {
      expect(refuse.every((message) => message.message.includes('lib/realtime/lifecycle.ts'))).toBe(true);
    });
  });

  it("laisse le site unique écrire ce qu'il est seul à avoir le droit d'écrire", () => {
    expect(lint(SONDE, SITE_UNIQUE)).toEqual([]);
  });

  describe('les adieux — interdits, pas centralisés', () => {
    it.each([
      ['un écran', join('app', '(public)', 'sonde.tsx')],
      ['un composant', join('components', 'reader', 'sonde.tsx')],
      ['un autre module de lib', join('lib', 'api', 'sonde.ts')],
      ['un script hors zone', join('scripts', 'sonde.ts')],
      ['le site unique lui-même — son exemption ne les rouvre PAS', SITE_UNIQUE],
    ])('refuse beforeunload et unload dans %s', (_zone, fichier) => {
      const refuse = lint(SONDE_D_ADIEU, fichier);

      expect(refuse.map((message) => message.line)).toEqual(
        FORMES_D_ADIEU.map((_forme, index) => index + LIGNE_DE_LA_PREMIERE_FORME),
      );
      expect(refuse.every((message) => message.message.includes('bfcache'))).toBe(true);
    });
  });

  it('laisse passer ce que la v3 écrit réellement ailleurs', () => {
    const innocent = "export const onLine = (): boolean => globalThis.navigator.onLine;\n";
    expect(lint(innocent, join('components', 'ui', 'sonde.ts'))).toEqual([]);
  });

  // Un témoin qui n'énumère pas ce que la config interdit ne mord pas : on
  // ajoute un événement au cycle, aucune sonde ne le couvre, et la suite reste
  // verte. Le compte se DÉRIVE de la config plutôt que d'être recopié.
  it.each([
    ['evenementsDuCycle', 6, FORMES_INTERDITES],
    ['evenementsDeFausseVisibilite', 2, FORMES_INTERDITES],
    ['evenementsDAdieu', 2, FORMES_D_ADIEU],
  ] as const)('sonde CHAQUE événement de %s', (nom, compte, formes) => {
    const config = readFileSync(join(ROOT, 'eslint.config.mjs'), 'utf8');
    const declaration = new RegExp(`const ${nom} = \\[([^\\]]+)\\]`).exec(config);
    const evenements = [...(declaration?.[1] ?? '').matchAll(/'([^']+)'/g)].map(([, evenement]) => evenement);

    expect(evenements).toHaveLength(compte);
    evenements.forEach((evenement) =>
      expect(formes.some(([, ligne]) => ligne.includes(`'${evenement}'`))).toBe(true),
    );
  });

  it('garde le site unique à son adresse — la règle et le fichier ne peuvent pas diverger', () => {
    const config = readFileSync(join(ROOT, 'eslint.config.mjs'), 'utf8');
    expect(config).toContain(`const SITE_UNIQUE_DU_CYCLE = '${SITE_UNIQUE.split('\\').join('/')}'`);
    expect(readFileSync(join(ROOT, SITE_UNIQUE), 'utf8')).toContain('export const observeCycleDeVie');
  });
});
