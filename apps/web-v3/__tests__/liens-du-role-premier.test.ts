/**
 * @jest-environment node
 */
// LA FRONTIÈRE DE ZONE SUR LA SURFACE QUE LA V3 SERT VRAIMENT.
//
// `eslint/frontiere-de-zone.mjs` ne visite que des `JSXOpeningElement`. Or le rôle PREMIER
// — `app/(public)/l/[token]/`, la seule surface que la v3 sert aujourd'hui — est un Route
// Handler qui compose son document à la MAIN :
//
//     `<a class="${classe}" href="${echappe(action.href)}">…`      (document.ts:146)
//     `<a class="retour" href="/" …>`                              (document.ts:197)
//
// Aucun de ces `<a>` n'est un nœud JSX : le gate livré avec le corollaire 4 du § 3.2 a
// donc ZÉRO prise sur le seul écran servi, et le fichier de règles énumérait trois angles
// morts sans nommer celui-là — le seul qui corresponde à du code écrit [revue #4414].
//
// CE QUE CE TÉMOIN AFFIRME, ET CE QU'IL N'AFFIRME PAS. Un `<a>` composé côté serveur n'est
// JAMAIS cassé : le document sort d'un Route Handler, il n'y a aucun routeur client à
// traverser, donc la forme `<a href>` est toujours la juste. Il n'y a rien à refuser ici.
// Ce qui manquait est l'INVENTAIRE : quelles cibles cette surface émet, et de quel côté de
// la frontière chacune tombe — aujourd'hui, et à l'étape du § 4.9 qui la fera basculer.
// Une cible ajoutée sans être déclarée fait rougir ce témoin ; une bascule prévue, non.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  COMPOSE_DE_PRODUCTION,
  ROUTEUR_V3,
  cheminDOrigine,
  perimetreDeNavigation,
  servieParLaV3,
} from '../scripts/lib/perimetre-de-zone.mjs';

const ROOT = join(__dirname, '..');
const DEPOT = join(ROOT, '..', '..');
const SURFACE = join(ROOT, 'app', '(public)', 'l', '[token]');

const fichiersDeLaSurface = (repertoire: string): readonly string[] =>
  readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) =>
    entree.isDirectory()
      ? fichiersDeLaSurface(join(repertoire, entree.name))
      : entree.name.endsWith('.ts') || entree.name.endsWith('.tsx')
        ? [join(repertoire, entree.name)]
        : [],
  );

