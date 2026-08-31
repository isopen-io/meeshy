import {
  transcriptTranslationTexts,
  transcriptTranslationTracks,
  type AttachmentTranslationTrack,
} from '@meeshy/shared/types/attachment-audio';

import type {
  Famille,
  GalerieServie,
  MediaServi,
} from '@/app/(public)/chats/[lien]/medias/modele';

import {
  enTetesDeLaPlace,
  verdictDeLaReponse,
  type AppelDeLaPlace,
  type Verdict,
} from './messagerie';
import {
  adresseDuMedia,
  baseDeLaPasserelle,
  champ,
  cheminDeLaPasserelle,
  donneeDe,
  entier,
  instant,
  objet,
  recupere,
  texte,
} from './passerelle';

/**
 * LA GALERIE — les pièces jointes d'une conversation partagée (§ 5.1, ligne
 * « Médias distants » ; écran `media`, matrice ordre 7).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA PORTE, ET POURQUOI C'EST CELLE-LÀ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `GET /conversations/:id/attachments` est la porte DÉDIÉE, et la passerelle
 * décrit elle-même son contrat : « la galerie est un SECOND LECTEUR des messages
 * de la conversation … elle doit s'arrêter aux mêmes bornes que le premier »
 * (plancher de lien de partage, masquage personnel), et elle admet un
 * participant ANONYME muni de son jeton de session.
 *
 * L'alternative — dériver les médias de `GET /conversations/:id/messages`, déjà
 * appelé par le fil — aurait rendu la galerie des seuls 50 derniers messages :
 * une conversation de six mois n'y montrerait presque rien, et l'écran
 * annoncerait un nombre d'éléments qui n'est pas celui de la conversation.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * RÉGIME 2 SUR « FICHIERS » — N APPELS, LA FORME CIBLE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La passerelle sépare `document` et `text` là où la cible ne dessine qu'une
 * puce. Le module fait donc DEUX appels et rend UNE liste (§ 5.2, régime 2) :
 * le jour où la porte les réunira, aucun appelant ne changera.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI NE TRAVERSE PAS JUSQU'AU TÉLÉPHONE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La charge d'un vocal porte sa transcription ET toutes ses traductions. Cet
 * appel est SERVEUR-À-SERVEUR : la descente du Prisme se fait dans le rendu
 * (§ « le Prisme descend ici, pas dans le navigateur »), et le document envoyé
 * au téléphone ne porte qu'UNE ligne de texte par vocal. Ce qui coûte cher sur
 * le lien lent n'est donc jamais transporté.
 */

const CHEMIN_DE_LA_GALERIE = (conversationId: string): string =>
  cheminDeLaPasserelle(`/conversations/${encodeURIComponent(conversationId)}/attachments`);

/**
 * La taille d'une page. Trois colonnes à la cible, et « 48 éléments » sous son
 * titre : 48 est un multiple de 3 qui remplit seize rangées sans laisser de
 * trou, et reste sous le plafond de 100 que la passerelle déclare.
 *
 * LIMITE DÉCLARÉE : au-delà de 48, une famille est TRONQUÉE aux plus récents et
 * l'écran n'offre aucun « voir plus ». La porte accepte `offset`, donc la
 * pagination est possible — mais elle veut un contrôle, donc un état de plus, et
 * elle sort du critère de fin de cet écran. Elle a sa propre issue plutôt qu'un
 * bouton posé à moitié : le compte affiché est celui des médias SERVIS, jamais
 * un total inventé, si bien que l'écran ne ment pas en attendant.
 */
export const PAGE_DES_MEDIAS = 48;

/**
 * Les types de la passerelle par famille de la cible — l'union fermée qu'elle
 * déclare (`image | document | audio | video | text`), jamais une chaîne libre.
 */
const TYPES_DE_FAMILLE: Readonly<Record<Famille, readonly string[]>> = {
  images: ['image'],
  videos: ['video'],
  audio: ['audio'],
  fichiers: ['document', 'text'],
};

