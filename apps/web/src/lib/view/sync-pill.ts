import type { OutboxEntry } from '@/lib/send/outbox-store';

/**
 * **LA PASTILLE DE SYNCHRONISATION — LA LOI** (#6080).
 *
 * Portage à la lettre de `SyncPillViewModel.derive`
 * (`apps/ios/Meeshy/Features/Main/ViewModels/SyncPillViewModel.swift:133-164`),
 * fonction PURE là-bas comme ici : elle prend la file, l'état du réseau et
 * l'horloge, et rend UN état discriminé. Rien de ce qui suit n'est une
 * invention du web — chaque seuil a sa ligne Swift.
 *
 * **La v3.1 n'avait aucune pastille.** Elle disait « hors ligne » par une
 * bande DANS l'en-tête du fil, et ne disait RIEN du tout de ce qui attend
 * dans l'outbox — ni sur la liste, ni ailleurs. Un envoi parti hors couverture
 * restait donc invisible jusqu'à ce qu'on rouvre la conversation où il vivait.
 *
 * **La PRIORITÉ est le cœur de la règle** : `failed` > `offline` > `syncing` >
 * `hidden`. Elle n'est pas un ordre de lecture, c'est un ordre d'URGENCE — un
 * échec doit survivre à une reconnexion, sinon il disparaît au moment précis
 * où l'utilisateur pourrait agir dessus.
 */

/**
 * **Combien de temps une entrée TERMINALE reste un état de synchronisation**
 * — `terminalDisplayWindow`, 60 secondes (#4660 côté iOS).
 *
 * La pastille dit ce qui se passe MAINTENANT ; passé cette fenêtre, une ligne
 * qui a renoncé n'est plus un état, c'est un journal. Le doc-comment d'iOS
 * raconte la mesure qui a produit ce seuil : sept lignes mortes de la veille
 * occupaient la pastille depuis 25 heures, sans qu'aucun geste ne les fasse
 * partir.
 */
export const TERMINAL_DISPLAY_WINDOW_MS = 60_000;

/**
 * **Un envoi en vol depuis plus de 4 s est un envoi COINCÉ** —
 * `staleInflightThreshold`. Il bascule la pastille en `offline` même quand le
 * réseau se déclare en ligne : c'est le cas d'une socket qui a calé en
 * silence, que `navigator.onLine` ne voit jamais.
 */
export const STALE_INFLIGHT_MS = 4_000;

export type SyncPillKind = 'hidden' | 'syncing' | 'offline' | 'failed';

export type SyncPillState = {
  readonly kind: SyncPillKind;
  /** Les entrées RETENUES — après péremption des terminales. */
  readonly entries: readonly OutboxEntry[];
};

const HIDDEN: SyncPillState = { kind: 'hidden', entries: [] };

/**
 * **Une entrée TERMINALE est une entrée que plus rien ne fait avancer seule.**
 * Côté iOS, `failed` et `exhausted` sont au même rang ; le web n'a qu'un
 * `LocalDelivery` à deux valeurs (`'pending' | 'failed'`), donc `failed` est
 * le seul état terminal — et `permanent` (le refus définitif) s'y confond déjà
 * dans `use-send.ts`.
 */
const estTerminale = (entry: OutboxEntry): boolean => entry.delivery === 'failed';

/**
 * **La péremption est par ENTRÉE, jamais par pastille** (#4660) : une ligne
 * morte périmée sort de la pastille sans emporter le travail encore vivant, et
 * surtout sans continuer à faire virer la pastille au rouge pendant qu'un
 * envoi est en cours.
 *
 * `startedAt` est l'horloge de la tentative COURANTE (`outbox-store.ts`) :
 * c'est le jumeau exact de l'`updatedAt` que lit iOS.
 */
export function resolveSyncPill({
  entries,
  online,
  now,
}: {
  readonly entries: readonly OutboxEntry[];
  readonly online: boolean;
  readonly now: number;
}): SyncPillState {
  const retenues = entries.filter(
    (entry) => !estTerminale(entry) || now - entry.startedAt <= TERMINAL_DISPLAY_WINDOW_MS,
  );

  if (retenues.some(estTerminale)) return { kind: 'failed', entries: retenues };

  const coincee = retenues.some(
    (entry) => entry.delivery === 'pending' && now - entry.startedAt > STALE_INFLIGHT_MS,
  );
  if (!online || coincee) return { kind: 'offline', entries: retenues };

  if (retenues.length > 0) return { kind: 'syncing', entries: retenues };

  return HIDDEN;
}

/**
 * **L'instant du prochain réveil** — `nextExpiry`. Sans lui, une pastille
 * rouge resterait rouge jusqu'au prochain changement de la file : la
 * péremption est une transition que RIEN n'annonce, il faut donc l'armer.
 *
 * Rend `null` quand aucune entrée n'a d'échéance — auquel cas rien n'est armé,
 * et aucune horloge ne tourne. C'est le point : un `setInterval` permanent
 * réveillerait le navigateur toute la session pour une file vide.
 */
export function nextSyncPillExpiry({
  entries,
  now,
}: {
  readonly entries: readonly OutboxEntry[];
  readonly now: number;
}): number | null {
  const echeances = entries
    .filter(estTerminale)
    .map((entry) => entry.startedAt + TERMINAL_DISPLAY_WINDOW_MS)
    .filter((echeance) => echeance > now);
  return echeances.length === 0 ? null : Math.min(...echeances);
}

/**
 * **CE QUE LA PASTILLE DIT** — miroir de `SyncPillLabels`, dont la doctrine
 * est reprise telle quelle : « les libellés décrivent l'ACTION EN COURS, pas
 * l'objet mis en file (*Envoi de message* plutôt que *Message*), pour que la
 * pastille se lise comme un état du travail de fond et non comme une liste
 * d'objets en attente ».
 *
 * Et une ligne terminale perd le verbe actif : « elle peut traîner des jours
 * après un échec définitif », donc lui laisser « Envoi de… » serait faux.
 */
export function syncPillLabel(state: SyncPillState): string {
  const n = state.entries.length;
  switch (state.kind) {
    case 'failed': {
      const echoues = state.entries.filter(estTerminale).length;
      return echoues > 1 ? `${echoues} envois ont échoué` : 'Envoi échoué';
    }
    case 'offline':
      return n === 0 ? 'Hors ligne' : n > 1 ? `Hors ligne — ${n} en attente` : 'Hors ligne — 1 en attente';
    case 'syncing':
      return n > 1 ? `Envoi de ${n} messages` : 'Envoi de message';
    case 'hidden':
      return '';
  }
}
