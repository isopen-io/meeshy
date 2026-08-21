# Cycle 76 — Android écoutait deux canaux que personne ne prononce

**Date** : 2026-08-21
**Branche** : `claude/keen-hamilton-od92vt`
**Périmètre** :
- android (`sdk-core/.../socket/MessageSocketManager.kt`,
  `core/model/.../SocketEvents.kt`, `feature/chat/.../ChatViewModel.kt`)
- shared (`__tests__/ci/socket-event-name-gate.test.ts` — garde neuve)

**Clients touchés** : Android seul. Aucun nom d'événement neuf, aucune charge
utile modifiée, aucune ligne de passerelle. Deux abonnements Android sont
reconnectés au nom que la passerelle émet DÉJÀ, et un modèle de charge utile est
réaligné sur la forme qu'elle envoie DÉJÀ.

---

## 1. D'où vient ce cycle

Le cycle 75 s'est terminé sur une leçon déposée mot pour mot :

> Pour tout événement serveur→client du contrat partagé, la question « qui
> l'ÉMET ? » se pose séparément de « qui l'écoute ? », et un `grep` du nom
> d'événement dans les services répond en dix secondes.

Ce cycle a commencé par exécuter cette phrase mécaniquement : pour chacun des
124 événements serveur du contrat, compter les sites d'émission dans la
passerelle et les sites d'écoute chez les trois clients. La matrice a rendu son
verdict en une passe — mais pas celui qu'on cherchait.

Le cycle 75 avait trouvé **un récepteur sans émetteur**. Le cycle 76 a trouvé le
défaut **symétrique**, et deux exemplaires : **un récepteur branché sur un nom
que rien n'émet parce que ce nom n'existe pas.**

---

## 2. Le défaut

### 2.1 Deux chaînes de caractères

```kotlin
// apps/android/sdk-core/.../MessageSocketManager.kt, fun attach()
listen("message:updated", _messageUpdated)
listen("transcription:ready", _transcriptionReady)
```

| Android s'abonnait à | la passerelle émet | ce qui n'arrivait jamais |
|---|---|---|
| `message:updated` | `message:edited` | **l'édition d'un message** |
| `transcription:ready` | `audio:transcription-ready` | **la transcription d'une note vocale** |

Ni `message:updated` ni `transcription:ready` n'existent **nulle part ailleurs
dans le dépôt** — vérifié, pas déduit : un `grep` de chaque nom sur `apps/`,
`services/` et `packages/`, toutes extensions, ne rend QUE ces deux lignes.
Absents du contrat partagé, absents de la passerelle, absents de iOS, absents du
web.

### 2.2 Pourquoi personne ne pouvait s'en apercevoir

**Un abonnement Socket.IO à un nom que personne ne prononce ne rend aucune
erreur.** Il ne lève pas, ne journalise pas, ne se plaint pas au branchement :
il se tait pour toujours. C'est la même forme de silence que le cycle 75 — un
contrat sans émetteur — vue depuis l'autre bout du fil.

Et tout le reste de la chaîne était JUSTE. Le flow existe, le collecteur du
`ChatViewModel` l'écoute, le dépôt applique la mise à jour :

```kotlin
messageSocketManager.messageUpdated.collect { event ->
    if (event.conversationId == conversationId) messageRepository.refresh(conversationId)
}
```

C'est exactement l'indice trompeur que la leçon du cycle 75 nommait : *« un
récepteur soigné est un indice trompeur : il donne toutes les apparences d'une
fonction livrée. »* Ici il y avait le flow, le collecteur, le merge, et même le
type de charge utile. Tout, sauf le nom du canal.

### 2.3 Ce qu'un test d'unité ne peut pas voir

`MessageSocketManagerNotificationTest` — le seul test existant du gestionnaire —
injecte son événement en **cherchant le gestionnaire sous le nom que le
gestionnaire a lui-même enregistré** :

```kotlin
handlers.getValue("notification:new").invoke(...)
```

