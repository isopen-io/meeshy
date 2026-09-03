/**
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { messages as tranche, type Message } from '@/lib/api/fil';
import { FIL } from '@/lib/contenu/fil';

/**
 * **CE QU'UN CHAT OFFRE ET QUE LE FIL N'OFFRAIT PAS** (issue #4835, étendue par
 * la directive du porteur § 12.10.1 du 2026-09-03) :
 *
 *   1. **la citation SAUTE** vers le message cité — `data-cite` désignait déjà
 *      la cible, mais rien ne menait à elle : aucun `<a href>`, aucun
 *      `scrollIntoView` dans `lib/realtime` ni dans `app/connecte` (grep) ;
 *   2. **le média s'ouvre en PLEIN ÉCRAN au tap** — aucune surimpression
 *      n'existait (`grep 'pleinEcran|lightbox|fullscreen'` : vide) ;
 *   3. **le vocal a une FICHE** — seul un `<span class="transcription">` était
 *      prévu, jamais une vue où la transcription entière se lit.
 *
 * TROIS MÉCANISMES, ZÉRO OCTET DE JAVASCRIPT. Le saut est un lien de FRAGMENT
 * (`#m-<id>`), que le navigateur suit seul et que `:target` met en évidence ; le
 * plein écran est un ÉTAT de l'adresse hôte (`?autour=<message>&media=<pièce>` —
 * l'adresse nomme la TRANCHE autant que la pièce, sans quoi rien ne s'ouvre hors
 * des quarante derniers messages), rendu par le serveur dans le MÊME document — la forme que le porteur a tranchée pour le
 * profil d'un participant (§ 12.10.3 point 2) et qui vaut ici pour la même
 * raison : on ouvre et on ferme par un `<a href>`, donc sans un framework, sans
 * une hydratation, et sans un second site de rendu qui divergerait du premier.
 *
 * RIEN NE RÉINTRODUIT LE MODE « FOCAL » retiré au tour 2 (§ 12.9) : aucune
 * atténuation des voisins, aucun `opacity` permanent — un saut, une mise en
 * évidence par `:target`, une surimpression. Trois mécanismes à TÉMOIN.
 */

const ORIGINE = 'https://gate.test';

const PIECE = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'a1',
  fileUrl: '/api/v1/attachments/file/2026/photo.jpg',
  originalName: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 96_000,
  ...attributs,
});

const brut = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'm1',
  content: 'Le tableau final de la revue.',
  originalLanguage: 'fr',
  createdAt: '2026-09-01T12:06:00.000Z',
  senderId: 'u2',
  sender: { id: 'p2', displayName: 'Ibrahim' },
  ...attributs,
});

/**
 * LA TRANCHE, jamais un message seul : c'est `messages()` qui applique
 * `citationsDeLaPage` — donc qui SAIT si la cible d'une citation est dans la
 * page (`lib/api/fil.ts`). Un témoin qui assemblerait des `message()` isolés
 * mesurerait un état que ni l'une ni l'autre porte ne sert.
 */
const rendus = (bruts: readonly Record<string, unknown>[], langues: readonly string[] = ['fr'], moi = 'u1'): readonly Message[] =>
  tranche(bruts, moi, langues, ORIGINE);

const rendu = (m: Record<string, unknown>, langues: readonly string[] = ['fr'], moi = 'u1'): Message => {
  const resultat = rendus([m], langues, moi)[0];
  if (resultat === undefined) throw new Error('message non lu');
  return resultat;
};

const TEMPS_REEL: EtatDuFil['tempsReel'] = {
  passerelle: ORIGINE,
  actifs: {
    participate: { nom: 'participate.abc.js', url: '/__v3/rt/participate.abc.js', corps: '' },
    liste: { nom: 'liste.abc.js', url: '/__v3/rt/liste.abc.js', corps: '' },
    socket: { nom: 'socket.io.def.js', url: '/__v3/rt/socket.io.def.js', corps: '' },
  },
};

