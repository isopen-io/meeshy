import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { langueDemandee } from '@/lib/a11y/langues-demandees';
import { revalideLaPlace } from '@/lib/api/adhesion';
import { lisLesMedias } from '@/lib/api/medias';
import type { Verdict } from '@/lib/api/messagerie';
import { identiteDuVisiteur } from '@/lib/api/passerelle';
import { lisLaPlaceServie } from '@/lib/api/session-invitee-cookie';

import { PLACE_FERMEE, avisDuLienMort, type AvisDeLaPlace } from '../etats';
import { prismeDuLecteur } from '../fil-modele';
import { PLACE_ABSENTE, avisDeLaGalerie, puces } from './etats';
import { carteAudio, familleDemandee, tuileDuMedia, type GalerieServie } from './modele';
import { VueDesMedias } from './vue';

/**
 * `/chats/:lien/medias` — les médias d'une conversation partagée (matrice
 * ordre 7, `cible/media.png`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UNE ADRESSE À PART, ALORS QUE LE FIL EN A UNE POUR TROIS ÉTATS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le § 6.3 B interdit de fabriquer une seconde adresse pour un même LIEU vu à
 * deux moments — l'aperçu, les droits et le fil sont la même chose qui mûrit.
 * La galerie n'est pas cela : c'est un autre CONTENU du même lieu, que le
 * visiteur veut pouvoir partager, mettre en signet et quitter par le retour
 * arrière sans perdre sa lecture. La matrice lui donne d'ailleurs sa propre
 * ligne et sa propre route. Elle est donc un SEGMENT sous le fil, ce qui garde
 * la place — indexée par le lien — valable pour les deux écrans sans un
 * paramètre de plus.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA PLACE D'ABORD, LES MÉDIAS ENSUITE — le même ordre que le fil
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La place se retrouve dans les COOKIES, sans un appel ; sa porte
 * (`POST /anonymous/refresh`) rend la langue déclarée, le titre et
 * l'identifiant de la conversation. L'aperçu du LIEN n'est jamais appelé : il
 * refuse 410 `LINK_MAX_USES` dès que la place a été prise, et conditionner la
 * galerie d'un invité entré à cette porte-là reviendrait à l'éjecter à cause de
 * sa propre entrée (le défaut que `../page.tsx` documente).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE PRISME DESCEND ICI, PAS DANS LE NAVIGATEUR
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La charge d'un vocal porte sa transcription ET la carte complète de ses
 * traductions — texte et pistes TTS. Les faire traverser la frontière serveur →
 * client pour que le navigateur en élise une mettrait N textes et N URL dans le
 * document, sur l'écran du rôle premier. La descente se fait donc au rendu, et
 * le document ne porte qu'UNE ligne et UNE piste par vocal.
 */

/**
 * Aucun aperçu par contenu, et `noindex` — la même raison que `../page.tsx` : le
 * titre d'une conversation privée n'a pas à entrer dans l'historique, les listes
 * d'onglets partagés ni un index. Le titre est donc GÉNÉRIQUE, et il ne coûte
 * aucun appel de passerelle sur le chemin critique.
 */
export const metadata: Metadata = {
  title: 'Médias partagés — Meeshy',
  description: 'Les médias échangés dans la conversation qu’on a partagée avec vous.',
  robots: { index: false, follow: false },
};

type Parametres = {
  readonly params: Promise<{ readonly lien: string }>;
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
};

const valeur = (
  requete: Record<string, string | readonly string[] | undefined>,
  nom: string,
): string | null => {
  const brut = requete[nom];
  return typeof brut === 'string' && brut.trim() !== '' ? brut : null;
};

export default async function PageDesMedias({ params, searchParams }: Parametres) {
  const { lien: segment } = await params;
  const requete = await searchParams;
  const entetes = await headers();
  const identite = identiteDuVisiteur(entetes);

  const famille = familleDemandee(valeur(requete, 'famille'));

  /** Zéro appel : une place se retrouve dans les cookies, jamais dans le réseau. */
  const place = await lisLaPlaceServie(segment);
  const retour = `/chats/${encodeURIComponent(place?.cle ?? segment)}`;
  const onglets = puces({ famille, retour });

  /**
   * Sans place, l'écran ne SERT aucune famille : ses quatre puces mèneraient
   * toutes ici, c'est-à-dire nulle part. Elles ne sont donc pas servies — un
   * contrôle existe s'il a un effet (loi 4).
   */
  if (place === null) {
    return (
      <VueDesMedias
        ecran={{ nom: null, retour, famille, puces: [], tuiles: [], cartes: [], avis: PLACE_ABSENTE }}
      />
    );
  }

  const relecture = await revalideLaPlace({ jeton: place.session.jeton, identite });
  const relue = relecture.etat === 'valide' ? relecture.place : null;

  /** Ce que la passerelle vient de dire PRIME ; ce que la place portait SUIT. */
  const langue = relue?.langue ?? place.session.langue;
  const nom = relue?.nom ?? place.session.nom;
  const conversationId = relue?.conversationId ?? place.session.conversationId;

  /**
   * Une place FERMÉE (401) n'ouvre plus rien : demander la galerie derrière elle
   * ne rendrait qu'un second 401. Un lien MORT (410), lui, ne retire pas la
   * place — « ce qui est déjà lu reste lu » (§ 6.3 G) —, donc la lecture se
   * fait, et l'avis se peint au-dessus.
   */
  const avisDeLaPlace: AvisDeLaPlace | null =
    relecture.etat === 'close'
      ? PLACE_FERMEE
      : relecture.etat === 'lien-mort'
        ? avisDuLienMort(relecture.cause)
        : null;

  /**
   * `null` sur `conversationId` — la porte n'a rien dit — n'est PAS une lecture
   * indisponible : il n'y a eu aucun appel, donc rien qui ait échoué. L'écran
   * montre alors une galerie vide, ce qu'elle est.
   */
  const lecture: Verdict<GalerieServie> =
    relecture.etat === 'close' || conversationId === null
      ? { etat: 'servi', valeur: { medias: [], partielle: false } }
      : await lisLesMedias({
          jeton: place.session.jeton,
          identite,
          conversationId,
          famille,
        });

  const medias = lecture.etat === 'servi' ? lecture.valeur.medias : [];
  const prisme = prismeDuLecteur({
    declaree: langue,
    locale: langueDemandee(entetes.get('accept-language')).code,
  });

  return (
    <VueDesMedias
      ecran={{
        nom,
        retour,
        famille,
        puces: onglets,
        tuiles:
          famille === 'audio'
            ? []
            : medias.map((media) => tuileDuMedia({ media, langueDuDocument: DOCUMENT_LANGUAGE })),
        cartes:
          famille === 'audio'
            ? medias.map((media) =>
                carteAudio({ media, prisme, langueDuDocument: DOCUMENT_LANGUAGE }),
              )
            : [],
        avis: avisDeLaPlace ?? avisDeLaGalerie(lecture),
      }}
    />
  );
}
