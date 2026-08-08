# Cycle 16 — Un message envoyé par lien de partage n'est jamais traduit, et ne remonte jamais sa conversation

## Constat

Le cycle 15 a fermé le trou de **diffusion** des deux routes de lien (`POST /links/:id/messages`
et `.../messages/auth`). Sa section « Reste ouvert » relevait, sans le traiter :

> Le chemin de lien ne déclenche aucune traduction (`prisma.message.create` direct, hors
> `MessagingService`) — un message anonyme n'entre donc pas dans le Prisme Linguistique.

Vérification faite, ce n'est pas un effet manquant mais **trois**. Les deux routes appellent
`prisma.message.create` puis diffusent, et c'est tout. Le chemin nominal
(`MessagingService.runPostSaveSideEffects`) en exécute quatre après le commit :

| Effet | Chemin nominal | Chemin lien |
|---|---|---|
| `conversation.lastMessageAt = now` | oui | **non** |
| `translationService.handleNewMessage(...)` | oui | **non** |
| `conversationStatsService.updateOnNewMessage(...)` | oui | **non** |
| `readStatusService.markMessagesAsRead(auteur, ...)` | oui | non (omission assumée, cf. Revue) |

## Diagnostic

### D1 — le Prisme Linguistique est éteint sur ce transport

Le principe produit fondamental veut que tout contenu soit consommé dans la langue
principale du lecteur. Un message envoyé par lien n'est jamais poussé au translator :
`Message.translations` reste vide **à vie**. Aucun rattrapage n'existe — la retraduction
n'est déclenchée que par une édition ou une demande explicite. Un participant qui lit
français voit donc indéfiniment en clair le message espagnol de l'anonyme assis à côté de
lui dans la même conversation.

C'est le transport d'envoi **primaire** d'un participant anonyme (le seul, en fait), et le
lien de partage est le cœur du produit. La conversation globale `meeshy` passe par le jumeau
authentifié.

### D2 — `lastMessageAt` périmé : le serveur contredit le client au refetch

`GET /conversations` trie par `lastMessageAt: 'desc'` (`routes/conversations/core.ts:465`)
et pagine par curseur sur ce même champ (`:362`, `lastMessageAt: { lt: cursor }`). Sans le
bump, une conversation dont tout le trafic récent arrive par lien reste enterrée à sa
position d'il y a trois jours.

Le détail qui rend le défaut visible plutôt que théorique : le docstring de
`broadcastLinkMessage` justifie l'absence de `conversation:updated` par le fait que « le
handler web `handleLinkMessageNew` remonte lui-même la conversation en tête de liste depuis
cet événement ». Le client remonte donc bien la conversation — **et le prochain refetch la
redescend**, puisque le serveur n'a jamais enregistré le bump. L'optimisation du cycle 15
était juste ; c'est la donnée sous-jacente qui manquait.

### D3 (racine) — pourquoi trois effets d'un coup, et pourquoi ils ont tenu invisibles

`runPostSaveSideEffects` est `private`. Exactement la configuration que les cycles 14 et 15
ont chacun documentée : une obligation PRODUIT enfermée dans une méthode privée n'est
honorable que par les appelants de sa classe. Les deux routes de lien contournent la classe
entière — elles ne pouvaient donc pas, par construction, honorer une seule de ces quatre
obligations. Le cycle 15 a corrigé la cinquième (la file hors ligne) en extrayant un
diffuseur unique ; les trois qui restaient sont le même défaut, sous le même privé.

L'énumération du cycle 15 était « qui ÉCRIT dans cette conversation ». La bonne clé ici est
la suivante : **qu'est-ce que TOUT message committé doit à sa conversation, quel que soit le
tuyau par lequel il est arrivé ?**

## Plan
- [x] T1 — RED : unité partagée `runMessagePostSaveEffects` (bump, traduction, stats, isolation des pannes)
- [x] T2 — RED : route anonyme — bump + push traduction (contenu STOCKÉ, langue NORMALISÉE)
- [x] T3 — RED : route authentifiée — mêmes deux assertions
- [x] T4 — RED : une panne d'effet ne dégrade pas le 201 ; service de traduction absent toléré
- [x] T5 — GREEN : `services/messaging/messagePostSaveEffects.ts`, appelé par les 2 routes
- [x] T6 — `MessagingService.runPostSaveSideEffects` délègue à la même unité
- [x] T7 — gates : suite gateway complète + `tsc --noEmit`
- [x] T8 — changeset + CHANGELOG + lessons
- [x] T9 — PR, CI vert, merge sur main