const ETAT = (messages: readonly Message[], attributs: Partial<EtatDuFil> = {}): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'Équipe Lagos', membres: 4, presence: { participants: [], presents: [] }, messages, plusAncien: null },
  lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
  erreur: null,
  brouillon: '',
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  composeur: { genre: 'ouvert' },
  tempsReel: null,
  plein: null,
  profil: null,
  ...attributs,
});

/** Le document SERVI, gabarits retirés : ce que le lecteur reçoit, jamais ce que le module clonera. */
const servi = (etat: EtatDuFil): string => documentDuFil(etat).replace(/<template[\s\S]*?<\/template>/g, '');

const BRUT_IMAGE = brut({ id: 'r1', attachments: [PIECE({ id: 'ar1', width: 1200, height: 900 })] });
const IMAGE = rendu(BRUT_IMAGE);

const VIDEO = rendu(
  brut({
    id: 'r2',
    content: '',
    attachments: [PIECE({ id: 'ar2', mimeType: 'video/mp4', originalName: 'revue.mp4', fileUrl: '/api/v1/attachments/file/2026/revue.mp4', fileSize: 3_100_000, duration: 42_000 })],
  }),
);

const VOCAL = rendu(
  brut({
    id: 'r3',
    content: '',
    attachments: [
      PIECE({
        id: 'ar3',
        mimeType: 'audio/mp4',
        originalName: 'vocal.m4a',
        fileUrl: '/api/v1/attachments/file/2026/vocal.m4a',
        fileSize: 96_000,
        duration: 21_000,
        transcription: { text: 'Mo n mú àwọn nọ́mbà oṣù Kẹta.', language: 'yo' },
        translations: { fr: { transcription: 'J’apporte les chiffres de mars.', url: '/api/v1/attachments/file/2026/vocal-fr.m4a' } },
      }),
    ],
  }),
);

const FICHIER = rendu(brut({ id: 'r7', attachments: [PIECE({ id: 'ar7', mimeType: 'application/pdf', originalName: 'notes.pdf', fileUrl: '/api/v1/attachments/file/2026/notes.pdf' })] }));

const BRUT_REPONSE = brut({
  id: 'r5',
  content: 'Je le mets dans le dossier de mars.',
  replyToId: 'r1',
  replyTo: { id: 'r1', content: 'Le tableau final de la revue.', originalLanguage: 'fr', sender: { id: 'p2', displayName: 'Ibrahim' } },
});

const REPONSE_HORS_PAGE = rendu(
  brut({
    id: 'r6',
    content: 'Et pour mars ?',
    replyToId: 'hors-tranche',
    replyTo: { id: 'hors-tranche', content: 'Un message plus ancien', originalLanguage: 'fr', sender: { id: 'p2', displayName: 'Ibrahim' } },
  }),
);

describe('la citation saute vers le message cité', () => {
  const doc = servi(ETAT(rendus([BRUT_IMAGE, BRUT_REPONSE])));

  /**
   * LA CIBLE EST DANS LA PAGE, DONC LE SAUT EXISTE. Le lien est un FRAGMENT :
   * le navigateur amène la ligne à l'écran et `:target` la met en évidence —
   * aucun script, et le geste marche à `javaScriptEnabled:false`.
   */
  it('mène au message cité par un lien de fragment quand la cible est servie', () => {
    expect(doc).toContain('data-cite="r1"');
    expect(doc).toContain('<a class="saut" href="#m-r1">');
    expect(doc).toContain(`id="m-r1"`);
  });

  it('nomme le geste dans le nom accessible du lien', () => {
    expect(doc).toContain(FIL.allerAuMessage);
  });

  /**
   * HORS PAGE, RIEN NE MÈNE NULLE PART (charte règle 7). Un `<a>` SANS `href`
   * n'est pas un contrôle : il ne prend pas le focus, n'a pas de rôle de lien,
   * et le lecteur ne touche pas une cible qui ne ferait rien.
   */
  it('n’offre AUCUN lien quand la cible n’est pas dans la page', () => {
    const seule = servi(ETAT([REPONSE_HORS_PAGE]));
    expect(seule).toContain('data-cite="hors-tranche"');
    expect(seule).toContain('<a class="saut">');
    expect(seule).not.toContain('href="#m-hors-tranche"');
  });

  it('ne fabrique aucun saut vers une publication ou une conversation d’origine', () => {
    const ailleurs = servi(
      ETAT([
        rendu(brut({ id: 'r8', content: 'Superbe.', storyReplyToId: 's1', postReplyTo: { id: 's1', type: 'STORY', previewText: 'Trois graphiques', authorId: 'u1', authorName: 'Amina' } })),
      ]),
    );
    expect(ailleurs).toContain('data-cite="s1"');
    expect(ailleurs).not.toContain('href="#m-s1"');
  });
});

