/**
 * **CE QU'ON PEUT FAIRE D'UNE DIFFUSION, SELON OÙ ELLE EN EST** (#8876, #6731).
 *
 * La table est celle des gardes de `routes/admin/broadcasts.ts` : modifier
 * n'existe qu'au brouillon (`PUT`), préparer aussi (`preview`), envoyer par
 * e-mail exige `READY`, publier dans l'application exige `READY` ou `SENT`,
 * supprimer `DRAFT` ou `READY`. Un geste que la passerelle refuserait n'est pas
 * dessiné (loi 4) — et il n'y a pas d'annulation d'un envoi : la passerelle n'en
 * sert aucune.
 *
 * **Un écart assumé avec la garde** : la publication dans l'application n'est
 * offerte que si elle n'a PAS déjà été lancée. La passerelle accepterait une
 * seconde publication (elle remet les compteurs à zéro et renotifie tout le
 * monde) ; l'offrir à un clic, c'est offrir de notifier deux fois chaque compte.
 */
export type BroadcastGesture = 'edit' | 'prepare' | 'send' | 'publishInApp' | 'delete';

type GestureFacts = { readonly status: string; readonly inAppSentAt: string | null };
type InAppFacts = {
  readonly inAppSentAt: string | null;
  readonly inAppCompletedAt: string | null;
  readonly status?: string;
  readonly inAppSentCount?: number;
  readonly inAppFailedCount?: number;
};

export type InAppState = 'never' | 'running' | 'done' | 'failed';

/**
 * Où en est la publication dans l'application. **Terminée ne veut pas dire
 * publiée** (01402058e7) : un envoi sans AUCUNE livraison, échecs comptés ou
 * job tombé (statut `FAILED`), est une publication ÉCHOUÉE.
 */
export function inAppStateOf(facts: InAppFacts): InAppState {
  if (facts.inAppSentAt === null) return 'never';
  if (facts.inAppCompletedAt === null) return 'running';
  const delivered = facts.inAppSentCount ?? 0;
  return delivered === 0 && ((facts.inAppFailedCount ?? 0) > 0 || facts.status === 'FAILED') ? 'failed' : 'done';
}

export function broadcastGestures(facts: GestureFacts): readonly BroadcastGesture[] {
  const publish: readonly BroadcastGesture[] = facts.inAppSentAt === null ? ['publishInApp'] : [];
  switch (facts.status) {
    case 'DRAFT':
      return ['prepare', 'edit', 'delete'];
    case 'READY':
      return ['send', ...publish, 'delete'];
    case 'SENT':
      return publish;
    default:
      return [];
  }
}

/** Le rythme de relecture d'une diffusion qui avance : dix secondes. */
export const BROADCAST_POLL_MS = 10_000;

/**
 * LA RELECTURE D'UNE DIFFUSION QUI AVANCE — tant que l'envoi par e-mail tourne
 * (`SENDING`) OU que la publication dans l'application tourne (lancée, pas
 * terminée : le statut, lui, ne bouge pas). Au repos, jamais : une page ouverte
 * n'a pas à frapper la passerelle pour rien. TanStack suspend l'intervalle quand
 * l'onglet est masqué (`refetchIntervalInBackground` vaut faux par défaut).
 */
export function broadcastPollInterval(
  broadcast: { readonly status: string; readonly inAppSentAt: string | null; readonly inAppCompletedAt: string | null } | undefined,
  pollMs: number = BROADCAST_POLL_MS,
): number | false {
  if (broadcast === undefined) return false;
  return broadcast.status === 'SENDING' || inAppStateOf(broadcast) === 'running' ? pollMs : false;
}

type PreviewCounts = { readonly recipientCount: number; readonly emailRecipients: number; readonly inAppRecipients: number | null };

/**
 * Le nombre de comptes qu'un CANAL atteindra (01402058e7) : l'e-mail exige une
 * adresse vérifiée, l'application non. Celui de la préparation quand on le
 * connaît (un ancien serveur ne sert pas le compte in-app : repli sur le compte
 * servi), sinon le total de la ligne.
 */
export function recipientsToReach(
  broadcast: { readonly totalRecipients: number },
  preview: PreviewCounts | undefined,
  channel: 'email' | 'inApp' = 'email',
): number {
  if (preview === undefined) return broadcast.totalRecipients;
  return channel === 'inApp' ? (preview.inAppRecipients ?? preview.recipientCount) : preview.emailRecipients;
}

/**
 * LA PROGRESSION DE L'ENVOI PAR E-MAIL, de 0 à 1 — envoyés + échecs sur
 * destinataires. Une diffusion TERMINÉE (`SENT`) est à 100 % : les comptes qui ont
 * coupé les e-mails de diffusion sont ignorés sans être comptés ni en envois ni en
 * échecs, et une barre qui resterait à 94 % sur un envoi fini dirait qu'il manque
 * quelque chose.
 */
export function deliveryProgress(broadcast: {
  readonly status: string;
  readonly totalRecipients: number;
  readonly sentCount: number;
  readonly failedCount: number;
}): number {
  if (broadcast.status === 'SENT') return 1;
  if (broadcast.totalRecipients <= 0) return 0;
  return Math.min(1, (broadcast.sentCount + broadcast.failedCount) / broadcast.totalRecipients);
}