Ce test est vert **quel que soit** ce nom. Il prouve le décodage ; il ne peut
structurellement rien prouver du NOM. Tout test unitaire d'événement entrant
partage cet angle mort — c'est pourquoi les quatre tests iOS de
`call:force-leave` étaient verts au cycle 75 sur une fonction que la passerelle
n'avait jamais implémentée. **Le nom du canal est la seule chose qu'un test qui
injecte l'événement lui-même ne pourra jamais vérifier.**

### 2.4 Le deuxième silence, empilé sous le premier

Corriger le nom de `transcription:ready` n'aurait PAS suffi. Le modèle Android
était plat là où le fil est imbriqué :

```kotlin
data class TranscriptionReadyEvent(   // AVANT
    val messageId: String,
    val text: String,                 // ← jamais présent sur le fil
    val language: String? = null,
    ...
)
```

La passerelle envoie la forme partagée `TranscriptionReadyEventData`
(`MeeshySocketIOManager`, littéral `transcriptionData`) : le transcript
**imbrique** sous `transcription`, seuls les identifiants et `processingTimeMs`
restent au premier niveau. iOS le modélise ainsi (`TranscriptionReadyEvent
.transcription: TranscriptionData`).

`text` étant non-nul **sans valeur par défaut**, chaque trame aurait levé au
décodage — dans le `runCatching` de `listen`, qui journalise et jette. Deux
silences empilés : l'événement n'arrivait pas, et s'il était arrivé il aurait
été avalé.

**Et ce défaut-là a déjà été corrigé une fois, sur la classe voisine.**
`AudioTranslationEventTest` existe et s'ouvre sur : *« the gateway emits the
shared `AudioTranslationEventData` shape … so a flat model silently drops every
frame at decode time. »* Même fichier, même pipeline audio, la classe juste
au-dessus — et son jumeau est resté plat.

---

## 3. Le remède

### 3.1 Les deux noms, et le flow qui portait le faux

```kotlin
listen("message:edited", _messageEdited)
listen("audio:transcription-ready", _transcriptionReady)
```

Le flow `messageUpdated` est renommé `messageEdited` (et son collecteur avec).
Ce n'est pas de la cosmétique : **un flow nommé d'après un événement fantôme est
la façon dont la dérive s'est cachée.** Tant que le symbole disait `updated`,
rien dans le code ne contredisait la chaîne fautive.

### 3.2 La charge utile, alignée sur son jumeau

`TranscriptionReadyEvent` reçoit la même forme que `AudioTranslationEvent` :
imbrication explicite dans un `TranscriptionPayload`, défauts indulgents (texte
vide, langue nulle) pour qu'une trame malformée tombe sur le no-op du merge au
lieu de lever.

Le site d'appel lit désormais `event.transcription.text` — **pas** d'accesseurs
dérivés qui rapatrieraient les champs à plat. Le voisin `AudioTranslationEvent`
expose `event.translatedAudio` de la même façon : le site d'appel montre la
forme réelle du fil, au lieu de la masquer derrière une commodité.

### 3.3 La garde, et pourquoi elle vit dans `packages/shared`

`packages/shared/__tests__/ci/socket-event-name-gate.test.ts` :

> Tout nom d'événement Socket.IO épelé EN CLAIR par iOS ou Android — abonnement
> comme émission — doit être une valeur déclarée de `SERVER_EVENTS`,
> `CLIENT_EVENTS` ou `CALL_EVENTS`.

Quatre décisions de conception valent d'être écrites :

**Les objets sont IMPORTÉS, jamais relus au motif.** Le jeu déclaré est
littéralement l'ensemble des valeurs à l'exécution. Une lecture textuelle du
fichier de contrat ferait passer pour « déclaré » un nom qui n'y figure qu'en
PROSE — et `message:updated` aurait très bien pu être cité dans un commentaire.
La garde aurait alors béni le défaut qu'elle est écrite pour interdire.

**iOS et Android seulement, pas le web.** Le web importe les constantes
(`socket.on(SERVER_EVENTS.MESSAGE_EDITED, …)`) : un nom faux n'y compile pas,
le typage tient déjà la garantie. Swift et Kotlin recopient la chaîne à la
main ; c'est cette recopie, et elle seule, que la garde surveille.

