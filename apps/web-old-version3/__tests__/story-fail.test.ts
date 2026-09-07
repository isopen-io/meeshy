/**
 * @jest-environment node
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { glypheDuSprite, svgDuSprite } from '@/app/actifs-inlines';
import { lisLePartage, soumetsAuPartage } from '@/app/(public)/partage-porte';
import { documentDeLInvitation, documentIndisponible } from '@/app/(public)/partage-vue';
import { documentDInvitation, documentIndisponible as documentIndisponibleDUnePublication } from '@/app/connecte/commentaires-vue';
import { estUnFormat } from '@/lib/contenu/composer';
import { GENRE_HUMEUR, GENRE_REEL, GENRE_STORY, HUMEUR, type GenreServi } from '@/lib/contenu/partage';

import { AVEC_JETON, brute, json, MAINTENANT, passerelle, requete } from './lib/partage-fixtures';

/**
 * **UNE STORY INDISPONIBLE REND UN ÉCRAN SERVI PAR LE SERVEUR, INDISTINGUABLE
 * D'UN CONTENU INEXISTANT** (issue #4967, `cible/storyFail.png`).
 *
 * CE QUE CES TÉMOINS PROUVENT, ET DANS QUEL ORDRE (§ 3 de la spécification) :
 *
 *   1. l'ORACLE DU MEMBRE — quatre causes RÉELLES (absente, supprimée, échue,
 *      restreinte) et une forme DÉFENSIVE (403, que la passerelle ne produit
 *      pas aujourd'hui sur cette route, § 0) rendent une réponse IDENTIQUE,
 *      octet à octet, en-têtes compris, sur les TROIS genres ;
 *   2. le DOCUMENT ne porte AUCUNE balise d'aperçu social (og:*, twitter:*) —
 *      ces documents ne sont pas des contenus qu'on PARTAGE ;
 *   3. il DESSINE l'état vide de la charte (glyphe, `.carte-vide`, deux
 *      sorties SERVIES — jamais l'accueil, jamais une méta qui trahirait la
 *      cause) ;
 *   4. l'ORACLE DU VISITEUR — la MÊME invitation, sans un seul appel, que la
 *      story existe ou non ;
 *   5. la COPIE nomme des routes qui existent VRAIMENT sur le disque.
 *
 * `restreinte` REND 404, PAS 403 : `PostService.getPostById`
 * (`services/gateway/src/services/PostService.ts:694-745`) fond l'audience
 * dans le MÊME filtre que l'existence — « indistinguishable from "doesn't
 * exist" by design » (`:686-689`). Le 403 de ce fichier est une charge
 * DÉFENSIVE : une forme que la route ne produit pas aujourd'hui, mais que
 * `chargeDeLaStory` neutralise déjà (`publication.ts:310`) — le témoin T2
 * prouve que ce filet ne laisse RIEN passer si la passerelle changeait demain.
 */

const ROOT = join(__dirname, '..');

/** Un href composé (`/composer?format=humeur`) → le `route.ts` qu'App Router sert pour lui. */
const routeExiste = (href: string): boolean => {
  const chemin = (href.split('?')[0] ?? href).split('/').filter(Boolean);
  return existsSync(join(ROOT, 'app', ...chemin, 'route.ts'));
};

type Cause = { readonly nom: string; readonly reponse: () => Response };

/** Les CINQ charges : quatre réelles, une défensive — jamais un 403 en sortie (T1, T2). */
const causes = (id: string): readonly Cause[] => [
  { nom: 'absente', reponse: () => json({ success: false, error: 'Post not found', message: 'Post not found', code: 'POST_NOT_FOUND' }, 404) },
  { nom: 'supprimée', reponse: () => json({ success: true, data: brute({ id, deletedAt: '2026-09-02T10:00:00.000Z' }) }) },
  { nom: 'échue', reponse: () => json({ success: true, data: brute({ id, expiresAt: '2026-01-01T00:00:00.000Z' }) }) },
  // « restreinte » : la passerelle réelle la fond dans le MÊME 404 que
  // l'absente (buildVisibilityFilter) — ce bouchon en fait autant.
  { nom: 'restreinte (404, hors audience)', reponse: () => json({ success: false, error: 'Post not found', message: 'Post not found', code: 'POST_NOT_FOUND' }, 404) },
  // Forme DÉFENSIVE : la route ne rend jamais ce statut aujourd'hui (§ 0).
  { nom: '403 (forme défensive, § 0)', reponse: () => json({}, 403) },
];

