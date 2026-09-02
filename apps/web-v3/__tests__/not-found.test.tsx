import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import { blocsCss } from '../scripts/check-jetons.mjs';
import { arrondi, contraste, resout } from '../scripts/lib/couleur.mjs';
import { DOCUMENT_LANGUAGE } from '../app/document-language';
import RootLayout from '../app/layout';
import NotFound from '../app/not-found';

const V3 = join(__dirname, '..');
const JETONS = join(V3, '..', '..', 'packages', 'design-tokens');

const markup = (): string =>
  renderToStaticMarkup(
    <RootLayout>
      <NotFound />
    </RootLayout>,
  );

describe('le 404 de la v3', () => {
  it("est celui de la v3, pas la chaîne anglaise codée en dur par le framework", () => {
    expect(markup()).not.toContain('This page could not be found');
    expect(markup()).toContain('Page introuvable');
  });

  it('est servi dans la langue que la coquille déclare', () => {
    expect(markup()).toContain(`<html lang="${DOCUMENT_LANGUAGE}"`);
  });

  it('pose le repère principal que le gate a11y exige', () => {
    expect(markup()).toContain('<main id="main-content">');
  });

  it("annonce l'erreur par un titre, jamais par un simple paragraphe", () => {
    expect(markup()).toMatch(/<h1[^>]*>/);
  });

  it("ne charge aucun script hors celui du thème", () => {
    expect(markup()).not.toContain('<script src=');
  });

  // Un 404 sans issue était le contournement de L-0.5 : `no-html-link-for-pages`
  // refusait le seul lien que cette page puisse porter. La sortie mène à `/`,
  // que le legacy sert jusqu'à l'étape 7 du § 4.9 — donc un `<a>` réel, jamais
  // un `<Link>` : la navigation client de Next ne traverse pas la frontière.
  it('rend une sortie, et cette sortie franchit la zone par un chargement de document', () => {
    expect(markup()).toMatch(/<a class="sortie" href="\/"/);
  });

  // `nofollow` vers sa PROPRE page d'accueil ne veut rien dire, et `noreferrer`
  // priverait le legacy du `Referer` sur le franchissement de zone qu'on cherche
  // justement à pouvoir tracer. Les deux étaient cimentés par une assertion sans
  // qu'aucune raison ne soit écrite. [revue #4414]
  it('ne pose aucun rel — ni nofollow vers son propre accueil, ni noreferrer sur un saut de zone', () => {
    expect(markup()).not.toContain('rel=');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// CE QUE LA SORTIE MONTRE — dimension 5
// ───────────────────────────────────────────────────────────────────────────
// Un `<a>` sans classe n'est pas « non stylé » : il est peint par le navigateur,
// `#0000EE`, soit 2,05:1 sur `--color-bg` du schéma SOMBRE. Le corollaire 2 du
// § 3.2 ne pouvait pas l'attraper — il refuse les couleurs ÉCRITES, et ici
// aucune valeur ne l'était. Et axe ne le voit pas non plus : `e2e/visual/lib/a11y.ts`
// dit lui-même que `not-found.tsx` « n'est servi par personne » tant qu'aucune
// page d'App Router n'existe. La lisibilité de cet écran ne tient donc qu'ici.
const globals = (): string => readFileSync(join(V3, 'app', 'globals.css'), 'utf8');

// `blocsCss` ne rend que les CUSTOM PROPERTIES d'un bloc — c'est ce dont le gate
// des jetons a besoin, et ce n'est pas ce qu'on demande ici : la question porte
// sur `color`, `min-block-size`, `text-decoration`. La lecture reste locale et
// tient en trois lignes ; elle ne prétend pas être un parseur CSS.
const declarationsDe = (selecteur: string): Readonly<Record<string, string>> => {
  const bloc = new RegExp(`(?:^|\\})\\s*\\${selecteur}\\s*\\{([^}]*)\\}`, 'm').exec(globals());
  const corps = bloc?.[1];
  if (corps === undefined) throw new Error(`aucun bloc ${selecteur} dans app/globals.css`);
  return Object.fromEntries(
    corps
      .split(';')
      .map((declaration) => declaration.split(':'))
      .filter((paire): paire is [string, string] => paire.length === 2)
      .map(([propriete, valeur]) => [propriete.trim(), valeur.trim()]),
  );
};

const jetonsDe = (fichier: string, selecteur: string): Readonly<Record<string, string>> =>
  Object.assign(
    {},
    ...blocsCss(readFileSync(join(JETONS, fichier), 'utf8'))
      .filter((bloc: { selecteurs: readonly string[] }) => bloc.selecteurs.includes(selecteur))
      .map((bloc: { jetons: Readonly<Record<string, string>> }) => bloc.jetons),
  );

const SCHEMAS = [
  { nom: 'sombre', fichier: 'dark.css', selecteur: ':root' },
  { nom: 'clair', fichier: 'light.css', selecteur: ':root.light' },
] as const;

const table = (schema: (typeof SCHEMAS)[number]): Readonly<Record<string, string>> => ({
  ...jetonsDe('tokens.css', ':root'),
  ...jetonsDe(schema.fichier, schema.selecteur),
});

const JETON = /^var\((--[\w-]+)\)$/;

const TEXTE = 4.5;

describe('la sortie du 404 se voit, dans les deux schémas', () => {
  const sortie = declarationsDe('.sortie');

  it('prend sa couleur dans la table, jamais au navigateur ni à une valeur écrite', () => {
    expect(sortie.color).toMatch(JETON);
  });

  it.each(SCHEMAS.map((schema) => [schema.nom, schema] as const))(
    'tient 4,5:1 sur le fond servi — schéma %s',
    (_nom, schema) => {
      const [, jeton] = JETON.exec(sortie.color ?? '') ?? [];
      const encre = resout(table(schema), jeton ?? '');
      const fond = resout(table(schema), '--color-bg');

      expect(encre).not.toBeNull();
      expect(fond).not.toBeNull();
      expect(arrondi(contraste(encre as string, fond as string))).toBeGreaterThanOrEqual(TEXTE);
    },
  );

  it('offre une cible de 44 px, pas une ligne de texte de 15', () => {
    expect(sortie['min-block-size']).toBe('44px');
  });

  it('reste repérable sans la couleur seule', () => {
    expect(sortie['text-decoration']).toBe('underline');
  });

  // Le bleu par défaut de l'agent utilisateur, mesuré sur le fond SOMBRE : c'est
  // la valeur que ce lot corrige, et l'écrire ici la rend rejouable. Le même
  // bleu rend ~8,4:1 en clair — le défaut était sombre-seul, c'est-à-dire
  // l'inverse du biais habituel, et c'est pourquoi personne ne l'avait regardé.
  it('mesure ce qu’un <a> NU aurait rendu — 2,05:1, très en dessous de AA', () => {
    const fond = resout(table(SCHEMAS[0]), '--color-bg');

    expect(arrondi(contraste('#0000EE', fond as string))).toBeLessThan(TEXTE);
    expect(arrondi(contraste('#0000EE', fond as string))).toBeCloseTo(2.05, 1);
  });
});
