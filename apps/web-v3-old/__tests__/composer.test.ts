/**
 * @jest-environment node
 */

import { LIS_LE_COMPOSER, PUBLIE_DEPUIS_LE_COMPOSER } from '@/app/connecte/composer-porte';
import { documentDuComposer, type EtatDuComposer } from '@/app/connecte/composer-vue';
import { ACCEPTED_MIME_TYPES } from '@meeshy/shared/types/attachment';

import { FEUILLE_DU_COMPOSER } from '@/app/connecte/composer-feuille';
import {
  CHAMPS_DU_COMPOSER,
  COMPOSER,
  FORMATS_SERVIS,
  HUMEURS,
  LONGUEUR_MAX_DU_CONTENU,
  MAX_POST_MEDIA,
  OCTETS_MAX_DE_LA_CHARGE,
  OCTETS_MAX_PAR_MEDIA,
  OCTETS_MAX_PAR_PUBLICATION,
} from '@/lib/contenu/composer';

/**
 * `/composer` (#4966) — CE QUE L'ÉCRAN PUBLIE, opposé à un serveur cousu.
 *
 * **`publie()` A ATTERRI SUR `dev` SANS UN SEUL TÉMOIN** — mesuré le
 * 2026-09-04 : la primitive de création existait, écrite pour cet écran, et
 * aucun test ne l'exerçait, aucune route ne l'appelait. Ces témoins sont donc
 * autant les siens que ceux de la porte : ils opposent le CORPS RÉELLEMENT
 * ENVOYÉ à la passerelle, pas la forme du document.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';
const ORIGINE = 'https://meeshy.test';

const requete = (chemin: string, avecJeton = true): Request =>
  new Request(`${ORIGINE}${chemin}`, { headers: avecJeton ? { cookie: COOKIE } : {} });

const poste = (
  corps: Readonly<Record<string, string>>,
  options: { readonly avecJeton?: boolean; readonly origine?: string | null } = {},
): Request =>
  new Request(`${ORIGINE}/composer`, {
    method: 'POST',
    headers: {
      ...(options.avecJeton === false ? {} : { cookie: COOKIE }),
      ...(options.origine === null ? {} : { origin: options.origine ?? ORIGINE }),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(corps).toString(),
  });

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

/** Un fichier de test — `File` est global depuis Node 20 (Undici), pas besoin d'un polyfill. */
const fichierDeTest = (nom: string, type: string, contenu = 'contenu'): File => new File([contenu], nom, { type });

/**
 * UN FORMULAIRE MULTIPART (#5390) — le même `new Request` que `poste()`, mais
 * un corps `FormData` : `Content-Type: multipart/form-data; boundary=…` est
 * posé par la plateforme elle-même, jamais à la main.
 */
const posteMultipart = (
  champs: Readonly<Record<string, string>>,
  fichiers: readonly File[] = [],
  options: {
    readonly avecJeton?: boolean;
    readonly origine?: string | null;
    /** Les dix champs `medias-alt` (#5390, revue — défaut 3) — RÉPÉTÉS, dans l'ordre. */
    readonly alts?: readonly string[];
  } = {},
): Request => {
  const donnees = new FormData();
  Object.entries(champs).forEach(([cle, valeur]) => donnees.append(cle, valeur));
  fichiers.forEach((fichier) => donnees.append(CHAMPS_DU_COMPOSER.medias, fichier));
  (options.alts ?? []).forEach((alt) => donnees.append(CHAMPS_DU_COMPOSER.mediasAlt, alt));
  return new Request(`${ORIGINE}/composer`, {
    method: 'POST',
    headers: {
      ...(options.avecJeton === false ? {} : { cookie: COOKIE }),
      ...(options.origine === null ? {} : { origin: options.origine ?? ORIGINE }),
    },
    body: donnees,
  });
};

const LECTRICE = {
  id: 'u-amina',
  username: 'amina',
  displayName: 'Amina Diallo',
  systemLanguage: 'fr',
  regionalLanguage: 'wo',
  customDestinationLanguage: null,
};

/**
 * Le serveur cousu RETIENT le corps envoyé — c'est lui, le sujet. Étendu par
 * #5390 pour `POST /api/v1/uploads` (TUS, creation-with-upload — un seul
 * `POST` complet, jamais de repli PATCH ici : voir `medias-de-post.test.ts`
 * pour ce second chemin) et `DELETE /api/v1/posts/media/:id`.
 */
const serveur = (
  options: {
    readonly statutDeLaPublication?: number;
    readonly lecteur?: unknown;
    /** Le RANG (1-indexé) d'upload à faire échouer, et sa réponse — copie `onUploadCreate` (texte brut, pas de JSON). */
    readonly refusUpload?: { readonly rang: number; readonly statut: number; readonly message: string };
  } = {},
) => {
  const corps: unknown[] = [];
  const uploads: { readonly url: string }[] = [];
  const suppressions: string[] = [];
  let rangUpload = 0;
  const recuperer = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.includes('/auth/me')) return json({ success: true, data: options.lecteur ?? LECTRICE });
    if (url.endsWith('/api/v1/uploads')) {
      rangUpload += 1;
      uploads.push({ url });
      if (options.refusUpload?.rang === rangUpload) {
        return new Response(options.refusUpload.message, { status: options.refusUpload.statut });
      }
      // `onUploadFinish` (`tus-handler.ts:581-622`) — le corps de fin, rendu
      // directement puisque ce bouchon reçoit toujours l'octet ENTIER en un
      // seul `POST` (creation-with-upload).
      return json({ success: true, data: { attachment: { id: `media-${rangUpload}` } } });
    }
    if (url.includes('/api/v1/posts/media/')) {
      suppressions.push(url);
      return json({ success: true, data: { message: 'Media deleted' } });
    }
    if (url.endsWith('/api/v1/posts')) {
      corps.push(JSON.parse(String(init?.body ?? '{}')));
      const statut = options.statutDeLaPublication ?? 201;
      return statut >= 400
        ? json({ success: false, error: { message: 'Contenu refusé.' } }, statut)
        : json({ success: true, data: { id: 'p-neuf' } }, statut);
    }
    throw new Error(`appel non prévu : ${url}`);
  };
  return { corps, uploads, suppressions, recuperer };
};

