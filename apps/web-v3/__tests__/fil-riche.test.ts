/**
 * @jest-environment node
 */

import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { MENTION_PROTEGEE, message, type Citation, type Message } from '@/lib/api/fil';
import { FIL, libelleDeCitation } from '@/lib/contenu/fil';

/**
 * **LES SIX FORMES D'UN MESSAGE — image, vidéo, audio, transfert, réponse,
 * story — et le fait qu'UNE règle les rende toutes** (issue #4835,
 * `cible/rich.png`).
 *
 * Deux AXES, et deux seulement : ce qu'un message PORTE (une pièce jointe, dont
 * la forme dérive de `PieceJointe.genre`) et ce qu'un message CITE (une
 * citation, dont la forme dérive de `Citation.genre`). Chaque axe a UNE table
 * et UNE fonction de rendu ; il n'existe aucune branche par forme, et donc
 * aucun endroit où deux formes puissent diverger au premier correctif.
 *
 * Le PRISME n'est descendu qu'une fois par texte, par `resolvePrismTranslation`
 * (`lib/api/fil.ts`) — et la PISTE d'un vocal est élue par la langue du TEXTE
 * SERVI, jamais par une seconde descente (CLAUDE.md § Prisme, cycle 128).
 */

const ORIGINE = 'https://gate.test';

const brut = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'm1',
  content: 'Le tableau final de la revue.',
  originalLanguage: 'fr',
  createdAt: '2026-09-01T12:06:00.000Z',
  senderId: 'u2',
  sender: { id: 'p2', displayName: 'Ibrahim' },
  ...attributs,
});

const rendu = (m: Record<string, unknown>, langues: readonly string[] = ['fr'], moi = 'u1'): Message => {
  const resultat = message(m, moi, langues, ORIGINE);
  if (resultat === null) throw new Error('message non lu');
  return resultat;
};

const PIECE = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'a1',
  fileUrl: '/api/v1/attachments/file/2026/photo.jpg',
  originalName: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 96_000,
  ...attributs,
});

