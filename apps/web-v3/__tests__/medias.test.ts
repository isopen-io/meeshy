/**
 * @jest-environment node
 */

import { documentDesMedias, type EtatDesMedias } from '@/app/connecte/medias-vue';
import { message, type Fil, type Message } from '@/lib/api/fil';
import { galerie, genreDemande } from '@/lib/api/medias';

/**
 * **LES MÉDIAS D'UNE CONVERSATION** (issue #4525, `cible/media.png`) — ils se
 * parcourent, ils s'ouvrent, et **leur poids est annoncé avant qu'un octet ne
 * parte**.
 *
 * La galerie est une PROJECTION du fil, jamais une seconde lecture : les mêmes
 * messages, lus par le même module (`lib/api/fil.ts`), descendus par le même
 * Prisme (`resolvePrismTranslation`). C'est ce qui lui donne, gratuitement, les
 * trois choses qu'aucune autre source ne porte :
 *
 *   • la PROTECTION AU NIVEAU MESSAGE — un message à vue unique / flouté /
 *     éphémère n'a aucune pièce (`message()` : `pieces: protege || supprime
 *     ? [] : …`). La liste dédiée de la passerelle, `GET
 *     /conversations/:id/attachments`, ne sert que SEPT clés
 *     (`messageAttachmentMinimalSchema`, gelé par
 *     `conversation-attachments-served-keys.test.ts`) et AUCUN des trois
 *     drapeaux : une galerie bâtie sur elle rendrait l'URL entière d'une photo
 *     à vue unique — le défaut du cycle 125, rejoué sur un écran neuf.
 *     **Au niveau PIÈCE**, en revanche, aucune garantie : la route que la
 *     galerie lit RÉELLEMENT (`GET /conversations/:id/messages`,
 *     `attachmentMediaSelect`) ne sert pas non plus `isViewOnce` /
 *     `isBlurred` / `effectFlags` de `MessageAttachment` — ils ne vivent
 *     que dans `attachmentFullSelect`, réservé au message CITÉ. Aucune
 *     fuite n'est prouvée, mais la garde HÉRITÉE ci-dessus ne couvre que
 *     le message, jamais la pièce. Issue compagnon gateway : #5125,
 *     détaillée dans `lib/api/medias.ts:20-38` ;
 *   • la TRANSCRIPTION d'un vocal, servie au Prisme du lecteur — la liste
 *     dédiée la CHARGE et ne la sert pas (le doc-comment de
 *     `routes/attachments/metadata.ts:214-240` le dit mot pour mot) ;
 *   • le POIDS et la DURÉE, annoncés avant tout téléchargement.
 *
 * Le témoin du Prisme est écrit sur un rang AUTRE que le premier (leçon 261) :
 * au rang 1, le court-circuit interdit et la règle juste rendent le même
 * verdict.
 */

const ORIGINE = 'https://gate.test';

const brut = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'm1',
  content: '',
  originalLanguage: 'fr',
  createdAt: '2026-09-01T12:00:00.000Z',
  senderId: 'u2',
  sender: { id: 'p2', displayName: 'Ibrahim' },
  ...attributs,
});

const PIECE = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'a1',
  fileUrl: '/api/v1/attachments/file/2026/tableau.jpg',
  originalName: 'tableau.jpg',
  mimeType: 'image/jpeg',
  fileSize: 430_080,
  ...attributs,
});

const lu = (m: Record<string, unknown>, langues: readonly string[] = ['fr']): Message => {
  const resultat = message(m, 'u1', langues, ORIGINE);
  if (resultat === null) throw new Error('message non lu');
  return resultat;
};

const filDe = (messages: readonly Message[], plusAncien: string | null = null): Fil => ({
  id: 'c1',
  titre: 'Équipe Lagos',
  membres: 12,
  presence: { participants: [], presents: [] },
  messages,
  plusAncien,
});

const IMAGE = lu(brut({ id: 'r1', attachments: [PIECE()] }));

const VIDEO = lu(
  brut({
    id: 'r2',
    createdAt: '2026-09-01T12:01:00.000Z',
    attachments: [
      PIECE({
        id: 'a2',
        fileUrl: '/api/v1/attachments/file/2026/revue.mp4',
        originalName: 'revue.mp4',
        mimeType: 'video/mp4',
        fileSize: 3_100_000,
        duration: 42_000,
      }),
    ],
  }),
);