## Revue

### L'unité porte trois effets sur quatre, et le quatrième est une omission argumentée

`markMessagesAsRead(auteur, ...)` reste dans `MessagingService`. Deux raisons, toutes deux
vérifiées plutôt que supposées :

1. **Aucun défaut observable à corriger.** Le décompte de non-lus exclut déjà les messages
   dont on est l'auteur (`senderId: { not: participantId }`, `MessageReadStatusService.ts:295`,
   `:1154`, `:1239`). Avancer le curseur de l'auteur n'enlève donc aucun badge — c'est une
   redondance avec le mark-read que le client émet à l'affichage, pas une garantie manquante.
2. **La route authentifiée n'a pas toujours un vrai participant.** Pour la conversation
   globale `meeshy`, elle retombe sur `participant = { id: userId }` (messages.ts:453) —
   un id d'utilisateur, pas de `Participant`. `markMessagesAsRead` upsert un
   `ConversationReadCursor` sur `conversation_participant_cursor` : appelé là, il créerait
   une ligne de curseur orpheline sous un id qui n'est participant de rien.

Cette omission est écrite dans le docstring de l'unité **et** dans celui de
`runPostSaveSideEffects`, pour qu'un lecteur ne prenne pas l'absence pour l'oubli auquel
elle ressemble (troisième cycle consécutif où cette phrase est ce qui empêche la
« correction » suivante d'être une régression).

### Ce qui est poussé au translator est ce qui est STOCKÉ, pas ce qui a été reçu

Les deux routes réécrivent les URLs du corps (`trackingLinkService.processMessageLinks`)
avant l'insert : c'est `processedContent` qui est persisté. Pousser `body.content` au
translator aurait traduit un texte que personne ne verra jamais, et rangé le résultat sous
la clé du message — donc des traductions désalignées de leur original. Même argument pour
`originalLanguage` : la valeur normalisée (`fr-FR` → `fr`) est celle qui est persistée, et
c'est la seule qui donne le bon `LANGUAGE_MAPPINGS` côté NLLB. Deux tests verrouillent
chacun des deux points, parce qu'ils sont invisibles à la lecture du site d'appel.

### L'extraction créait un littéral jumeau — supprimé dans la foulée

Avant ce cycle, la charge utile envoyée au translator n'existait qu'à UN endroit
(`MessagingService.queueTranslation`). L'unité partagée en aurait ajouté un second, et
`queueTranslation` reste nécessaire pour la re-poussée d'un doublon dont le blob
`translations` est vide (translator down au premier insert) : deux littéraux qui doivent
rester synchrones, soit exactement la classe de divergence que ce cycle corrige. Les deux
appellent donc `queueMessageTranslation`, exportée par la même unité. Un correctif qui
laisse derrière lui la forme du défaut qu'il corrige n'en est pas un.

### Fire-and-forget, par parité et non par négligence

L'unité ne rend rien et n'attend rien, comme `runPostSaveSideEffects` : les trois effets
sont hors du chemin de l'ACK. Un `await` sur le bump ajouterait une écriture Mongo à la
latence du 201 pour une donnée qu'aucun client ne relit dans la seconde. Chaque effet porte
son propre `.catch` — une panne de translator ne doit pas empêcher le bump, ni l'inverse, et
aucune ne doit transformer un envoi réussi en 500. C'est aussi ce qui rend l'unité sûre à
appeler depuis une route.

### Reste ouvert après ce cycle
- Le chemin de lien ne pousse toujours pas `conversation:unread-updated` (hérité du cycle 15) :
  le compteur est dérivé de curseurs, donc juste au refetch, mais aucun push live ne
  l'actualise pour les pairs.
- Aucun client iOS n'écoute `link:message:new` — les conversations par lien restent une
  fonctionnalité web.
- Les pièces jointes du chemin de lien (`messageType` non-`text`) n'entrent pas dans le
  pipeline audio (transcription/TTS) : `MessageProcessor.handleAttachments` n'est pas
  atteignable depuis ces routes, qui ne reçoivent d'ailleurs pas d'`attachmentIds`.
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
