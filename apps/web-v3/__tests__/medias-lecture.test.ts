/**
 * @jest-environment node
 */

import { lisLesMedias, mediaDepuis, PAGE_DES_MEDIAS } from '@/lib/api/medias';

/**
 * LA PORTE DE LA GALERIE — `GET /conversations/:id/attachments` (§ 5.1, ligne
 * « Médias distants »).
 *
 * C'est le SECOND LECTEUR des messages d'une conversation, et la passerelle le
 * dit elle-même : il s'arrête aux mêmes bornes que le premier (plancher de lien
 * de partage, masquage personnel), pour un invité comme pour un membre.
 *
 * Ce que ce témoin garde, et qu'aucun écran ne doit refaire : les CINQ
 * verdicts (servi / place fermée / lien mort / refus / indisponible), la projection de
 * la forme de passerelle vers celle de l'écran, et le fait que « Fichiers »
 * demande DEUX types là où la passerelle en sépare deux (régime 2 : le module
 * fait N appels et rend la forme cible).
 */

const reponse = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });

/**
 * LA FORME QUE LA BASE PORTE, et pas une forme de confort.
 *
 * `MessageAttachment.fileUrl` est écrit par `UploadProcessor.getAttachmentPath`,
 * qui rend un CHEMIN RELATIF — sans origine. Une fixture qui poserait une URL
 * absolue ferait passer une projection qui sert la valeur brute, et le défaut
 * ne se verrait qu'en production, sur l'apex, où aucun routeur `/api` n'existe.
 */
const CHEMIN_PHOTO = '/api/v1/attachments/file/2026/08/a-1.jpg';

/** L'origine publique de la passerelle, celle que le NAVIGATEUR doit joindre. */
const PASSERELLE_PUBLIQUE = 'https://gate.test';

const PHOTO = {
  id: 'a-1',
  fileName: 'a-1.jpg',
  originalName: 'marche-de-lagos.jpg',
  mimeType: 'image/jpeg',
  fileSize: 420_000,
  fileUrl: CHEMIN_PHOTO,
  width: 1200,
  height: 900,
  duration: null,
  createdAt: '2026-08-30T12:01:00.000Z',
};

const VOCAL = {
  id: 'a-2',
  fileName: 'a-2.m4a',
  originalName: null,
  mimeType: 'audio/mp4',
  fileSize: 96_000,
  fileUrl: '/api/v1/attachments/file/2026/08/a-2.m4a',
  duration: 23_000,
  createdAt: '2026-08-30T12:02:00.000Z',
  transcription: { text: 'Mo ti de ibi ipade.', language: 'yo', confidence: 0.94, source: 'whisper' },
  translations: {
    fr: {
      type: 'audio',
      transcription: 'Je suis arrivé au lieu du rendez-vous.',
      url: '/api/v1/attachments/file/translated/a-2-fr.mp3',
      format: 'mp3',
      createdAt: '2026-08-30T12:02:30.000Z',
    },
  },
};

/**
 * L'origine publique est lue à CHAQUE appel (jamais au chargement du module) :
 * la poser ici suffit, et elle est RESTAURÉE pour ne pas fuir vers les autres
 * suites du même worker.
 */
const origineAvant = process.env.NEXT_PUBLIC_API_URL;

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = PASSERELLE_PUBLIQUE;
});

