import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import { isMeasured, measurePress, pressRatchetProblems } from './press-ratchet.mjs';

/**
 * **TOUT BOUTON RÉPOND À L'APPUI DANS L'IMAGE MÊME** (#18412, contrat web) —
 * cliquet sur la dette mesurée le jour du lot. Deux comptes :
 *
 * - les balises `<button>` et `<Link>` hors du kit dont ni la balise ouvrante
 *   ni le contenu ne portent une réponse d'appui reconnue (`PRESS_MARKS`) ;
 *   un `className` non littéral sans marque compte comme muet ;
 * - les durées Tailwind littérales `duration-N`, qu'une durée nommée remplace.
 *
 * Le plafond ne fait que descendre : un lot qui en résorbe l'abaisse dans le
 * même commit, sinon le second témoin rougit.
 */

const APP = fileURLToPath(new URL('../..', import.meta.url));

const walk = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.tsx') ? [join(dir, entry.name)] : [],
  );

const sourcesOfTree = () =>
  walk(join(APP, 'src')).map((path) => ({ path: relative(APP, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }));

/**
 * LE COMPTE DU JOUR (#18412), mesuré par ce script sur la tête de dev du
 * commit : 1 105 balises, dont 1 019 sans réponse d'appui ; 21 durées
 * littérales dans 20 fichiers. Il ne descend que par un lot d'écran, et se
 * grave plus bas dans le même commit.
 */
const PLAFOND = { mute: 1019, durations: 21 } as const;

const source = (path: string, text: string) => ({ path, text });

describe('le cliquet des boutons muets et des durées littérales', () => {
  test('une balise sans marque est muette ; une marque sur la balise ou dans son contenu la fait répondre', () => {
    const measured = measurePress([
      source(
        'src/a.tsx',
        `const A = <button onClick={() => go()}>Muet</button>;
         const B = <button className="px-4 active:scale-95">Pressé</button>;
         const C = <Link href="/x"><span className="glass-touch">Verre</span></Link>;
         const D = <button className={BUTTON.primary}>Plein</button>;
         const E = <Link href="/y" className={cls}>Indirect</Link>;`,
      ),
    ]);
    expect(measured).toMatchObject({ elements: 5, mute: 2 });
  });

  test('un attribut qui contient > ou une flèche ne coupe pas la balise ouvrante', () => {
    const measured = measurePress([
      source('src/a.tsx', `const A = <button aria-label="a > b" onClick={() => (x > 1 ? f() : g())} className="kit-btn">Ok</button>;`),
    ]);
    expect(measured).toMatchObject({ elements: 1, mute: 0 });
  });

  test('une balise auto-fermante ne lit pas le contenu de la suivante', () => {
    const measured = measurePress([source('src/a.tsx', `const A = <><Link href="/a" /><Link href="/b" className="chrome-action">B</Link></>;`)]);
    expect(measured).toMatchObject({ elements: 2, mute: 1 });
  });

  test('un nom qui commence par Link n’est pas un Link', () => {
    expect(measurePress([source('src/a.tsx', `const A = <LinkPreview url="x" />;`)])).toMatchObject({ elements: 0, mute: 0 });
  });

  test('compte les durées littérales duration-N, pas les jetons voisins', () => {
    const measured = measurePress([
      source('src/a.tsx', `const A = "transition duration-200 motion-safe:duration-300"; const B = "--duration-x transition-duration-fast";`),
      source('src/b.tsx', `const C = "duration-150";`),
    ]);
    expect(measured).toMatchObject({ durations: 3, durationFiles: 2 });
  });

  test('ignore les commentaires, les tests, le kit et ses routes', () => {
    const measured = measurePress([
      source('src/a.tsx', `// <button>x</button>\n/* <button>y</button> duration-200 */ const A = 1;`),
      source('src/a.test.tsx', `const A = <button>x</button>;`),
      source('src/components/kit/b.tsx', `const A = <button>x</button>;`),
      source('src/routes/kit-gallery.tsx', `const A = <button>x</button>;`),
      source('src/a.ts', `const A = "duration-200";`),
    ]);
    expect(measured).toEqual({ elements: 0, mute: 0, durations: 0, durationFiles: 0 });
  });

  test('isMeasured', () => {
    expect(isMeasured('src/components/avatar.tsx')).toBe(true);
    expect(isMeasured('src/components/kit/x.tsx')).toBe(false);
    expect(isMeasured('src/routes/kit.tsx')).toBe(false);
    expect(isMeasured('src/components/avatar.test.tsx')).toBe(false);
  });

  test('le plafond ne fait que descendre : au-dessus et en dessous échouent', () => {
    const ceiling = { mute: 10, durations: 5 };
    expect(pressRatchetProblems({ measured: ceiling, ceiling })).toEqual([]);
    expect(pressRatchetProblems({ measured: { ...ceiling, mute: 11 }, ceiling })).toHaveLength(1);
    const below = pressRatchetProblems({ measured: { ...ceiling, durations: 4 }, ceiling });
    expect(below).toHaveLength(1);
    expect(below[0]).toContain('abaisse');
  });
});

describe('l’arbre de apps/web tient son plafond', () => {
  test(`au plus ${PLAFOND.mute} boutons muets et ${PLAFOND.durations} durées littérales, et le plafond colle au compte`, () => {
    const measured = measurePress(sourcesOfTree());
    expect(pressRatchetProblems({ measured, ceiling: PLAFOND })).toEqual([]);
  });

  test('le parcours atteint bien les écrans — il n’est pas vide', () => {
    expect(measurePress(sourcesOfTree()).elements).toBeGreaterThan(500);
  });
});