describe('le composer servi', () => {
  it('renvoie vers la connexion sans jeton', async () => {
    const reponse = await LIS_LE_COMPOSER(requete('/composer', false), serveur().recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fcomposer');
  });

  /**
   * DEUX ONGLETS, ET C'EST LE SUJET. Un onglet « Réel » ou « Story » serait un
   * lien vers une publication que cet écran ne peut pas composer, ou vers une
   * route qui n'existe pas : le contrôle sans effet de la charte règle 7. Le
   * témoin nomme les DEUX absents plutôt que de compter — un compte qui
   * passerait de 2 à 3 ne dirait pas lequel est revenu.
   */
  it('ne rend que les formats qu’il peut publier', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer'), serveur().recuperer)).text();

    expect(html).toContain('href="/composer?format=post"');
    expect(html).toContain('href="/composer?format=humeur"');
    expect(html).not.toContain('format=reel');
    // « Story » n'est PAS un format de ce formulaire : c'est un écran, et son
    // onglet MÈNE ailleurs (#5033).
    expect(html).not.toContain('format=story');
  });

  /**
   * L'ONGLET « STORY » EST UN LIEN VERS SON ÉCRAN, et il ne porte jamais
   * `aria-current` : on n'est jamais « sur » la story depuis le composer. Ce
   * témoin garde la porte de `/stories/new` — leçon 507 — ET la distinction :
   * un `?format=story` voudrait dire que le composer la publie lui-même, avec
   * le mauvais défaut d'audience.
   */
  it('mène à l’écran de story, sans prétendre y être', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer'), serveur().recuperer)).text();

    expect(html).toContain('href="/stories/new"');
    expect(html).not.toContain('href="/stories/new" aria-current');
  });

  it('sert le format demandé, et le dit à autre chose qu’à la couleur', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=humeur'), serveur().recuperer)).text();

    expect(html).toContain('href="/composer?format=humeur" aria-current="page"');
    expect(html).toContain(HUMEURS[0]);
  });

  /** Un format inventé dans l'adresse n'atteint pas le document. */
  it('retombe sur le premier format devant une valeur inconnue', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=<script>'), serveur().recuperer)).text();

    expect(html).toContain(`href="/composer?format=${FORMATS_SERVIS[0].cle}" aria-current="page"`);
    expect(html).not.toContain('<script>a');
  });

  /**
   * LA BORNE EST DITE ET APPLIQUÉE, et elle vient du schéma. Le « 140 » de la
   * cible n'est appliqué par aucune route : l'afficher aurait été un chiffre
   * que rien ne tient.
   */
  it('applique la borne de CreatePostSchema, jamais celle de la planche', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer'), serveur().recuperer)).text();

    expect(html).toContain(`maxlength="${LONGUEUR_MAX_DU_CONTENU}"`);
    expect(html).not.toContain('maxlength="140"');
  });

  /**
   * LA LIGNE « TRADUCTION » DIT LA LANGUE RÉELLE, pas « Auto ». Elle annonce ce
   * qui va être REVENDIQUÉ — le premier rang du Prisme de la lectrice.
   */
  it('annonce la langue que la publication revendiquera', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer'), serveur().recuperer)).text();

    expect(html).toContain('Publié en français');
  });

  /**
   * ET IL SE TAIT QUAND RIEN N'EST DÉCLARÉ — le témoin qui a attrapé le défaut.
   * La première écriture lisait `languesDuLecteur`, qui retombe sur « fr » :
   * un compte sans langue configurée aurait publié tout son contenu ÉTIQUETÉ
   * FRANÇAIS, et chaque lecteur aurait traduit depuis une langue jamais
   * écrite. Le repli d'une LECTURE n'est pas la valeur d'une ÉCRITURE.
   */
  it('se tait sur la langue quand le lecteur n’en déclare aucune', async () => {
    const sans = { ...LECTRICE, systemLanguage: null, regionalLanguage: null };
    const html = await (await LIS_LE_COMPOSER(requete('/composer'), serveur({ lecteur: sans }).recuperer)).text();

    expect(html).toContain(COMPOSER.traductionSansLangue);
  });

  /**
   * V1 (#5390) — LE FORMAT POST SERT UN CHAMP DE FICHIERS MULTIPART. Le
   * `<form>` porte `enctype="multipart/form-data"` (inoffensif sur l'autre
   * format), l'input est nommé par le vocabulaire clos
   * (`CHAMPS_DU_COMPOSER.medias`), accepte image et vidéo, plusieurs fichiers,
   * et porte SON `<label>` — ici la tuile « + Ajouter » qui l'enveloppe
   * (même idiome que le radio d'humeur).
   */
  it('sert un champ de fichiers multipart en format post', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=post'), serveur().recuperer)).text();

    expect(html).toContain('enctype="multipart/form-data"');
    expect(html).toContain(`name="${CHAMPS_DU_COMPOSER.medias}"`);
    expect(html).toContain('type="file"');
    // `accept` OFFRE EXACTEMENT CE QUE LA PORTE ACCEPTE — la liste PARTAGÉE,
    // jamais un joker plus large que la règle (revue #5390 : `image/*,video/*`
    // proposait au sélecteur des `.heic`/`.avif` que `isImageMimeType`
    // refuse APRÈS le choix).
    const accept = /accept="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(accept.split(',').sort()).toEqual(
      [...ACCEPTED_MIME_TYPES.IMAGE, ...ACCEPTED_MIME_TYPES.VIDEO].slice().sort(),
    );
    expect(accept).not.toContain('*');
    expect(html).toContain('multiple');
    expect(html).toContain('<label class="ajouter">');
    expect(html).toContain(COMPOSER.mediasAide);
  });

  /** V2 — une humeur est un emoji : aucun champ de fichiers n'y a sa place. */
  it('ne rend aucun champ de fichiers pour l’humeur', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=humeur'), serveur().recuperer)).text();

    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('class="champ medias"');
  });

  /**
   * V4 (revue #5390) — LA TUILE « + AJOUTER » EST LE DERNIER ÉLÉMENT DE LA
   * GRILLE DES APERÇUS, pas une rangée au-dessus d'elle : c'est la
   * DISPOSITION que `cible/composer.png` dessine (une vignette et la tuile
   * côte à côte, de même taille), et la conformité se mesure là-dessus. Le
   * témoin lit l'ORDRE des nœuds, pas une classe : une tuile servie AVANT la
   * liste satisferait `toContain` deux fois et resterait fausse.
   */
  it('sert la tuile d’ajout DANS la grille des aperçus, en dernier', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=post'), serveur().recuperer)).text();

    expect(html).toContain('<ul class="apercus" aria-labelledby="c-medias-titre"><li class="tuile-ajouter"><label class="ajouter">');
    // …et jamais la liste MASQUÉE d'avant : elle porte toujours la tuile.
    expect(html).not.toContain('<ul class="apercus" hidden>');
  });

  /**
   * V5 (revue #5390) — LE CHAMP A UN NOM ET SON AIDE EST RELIÉE. L'input est
   * `.hors-ecran` : sans nom de groupe, un lecteur d'écran n'annonce que
   * « Ajouter ». Le nom est servi hors écran (la cible ne dessine aucun
   * titre), et la phrase qui porte les DEUX bornes — nombre et taille — est
   * reliée par `aria-describedby`, sinon elle n'existe que pour l'œil.
   */
  it('nomme le champ des médias et relie son aide à l’input', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=post'), serveur().recuperer)).text();

    expect(html).toContain(`<p class="hors-ecran" id="c-medias-titre">${COMPOSER.medias}</p>`);
    expect(html).toContain('aria-describedby="c-medias-aide"');
    expect(html).toContain('id="c-medias-aide"');
  });

  /**
   * V6 (revue #5390) — LE FOCUS SE VOIT. L'anneau global du socle
   * (`:focus-visible`, charte règle 15) se pose sur l'input CLIPPÉ, sur un
   * rectangle d'un pixel : au clavier, la tuile « + Ajouter » ne montrait
   * RIEN. La feuille reporte l'anneau sur le label visible — le même idiome
   * et les mêmes jetons que `social-feuille.ts`.
   */
  it('reporte l’anneau de focus sur le label visible, jamais sur l’input clippé', () => {
    expect(FEUILLE_DU_COMPOSER).toContain('.ajouter:has(input:focus-visible)');
    expect(FEUILLE_DU_COMPOSER).toContain('outline:var(--stroke-focus) solid var(--color-focus)');
  });

  /**
   * V7 (revue #5390, défaut 1) — LE GABARIT DU RETRAIT EST SERVI, un
   * `<template>` que `previsualiseMedias` clone plutôt que de fabriquer un
   * tracé côté navigateur (même interdit que `notifs-peinture.ts`). `<template>`
   * ne se rend jamais : aucun bouton visible sans script, la vignette
   * elle-même n'existant pas sans lui.
   */
  it('sert le gabarit du glyphe de retrait, jamais un bouton visible sans script', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=post'), serveur().recuperer)).text();

    expect(html).toContain('<template id="c-medias-gabarit-retrait">');
    expect(html).not.toContain('class="retirer-media"');
  });

  /**
   * V8 (revue #5390, défaut 3) — LE REPLI `mediaAlt` EST SERVI, REPLIÉ.
   * `MAX_POST_MEDIA` champs RÉPÉTÉS existent déjà dans le document — c'est ce
   * qui rend la légende utilisable SANS script — mais `<details>` les tient
   * hors de la première peinture (dimension 8 : rien à décrire, rien à
   * montrer).
   */
  it('sert dix champs medias-alt repliés, pour le chemin sans script', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=post'), serveur().recuperer)).text();

    expect(html).toContain('<details class="medias-alt">');
    expect(html).toContain(`<summary>${COMPOSER.mediasAltTitre}</summary>`);
    const occurrences = html.match(new RegExp(`name="${CHAMPS_DU_COMPOSER.mediasAlt}"`, 'g')) ?? [];
    expect(occurrences).toHaveLength(MAX_POST_MEDIA);
    expect(html).toContain(COMPOSER.mediasAltRang(1));
    expect(html).toContain(COMPOSER.mediasAltRang(MAX_POST_MEDIA));
  });

  /** V9 — le repli `mediaAlt`, comme le champ des médias, n'a rien à faire sur une humeur. */
  it('ne rend aucun champ medias-alt pour l’humeur', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=humeur'), serveur().recuperer)).text();

    expect(html).not.toContain('class="medias-alt"');
    expect(html).not.toContain(`name="${CHAMPS_DU_COMPOSER.mediasAlt}"`);
  });

  /**
   * V3 — LE REFUS DES MÉDIAS EST PEINT DANS LE BLOC QUI LE CONCERNE, jamais
   * au-dessus du formulaire comme le refus serveur (`erreur`), et la saisie
   * tapée n'est jamais effacée par ce refus.
   */
  it('peint le refus des médias DANS le bloc du champ, sans effacer la saisie', () => {
    const doc = documentDuComposer({
      format: 'post',
      texte: 'texte gardé',
      humeur: null,
      audience: 'PUBLIC',
      langue: 'fr',
      publie: false,
      erreur: null,
      refusDesMedias: 'notes.txt n’est pas une image.',
      tempsReel: null,
    });

    // LE BLOC SE DÉLIMITE PAR SA SECTION, PAS PAR UN NOMBRE D'OCTETS (revue
    // #5390) : la première écriture coupait à 800 caractères, et le témoin a
    // rougi le jour où `accept` a cessé d'être un joker — une fenêtre en
    // octets mesure la LONGUEUR du balisage, jamais sa structure.
    const debutDuBloc = doc.indexOf('class="champ medias"');
    const blocMedias = doc.slice(debutDuBloc, doc.indexOf('</section>', debutDuBloc));
    expect(blocMedias).toContain('role="alert"');
    expect(blocMedias).toContain('notes.txt n’est pas une image.');
    expect(doc).toContain('texte gardé');
    // `data-refuse="1"` — voir le doc-comment de `lib/realtime/composer.ts`
    // (règle 1) : sans lui, le module restaurerait un brouillon PAR-DESSUS
    // ce refus dès que le champ texte serait vide.
    expect(doc).toContain('data-refuse="1"');
  });
});

