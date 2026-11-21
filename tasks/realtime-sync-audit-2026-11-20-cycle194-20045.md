## Cycle 194 — les familles temps réel hors file répondent par ÉCRIT, et un cliquet force la septième (#20045)

**Date** : 2026-11-20. **Base** : `dev` à `35d0c27733`. **Issue** : #20045.

### Le point de départ, et ce que la mesure en a fait

#20019 avait fait entrer `attachment:deleted` dans la file de remise après avoir
constaté qu'il n'y en avait pas ; #20045 a généralisé la question —
**« qu'est-ce qu'un lecteur qui était absent voit à son retour : la vérité, ou
son cache ? »** — et énuméré CINQ familles à instruire, dont deux marquées
« personne ne l'a écrit ».

Les deux l'avaient écrit :

| famille | ce qui était déjà écrit |
|---|---|
| `message:translation-shared` | « la ligne est rangée, le `GET` la sert » (deux fois, dont la branche `unknown` de l'audience) |
| `message:countdown-started` | « l'échéance est durable, l'annonce ne l'est pas … leur prochain `GET …/messages` sert `expiresAt` par lecteur » |
| `attachment:ready` | la réponse était dans le `catch` (« le prochain chargement le servira »), donc énoncée pour un ÉCHEC et jamais pour l'absence de file |

Et elles sont **SIX**, pas cinq. En extrayant le bloc `SERVER_EVENTS` par
appariement d'accolades au lieu d'un grep sur le fichier : 157 événements
serveur, 22 de familles `message` / `attachment`, 16 dans `DRAINED_EVENT`. La
sixième — `message:pending-delivered` — manquait à l'énumération écrite à la
main, et elle est d'une TROISIÈME nature : non pas « une relecture sert la
vérité », mais **par construction non enfilable**, puisqu'elle EST l'annonce que
le drain a livré.

### La seule question réellement ouverte, mesurée

`attachment-status:updated` n'avait aucune réponse écrite. Chaîne complète :

- **écriture** : `markAudioAsListened` persiste `attachmentStatusEntry.lastPlayPositionMs` / `listenedComplete`, en position SERVIE monotone ;
- **lecture de soi** : `loadCurrentUserConsumptionMap` est filtrée `participantId: currentParticipantId` — la liste sert MA reprise, jamais celle des autres ;
- **lecture des autres** : `getAttachmentStatuses` sert `lastPlayPositionMs` par participant, exclusions `showReadReceipts` appliquées ;
- **web** : `socket.ts:480` n'enregistre rien, il INVALIDE `attachmentStatusDetailsQueryKey`, et les deux requêtes de `message-receipts-sheet.tsx` sont en `staleTime: 0`.

⇒ une relecture sert la vérité ; **aucune entrée de file à ajouter, nulle part**.
C'est le résultat du lot, pas un renoncement : ce qui sépare cette famille de
`attachment:deleted` n'est ni la famille ni son importance, c'est `staleTime`
(`Infinity` au fil web pour l'une, `0` dans la feuille pour l'autre).

### Le livrable

1. **`socketio/unqueuedFamilyVerdict.ts`** — la table des verdicts, en
   PRODUCTION pour que son exhaustivité tombe sous `tsc -p tsconfig.json` (le
   gate « Qualité TS ») et non sous le cliquet A, qui ne voit que les tests et
   porte un plafond. L'ensemble gardé est **calculé** :
   `Exclude<Extract<ServerEventName, 'message:…' | 'attachment:…'>, (typeof DRAINED_EVENT)[QueuedEventType]>`.
   Une septième famille ne compile pas sans sa réponse. Deux verdicts, parce que
   la distinction compte : `reload-serves-truth` est une MESURE datée qui peut
   cesser d'être vraie le jour où un `staleTime` change ; `cannot-be-queued` est
   une propriété de construction.
2. **`unqueued-family-verdict-sweep.test.ts`** — garde ce que le typage ne voit
   pas : le site cité EXISTE, et il ÉMET bien la famille qu'il justifie.
3. **La réponse écrite aux deux sites qui ne l'avaient pas nommée** :
   `ready-notifier.ts` (sortie du `catch`) et `routes/messages-writes.ts`.
4. **Une citation POURRIE corrigée** : `messages-writes.ts` justifiait sa garde
   de confidentialité par « le web les persiste en cache
   (`use-socket-cache-sync.ts`) » — fichier disparu du dépôt, et le web
   invalide au lieu de persister. La garde reste juste pour une raison plus
   simple, désormais écrite : le direct est le seul chemin qui ne repasse pas
   par `_attachmentReadReceiptOptOuts`. Leçon du jour.

### Le ROUGE, prouvé par mutation

| mutation | témoin rouge |
|---|---|
| une entrée retirée de la table | **`TS1360`** — « Property `"message:pending-delivered"` is missing » |
| `emittedAt` pointé sur `hooks/use-socket-cache-sync.ts` (l'incident lui-même) | « cite un site qui EXISTE » |
| `emittedAt` pointé sur un fichier qui existe mais n'émet pas | « cite un site qui ÉMET bien la famille qu'il justifie » |

Chaque mutation ne fait rougir qu'UN témoin : les quatre gardent des propriétés
disjointes.

### Faux positif écarté en chemin

`MESSAGE_CAPTURE_DETECTED` ressort d'un grep `(MESSAGE|ATTACHMENT)_X: '…'` sur
`event-names.ts`, mais elle est déclarée dans **`CLIENT_EVENTS`** : client →
serveur, jamais émise. Un grep à l'échelle du FICHIER mélange les deux tables ;
le relevé doit lire le BLOC. Même famille d'erreur que la popularité d'un idiome
mesurée à l'échelle du fichier.