// La partie STATIQUE d'un `href`, quelle que soit la façon dont il est écrit : propriété
// d'un objet (`href: '/'`), attribut d'un gabarit HTML (`href="/"`), littéral ou gabarit.
// La capture s'arrête au premier `${` — au-delà, plus rien n'est statique, exactement
// comme pour `cibleStatique` du lint JSX.
const HREF_STATIQUE = /href\s*[:=]\s*(['"`])([^'"`$]*)/g;

const ciblesStatiques = (): readonly string[] =>
  Object.freeze([
    ...new Set(
      fichiersDeLaSurface(SURFACE).flatMap((fichier) =>
        [...readFileSync(fichier, 'utf8').matchAll(HREF_STATIQUE)]
          .map(([, , tete]) => tete)
          .filter((tete): tete is string => tete !== undefined && tete !== ''),
      ),
    ),
  ]);

// Ce que chaque cible EST, et quand elle passe la frontière. `prefixe` est le `PathPrefix`
// du § 4.9 qui la réclamera : la colonne « étape » du tableau, rendue vérifiable.
type CibleDeclaree = {
  readonly cible: string;
  readonly pourquoi: string;
  readonly etape: number | null;
  readonly prefixe: string | null;
};

const DECLAREES: readonly CibleDeclaree[] = [
  {
    cible: '/',
    pourquoi: "le retour d'en-tête et l'action secondaire des deux écrans (document.ts, route.ts, etats.ts)",
    etape: 7,
    prefixe: '/',
  },
  {
    cible: '/l/',
    pourquoi: '« Réessayer ce lien » — la surface se pointe elle-même (etats.ts)',
    etape: 2,
    prefixe: '/l',
  },
  {
    cible: '/login?next=',
    pourquoi: 'le geste principal d’un lien clos : se connecter, le lien gardé de côté (etats.ts)',
    etape: 5,
    prefixe: '/login',
  },
  {
    cible: 'mailto:?subject=',
    pourquoi: 'demander un nouveau lien — un protocole qui ne navigue pas',
    etape: null,
    prefixe: null,
  },
  {
    // Trouvée par ce témoin, et c'est la preuve qu'il inventorie plutôt qu'il ne récite :
    // `<link rel="icon" href="data:,"/>` retire la requête `/favicon.ico` que le navigateur
    // expédie de lui-même — laquelle, derrière Traefik, serait servie par le LEGACY. Ce
    // n'est pas une navigation, et ça ne le deviendra à aucune étape.
    cible: 'data:,',
    pourquoi: "l'icône vide du <head> (document.ts) — une donnée en ligne, pas une adresse",
    etape: null,
    prefixe: null,
  },
];

const ligneDeCompose = (prefixe: string): string =>
  `      - "traefik.http.routers.${ROUTEUR_V3}.rule=(Host(\`meeshy.me\`)) && (PathPrefix(\`${prefixe}\`))"\n`;

const PERIMETRE_AUJOURDHUI = perimetreDeNavigation(
  readFileSync(join(DEPOT, COMPOSE_DE_PRODUCTION), 'utf8'),
);

describe('les liens du rôle premier, composés en chaîne HTML', () => {
  it("n'émet aucune cible statique qui ne soit déclarée ici", () => {
    expect([...ciblesStatiques()].sort()).toEqual(DECLAREES.map(({ cible }) => cible).sort());
  });

  // Le document est composé par un Route Handler : il n'a pas de routeur client, donc pas
  // de `<Link>` possible — et c'est ce qui rend ses `<a>` corrects par construction. Un
  // `next/link` qui apparaîtrait ici changerait la nature de la surface, et le lint JSX
  // reprendrait alors la main : le témoin dit laquelle des deux lois s'applique.
  it("reste une surface de DOCUMENT — aucun next/link, donc aucun <Link> à juger", () => {
    fichiersDeLaSurface(SURFACE).forEach((fichier) =>
      expect(readFileSync(fichier, 'utf8')).not.toContain("from 'next/link'"),
    );
  });

  it.each(DECLAREES.map((declaree) => [declaree.cible, declaree] as const))(
    '%s — hors de la zone tant que le routeur ne la réclame pas',
    (_cible, { cible }) => {
      const chemin = cheminDOrigine(cible);

      expect(chemin === null || !servieParLaV3(chemin, PERIMETRE_AUJOURDHUI)).toBe(true);
    },
  );

  it.each(
    DECLAREES.filter(
      (declaree): declaree is CibleDeclaree & { prefixe: string } => declaree.prefixe !== null,
    ).map((declaree) => [declaree.cible, declaree] as const),
  )(
    '%s — entre dans la zone à l’étape déclarée, et reste un chargement de document',
    (_cible, { cible, prefixe }) => {
      const chemin = cheminDOrigine(cible);
      const perimetre = perimetreDeNavigation(ligneDeCompose(prefixe));

      expect(chemin).not.toBeNull();
      expect(servieParLaV3(chemin as string, perimetre)).toBe(true);
    },
  );

  it('range hors du périmètre ce qui ne navigue pas — un mailto n’est pas un chemin', () => {
    const protocoles = DECLAREES.filter(({ etape }) => etape === null);

    expect(protocoles.length).toBeGreaterThan(0);
    protocoles.forEach(({ cible }) => expect(cheminDOrigine(cible)).toBeNull());
  });
});