const mondeDe = (id: string, reponse: () => Response): Readonly<Record<string, () => Response>> => ({
  '/api/v1/auth/me': () => json({ success: true, data: { id: 'u1', displayName: 'Amina', systemLanguage: 'fr' } }),
  [`/api/v1/posts/${id}`]: reponse,
  '/api/v1/social/posts': () => json({ success: true, data: [] }),
});

const GENRES: readonly GenreServi[] = [GENRE_STORY, GENRE_REEL, GENRE_HUMEUR];

describe('l’oracle du membre — quatre causes réelles et une forme défensive', () => {
  it.each(GENRES)('rend une réponse IDENTIQUE — statut, en-têtes, corps — sur %s', async (genre) => {
    const id = 's1';
    const reponses = await Promise.all(
      causes(id).map(({ reponse }) => {
        const monde = passerelle(mondeDe(id, reponse));
        return lisLePartage({
          genre,
          requete: requete(`${genre.base}/${id}`, AVEC_JETON),
          id,
          recuperer: monde.recuperer,
          maintenant: MAINTENANT,
        });
      }),
    );

    // T2 — JAMAIS 403 en sortie, quelle que soit la charge (y compris la 403 elle-même).
    reponses.forEach((reponse) => expect(reponse.status).toBe(404));

    const entetes = reponses.map((reponse) => JSON.stringify([...reponse.headers.entries()].sort()));
    entetes.forEach((valeur) => expect(valeur).toBe(entetes[0]));

    const corps = await Promise.all(reponses.map((reponse) => reponse.text()));
    expect(new Set(corps).size).toBe(1);
  });

  it('ne diffère pas non plus quand la charge de la story vivante porte un autre genre (T4)', async () => {
    // Un POST servi sur l'adresse d'une story : le verrou de genre (§ 5.1)
    // rend le MÊME 404 qu'une story absente.
    const monde = passerelle(mondeDe('s1', () => json({ success: true, data: brute({ type: 'POST' }) })));
    const reponse = await lisLePartage({
      genre: GENRE_STORY,
      requete: requete('/stories/s1', AVEC_JETON),
      id: 's1',
      recuperer: monde.recuperer,
      maintenant: MAINTENANT,
    });
    expect(reponse.status).toBe(404);
  });
});

