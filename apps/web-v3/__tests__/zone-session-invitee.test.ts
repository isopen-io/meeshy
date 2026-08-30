/**
 * @jest-environment node
 *
 * La garde de zone du jeton invité — issue #4448.
 *
 * `session-invitee.test.ts` prouve que `lib/api/guest-session.ts` range le
 * jeton PAR LIEN. Il ne prouve pas la seconde moitié du critère de fin : que
 * personne d'autre ne le range non plus. Un détenteur « unique » que rien
 * n'empêche de dédoubler ne l'est que jusqu'au prochain écran — et la
 * divergence serait INVISIBLE aux tests de comportement, puisque les deux
 * boucles `localStorage` marchent. Ce n'est qu'au second lien rejoint, chez un
 * utilisateur, que le défaut du § 6.1 point 7 se rejoue.
 *
 * Deux témoins, parce que ce sont deux affirmations différentes :
 *   — le GREP dit ce que le dépôt contient AUJOURD'HUI, sur tout le code de
 *     production (`app/`, `components/`, `lib/`, `scripts/`), commentaires
 *     retirés — un texte qui NOMME la clé n'est pas un site qui l'écrit ;
 *   — le LINT dit ce qu'il sera possible de commiter DEMAIN, en sondant les
 *     deux moitiés du défaut : la clé composée ailleurs, et l'accès direct au
 *     stockage (une clé peut se recomposer sans jamais s'écrire en toutes
 *     lettres).
 *
 * Les détenteurs de stockage sont ÉNUMÉRÉS ici avec leur raison. Il n'y en a
 * pas « quelques-uns » : chaque donnée persistée a un détenteur nommé, et
 * ajouter une ligne à cette liste est un acte de revue, pas un effet de bord.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOT = join(__dirname, '..');
const ESLINT = join(ROOT, 'node_modules', '.bin', 'eslint');
const DETENTEUR = join('lib', 'api', 'guest-session.ts');

/** Les seuls fichiers de production autorisés à toucher le stockage du navigateur, et pourquoi. */
const DETENTEURS_DE_STOCKAGE: readonly (readonly [string, string])[] = [
  [DETENTEUR, 'le jeton invité, une entrée par lien (§ 6.3 état E)'],
  [join('app', 'theme-script.tsx'), 'la préférence de thème, clé meeshy-theme (§ 2)'],
];

const ZONES = ['app', 'components', 'lib', 'scripts'];
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

const fichiersDeProduction = (): readonly string[] => {
  const parcourt = (dossier: string): readonly string[] =>
    readdirSync(join(ROOT, dossier), { withFileTypes: true }).flatMap((entree) => {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) return parcourt(chemin);
      return EXTENSIONS.some((extension) => entree.name.endsWith(extension)) ? [chemin] : [];
    });

  return ZONES.filter((zone) => existsSync(join(ROOT, zone))).flatMap(parcourt);
};

/**
 * Un commentaire qui NOMME la clé documente la règle ; il ne l'enfreint pas.
 * `lib/realtime/lifecycle.ts` en est l'exemple : il explique pourquoi son canal
 * est indexé comme le stockage, sans jamais composer la clé.
 *
 * Le `//` précédé de `:` est épargné — sans quoi une URL emporterait la fin de
 * sa ligne, et un vrai défaut posé à côté d'elle deviendrait invisible.
 */
