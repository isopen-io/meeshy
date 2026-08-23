# Cycle 106 — la file rejoint le contrat : ce qu'on ENFILE est tenu à ce qu'on ÉMET

**Date** : 2026-08-23
**Branche** : `claude/keen-hamilton-qqnnp5`
**Prédécesseur** : cycle 105 (PR #3370) — un cast est une porte, et `_seq`
n'était déclaré nulle part

---

## Le point de départ

Le suivi nommé par les cycles 104 et 105, dans les mêmes termes deux fois :

> La charge REJOUÉE n'est pas vérifiée contre la charge ÉMISE.
> `QueuedMessagePayload.payload` est un `Record<string, unknown>` unique pour
> onze `eventType`. C'est le seul endroit où un rejeu hors ligne peut diverger
> en silence de la diffusion directe.

« En silence » est le mot juste, et c'est ce qui rendait ce suivi le plus urgent
des quatre : le seul témoin d'une divergence entre l'émission directe et le
rejeu est un destinataire qui était **hors ligne au mauvais moment**,
c'est-à-dire personne.

---

## Ce qui a été fait

### Une table, et le contrat qui en découle

`queuedEventContract.ts` porte **la** correspondance `eventType` de file →
événement serveur. Elle vivait dans une chaîne de onze `if`
(`_drainedEventName`), la forme sous laquelle une règle se met à diverger : rien
n'y oblige à traiter un `eventType` neuf, et le repli final
(`return MESSAGE_NEW`) l'aurait rejoué sous le mauvais nom, sans bruit.

Le `satisfies Record<QueuedEventType, ServerEventName>` la rend **totale au
compilateur**. De la table se dérive `QueuedPayloadFor<T>`, et de là un
`QueuedEventVariant` corrélé : la charge qu'on ENFILE est désormais tenue à la
forme que le contrat associe à l'événement qu'on REJOUERA.

### La corrélation devait remonter SIX étages

Typer la file n'a rien gardé tant que les relais au-dessus déclaraient encore un
`eventType` en union ET un `payload: Record<string, unknown>` — deux unions
indépendantes de plus, à chaque étage, et le contrat se perdait donc **avant**
d'atteindre la file :

| relais | ce qu'il déclarait |
|---|---|
| `MessageMutationManager.enqueueOfflineMessageMutation` | `'edited' \| 'deleted'` + sac de clés |
| `MeeshySocketIOManager.enqueueOfflineMessageMutation` | 4 types + sac de clés |
| `MeeshySocketIOManager.enqueueOfflineLinkMessage` | sac de clés |
| `LinkMessageManager.enqueueOfflineLinkMessage` | sac de clés |
| `ReactionOfflineQueueParams` | 2 types + sac de clés |
| `MessageHandler._enqueueOfflineEventForParticipants` | 2 types + sac de clés |
| `AttachmentReactionHandler._enqueueOfflineAttachmentReactionEvent` | 2 types + sac de clés |

> **Gouverner une frontière ne sert à rien tant que ses relais ne la relaient
> pas.** C'est la même leçon que le cycle 98 sur la symétrie de X3DH : « un
> correctif prouvé à une couche peut être défait par la couche qui le consomme »
> — ici, par les sept couches qui l'alimentent.

### Cinq doubles casts de plus

`editedPayload as unknown as Record<string, unknown>`,
`updateEvent as unknown as …` (×3), `translationData as unknown as …`. Toujours
la même marque, toujours au même endroit : là où un objet de contrat doit
franchir une frontière qui n'en veut pas.

---

## Une erreur commise, mesurée, et transformée en cliquet

En écrivant la table, j'ai mappé `'link-message'` vers `MESSAGE_NEW`. C'est
faux, et de la façon la plus discrète possible : ce type rejoue **deux**
événements, et ce que la file STOCKE est l'ENVELOPPE `{ message }`
(`LinkMessageNewEventData`), pas le message nu. Mapper vers `MESSAGE_NEW` typait
la charge enfilée **un cran trop bas** — un appelant qui aurait enfilé le
message nu aurait compilé, pour produire un rejeu non routable (pas de
`conversationId` au premier niveau, donc jeté par les clients mobiles).

Le compilateur l'a signalé au premier branchement de `broadcastLinkMessage`.
L'assertion `_LinkMessageStoresTheEnvelope` gèle désormais ce point précis.

> **Une erreur qu'on commet en écrivant un cliquet est le meilleur cas de test
> qu'il aura jamais** : elle est exactement ce que le prochain refera.

---

## Ce que le lot n'a PAS trouvé, et pourquoi c'est le résultat

**Aucun écrivain n'enfilait une charge divergente.** Les huit passent au contrat
sans une correction de valeur, et **aucune fixture de test n'est tombée** — ce
qui, sur un lot qui resserre un type, est la mesure elle-même : les doubles
portaient déjà des charges de la bonne forme.

Piège armé, pas panne. Et la distinction est mesurée, pas supposée : c'est la
troisième fois de suite (104, 105, 106) qu'un canal non gouverné se révèle
correct en valeur, et le dire chaque fois est ce qui rendra crédible le cycle
où il ne le sera pas.

---

## Ce qui reste une AFFIRMATION, et le restera

Le typage borne ce qu'on **écrit**, pas ce qu'on **relit**. Que l'octet sorti de
Redis soit bien celui qu'on y a mis reste une affirmation, faute de validation à
l'exécution — et `_drainedEmissions` la porte explicitement, en un `as` nommé.
La différence avec avant tient en une phrase : **l'affirmation ne couvre plus
que la persistance, là où elle couvrait aussi la construction.**

---

## Les cliquets

- **Exhaustivité** : `satisfies` — retirer un `eventType` de la table ne compile
  plus.
- **Justesse** : cinq assertions d'assignabilité, ancrées sur les
  correspondances dont une inversion serait SILENCIEUSE parce que les deux
  charges se ressemblent (les deux réactions, `new`/`edited`, l'enveloppe du
  lien). Une table peut être totale et dire faux ; `satisfies` ne voit que la
  première moitié.

**RED prouvé sur trois mutations** :

| mutation | ce qui tombe |
|---|---|
| les deux réactions CROISÉES | 2 assertions |
| `'link-message'` → `MESSAGE_NEW` (l'erreur réellement commise) | 1 assertion |
| un `eventType` retiré de la table | l'exhaustivité `satisfies` |

---

## Gates

- `tsc --noEmit` passerelle : **0 erreur**
- suite complète passerelle : **836/836 suites, 19253/19253 témoins**
- 5 doubles casts retirés · 7 relais corrélés · une chaîne de onze `if`
  remplacée par une table exhaustive

---

## Suivis

- [ ] La lecture depuis Redis reste non validée à l'exécution. Un `zod.parse`
      par `eventType` au DRAIN transformerait la dernière affirmation en
      vérification — mais il coûte une validation par entrée rejouée sur le
      chemin de reconnexion, donc c'est une décision de PERFORMANCE avant d'être
      une décision de typage, et elle demande une mesure.
- [ ] `_seq` n'est déclaré que sur `NotificationEventData` (suivi du cycle 105).
- [ ] `ReactionUpdateEvent` / `ReactionUpdateEventData` : deux exemplaires
      structurellement identiques.
- [ ] `ConversationUpdatedEventData` porte une signature d'index ;
      `lastMessagePreview` y voyage sans contrat.
- [ ] **Le miroir client→serveur n'est toujours pas gouverné** — trois cycles
      que ce suivi est reporté, et il est désormais le plus gros restant :
      `ClientToServerEvents` n'a aucun équivalent de `serverEmit.ts`, et
      `socket.on(...)` reste libre de déclarer la forme qu'il veut de ce qu'il
      REÇOIT. C'est la moitié HOSTILE du contrat.