describe('le plein écran d’un média — un ÉTAT de l’adresse hôte', () => {
  /**
   * SANS `?media=`, RIEN N'EST CHARGÉ. La règle de l'écran ne bouge pas : zéro
   * octet de média tant que personne ne l'a demandé (`cible/rich.png`, § 8.5).
   */
  it('ne rend ni surimpression ni média tant que l’adresse ne le demande pas', () => {
    const doc = servi(ETAT([IMAGE, VIDEO, VOCAL]));
    expect(doc).not.toContain('<dialog class="plein"');
    expect(doc).not.toContain('<img');
    expect(doc).not.toContain('<video');
  });

  it('ouvre la surimpression sur la pièce que l’adresse nomme', () => {
    const doc = servi(ETAT([IMAGE], { plein: 'ar1' }));
    expect(doc).toContain('<dialog class="plein"');
    expect(doc).toContain(' open');
    expect(doc).toContain('photo.jpg');
    expect(doc).toContain(`<img class="media-plein" src="${ORIGINE}/api/v1/attachments/file/2026/photo.jpg"`);
    expect(doc).toContain('width="1200" height="900"');
  });

  /**
   * FERMER REND LA MÊME TRANCHE, CADRÉE SUR LE MESSAGE. L'adresse NUE rejetait
   * le lecteur sur les quarante derniers messages : la photo qu'il regardait
   * — et la page d'historique qu'il lisait — disparaissaient de l'écran.
   */
  it('ferme par un lien vers la tranche qui porte la pièce, cadrée sur le message', () => {
    const doc = servi(ETAT([IMAGE], { plein: 'ar1' }));
    expect(doc).toContain('href="/chats/c1?autour=r1#m-r1"');
    expect(doc).toContain(FIL.fermer);
  });

  /**
   * PLEINE PAGE, DONC SANS VOILE : rien ne dépasse d'un visionneur qui remplit
   * l'écran, et une cible invisible par-dessus une cible visible apprend une
   * fausse règle (leçon 471). Deux chemins ferment — la croix, et Échap dès que
   * le module a élevé le `<dialog>` —, jamais un voile qu'aucun pixel ne montre.
   */
  it('n’offre aucun voile : le visionneur remplit l’écran', () => {
    expect(servi(ETAT([IMAGE], { plein: 'ar1' }))).not.toContain('class="voile"');
  });

  it('ne rend RIEN quand la pièce demandée n’est pas dans la page — jamais un cadre vide', () => {
    const doc = servi(ETAT([IMAGE], { plein: 'inconnue' }));
    expect(doc).not.toContain('<dialog class="plein"');
    expect(doc).not.toContain('<img');
  });

  /**
   * UN GENRE SANS PLEIN ÉCRAN N'EN A PAS, MÊME FORCÉ. Rien ne saurait montrer
   * un PDF en grand : lui ouvrir un cadre vide serait un contrôle sans effet
   * (charte règle 7). C'est la table qui le dit (`ouvre`), et l'adresse ne peut
   * pas la contredire.
   */
  it('ne rend rien pour un genre que la table n’ouvre pas en plein écran', () => {
    const doc = servi(ETAT([FICHIER], { plein: 'ar7' }));
    expect(doc).not.toContain('<dialog class="plein"');
  });

  /** Un message PROTÉGÉ ne porte aucune pièce (`lib/api/fil.ts`) : rien à ouvrir, donc rien ne s’ouvre. */
  it('ne rend rien pour la pièce d’un message protégé', () => {
    const protege = rendu(brut({ id: 'r9', isViewOnce: true, attachments: [PIECE({ id: 'secret' })] }));
    const doc = servi(ETAT([protege], { plein: 'secret' }));
    expect(doc).not.toContain('<dialog class="plein"');
  });

  it('joue la VIDÉO dans la surimpression, sans un octet avant la pression', () => {
    const doc = servi(ETAT([VIDEO], { plein: 'ar2' }));
    expect(doc).toContain('<video class="media-plein" controls preload="none"');
    expect(doc).toContain('0:42 · 3,0 Mo');
  });

  /**
   * LA PISTE SERVIE, JAMAIS L'ORIGINALE (cycle 128) : on entend ce qu'on lit,
   * dans la surimpression comme dans la ligne.
   */
  it('joue la piste de la langue SERVIE dans la fiche d’un vocal', () => {
    const doc = servi(ETAT([VOCAL], { plein: 'ar3' }));
    expect(doc).toContain('<audio class="media-plein" controls preload="none"');
    expect(doc).toContain(`${ORIGINE}/api/v1/attachments/file/2026/vocal-fr.m4a`);
  });

  it('rend la transcription ENTIÈRE et son original dans la fiche d’un vocal', () => {
    const doc = servi(ETAT([VOCAL], { plein: 'ar3' }));
    expect(doc).toContain('J’apporte les chiffres de mars.');
    expect(doc).toContain(FIL.transcrit('yo', 'fr'));
    expect(doc).toContain('lang="yo"');
    expect(doc).toContain('Mo n mú àwọn nọ́mbà oṣù Kẹta.');
  });

  /**
   * Le fichier reste à un geste, avec son poids ANNONCÉ — la surimpression ne le
   * télécharge pas à sa place. Le poids est dit UNE fois, dans l'en-tête : le
   * répéter dans l'action la faisait passer à deux lignes.
   */
  it('offre le fichier lui-même, nommé, sous un poids annoncé', () => {
    const doc = servi(ETAT([IMAGE], { plein: 'ar1' }));
    expect(doc).toContain(`href="${ORIGINE}/api/v1/attachments/file/2026/photo.jpg" target="_blank" rel="noopener"`);
    expect(doc).toContain(FIL.telecharger('photo.jpg'));
    expect(doc).toContain('<p class="poids">94 Ko</p>');
  });

  /**
   * DEUX PORTES, UNE VUE (§ 12.3) : l'invité de `/chat/:lien` reçoit la MÊME
   * surimpression que le membre — au retour près, qui est son adresse à lui.
   */
  it('rend la même surimpression aux deux portes', () => {
    const membre = servi(ETAT([IMAGE], { plein: 'ar1' }));
    const invite = servi(
      ETAT([IMAGE], {
        plein: 'ar1',
        porte: { genre: 'invite', lien: 'mshy_lagos' as never, segment: 'lagos-q1', pseudo: 'Tolu', droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true }, jonctionFraiche: false },
        lecteur: { id: 'p9', nom: 'Tolu', langues: ['fr'] },
      }),
    );
    const surimpression = (document_: string): string => /<dialog class="plein"[\s\S]*?<\/dialog>/.exec(document_)?.[0] ?? '';
    expect(surimpression(invite)).toBe(surimpression(membre).replaceAll('/chats/c1', '/chat/lagos-q1'));
  });
});

