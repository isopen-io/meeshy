/**
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { documentDesMedias, type EtatDesMedias } from '@/app/connecte/medias-vue';
import { adresseDuPleinDeLaGalerie, galerie } from '@/lib/api/medias';
import { message, type Message } from '@/lib/api/fil';
import { FIL } from '@/lib/contenu/fil';
import { MEDIAS } from '@/lib/contenu/medias';

/**
 * **UNE TUILE DE LA GALERIE OUVRE LE MÊME PLEIN ÉCRAN QUE LE FIL** (issue
 * #4525, + point 2 de #5024). Le défaut, en une phrase : la tuile menait au
 * FICHIER BRUT, dans un onglet, pendant que la MÊME pièce, tapée dans le fil,
 * ouvrait la surimpression `?media=<pièce>`. Ce fichier prouve l'ÉTAT plein
 * écran de `/chats/:cle/medias` — le rendu ORDINAIRE de la grille reste dans
 * `medias.test.ts`.
 *
 * Fixtures reprises de `medias.test.ts` : la même `PIECE()`, `brut()`, `lu()`.
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

const VOCAL_TRADUIT = lu(VOCAL_BRUT());

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

const GALERIE_FIXE = galerie({ messages: [IMAGE, VIDEO, VOCAL_TRADUIT, FICHIER], genre: null });

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
  galerie: GALERIE_FIXE,
  plusAncien: null,
  avant: null,
  plein: null,
  tempsReel: TEMPS_REEL_DES_MEDIAS,
  ...attributs,
});

/** La surimpression seule, ce qu'un module suivrait entre `<dialog` et `</dialog>`. */
const surimpression = (document_: string): string => /<dialog class="plein"[\s\S]*?<\/dialog>/.exec(document_)?.[0] ?? '';

describe('l’adresse du plein écran de la galerie', () => {
  it('porte ?media= seul quand la galerie n’est ni filtrée ni paginée', () => {
    expect(adresseDuPleinDeLaGalerie({ cle: 'c1', genre: null, avant: null, piece: 'a1' })).toBe('/chats/c1/medias?media=a1');
  });

  it('garde la tranche servie — ?genre= et ?avant= — devant ?media=', () => {
    expect(adresseDuPleinDeLaGalerie({ cle: 'c1', genre: 'image', avant: 'm0', piece: 'a1' })).toBe(
      '/chats/c1/medias?genre=image&avant=m0&media=a1',
    );
  });

  it('encode la clé de la conversation et l’identifiant de la pièce', () => {
    expect(adresseDuPleinDeLaGalerie({ cle: 'c 1', genre: null, avant: null, piece: 'a/1' })).toBe(
      '/chats/c%201/medias?media=a%2F1',
    );
  });
});

describe('une tuile ouvre le même plein écran que le fil', () => {
  it('mène l’image et la vidéo à l’état ?media= de la GALERIE, tranche conservée', () => {
    const rendu = documentDesMedias(
      etat({ galerie: galerie({ messages: [IMAGE, VIDEO], genre: 'image' }), avant: 'm0' }),
    );
    expect(rendu).toContain('<a class="tuile" href="/chats/c1/medias?genre=image&amp;avant=m0&amp;media=a1"');
    expect(rendu).toContain(FIL.pleinEcran('tableau.jpg', '420 Ko'));
    expect(rendu).not.toMatch(/<a class="tuile" href="\/chats\/c1\/medias\?genre=image&amp;avant=m0&amp;media=a1"[^>]*target="_blank"/);
    expect(rendu).not.toContain('autour=');
  });

  it('laisse un fichier ouvrir son onglet, avec le geste nommé', () => {
    const rendu = documentDesMedias(etat({ galerie: galerie({ messages: [FICHIER], genre: null }) }));
    expect(rendu).toContain(`href="${ORIGINE}/api/v1/attachments/file/2026%2F12%2Fa4%2Fbudget.pdf" target="_blank" rel="noopener"`);
    expect(rendu).toContain(FIL.telecharger('budget.pdf', '1,1 Mo'));
  });

  it('rend la surimpression par-dessus la grille INCHANGÉE et inerte', () => {
    const sans = documentDesMedias(etat());
    const avec = documentDesMedias(etat({ plein: 'a1' }));

    expect(avec).toContain('<dialog class="plein" id="plein" open');
    expect(avec.indexOf('<dialog class="plein"')).toBeLessThan(avec.indexOf('<main id="main-content" class="medias-ecran" inert'));
    expect((avec.match(/<li data-piece=/g) ?? []).length).toBe((sans.match(/<li data-piece=/g) ?? []).length);
    expect(avec).toContain(`<img class="media-plein" src="${ORIGINE}/api/v1/attachments/file/2026/tableau.jpg"`);
  });

  it('ne sert la feuille du plein qu’à l’état qui la porte', () => {
    expect(documentDesMedias(etat())).not.toContain('dialog.plein{');
    expect(documentDesMedias(etat({ plein: 'a1' }))).toContain('dialog.plein{');
  });
});

