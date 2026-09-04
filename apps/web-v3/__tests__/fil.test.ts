/**
 * @jest-environment node
 */

import { GET, POST } from '@/app/chats/[cle]/route';
import { CHARGEUR_DE_PARTICIPATION, documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { entetesDeCreance, envoie, fil, languesDuLecteur, message, urlDePiece, type Fil, type Message } from '@/lib/api/fil';
import { EMOJIS_DE_LA_PALETTE, FIL as COPIE } from '@/lib/contenu/fil';

/**
 * **Le fil d'une conversation applique le PRISME, et il ne le réécrit pas.**
 *
 * La descente vit dans `resolvePrismTranslation` (`@meeshy/shared`) : ces
 * témoins ne gardent donc pas la RÈGLE — elle a les siens, chez elle — mais ce
 * que la v3 lui donne et ce qu'elle en fait. C'est là que les trois familles
 * divergentes du § Prisme sont nées : jamais dans la boucle, toujours dans ce
 * qui l'alimente et dans ce qui l'affiche.
 */

const brut = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'm1',
  content: 'Hello everyone',
  originalLanguage: 'en',
  createdAt: '2026-09-01T12:00:00.000Z',
  senderId: 'u2',
  sender: { id: 'u2', displayName: 'Marta Ruiz' },
  translations: [{ language: 'fr', content: 'Bonjour à tous' }],
  ...attributs,
});

const ORIGINE = 'https://gate.test';

const rendu = (m: Record<string, unknown>, langues: readonly string[], moi = 'u1'): Message => {
  const resultat = message(m, moi, langues, ORIGINE);
  if (resultat === null) throw new Error('message non lu');
  return resultat;
};