const VOCAL_BRUT = (attributs: Record<string, unknown> = {}): Record<string, unknown> =>
  brut({
    id: 'r3',
    createdAt: '2026-09-01T12:02:00.000Z',
    attachments: [
      PIECE({
        id: 'a3',
        fileUrl: '/api/v1/attachments/file/2026/vocal.m4a',
        originalName: 'vocal.m4a',
        mimeType: 'audio/mp4',
        fileSize: 96_000,
        duration: 21_000,
        transcription: { text: 'Mo n mú àwọn nọ́mbà oṣù Kẹta.', language: 'yo' },
        translations: {
          es: { transcription: 'Traigo las cifras de marzo.' },
          fr: { transcription: 'J’apporte les chiffres de mars.' },
        },
        ...attributs,
      }),
    ],
  });

const FICHIER = lu(
  brut({
    id: 'r4',
    createdAt: '2026-09-01T12:03:00.000Z',
    attachments: [
      PIECE({
        id: 'a4',
        fileUrl: '2026/12/a4/budget.pdf',
        originalName: 'budget.pdf',
        mimeType: 'application/pdf',
        fileSize: 1_200_000,
      }),
    ],
  }),
);

const etat = (attributs: Partial<EtatDesMedias> = {}): EtatDesMedias => ({
  cle: 'c1',
  titre: 'Équipe Lagos',
  galerie: galerie({ messages: [IMAGE, VIDEO, lu(VOCAL_BRUT()), FICHIER], genre: null }),
  plusAncien: null,
  fil: filDe([IMAGE, VIDEO, lu(VOCAL_BRUT()), FICHIER]),
  plein: null,
  ...attributs,
});

describe('la galerie est une projection du fil, du plus récent au plus ancien', () => {
  it('rend une entrée par pièce, la plus récente en tête', () => {
    const vue = galerie({ messages: filDe([IMAGE, VIDEO, lu(VOCAL_BRUT()), FICHIER]).messages, genre: null });
    expect(vue.medias.map((media) => media.piece.id)).toEqual(['a4', 'a3', 'a2', 'a1']);
    expect(vue.total).toBe(4);
  });

  /**
   * LA PROTECTION EST HÉRITÉE, PAS RÉÉCRITE. Un message à vue unique, flouté ou
   * éphémère n'a aucune pièce à projeter : la galerie ne peut donc pas la
   * rendre, quoi qu'elle fasse — c'est la seule forme de garde qui ne se
   * contourne pas par oubli (cycles 124 et 125).
   */
  it('ne projette AUCUNE pièce d’un message protégé ou supprimé', () => {
    const protege = lu(brut({ id: 'p1', isViewOnce: true, attachments: [PIECE({ id: 'secret' })] }));
    const supprime = lu(brut({ id: 'p2', deletedAt: '2026-09-01T12:05:00.000Z', attachments: [PIECE({ id: 'parti' })] }));
    const vue = galerie({ messages: [protege, supprime, IMAGE], genre: null });

    expect(vue.medias.map((media) => media.piece.id)).toEqual(['a1']);
    expect(documentDesMedias(etat({ galerie: vue }))).not.toContain('secret');
  });

  it('compte chaque genre, pour que les puces disent ce qu’elles ouvrent', () => {
    const vue = galerie({ messages: [IMAGE, VIDEO, lu(VOCAL_BRUT()), FICHIER], genre: null });
    expect(vue.comptes).toEqual({ image: 1, video: 1, audio: 1, fichier: 1 });
  });
});

describe('le genre demandé filtre ce qui est servi — une puce a un EFFET', () => {
  it('ne lit qu’un genre de la table, et rien d’autre', () => {
    expect(genreDemande('image')).toBe('image');
    expect(genreDemande('audio')).toBe('audio');
    expect(genreDemande('AUDIO')).toBeNull();
    expect(genreDemande('story')).toBeNull();
    expect(genreDemande(null)).toBeNull();
  });

  it('ne sert que le genre demandé, en gardant le compte de TOUS les genres', () => {
    const vue = galerie({ messages: [IMAGE, VIDEO, lu(VOCAL_BRUT()), FICHIER], genre: 'image' });
    expect(vue.medias.map((media) => media.piece.id)).toEqual(['a1']);
    expect(vue.genre).toBe('image');
    expect(vue.total).toBe(1);
    expect(vue.comptes.video).toBe(1);
  });
});