describe('ce que le TAP ouvre dans la ligne — une table, jamais un `if` par genre', () => {
  it('mène l’image et la vidéo au plein écran, à l’adresse hôte', () => {
    const doc = servi(ETAT([IMAGE, VIDEO]));
    expect(doc).toContain('<a class="media" href="/chats/c1?autour=r1&amp;media=ar1"');
    expect(doc).toContain('<a class="media" href="/chats/c1?autour=r2&amp;media=ar2"');
    expect(doc).toContain(FIL.pleinEcran('photo.jpg', '94 Ko'));
  });

  /** Un fichier n'a pas de plein écran : son geste reste le téléchargement, dans un onglet. */
  it('laisse un fichier ouvrir son onglet, avec le geste nommé', () => {
    const doc = servi(ETAT([FICHIER]));
    expect(doc).toContain(`<a class="media" href="${ORIGINE}/api/v1/attachments/file/2026/notes.pdf" target="_blank" rel="noopener"`);
    expect(doc).toContain(FIL.telecharger('notes.pdf', '94 Ko'));
  });

  /**
   * UN VOCAL S'ÉCOUTE SUR PLACE — le `<details>` ne coûte aucun octet avant la
   * pression — ET porte sa fiche : la transcription entière se lit en plein
   * écran, ce qu'une ligne de fil ne peut pas montrer.
   */
  it('garde le lecteur du vocal dans la ligne, et ajoute sa fiche', () => {
    const doc = servi(ETAT([VOCAL]));
    expect(doc).toContain('<details class="lecteur">');
    expect(doc).toContain('<a class="fiche" href="/chats/c1?autour=r3&amp;media=ar3"');
    expect(doc).toContain(FIL.fiche('vocal.m4a'));
  });

  /**
   * UNE PUCE « FICHE » SANS FICHE EST UN CONTRÔLE SANS EFFET (charte règle 7).
   * La transcription arrive APRÈS l'envoi — Whisper, puis NLLB, puis le TTS
   * (§ Audio Pipeline) : le cas NOMINAL des premières secondes d'un vocal était
   * une puce nommée « Fiche » ouvrant un plein écran dont le bloc de
   * transcription est vide, donc masqué (`.fiche-texte:empty`).
   */
  it('ne rend AUCUNE fiche sur un vocal sans transcription, et la rend dès qu’elle arrive', () => {
    const muet = rendu(
      brut({
        id: 'r10',
        content: '',
        attachments: [PIECE({ id: 'ar10', mimeType: 'audio/mp4', originalName: 'vocal.m4a', fileUrl: '/api/v1/attachments/file/2026/vocal.m4a', duration: 9_000 })],
      }),
    );
    const sansFiche = servi(ETAT([muet]));
    expect(sansFiche).toContain('<details class="lecteur">');
    expect(sansFiche).not.toContain('class="fiche"');
    expect(sansFiche).not.toContain(FIL.fiche('vocal.m4a'));

    expect(servi(ETAT([VOCAL]))).toContain('class="fiche"');
  });
});