describe('le Prisme sur un message', () => {
  it('sert la traduction de la langue PRIMAIRE du lecteur', () => {
    const m = rendu(brut(), ['fr']);
    expect(m.texte).toBe('Bonjour à tous');
    expect(m.langueServie).toBe('fr');
    expect(m.langueOriginale).toBe('en');
    expect(m.texteOriginal).toBe('Hello everyone');
  });

  /**
   * LE TÉMOIN DE RANG — celui que le § Prisme désigne comme le seul capable
   * d'attraper la faute. Prisme `['fr','en']`, message ANGLAIS, traduction
   * française disponible : la règle juste rend « Bonjour », le court-circuit
   * « la langue d'origine est dans le prisme ⇒ afficher l'original » rendrait
   * « Hello ». Au rang 1 les deux verdicts coïncident ; il faut donc que la
   * langue d'origine occupe un rang INFÉRIEUR pour que le témoin morde.
   */
  it('ne rétrograde pas la langue primaire quand l’origine est au rang 2', () => {
    expect(rendu(brut(), ['fr', 'en']).texte).toBe('Bonjour à tous');
    expect(rendu(brut(), ['en', 'fr']).texte).toBe('Hello everyone');
  });

  it('sert l’ORIGINAL quand aucune traduction n’atteint le prisme', () => {
    const m = rendu(brut({ translations: [{ language: 'es', content: 'Hola' }] }), ['fr']);
    expect(m.texte).toBe('Hello everyone');
    expect(m.langueServie).toBeNull();
  });

  it('sert l’original quand le message EST déjà dans la langue du lecteur', () => {
    const m = rendu(brut({ originalLanguage: 'fr', content: 'Salut' }), ['fr']);
    expect(m.texte).toBe('Salut');
    expect(m.langueServie).toBeNull();
  });

  it('lit les deux formes de la carte du serveur', () => {
    const m = rendu(brut({ translations: [{ targetLanguage: 'fr', translatedContent: 'Coucou' }] }), ['fr']);
    expect(m.texte).toBe('Coucou');
  });

  it.each([
    ['vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère', { expiresAt: '2026-09-02T00:00:00.000Z' }],
  ])('ne sert NI le texte NI sa traduction d’un message %s', (_cas, protection) => {
    const m = rendu(brut(protection), ['fr']);
    expect(m.protege).toBe(true);
    expect(m.texte).not.toContain('Hello everyone');
    expect(m.texteOriginal).not.toContain('Hello everyone');
    expect(m.traductions).toEqual({});
    expect(m.langueServie).toBeNull();
  });

  /**
   * L'IDENTITÉ COMPARÉE est celle du lecteur : le `User.id` d'un membre, le
   * `Participant.id` d'un invité — la passerelle sert `senderId` sous la
   * première forme pour un inscrit et sous la seconde pour un anonyme
   * (`messages-list-query.ts:497`, `senderParticipantId` :499).
   */
  it('reconnaît ses propres messages, sous les deux identités', () => {
    expect(rendu(brut({ senderId: 'u1' }), ['fr']).deMoi).toBe(true);
    expect(rendu(brut({ senderId: 'u2', senderParticipantId: 'p9' }), ['fr'], 'p9').deMoi).toBe(true);
    expect(rendu(brut(), ['fr']).deMoi).toBe(false);
  });

  it('dit qu’un auteur est anonyme quand la passerelle le dit', () => {
    expect(rendu(brut({ sender: { id: 'p2', displayName: 'Tolu', type: 'anonymous' } }), ['fr']).anonyme).toBe(true);
    expect(rendu(brut(), ['fr']).anonyme).toBe(false);
  });

  it('lit l’accusé sur les compteurs servis, jamais sur la ligne', () => {
    expect(rendu(brut({ senderId: 'u1' }), ['fr']).accuse).toBe('envoye');
    expect(rendu(brut({ senderId: 'u1', deliveredCount: 1 }), ['fr']).accuse).toBe('recu');
    expect(rendu(brut({ senderId: 'u1', readByAllAt: '2026-09-01T12:01:00.000Z' }), ['fr']).accuse).toBe('lu');
  });

  it('agrège les réactions servies et ignore les comptes à zéro', () => {
    // La liste ne dit pas si la pastille est la MIENNE (#4177) : elle ne l'est pas tant qu'un événement ne l'a pas dit.
    expect(rendu(brut({ reactionSummary: { '👍': 2, '❤️': 0 } }), ['fr']).reactions).toEqual([{ emoji: '👍', nombre: 2, mienne: false }]);
  });

  /**
   * L'ADRESSE D'UNE PIÈCE se résout sur l'origine PUBLIQUE de la passerelle :
   * `fileUrl` arrive en chemin relatif (`UploadProcessor.getAttachmentPath`), et
   * posé tel quel dans un `href` il se résoudrait contre le document, où la
   * passerelle n'est pas — un lien inerte.
   */
  it('résout l’adresse d’une pièce jointe sur l’origine publique de la passerelle', () => {
    expect(urlDePiece('/api/v1/attachments/file/2026/a.png', ORIGINE)).toBe('https://gate.test/api/v1/attachments/file/2026/a.png');
    expect(urlDePiece('2026/a.png', 'https://gate.test/')).toBe('https://gate.test/api/v1/attachments/file/2026%2Fa.png');
    expect(urlDePiece('https://cdn.test/a.png', ORIGINE)).toBe('https://cdn.test/a.png');
    const m = rendu(brut({ attachments: [{ id: 'a1', fileUrl: '/api/v1/attachments/file/a.png', originalName: 'a.png', mimeType: 'image/png', fileSize: 12 }] }), ['fr']);
    expect(m.pieces[0]?.url).toBe('https://gate.test/api/v1/attachments/file/a.png');
  });

  /**
   * LA TRANSCRIPTION D'UN VOCAL DESCEND LE MÊME PRISME — depuis la carte que
   * `transcriptTranslationTexts` dépouille (`attachment-audio.ts:383`), et au
   * RANG du lecteur : au rang 2, l'original anglais ne gagne pas sur la
   * traduction française (leçon 261).
   */
  it('sert la transcription d’un vocal dans la langue du lecteur, avec son poids annoncé', () => {
    const m = rendu(
      brut({
        content: '',
        attachments: [
          {
            id: 'a1',
            fileUrl: 'https://gate.test/attachments/file/a1.m4a',
            originalName: 'vocal.m4a',
            mimeType: 'audio/mp4',
            fileSize: 48_000,
            duration: 12_000,
            transcription: { text: 'See you at three', language: 'en' },
            translations: { fr: { transcription: 'On se voit à quinze heures' } },
          },
        ],
      }),
      ['fr', 'en'],
    );
    expect(m.pieces).toHaveLength(1);
    expect(m.pieces[0]?.genre).toBe('audio');
    expect(m.pieces[0]?.octets).toBe(48_000);
    expect(m.pieces[0]?.transcription).toBe('On se voit à quinze heures');
    expect(m.pieces[0]?.langueServie).toBe('fr');
  });
});

describe('les langues du lecteur', () => {
  it('suit l’ordre du Prisme, sans le réécrire', () => {
    expect(languesDuLecteur({ systemLanguage: 'fr', regionalLanguage: 'en' })).toEqual(['fr', 'en']);
  });

  it('ne laisse jamais le prisme vide', () => {
    expect(languesDuLecteur({})).toEqual(['fr']);
  });
});

describe('la créance', () => {
  it('présente le jeton du membre en Bearer et la session de l’invité en X-Session-Token', () => {
    expect(entetesDeCreance({ genre: 'membre', jeton: 'JWT' })).toEqual({ authorization: 'Bearer JWT' });
    expect(entetesDeCreance({ genre: 'invite', jeton: 'S' })).toEqual({ 'x-session-token': 'S' });
  });
});

const FIL: Fil = {
  id: '68f2a81417a557e8ce4ddfbb',
  titre: 'Équipe Lagos',
  membres: 4,
  presence: { participants: ['u2'], presents: [] },
  messages: [
    rendu(brut(), ['fr']),
    rendu(brut({ id: 'm2', senderId: 'u1', content: 'Bien reçu', originalLanguage: 'fr', translations: [], createdAt: '2026-09-01T12:01:00.000Z' }), ['fr']),
  ],
  plusAncien: null,
};

