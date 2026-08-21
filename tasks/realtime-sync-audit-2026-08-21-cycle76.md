# Cycle 76 — un message rendu à ma vue ne revenait que sur iOS, et par hasard

**Date** : 2026-08-21
**Branche** : `claude/keen-hamilton-rhm97u`
**Périmètre** :
- SDK (`Sockets/MessageSocketManager.swift` — type d'événement, publisher,
  abonnement)
- iOS app (`ViewModels/ConversationSocketHandler.swift` — récepteur neuf ;
  `ViewModels/ConversationViewModel.swift` — la relecture)
- tests (SDK `MessageSocketMiscEventTests`, app `ConversationSocketHandlerTests`,
  deux mocks)

**Clients touchés** : aucun nom d'événement neuf, aucune charge utile modifiée,
**aucune ligne de serveur**. Un événement DÉJÀ émis par le gateway et DÉJÀ
consommé par le web reçoit le récepteur qui manquait à iOS.

---

## 1. D'où vient ce cycle

Le cycle 75 s'est clos sur une leçon écrite en toutes lettres dans
`tasks/lessons.md` :

> **pour tout événement serveur→client du contrat partagé, la question « qui
> l'ÉMET ? » se pose séparément de « qui l'écoute ? », et un `grep` du nom
> d'événement dans les services répond en dix secondes.**

Le cycle 75 avait trouvé le cas *émetteur manquant* : `call:force-leave`,
déclaré, testé, entièrement implémenté côté iOS — et jamais émis.

Ce cycle exploite **l'autre moitié de la même question**, celle que la leçon
pose sans l'avoir encore instrumentée : un événement bel et bien ÉMIS, et un
client qui ne l'écoute pas. La leçon disait qu'un `grep` suffit ; ce cycle a
commencé par écrire ce `grep` une fois pour toutes.

### L'instrument (§ 5) et ce qu'il a sorti

