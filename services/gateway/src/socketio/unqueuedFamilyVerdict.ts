import type { ServerEventName } from './serverEmit';
import { DRAINED_EVENT, type QueuedEventType } from './queuedEventContract';

/**
 * Les familles `message:` / `attachment:` que la passerelle émet, file comprise.
 *
 * `link:message:new` n'y figure pas, et c'est voulu : son préfixe la range avec
 * les liens, et `DRAINED_EVENT` la rejoue déjà sous `'link-message'`.
 */
type MessageOrAttachmentEvent = Extract<
  ServerEventName,
  `message:${string}` | `attachment:${string}` | `attachment-status:${string}`
>;

/** Ce que la file sait rejouer — la table de `queuedEventContract`, lue comme un ensemble. */
type QueuedEventName = (typeof DRAINED_EVENT)[QueuedEventType];

/**
 * Les familles émises que la file ne rejoue PAS. Calculé, jamais énuméré : une
 * famille neuve y entre sans que personne ne l'ajoute.
 */
export type UnqueuedFamily = Exclude<MessageOrAttachmentEvent, QueuedEventName>;

/**
 * Pourquoi une famille se passe de file. DEUX formes, et la distinction n'est
 * pas cosmétique : la première est une MESURE qui peut cesser d'être vraie le
 * jour où un cache change de `staleTime`, la seconde est une propriété de
 * construction qui ne peut pas changer.
 */
export type UnqueuedVerdict =
  | {
      /** Un lecteur absent lit la vérité à son retour, par une LECTURE. */
      readonly kind: 'reload-serves-truth';
      /** Chemin relatif à `src/` du site qui ÉMET — c'est là que la raison doit être écrite. */
      readonly emittedAt: string;
      readonly because: string;
    }
  | {
      /** Rien à enfiler : la famille ne porte aucune vérité qu'une relecture pourrait servir. */
      readonly kind: 'cannot-be-queued';
      readonly emittedAt: string;
      readonly because: string;
    };

/**
 * **La** réponse, famille par famille, à la question de #20019 : « qu'est-ce
 * qu'un lecteur qui était absent voit à son retour — la vérité, ou son cache ? »
 *
 * ─── Pourquoi une TABLE, et pourquoi en production ──────────────────────────
 *
 * #20019 a fait entrer `attachment:deleted` dans la file après avoir constaté
 * qu'il n'y en avait pas, et #20045 a généralisé la question. Elle a trouvé
 * CINQ familles ; le relevé fait en l'instruisant en a trouvé **SIX** — la
 * sixième, `message:pending-delivered`, manquait à une énumération écrite à la
 * main, exactement comme la troisième famille de résolveurs du Prisme avait
 * manqué aux deux premières (leçon 261 : une énumération porte deux
 * affirmations, et c'est la seconde — « ce sont les seuls » — qui n'est presque
 * jamais vérifiée).
 *
 * D'où la forme : le `satisfies Record<UnqueuedFamily, UnqueuedVerdict>` rend
 * la table TOTALE au compilateur sur un ensemble **calculé** (les familles
 * émises moins celles que `DRAINED_EVENT` rejoue). Une septième famille ne
 * compile donc pas sans réponse — et cette table vit en PRODUCTION pour que
 * ce refus tombe sous `tsc -p tsconfig.json`, le gate « Qualité TS », et non
 * sous le cliquet A, qui ne voit que les fichiers de test et porte un plafond.
 *
 * ─── Ce que la table ne prétend pas ─────────────────────────────────────────
 *
 * Elle ne dit pas qu'aucune de ces familles ne MÉRITERAIT une entrée de file :
 * elle dit qu'au jour de la mesure, une relecture sert la vérité — ou que la
 * question ne s'applique pas. Un `reload-serves-truth` est un constat
 * DATÉ, qui tient à des chaînes précises (une lecture REST qui sert le champ,
 * un client qui refait la requête). `attachment-status:updated` tient
 * aujourd'hui à `staleTime: 0` dans `message-receipts-sheet.tsx` ;
 * `attachment:deleted` avait l'inverse — `staleTime: Infinity` au fil web — et
 * c'est ce qui lui a valu son entrée de file. **Ce qui sépare les deux n'est
 * ni la famille ni son importance : c'est ce qu'une relecture sert.**
 *
 * Le témoin `unqueued-family-verdict-sweep.test.ts` garde la moitié que le
 * typage ne voit pas : que le site cité EXISTE et ÉMETTE bien cette famille.
 */
export const UNQUEUED_FAMILY_VERDICT = {
  'message:cited-post-withdrawn': {
    kind: 'reload-serves-truth',
    emittedAt: 'socketio/announceCitedPostWithdrawal.ts',
    because:
      "La lecture REST sert déjà `postReplyTo.deletedAt` : un membre hors ligne lira le retrait au prochain chargement. Écrit au site depuis #20019.",
  },
  'message:translation-shared': {
    kind: 'reload-serves-truth',
    emittedAt: 'routes/conversations/shared-translations.ts',
    because:
      "La ligne est RANGÉE avant la diffusion, et `GET …/shared-translations` la sert : ouvrir la conversation la retrouve. C'est déjà la raison pour laquelle la branche `unknown` de l'audience se TAIT au lieu de diffuser à la room.",
  },
  'message:countdown-started': {
    kind: 'reload-serves-truth',
    emittedAt: 'socketio/ephemeralCountdownAnnouncer.ts',
    because:
      "L'échéance est DURABLE, l'annonce ne l'est pas : les autres appareils du destinataire l'apprennent à leur prochain `GET …/messages`, qui sert `expiresAt` par lecteur.",
  },
  'attachment:ready': {
    kind: 'reload-serves-truth',
    emittedAt: 'services/attachments/media-processing/ready-notifier.ts',
    because:
      "`processingState` est persisté sur la LIGNE : le prochain chargement le sert. C'est déjà ce que dit le `catch` du relais — la réponse y était, énoncée pour un échec de notification et jamais pour l'absence de file.",
  },
  'attachment-status:updated': {
    kind: 'reload-serves-truth',
    emittedAt: 'routes/messages-writes.ts',
    because:
      "`getAttachmentStatuses` sert `lastPlayPositionMs` par participant, exclusions `showReadReceipts` appliquées ; et le web n'ENREGISTRE rien de l'événement — il invalide `attachmentStatusDetailsQueryKey`, les deux requêtes de `message-receipts-sheet.tsx` étant en `staleTime: 0`. Toute ouverture de la feuille refait la requête, et un témoin WEB le tient (#20148) : `message-receipts-sheet.test.tsx`, « ouvrir la feuille REFAIT la requête ». Sans lui, ce verdict pouvait devenir faux en silence par une optimisation de cache.",
  },
  'message:pending-delivered': {
    kind: 'cannot-be-queued',
    emittedAt: 'socketio/MeeshySocketIOManager.ts',
    because:
      "Elle EST l'annonce que le drain a livré. L'enfiler dans la file que le drain vide n'a pas de sens : son contenu est l'acte de remise, pas un état que le serveur garde.",
  },
} as const satisfies Record<UnqueuedFamily, UnqueuedVerdict>;