describe('le poids est annoncé AVANT qu’un octet ne parte', () => {
  const document = (): string => documentDesMedias(etat());

  it('annonce le poids de chaque pièce, et la durée de ce qui se lit', () => {
    const rendu = document();
    expect(rendu).toContain('420 Ko');
    expect(rendu).toContain('0:42 · 3,0 Mo');
    expect(rendu).toContain('0:21 · 94 Ko');
    expect(rendu).toContain('1,1 Mo');
  });

  /**
   * ZÉRO OCTET DE MÉDIA À L'OUVERTURE DE LA GRILLE. Aucune `<img>`, aucune
   * `<video>` : une vignette qui se télécharge est le contraire de la mission
   * (« très faible consommation de données »). Le seul média du document est
   * l'`<audio>` du lecteur, replié dans un `<details>` et en `preload="none"` —
   * zéro octet avant la pression, et la commande accessible que le navigateur
   * donne gratuitement.
   */
  it('ne pose ni image ni vidéo, et ne précharge rien', () => {
    const rendu = document();
    expect(rendu).not.toContain('<img');
    expect(rendu).not.toContain('<video');
    expect(rendu.match(/<audio/g)).toHaveLength(1);
    expect(rendu).toContain('preload="none"');
  });

  /**
   * CE QUE LE TAP OUVRE VIENT DE LA MÊME TABLE QUE LE FIL
   * (`FORME_PAR_GENRE.ouvre`, `lib/api/formes.ts`) : une image ou une vidéo
   * touchée ici ouvre le MÊME plein écran que le fil (`?autour=&media=`),
   * SANS quitter la galerie et SANS onglet — jamais l'URL du fichier brut.
   * Régression du défaut majeur #5024 (2) : les deux gestes avaient deux
   * noms accessibles (« Ouvrir… » / « Télécharger… ») pour un même objet.
   */
  it('ouvre chaque image ou vidéo dans le plein écran de la galerie, jamais un onglet', () => {
    const rendu = document();
    expect(rendu).toContain('href="/chats/c1/medias?autour=r1&amp;media=a1"');
    expect(rendu).toContain('href="/chats/c1/medias?autour=r2&amp;media=a2"');
    expect(rendu).toContain('Ouvrir tableau.jpg · 420 Ko');
    expect(rendu).toContain('Ouvrir revue.mp4 · 0:42 · 3,0 Mo');
    // La tuile d'une image ne porte PAS `target="_blank"` : c'est le geste du fichier, pas le sien.
    const tuileImage = [...rendu.matchAll(/<a class="tuile" href="[^"]*media=a1[^"]*"[^>]*>/g)].map(([m]) => m);
    expect(tuileImage).toHaveLength(1);
    expect(tuileImage[0]).not.toContain('target="_blank"');
  });

  /**
   * `fileUrl` SERVI TEL QUEL, résolu sur l'origine PUBLIQUE de la passerelle et
   * jamais reconstruit (§ 5.1 « médias distants ») : une signature `?exp=&sig=`
   * viendra un jour dans cette même valeur. `urlDePiece` est le site unique de
   * cette résolution, et la galerie le tient de `lib/api/fil.ts`. Un PDF
   * n'a pas de plein écran (`ouvre === 'fichier'`, § 12.10.1) : LUI SEUL
   * quitte la galerie, dans un onglet, avec le geste nommé.
   */
  it('ouvre un FICHIER (sans plein écran) dans un onglet, sur le fichier servi', () => {
    const rendu = document();
    expect(rendu).toContain(`href="${ORIGINE}/api/v1/attachments/file/2026%2F12%2Fa4%2Fbudget.pdf"`);
    expect(rendu).toContain('target="_blank" rel="noopener"');
    expect(rendu).toContain('Télécharger budget.pdf · 1,1 Mo');
  });

  it('n’offre aucun contrôle inerte : chaque lien a une destination', () => {
    const liens = [...document().matchAll(/<a\b[^>]*>/g)].map(([balise]) => balise);
    expect(liens.length).toBeGreaterThan(0);
    liens.forEach((balise) => expect(balise).toMatch(/href="[^"]+"/));
  });
});

/**
 * LE PRISME, SUR UN RANG AUTRE QUE LE PREMIER (leçon 261). Le lecteur demande
 * l'espagnol puis le français ; la transcription a été faite en yoruba et
 * existe dans les deux. La règle juste sert l'ESPAGNOL — un court-circuit « la
 * langue d'origine appartient au prisme ⇒ l'original » rendrait le yoruba, et
 * une descente qui s'arrêterait au rang 1 rendrait le français.
 */
describe('un vocal rend sa transcription au Prisme, avec sa langue déclarée', () => {
  it('sert le rang le plus haut disponible et pose lang= dessus', () => {
    const rendu = documentDesMedias(
      etat({ galerie: galerie({ messages: [lu(VOCAL_BRUT(), ['es', 'fr'])], genre: null }) }),
    );
    expect(rendu).toContain('lang="es"');
    expect(rendu).toContain('Traigo las cifras de marzo.');
    expect(rendu).not.toContain('J’apporte les chiffres de mars.');
    expect(rendu).toContain('Transcrit du yo · lire en es');
  });

  it('sert l’original, dans SA langue, quand aucune traduction ne convient', () => {
    const rendu = documentDesMedias(
      etat({
        galerie: galerie({
          messages: [lu(VOCAL_BRUT({ translations: { de: { transcription: 'Ich bringe die Zahlen.' } } }), ['fr'])],
          genre: null,
        }),
      }),
    );
    expect(rendu).toContain('lang="yo"');
    expect(rendu).toContain('Mo n mú àwọn nọ́mbà oṣù Kẹta.');
    expect(rendu).not.toContain('Transcrit du');
  });

  /**
   * LA PISTE SUIT LE TEXTE SERVI (cycle 128) : on ENTEND ce qu'on LIT. La
   * galerie ne descend pas un second prisme pour le son — elle sert la piste
   * que `lib/api/fil.ts` a déjà élue.
   */
  it('joue la piste de la langue servie, jamais l’originale', () => {
    const rendu = documentDesMedias(
      etat({
        galerie: galerie({
          messages: [
            lu(
              VOCAL_BRUT({
                translations: { fr: { transcription: 'J’apporte les chiffres de mars.', url: '/api/v1/attachments/file/2026/vocal-fr.m4a' } },
              }),
              ['fr'],
            ),
          ],
          genre: null,
        }),
      }),
    );
    expect(rendu).toContain(`src="${ORIGINE}/api/v1/attachments/file/2026/vocal-fr.m4a"`);
  });
});

describe('l’écran DIT ce qu’il sert, et dessine ce qu’il n’a pas', () => {
  it('porte le titre de la conversation et le nombre d’éléments servis', () => {
    const rendu = documentDesMedias(etat());
    expect(rendu).toContain('Médias partagés');
    expect(rendu).toContain('Équipe Lagos · 4 éléments');
  });

  it('ramène à la conversation par une cible nommée', () => {
    expect(documentDesMedias(etat())).toContain('href="/chats/c1"');
  });

  it('dessine l’état vide plutôt qu’une grille blanche', () => {
    const rendu = documentDesMedias(etat({ galerie: galerie({ messages: [], genre: null }) }));
    expect(rendu).toContain('carte-vide');
    expect(rendu).toContain('Aucun média partagé');
  });

  it('dessine l’état vide DU FILTRE, en nommant le filtre', () => {
    const rendu = documentDesMedias(etat({ galerie: galerie({ messages: [IMAGE], genre: 'audio' }) }));
    expect(rendu).toContain('carte-vide');
    expect(rendu).toContain('Aucun média dans « Audio »');
  });

  /**
   * DÉFAUT MAJEUR CORRIGÉ — L'ÉTAT VIDE MENTAIT QUAND UNE PAGE PLUS ANCIENNE
   * EXISTE : la galerie ne voit que la fenêtre servie (50 messages) ; « Aucun
   * média partagé » n'est vrai QUE si `plusAncien === null`. Toute
   * conversation active de plus de 50 messages sans média dans les 50
   * derniers rendait ce mensonge — le cas NOMINAL, pas un bord.
   */
  it('dit la vérité (la PROFONDEUR) quand la fenêtre est vide mais qu’une page plus ancienne existe', () => {
    const rendu = documentDesMedias(
      etat({ galerie: galerie({ messages: [], genre: null }), plusAncien: 'm42' }),
    );
    expect(rendu).toContain('carte-vide');
    expect(rendu).not.toContain('Aucun média partagé');
    expect(rendu).toContain('Aucun média dans cette tranche');
  });

  /** Le même mensonge, sous filtre : « essayez un autre type » quand la vraie raison est la profondeur. */
  it('dit la vérité (la PROFONDEUR) sous filtre aussi, plutôt que de blâmer le type', () => {
    const rendu = documentDesMedias(
      etat({ galerie: galerie({ messages: [], genre: 'audio' }), plusAncien: 'm42' }),
    );
    expect(rendu).not.toContain('Essayez un autre type');
    expect(rendu).toContain('Aucun média dans « Audio »');
  });

  /**
   * LE LIEN « MÉDIAS PLUS ANCIENS » EST L'ACTION PRINCIPALE DE LA CARTE VIDE,
   * une fois — pas un second lien orphelin sous une phrase qui le contredit.
   */
  it('fait du lien « Médias plus anciens » l’action de la carte vide, une seule fois', () => {
    const rendu = documentDesMedias(
      etat({ galerie: galerie({ messages: [], genre: null }), plusAncien: 'm42' }),
    );
    const liens = [...rendu.matchAll(/href="\/chats\/c1\/medias\?avant=m42"/g)];
    expect(liens).toHaveLength(1);
    expect(rendu).toContain('class="action primaire" href="/chats/c1/medias?avant=m42"');
  });

  /** Non vide, le lien « plus anciens » reste le lien de PIED DE GRILLE existant — comportement inchangé. */
  it('garde le lien « plus anciens » en pied de grille quand la galerie n’est PAS vide', () => {
    const rendu = documentDesMedias(
      etat({ galerie: galerie({ messages: [IMAGE], genre: null }), plusAncien: 'm42' }),
    );
    expect(rendu).toContain('class="plus-ancien action discrete" href="/chats/c1/medias?avant=m42"');
    expect(rendu).not.toContain('<div class="carte-vide">');
  });

  it('déclare la puce active et fait porter le genre aux autres', () => {
    const rendu = documentDesMedias(etat({ galerie: galerie({ messages: [IMAGE], genre: 'image' }) }));
    expect(rendu).toContain('href="/chats/c1/medias?genre=image" aria-current="page"');
    expect(rendu).toContain('href="/chats/c1/medias"');
    expect(rendu).toContain('href="/chats/c1/medias?genre=audio"');
  });

  it('n’offre « plus anciens » que s’il y a une page plus ancienne, et lui garde le filtre', () => {
    expect(documentDesMedias(etat())).not.toContain('Médias plus anciens');
    const rendu = documentDesMedias(
      etat({ plusAncien: 'm0', galerie: galerie({ messages: [IMAGE], genre: 'image' }) }),
    );
    expect(rendu).toContain('href="/chats/c1/medias?genre=image&amp;avant=m0"');
    expect(rendu).toContain('Médias plus anciens');
  });

  /** Un écran qui appartient à un lecteur ne s'indexe pas. */
  it('sert un document plein écran, hors des moteurs', () => {
    const rendu = documentDesMedias(etat());
    expect(rendu).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(rendu).toContain('<html lang="fr"');
  });
});

/**
 * DÉFAUT MAJEUR CORRIGÉ (#5024 point 2) — `?media=` SERT LA SURIMPRESSION SUR
 * LE DOCUMENT DE LA GALERIE, exactement comme le fil : c'est ce que
 * `adresseDuPlein()` (posé sur chaque tuile, plus haut) doit trouver en face
 * de lui pour que le geste ait un effet.
 */
describe('la tuile touchée ouvre la MÊME surimpression que le fil, sur ce document', () => {
  it('sert le plein écran d’une image, le fond inerte derrière elle', () => {
    const rendu = documentDesMedias(etat({ plein: 'a1' }));
    expect(rendu).toContain('<dialog class="plein" id="plein" open');
    expect(rendu).toContain('data-genre="image"');
    expect(rendu).toContain('id="titre-du-plein">tableau.jpg<');
    expect(rendu).toContain('dialog.plein{');
    expect(rendu).toMatch(/<main id="main-content" class="medias-ecran" inert>/);
  });

  it('ne sert AUCUNE surimpression hors de `?media=`, et le fond n’est pas inerte', () => {
    const rendu = documentDesMedias(etat());
    expect(rendu).not.toContain('<dialog class="plein"');
    expect(rendu).not.toContain('dialog.plein{');
    expect(rendu).toMatch(/<main id="main-content" class="medias-ecran">/);
  });

  /** Un genre `ouvre === 'fichier'` (le PDF) n'a pas de plein écran (§ 12.10.1) : `?media=` sur lui ne rend rien. */
  it('ne rend rien pour un genre sans plein écran, ni pour une pièce inconnue', () => {
    expect(documentDesMedias(etat({ plein: 'a4' }))).not.toContain('<dialog class="plein"');
    expect(documentDesMedias(etat({ plein: 'introuvable' }))).not.toContain('<dialog class="plein"');
  });

  /**
   * LE FILTRE ACTIF SURVIT À L'OUVERTURE ET À LA FERMETURE — la preuve que
   * l'adresse composée (`adresseDesMedias` déjà porteuse de `?genre=`) ne
   * casse pas la composition de `?autour=&media=` : la régression que la
   * revue croisée a nommée (double `?` dans la chaîne, `autour=` alors
   * illisible pour `URL().searchParams`).
   */
  it('garde le filtre actif dans l’adresse de retour de la surimpression', () => {
    const rendu = documentDesMedias(
      etat({ galerie: galerie({ messages: [IMAGE], genre: 'image' }), plein: 'a1' }),
    );
    expect(rendu).toContain('data-retour="/chats/c1/medias?genre=image&amp;autour=r1#m-r1"');
  });
});