/**
 * `transcription` est une colonne `Json` : elle peut porter des segments, une
 * analyse de voix, une description d'image. L'écran n'en lit que le texte et sa
 * langue — le reste ne sert aucun pixel de cette page et n'a pas à en franchir
 * la frontière.
 */
const transcriptionDe = (valeur: unknown): MediaServi['transcription'] => {
  const brute = objet(valeur);
  if (brute === null) return null;

  const contenu = texte(champ(brute, 'text'));
  const langue = texte(champ(brute, 'language'));
  return contenu === null || langue === null ? null : { texte: contenu, langue };
};

/**
 * LES PISTES, ADRESSÉES — la projection donne son origine à CHAQUE adresse
 * qu'elle rend, pas seulement à la première.
 *
 * `transcriptTranslationTracks` dépouille la carte de traductions en
 * `langue → piste` ; ses `url` sont des CHEMINS, exactement comme `fileUrl`
 * (`/api/v1/attachments/file/translated/…`). Une piste dont l'adresse n'est pas
 * joignable ne concourt pas : `carteAudio` retombe alors sur le fichier
 * ORIGINAL, ce qui est le repli déjà prévu pour une piste absente — jamais un
 * lecteur muet.
 */
const pistesAdressees = (
  pistes: Readonly<Record<string, AttachmentTranslationTrack>>,
): Readonly<Record<string, AttachmentTranslationTrack>> =>
  Object.fromEntries(
    Object.entries(pistes).flatMap(([langue, piste]) => {
      const url = adresseDuMedia(piste.url);
      return url === null ? [] : [[langue, { ...piste, url }] as const];
    }),
  );

export const mediaDepuis = (valeur: unknown): MediaServi | null => {
  const media = objet(valeur);
  if (media === null) return null;

  const id = texte(champ(media, 'id'));
  /**
   * L'ORIGINE est donnée ICI, dans la projection, et jamais dans la vue : le
   * second écran qui rendra un média la trouvera déjà posée. Une adresse
   * injoignable écarte le média — `mediaDepuis` rend déjà `null` sur une entrée
   * sans adresse, pour la même raison (une tuile inerte n'est pas un contrôle).
   */
  const url = adresseDuMedia(champ(media, 'fileUrl'));
  const mimeType = texte(champ(media, 'mimeType'));
  if (id === null || url === null || mimeType === null) return null;

  const traductions = champ(media, 'translations');

  return {
    id,
    nom: texte(champ(media, 'originalName')) ?? texte(champ(media, 'fileName')) ?? id,
    url,
    mimeType,
    octets: entier(champ(media, 'fileSize')),
    dureeMs: entier(champ(media, 'duration')),
    transcription: transcriptionDe(champ(media, 'transcription')),
    /** Site UNIQUE du dépouillement, et sa jumelle pour le MÉDIUM (cycle 128). */
    traductions: transcriptTranslationTexts(traductions),
    pistes: pistesAdressees(transcriptTranslationTracks(traductions)),
    instantMs: instant(champ(media, 'createdAt')) ?? 0,
  };
};

export const mediasDepuis = (valeur: unknown): readonly MediaServi[] =>
  Array.isArray(valeur)
    ? valeur.flatMap((entree) => {
        const media = mediaDepuis(entree);
        return media === null ? [] : [media];
      })
    : [];