const sansCommentaires = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CLE_DU_JETON = /meeshy\.guest/;
const ACCES_AU_STOCKAGE = /\b(?:local|session)Storage\s*[.[]/;

describe('le jeton invité ne se range qu’à un seul endroit', () => {
  const sources = fichiersDeProduction().map(
    (chemin) => [chemin, sansCommentaires(readFileSync(join(ROOT, chemin), 'utf8'))] as const,
  );

  it('trouve bien le code à garder — un parcours vide rendrait ce fichier muet', () => {
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.map(([chemin]) => chemin)).toContain(DETENTEUR);
  });

  it('ne compose la clé meeshy.guest nulle part ailleurs', () => {
    const coupables = sources.filter(([chemin, source]) => chemin !== DETENTEUR && CLE_DU_JETON.test(source));

    expect(coupables.map(([chemin]) => chemin)).toEqual([]);
  });

  it("n'accède au stockage que depuis un détenteur ÉNUMÉRÉ", () => {
    const autorises = DETENTEURS_DE_STOCKAGE.map(([chemin]) => chemin);
    const coupables = sources.filter(
      ([chemin, source]) => !autorises.includes(chemin) && ACCES_AU_STOCKAGE.test(source),
    );

    expect(coupables.map(([chemin]) => chemin)).toEqual([]);
  });

  it('énumère des détenteurs qui EXISTENT — une liste périmée autorise ce qu’elle ne garde plus', () => {
    DETENTEURS_DE_STOCKAGE.forEach(([chemin]) =>
      expect(sources.map(([source]) => source)).toContain(chemin),
    );
  });
});

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
  ['la clé écrite en toutes lettres', "localStorage.getItem('meeshy.guest.' + lien);"],
  ['la clé composée dans un gabarit', 'window.localStorage.setItem(`meeshy.guest.${lien}`, valeur);'],
  ['la clé recomposée sans jamais être écrite', 'sessionStorage.removeItem(lien);'],
  ['le stockage atteint par globalThis', 'globalThis.localStorage.clear();'],
  ['la clé seulement NOMMÉE, prête à être composée ailleurs', "const cle = 'meeshy.guest.' + lien;"],
];

const SONDE = `declare const lien: string;\ndeclare const valeur: string;\n${FORMES_INTERDITES.map(([, ligne]) => ligne).join('\n')}\nexport const sonde = cle;\n`;

const LIGNE_DE_LA_PREMIERE_FORME = 3;

jest.setTimeout(180_000);

describe('la zone du jeton invité', () => {
  describe.each([
    ['un écran', join('app', '(public)', 'sonde.tsx')],
    ['un composant', join('components', 'conversations', 'sonde.tsx')],
    ['un voisin du détenteur', join('lib', 'api', 'sonde.ts')],
    ['le site du cycle de vie, qui reçoit la clé et ne la compose jamais', join('lib', 'realtime', 'lifecycle.ts')],
  ])('dans %s', (_zone, fichier) => {
    const refuse = lint(SONDE, fichier);

    it.each(FORMES_INTERDITES.map(([label], index) => [label, index + LIGNE_DE_LA_PREMIERE_FORME] as const))(
      'refuse %s',
      (_label, ligne) => {
        expect(refuse.map((message) => message.line)).toContain(ligne);
      },
    );

    it('dit POURQUOI, en nommant le détenteur', () => {
      expect(refuse.every((message) => message.message.includes('lib/api/guest-session.ts'))).toBe(true);
    });
  });

  it("laisse le détenteur écrire ce qu'il est seul à avoir le droit d'écrire", () => {
    expect(lint(SONDE, DETENTEUR)).toEqual([]);
  });

  it('laisse le détenteur soumis au cycle de vie — son exemption ne lève que le stockage', () => {
    const cycle = "window.addEventListener('storage', f);\n";
    const refuse = lint(`declare const f: () => void;\n${cycle}export const x = f;\n`, DETENTEUR);

    expect(refuse.map((message) => message.message)).toContain(
      "Le cycle de vie de la v3 a un seul point d'écoute : lib/realtime/lifecycle.ts.",
    );
  });

  it('laisse passer ce que la v3 écrit réellement ailleurs', () => {
    const innocent = "export const cle = (lien: string): string => `conversation.${lien}`;\n";
    expect(lint(innocent, join('components', 'ui', 'sonde.ts'))).toEqual([]);
  });

  it('garde le détenteur à son adresse — la règle et le fichier ne peuvent pas diverger', () => {
    const config = readFileSync(join(ROOT, 'eslint.config.mjs'), 'utf8');

    expect(config).toContain(`const DETENTEUR_DU_JETON = '${DETENTEUR.split(sep).join('/')}'`);
    expect(readFileSync(join(ROOT, DETENTEUR), 'utf8')).toContain('export const cleDuLien');
  });

});