const ETAT = (attributs: Partial<EtatDuFil> = {}): EtatDuFil => ({
  porte: { genre: 'membre', cle: '68f2a81417a557e8ce4ddfbb' },
  fil: FIL,
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

/** Une surface de PARTICIPATION : le module viendra, et c'est lui qui révèle ce que l'hôte rend ensuite. */
const TEMPS_REEL: EtatDuFil['tempsReel'] = {
  passerelle: 'https://gate.test',
  actifs: {
    participate: { nom: 'participate.abc.js', url: '/__v3/rt/participate.abc.js', corps: '' },
    liste: { nom: 'liste.abc.js', url: '/__v3/rt/liste.abc.js', corps: '' },
    feed: { nom: 'feed.abc.js', url: '/__v3/rt/feed.abc.js', corps: '' },
    notifs: { nom: 'notifs.f.js', url: '/__v3/rt/notifs.f.js', corps: '' },
    contacts: { nom: 'contacts.f.js', url: '/__v3/rt/contacts.f.js', corps: '' },
    recherche: { nom: 'recherche.f.js', url: '/__v3/rt/recherche.f.js', corps: '' },
    liens: { nom: 'liens.f.js', url: '/__v3/rt/liens.f.js', corps: '' },
    commentaires: { nom: 'commentaires.f.js', url: '/__v3/rt/commentaires.f.js', corps: '' },
    navigateur: { nom: 'navigateur.f.js', url: '/__v3/rt/navigateur.f.js', corps: '' },
    composer: { nom: 'composer.f.js', url: '/__v3/rt/composer.f.js', corps: '' },
    socket: { nom: 'socket.io.def.js', url: '/__v3/rt/socket.io.def.js', corps: '' },
  },
};

const PORTE_INVITEE = (attributs: Partial<Extract<EtatDuFil['porte'], { genre: 'invite' }>> = {}): EtatDuFil['porte'] => ({
  genre: 'invite',
  lien: 'mshy_lagos' as never,
  segment: 'lagos-q1',
  pseudo: 'Tolu',
  droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true },
  jonctionFraiche: false,
  ...attributs,
});

describe('le fil rendu', () => {
  const doc = documentDuFil(ETAT());

  it('affiche le texte SERVI, jamais l’original à côté — sauf replié', () => {
    expect(doc).toContain('Bonjour à tous');
    expect(doc).toContain('<details class="original">');
    expect(doc).toContain('<p lang="en">Hello everyone</p>');
  });

  it('signale la traduction sans la commenter, et seulement là où il y en a une', () => {
    // Hors du gabarit (qui porte la fente vide que le module remplit), une seule pastille.
    const lignesServies = doc.replace(/<template[\s\S]*?<\/template>/, '');
    expect(lignesServies.split('class="langue"').length - 1).toBe(1);
    expect(doc).toContain('<span class="code">en</span>');
  });

  /** `lang` part À CÔTÉ du texte servi : sur un nœud rendu dans une langue ≠ `<html lang>`. */
  it('pose lang= sur le texte traduit et sur l’original replié, jamais sur le texte déjà en français', () => {
    expect(doc).toContain('<p class="texte">Bonjour à tous</p>');
    expect(doc).toContain('<p class="texte">Bien reçu</p>');
    expect(doc).toContain('<p lang="en">Hello everyone</p>');
  });

  it('distingue mes messages de ceux des autres, sous le nom « Vous »', () => {
    expect(doc.split('class="ligne mien"').length - 1).toBe(1);
    expect(doc).toContain('<span class="nom">Vous</span>');
  });

  it('offre un vrai formulaire d’envoi, sans JavaScript, et un envoi de 56 px', () => {
    expect(doc).toContain('<form class="composeur" id="composeur" method="post" action="/chats/68f2a81417a557e8ce4ddfbb" enctype="multipart/form-data">');
    expect(doc).toContain('<button class="envoyer" type="submit" aria-label="Envoyer">');
    // DEUX scripts : le thème, et les règles de spéculation (#5104 — du JSON
    // déclaratif, aucun octet exécuté). Le chargeur, lui, n'y est pas.
    expect(doc.split('<script').length - 1).toBe(2);
    expect(doc).not.toContain('data-participation');
  });

  it('ne porte le chargeur de participation que sur une surface de participation', () => {
    const participant = documentDuFil(
      ETAT({
        tempsReel: {
          passerelle: 'https://gate.test',
          actifs: {
            participate: { nom: 'participate.abc.js', url: '/__v3/rt/participate.abc.js', corps: '' },
            liste: { nom: 'liste.abc.js', url: '/__v3/rt/liste.abc.js', corps: '' },
            feed: { nom: 'feed.abc.js', url: '/__v3/rt/feed.abc.js', corps: '' },
            notifs: { nom: 'notifs.f.js', url: '/__v3/rt/notifs.f.js', corps: '' },
            contacts: { nom: 'contacts.f.js', url: '/__v3/rt/contacts.f.js', corps: '' },
            recherche: { nom: 'recherche.f.js', url: '/__v3/rt/recherche.f.js', corps: '' },
            liens: { nom: 'liens.f.js', url: '/__v3/rt/liens.f.js', corps: '' },
            commentaires: { nom: 'commentaires.f.js', url: '/__v3/rt/commentaires.f.js', corps: '' },
            navigateur: { nom: 'navigateur.f.js', url: '/__v3/rt/navigateur.f.js', corps: '' },
            composer: { nom: 'composer.f.js', url: '/__v3/rt/composer.f.js', corps: '' },
            socket: { nom: 'socket.io.def.js', url: '/__v3/rt/socket.io.def.js', corps: '' },
          },
        },
      }),
    );
    expect(participant).toContain('data-participation="fil"');
    expect(participant).toContain('data-module="/__v3/rt/participate.abc.js"');
    expect(participant).toContain('data-socket="/__v3/rt/socket.io.def.js"');
    expect(participant).toContain('data-passerelle="https://gate.test"');
    expect(participant).toContain('data-porte="membre"');
    // Thème + chargeur + règles de spéculation (#5104).
    expect(participant.split('<script').length - 1).toBe(3);
    expect(participant).toContain('<script type="module">');
    expect(participant).not.toContain('socket.io.esm');
  });

  it('rend le gabarit que le module clone — la même ligne, vide', () => {
    expect(doc).toContain('<template id="gabarit-ligne">');
    expect(doc).toContain('<button type="button" class="action discrete reessayer">');
  });

  it('rend le gabarit du jour et la palette de réactions — les six emojis, et le bouton « Réagir » nulle part ailleurs', () => {
    expect(doc).toContain('<template id="gabarit-jour"><li class="jour" data-jour=""><time></time></li></template>');
    expect(doc).toContain('<template id="gabarit-palette">');
    expect(doc).toContain(`<dialog class="palette" aria-label="${COPIE.choisirUneReaction}">`);
    EMOJIS_DE_LA_PALETTE.forEach((emoji) => expect(doc).toContain(`<button type="submit" class="emoji" value="${emoji}">${emoji}</button>`));
    // Hors des gabarits, aucun contrôle inerte : « Réagir » n'existe qu'avec le module qui le fait agir.
    const horsGabarit = doc.replace(/<template[\s\S]*?<\/template>/g, '');
    expect(horsGabarit).not.toContain('class="reagir"');
  });

  /**
   * LA LISTE EST SERVIE DU PLUS RÉCENT AU PLUS ANCIEN : la feuille la retourne
   * (`column-reverse`), et le document arrive en bas de lui-même — sans un
   * script pour le faire sauter. Un séparateur de jour SUIT donc la première
   * ligne de son jour dans le DOM, exactement où le module le repose.
   */
  it('sert la liste du plus récent au plus ancien, les jours posés après la première ligne de leur jour', () => {
    const avantHier = rendu(brut({ id: 'm0', content: 'Yesterday', createdAt: '2026-08-31T12:00:00.000Z' }), ['fr']);
    const html = documentDuFil(ETAT({ fil: { ...FIL, messages: [avantHier, ...FIL.messages] } }));
    expect(html).toContain(`<ol class="lignes" id="lignes" aria-label="${COPIE.messagesOrdre}">`);
    const ordre = [...html.matchAll(/<li class="(?:ligne[^"]*|jour)"[^>]*?(?:data-id="([^"]+)"|data-jour="([^"]+)")/g)].map((m) => m[1] ?? `jour:${m[2]}`);
    expect(ordre).toEqual(['m2', 'm1', 'jour:2026-09-01', 'm0', 'jour:2026-08-31']);
    expect(html).toContain('<li class="jour" data-jour="2026-09-01"><time datetime="2026-09-01T12:00:00.000Z">');
  });

  /**
   * « N en ligne » est un compte SERVI (directive 2026-08-25 : la passerelle ne
   * sert la présence qu'aux amis acceptés) dans une FENTE que le module repeint
   * sur `user:status` — pour les seuls participants que le document a nommés.
   */
  it('dit qui est en ligne dans l’en-tête, dans une fente que le module repeint — et le tait à zéro', () => {
    const vivant = documentDuFil(ETAT({ tempsReel: TEMPS_REEL, fil: { ...FIL, presence: { participants: ['u2', 'p9'], presents: ['u2'] } } }));
    expect(vivant).toContain('<p class="sous">4 participants<span class="en-ligne" data-sep="1"> · 1 en ligne</span></p>');
    expect(vivant).toContain(' data-participants="u2,p9"');
    expect(vivant).toContain(' data-presents="u2"');
    expect(doc).toContain('<p class="sous">4 participants<span class="en-ligne" data-sep="1" hidden> · 0 en ligne</span></p>');
    // Sans module, aucune fente à repeindre : la liste des participants ne part pas.
    expect(documentDuFil(ETAT({ tempsReel: null }))).not.toContain('data-participants');
  });

  it('attend le PREMIER PIXEL — pas un rendu programmé — avant d’importer le module', () => {
    expect(CHARGEUR_DE_PARTICIPATION).toContain('first-contentful-paint');
    expect(CHARGEUR_DE_PARTICIPATION).toContain('PerformanceObserver');
    expect(CHARGEUR_DE_PARTICIPATION).not.toContain('requestAnimationFrame');
  });

  /** Une pastille servie est un CONTRÔLE : un formulaire vers la porte, sans JavaScript. */
  it('sert chaque pastille de réaction comme un formulaire vers la porte', () => {
    const html = documentDuFil(ETAT({ fil: { ...FIL, messages: [rendu(brut({ reactionSummary: { '👍': 2 } }), ['fr'])] } }));
    expect(html).toContain('<li data-emoji="👍"><form method="post" action="/chats/68f2a81417a557e8ce4ddfbb" class="reagir-par">');
    expect(html).toContain('<input type="hidden" name="reaction" value="👍"/>');
    expect(html).toContain('<input type="hidden" name="message" value="m1"/>');
    expect(html).toContain('<button type="submit" class="reaction" data-emoji="👍"><span class="emoji">👍</span> <span class="nombre">2</span></button>');
  });

  it('remplace une parole retirée par sa mention', () => {
    const html = documentDuFil(ETAT({ fil: { ...FIL, messages: [{ ...rendu(brut(), ['fr']), supprime: true }] } }));
    const horsGabarit = html.replace(/<template[\s\S]*?<\/template>/g, '');
    expect(horsGabarit).toContain('class="ligne supprime"');
    expect(horsGabarit).toContain(`<p class="texte">${COPIE.supprime}</p>`);
    expect(horsGabarit).not.toContain('Bonjour à tous');
    expect(horsGabarit).not.toContain('<details class="original">');
  });

  /** Le trombone n'existe que si la porte laisse joindre quelque chose (charte règle 7). */
  it('offre le trombone selon les droits — tout au membre, rien ou les images seules à l’invité', () => {
    expect(doc).toContain('<label class="joindre" for="champ-piece"');
    expect(doc).toContain('<input type="file" id="champ-piece" name="piece" class="hors-ecran"/>');
    expect(doc).toContain('<output class="piece-choisie" id="piece-choisie" for="champ-piece" hidden></output>');
    expect(doc).not.toContain('rows="1" required');

    const porte = (fichiers: boolean, images: boolean): EtatDuFil['porte'] =>
      PORTE_INVITEE({ droits: { canSendMessages: true, canSendFiles: fichiers, canSendImages: images, canViewHistory: true } });
    const sansRien = documentDuFil(ETAT({ porte: porte(false, false) }));
    expect(sansRien).not.toContain('champ-piece');
    expect(sansRien).not.toContain('enctype=');
    expect(sansRien).toContain('rows="1" required');

    const imagesSeules = documentDuFil(ETAT({ porte: porte(false, true) }));
    expect(imagesSeules).toContain('name="piece" class="hors-ecran" accept="image/*"/>');
    // Le libellé est un TEXTE dans le <label> — jamais un aria-label, prohibé sur un <label> (axe `aria-prohibited-attr`).
    expect(imagesSeules).toContain(`<span class="hors-ecran">${COPIE.joindreImage}</span></label>`);
    expect(imagesSeules).not.toContain('<label class="joindre" for="champ-piece" aria-label');
  });

  /**
   * Un droit RENDU par l'hôte arrive en direct (`participant:rights-updated`) :
   * le module ne fabrique aucune balise, il RÉVÈLE. Là où un module viendra, le
   * trombone que la porte n'admet pas encore est donc servi CACHÉ — champ
   * désactivé, rien à soumettre —, avec l'`enctype` que sa révélation exigera ;
   * sur une lecture pure, il n'existe pas.
   */
  it('sert le trombone caché à l’invité sans droit de pièce quand un module viendra le révéler — jamais sur une lecture pure', () => {
    const porte = PORTE_INVITEE({ droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true } });
    const participation = documentDuFil(ETAT({ porte, tempsReel: TEMPS_REEL }));
    expect(participation).toContain('<label class="joindre" for="champ-piece" hidden');
    // Caché ET désactivé : un champ hors écran sans libellé visible serait un contrôle sans nom (axe `label`, serious — mesuré).
    expect(participation).toContain('<input type="file" id="champ-piece" name="piece" class="hors-ecran" disabled hidden/>');
    expect(participation).toContain('enctype="multipart/form-data"');
    expect(participation).toContain('rows="1" required');
    expect(documentDuFil(ETAT({ porte }))).not.toContain('champ-piece');
  });

  it('propose la page plus ancienne par un lien, quand il en reste une', () => {
    const avec = documentDuFil(ETAT({ fil: { ...FIL, plusAncien: 'm0' } }));
    expect(avec).toContain('href="/chats/68f2a81417a557e8ce4ddfbb?avant=m0"');
    expect(doc).not.toContain('?avant=');
  });

  it('ferme le composeur avec sa raison, sans un champ, quand c’est le LIEN qui ferme — rien ne le rouvrira', () => {
    const ferme = documentDuFil(ETAT({ composeur: { genre: 'ferme', raison: 'Ce lien a expiré.', cause: 'lien' }, tempsReel: TEMPS_REEL }));
    expect(ferme).toContain('class="composeur ferme"');
    expect(ferme).toContain('Ce lien a expiré.');
    expect(ferme).not.toContain('<textarea');
  });

  /**
   * Un DROIT retiré se rend : l'hôte peut le redonner sans que le lecteur
   * recharge (`participant:rights-updated`). Le document sert donc le
   * formulaire CACHÉ à côté de la raison — le symétrique exact de la raison
   * cachée qu'il sert déjà à côté d'un composeur ouvert — pour que le module
   * n'ait qu'à RÉVÉLER. Mesuré avant : le bandeau disait « Écrire et répondre »
   * pendant que le bas de l'écran disait « L'hôte n'autorise pas… ».
   */
  it('sert le formulaire CACHÉ derrière une fermeture par DROIT quand un module peut le rouvrir — et rien sur une lecture pure', () => {
    const porte = PORTE_INVITEE({ droits: { canSendMessages: false, canSendFiles: true, canSendImages: true, canViewHistory: true } });
    const raison = 'L’hôte n’autorise pas les invités à écrire ici.';
    const rouvrable = documentDuFil(ETAT({ porte, composeur: { genre: 'ferme', raison, cause: 'droit' }, tempsReel: TEMPS_REEL }));
    expect(rouvrable).toContain('<form class="composeur" id="composeur" method="post" action="/chat/lagos-q1" enctype="multipart/form-data" hidden>');
    expect(rouvrable).toContain(`<p class="composeur ferme" id="composeur-ferme">`);
    expect(rouvrable).toContain(raison);
    expect(rouvrable).toContain('<label class="joindre" for="champ-piece"');
    expect(rouvrable.split('id="composeur-ferme"').length - 1).toBe(1);

    const lecturePure = documentDuFil(ETAT({ porte, composeur: { genre: 'ferme', raison, cause: 'droit' } }));
    expect(lecturePure).not.toContain('<textarea');
    expect(lecturePure).toContain(raison);
  });

  /**
   * ÉTAT G AU RECHARGEMENT : un battement 410 ne relit aucun droit, et la
   * reconnaissance de la place ne nomme pas toujours son occupant. Ce qui n'a
   * pas été servi ne se rend pas — ni un verdict, ni un pseudo vide dans une
   * phrase de bienvenue. Mesuré avant : « Entré comme  · anonyme », « Bienvenue
   * — vous êtes entré en anonyme », et quatre droits REFUSÉS que rien n'avait relus.
   */
  it('ne rend aucun verdict quand aucun n’a été servi, et nomme l’anonyme sans pseudo plutôt qu’avec un nom vide', () => {
    const sansDroits = documentDuFil(ETAT({ porte: PORTE_INVITEE({ droits: null }), composeur: { genre: 'ferme', raison: 'Ce lien a été fermé par son auteur.', cause: 'lien' } }));
    expect(sansDroits).not.toContain('data-droit=');
    expect(sansDroits).not.toContain('class="bandeau bien"');
    expect(sansDroits).toContain('Entré comme Tolu · anonyme');

    const sansPseudo = documentDuFil(ETAT({ porte: PORTE_INVITEE({ droits: null, pseudo: null }), composeur: { genre: 'ferme', raison: 'Ce lien a été fermé par son auteur.', cause: 'lien' } }));
    expect(sansPseudo).toContain(`<p class="sous">${COPIE.entreEnAnonyme}</p>`);
    expect(sansPseudo).not.toContain('Entré comme');
    expect(sansPseudo).not.toContain('Bienvenue');
  });

  it('dessine l’état vide', () => {
    const vide = documentDuFil(ETAT({ fil: { ...FIL, messages: [] } }));
    expect(vide).toContain('carte-vide');
    expect(vide).toContain('Aucun message dans cette conversation');
  });

  it('échappe ce qui vient du réseau', () => {
    const injecte = documentDuFil(
      ETAT({
        fil: {
          ...FIL,
          titre: '</h1><img src=x onerror=alert(1)>',
          messages: [rendu(brut({ translations: [], originalLanguage: 'fr', content: '</span><script>alert(2)</script>' }), ['fr'])],
        },
      }),
    );
    const corps = injecte.slice(injecte.indexOf('<body>'));

    expect(corps).not.toContain('<img src=x');
    expect(corps).not.toContain('<script>alert(2)');
    expect(corps).toContain('&lt;img src=x');
  });
});