describe('publier depuis le composer', () => {
  it('refuse un formulaire venu d’un autre site', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      poste({ format: 'post', texte: 'Bonjour' }, { origine: 'https://ailleurs.test' }),
      recuperer,
    );

    expect(reponse.status).toBe(403);
    expect(corps).toEqual([]);
  });

  /** LE CORPS ENVOYÉ — le sujet de ce lot, et ce que `publie()` n'avait jamais gagé. */
  /** ET AUCUNE CLÉ `originalLanguage` quand rien n'est déclaré : l'ABSENCE, jamais « fr ». */
  it('ne revendique aucune langue quand le lecteur n’en déclare aucune', async () => {
    const sans = { ...LECTRICE, systemLanguage: null, regionalLanguage: null };
    const { corps, recuperer } = serveur({ lecteur: sans });
    await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'Ẹ káàbọ̀' }), recuperer);

    expect(corps[0]).not.toHaveProperty('originalLanguage');
  });

  it('envoie un POST avec son texte, son type et sa langue revendiquée', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'La revue est prête.' }), recuperer);

    expect(corps).toEqual([
      { type: 'POST', content: 'La revue est prête.', visibility: 'PUBLIC', originalLanguage: 'fr' },
    ]);
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/composer?format=post&publie=1');
  });

  /**
   * L'AUDIENCE MUTE LA CHARGE — les trois valeurs, chacune vérifiée sur le
   * corps. C'est ce qui distingue un contrôle d'une mention (charte règle 7),
   * et une audience est une garde de CONFIDENTIALITÉ : la vérifier sur le
   * document rendu ne prouverait rien de ce qui part.
   */
  it.each([
    ['PUBLIC', 'PUBLIC'],
    ['FRIENDS', 'FRIENDS'],
    ['PRIVATE', 'PRIVATE'],
  ])('l’audience %s part telle quelle', async (choisie, attendue) => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'Bonjour', audience: choisie }), recuperer);

    expect(corps[0]).toMatchObject({ visibility: attendue });
  });

  /** Une audience inventée retombe sur la plus RESTRICTIVE des sens, jamais sur la charge brute. */
  it('n’envoie jamais une audience que la passerelle refuserait', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'Bonjour', audience: 'COMMUNITY' }), recuperer);

    expect(corps[0]).toMatchObject({ visibility: 'PUBLIC' });
  });

  /**
   * UNE HUMEUR EST UN `STATUS` AVEC SON EMOJI, et l'emoji EST le contenu : une
   * humeur sans texte est valide.
   */
  it('publie une humeur avec son emoji, même sans texte', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'humeur', humeur: '☕', texte: '' }), recuperer);

    expect(corps[0]).toMatchObject({ type: 'STATUS', content: '', moodEmoji: '☕' });
  });

  /** ET AUCUNE CLÉ `moodEmoji` HORS HUMEUR — une chaîne vide serait un emoji vide. */
  it('ne pose aucun moodEmoji sur un post', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'Bonjour', humeur: '☕' }), recuperer);

    expect(corps[0]).not.toHaveProperty('moodEmoji');
  });

  /**
   * RIEN À PUBLIER SE DIT SANS APPELER LA PASSERELLE. L'aller-retour serait
   * payé par le lecteur pour apprendre ce que le document savait déjà.
   */
  it('refuse une publication vide sans appeler la passerelle', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: '   ' }), recuperer);
    const html = await reponse.text();

    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(html).toContain(COMPOSER.vide);
  });

  /**
   * UN REFUS REPOSE LA SAISIE. Perdre cinq lignes parce que la passerelle a
   * déplu est le défaut le plus cher d'un formulaire, et il ne se voit qu'au
   * pire moment.
   */
  it('un refus garde le texte, l’humeur et l’audience choisis', async () => {
    const { recuperer } = serveur({ statutDeLaPublication: 422 });
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      poste({ format: 'humeur', humeur: '🔥', texte: 'Ce que je viens d’écrire', audience: 'FRIENDS' }),
      recuperer,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(422);
    expect(html).toContain('Ce que je viens d’écrire');
    expect(html).toContain('value="🔥" checked');
    expect(html).toContain('value="FRIENDS" selected');
    expect(html).toContain(COMPOSER.refuse);
  });

  it('renvoie à la connexion quand la session a expiré', async () => {
    const { recuperer } = serveur({ statutDeLaPublication: 401 });
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'Bonjour' }), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fcomposer');
  });

  /** LE RETOUR DU PRG dit ce qui vient d'avoir lieu, et où le voir. */
  it('confirme la publication au retour, et mène au fil', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=post&publie=1'), serveur().recuperer)).text();

    expect(html).toContain(COMPOSER.publie);
    expect(html).toContain('href="/feed"');
  });

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LES MÉDIAS (#5390) — TUS d'abord, puis `mediaIds` sur `POST /posts`.
   * ─────────────────────────────────────────────────────────────────────────
   */

  /** P1 — une photo part : l'upload précède la publication, et son id atterrit dans `mediaIds`. */
  it('une photo part : TUS d’abord, puis mediaIds', async () => {
    const { corps, uploads, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: 'Avec une photo' }, [fichierDeTest('vue.png', 'image/png')]),
      recuperer,
    );

    expect(uploads).toHaveLength(1);
    expect(corps).toEqual([{ type: 'POST', content: 'Avec une photo', visibility: 'PUBLIC', originalLanguage: 'fr', mediaIds: ['media-1'] }]);
    expect(reponse.status).toBe(303);
  });

  /** P2 — un média SEUL est un post valide : le gate « vide » ne le refuse plus. */
  it('un post média seul, sans texte ni humeur, est valide', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: '' }, [fichierDeTest('vue.png', 'image/png')]),
      recuperer,
    );

    expect(corps[0]).toMatchObject({ mediaIds: ['media-1'] });
    expect(reponse.status).toBe(303);
  });

  /**
   * P10 (revue #5390, défaut 3) — LA LÉGENDE PART, ZIPPÉE AU RANG DU FICHIER,
   * jamais à un champ nommé : la porte lit les valeurs `medias-alt`
   * (répétées) DANS L'ORDRE, et les associe à `mediaIds` dans le MÊME ordre
   * — peu importe COMBIEN de champs `medias-alt` le formulaire porte au
   * total, seul l'ORDRE compte.
   */
  it('la légende d’un média part, zippée à son rang', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart(
        { format: 'post', texte: 'deux photos' },
        [fichierDeTest('un.png', 'image/png'), fichierDeTest('deux.png', 'image/png')],
        { alts: ['Un couché de soleil', 'Une plage'] },
      ),
      recuperer,
    );

    expect(corps[0]).toMatchObject({
      mediaIds: ['media-1', 'media-2'],
      mediaAlt: { 'media-1': 'Un couché de soleil', 'media-2': 'Une plage' },
    });
    expect(reponse.status).toBe(303);
  });

  /** Contre-épreuve de P10 — une légende VIDE ne pose aucune clé, jamais une chaîne vide dans `mediaAlt`. */
  it('ne pose aucune clé mediaAlt pour une légende laissée vide', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: 'une photo' }, [fichierDeTest('un.png', 'image/png')], { alts: [''] }),
      recuperer,
    );

    expect(corps[0]).not.toHaveProperty('mediaAlt');
  });

  /** Contre-épreuve de P10 — sans AUCUN champ `medias-alt` posté (chemin legacy), `mediaAlt` reste absent. */
  it('ne pose aucune clé mediaAlt quand le formulaire n’en porte aucune', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: 'une photo' }, [fichierDeTest('un.png', 'image/png')]),
      recuperer,
    );

    expect(corps[0]).not.toHaveProperty('mediaAlt');
  });

  /** P3 — un type refusé ne part NULLE PART, et le texte tapé est reposé. */
  it('un type de fichier refusé ne part nulle part', async () => {
    const { corps, uploads, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: 'ceci reste' }, [fichierDeTest('notes.txt', 'text/plain')]),
      recuperer,
    );
    const html = await reponse.text();

    expect(uploads).toEqual([]);
    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(html).toContain('notes.txt');
    expect(html).toContain('ceci reste');
  });

  /** Contre-épreuve de P3 — un type ACCEPTÉ hors des deux exemples canoniques (webp) n'est pas refusé. */
  it('accepte un type d’image moins courant (webp)', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: 'webp' }, [fichierDeTest('vue.webp', 'image/webp')]),
      recuperer,
    );

    expect(corps[0]).toMatchObject({ mediaIds: ['media-1'] });
  });

  /** P4 — l'échec d'un téléversement repose le formulaire et RELÂCHE les réussis, sans jamais appeler /posts. */
  it('un échec de téléversement relâche les médias déjà réclamés', async () => {
    const { corps, suppressions, recuperer } = serveur({ refusUpload: { rang: 2, statut: 413, message: 'File too large\n' } });
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: 'deux fichiers' }, [
        fichierDeTest('un.png', 'image/png'),
        fichierDeTest('deux.png', 'image/png'),
      ]),
      recuperer,
    );

    expect(corps).toEqual([]);
    expect(suppressions.map((u) => u.endsWith('/api/v1/posts/media/media-1'))).toEqual([true]);
    expect(reponse.status).toBe(422);
  });

  /** P5 — le refus de la passerelle sur /posts relâche aussi les médias téléversés. */
  it('le refus de /posts relâche les médias déjà téléversés', async () => {
    const { corps, suppressions, recuperer } = serveur({ statutDeLaPublication: 400 });
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: 'refusé' }, [fichierDeTest('un.png', 'image/png')]),
      recuperer,
    );
    const html = await reponse.text();

    expect(corps).toHaveLength(1);
    expect(suppressions.map((u) => u.endsWith('/api/v1/posts/media/media-1'))).toEqual([true]);
    expect(reponse.status).toBe(422);
    expect(html).toContain(COMPOSER.refuse);
  });

  /** P6 — un seuil a ses deux moitiés : MAX_POST_MEDIA passe, MAX_POST_MEDIA + 1 se refuse SANS un octet envoyé. */
  it(`accepte jusqu’à ${MAX_POST_MEDIA} fichiers`, async () => {
    const fichiers = Array.from({ length: MAX_POST_MEDIA }, (_, i) => fichierDeTest(`f${i}.png`, 'image/png'));
    const { uploads, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(posteMultipart({ format: 'post', texte: 'plein' }, fichiers), recuperer);

    expect(uploads).toHaveLength(MAX_POST_MEDIA);
    expect(reponse.status).toBe(303);
  });

  it(`refuse ${MAX_POST_MEDIA + 1} fichiers, sans un seul octet envoyé`, async () => {
    const fichiers = Array.from({ length: MAX_POST_MEDIA + 1 }, (_, i) => fichierDeTest(`f${i}.png`, 'image/png'));
    const { uploads, corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(posteMultipart({ format: 'post', texte: 'trop' }, fichiers), recuperer);
    const html = await reponse.text();

    expect(uploads).toEqual([]);
    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(html).toContain(String(MAX_POST_MEDIA));
  });

  /**
   * P8 (revue #5390) — LA BORNE DE TAILLE ÉTAIT APPLIQUÉE SANS TÉMOIN, et
   * elle appliquait `SMALL_FILE_THRESHOLD` — dont le commentaire d'origine
   * dit qu'il choisit un TRANSPORT (« below this, use direct REST upload »),
   * jamais une limite : la vraie borne de la passerelle est `UPLOAD_LIMITS`,
   * 4 Go. La borne appliquée ici est celle de la PORTE, qui relaie en
   * tampon — le témoin gage donc les deux moitiés du seuil ET le fait que
   * le message NOMME le nombre qu'il applique.
   */
  it('refuse un fichier au-dessus de la borne de la porte, sans un octet envoyé', async () => {
    const gros = new File(['x'.repeat(OCTETS_MAX_PAR_MEDIA + 1)], 'enorme.png', { type: 'image/png' });
    const { corps, uploads, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: 'trop lourd' }, [gros]),
      recuperer,
    );
    const html = await reponse.text();

    expect(uploads).toEqual([]);
    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(html).toContain('enorme.png');
    // Le nombre appliqué EST dit — sinon le lecteur ne sait pas quoi faire.
    expect(html).toContain(`${OCTETS_MAX_PAR_MEDIA / (1024 * 1024)} Mo`);
  });

  /** Contre-épreuve — un fichier EXACTEMENT à la borne passe : un seuil a deux moitiés. */
  it('accepte un fichier exactement à la borne', async () => {
    const juste = new File(['x'.repeat(OCTETS_MAX_PAR_MEDIA)], 'juste.png', { type: 'image/png' });
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(posteMultipart({ format: 'post', texte: 'pile' }, [juste]), recuperer);

    expect(corps[0]).toMatchObject({ mediaIds: ['media-1'] });
  });

  /**
   * P11 (revue #5390, défaut 2) — UNE SOMME DE FICHIERS LÉGITIMES PEUT
   * QUAND MÊME DÉPASSER LE PLAFOND DE LA PUBLICATION : dix fichiers de
   * 40 Mo (aucun ne dépasse `OCTETS_MAX_PAR_MEDIA`, 50 Mo) pèsent ensemble
   * 400 Mo, au-dessus des 150 Mo de `OCTETS_MAX_PAR_PUBLICATION`. Cette
   * garde est DISTINCTE de P9 (`OCTETS_MAX_DE_LA_CHARGE`, sur ce que le
   * `Content-Length` ANNONCE, avant lecture) : elle s'applique APRÈS lecture,
   * sur ce que les fichiers PÈSENT VRAIMENT — et rien ne l'aurait arrêtée
   * avant ce lot, `OCTETS_MAX_DE_LA_CHARGE` valant alors ~500 Mo.
   */
  it('refuse une somme de fichiers légitimes qui dépasse le plafond total', async () => {
    const octetsParFichier = Math.floor(OCTETS_MAX_PAR_PUBLICATION / 3);
    const fichiers = Array.from({ length: 4 }, (_v, i) => new File(['x'.repeat(octetsParFichier)], `f${i}.png`, { type: 'image/png' }));
    const { corps, uploads, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: 'trop au total' }, fichiers),
      recuperer,
    );
    const html = await reponse.text();

    expect(uploads).toEqual([]);
    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(html).toContain(COMPOSER.mediasChargeTrop);
  });

  /** Contre-épreuve de P11 — une somme sous le plafond total publie comme avant. */
  it('accepte une somme de fichiers sous le plafond total', async () => {
    const octetsParFichier = Math.floor(OCTETS_MAX_PAR_PUBLICATION / 4);
    const fichiers = Array.from({ length: 2 }, (_v, i) => new File(['x'.repeat(octetsParFichier)], `f${i}.png`, { type: 'image/png' }));
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      posteMultipart({ format: 'post', texte: 'sous le plafond' }, fichiers),
      recuperer,
    );

    expect(reponse.status).toBe(303);
    expect(corps[0]).toMatchObject({ mediaIds: ['media-1', 'media-2'] });
  });

  /**
   * P9 (revue #5390) — UNE CHARGE INVRAISEMBLABLE SE REFUSE SANS ÊTRE LUE.
   * `formData()` met le multipart ENTIER en mémoire AVANT toutes les gardes
   * de la porte ; ni Next (une route App Router n'a aucune limite de corps)
   * ni la zone (le routeur Traefik `frontend-v3` ne porte aucun middleware
   * `buffering`) ne la bornent. Le témoin gage les DEUX moitiés du seuil, et
   * surtout que le CORPS N'EST PAS CONSOMMÉ : `requete.bodyUsed` reste faux.
   */
  it('refuse une charge au-dessus du plafond sans lire un octet', async () => {
    const { corps, uploads, recuperer } = serveur();
    const requeteLourde = new Request(`${ORIGINE}/composer`, {
      method: 'POST',
      headers: {
        cookie: COOKIE,
        origin: ORIGINE,
        'content-type': 'multipart/form-data; boundary=x',
        'content-length': String(OCTETS_MAX_DE_LA_CHARGE + 1),
      },
      body: '--x--',
    });
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(requeteLourde, recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(413);
    expect(requeteLourde.bodyUsed).toBe(false);
    expect(uploads).toEqual([]);
    expect(corps).toEqual([]);
    expect(html).toContain(COMPOSER.mediasCharge);
    // La saisie n'est pas REPOSÉE — elle n'a jamais été lue. Ce document
    // porte quand même `data-refuse` (c'est un refus), donc le brouillon ne
    // se réécrit pas PAR-DESSUS lui ; il reste en `sessionStorage` et la
    // prochaine ARRIVÉE sur `/composer` — un GET, sans `data-refuse` — le
    // restitue. Rien n'est perdu, seulement différé d'un chargement.
    expect(html).toContain('data-refuse="1"');
  });

  /** Contre-épreuve — une charge sous le plafond est lue et publiée comme avant. */
  it('lit une charge annoncée sous le plafond', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'léger' }), recuperer);

    expect(reponse.status).toBe(303);
    expect(corps).toHaveLength(1);
  });

  /**
   * P7 — LA PART FICHIER VIDE D'UN FORMULAIRE SANS SÉLECTION EST IGNORÉE.
   * Tout navigateur poste la part `medias` même quand rien n'a été choisi —
   * un `File` de taille 0 et de nom vide. Elle ne doit produire ni refus, ni
   * appel d'upload : la publication texte se comporte comme avant #5390.
   */
  it('ignore la part fichier vide d’un formulaire sans sélection', async () => {
    const { corps, uploads, recuperer } = serveur();
    const donnees = new FormData();
    donnees.append('format', 'post');
    donnees.append('texte', 'texte seul');
    donnees.append(CHAMPS_DU_COMPOSER.medias, new File([], '', { type: 'application/octet-stream' }));
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      new Request(`${ORIGINE}/composer`, { method: 'POST', headers: { cookie: COOKIE, origin: ORIGINE }, body: donnees }),
      recuperer,
    );

    expect(uploads).toEqual([]);
    expect(corps).toEqual([{ type: 'POST', content: 'texte seul', visibility: 'PUBLIC', originalLanguage: 'fr' }]);
    expect(reponse.status).toBe(303);
  });
});

