/**
 * Le délai d'adoption d'une preuve par lien — le contrat UNIQUE entre la
 * passerelle et ses clients (#10518).
 *
 * Un lien magique ou une vérification d'adresse rend une session (ou un défi
 * de second facteur) AVANT que l'appareil ait décidé d'en vouloir. La
 * passerelle ne l'adopte que dans une fenêtre courte, qu'elle seule décide et
 * qu'elle seule fait respecter, sur sa propre horloge. Elle la SERT dans la
 * réponse qui remet la preuve : `adoptWithinSeconds`, le nombre de secondes
 * qui restent à l'instant où elle répond. C'est une DURÉE, jamais une date :
 * le client l'applique à son instant de réception, sans comparer son horloge
 * à celle du serveur.
 *
 * Le client s'en sert pour une seule chose : ne pas ranger le compte ouvert
 * pour poser une session que la passerelle refuserait (#10513). Il ne décide
 * de rien d'autre — une fenêtre lue trop longue ne prolonge aucune session.
 */

/** Ce que la réponse d'une preuve par lien porte en plus, côté passerelle. */
export type ProvenSessionAdoption = {
  /**
   * Secondes restantes, à l'instant de la réponse, pour adopter ce que la
   * preuve a rendu : la session (premier appel authentifié) ou le défi de
   * second facteur (`POST /auth/login/2fa`). Entier, jamais négatif. Absent
   * d'une passerelle antérieure à #10518, et d'une session que rien n'attend.
   *
   * C'est un PLAFOND, pas une promesse : la preuve peut mourir plus tôt. Un
   * défi de second facteur est remplacé par tout défi plus récent du même
   * compte (nouvelle preuve, `POST /auth/login`) ; une session peut être
   * révoquée. Passé ce délai elle est morte à coup sûr ; avant, la passerelle
   * seule le dit.
   */
  readonly adoptWithinSeconds?: number;
};

export type ProvenAdoptionKind = 'session' | 'second-factor';

/** Ce que le client retranche du délai servi : le trajet de la réponse, puis
 * celui du premier appel qui adopte. */
export const PROVEN_ADOPTION_CLIENT_MARGIN_MS = 60 * 1000;

/**
 * La fenêtre d'un client quand la passerelle ne sert rien (antérieure à
 * #10518). Elle ne peut être que PLUS COURTE que celle de la passerelle : un
 * témoin de la passerelle la compare à ses vraies constantes.
 */
export const PROVEN_ADOPTION_CLIENT_FALLBACK_MS: Readonly<Record<ProvenAdoptionKind, number>> = {
  session: 9 * 60 * 1000,
  'second-factor': 4 * 60 * 1000,
};

/**
 * La borne DURE d'un client : quoi que la réponse prétende, une preuve gardée
 * en mémoire finit par expirer. Un témoin de la passerelle vérifie que ses
 * vraies fenêtres tiennent dessous.
 */
export const PROVEN_ADOPTION_CLIENT_MAX_MS = 30 * 60 * 1000;

/**
 * La fenêtre (ms) qu'un client applique à l'instant où il a reçu la preuve.
 * Un délai qui n'est pas un entier sûr et positif vaut un délai absent : le
 * repli. Un délai lisible est suivi, moins la marge, jusqu'à la borne dure.
 */
export function provenAdoptionClientWindowMs(kind: ProvenAdoptionKind, adoptWithinSeconds: unknown): number {
  if (!Number.isSafeInteger(adoptWithinSeconds) || (adoptWithinSeconds as number) < 0) {
    return PROVEN_ADOPTION_CLIENT_FALLBACK_MS[kind];
  }
  const window = (adoptWithinSeconds as number) * 1000 - PROVEN_ADOPTION_CLIENT_MARGIN_MS;
  return Math.min(Math.max(0, window), PROVEN_ADOPTION_CLIENT_MAX_MS);
}