describe('ce qu’un message PORTE — une pièce, sa forme dérivée du genre', () => {
  it('donne à chaque genre son glyphe et son lecteur, depuis UNE table', () => {
    const genres = ['image/jpeg', 'video/mp4', 'audio/mp4', 'application/pdf'] as const;
    const attendus = ['image', 'video', 'audio', 'fichier'];
    genres.forEach((mimeType, rang) => {
      const m = rendu(brut({ attachments: [PIECE({ mimeType })] }));
      expect(m.pieces[0]?.genre).toBe(attendus[rang]);
    });
  });

  /**
   * LA PISTE EST ÉLUE PAR LA LANGUE DU TEXTE SERVI (cycle 128) : le lecteur
   * ENTEND ce qu'il LIT. La carte `translations` porte les deux — le texte
   * traduit et la piste que le TTS en a produite — et `transcriptTranslationTracks`
   * (`packages/shared/types/attachment-audio.ts`) en est le site unique.
   */
  it('joue la piste de la langue SERVIE, résolue sur l’origine publique', () => {
    const m = rendu(
      brut({
        content: '',
        attachments: [
          PIECE({
            id: 'a2',
            mimeType: 'audio/mp4',
            originalName: 'vocal.m4a',
            fileUrl: '/api/v1/attachments/file/2026/vocal.m4a',
            duration: 21_000,
            transcription: { text: 'Mo n mú àwọn nọ́mbà', language: 'yo' },
            translations: {
              fr: { transcription: 'J’apporte les chiffres de mars.', url: '/api/v1/attachments/file/2026/vocal-fr.m4a' },
            },
          }),
        ],
      }),
      ['fr', 'yo'],
    );
    expect(m.pieces[0]?.transcription).toBe('J’apporte les chiffres de mars.');
    expect(m.pieces[0]?.langueServie).toBe('fr');
    expect(m.pieces[0]?.piste).toBe('https://gate.test/api/v1/attachments/file/2026/vocal-fr.m4a');
  });

  it('retombe sur le fichier d’origine quand le TTS n’a pas produit la piste servie', () => {
    const m = rendu(
      brut({
        content: '',
        attachments: [
          PIECE({
            id: 'a3',
            mimeType: 'audio/mp4',
            fileUrl: '/api/v1/attachments/file/2026/vocal.m4a',
            transcription: { text: 'Mo n mú', language: 'yo' },
            translations: { fr: { transcription: 'J’apporte' } },
          }),
        ],
      }),
      ['fr'],
    );
    expect(m.pieces[0]?.langueServie).toBe('fr');
    expect(m.pieces[0]?.piste).toBe('https://gate.test/api/v1/attachments/file/2026/vocal.m4a');
  });

  /**
   * SEUL un vocal change de piste. La carte des pistes ne dit jamais qu'une
   * piste traduite serait une VIDÉO — `transcriptTranslationTracks` normalise
   * son format en `audio/*` —, et la servir à un `<video>` remplacerait l'image
   * par du son. Le Prisme d'une vidéo passe par ses sous-titres.
   */
  it('ne change PAS la piste d’une vidéo, même quand une piste traduite existe', () => {
    const m = rendu(
      brut({
        content: '',
        attachments: [
          PIECE({
            id: 'a8',
            mimeType: 'video/mp4',
            fileUrl: '/api/v1/attachments/file/2026/revue.mp4',
            transcription: { text: 'Hola', language: 'es' },
            translations: { fr: { transcription: 'Bonjour', url: '/api/v1/attachments/file/2026/revue-fr.m4a' } },
          }),
        ],
      }),
      ['fr'],
    );
    expect(m.pieces[0]?.langueServie).toBe('fr');
    expect(m.pieces[0]?.piste).toBe('https://gate.test/api/v1/attachments/file/2026/revue.mp4');
  });

  /** Une SECONDE descente choisirait la piste sans regarder le texte servi : ici le rang 1 n'a pas de piste, le texte non plus — les deux tombent ensemble. */
  it('ne descend pas une seconde fois : sans traduction servie, la piste est l’originale', () => {
    const m = rendu(
      brut({
        content: '',
        attachments: [
          PIECE({
            id: 'a4',
            mimeType: 'audio/mp4',
            fileUrl: '/api/v1/attachments/file/2026/vocal.m4a',
            transcription: { text: 'Hello', language: 'en' },
            translations: { es: { transcription: 'Hola', url: '/api/v1/attachments/file/2026/vocal-es.m4a' } },
          }),
        ],
      }),
      ['fr'],
    );
    expect(m.pieces[0]?.langueServie).toBeNull();
    expect(m.pieces[0]?.piste).toBe('https://gate.test/api/v1/attachments/file/2026/vocal.m4a');
  });
});