describe('fermer rend l’adresse de la galerie sans ?media=', () => {
  const ETAT_FILTRE = etat({ galerie: galerie({ messages: [IMAGE], genre: 'image' }), avant: 'm0', plein: 'a1' });

  it('par la croix', () => {
    expect(documentDesMedias(ETAT_FILTRE)).toContain('<a class="fermer" href="/chats/c1/medias?genre=image&amp;avant=m0"');
  });

  it('sans filtre ni curseur', () => {
    expect(documentDesMedias(etat({ plein: 'a1' }))).toContain('<a class="fermer" href="/chats/c1/medias"');
  });

  it('par data-retour — ce qu’un module suivrait à Échap', () => {
    const rendu = documentDesMedias(ETAT_FILTRE);
    const fermer = /<a class="fermer" href="([^"]+)"/.exec(rendu)?.[1];
    const retour = /data-retour="([^"]+)"/.exec(rendu)?.[1];
    expect(fermer).toBeDefined();
    expect(retour).toBe(fermer);
  });

  it('n’offre aucun voile', () => {
    expect(documentDesMedias(ETAT_FILTRE)).not.toContain('class="voile"');
  });
});

describe('un vocal ouvre sa fiche', () => {
  it('porte un lien de fiche vers ?media=, comme la ligne du fil', () => {
    const rendu = documentDesMedias(etat());
    expect(rendu).toContain('<a class="fiche" href="/chats/c1/medias?media=a3"');
    expect(rendu).toContain(FIL.fiche('vocal.m4a'));
  });

  it('n’offre aucune fiche sur un vocal sans transcription', () => {
    const muet = lu(VOCAL_BRUT({ transcription: undefined, translations: undefined }));
    const rendu = documentDesMedias(etat({ galerie: galerie({ messages: [muet], genre: null }) }));
    expect(rendu).not.toContain('class="fiche"');
  });

  it('rend la transcription ENTIÈRE au Prisme, sur un rang AUTRE que le premier, avec lang=', () => {
    const vocal = lu(VOCAL_BRUT(), ['es', 'fr']);
    const rendu = documentDesMedias(etat({ galerie: galerie({ messages: [vocal], genre: null }), plein: 'a3' }));
    const bloc = surimpression(rendu);
    expect(bloc).toContain('lang="es"');
    expect(bloc).toContain('Traigo las cifras de marzo.');
    expect(bloc).not.toContain('J’apporte les chiffres de mars.');
    expect(bloc).toContain('Transcrit du yo · lire en es');
    expect(bloc).toContain('lang="yo"');
  });

  it('joue la piste de la langue servie dans la fiche', () => {
    const vocal = lu(
      VOCAL_BRUT({
        translations: {
          fr: { transcription: 'J’apporte les chiffres de mars.', url: '/api/v1/attachments/file/2026/vocal-fr.m4a' },
        },
      }),
      ['fr'],
    );
    const rendu = documentDesMedias(etat({ galerie: galerie({ messages: [vocal], genre: null }), plein: 'a3' }));
    expect(surimpression(rendu)).toContain('<audio class="media-plein" controls preload="none"');
    expect(surimpression(rendu)).toContain(`src="${ORIGINE}/api/v1/attachments/file/2026/vocal-fr.m4a"`);
  });
});