/**
 * LE PLEIN ÉCRAN MARCHE À TOUTE PROFONDEUR D'HISTORIQUE — ce qu'il ne faisait
 * PAS : l'adresse ne portait que `?media=<pièce>`, sans nommer la tranche où la
 * pièce se trouve. La porte re-servait alors la tranche par DÉFAUT (les
 * quarante derniers messages, `lib/api/fil.ts`), où la pièce d'un message plus
 * ancien n'est pas — donc aucune surimpression, et la page d'historique perdue
 * par-dessus le marché. C'était le cas NOMINAL : sur la page `?avant=` (sans
 * JavaScript) comme sur l'historique chargé EN PLACE par le module
 * (`participate.ts`), c'est-à-dire sur la quasi-totalité des médias d'une
 * conversation vivante.
 */
describe('l’adresse d’un média nomme la TRANCHE qui le porte', () => {
  const VIEUX = rendu(
    brut({
      id: 'v1',
      content: 'Le tableau de janvier.',
      createdAt: '2026-01-04T09:00:00.000Z',
      attachments: [PIECE({ id: 'av1', originalName: 'janvier.jpg' })],
    }),
  );

  /** Une page d'HISTORIQUE : une tranche ancienne, et un curseur qui dit qu'il en reste. */
  const HISTORIQUE = ETAT([VIEUX], {
    fil: { id: 'c1', titre: 'Équipe Lagos', membres: 4, presence: { participants: [], presents: [] }, messages: [VIEUX], plusAncien: 'v0' },
  });

  it('nomme le message, jamais la seule pièce — donc l’adresse suffit à la servir', () => {
    expect(servi(HISTORIQUE)).toContain('<a class="media" href="/chats/c1?autour=v1&amp;media=av1"');
  });

  /**
   * ET LA PORTE SERT CETTE TRANCHE : nommée, la pièce est là, la surimpression
   * s'ouvre. C'est l'exacte page que le tap demande, rejouée.
   */
  it('ouvre la surimpression à l’adresse où le tap mène, sur une pièce hors de la tranche récente', () => {
    const servie = servi(ETAT([VIEUX], { plein: 'av1' }));
    expect(servie).toContain('<dialog class="plein"');
    expect(servie).toContain('janvier.jpg');
    expect(servie).toContain('href="/chats/c1?autour=v1#m-v1"');
  });

  /** Le lien « plus anciens » garde son curseur : la pagination sans JavaScript ne change pas. */
  it('laisse la pagination sans JavaScript à son curseur `?avant=`', () => {
    expect(servi(HISTORIQUE)).toContain('href="/chats/c1?avant=v0"');
  });
});