describe('ce qu’un message CITE — une citation, sa forme dérivée du genre', () => {
  const REPLY = {
    id: 'm0',
    content: 'Le tableau final de la revue.',
    originalLanguage: 'en',
    createdAt: '2026-09-01T12:00:00.000Z',
    sender: { id: 'p2', displayName: 'Ibrahim' },
  };

  it('lit une RÉPONSE dans `replyTo`, avec son auteur, son aperçu et sa langue', () => {
    const citations = rendu(brut({ replyToId: 'm0', replyTo: REPLY })).citations;
    expect(citations).toEqual<readonly Citation[]>([
      { genre: 'reponse', source: 'Ibrahim', sorte: null, pourMoi: false, apercu: 'Le tableau final de la revue.', langue: 'en', cible: 'm0', surLaPage: false },
    ]);
  });

  /** Le message CITÉ peut être protégé : ce que la passerelle en dit se lit, et rien de son texte ne part (cycles 124 / 125). */
  it('ne cite pas le texte d’un message protégé', () => {
    const citation = rendu(brut({ replyToId: 'm0', replyTo: { ...REPLY, isViewOnce: true } })).citations[0];
    expect(citation?.apercu).not.toContain('Le tableau final');
    expect(citation?.apercu).toBe(MENTION_PROTEGEE);
  });

  it('lit un TRANSFERT sur la conversation d’origine que la passerelle NOMME', () => {
    const citations = rendu(
      brut({ forwardedFromId: 'x1', forwardedFromConversationId: 'c9', forwardedFromConversation: { id: 'c9', title: 'Diaspora FR-EN', type: 'group' } }),
    ).citations;
    expect(citations).toEqual<readonly Citation[]>([
      { genre: 'transfert', source: 'Diaspora FR-EN', sorte: null, pourMoi: false, apercu: '', langue: null, cible: 'x1', surLaPage: false },
    ]);
  });

  /**
   * RÉGIME 3 — la réciprocité de la source (directive 2026-08-23) peut TAIRE le
   * nom : la passerelle sert alors `forwardedFromId` seul. Le transfert se dit,
   * la source ne s'invente pas.
   */
  it('dit le transfert sans nommer une source que la passerelle a tue', () => {
    const citation = rendu(brut({ forwardedFromId: 'x1' })).citations[0];
    expect(citation?.genre).toBe('transfert');
    expect(citation?.source).toBeNull();
  });

  it('lit une réponse à une PUBLICATION depuis le snapshot figé, et dit sa sorte', () => {
    const citations = rendu(
      brut({
        storyReplyToId: 's1',
        postReplyTo: { id: 's1', type: 'STORY', moodEmoji: null, previewText: 'Trois graphiques, deux surprises.', thumbnailUrl: null, authorId: 'u1', authorName: 'Amina' },
      }),
    ).citations;
    expect(citations).toEqual<readonly Citation[]>([
      { genre: 'story', source: 'Amina', sorte: 'story', pourMoi: true, apercu: 'Trois graphiques, deux surprises.', langue: null, cible: 's1', surLaPage: false },
    ]);
  });

  /**
   * Le chemin REST/ZMQ de `message:new` ne HISSE pas `postReplyTo` : il sert
   * `metadata` brut (`MeeshySocketIOManager.ts:2942`). Les deux formes se lisent,
   * et c'est la même citation.
   */
  it('lit la même citation depuis `metadata.postReplyTo` que le fil temps réel sert brut', () => {
    const snapshot = { id: 's1', type: 'STATUS', moodEmoji: '🎉', previewText: '', thumbnailUrl: null, authorId: 'u7', authorName: 'Luc Mbaye' };
    const citation = rendu(brut({ storyReplyToId: 's1', metadata: { postReplyTo: snapshot } })).citations[0];
    expect(citation).toEqual<Citation>({ genre: 'story', source: 'Luc Mbaye', sorte: 'humeur', pourMoi: false, apercu: '🎉', langue: null, cible: 's1', surLaPage: false });
  });

  it('les cite dans un ORDRE fixe — provenance, puis réponse, puis publication', () => {
    const citations = rendu(
      brut({
        forwardedFromId: 'x1',
        replyToId: 'm0',
        replyTo: REPLY,
        storyReplyToId: 's1',
        postReplyTo: { id: 's1', type: 'POST', moodEmoji: null, previewText: 'Le glossaire', thumbnailUrl: null, authorId: 'u9', authorName: 'Sara Kim' },
      }),
    ).citations;
    expect(citations.map((citation) => citation.genre)).toEqual(['transfert', 'reponse', 'story']);
  });

  it('n’en cite aucune quand le message n’en porte pas — et un message protégé n’en porte jamais', () => {
    expect(rendu(brut()).citations).toEqual([]);
    expect(rendu(brut({ isViewOnce: true, replyToId: 'm0', replyTo: REPLY })).citations).toEqual([]);
  });
});

describe('le libellé d’une citation — UNE table, lue par le serveur et par le module', () => {
  const citation = (attributs: Partial<Citation>): Citation => ({
    genre: 'reponse',
    source: null,
    sorte: null,
    pourMoi: false,
    apercu: '',
    langue: null,
    cible: 'm0',
    surLaPage: false,
    ...attributs,
  });

  it.each([
    [citation({ genre: 'reponse', source: 'Ibrahim' }), 'En réponse à Ibrahim'],
    [citation({ genre: 'reponse' }), 'En réponse à un message'],
    [citation({ genre: 'transfert', source: 'Diaspora FR-EN' }), 'Transféré depuis Diaspora FR-EN'],
    [citation({ genre: 'transfert' }), 'Message transféré'],
    [citation({ genre: 'story', sorte: 'story', pourMoi: true }), 'A répondu à votre story'],
    [citation({ genre: 'story', sorte: 'humeur', pourMoi: true }), 'A répondu à votre humeur'],
    [citation({ genre: 'story', sorte: 'reel', source: 'Luc Mbaye' }), 'A répondu à un reel de Luc Mbaye'],
    [citation({ genre: 'story', sorte: 'publication' }), 'A répondu à une publication'],
  ])('dit %o « %s »', (donnee, attendu) => {
    expect(libelleDeCitation(donnee)).toBe(attendu);
  });
});