afterAll(() => {
  if (origineAvant === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = origineAvant;
});

const appelle = async (
  famille: 'images' | 'videos' | 'audio' | 'fichiers',
  reponses: readonly Response[],
) => {
  const urls: string[] = [];
  const file = [...reponses];

  const verdict = await lisLesMedias({
    base: 'https://gate.test',
    jeton: 'jeton',
    conversationId: '6501f2a1b2c3d4e5f6a7b8c9',
    famille,
    recuperer: (url) => {
      urls.push(url);
      const suivante = file.shift();
      return suivante === undefined
        ? Promise.reject(new Error('aucune réponse préparée'))
        : Promise.resolve(suivante);
    },
  });

  return { urls, verdict };
};

const servis = (corps: readonly unknown[]): Response =>
  reponse({ success: true, data: { attachments: corps } });

describe('ce que la galerie DEMANDE', () => {
  it('interroge le type de la famille, sur une page bornée', async () => {
    const { urls } = await appelle('images', [servis([PHOTO])]);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/conversations/6501f2a1b2c3d4e5f6a7b8c9/attachments');
    expect(urls[0]).toContain('type=image');
    expect(urls[0]).toContain(`limit=${PAGE_DES_MEDIAS}`);
  });

  /**
   * La passerelle sépare `document` et `text` là où la cible ne dessine qu'une
   * puce « Fichiers ». Le module fait donc DEUX appels et rend la forme cible
   * (§ 5.2, régime 2) : le jour où la porte les réunira, l'appelant ne changera
   * pas.
   */
  it('« Fichiers » demande les DEUX types que la passerelle sépare', async () => {
    const { urls } = await appelle('fichiers', [servis([]), servis([])]);

    expect(urls.map((url) => new URL(url).searchParams.get('type')).sort()).toEqual([
      'document',
      'text',
    ]);
  });

  it('rend les deux listes de « Fichiers » en une seule, du plus récent au plus ancien', async () => {
    const ancien = { ...PHOTO, id: 'a-9', mimeType: 'application/pdf', createdAt: '2026-08-29T09:00:00.000Z' };
    const recent = { ...PHOTO, id: 'a-8', mimeType: 'text/plain', createdAt: '2026-08-30T09:00:00.000Z' };

    const { verdict } = await appelle('fichiers', [servis([ancien]), servis([recent])]);

    expect(verdict.etat).toBe('servi');
    expect(verdict.etat === 'servi' ? verdict.valeur.medias.map((media) => media.id) : []).toEqual([
      'a-8',
      'a-9',
    ]);
  });
});

describe('ce que la galerie PROJETTE', () => {
  it('prend le nom d’origine, l’adresse servie et le poids', async () => {
    const { verdict } = await appelle('images', [servis([PHOTO])]);
    const media = verdict.etat === 'servi' ? verdict.valeur.medias[0] : null;

    expect(media?.nom).toBe('marche-de-lagos.jpg');
    expect(media?.octets).toBe(420_000);
  });

  /**
   * L'ADRESSE — le critère de fin n° 1 (« chaque tuile OUVRE le média »).
   *
   * `fileUrl` est un CHEMIN : posé tel quel dans un `<a href>`, il se résout
   * contre l'origine du DOCUMENT (l'apex en production), où aucun routeur
   * `/api` n'existe — chaque tuile mènerait au 404 du frontend, chaque lecteur
   * audio ne jouerait rien. La projection lui donne l'origine PUBLIQUE de la
   * passerelle, et le CHEMIN reste intact : le § 5.1 interdit de le recomposer,
   * pas de le rendre joignable.
   */
  it('donne au chemin servi l’origine publique de la passerelle, sans toucher au chemin', async () => {
    const { verdict } = await appelle('images', [servis([PHOTO])]);

    expect(verdict.etat === 'servi' ? verdict.valeur.medias[0]?.url : null).toBe(
      `${PASSERELLE_PUBLIQUE}${CHEMIN_PHOTO}`,
    );
  });

  /**
   * LA PISTE TTS PORTE LA MÊME FORME, et « ce qui part À CÔTÉ du texte » est
   * exactement ce que le cycle 128 a coûté : un correctif d'adresse posé sur le
   * seul `fileUrl` laisserait le lecteur audio d'un vocal TRADUIT muet.
   */
  it('adresse aussi la piste TTS — l’adresse ne s’arrête pas au fichier original', async () => {
    const { verdict } = await appelle('audio', [servis([VOCAL])]);

    expect(verdict.etat === 'servi' ? verdict.valeur.medias[0]?.pistes.fr?.url : null).toBe(
      `${PASSERELLE_PUBLIQUE}/api/v1/attachments/file/translated/a-2-fr.mp3`,
    );
  });

  /**
   * Une adresse ABSOLUE traverse telle quelle : c'est la forme qu'une passerelle
   * configurée avec `PUBLIC_URL` peut servir, et la préfixer une seconde fois
   * fabriquerait une adresse morte.
   */
  it('laisse passer une adresse déjà absolue', () => {
    const media = mediaDepuis({ ...PHOTO, fileUrl: 'https://cdn.test/2026/08/a-1.jpg' });

    expect(media?.url).toBe('https://cdn.test/2026/08/a-1.jpg');
  });

  it('retombe sur le nom de stockage quand il n’y a pas de nom d’origine', async () => {
    const { verdict } = await appelle('audio', [servis([VOCAL])]);

    expect(verdict.etat === 'servi' ? verdict.valeur.medias[0]?.nom : null).toBe('a-2.m4a');
  });

  /**
   * Le dépouillement de `MessageAttachment.translations` a UN site — les deux
   * jumelles de `packages/shared/types/attachment-audio.ts`. Ce témoin garde le
   * fait que la projection les APPELLE : la carte porte le TEXTE par langue, et
   * la piste TTS par langue, deux jeux qui ne se recouvrent pas.
   */
  it('dépouille les traductions d’un vocal en texte ET en piste', async () => {
    const { verdict } = await appelle('audio', [servis([VOCAL])]);
    const media = verdict.etat === 'servi' ? verdict.valeur.medias[0] : null;

    expect(media?.transcription).toEqual({ texte: 'Mo ti de ibi ipade.', langue: 'yo' });
    expect(media?.traductions).toEqual({ fr: 'Je suis arrivé au lieu du rendez-vous.' });
    expect(media?.pistes.fr?.url).toBe(
      `${PASSERELLE_PUBLIQUE}/api/v1/attachments/file/translated/a-2-fr.mp3`,
    );
    expect(media?.dureeMs).toBe(23_000);
  });

  /**
   * Une entrée sans adresse ne peut RIEN ouvrir : la peindre donnerait une tuile
   * inerte, ce que la loi 4 refuse. Elle sort de la liste, et les autres restent.
   */
  it('écarte une entrée sans adresse plutôt que d’en faire une tuile morte', () => {
    expect(mediaDepuis({ ...PHOTO, fileUrl: null })).toBeNull();
    expect(mediaDepuis({ ...PHOTO, id: null })).toBeNull();
    expect(mediaDepuis({ ...PHOTO, mimeType: null })).toBeNull();
    expect(mediaDepuis(PHOTO)).not.toBeNull();
  });
});

describe('les cinq verdicts — les mêmes que la porte de la place', () => {
  it('401 ⇒ la place est fermée', async () => {
    const { verdict } = await appelle('images', [reponse({ success: false }, 401)]);
    expect(verdict.etat).toBe('close');
  });

  it('410 ⇒ le lien est mort, et sa cause est NOMMÉE', async () => {
    const { verdict } = await appelle('images', [
      reponse({ success: false, error: 'LINK_EXPIRED' }, 410),
    ]);

    expect(verdict.etat).toBe('lien-mort');
    expect(verdict.etat === 'lien-mort' ? verdict.cause : null).toBe('lien-expire');
  });

  /**
   * « Erreur réseau ≠ 401 » (§ 7) : un 500 et une passerelle muette laissent
   * l'écran tel qu'il est, ils ne ferment aucune place.
   */
  it('500 et silence ⇒ indisponible, jamais une place fermée', async () => {
    expect((await appelle('images', [reponse({}, 500)])).verdict.etat).toBe('indisponible');

    const muette = await lisLesMedias({
      base: 'https://gate.test',
      jeton: 'jeton',
      conversationId: 'c-1',
      famille: 'images',
      recuperer: () => Promise.reject(new Error('tunnel coupé')),
    });

    expect(muette.etat).toBe('indisponible');
  });

  /**
   * Un refus NOMMÉ sur l'une des deux portes de « Fichiers » l'emporte sur la
   * liste que l'autre a servie : servir la moitié d'une galerie sous une place
   * fermée ferait croire l'écran vivant.
   */
  it('un refus nommé l’emporte sur la liste que l’autre appel a servie', async () => {
    const { verdict } = await appelle('fichiers', [servis([PHOTO]), reponse({}, 401)]);

    expect(verdict.etat).toBe('close');
  });

  /**
   * L'inverse n'est PAS vrai : une seule des deux portes indisponible ne vide
   * pas la galerie — c'est une coupure, et ce qui a été servi reste lisible.
   */
  it('une seule porte muette ne vide pas ce que l’autre a servi', async () => {
    const { verdict } = await appelle('fichiers', [servis([PHOTO]), reponse({}, 503)]);

    expect(verdict.etat).toBe('servi');
    expect(verdict.etat === 'servi' ? verdict.valeur.medias : []).toHaveLength(1);
  });

  /**
   * … MAIS ELLE LAISSE UNE TRACE. « Ce qui est lu reste lu » ne dit pas « ce
   * qui est lu est TOUT » : sans cet aveu, la liste amputée se peint comme une
   * liste complète, et le compte sous le titre l'annonce comme un total.
   */
  it('déclare la lecture PARTIELLE quand une porte est tombée', async () => {
    const complet = await appelle('fichiers', [servis([PHOTO]), servis([])]);
    const ampute = await appelle('fichiers', [servis([PHOTO]), reponse({}, 503)]);

    expect(complet.verdict.etat === 'servi' ? complet.verdict.valeur.partielle : null).toBe(false);
    expect(ampute.verdict.etat === 'servi' ? ampute.verdict.valeur.partielle : null).toBe(true);
  });

  /**
   * LE VIDE MUET — le défaut que « a servi » ≠ « a servi du contenu » laissait
   * passer. `document` en 503 et `text` à `[]` rendaient `{ servi, [] }` : aucun
   * avis peint, et l'écran affichait « Aucun média dans cette conversation pour
   * l'instant » sur une COUPURE. Le témoin voisin ne jouait que la variante
   * inoffensive (l'autre porte sert quelque chose), donc ne pouvait pas tomber.
   */
  it('une liste VIDE ne rachète pas une porte tombée — c’est une indisponibilité', async () => {
    const { verdict } = await appelle('fichiers', [servis([]), reponse({}, 503)]);

    expect(verdict.etat).toBe('indisponible');
  });

  /**
   * 403 — LA PORTE A RÉPONDU, ET ELLE DIT NON.
   *
   * Le peindre en indisponibilité ment sur les trois plans : la connexion a
   * abouti, la conversation n'est PLUS lisible, et « réessayez plus tard »
   * n'aboutira jamais. Les deux chemins qui le produisent sont réels —
   * participant introuvable, participant rattaché à une autre conversation
   * (`routes/attachments/metadata.ts`).
   */
  it('403 ⇒ un refus NOMMÉ, jamais une coupure', async () => {
    const { verdict } = await appelle('images', [reponse({}, 403)]);

    expect(verdict.etat).toBe('refus');
  });

  it('un 403 sur une porte l’emporte sur ce que l’autre a servi', async () => {
    const { verdict } = await appelle('fichiers', [servis([PHOTO]), reponse({}, 403)]);

    expect(verdict.etat).toBe('refus');
  });
});