/**
 * `/composer` A UNE PORTE — leçon 507. Le champ « Quoi de neuf ? » du fil est
 * la seule entrée que la planche dessine (`MeeshyWebV3.dc.html:870`).
 */
describe('le composer est atteignable', () => {
  it('le fil social porte un lien vers /composer', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(__dirname, '..', 'app/connecte/social-vue.ts'), 'utf8');

    expect(source).toContain('href="/composer"');
  });
});

/**
 * LE MODULE DU BROUILLON (#4966) — ce que le DOCUMENT en dit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CES TÉMOINS PILOTENT LA VUE, PAS LA PORTE, ET C'EST LA CI QUI L'A EXIGÉ
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Écrits d'abord à travers `LIS_LE_COMPOSER`, ils passaient EN LOCAL et
 * rougissaient en CI. La porte lit l'actif COMPILÉ (`actifsTempsReel()`) pour
 * en calculer l'empreinte ; le job `Test web-v3` lance jest SANS
 * `scripts/build-participate.mjs`, donc `.rt/composer.js` est absent, donc
 * `corps === ''`, donc `tempsReel: null` — et le document ne porte alors NI
 * `data-participation` NI chargeur. C'est le comportement VOULU
 * (§ 12.4 : sans module compilé, le Post/Redirect/Get reste le seul chemin),
 * pas un défaut.
 *
 * **Un témoin qui dépend d'un artefact de build ne juge pas le code : il juge
 * l'ordre dans lequel on a lancé les commandes.** La vue reçoit donc son
 * `tempsReel` EXPLICITEMENT — même convention que `documentDesNotifs` et les
 * autres écrans à module. Ce que la PORTE fait de l'actif réel est prouvé par
 * `e2e/visual/v3-composer.spec.ts`, dont la suite construit avant de courir.
 */