/**
 * SANS JAVASCRIPT, LA SURIMPRESSION RETIENT LE FOCUS ET LE LECTEUR D'ÉCRAN.
 * Servie APRÈS le `<main>` et sans `inert`, elle laissait derrière elle un fil
 * ENTIER focusable : le clavier traversait retour, médias, composeur, sauts de
 * citation — vingt-et-un contrôles invisibles — avant d'atteindre la croix, et
 * pouvait poster un message qu'il ne voyait pas ; un lecteur d'écran annonçait
 * un fil que rien ne montre. `showModal()` donne les trois choses AVEC
 * JavaScript ; `inert` les donne SANS, et c'est le chemin qui doit marcher
 * partout.
 */
describe('la surimpression est servie DEVANT le fil, qui devient inerte', () => {
  const ouvert = servi(ETAT([IMAGE], { plein: 'ar1' }));

  it('rend le dialogue AVANT le `<main>` — l’ordre que le CLS de sa voisine a déjà tranché', () => {
    expect(ouvert.indexOf('<dialog class="plein"')).toBeLessThan(ouvert.indexOf('<main'));
  });

  it('rend le `<main>` inerte, et le déclare modal', () => {
    expect(ouvert).toContain('<main id="main-content" class="fil-ecran" inert');
    expect(ouvert).toContain('aria-modal="true"');
  });

  it('ne rend RIEN d’inerte quand aucune surimpression n’est servie', () => {
    expect(servi(ETAT([IMAGE]))).not.toContain(' inert');
  });

  /**
   * INERTE N'EST PAS VIDÉ. Le cadre de l'état CHOIX retire gabarits et bandeaux
   * — aucun module ne s'y charge —, la surimpression non : le fil vit derrière
   * elle, et le module qui reprend la main y trouve tout ce qu'il lui faut.
   */
  it('garde les gabarits et les bandeaux du fil derrière la surimpression', () => {
    const avecModule = documentDuFil(ETAT([IMAGE], { plein: 'ar1', tempsReel: TEMPS_REEL }));
    expect(avecModule).toContain('id="gabarit-ligne"');
    expect(avecModule).toContain('id="bandeau-hors-ligne"');
  });
});

/**
 * LA VIDÉO A UNE BOÎTE. En `preload="none"` un `<video>` n'a aucune métadonnée,
 * donc aucun rapport intrinsèque : sans `width`/`height` ni règle de feuille, le
 * navigateur retombe sur ses 300 × 150 par défaut — mesuré, le « plein écran »
 * d'une vidéo était PLUS PETIT que son affiche dans le fil (294 × 165).
 */