describe('la porte de l’invité, dans la même vue', () => {
  const invite = documentDuFil(
    ETAT({
      porte: {
        genre: 'invite',
        lien: 'mshy_lagos' as never,
        segment: 'lagos-q1',
        pseudo: 'Tolu',
        droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true },
        jonctionFraiche: true,
      },
      lecteur: { id: 'p1', nom: 'Tolu', langues: ['fr'] },
    }),
  );

  it('annonce les droits RELUS dans un bandeau ouvert juste après la jonction', () => {
    expect(invite).toContain('<details class="bandeau bien" open>');
    expect(invite).toContain('Bienvenue Tolu — vous êtes entré en anonyme');
    expect(invite).toContain('Historique de la conversation');
    expect(invite).toContain('Écrire et répondre');
    expect(invite).toContain('Pas de photo ni de fichier');
  });

  it('poste vers SA porte, et se présente comme anonyme', () => {
    expect(invite).toContain('action="/chat/lagos-q1"');
    expect(invite).toContain('Entré comme Tolu · anonyme');
  });

  /** La passerelle ne pousse aucune présence à un invité (`presence-audience.ts` : amis acceptés et administrateurs) : rien à repeindre, rien à lui confier. */
  it('ne reçoit ni la liste des participants ni un compte en ligne — la passerelle ne lui pousse aucune présence', () => {
    expect(invite).not.toContain('data-participants');
    expect(invite).not.toContain('class="en-ligne"');
  });

  it('replie le bandeau à tout chargement suivant', () => {
    const suivant = documentDuFil(
      ETAT({
        porte: {
          genre: 'invite',
          lien: 'mshy_lagos' as never,
          segment: 'lagos-q1',
          pseudo: 'Tolu',
          droits: { canSendMessages: true, canSendFiles: true, canSendImages: true, canViewHistory: false },
          jonctionFraiche: false,
        },
      }),
    );
    expect(suivant).toContain('<details class="bandeau bien">');
    expect(suivant).toContain('Historique masqué');
  });
});

