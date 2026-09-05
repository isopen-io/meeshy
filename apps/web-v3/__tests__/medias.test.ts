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
 *   • la PROTECTION — un message à vue unique / flouté / éphémère n'a aucune
 *     pièce (`message()` : `pieces: protege || supprime ? [] : …`). La liste
 *     dédiée de la passerelle, `GET /conversations/:id/attachments`, ne sert
 *     que SEPT clés (`messageAttachmentMinimalSchema`, gelé par
 *     `conversation-attachments-served-keys.test.ts`) et AUCUN des trois
 *     drapeaux : une galerie bâtie sur elle rendrait l'URL entière d'une photo
 *     à vue unique — le défaut du cycle 125, rejoué sur un écran neuf ;
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

const TEMPS_REEL_DES_MEDIAS = {
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
    plein: { nom: 'plein.abc.js', url: '/__v3/rt/plein.abc.js', corps: '' },
    socket: { nom: 'socket.io.def.js', url: '/__v3/rt/socket.io.def.js', corps: '' },
  },
};

const etat = (attributs: Partial<EtatDesMedias> = {}): EtatDesMedias => ({
  cle: 'c1',
  titre: 'Équipe Lagos',
  galerie: galerie({ messages: [IMAGE, VIDEO, lu(VOCAL_BRUT()), FICHIER], genre: null }),
  plusAncien: null,
  avant: null,
  plein: null,
  tempsReel: TEMPS_REEL_DES_MEDIAS,
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
   * UNE TUILE OUVRE LE MÊME PLEIN ÉCRAN QUE LE FIL (#4525, #5024 point 2) :
   * l'image mène à l'état `?media=` de LA GALERIE, jamais au fichier brut.
   * `fileUrl` SERVI TEL QUEL, résolu sur l'origine PUBLIQUE de la passerelle et
   * jamais reconstruit (§ 5.1 « médias distants »), reste le geste d'un genre
   * SANS plein écran — un fichier ouvre toujours son onglet, geste nommé.
   */
  it('mène l’image au plein écran de la galerie, et laisse un fichier ouvrir son onglet', () => {
    const rendu = document();
    expect(rendu).toContain('href="/chats/c1/medias?media=a1"');
    expect(rendu).not.toContain('href="/chats/c1/medias?media=a1" target="_blank"');
    expect(rendu).toContain(`href="${ORIGINE}/api/v1/attachments/file/2026%2F12%2Fa4%2Fbudget.pdf"`);
    expect(rendu).toContain('target="_blank" rel="noopener"');
    expect(rendu).toContain('Ouvrir tableau.jpg · 420 Ko');
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