describe('la boîte du média en plein écran', () => {
  it('porte les dimensions servies sur la VIDÉO comme sur l’image', () => {
    const large = rendu(
      brut({
        id: 'r11',
        content: '',
        attachments: [PIECE({ id: 'ar11', mimeType: 'video/mp4', originalName: 'revue.mp4', fileUrl: '/api/v1/attachments/file/2026/revue.mp4', width: 1920, height: 1080 })],
      }),
    );
    expect(servi(ETAT([large], { plein: 'ar11' }))).toContain('<video class="media-plein" controls preload="none" width="1920" height="1080"');
  });

  /** Sans dimensions servies, c'est la FEUILLE qui donne le rapport — jamais les 300 × 150 du navigateur. */
  it('donne un rapport à une vidéo dont la passerelle ne sert pas les dimensions', () => {
    const doc = documentDuFil(ETAT([VIDEO], { plein: 'ar2' }));
    expect(doc).toContain('<video class="media-plein" controls preload="none" src=');
    expect(doc).toContain('video.media-plein:not([width]){aspect-ratio:16/9}');
    expect(doc).toContain('video.media-plein{width:100%;height:auto}');
  });
});

/**
 * LE SOUS-TITRE EST UNE PHRASE, PROJETÉE DEUX FOIS. Le texte (la description du
 * document) et le HTML (la ligne visible) partaient de deux compositions
 * voisines : pour un tête-à-tête sans personne en ligne — la forme la plus
 * courante d'une messagerie — la ligne visible était VIDE pendant que la
 * description rendait le titre de la conversation ; à la première présence
 * reçue, la description devenait « 1 en ligne » et perdait le nom.
 */
describe('la description du document et la ligne de l’en-tête disent la MÊME chose', () => {
  const texteDeLaLigne = (document_: string): string =>
    (/<p class="sous">([\s\S]*?)<\/p>/.exec(document_)?.[1] ?? '')
      // La fente de présence est SERVIE mais `hidden` à zéro : ce que le lecteur
      // VOIT n'est pas ce que le balisage porte.
      .replace(/<span[^>]*\shidden[^>]*>[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]*>/g, '');
  const description = (document_: string): string => /<meta name="description" content="([^"]*)"/.exec(document_)?.[1] ?? '';

  const aDeux = (presents: readonly string[]): string =>
    documentDuFil(ETAT([IMAGE], { fil: { id: 'c1', titre: 'Ibrahim Diallo', membres: 2, presence: { participants: ['u2'], presents }, messages: [IMAGE], plusAncien: null } }));

  it('rend la même phrase des deux côtés dès qu’il y a quelque chose à dire', () => {
    const doc = aDeux(['u2']);
    expect(texteDeLaLigne(doc)).toBe('1 en ligne');
    expect(description(doc)).toBe('1 en ligne');
  });

  it('rend la même phrase des deux côtés à quatre participants', () => {
    const doc = documentDuFil(ETAT([IMAGE], { fil: { id: 'c1', titre: 'Équipe Lagos', membres: 4, presence: { participants: ['u2'], presents: ['u2'] }, messages: [IMAGE], plusAncien: null } }));
    expect(texteDeLaLigne(doc)).toBe('4 participants · 1 en ligne');
    expect(description(doc)).toBe('4 participants · 1 en ligne');
  });

  /**
   * LE REPLI APPARTIENT À LA DESCRIPTION, pas à la ligne : y replier le titre le
   * rendrait DEUX FOIS, sous le `<h1>` qui le porte déjà.
   */
  it('replie la DESCRIPTION sur le titre quand la phrase est vide, sans le redire dans l’en-tête', () => {
    const doc = aDeux([]);
    expect(texteDeLaLigne(doc)).toBe('');
    expect(description(doc)).toBe('Ibrahim Diallo');
  });

  /**
   * ET LA FENTE RÉSERVE SA HAUTEUR : révélée par un `user:status`, elle faisait
   * autrement grandir l'en-tête d'une ligne et pousser tout le fil — un décalage
   * sur l'écran dont le budget est CLS ≤ 0,05, et que la mesure verte du gate ne
   * pouvait pas voir (elle est prise sur une fixture à quatre membres, où le
   * sous-titre n'est jamais vide).
   */
  it('réserve la hauteur de la ligne, vide ou pleine', () => {
    expect(aDeux([])).toContain('.fil-tete .sous{margin:0;min-height:calc(var(--text-sm) * var(--leading-normal))');
  });
});

