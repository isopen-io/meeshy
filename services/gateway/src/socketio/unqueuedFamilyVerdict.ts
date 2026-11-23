import type { ServerEventName } from './serverEmit';
import { DRAINED_EVENT, type QueuedEventType } from './queuedEventContract';

/** Ce que la file sait rejouer — la table de `queuedEventContract`, lue comme un ensemble. */
type QueuedEventName = (typeof DRAINED_EVENT)[QueuedEventType];

/**
 * Le préfixe d'un nom d'événement, jusqu'au PREMIER deux-points.
 *
 * `'link:message:new'` rend `'link:'` et non `'link:message:'`, et c'est le bon
 * grain : c'est ainsi que `SERVER_EVENTS` range ses domaines, et le dépôt n'a
 * qu'UN événement serveur sous `link:` (mesuré).
 */
type PrefixOf<T extends string> = T extends `${infer P}:${string}` ? `${P}:` : never;

/**
 * **LES PRÉFIXES QUE LA FILE TOUCHE, DÉRIVÉS DE LA FILE ELLE-MÊME** (#20353).
 *
 * Ce type était une ÉNUMÉRATION écrite à la main — `message:` / `attachment:` /
 * `attachment-status:` — et sa seconde affirmation (« ce sont les seules
 * familles où la question se pose ») n'avait aucun moyen d'être vérifiée
 * (leçon 261). Mesuré au cycle 220, elle était **fausse dans les deux sens** :
 * il manquait `reaction:` et `link:`, que `DRAINED_EVENT` rejoue, et
 * `attachment-status:` y figurait alors que la file n'y touche à RIEN.
 *
 * Le remède n'est pas de corriger la liste — « corriger une énumération ne lui
 * donne aucun moyen de rester vraie » — mais de la DÉRIVER : les prefixes
 * viennent désormais des valeurs de `DRAINED_EVENT`, si bien qu'une famille
 * neuve posée dans un préfixe que la file touche déjà ne peut plus échapper au
 * `satisfies` ci-dessous.
 *
 * **L'élargissement n'a coûté AUCUNE entrée**, et c'est ce qui le rend bon
 * marché : sous `reaction:` les deux seuls événements serveur
 * (`reaction:added`, `reaction:removed`) sont enfilés, et sous `link:` le seul
 * (`link:message:new`) l'est aussi — `Exclude` y rend `never`. Le gain est de
 * STRUCTURE, pas de couverture immédiate.
 */
type QueueTouchedPrefix = PrefixOf<QueuedEventName>;

/**
 * Le seul préfixe de la portée que la file ne touche PAS, et il est DÉCLARÉ
 * avec sa raison plutôt que glissé dans une liste.
 *
 * `attachment-status:` ne porte qu'un événement (`attachment-status:updated`) et
 * la file n'en rejoue aucun : il n'entre par aucune dérivation. Il appartient
 * pourtant à la question — c'est la progression de lecture d'un média, une
 * vérité que le serveur GARDE — donc il reste dans la portée, par décision.
 *
 * Un second extra se déclare ici, avec sa raison. Il ne s'en déduit aucun.
 */
type DeclaredExtraPrefix = 'attachment-status:';

/** Les familles émises sous ces prefixes, file comprise. */
type EventInScope = Extract<ServerEventName, `${QueueTouchedPrefix | DeclaredExtraPrefix}${string}`>;

/**
 * Les familles émises que la file ne rejoue PAS. Calculé, jamais énuméré : une
 * famille neuve y entre sans que personne ne l'ajoute — et depuis #20353, la
 * PORTÉE elle-même est calculée, de sorte qu'un préfixe neuf de la file y entre
 * sans que personne ne l'ajoute non plus.
 */
export type UnqueuedFamily = Exclude<EventInScope, QueuedEventName>;

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

/* ------------------------------------------------------------------------- *
 * LE CLIQUET DE LA PORTÉE — au TYPE, comme celui de `queuedEventContract.ts`.
 *
 * `satisfies` garde que la table est TOTALE sur la portée. Il ne garde pas que
 * la PORTÉE soit la bonne : c'est l'affirmation qu'une énumération écrite à la
 * main ne peut pas porter, et celle par laquelle #20349 est passé.
 *
 * Les assertions ci-dessous ancrent ce que la dérivation PROMET. Elles ne
 * coûtent aucune ligne exécutable et vivent dans le fichier de PRODUCTION,
 * pour tomber sous `tsc -p tsconfig.json` (le gate « Qualité TS ») plutôt que
 * sous un témoin, que `tsconfig.json` EXCLUT.
 * ------------------------------------------------------------------------- */

type AssertScope<T extends true> = T;

/**
 * **Tout événement que la file rejoue est DANS la portée.** C'est la propriété
 * centrale : si un `eventType` neuf rejoue un événement d'un préfixe inconnu,
 * ses familles sœurs non enfilées entrent automatiquement dans la table — et le
 * `satisfies` exige alors leur réponse. Sans cette assertion, rien ne dirait
 * que `PrefixOf` extrait bien le grain par lequel `ServerEventName` se range.
 */
type _EveryQueuedEventIsInScope = AssertScope<QueuedEventName extends EventInScope ? true : false>;

/**
 * **La portée ne contient que des noms d'événements RÉELS.** Un préfixe mal
 * extrait (`'link:message:'` au lieu de `'link:'`, ou un `PrefixOf` qui rendrait
 * `never`) rétrécirait la portée en silence, et la table resterait verte sur un
 * ensemble vide — exactement le défaut d'une garde négative dont le relevé rend
 * `[]`.
 */
type _ScopeIsNotEmpty = AssertScope<[EventInScope] extends [never] ? false : true>;

/**
 * **La portée contient les SIX familles que la table répond**, nommées une à
 * une. C'est l'ancre qui ferait tomber la dérivation si elle se rétrécissait
 * sans que personne ne retire d'entrée : `satisfies` accepte une table plus
 * LARGE que sa portée sans broncher, donc lui seul ne verrait pas le
 * rétrécissement.
 */
type _KnownFamiliesStayInScope = AssertScope<
  | 'message:cited-post-withdrawn'
  | 'message:translation-shared'
  | 'message:countdown-started'
  | 'message:pending-delivered'
  | 'attachment:ready'
  | 'attachment-status:updated' extends UnqueuedFamily
    ? true
    : false
>;

/**
 * **Les prefixes que la file touche sont bien ceux qu'on croit.** Mesuré au
 * cycle 220 : `message:`, `attachment:`, `reaction:` et `link:`. L'ancre est
 * là pour qu'un `eventType` retiré de la file — donc un préfixe qui sort de la
 * dérivation — soit un changement VISIBLE et non un rétrécissement muet de la
 * portée.
 */
type _QueueTouchesTheFourMeasuredPrefixes = AssertScope<
  'message:' | 'attachment:' | 'reaction:' | 'link:' extends QueueTouchedPrefix ? true : false
>;

export type UnqueuedFamilyScopeRatchet = [
  _EveryQueuedEventIsInScope,
  _ScopeIsNotEmpty,
  _KnownFamiliesStayInScope,
  _QueueTouchesTheFourMeasuredPrefixes,
];