describe('ce que la passerelle refuse', () => {
  const REPONSE = (statut: number) => async () => new Response('{}', { status: statut });

  const issue = (statut: number) =>
    fil({ cle: 'c', creance: { genre: 'membre', jeton: 'j' }, moi: null, langues: ['fr'], base: 'https://gate.test', recuperer: REPONSE(statut) });

  it('renvoie se connecter sur un 401, et sur lui SEUL', async () => {
    expect((await issue(401)).genre).toBe('session-expiree');
  });

  it.each([403, 404])('rend « introuvable » sur un %s, jamais la connexion', async (statut) => {
    expect((await issue(statut)).genre).toBe('introuvable');
  });

  it('ne distingue pas, pour le lecteur, le fil absent du fil interdit', async () => {
    expect(await issue(403)).toEqual(await issue(404));
  });

  it('dit la panne quand la passerelle se tait', async () => {
    const muette = fil({
      cle: 'c',
      creance: { genre: 'membre', jeton: 'j' },
      moi: null,
      langues: ['fr'],
      base: 'https://gate.test',
      recuperer: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect((await muette).genre).toBe('panne');
  });

  /** Le curseur `before` de `GET /conversations/:id/messages` — et `hasMore` qui dit s'il en reste. */
  it('demande la page plus ancienne avec `before`, et rend le curseur suivant', async () => {
    const urls: string[] = [];
    const lu = await fil({
      cle: 'c',
      creance: { genre: 'invite', jeton: 'S' },
      moi: null,
      langues: ['fr'],
      avant: 'm40',
      base: 'https://gate.test',
      recuperer: async (url, options) => {
        urls.push(url);
        expect((options.headers as Record<string, string>)['x-session-token']).toBe('S');
        return new Response(
          JSON.stringify(
            url.includes('/messages')
              ? { success: true, data: [brut()], cursorPagination: { hasMore: true, nextCursor: 'm1' } }
              : { success: true, data: { id: 'c', title: 'T', memberCount: 2, participants: [{ userId: 'u2', isOnline: true }, { id: 'p9', isOnline: false }] } },
          ),
        );
      },
    });
    expect(urls.some((url) => url.endsWith('/messages?limit=40&before=m40'))).toBe(true);
    expect(lu.genre).toBe('fil');
    if (lu.genre === 'fil') {
      expect(lu.fil.plusAncien).toBe('m1');
      // Les clés de présence sont celles que `user:status` nomme : `userId` d'un inscrit, `Participant.id` d'un anonyme (`core-detail.ts:232`).
      expect(lu.fil.presence).toEqual({ participants: ['u2', 'p9'], presents: ['u2'] });
      expect(lu.fil.id).toBe('c');
    }
  });

  /**
   * LA TRANCHE NOMMÉE PAR UN MESSAGE (`around=`, `routes/conversations/
   * messages-list.ts:400-450`) — ce que porte le lien d'un média et le retour de
   * sa surimpression. Sans elle, `?media=` d'un message plus ancien que la
   * tranche par défaut re-servait les quarante derniers messages, où la pièce
   * n'est pas : le tap n'ouvrait RIEN.
   */
  it('demande la tranche AUTOUR d’un message avec `around`', async () => {
    const urls: string[] = [];
    await fil({
      cle: 'c',
      creance: { genre: 'membre', jeton: 'j' },
      moi: null,
      langues: ['fr'],
      autour: 'vieux-message',
      base: 'https://gate.test',
      recuperer: async (url) => {
        urls.push(url);
        return new Response(JSON.stringify({ success: true, data: [], cursorPagination: { hasMore: false, nextCursor: null } }));
      },
    });
    expect(urls.some((url) => url.endsWith('/messages?limit=40&around=vieux-message'))).toBe(true);
  });

  /**
   * `before` L'EMPORTE CHEZ LA PASSERELLE (`around && !before`) : la porte n'en
   * demande donc jamais deux — une tranche se nomme d'UNE façon, sinon le
   * paramètre servi n'est pas celui qu'on croit avoir demandé.
   */
  it('ne demande jamais `around` et `before` ensemble', async () => {
    const urls: string[] = [];
    await fil({
      cle: 'c',
      creance: { genre: 'membre', jeton: 'j' },
      moi: null,
      langues: ['fr'],
      avant: 'm40',
      autour: 'vieux-message',
      base: 'https://gate.test',
      recuperer: async (url) => {
        urls.push(url);
        return new Response(JSON.stringify({ success: true, data: [], cursorPagination: { hasMore: false, nextCursor: null } }));
      },
    });
    const liste = urls.find((url) => url.includes('/messages'));
    expect(liste).toContain('before=m40');
    expect(liste).not.toContain('around=');
  });

  /**
   * `messages-list.ts:270-278` — la liste ferme la lecture AU NOM DU LIEN du
   * participant : 403 `SHARE_LINK_EXPIRED`, 403 `SHARE_LINK_MAX_USES` (le
   * dernier admis compris). Le jeton vaut, la place existe : ce n'est ni une
   * session expirée ni un fil introuvable — c'est l'état G, avec son code.
   */
  it.each(['SHARE_LINK_EXPIRED', 'SHARE_LINK_MAX_USES'])('nomme un 403 %s de la liste comme un lien clos, jamais comme un fil introuvable', async (code) => {
    const lu = await fil({
      cle: 'c',
      creance: { genre: 'invite', jeton: 'S' },
      moi: 'p1',
      langues: ['fr'],
      base: ORIGINE,
      recuperer: async (url) =>
        new Response(
          JSON.stringify(
            url.includes('/messages')
              ? { success: false, error: 'This share link is closed', message: 'This share link is closed', code }
              : { success: true, data: { id: 'c', title: 'T', memberCount: 2, participants: [] } },
          ),
          { status: url.includes('/messages') ? 403 : 200 },
        ),
    });
    expect(lu).toEqual({ genre: 'lien-clos', code });
  });

  it('garde « introuvable » pour un 403 qui ne parle pas du lien', async () => {
    const lu = await fil({
      cle: 'c',
      creance: { genre: 'membre', jeton: 'J' },
      moi: 'u1',
      langues: ['fr'],
      base: ORIGINE,
      recuperer: async () => new Response(JSON.stringify({ success: false, error: 'Access denied: you are not a member of this conversation' }), { status: 403 }),
    });
    expect(lu).toEqual({ genre: 'introuvable' });
  });
});

describe('l’envoi d’un message', () => {
  const contexte = { params: Promise.resolve({ cle: 'c1' }) };

  const poste = (corps: Record<string, string>, cookie = 'meeshy_auth=JWT') =>
    new Request('https://meeshy.me/chats/c1', {
      method: 'POST',
      body: new URLSearchParams(corps),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    });

  it('renvoie se connecter quand aucun jeton n’accompagne l’envoi', async () => {
    const reponse = await POST(poste({ texte: 'salut' }, 'autre=1'), contexte);
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fchats%2Fc1');
  });

  /** `app/provenance.ts` — un formulaire venu d'un autre site est refusé AVANT tout appel, jeton ou pas. */
  it('refuse 403 un envoi venu d’un autre site, sans toucher à la passerelle', async () => {
    const original = globalThis.fetch;
    const appels: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      appels.push(String(url));
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    try {
      const reponse = await POST(
        new Request('https://meeshy.me/chats/c1', {
          method: 'POST',
          body: new URLSearchParams({ texte: 'salut' }),
          headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: 'meeshy_auth=JWT', 'sec-fetch-site': 'cross-site' },
        }),
        contexte,
      );
      expect(reponse.status).toBe(403);
      expect(appels).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });

  /** Un préchargement marquerait LU un fil que personne n'a ouvert : 503 sans corps, aucun appel. */
  it('ne lit rien — et n’accuse rien — sur un chargement spéculatif du fil', async () => {
    const original = globalThis.fetch;
    const appels: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      appels.push(String(url));
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    try {
      const reponse = await GET(new Request('https://meeshy.me/chats/c1', { headers: { cookie: 'meeshy_auth=JWT', 'sec-purpose': 'prefetch;prerender' } }), contexte);
      expect(reponse.status).toBe(503);
      expect(appels).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('renvoie se connecter quand le GET n’a pas de jeton non plus', async () => {
    const reponse = await GET(new Request('https://meeshy.me/chats/c1'), contexte);
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fchats%2Fc1');
  });

  it('porte la clé d’idempotence et la langue quand on les lui donne', async () => {
    let corps: Record<string, unknown> = {};
    await envoie({
      cle: 'c1',
      creance: { genre: 'membre', jeton: 'J' },
      texte: 'salut',
      clientMessageId: 'cid_00000000-0000-4000-8000-000000000000',
      langue: 'fr',
      base: 'https://gate.test',
      recuperer: async (_url, options) => {
        corps = JSON.parse(String(options.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ success: true, data: { id: 'm9' } }));
      },
    });
    expect(corps).toEqual({ content: 'salut', clientMessageId: 'cid_00000000-0000-4000-8000-000000000000', originalLanguage: 'fr' });
  });
});