describe('le document de refus', () => {
  it.each(GENRES)('ne porte aucune balise og:*, twitter:*, aucune image OG, aucune route d’aperçu — %s', (genre) => {
    const html = documentIndisponible(genre);

    expect(html).not.toMatch(/property="og:/);
    expect(html).not.toMatch(/name="twitter:/);
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('url(');
    expect(html).not.toContain('/api/og');
    expect(html).not.toContain('/api/metadata');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>');
  });

  it.each(GENRES)('n’embarque aucun script applicatif — le thème et rien d’autre — %s', (genre) => {
    const html = documentIndisponible(genre);
    expect([...html.matchAll(/<script/g)]).toHaveLength(1);
    expect(html).not.toContain('data-module');
    expect(html).not.toContain('data-participation');
  });

  it.each([
    [GENRE_STORY, 'ph-sparkle', '/feed', '/stories/new'],
    [GENRE_REEL, 'ph-film-strip', '/feed', '/feed/reels'],
    [GENRE_HUMEUR, 'ph-smiley', '/feed', '/composer?format=humeur'],
  ] as const)('dessine l’état vide de la charte — %s', (genre, glyphe, retour, secondaire) => {
    const html = documentIndisponible(genre);

    expect(html).toContain('class="carte-vide"');
    // LE SYMBOLE EST DANS LE SPRITE, pas seulement dans la copie : sans cette
    // ligne, un nom de glyphe qui n'existe pas rendrait `<svg …></svg>` VIDE
    // des DEUX côtés de la comparaison, et le témoin resterait vert sur un
    // écran sans glyphe (`svgDuSprite` enveloppe toujours, `glypheDuSprite`
    // rend '' quand le symbole manque).
    expect(glypheDuSprite(glyphe)).not.toBe('');
    expect(html).toContain(svgDuSprite(glyphe));
    expect([...html.matchAll(/<h1>/g)]).toHaveLength(1);
    expect(html).toContain(`<h1>${genre.copie.indisponible.titre}</h1>`);
    // Le paragraphe est DANS `.carte-vide` — pas ailleurs dans le document.
    expect(html).toMatch(/class="carte-vide">[\s\S]*<p>[\s\S]*<\/p>[\s\S]*<\/div>/);
    expect(html).toContain(`class="action primaire" href="${retour}"`);
    expect(html).toContain(`class="action contour" href="${secondaire.replace(/&/g, '&amp;')}"`);
    // La méta [Auteur, Publiée, Expirée] de la planche N'EST PAS rendue : elle
    // trahirait la cause que ce document refuse justement de distinguer.
    expect(html).not.toContain('Publiée');
    expect(html).not.toContain('Expirée');
  });
});

/**
 * LA CONTRE-ÉPREUVE DU REFUS (revue de #4967). `ogEtTwitter` ne se pose PAS à
 * faux pour toute la famille de `documentDeMessage` : les DEUX invitations de
 * la zone sont exactement ce qu'un robot d'aperçu — un visiteur SANS session —
 * reçoit quand on colle `/stories/:id` ou `/post/:id` dans une messagerie.
 * Leur carte est le seul aperçu que ces adresses produisent, et elle ne porte
 * aucune donnée du contenu (la v3 n'a rien demandé à la passerelle). Sans ce
 * témoin, retirer l'aperçu de tout le gabarit rendait le lot vert en cassant,
 * en silence, le dépliage de tout lien partagé.
 */
describe('l’invitation, elle, GARDE sa carte sociale', () => {
  it.each(GENRES)('déplie l’adresse partagée d’une story, d’un réel, d’une humeur — %s', (genre) => {
    const html = documentDeLInvitation({ genre, id: 's1' });

    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta name="twitter:card"');
    // Et elle ne dit RIEN du contenu : le titre est celui de l'invitation.
    expect(html).toContain(`content="${genre.copie.invitation.titre} — Meeshy"`);
  });

  it('déplie aussi l’adresse partagée d’une publication (/post/:id)', () => {
    const html = documentDInvitation({ id: 'p1' });

    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta name="twitter:card"');
  });

  /**
   * ET LE REFUS JUMEAU N'EN A PAS NON PLUS. `/post/:id` sert son propre
   * document d'indisponibilité (`commentaires-porte.ts:96,108`, 404), pour les
   * MÊMES quatre causes et avec la même exigence d'indistinguabilité. Le
   * corriger sur une seule des deux portes aurait laissé derrière l'exacte
   * moitié du défaut.
   */
  it('mais le refus d’une publication n’a pas de carte, comme celui d’une story', () => {
    const html = documentIndisponibleDUnePublication();

    expect(html).not.toMatch(/property="og:/);
    expect(html).not.toMatch(/name="twitter:/);
  });
});

describe('l’oracle du visiteur — la même invitation, sans un seul appel', () => {
  it.each(GENRES)('sert la MÊME invitation pour les cinq causes ET pour une story vivante — %s', async (genre) => {
    const id = 's1';
    const jamais = passerelle({});
    const vivante: Cause = { nom: 'vivante', reponse: () => json({ success: true, data: brute({ id }) }) };

    const reponses = await Promise.all(
      [...causes(id), vivante].map(() =>
        lisLePartage({ genre, requete: requete(`${genre.base}/${id}`), id, recuperer: jamais.recuperer, maintenant: MAINTENANT }),
      ),
    );

    reponses.forEach((reponse) => expect(reponse.status).toBe(200));
    const textes = await Promise.all(reponses.map((reponse) => reponse.text()));
    expect(new Set(textes).size).toBe(1);
    expect(jamais.appels).toEqual([]);
    expect(textes[0]).toContain(`/login?returnUrl=${encodeURIComponent(`${genre.base}/${id}`)}`);
  });

  it.each(GENRES)('sur le POST aussi, sans un seul appel — %s', async (genre) => {
    const jamais = passerelle({});
    const anonyme = new Request(`https://meeshy.me${genre.base}/s1`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ reponse: 'Bonjour' }).toString(),
    });

    const reponse = await soumetsAuPartage({ genre, requete: anonyme, id: 's1', recuperer: jamais.recuperer, maintenant: MAINTENANT });

    expect(reponse.status).toBe(200);
    expect(jamais.appels).toEqual([]);
    expect(await reponse.text()).toContain('/login?returnUrl=');
  });
});

describe('la copie', () => {
  it.each([
    [GENRE_STORY, '/stories/new'],
    [GENRE_REEL, '/feed/reels'],
    [GENRE_HUMEUR, '/composer'],
  ] as const)('nomme un retour au fil et une seconde porte SERVIE — %s', (genre, secondaireAttendue) => {
    const { indisponible } = genre.copie;

    expect(indisponible.retour.href).toBe('/feed');
    expect(indisponible.secondaire.href.split('?')[0]).toBe(secondaireAttendue);
    expect(routeExiste(indisponible.retour.href)).toBe(true);
    expect(routeExiste(indisponible.secondaire.href)).toBe(true);
  });

  /**
   * `routeExiste` ne juge que le CHEMIN. `/composer?format=humeur` porte en
   * plus une VALEUR que la porte du composeur doit reconnaître : un format
   * inconnu ne rend pas 404, il retombe sur le format par défaut — la sortie
   * mènerait donc à un écran, mais pas à CELUI qu'elle annonce. Un contrôle
   * qui ouvre autre chose que ce qu'il dit est un contrôle sans effet (charte,
   * loi 4) ; ce témoin oppose la valeur à `FORMATS_SERVIS`, son site unique.
   */
  it('nomme un format que le composeur SERT, pas seulement une route qui existe', () => {
    const format = new URL(HUMEUR.indisponible.secondaire.href, 'https://meeshy.me').searchParams.get('format');

    expect(format).not.toBeNull();
    expect(estUnFormat(format ?? '')).toBe(true);
  });
});

/**
 * LE POIDS DU DOCUMENT — mesuré, et RATCHETÉ (`budgets-mesures.json`, comme
 * `documents_du_fil`). Le document reste très loin du plafond de la charte
 * (`documents.document_o`, 9 216 o) : ce témoin n'empêche que la croissance
 * SILENCIEUSE, pas une régression de plafond.
 */
describe('le poids du document de refus', () => {
  const mesures = JSON.parse(readFileSync(join(ROOT, 'budgets-mesures.json'), 'utf8')) as {
    readonly documents_indisponible: { readonly indisponible_o: number };
  };
  const budgets = JSON.parse(readFileSync(join(ROOT, 'budgets.json'), 'utf8')) as {
    readonly documents: { readonly document_o: { readonly valeur: number } };
  };
  const octets = (source: string): number => gzipSync(Buffer.from(source, 'utf8'), { level: 9 }).length;
  const poids = octets(documentIndisponible(GENRE_STORY));

  it('ne laisse pas le document d’indisponibilité grossir en silence', () => {
    console.log(`[mesure] document d’indisponibilité ${poids} o gzip`);
    expect(poids).toBeLessThanOrEqual(mesures.documents_indisponible.indisponible_o);
  });

  /**
   * ET LE RATCHET NE PEUT PAS FRANCHIR LE PLAFOND SANS QU'ON LE VOIE. Le
   * témoin ci-dessus n'interdit que la croissance SILENCIEUSE : relever la
   * valeur enregistrée le rend vert à n'importe quelle taille, y compris
   * au-dessus des 9 216 o de la charte (règle 4) — c'est exactement ce qui est
   * arrivé au fil et à la galerie, qui la franchissent aujourd'hui. Cette
   * ligne lit le PLAFOND dans `budgets.json`, pas une constante recopiée : le
   * jour où quelqu'un ratchète ce document au-delà, il devra assumer ce
   * franchissement ici, en clair.
   */
  it('reste sous le plafond de document de la charte, pas seulement sous son propre ratchet', () => {
    expect(poids).toBeLessThanOrEqual(budgets.documents.document_o.valeur);
  });
});