/**
 * LE POIDS DU DOCUMENT, ET CE QUE L'ÉTAT `?media=` Y AJOUTE — mesuré, et
 * RATCHETÉ (`budgets-mesures.json`). Le tour précédent déclarait que la
 * surimpression « n'ajoute aucun motif de budget » sans jamais peser le
 * document qui la porte : vrai des REQUÊTES (elle est servie dans le même
 * document, mesuré par `v3-fil-riche.spec.ts`), mais le document, lui, grossit
 * de sa feuille et de son balisage, et rien ne l'opposait à quoi que ce soit.
 *
 * Ce que ce témoin interdit, c'est la croissance SILENCIEUSE : toute valeur
 * au-dessus de celle enregistrée rend rouge, et la faire monter exige un diff
 * relu. Le plafond de la charte (`budgets.json` › `documents.document_o`,
 * 9 216 o) est FRANCHI par ce document depuis avant ce tour — c'est déclaré
 * dans `budgets-mesures.json`, pas effacé, et ce n'est pas ce témoin-ci qui le
 * réglera.
 */
describe('le poids du document du fil, et le surcoût de l’état `?media=`', () => {
  const FIXE = [IMAGE, VIDEO, VOCAL, FICHIER];
  const octets = (source: string): number => gzipSync(Buffer.from(source, 'utf8'), { level: 9 }).length;
  const mesures = JSON.parse(readFileSync(join(__dirname, '..', 'budgets-mesures.json'), 'utf8')) as {
    readonly documents_du_fil: { readonly fil_o: number; readonly fil_media_o: number };
  };

  const ordinaire = octets(documentDuFil(ETAT(FIXE, { tempsReel: TEMPS_REEL })));
  const enPlein = octets(documentDuFil(ETAT(FIXE, { tempsReel: TEMPS_REEL, plein: 'ar1' })));

  it('ne laisse pas le document du fil grossir en silence', () => {
    console.log(`[mesure] document du fil ${ordinaire} o gzip · en plein écran ${enPlein} o gzip · surcoût ${enPlein - ordinaire} o`);
    expect(ordinaire).toBeLessThanOrEqual(mesures.documents_du_fil.fil_o);
  });

  it('ne laisse pas l’état `?media=` grossir en silence', () => {
    expect(enPlein).toBeLessThanOrEqual(mesures.documents_du_fil.fil_media_o);
  });

  /** Et le surcoût reste un SURCOÛT : le fil ordinaire ne paie pas un octet de la surimpression. */
  it('ne fait payer la surimpression qu’à l’état qui la sert', () => {
    expect(enPlein).toBeGreaterThan(ordinaire);
    expect(documentDuFil(ETAT(FIXE, { tempsReel: TEMPS_REEL }))).not.toContain('dialog.plein');
  });
});

describe('le nombre de participants ne s’affiche pas dans une conversation à deux (§ 12.10.2)', () => {
  const avec = (membres: number, presents: readonly string[] = []): string =>
    documentDuFil(ETAT([IMAGE], { fil: { id: 'c1', titre: 'Équipe Lagos', membres, presence: { participants: ['u2'], presents }, messages: [IMAGE], plusAncien: null } }));

  it('se tait à deux', () => {
    expect(avec(2)).not.toContain(FIL.participants);
  });

  it('se tait aussi à un — une conversation qu’on n’a pas encore partagée', () => {
    expect(avec(1)).not.toContain(FIL.participants);
  });

  it('parle à partir de trois', () => {
    expect(avec(3)).toContain(`3 ${FIL.participants}`);
  });

  /** La PRÉSENCE garde sa place : c'est le COMPTE de deux personnes qui n'apprend rien. */
  it('garde « N en ligne » dans une conversation à deux', () => {
    expect(avec(2, ['u2'])).toContain(`1 ${FIL.enLigne}`);
  });
});
