import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { axe } from 'jest-axe';

import { documentDuFilSocial, type EtatDuFilSocial } from '@/app/connecte/social-vue';
import { textesDuPost, type PostDuFil, type Vignette } from '@/lib/api/social';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — le document du fil social (#5031).
 *
 * LE GROUPE DE BOUTONS RADIO EST LE TÉMOIN QUI COMPTE : il prouve que TOUS les
 * textes distincts d'un post sont dans le document, un radio par langue, le
 * premier COCHÉ — l'effet lui-même (« cliquer change le texte lu ») est un
 * fait de CSS pur (`input:checked+.texte{display:block}`, une seule règle
 * générique) que jsdom n'applique pas au rendu : sa preuve est
 * `e2e/visual/v3-feed-a11y.spec.ts`, dans un vrai navigateur — le même partage
 * que `commentaires-a11y` fait déjà pour `<details>`.
 */

const POST: PostDuFil = {
  id: 'post-1',
  genre: 'POST',
  auteur: 'Ibrahim',
  auteurId: 'u-ibrahim',
  publieA: '2026-09-03T07:41:00.000Z',
  textes: [
    { langue: 'fr', texte: 'La revue de mars est prête. Trois graphiques, deux surprises.', origine: false },
    { langue: 'en', texte: 'The March review is ready. Three charts, two surprises.', origine: true },
  ],
  medias: [],
  aimeParMoi: false,
  aimes: 128,
  commentaires: 12,
  reposts: 4,
  reposteParMoi: false,
};

const REEL: PostDuFil = {
  id: 'post-2',
  genre: 'REEL',
  auteur: 'Marta Ruiz',
  auteurId: 'u-marta',
  publieA: '2026-09-02T09:00:00.000Z',
  textes: [{ langue: null, texte: 'Nuevo glosario compartido para el equipo.', origine: true }],
  medias: [{ url: 'https://cdn.test/reel.jpg', genre: 'image', alt: null, largeur: 800, hauteur: 600, affiche: null }],
  aimeParMoi: true,
  aimes: 9,
  commentaires: 0,
  reposts: 0,
  reposteParMoi: true,
};

const STORY: Vignette = { id: 's1', auteur: 'Sara', auteurId: 'u-sara', vu: false };

const ETAT: EtatDuFilSocial = {
  stories: [STORY],
  posts: [POST, REEL],
  curseurSuivant: null,
  maintenant: Date.parse('2026-09-03T09:41:00.000Z'),
  fait: null,
  echoue: false,
  tempsReel: null,
};

const graves = async (): Promise<readonly string[]> => {
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

const peint = (html: string): void => {
  document.open();
  document.write(html);
  document.close();
};

describe('le document du fil social', () => {
  it('rend le rail de stories, chaque story étant un lien INDIVIDUELLEMENT focusable', () => {
    peint(documentDuFilSocial(ETAT));

    const liens = [...document.querySelectorAll('.rail a')];
    expect(liens).toHaveLength(1);
    expect(liens[0]?.getAttribute('href')).toBe('/stories/s1');
    expect(liens[0]?.textContent).toContain('Sara');
  });

  it('n’affiche AUCUN rail quand le lecteur n’en a aucune — pas de couloir vide', () => {
    peint(documentDuFilSocial({ ...ETAT, stories: [] }));

    expect(document.querySelector('.rail')).toBeNull();
    // Sans rail, rien à sauter — le lien de contournement ne se rend pas non plus.
    expect(document.querySelector('a.saut')).toBeNull();
  });

  it('porte l’état vu/non-vu sur l’anneau de chaque story (§ défaut 9, cible/feed.png)', () => {
    peint(
      documentDuFilSocial({
        ...ETAT,
        stories: [STORY, { id: 's2', auteur: 'Ibrahim', auteurId: 'u-ibrahim', vu: true }],
      }),
    );

    const cercles = [...document.querySelectorAll<HTMLElement>('.rail .cercle')];
    expect(cercles.map((c) => c.dataset.vu)).toEqual(['0', '1']);
  });

  it('rend un lien qui SAUTE le rail vers les publications, atteignable au clavier', () => {
    peint(documentDuFilSocial(ETAT));

    const saut = document.querySelector('a.saut');
    expect(saut).not.toBeNull();
    expect(saut?.getAttribute('href')).toBe('#publications');
    expect(document.querySelector('#publications')?.getAttribute('tabindex')).toBe('-1');
  });

  it('donne à chaque carte son ANCRE (`#post-<id>`) — la place du lecteur survit au rechargement (défaut 11)', () => {
    peint(documentDuFilSocial(ETAT));

    expect(document.querySelector('article[data-post="post-1"]')?.id).toBe('post-post-1');
    expect(document.querySelector('article[data-post="post-2"]')?.id).toBe('post-post-2');
  });

  it('ne rend AUCUN lien de pagination quand `curseurSuivant` est nul', () => {
    peint(documentDuFilSocial(ETAT));

    expect(document.querySelector('a.plus')).toBeNull();
  });

  it('rend le lien de pagination vers `?cursor=` quand `curseurSuivant` est servi — jamais une valeur calculée qu’aucun lecteur n’atteint (cycle 122)', () => {
    peint(documentDuFilSocial({ ...ETAT, curseurSuivant: 'c2' }));

    const lien = document.querySelector('a.plus');
    expect(lien).not.toBeNull();
    expect(lien?.getAttribute('href')).toBe('/feed?cursor=c2');
  });

  it('rend un GROUPE de boutons radio pour un post à plusieurs langues, l’élu du Prisme COCHÉ', () => {
    peint(documentDuFilSocial(ETAT));

    const article = document.querySelector('article[data-post="post-1"]');
    const radios = [...article!.querySelectorAll<HTMLInputElement>('.prisme-multi input[type="radio"]')];
    expect(radios).toHaveLength(2);
    expect(radios[0]?.checked).toBe(true);
    expect(radios[1]?.checked).toBe(false);

    const textes = [...article!.querySelectorAll('.prisme-multi .texte')];
    expect(textes[0]?.textContent).toContain('La revue de mars est prête');
    // Le français ÉLU est la langue du DOCUMENT : aucun `lang=` n'y est posé,
    // il serait redondant avec `<html lang="fr">` — la même règle que
    // `commentaires-vue.ts`.
    expect(textes[0]?.getAttribute('lang')).toBeNull();
    expect(textes[1]?.textContent).toContain('The March review is ready');
    expect(textes[1]?.getAttribute('lang')).toBe('en');

    // Chaque radio a un LABEL qui le nomme — le contrôle a un nom accessible.
    const labels = [...article!.querySelectorAll('.prisme-multi label')];
    expect(labels).toHaveLength(2);
    expect(labels[0]?.getAttribute('for')).toBe(radios[0]?.id);
  });

  it('ne rend AUCUN groupe pour un post à un seul texte — un radio de un n’offre aucun choix', () => {
    peint(documentDuFilSocial(ETAT));

    const article = document.querySelector('article[data-post="post-2"]');
    expect(article!.querySelector('.prisme-multi')).toBeNull();
    expect(article!.querySelector('.texte')?.textContent).toContain('Nuevo glosario');
  });

  it('rend le média d’un post — une image, avec ses dimensions', () => {
    peint(documentDuFilSocial(ETAT));

    const img = document.querySelector('article[data-post="post-2"] .media img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn.test/reel.jpg');
    expect(img?.getAttribute('width')).toBe('800');
  });

  it('le geste « aimer » porte `aria-pressed` selon l’état SERVI', () => {
    peint(documentDuFilSocial(ETAT));

    const nonAime = document.querySelector('article[data-post="post-1"] .geste-aime button');
    expect(nonAime?.getAttribute('aria-pressed')).toBe('false');
    expect(nonAime?.querySelector('.valeur')?.textContent).toBe('128');

    const aime = document.querySelector('article[data-post="post-2"] .geste-aime button');
    expect(aime?.getAttribute('aria-pressed')).toBe('true');
  });

  it('le repost NON fait rend un bouton visible et l’état « Reposté » CACHÉ', () => {
    peint(documentDuFilSocial(ETAT));

    const article = document.querySelector('article[data-post="post-1"]')!;
    expect((article.querySelector('.geste-reposter') as HTMLElement | null)?.hidden).toBe(false);
    expect((article.querySelector('.geste-reposte') as HTMLElement | null)?.hidden).toBe(true);
  });

  it('le repost DÉJÀ FAIT rend l’état « Reposté » et cache le formulaire — plus un bouton', () => {
    peint(documentDuFilSocial(ETAT));

    const article = document.querySelector('article[data-post="post-2"]')!;
    expect((article.querySelector('.geste-reposter') as HTMLElement | null)?.hidden).toBe(true);
    expect((article.querySelector('.geste-reposte') as HTMLElement | null)?.hidden).toBe(false);
    expect(article.querySelector('.geste-reposte')?.querySelector('.valeur')?.textContent).toBe('0');
    // Aucune route ne défait un repost : ce n'est plus un <button>.
    expect(article.querySelector('.geste-reposte button')).toBeNull();
  });

  it('dessine l’état vide plutôt qu’une liste nue', () => {
    peint(documentDuFilSocial({ ...ETAT, posts: [] }));

    expect(document.body.textContent).toContain('Aucune publication');
  });

  it('confirme un geste réussi dans la région aria-live, et une erreur dans une alerte', () => {
    peint(documentDuFilSocial({ ...ETAT, fait: 'repost' }));
    expect(document.getElementById('journal-des-gestes')?.textContent).toContain('repartagée');

    peint(documentDuFilSocial({ ...ETAT, echoue: true }));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('pas pu être envoyé');
  });
});

describe('le fil social face à axe', () => {
  it('ne porte aucune violation grave, garni', async () => {
    peint(documentDuFilSocial(ETAT));

    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave, vide', async () => {
    peint(documentDuFilSocial({ ...ETAT, stories: [], posts: [] }));

    expect(await graves()).toEqual([]);
  });

  it('rougit sur un document dont la structure est fautive', async () => {
    peint('<html><body><div tabindex="0"><img src="x"></div></body></html>');

    expect(await graves()).not.toEqual([]);
  });
});

/**
 * LE POIDS DU DOCUMENT — mesuré, et RATCHETÉ (`budgets-mesures.json` ›
 * `documents_du_feed`), sur le MÊME patron que `documents_du_fil`
 * (`__tests__/fil-plein.test.ts`). Défaut corrigé : `textesDuPost` inlinait
 * TOUTE la carte `translations` d'un post, sans jamais consulter le Prisme du
 * lecteur (`langues`) — 3 à 12 langues par publication populaire est le cas
 * NOMINAL d'un produit multilingue (§ schéma, « une traduction naît au
 * premier accès d'un viewer dans cette langue »), pas la queue, et franchissait
 * le plafond de `budgets.json › documents.document_o` (9 216 o) dès la
 * TROISIÈME. La fixture ci-dessous réplique ce cas nominal — VINGT
 * publications (`limite` de `filSocial`), CHACUNE traduite dans DOUZE langues
 * — pour que le témoin rougisse si le Prisme cesse un jour d'être consulté.
 */
describe('le poids du document du fil social', () => {
  const octets = (source: string): number => gzipSync(Buffer.from(source, 'utf8'), { level: 9 }).length;
  const mesures = JSON.parse(readFileSync(join(__dirname, '..', 'budgets-mesures.json'), 'utf8')) as {
    readonly documents_du_feed: { readonly feed_o: number };
  };
  const PLAFOND_DE_LA_CHARTE_O = JSON.parse(readFileSync(join(__dirname, '..', 'budgets.json'), 'utf8')).documents
    .document_o.valeur as number;

  const LANGUES_DU_MONDE = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ro', 'sv', 'tr', 'ja'];
  const carte = Object.fromEntries(LANGUES_DU_MONDE.slice(1).map((langue) => [langue, `Texte en ${langue} — assez long pour ressembler à une vraie publication, avec quelques mots de plus.`]));

  const POST_POPULAIRE = (id: string): PostDuFil => ({
    id,
    genre: 'POST',
    auteur: 'Quelqu’un dont le nom occupe une place raisonnable',
    auteurId: `u-${id}`,
    publieA: '2026-09-03T07:41:00.000Z',
    // Le lecteur ne préfère QUE le français : `textesDuPost` borne au Prisme
    // du LECTEUR, jamais à la carte entière du post.
    textes: textesDuPost({ carte, langueOriginale: 'fr', texteOriginal: carte.fr ?? 'Texte en fr — assez long pour ressembler à une vraie publication.', langues: ['fr'] }),
    medias: [],
    aimeParMoi: false,
    aimes: 128,
    commentaires: 12,
    reposts: 4,
    reposteParMoi: false,
  });

  const ETAT_CHARGE: EtatDuFilSocial = {
    ...ETAT,
    stories: Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, auteur: `Story ${i}`, auteurId: `u-s${i}`, vu: i % 2 === 0 })),
    posts: Array.from({ length: 20 }, (_, i) => POST_POPULAIRE(`p${i}`)),
  };

  it('ne laisse pas le document grossir en silence — même quand chaque post porte douze traductions', () => {
    const poids = octets(documentDuFilSocial(ETAT_CHARGE));
    console.log(`[mesure] document du feed ${poids} o gzip (20 posts × 12 langues, Prisme borné à 1)`);

    expect(poids).toBeLessThanOrEqual(mesures.documents_du_feed.feed_o);
  });

  it('tient sous le plafond de la charte (§ 12.5 règle 4) — la queue d’un produit multilingue ne le franchit plus', () => {
    const poids = octets(documentDuFilSocial(ETAT_CHARGE));
    expect(poids).toBeLessThanOrEqual(PLAFOND_DE_LA_CHARTE_O);
  });
});