const lisUnType = async ({
  conversationId,
  type,
  jeton,
  identite,
  base,
  recuperer,
}: AppelDeLaPlace & {
  readonly conversationId: string;
  readonly type: string;
}): Promise<Verdict<readonly MediaServi[]>> => {
  const requete = new URLSearchParams({ type, limit: String(PAGE_DES_MEDIAS) });

  const reponse = await recupere(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_DE_LA_GALERIE(conversationId)}?${requete.toString()}`,
    { method: 'GET', headers: enTetesDeLaPlace({ jeton, identite }) },
    recuperer,
  ).catch(() => null);

  return verdictDeLaReponse(reponse, async (servie) => {
    const donnee = await donneeDe(servie);
    if (donnee === null) return null;

    /**
     * Deux formes admises, comme pour le fil : la passerelle sert
     * `{ data: { attachments: [...] } }` ici, et une liste nue ailleurs. Un
     * écran qui n'en connaîtrait qu'une rendrait une galerie VIDE sur l'autre —
     * un vide qui a l'air d'une conversation sans médias.
     */
    return mediasDepuis(Array.isArray(donnee) ? donnee : champ(donnee, 'attachments'));
  });
};

/**
 * L'ARBITRAGE ENTRE PLUSIEURS PORTES — et il n'est pas symétrique.
 *
 * Un refus NOMMÉ (401, 410, 403) l'emporte sur tout : servir la moitié d'une
 * galerie sous une place fermée ferait croire l'écran vivant, et c'est le seul
 * cas où l'écran doit CHANGER. Une indisponibilité, elle, ne retire rien —
 * « erreur réseau ≠ 401 » (§ 7) : ce que l'autre porte a servi reste lisible.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * « A SERVI » N'EST PAS « A SERVI DU CONTENU »
 * ────────────────────────────────────────────────────────────────────────────
 *
 * L'arbitrage AVALAIT l'indisponibilité dès qu'une porte avait répondu, fût-ce
 * par une liste VIDE : sur « Fichiers », `document` en 503 et `text` à `[]`
 * rendaient `{ servi, [] }`, aucun avis n'était peint, et l'écran affichait
 * « Aucun média dans cette conversation pour l'instant » — le mensonge sur une
 * coupure que le doc-tête de `etats.ts` déclare refuser. Il avait été écrit
 * pour le cas où l'autre porte sert QUELQUE CHOSE, et son témoin ne jouait que
 * cette variante-là, la seule inoffensive.
 *
 * Deux conséquences, et elles sont distinctes :
 *
 *   • une porte tombée LAISSE UNE TRACE — `partielle` — que l'écran peint en
 *     bannière au-dessus de ce qui a été lu ;
 *   • quand la liste résultante est VIDE, il n'y a rien à garder : le verdict
 *     est franchement `indisponible`, et non un vide silencieux.
 */
const arbitre = (
  verdicts: readonly Verdict<readonly MediaServi[]>[],
): Verdict<GalerieServie> => {
  const ferme = verdicts.find((verdict) => verdict.etat === 'close');
  if (ferme !== undefined) return { etat: 'close' };

  const mort = verdicts.find((verdict) => verdict.etat === 'lien-mort');
  if (mort !== undefined && mort.etat === 'lien-mort') {
    return { etat: 'lien-mort', cause: mort.cause };
  }

  const refuse = verdicts.find((verdict) => verdict.etat === 'refus');
  if (refuse !== undefined) return { etat: 'refus' };

  const servis = verdicts.flatMap((verdict) => (verdict.etat === 'servi' ? [verdict.valeur] : []));
  if (servis.length === 0) return { etat: 'indisponible' };

  const partielle = verdicts.some((verdict) => verdict.etat === 'indisponible');
  const medias = servis
    .flat()
    .sort((gauche, droite) => droite.instantMs - gauche.instantMs || gauche.id.localeCompare(droite.id));

  return medias.length === 0 && partielle
    ? { etat: 'indisponible' }
    : { etat: 'servi', valeur: { medias, partielle } };
};

export const lisLesMedias = async ({
  conversationId,
  famille,
  jeton,
  identite,
  base,
  recuperer,
}: AppelDeLaPlace & {
  readonly conversationId: string;
  readonly famille: Famille;
}): Promise<Verdict<GalerieServie>> =>
  arbitre(
    await Promise.all(
      TYPES_DE_FAMILLE[famille].map((type) =>
        lisUnType({ conversationId, type, jeton, identite, base, recuperer }),
      ),
    ),
  );
