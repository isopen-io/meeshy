'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { rejoindreLeLien, type Adhesion } from '@/lib/api/adhesion';
import { identiteDuVisiteur } from '@/lib/api/passerelle';
import { poseLeRefusServi } from '@/lib/api/refus-servi-cookie';
import { poseLaPlaceServie } from '@/lib/api/session-invitee-cookie';

/**
 * L'ENTRÉE, côté serveur — le seul endroit où une place se crée.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POST / REDIRECT / GET, ET PAS UN ÉTAT DE FORMULAIRE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `useActionState` rendrait le refus dans la réponse du POST — au prix d'un îlot
 * client sur un écran qui n'en a aucun, et d'une page dont le rechargement
 * repropose l'envoi. La réponse est donc une REDIRECTION : succès vers la place
 * ouverte, refus vers ce même écran. Trois propriétés en découlent, et aucune
 * n'est gratuite autrement :
 *
 *   • le comportement est IDENTIQUE avec et sans JavaScript — c'est le critère
 *     de fin, et un chemin qui n'existe que sans JS serait un chemin que
 *     personne ne teste ;
 *   • le bouton Précédent ne renvoie jamais le formulaire, donc n'ouvre jamais
 *     une SECONDE place (§ 6.1 point 3 : une place de plus coûte une identité
 *     neuve, un pseudo suffixé et trois compteurs) ;
 *   • le refus est ADRESSABLE : on peut l'ouvrir, le mesurer, le capturer.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE LA REDIRECTION PORTE, ET CE QU'ELLE NE PORTE PLUS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * L'URL ne porte que le pseudo TAPÉ, une valeur de champ que le visiteur a sous
 * les yeux et dont le seul effet est de lui éviter de la retaper. Elle ne porte
 * PLUS le verdict : un `?refus=` était indistinguable d'un `?refus=` écrit par
 * un tiers, et l'écran RETIRE son formulaire sur un refus définitif — soit un
 * lien vivant qu'on pouvait faire passer pour mort d'un paramètre ajouté à
 * l'adresse partagée. Le verdict voyage donc dans un cookie que seul ce serveur
 * peut écrire (`lib/api/refus-servi-cookie.ts`, qui porte le raisonnement).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT DANS CET ORDRE, ET POURQUOI CET ORDRE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le § 6.3 A prescrit : `POST /anonymous/join` → 201 → écriture du jeton →
 * `await import('socket.io-client')` → connexion → battement. Les deux premiers
 * pas sont ici. Les trois suivants sont CLIENTS par nature et arrivent avec
 * l'écran `thread` (matrice, ordre 11) : ouvrir une connexion temps réel depuis
 * une action de serveur n'aurait aucun sens, et le § 8.3 interdit d'ailleurs de
 * charger les 12 796 octets du transport sur l'écran d'AVANT le tap.
 *
 * L'identité RÉSEAU du visiteur est lue ICI, sur la requête entrante, et passée
 * EXPLICITEMENT : un appel serveur-à-serveur qui ne la porte pas remplace
 * l'adresse du lecteur par celle du conteneur, donc neutralise `allowedIpRanges`
 * et fait de `anonymousSession.ipAddress` une constante. Le détail — et pourquoi
 * deux en-têtes nommés plutôt qu'un `...headers` aveugle — est sur
 * `IdentiteDuVisiteur` (`lib/api/passerelle.ts`).
 */

const CHEMIN = (lien: string): string => `/chats/${encodeURIComponent(lien)}`;

const champ = (donnees: FormData, nom: string): string => {
  const valeur = donnees.get(nom);
  return typeof valeur === 'string' ? valeur : '';
};

/**
 * Le retour d'un refus. `pseudo` revient pour que le visiteur n'ait pas à le
 * retaper — le retaper serait la punition d'une erreur qu'il n'a pas commise —
 * et le VERDICT part par le cookie, jamais par l'adresse.
 */
const retourDuRefus = async (
  lien: string,
  pseudo: string,
  verdict: Exclude<Adhesion, { readonly etat: 'admis' }>,
): Promise<string> => {
  await poseLeRefusServi(
    lien,
    verdict.etat === 'refus' ? verdict.refus : { cause: verdict.etat, suggestion: null },
  );

  return `${CHEMIN(lien)}?${new URLSearchParams({ pseudo }).toString()}`;
};

export const rejoindre = async (lien: string, donnees: FormData): Promise<void> => {
  const pseudo = champ(donnees, 'pseudo');

  const verdict = await rejoindreLeLien({
    identifiant: lien,
    identite: identiteDuVisiteur(await headers()),
    demande: {
      pseudo,
      langue: champ(donnees, 'langue'),
      email: champ(donnees, 'email'),
      naissance: champ(donnees, 'naissance'),
    },
  });

  if (verdict.etat !== 'admis') redirect(await retourDuRefus(lien, pseudo, verdict));

  // La place est rangée sous la CLÉ CANONIQUE, jamais sous le segment d'URL
  // (§ 6.1 point 2 bis) — et le SEGMENT est passé pour qu'un alias l'y ramène.
  // Sans lui, revenir par l'adresse PARTAGÉE (`/l/:token` redirige vers
  // `/chats/<token>`) exigerait de résoudre le segment par l'aperçu du lien,
  // qui refuse 410 `LINK_MAX_USES` dès que la place a été prise : le visiteur
  // se verrait refuser l'entrée à cause de sa propre entrée.
  await poseLaPlaceServie(verdict.cle, verdict.session, lien);

  redirect(CHEMIN(verdict.cle));
};
