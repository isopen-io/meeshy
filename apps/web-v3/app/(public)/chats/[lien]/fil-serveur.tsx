import { revalideLaPlace } from '@/lib/api/adhesion';
import { lisLeFil, refusDeLaPlace, type Verdict } from '@/lib/api/messagerie';
import { basePubliqueDeLaPasserelle, type IdentiteDuVisiteur } from '@/lib/api/passerelle';
import { cleDuLien } from '@/lib/api/guest-session';
import type { PlaceServie } from '@/lib/api/session-invitee-cookie';

import type { EvenementDuFil } from './fil-etats';
import type { Bulle, MessageServi } from './fil-modele';
import { bulleServie, prismeDuLecteur } from './fil-modele';
import { quitterLaPlace } from './quitter';
import { VueDuFil } from './vue-fil';

/**
 * LE FIL, ASSEMBLÉ PAR LE SERVEUR — l'ordre des appels, et rien d'autre.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA PLACE D'ABORD, LE FIL ENSUITE — ET RIEN NE DÉPEND DU LIEN
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `POST /anonymous/refresh` est la porte de la PLACE : elle rend les droits à
 * jour (« l'hôte a pu les changer », § 6.3 B), la langue déclarée, le titre et
 * l'identifiant de la conversation. L'aperçu du LIEN n'est pas appelé — il
 * refuse 410 `LINK_MAX_USES` dès que la place a été prise, et conditionner le
 * fil d'un invité entré à cette porte-là revient à l'éjecter à cause de sa
 * propre entrée (le défaut que `page.tsx` documente).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UNE PASSERELLE MUETTE NE FERME RIEN
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ni le refresh ni la lecture du fil ne peuvent VIDER l'écran : « erreur réseau
 * ≠ 401 » (§ 7). Un refresh indisponible laisse les droits du cookie ; un fil
 * indisponible rend une liste vide que l'îlot complètera au premier `GET /sync`.
 * Le seul cas qui change l'écran est un refus NOMMÉ, et il est peint par
 * l'îlot — pas par une redirection, que le § 6.3 G interdit (« un lecteur au
 * milieu d'un message ne doit pas voir son écran changer sous lui »).
 *
 * MAIS UNE LISTE VIDE N'EST PAS UN VERDICT. Ce module aplatissait les quatre
 * états de la lecture en `verdict.etat === 'servi' ? valeur : []` : un 500, un
 * tunnel coupé serveur-à-serveur, une charge illisible et une place FERMÉE
 * rendaient tous le même écran qu'une conversation neuve — un `<ol>` vide, sans
 * un mot. Les trois faits voyagent donc distincts jusqu'à l'îlot : les BULLES,
 * le REFUS nommé (401 / 410), et l'INDISPONIBILITÉ. C'est l'îlot qui les peint,
 * comme il peint déjà ceux qu'il rencontre lui-même — une seule copie par fait.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE PRISME DESCEND ICI, PAS DANS LE NAVIGATEUR
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le tableau des messages entrait TEL QUEL en propriété d'un composant
 * `'use client'` : l'original, la langue d'origine et la carte COMPLÈTE des
 * traductions traversaient la frontière pour que le navigateur en élise UNE.
 * Le paquet Flight et le HTML en portaient chacun une copie — un document en
 * O(2 × messages × langues) pour servir une langue, sur l'écran du rôle
 * premier. Le `CLAUDE.md` racine pose déjà le serveur comme le lieu juste de la
 * descente dès qu'un contenu part vers un destinataire NOMMÉ ; ici le
 * destinataire est nommé par sa place. La passerelle offre en plus l'opt-in qui
 * évite de transporter le reste jusqu'ici (`languages=`, « Bandwidth opt-in »),
 * et on le demande.
 */

/**
 * Le watermark du premier rattrapage. Il est pris à l'instant du RENDU, et pas
 * à la date du dernier message : la fenêtre `/sync` est bornée par `updatedAt`,
 * qui bouge aussi sur une ÉDITION — partir du dernier `createdAt` raterait la
 * correction d'un message plus ancien. La passerelle recule elle-même son
 * checkpoint (`SYNC_CHECKPOINT_LAG_MS`), donc au pire on relit.
 */
const watermark = (): string => new Date().toISOString();

export async function EcranDuFil({
  segment,
  place,
  identite,
  langueDuDocument,
  localeDeLAppareil,
}: {
  readonly segment: string;
  readonly place: PlaceServie;
  readonly identite: IdentiteDuVisiteur;
  readonly langueDuDocument: string;
  /** Le rang 4 du Prisme (§ Prisme, règle 2) — jamais un remplacement de la langue déclarée. */
  readonly localeDeLAppareil: string | null;
}) {
  const relecture = await revalideLaPlace({ jeton: place.session.jeton, identite });
  const relue = relecture.etat === 'valide' ? relecture.place : null;

  const droits = relue?.droits ?? place.session.droits;
  const langue = relue?.langue ?? place.session.langue;
  const nom = relue?.nom ?? place.session.nom;
  const conversationId = relue?.conversationId ?? place.session.conversationId;

  const prisme = prismeDuLecteur({ declaree: langue, locale: localeDeLAppareil });

  /**
   * `null` sur `conversationId` — la porte n'a rien dit — n'est PAS une lecture
   * indisponible : il n'y a eu aucun appel, donc rien qui ait échoué. L'écran
   * montre alors un fil vide, ce qu'il est.
   */
  const lecture: Verdict<readonly MessageServi[]> =
    conversationId === null
      ? { etat: 'servi', valeur: [] }
      : await lisLeFil({
          jeton: place.session.jeton,
          identite,
          conversationId,
          participantId: place.session.participantId,
          langues: prisme,
        });

  const bulles: readonly Bulle[] =
    lecture.etat === 'servi'
      ? lecture.valeur.map((message) =>
          bulleServie({ message, prisme, langueDuDocument }),
        )
      : [];

  const refusInitial: EvenementDuFil | null = refusDeLaPlace(lecture);

  return (
    <VueDuFil
      ecran={{
        nom,
        retour: '/',
        reprise: quitterLaPlace.bind(null, segment, place.session.pseudo),
        contexte: {
          base: basePubliqueDeLaPasserelle(),
          jeton: place.session.jeton,
          participantId: place.session.participantId,
          conversationId: conversationId ?? '',
          pseudo: place.session.pseudo,
          cleDuJeton: cleDuLien(place.cle),
          langueDeclaree: langue,
          langueDuDocument,
          prisme,
          /**
           * `null` — « la porte n'a rien dit des droits » — n'est PAS « aucun
           * droit » : refuser le composeur à quelqu'un dont personne n'a dit
           * qu'il ne pouvait pas écrire lui retirerait ce que l'hôte lui a
           * accordé. Le refus qui compte est celui de la passerelle, au premier
           * envoi, et il est peint.
           */
          droits: { ecrire: droits?.ecrire ?? true },
          bulles,
          refusInitial,
          lectureIndisponible: lecture.etat === 'indisponible',
          depuis: watermark(),
        },
      }}
    />
  );
}