const MODULE = { module: '/__v3/rt/composer.abc.js' } as const;

const etatDuComposer = (attributs: Partial<EtatDuComposer> = {}): EtatDuComposer => ({
  format: FORMATS_SERVIS[0].cle,
  texte: '',
  humeur: null,
  audience: 'PUBLIC',
  langue: 'fr',
  publie: false,
  erreur: null,
  refusDesMedias: null,
  tempsReel: MODULE,
  ...attributs,
});

describe('la couture du module de brouillon', () => {
  it('nomme son module et embarque le chargeur différé', () => {
    const doc = documentDuComposer(etatDuComposer());

    expect(doc).toContain('data-participation="composer"');
    expect(doc).toContain(`data-module="${MODULE.module}"`);
    expect(doc).toContain('<script type="module">');
  });

  /**
   * IL PART AUSSI SUR UN REFUS, et c'est ce qui rend la règle « le serveur a
   * toujours raison » utile plutôt que théorique : sans module sur ce document,
   * la saisie reposée serait la seule, et le brouillon du geste SUIVANT ne
   * serait plus tenu.
   */
  it('part aussi sur le document d’un refus, avec la saisie reposée', () => {
    const doc = documentDuComposer(
      etatDuComposer({ texte: 'ce que j’avais tapé', erreur: COMPOSER.vide }),
    );

    expect(doc).toContain('data-participation="composer"');
    expect(doc).toContain('<script type="module">');
    expect(doc).toContain('ce que j’avais tapé');
  });

  /**
   * SANS MODULE COMPILÉ, RIEN NE PART — et le formulaire marche quand même.
   * C'est le socle du § 12.4, et c'est aussi ce que la CI exerce réellement.
   */
  it('ne porte ni attribut ni chargeur quand aucun module n’est compilé', () => {
    const doc = documentDuComposer(etatDuComposer({ tempsReel: null }));

    expect(doc).not.toContain('data-participation');
    expect(doc).not.toContain('<script type="module">');
    expect(doc).toContain('<form method="post" enctype="multipart/form-data">');
  });

  /**
   * M1 (#5390) — LE DOCUMENT D'UNE PUBLICATION PARTIE PORTE `data-publie` : le
   * crochet que le module lit pour effacer le brouillon (règle 3 réécrite,
   * § étape 5 de la spécification), jamais l'événement `submit` lui-même.
   */
  it('porte data-publie sur le document d’une publication PARTIE', () => {
    const doc = documentDuComposer(etatDuComposer({ publie: true }));

    expect(doc).toContain('data-publie="1"');
  });

  it('ne porte pas data-publie tant que rien n’est parti', () => {
    const doc = documentDuComposer(etatDuComposer({ publie: false }));

    expect(doc).not.toContain('data-publie');
  });

  /**
   * `data-refuse="1"` (#5390) — posé sur TOUT refus, pas seulement celui des
   * médias (V3 le gage côté médias) : un refus SERVEUR (`erreur`) reposant un
   * texte VIDE (saisie de seuls espaces, nettoyée par la porte) doit lui
   * aussi fermer la porte à la règle 1 du module — sinon un brouillon périmé
   * reviendrait par-dessus le vide que le serveur a décidé.
   */
  it('porte data-refuse sur un refus serveur, même quand le texte reposé est vide', () => {
    const doc = documentDuComposer(etatDuComposer({ texte: '', erreur: COMPOSER.vide }));

    expect(doc).toContain('data-refuse="1"');
  });

  it('ne porte pas data-refuse sur un document sans aucun refus', () => {
    const doc = documentDuComposer(etatDuComposer());

    expect(doc).not.toContain('data-refuse');
  });

  /**
   * LE FORMAT EST SERVI DANS LE FORMULAIRE, et c'est de là que le module tire
   * sa clé — jamais de l'adresse. La même valeur, mais celle-là est déjà
   * validée contre le vocabulaire clos : un `?format=<n'importe quoi>` ne peut
   * pas devenir une clé de stockage.
   */
  it('sert le format dans un champ caché, d’où le module tire sa clé', async () => {
    const doc = await (await LIS_LE_COMPOSER(requete('/composer?format=humeur'), serveur().recuperer)).text();

    expect(doc).toContain('<input type="hidden" name="format" value="humeur">');
  });

  it('un format inventé ne devient pas une clé — le vocabulaire est clos', async () => {
    const doc = await (
      await LIS_LE_COMPOSER(requete('/composer?format=../../evasion'), serveur().recuperer)
    ).text();

    expect(doc).toContain(`<input type="hidden" name="format" value="${FORMATS_SERVIS[0].cle}">`);
    expect(doc).not.toContain('evasion');
  });
});

/**
 * LE CLIQUET DE `MAX_POST_MEDIA` (#5390) — `lib/contenu/composer.ts` le
 * RECOPIE en littéral (Playwright le charge en CommonJS dans son propre
 * process, et `require()` d'un module `@meeshy/shared` — ESM — y échoue,
 * voir le doc-comment du fichier). Ce témoin tient les deux valeurs
 * ATTACHÉES : s'il rougit, la copie a divergé de la borne RÉELLE
 * (`CreatePostSchema.mediaIds`), et `composer-porte.ts` — qui IMPORTE la
 * vraie constante — devient la seule source juste tant que ce fichier n'est
 * pas mis à jour.
 */
describe('le cliquet MAX_POST_MEDIA', () => {
  it('la copie du composer vaut la constante partagée', async () => {
    const { MAX_POST_MEDIA: reel } = await import('@meeshy/shared/types/attachment');

    expect(MAX_POST_MEDIA).toBe(reel);
  });
});
