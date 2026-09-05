import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dossierDeSortie } from '../scripts/lib/arguments-de-ligne.mjs';
import {
  RC_ECHEC,
  RC_HORS_CIBLE,
  RC_NON_COMPARABLE,
  cheminDeVue,
  estRouteParametree,
  jetonsDeRoute,
  refusDeSelection,
  selectionComparable,
} from '../scripts/lib/vues-comparables.mjs';
import type { VueCible } from '../scripts/lib/vues-comparables.mjs';

// La SOURCE que l'outil de conformité lit réellement. Un témoin qui fabriquerait
// ses 37 lignes à la main dirait ce que son auteur croit, pas ce que le dépôt
// porte : c'est exactement l'écart qui a laissé `--vues linkRedirect,linkExpired`
// naviguer vers `http://…/l/:token` sans que rien ne rougisse.
const VUES_JSON = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'product',
  'MeeshyWebV3Design',
  'vues.json',
);

type IndexDeVues = { readonly vues: readonly VueCible[] };

const lisIndex = (): IndexDeVues => {
  expect(existsSync(VUES_JSON)).toBe(true);
  return JSON.parse(readFileSync(VUES_JSON, 'utf8')) as IndexDeVues;
};

const vue = (id: string, route: string, jetons?: Readonly<Record<string, string>>): VueCible =>
  jetons ? { id, route, jetons } : { id, route };

describe('ce qu’une route de vue DEMANDE', () => {
  it('nomme les jetons d’une route paramétrée, y compris dans la chaîne de requête', () => {
    expect(jetonsDeRoute('/l/:token')).toEqual(['token']);
    expect(jetonsDeRoute('/login?next=/l/:token')).toEqual(['token']);
    expect(jetonsDeRoute('/chats/:lien/messages/:id')).toEqual(['lien', 'id']);
  });

  it('ne voit aucun jeton dans une route servable telle quelle', () => {
    expect(estRouteParametree('/feed')).toBe(false);
    expect(estRouteParametree('/settings/profile')).toBe(false);
  });

  it('reconnaît les routes paramétrées de l’index RÉEL, dont les deux qui partagent /l/:token', () => {
    const { vues } = lisIndex();
    const parametrees = vues.filter((v) => estRouteParametree(v.route)).map((v) => v.id);

    expect(parametrees).toEqual(expect.arrayContaining(['linkRedirect', 'linkExpired']));
    expect(parametrees.length).toBeGreaterThanOrEqual(14);

    const partagees = vues.filter((v) => v.id === 'linkRedirect' || v.id === 'linkExpired');
    expect(new Set(partagees.map((v) => v.route)).size).toBe(1);
  });
});

describe('ce qu’un outil fait d’une route qu’il ne sait pas servir', () => {
  it('REFUSE de composer un chemin quand la vue ne déclare aucun jeton', () => {
    const resolution = cheminDeVue(vue('linkRedirect', '/l/:token'));

    expect(resolution.ok).toBe(false);
    if (resolution.ok) throw new Error('la résolution devait refuser');
    expect(resolution.manquants).toEqual(['token']);
    expect(resolution.raison).toContain(':token');
    expect(resolution.raison).toContain('linkRedirect');
  });

  it('honore le jeton que la vue DÉCLARE, dans le chemin comme dans la requête', () => {
    const direct = cheminDeVue(vue('linkRedirect', '/l/:token', { token: 'abc-123' }));
    const requete = cheminDeVue(vue('login', '/login?next=/l/:token', { token: 'abc-123' }));

    expect(direct).toEqual({ ok: true, chemin: '/l/abc-123' });
    expect(requete).toEqual({ ok: true, chemin: '/login?next=/l/abc-123' });
  });

  it('refuse un jeton déclaré vide — une valeur absente n’est pas une valeur', () => {
    expect(cheminDeVue(vue('linkRedirect', '/l/:token', { token: '' })).ok).toBe(false);
  });
});