Une matrice `SERVER_EVENTS` × {gateway, web, iOS, Android}, construite en
cherchant CHAQUE événement sous ses deux formes — le littéral
(`'message:restored-for-me'`) **et** la clé de constante
(`MESSAGE_RESTORED_FOR_ME`). Les deux formes sont indispensables : une première
passe ne cherchant que le littéral a rendu 40 « trous » dont la grande majorité
étaient faux (le web s'abonne via `SERVER_EVENTS.X`, jamais via la chaîne).
Une matrice qui sur-signale ne vaut pas mieux qu'aucune matrice.

Sur les 124 événements du contrat, un couple a sauté aux yeux :

| événement | gateway | web | iOS | Android |
|---|---|---|---|---|
| `message:hidden-for-me` | émet | écoute | **écoute** | absent |
| `message:restored-for-me` | émet | écoute | **RIEN** | absent |

Un verbe et son inverse, séparés par le même mur, sur le même client. C'est
l'asymétrie qui est le défaut : personne n'implémente à moitié une paire
volontairement.

---

## 2. Le défaut

### 2.1 Le masquage PURGE — c'est ce qui rend le retour non trivial

`message:hidden-for-me` est honoré par iOS depuis un cycle antérieur, et son
écriture locale est délibérément une **purge**, pas une pierre tombale :

```swift
try await persistence.purgeMessages(ids: hiddenIds)
```

Le commentaire en place explique pourquoi : le message reste vivant pour les
autres participants, et une tombstone « ce message a été supprimé » resterait
affichée à vie puisque le serveur ne renverra plus jamais ce message à ce
lecteur.

**Conséquence directe et non évidente : après un masquage, l'appareil ne
détient plus RIEN.** Ni contenu, ni ligne GRDB, ni entrée de cache.

### 2.2 La charge utile ne porte qu'une adresse, et c'est délibéré

Le contrat partagé l'écrit lui-même :

> The payload deliberately carries no message body. An APPEARANCE cannot be
> expressed as a tombstone: a client that dropped the bubble no longer holds
> the content, so the only honest instruction is "refetch this conversation".

`MessageRestoredForMeEventData` ne porte donc que `{ messageId, conversationId }`.

Les deux faits se combinent en une contrainte : **le retour en vue ne peut pas
s'écrire localement.** Il exige un aller-retour serveur. C'est très
probablement la raison pour laquelle le récepteur iOS n'a jamais été écrit —
son jumeau était un one-liner de purge, celui-ci ne l'est pas.

### 2.3 Ce que ça coûtait

Le web restaure (c'est la seule surface qui expose le geste : **iOS n'a aucun
appelant de `restore-for-me`**, vérifié — le défaut est purement en réception).
Sur l'iPhone du même utilisateur, au même instant : rien.

Et la récupération était laissée au hasard :

| moment | le message revient-il ? |
|---|---|
| fil ouvert, en direct | **non** — c'est précisément ce que l'événement existe pour faire |
| réouverture du fil | seulement s'il tombe dans la page la plus récente |
| défilement arrière | oui, si le lecteur repasse par cette région (le REST `listBefore` re-couvre la page et l'upsert le repose) |
| fil qu'on ne remonte jamais | **jamais** |

Ce n'est donc pas « perdu à vie » — c'est pire à décrire et aussi mauvais à
vivre : **un retour dont la date dépend d'un geste de défilement sans rapport.**
Un message masqué l'a été quelque part dans l'historique ; la région où il
dort est arbitrairement loin. L'événement existe exactement pour que ce retour
ne soit pas remis au hasard.

### 2.4 Le piège qui attendait la correction naïve

`ConversationSocketDelegate` expose déjà un verbe qui *ressemble* à la solution :

```swift
func syncMissedMessages() async
```

Il est faux ici, et silencieusement :

```swift
guard let newestLocal = SyncWatermark.newest(among: messages) else { return }
let response = try await messageService.listAfter(conversationId:, after: cursor, …)
```

C'est un backfill **strictement en avant**. Un message rendu est presque
toujours **plus VIEUX** que le dernier message détenu. Le router par là aurait
produit un no-op parfaitement vert : aucune erreur, aucun log, aucun test rouge
— et aucun message rendu. C'est la raison pour laquelle le nouveau verbe est
distinct, et pourquoi sa docstring commence par dire ce qu'il n'est PAS.

---

## 3. Le remède

### 3.1 SDK — le canal jumeau

`MessageRestoredForMeEvent` (miroir exact de `MessageHiddenForMeEvent`,
`restoredAt` optionnel pour la même raison : il n'arbitre rien, et son absence
ne doit pas faire perdre le retour), le publisher au protocole
`MessageSocketProviding`, et l'abonnement `socket.on("message:restored-for-me")`.

La room est celle de l'UTILISATEUR : l'appareil émetteur reçoit l'événement lui
aussi. Sans conséquence — la relecture est idempotente.

### 3.2 App — la relecture, et ses trois refus

`ConversationSocketHandler` filtre le lot sur SA conversation (même découpage
que le masquage : un lot peut nommer plusieurs fils) et remet les adresses au
délégué. `ConversationViewModel.restoreMessagesForMe(ids:)` relit.

Trois décisions, chacune un refus d'une option plus simple :

| refus | pourquoi |
|---|---|
| **pas d'écriture locale** | le masquage a purgé ; il n'y a rien à ressusciter, et l'événement ne porte pas de contenu |
| **`listAround`, pas `listAfter`** | § 2.4 — le watermark ne remonte jamais le temps |
| **pas de `loadWindow`** | le geste vient d'un AUTRE appareil : il ne doit pas déplacer le regard de celui-ci |

Ce dernier point est la raison pour laquelle la correction n'appelle pas
`jumpToQuotedMessage`, qui fait par ailleurs exactement le bon aller-retour :
il **recentre la fenêtre** sur sa cible. Légitime pour un tap volontaire sur
une citation ; une régression pour un événement distant, qui arracherait le
lecteur à l'endroit où il lit.

L'upsert suffit, et c'est une propriété du store, pas une chance : chaque
écriture de `MessagePersistenceActor` poste `.messageStoreShouldRefresh`, et
`MessageStore` relit sa fenêtre courante. Si le message rendu y tombe, la bulle
réapparaît à sa place chronologique ; sinon elle attend en cache, sans
aller-retour de plus, que le lecteur remonte jusqu'à elle.

### 3.3 Le lot se replie sur lui-même

La route unitaire n'émet aujourd'hui qu'UNE adresse (vérifié :
`restoreMessageForUser` construit `messages: [{…}]`, et la route de
restauration de CONVERSATION restaure des préférences, pas des messages — elle
n'émet pas cet événement). Mais le gabarit est une liste, comme pour le
masquage dont la route en lot en accepte cent.

`listAround` ramenant une FENÊTRE et non un message isolé, une adresse déjà
couverte par une fenêtre précédente n'a rien à redemander. Le lot se replie sur
le nombre de fenêtres réellement distinctes — au lieu de facturer un
aller-retour par id si une restauration en lot voit le jour.

Chaque adresse reste traitée indépendamment : une relecture qui échoue (réseau,
message devenu inaccessible) n'emporte pas ses voisines.

---

## 4. Ce que ce cycle NE change PAS

- **Aucune ligne de serveur.** Le gateway émettait déjà correctement, dans le
  bon ordre (la ligne `UserMessageDeletion` est supprimée AVANT la diffusion —
  la relecture déclenchée par l'événement ne peut donc pas être re-filtrée).
- **Aucune ligne de web.** Il honorait déjà les deux sens.
- **Android reste hors du sujet, et c'est un constat, pas un oubli** : il n'a
  NI `hidden-for-me` NI `restored-for-me`. Tout le canal de visibilité
  personnelle y est absent. Y ajouter le retour seul n'aurait aucun sens —
  il n'y a rien qui masque. Déposé en § 6.

---

## 5. L'instrument, réutilisable

La matrice de couverture du contrat, telle qu'exécutée (Python + `rg`) :

1. extraire les paires `(CLÉ, littéral)` du bloc `SERVER_EVENTS` de
   `packages/shared/types/socketio-events.ts` ;
2. pour chaque événement, chercher **le littéral ET la clé** dans chacun des
   quatre corpus (`services/gateway/src`, `apps/web`,
   `apps/ios/Meeshy` + `packages/MeeshySDK/Sources`, `apps/android`), en
   excluant les répertoires de tests (sinon un test qui cite le nom fait
   passer un client pour abonné) ;
3. signaler `gw == 0` (personne n'émet — le cas du cycle 75) et
   `client == 0` avec `gw > 0` (personne n'écoute — le cas de ce cycle).

**Les deux formes de recherche sont obligatoires.** Le web s'abonne
exclusivement par la constante ; ne chercher que le littéral l'a fait passer
pour muet sur des événements qu'il honore parfaitement, y compris celui-ci.

**Un `0` n'est pas un défaut, c'est une question.** Beaucoup sont légitimes
(fonction absente d'une plateforme, `heartbeat:ack` que le web n'a pas besoin
d'écouter). Ce qui fait un défaut, c'est ce qu'a montré la ligne retenue : **un
verbe présent et son inverse absent, sur le même client.** L'asymétrie est le
signal ; le zéro seul ne l'est pas.

---

## 6. Pistes laissées ouvertes

1. **Android n'a aucun canal de visibilité personnelle** — ni masquage, ni
   retour. C'est le chantier entier, pas ce correctif : le masquage d'abord
   (avec sa purge locale), le retour ensuite. À déposer comme cycle propre.
2. **`attachment:reaction-added` / `attachment:reaction-removed` : émis par le
   gateway, honorés par iOS, aucun récepteur web.** Même forme de défaut que
   celui-ci, sur une paire cette fois entièrement absente d'un client — à
   qualifier (le web expose-t-il seulement les réactions par pièce jointe ?)
   avant de conclure.
3. **`SDK Tests` était rouge sur `main` depuis le 2026-08-20**
   (`StoryTextStyle.allCases` passé à 18, garde restée à 11). **Déjà corrigé
   sur `main`** ; la suite n'avait simplement pas été rejouée, faute de commit
   touchant `packages/MeeshySDK/**`. Ce cycle en touche — le rouge doit donc
   tomber de lui-même sur cette PR. Aucune action prise ; à vérifier sur le
   run, et à traiter s'il persistait.
4. **Le relais `call:signal` ne relit toujours pas l'appartenance au fil**
   (piste 1 du cycle 75). Vérifié en passant : la formulation de cette piste
   était trop large — `call:join` VÉRIFIE bien l'appartenance
   (`resolveParticipantIdFromCall` → `isActive: true`). Ce qui reste ouvert est
   plus étroit : la défense en profondeur sur le RELAIS lui-même, qui
   s'autorise sur `CallParticipant.leftAt` seul. Le cycle 75 a fermé le chemin
   par lequel un exclu y restait ; la garde de second rideau reste à poser, et
   elle coûterait une lecture d'appartenance sur un hot-path délibérément
   caché (rafales ICE). À arbitrer, pas à appliquer par réflexe.