const FIL_RICHE = (messages: readonly Message[]): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'Types de messages', membres: 4, presence: { participants: [], presents: [] }, messages, plusAncien: null },
  lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
  erreur: null,
  brouillon: '',
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  composeur: { genre: 'ouvert' },
  tempsReel: null,
  plein: null,
  profil: null,
});

describe('le document servi — six formes, un balisage', () => {
  const image = rendu(brut({ attachments: [PIECE()] }));
  const video = rendu(
    brut({
      id: 'm2',
      content: '',
      attachments: [
        PIECE({ id: 'a5', mimeType: 'video/mp4', originalName: 'revue.mp4', fileSize: 3_100_000, duration: 42_000, transcription: { text: 'Hola', language: 'es' }, translations: { fr: { transcription: 'Bonjour' } } }),
      ],
    }),
  );
  const audio = rendu(
    brut({
      id: 'm3',
      content: '',
      attachments: [
        PIECE({ id: 'a6', mimeType: 'audio/mp4', originalName: 'vocal.m4a', fileSize: 96_000, duration: 21_000, transcription: { text: 'Mo n mú', language: 'yo' }, translations: { fr: { transcription: 'J’apporte les chiffres de mars.', url: '/api/v1/attachments/file/2026/vocal-fr.m4a' } } }),
      ],
    }),
  );
  const transfert = rendu(brut({ id: 'm4', content: 'Le glossaire partagé a été mis à jour.', forwardedFromId: 'x1', forwardedFromConversationId: 'c9', forwardedFromConversation: { id: 'c9', title: 'Diaspora FR-EN' } }));
  const reponse = rendu(brut({ id: 'm5', content: 'Je le mets dans le dossier de mars.', replyToId: 'm1', replyTo: { id: 'm1', content: 'Le tableau final de la revue.', originalLanguage: 'en', sender: { id: 'p2', displayName: 'Ibrahim' } } }));
  const story = rendu(brut({ id: 'm6', content: 'Superbe, c’était où ?', storyReplyToId: 's1', postReplyTo: { id: 's1', type: 'STORY', moodEmoji: null, previewText: 'Trois graphiques', thumbnailUrl: null, authorId: 'u1', authorName: 'Amina' } }));

  const doc = documentDuFil(FIL_RICHE([image, video, audio, transfert, reponse, story]));
  const servi = doc.replace(/<template[\s\S]*?<\/template>/g, '');

  /**
   * UN BLOC PAR PIÈCE, et le GENRE le choisit. La cible dessine un cadre pour
   * l'image, un poster de lecture pour la vidéo, un lecteur compact pour le
   * vocal — jamais une affiche de téléchargement PUIS un lecteur natif, ce que
   * le rendu empilait (le même fichier annoncé deux fois, nom de fichier en
   * texte primaire d'un bloc que `cible/rich.png` ne dessine pas).
   *
   * DEPUIS LA DIRECTIVE § 12.10.1, la VIDÉO est une AFFICHE comme l'image : son
   * poster mène au PLEIN ÉCRAN, où elle se joue. Ce qui reste un lecteur DANS
   * la ligne est ce qui s'écoute sur place sans rien coûter — le vocal, et lui
   * seul (`sEcouteSurPlace`, `lib/api/formes.ts`). La cible ne bouge pas : le
   * poster 16/9 au rond de lecture est le même, seul le geste change.
   */
  it('rend UN bloc par pièce, choisi par le genre, sur un `<li data-genre>`', () => {
    expect(servi).toContain('<li data-piece="a1" data-genre="image">');
    expect(servi).toContain('<li data-piece="a5" data-genre="video">');
    expect(servi).toContain('<li data-piece="a6" data-genre="audio">');

    const blocs = [...servi.matchAll(/<li data-piece="[^"]+" data-genre="(\w+)">(<a class="media"|<details class="lecteur">)/g)].map(
      ([, genre, bloc]) => [genre, bloc?.startsWith('<a') === true ? 'affiche' : 'lecteur'],
    );
    // La liste est SERVIE du plus récent au plus ancien (`lignes`, feuille en
    // `column-reverse`) : l'ordre du DOM est l'inverse de l'ordre d'écriture.
    expect(blocs).toEqual([
      ['audio', 'lecteur'],
      ['video', 'affiche'],
      ['image', 'affiche'],
    ]);
    // Une pièce, un bloc : autant d'ouvertures que de pièces, jamais deux par pièce.
    expect(servi.split('<a class="media"').length - 1 + (servi.split('<details class="lecteur">').length - 1)).toBe(3);
  });

  it('rend les trois genres de citation par le MÊME élément, distingué par `data-genre`', () => {
    expect(servi).toContain('<li class="citation" data-genre="transfert" data-cite="x1">');
    expect(servi).toContain('<li class="citation" data-genre="reponse" data-cite="m1">');
    expect(servi).toContain('<li class="citation" data-genre="story" data-cite="s1">');
    expect(servi.split('<li class="citation"').length - 1).toBe(3);
  });

  it('annonce le poids et la durée AVANT qu’un octet ne parte — et ne pose aucun <img>', () => {
    expect(servi).toContain('0:42 · 3,0 Mo');
    expect(servi).toContain('0:21 · 94 Ko');
    expect(servi).not.toContain('<img');
    expect(servi).toContain('preload="none"');
  });

  it('sert la piste TRADUITE au lecteur audio, jamais l’originale', () => {
    expect(servi).toContain('src="https://gate.test/api/v1/attachments/file/2026/vocal-fr.m4a"');
  });

  /**
   * LE PRISME EST DIT TEL QU'IL EST SERVI. « Sous-titres fr » PROMETTAIT une
   * piste que le `<video>` ne porte pas — la passerelle n'expose aucun WebVTT
   * (régime 3) : un tap sur « lire » donnait la vidéo espagnole SANS
   * sous-titres, sous un badge qui en promettait en français. Ce que l'écran
   * sert est la TRANSCRIPTION traduite ; c'est donc elle qu'il annonce.
   */
  it('n’annonce aucun sous-titre, et dit ce qu’il sert : le transcrit et sa langue', () => {
    expect(servi).not.toContain('Sous-titres');
    expect(servi).not.toContain('<track');
    expect(servi).toContain(FIL.transcrit('es', 'fr'));
  });

  /**
   * UN VOCAL SANS TEXTE ANNONCE SON PRISME. `langueServie` d'un message sans
   * texte vaut `null` : la pastille et « Voir l'original » disparaissaient avec
   * lui, et le lecteur ne savait ni qu'il lisait une traduction ni comment
   * atteindre l'original (cycle 122). La cible dessine pourtant cette pastille
   * sous la vidéo SANS texte de `cible/rich.png`.
   */
  it('annonce le prisme d’un message dont le vocal est le seul contenu', () => {
    const seul = documentDuFil(FIL_RICHE([audio])).replace(/<template[\s\S]*?<\/template>/g, '');
    expect(seul).toContain(`<span class="code">yo</span>`);
    expect(seul).toContain(FIL.transcrit('yo', 'fr'));
    expect(seul).toContain('<details class="transcrit-original">');
    expect(seul).toContain('Mo n mú');
  });

  /**
   * TOUCHER UNE PIÈCE JOINTE NE QUITTE PLUS LA CONVERSATION — et depuis la
   * directive § 12.10.1, une image ou une vidéo n'ouvre même plus d'onglet :
   * elle ouvre le PLEIN ÉCRAN, un état de l'adresse hôte. Ce qui n'a pas de
   * plein écran (un PDF, une archive) garde l'onglet, et `download` reste
   * absent : il est IGNORÉ hors origine, et la passerelle EST une autre origine
   * que le document — le clic NAVIGUAIT alors l'onglet vers le fichier brut,
   * fil, position de lecture et socket perdus, sans que rien ne l'annonce.
   */
  it('ouvre une image en plein écran, un fichier dans un onglet, et NOMME les deux gestes', () => {
    expect(servi).not.toContain('download');
    // L'adresse nomme la TRANCHE (le message) autant que la pièce : c'est ce
    // qui la rend servable hors des quarante derniers messages.
    expect(servi).toContain('<a class="media" href="/chats/c1?autour=m1&amp;media=a1"');
    expect(servi).toContain(`aria-label="${FIL.pleinEcran('photo.jpg', '94 Ko')}"`);
    expect(servi).not.toContain('target="_blank"');

    const fichier = documentDuFil(
      FIL_RICHE([rendu(brut({ id: 'm7', attachments: [PIECE({ id: 'a9', mimeType: 'application/pdf', originalName: 'notes.pdf' })] }))]),
    ).replace(/<template[\s\S]*?<\/template>/g, '');
    expect(fichier).toContain('target="_blank" rel="noopener"');
    expect(fichier).toContain(`aria-label="${FIL.telecharger('notes.pdf', '94 Ko')}"`);
  });

  it('pose lang= sur une transcription servie dans une langue ≠ celle du document', () => {
    const anglaise = documentDuFil(
      FIL_RICHE([
        rendu(
          brut({
            content: '',
            attachments: [PIECE({ id: 'a7', mimeType: 'audio/mp4', transcription: { text: 'Hello', language: 'fr' }, translations: { en: { transcription: 'Hello there' } } })],
          }),
          ['en'],
        ),
      ]),
    );
    expect(anglaise).toContain('lang="en"');
    expect(anglaise).toContain('Hello there');
  });

  it('cite la provenance, la réponse et la publication avec leurs libellés', () => {
    expect(servi).toContain('Transféré depuis Diaspora FR-EN');
    expect(servi).toContain('En réponse à Ibrahim');
    expect(servi).toContain('A répondu à votre story');
  });

  it('pose la langue de l’aperçu cité quand elle diffère de celle du document', () => {
    expect(servi).toContain('<span class="apercu" lang="en">Le tableau final de la revue.</span>');
  });

  it('n’offre aucun contrôle vers une destination que la v3 ne sert pas', () => {
    expect(servi).not.toContain('<a class="citation"');
    expect(servi).not.toMatch(/<button[^>]*class="citation/);
  });

  it('rend ce qui est CITÉ, puis ce qui est PORTÉ, puis ce qui est DIT — l’ordre de la cible', () => {
    const seule = documentDuFil(FIL_RICHE([rendu(brut({ replyToId: 'm0', replyTo: { id: 'm0', content: 'Le tableau', sender: { id: 'p2', displayName: 'Ibrahim' } }, attachments: [PIECE()] }))])).replace(
      /<template[\s\S]*?<\/template>/g,
      '',
    );
    const rangs = ['<ul class="citations"', '<ul class="pieces">', '<p class="texte"'].map((balise) => seule.indexOf(balise));
    expect(rangs.every((rang) => rang > -1)).toBe(true);
    expect([...rangs].sort((a, b) => a - b)).toEqual(rangs);
  });

  /**
   * DEUX PORTES, UNE VUE (conception § 12.3) : l'invité de `/chat/:lien` lit
   * les six formes avec le MÊME balisage que le membre de `/chats/:cle`. Le
   * témoin oppose ce que les deux portes rendent, morceau par morceau — c'est
   * la seule façon de voir une jumelle naître.
   */
  it('rend les six formes à l’identique aux deux portes', () => {
    const messages = [image, video, audio, transfert, reponse, story];
    const morceaux = (document_: string): readonly string[] => [
      ...document_.replace(/<template[\s\S]*?<\/template>/g, '').matchAll(/<ul class="(?:pieces|citations)"[\s\S]*?<\/ul>/g),
    ].map(([bloc]) => bloc);

    const membre = morceaux(documentDuFil(FIL_RICHE(messages))).map((bloc) => bloc.replaceAll('/chats/c1', '<porte>'));
    const invite = morceaux(
      documentDuFil({
        ...FIL_RICHE(messages),
        porte: { genre: 'invite', lien: 'mshy_lagos' as never, segment: 'lagos-q1', pseudo: 'Tolu', droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true }, jonctionFraiche: false },
        lecteur: { id: 'p9', nom: 'Tolu', langues: ['fr'] },
      }),
    );
    expect(membre.length).toBe(6);
    // Les deux portes rendent le même balisage AU NOM DE LEUR ADRESSE PRÈS :
    // le plein écran est un état de l'adresse HÔTE, donc `/chats/:cle?media=`
    // chez le membre et `/chat/:lien?media=` chez l'invité.
    expect(invite.map((bloc) => bloc.replaceAll('/chat/lagos-q1', '<porte>'))).toEqual(membre);
  });

  it('porte un gabarit qui offre au module les MÊMES fentes — pièces et citations', () => {
    const gabarit = /<template id="gabarit-ligne">[\s\S]*?<\/template>/.exec(doc)?.[0] ?? '';
    expect(gabarit).toContain('<a class="media"');
    expect(gabarit).toContain('<li class="citation"');
    expect(gabarit).toContain('<ul class="citations"');
  });
});