**Le seuil de couverture se pose PAR PLATEFORME.** iOS pèse ~110 littéraux,
Android ~47. Un seuil global aurait laissé un scan Android muet passer inaperçu
derrière iOS. Sans ces témoins, un chemin déplacé ou une aide renommée rendrait
la garde verte en ne trouvant plus rien à vérifier — l'échec silencieux qu'on
vient de corriger, rejoué dans son propre garde-fou.

**Les chemins de test sont exclus.** Un test injecte l'événement lui-même : le
nom qu'il épelle est une donnée d'entrée, pas un abonnement vivant. L'y
soumettre interdirait d'écrire le témoin de régression sur un nom fautif — celui
qui, ci-dessous, prouve la correction.

**Placement** : même raison que ses deux voisins de dossier
(`ios-pr-compile-gate`, `lentille-tokens-consumption-gate`) — `packages/shared`
tourne sur CHAQUE PR (`ci.yml`, matrice `test`), c'est donc le seul point
d'observation commun aux deux plateformes. La suite Android, elle, ne tourne que
dans son propre workflow, et ne pourrait de toute façon pas lire un contrat
TypeScript.

---

## 4. Ce que ce cycle NE change PAS

- **Aucune ligne de passerelle.** Les deux événements étaient émis correctement
  depuis toujours.
- **Aucun nom d'événement, aucune charge utile, aucun contrat.** Le contrat
  avait raison ; c'est le client qui en avait dévié.
- **iOS et web** : intacts, et vérifiés conformes par la garde neuve (zéro
  écart sur 110 + 47 littéraux).

---

## 5. Preuves

| gate | résultat |
|---|---|
| `socket-event-name-gate` AVANT correction | **ROUGE**, sur exactement les deux noms et rien d'autre |
| `socket-event-name-gate` APRÈS correction | vert (3/3) |
| `packages/shared` — suite complète | **97 fichiers / 2351 tests verts** |
| `tsc --noEmit` shared | vert |
| android — `TranscriptionReadyEventTest` (neuf, 2 cas) | via CI `Android` |
| android — `MessageSocketManagerChannelNamesTest` (neuf, 2 cas) | via CI `Android` |
| android — `ChatViewModelTest` (adapté à la forme imbriquée) | via CI `Android` |

Le témoin ROUGE est la preuve qui compte : la garde a été écrite AVANT la
correction, et elle a listé les deux défauts réels sans un seul faux positif sur
157 littéraux scannés.

**Kotlin non compilable en conteneur** : `dl.google.com` est refusé par la
politique de sortie, `sdkmanager` ne peut pas s'amorcer — c'est l'en-tête de
`.github/workflows/android.yml` qui documente cette contrainte et qui existe
précisément pour la contourner. `assembleDebug` + `testDebugUnitTest` tournent
sur runner GitHub.

---

## 6. Pistes laissées ouvertes

1. **La garde SYMÉTRIQUE n'est pas écrite : « tout événement déclaré au contrat
   a-t-il un émetteur ? »** C'est la classe du cycle 75, et la matrice de la §1
   a déjà nommé ses candidats — `message:translated` (écouté par les TROIS
   clients, émis par personne ; inoffensif parce que `message:translation`
   porte réellement la traduction), `system:message`,
   `conversation:online-stats`, `post:reaction-sync`, `comment:reaction-sync`
   (iOS seul). Chacun demande un arbitrage — implémenter l'émetteur ou retirer
   l'entrée du contrat et ses récepteurs — donc un cycle à lui, pas une garde
   qu'on rend verte à la hâte.

2. **Les 26 autres événements de `MessageSocketManager` n'ont toujours aucun
   test de comportement.** Son unique fichier de test le disait déjà en
   toutes lettres (« intentionally does not attempt to backfill them »). La
   garde neuve couvre désormais leur NOM ; leur décodage reste non prouvé, et
   c'est exactement le trou par lequel `TranscriptionReadyEvent` est resté plat.

3. **Défense en profondeur sur le relais `call:signal`** — piste 1 du cycle 75,
   toujours ouverte, et toujours arbitrée de la même façon : une relecture
   d'appartenance par signal coûterait une lecture DB sur le chemin le plus
   chaud du produit.