describe('un genre sans plein écran n’en a pas', () => {
  it('?media=<PDF> ne rend rien', () => {
    const rendu = documentDesMedias(etat({ galerie: galerie({ messages: [FICHIER], genre: null }), plein: 'a4' }));
    expect(rendu).not.toContain('<dialog class="plein"');
    expect(rendu).not.toContain(' inert');
  });

  it('?media= hors de la galerie servie ne rend rien', () => {
    expect(documentDesMedias(etat({ plein: 'inconnue' }))).not.toContain('<dialog class="plein"');
    const filtreeAudio = etat({ galerie: galerie({ messages: [IMAGE, VOCAL_TRADUIT], genre: 'audio' }), plein: 'a1' });
    expect(documentDesMedias(filtreeAudio)).not.toContain('<dialog class="plein"');
  });

  it('la pièce d’un message protégé ne s’ouvre pas', () => {
    const protege = lu(brut({ id: 'p1', isViewOnce: true, attachments: [PIECE({ id: 'secret' })] }));
    const rendu = documentDesMedias(etat({ galerie: galerie({ messages: [protege], genre: null }), plein: 'secret' }));
    expect(rendu).not.toContain('<dialog class="plein"');
    expect(rendu).not.toContain('secret');
  });
});

describe('la surimpression ne dépense que ce que le geste demande', () => {
  it('image : la seule balise qui charge', () => {
    const rendu = documentDesMedias(etat({ plein: 'a1' }));
    expect((rendu.match(/<img/g) ?? []).length).toBe(1);
  });

  it('vidéo/audio en preload="none"', () => {
    const rendu = documentDesMedias(etat({ galerie: galerie({ messages: [VIDEO], genre: null }), plein: 'a2' }));
    expect(rendu).toContain('<video class="media-plein" controls preload="none"');
    expect(rendu).not.toContain('<img');
  });
});

describe('voir dans la conversation', () => {
  it('mène au message d’où la pièce vient, dans le fil', () => {
    const rendu = documentDesMedias(etat({ plein: 'a1' }));
    expect(surimpression(rendu)).toContain('<a class="action discrete" href="/chats/c1?autour=r1#m-r1">');
    expect(surimpression(rendu)).toContain(MEDIAS.voirDansLaConversation);
  });
});

describe('le poids du document de la galerie, et le surcoût de l’état ?media=', () => {
  const octets = (source: string): number => gzipSync(Buffer.from(source, 'utf8'), { level: 9 }).length;
  const mesures = JSON.parse(readFileSync(join(__dirname, '..', 'budgets-mesures.json'), 'utf8')) as {
    readonly documents_de_la_galerie: { readonly galerie_o: number; readonly galerie_media_o: number };
  };

  const ordinaire = octets(documentDesMedias(etat()));
  const enPlein = octets(documentDesMedias(etat({ plein: 'a1' })));

  it('ne laisse pas le document de la galerie grossir en silence', () => {
    console.log(`[mesure] document de la galerie ${ordinaire} o gzip · en plein écran ${enPlein} o gzip · surcoût ${enPlein - ordinaire} o`);
    expect(ordinaire).toBeLessThanOrEqual(mesures.documents_de_la_galerie.galerie_o);
  });

  it('ne laisse pas l’état ?media= grossir en silence', () => {
    expect(enPlein).toBeLessThanOrEqual(mesures.documents_de_la_galerie.galerie_media_o);
  });

  it('ne fait payer la surimpression qu’à l’état qui la sert', () => {
    expect(enPlein).toBeGreaterThan(ordinaire);
    expect(documentDesMedias(etat())).not.toContain('dialog.plein');
  });
});