describe('la sélection que `--vues` demande', () => {
  it('REFUSE les deux vues de l’index réel que le lot L1 comparait à la même capture', () => {
    const { vues } = lisIndex();
    const selection = selectionComparable({
      vues,
      demandees: ['linkRedirect', 'linkExpired'],
    });

    expect(selection.comparables).toEqual([]);
    expect(selection.refus.map((r) => r.id)).toEqual(['linkRedirect', 'linkExpired']);
    selection.refus.forEach((r) => expect(r.raison).toContain(':token'));
  });

  it('refuse un identifiant que l’index ne porte pas, au lieu de le passer sous silence', () => {
    const selection = selectionComparable({
      vues: [vue('feed', '/feed')],
      demandees: ['nexistePas'],
    });

    expect(selection.comparables).toEqual([]);
    expect(selection.refus).toEqual([
      { id: 'nexistePas', raison: expect.stringContaining('vues.json') as unknown as string },
    ]);
  });

  it('refuse DEUX vues qui, jetons déclarés, visent le même écran servi', () => {
    const selection = selectionComparable({
      vues: [
        vue('linkRedirect', '/l/:token', { token: 'meme' }),
        vue('linkExpired', '/l/:token', { token: 'meme' }),
      ],
      demandees: ['linkRedirect', 'linkExpired'],
    });

    expect(selection.comparables).toEqual([]);
    expect(selection.refus.map((r) => r.id)).toEqual(['linkRedirect', 'linkExpired']);
    selection.refus.forEach((r) => expect(r.raison).toContain('/l/meme'));
  });

  it('accepte les deux dès que chacune déclare SON état', () => {
    const selection = selectionComparable({
      vues: [
        vue('linkRedirect', '/l/:token', { token: 'vivant' }),
        vue('linkExpired', '/l/:token', { token: 'expire' }),
      ],
      demandees: ['linkRedirect', 'linkExpired'],
    });

    expect(selection.refus).toEqual([]);
    expect(selection.comparables.map((c) => c.chemin)).toEqual(['/l/vivant', '/l/expire']);
  });

  // « / » sert deux écrans (conception § ROUTES) : la vitrine sans session, le
  // tableau de bord AVEC — la même route, séparée par un ÉTAT DE SESSION plutôt
  // que par un jeton de route, exactement comme `linkRedirect`/`linkExpired` se
  // séparent par un jeton. Sans ce cas, `vues.json` réel refuse « home » ET
  // « vitrine » dès qu'aucun `--vues` ne les filtre — c'est ce que
  // `v3-rapport.mjs` a mesuré (« conformité du rendu » restait NON EXÉCUTÉE).
  it('deux vues de la MÊME route ne collisionnent pas quand leurs sessions diffèrent', () => {
    const selection = selectionComparable({
      vues: [vue('vitrine', '/'), vue('home', '/', { '@session': 'membre' })],
      demandees: ['vitrine', 'home'],
    });

    expect(selection.refus).toEqual([]);
    expect(selection.comparables.map((c) => c.id)).toEqual(['vitrine', 'home']);
  });

  it('deux vues de la MÊME route ET de la MÊME session restent refusées', () => {
    const selection = selectionComparable({
      vues: [
        vue('vitrine', '/', { '@session': 'membre' }),
        vue('home', '/', { '@session': 'membre' }),
      ],
      demandees: ['vitrine', 'home'],
    });

    expect(selection.comparables).toEqual([]);
    expect(selection.refus.map((r) => r.id)).toEqual(['vitrine', 'home']);
    selection.refus.forEach((r) => expect(r.raison).toContain('/'));
  });

  it('sans `--vues`, écarte les routes paramétrées et DIT lesquelles', () => {
    const selection = selectionComparable({
      vues: [vue('feed', '/feed'), vue('linkRedirect', '/l/:token')],
      demandees: [],
    });

    expect(selection.comparables.map((c) => c.id)).toEqual(['feed']);
    expect(selection.ignorees).toEqual(['linkRedirect']);
    expect(selection.refus).toEqual([]);
  });
});

describe('le verdict d’une sélection — jamais vert sans avoir mesuré', () => {
  it('rend un refus BRUYANT et un code distinct de « hors cible » et d’« échec »', () => {
    const selection = selectionComparable({
      vues: [vue('linkRedirect', '/l/:token')],
      demandees: ['linkRedirect'],
    });
    const refus = refusDeSelection(selection);

    expect(refus).not.toBeNull();
    expect(refus?.rc).toBe(RC_NON_COMPARABLE);
    expect(RC_NON_COMPARABLE).not.toBe(RC_HORS_CIBLE);
    expect(RC_NON_COMPARABLE).not.toBe(RC_ECHEC);
    expect(refus?.messages.join(' ')).toContain('linkRedirect');
  });

  // `exigeUnManifesteLu`, appliqué à une SÉLECTION : un outil qui n’a comparé
  // AUCUNE vue n’a pas mesuré, et un « 0/0 conformes » sortant à zéro serait le
  // verdict le plus cher du dépôt — vert sans avoir rien regardé.
  it('refuse une sélection VIDE plutôt que d’en rendre un verdict vert', () => {
    expect(refusDeSelection(selectionComparable({ vues: [], demandees: [] }))?.rc).toBe(
      RC_NON_COMPARABLE,
    );
    expect(
      refusDeSelection(selectionComparable({ vues: [vue('l', '/l/:token')], demandees: [] }))?.rc,
    ).toBe(RC_NON_COMPARABLE);
  });

  it('ne refuse rien quand la sélection porte au moins une vue servable', () => {
    expect(refusDeSelection(selectionComparable({ vues: [vue('feed', '/feed')], demandees: [] }))).toBeNull();
  });
});

describe('le dossier de sortie qu’un harnais de capture accepte', () => {
  it('REFUSE un drapeau pris pour un dossier — aucun dossier nommé `--vues` ne peut naître', () => {
    const refus = dossierDeSortie(['--vues', 'linkRedirect'], '/defaut');

    expect(refus.ok).toBe(false);
    if (refus.ok) throw new Error('le drapeau devait être refusé');
    expect(refus.raison).toContain('--vues');
  });

  it('refuse toute forme commençant par un tiret, y compris `--help` et `-x`', () => {
    expect(dossierDeSortie(['--help'], '/defaut').ok).toBe(false);
    expect(dossierDeSortie(['-x'], '/defaut').ok).toBe(false);
  });

  it('accepte un chemin, et retombe sur le défaut quand rien n’est passé', () => {
    expect(dossierDeSortie(['/tmp/cibles'], '/defaut')).toEqual({ ok: true, dossier: '/tmp/cibles' });
    expect(dossierDeSortie([], '/defaut')).toEqual({ ok: true, dossier: '/defaut' });
    expect(dossierDeSortie([''], '/defaut')).toEqual({ ok: true, dossier: '/defaut' });
  });
});
