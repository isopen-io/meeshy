# Cycle 64 — l'accusé de lecture partait deux fois, et la seconde n'avait pas d'adresse

**Date** : 2026-08-17
**Branche** : `claude/keen-hamilton-iyzat2`
**Périmètre** : gateway (temps réel), `packages/shared` (contrat d'événements)
**Clients touchés** : aucun — et c'est le résultat, pas une omission (§ 2)

---

## 1. Ce que le cycle a cherché, et par quel bout

Le carnet du cycle 63 laissait huit pistes, dont trois bloquées (absence de
Xcode) et deux qui sont des décisions produit. Sa piste n° 8 posait la règle
qui a servi de méthode ici : **avant de trancher une piste motivée par un prix
supposé, mesurer.** Le cycle a donc commencé par une mesure plutôt que par une
piste — un inventaire du CONTRAT plutôt que du code : pour chacun des 124
`SERVER_EVENTS`, qui l'émet côté gateway, et qui l'écoute côté web, iOS,
Android.

L'inventaire rend deux familles d'anomalies. Celle qui compte est la seconde.

| Famille | Ce qu'on trouve | Verdict |
|---------|-----------------|---------|
| Écoutés, jamais émis | `message:translated`, `system:message`, `conversation:online-stats` — iOS a un `socket.on` pour chacun, la gateway n'en émet aucun | Écouteurs morts. Sans effet (iOS écoute AUSSI le vrai nom pour la traduction). Consigné § 7-1, non traité. |
| **Émis, jamais écoutés** | **`message:read-status-updated`** — cinq points d'émission dans la gateway, **zéro écouteur, sur les trois plateformes** | **Traité ici.** |

La seconde famille est la seule qui coûte, et celle-ci coûte sur le chemin le
plus fréquent de la messagerie.

---

## 2. Le défaut : une fenêtre de migration qui n'a jamais eu de migrant

Le 2026-07-05, `message:read-status-updated` a été ajouté à côté de
`read-status:updated`. Même charge utile, mais correctement namespacé — le nom
historique hyphène l'ENTITÉ (`read-status`), ce que la convention
`entity:action-word` interdit. Le plan (`tasks/socketio-events-cleanup.md` § 3)
était explicite : **dual-émission ~3 mois, le temps que les clients migrent**,
la migration des clients étant « un suivi séparé, non bloquant ».

Six semaines plus tard, ce suivi n'a pas eu lieu. Et la vérification est plus
forte qu'un simple « pas encore fait » :

```
git log -S "message:read-status-updated" --all -- '*.swift' '*.kt' 'apps/web/**/*.ts*'
git log -S "message:read-status-updated" --all -- packages/MeeshySDK/Sources
```

**Les deux sont vides.** Le nom conforme n'est jamais apparu dans une source
cliente — pas une fois, à aucun commit de l'historique, donc pas davantage
retiré depuis. Aucun binaire livré ne peut l'écouter : ils sortent tous de ce
dépôt. Les trois clients écoutent le nom historique et lui seul :

| Client | Site |
|--------|------|
| web | `services/socketio/presence.service.ts` → `socket.on(SERVER_EVENTS.READ_STATUS_UPDATED, …)` |
| iOS | `MessageSocketManager.swift:3376` → `socket.on("read-status:updated")` |
| Android | `MessageSocketManager.kt:138` → `listen("read-status:updated", …)` |

La dual-émission ne préparait donc aucune migration. Elle payait deux fois un
fan-out pour un nom que personne n'a jamais lu.

### 2 bis. Le prix, mesuré et non supposé

`emitToConversationParticipants` boucle sur les noms **autour de la même chaîne
de rooms** :

```ts
for (const event of events) emitter.emit(event, payload);
```

Deux noms, c'est exactement deux fois les octets sur le fil et deux réveils
radio par socket destinataire. Ce que ça multipliait :

| Émetteur | Fréquence |
|----------|-----------|
| `MessageHandler._autoDeliverToOnlineRecipients` | une fois **par message** et par destinataire en ligne |
| `broadcastReadStatus` (éventail + room de l'acteur) | chaque marquage de lecture, par les trois portes REST |
| `MeeshySocketIOManager._emitDeliveryForDrainedMessages` | chaque **reconnexion**, par conversation ayant un arriéré |
| `ConversationHandler` (rattrapage sur `conversation:join`) | chaque ouverture de conversation |

L'accusé de remise et de lecture est l'événement non-message le plus fréquent
d'une messagerie : il se déclenche à chaque message consommé par chaque
participant. C'est celui-là qui était doublé, et l'un des quatre sites est le
drain de reconnexion — c'est-à-dire le pire contexte réseau que l'application
connaisse, celui-là même que `SYNC_MAX_PAGE_BYTES` a été écrit pour border.

---

## 3. La décision : abandonner le renommage, pas le finir

Les deux issues honnêtes étaient : (a) finir la migration, (b) l'abandonner.
Le prix décide, et il n'est pas symétrique.

**Ce que le renommage achète** : de la cosmétique. Le nom sur le fil n'a aucun
effet sémantique — ni sur la charge utile, ni sur le routage, ni sur ce que le
client en fait.

**Ce que finir coûterait** : un écouteur ajouté sur TROIS plateformes, chacun
**dédupliquant** pendant la coexistence (un client abonné aux deux noms
appliquerait deux fois le même accusé) ; puis l'attente que tous les binaires
livrés écoutant l'ancien nom disparaissent du parc — des trimestres pour une
application iOS/Android déjà en magasin. Le prix du § 2 bis est payé pendant
tout ce temps.

Et le bénéfice immédiat va dans l'autre sens : le seul émetteur qu'on puisse
retirer **aujourd'hui, sans toucher un seul client**, est celui que personne
n'a jamais lu.

La dérogation de nommage est donc désormais **assumée et documentée à sa
source** — sur `SERVER_EVENTS.READ_STATUS_UPDATED` — plutôt que corrigée. Le
dossier n'est pas fermé sans clé de réouverture : § 7-2 dit ce qui le
rouvrirait, et dans quel ORDRE il faudrait alors procéder — écouteur client
livré et déployé d'abord, dual-émission ensuite, retrait du nom historique
quand le parc a tourné. Jamais l'inverse, qui est exactement ce qui a produit
ce dossier.

---

## 4. Ce qui a été livré

1. **`SERVER_EVENTS.MESSAGE_READ_STATUS_UPDATED` retiré** du contrat, ainsi que
   son entrée dans `ServerToClientEvents`. La dérogation de nommage est
   documentée sur `READ_STATUS_UPDATED`, avec sa clé de réouverture.
2. **Les cinq points d'émission** repassés à un seul nom.
3. **`emitToConversationParticipants` passe de `events: ReadonlyArray<string>`
   à `event: string`.** C'est le point le moins évident et le plus durable —
   § 4 bis.
4. **Deux gardes jumelles**, l'une sur le comportement, l'autre sur le contrat.

### 4 bis. Pourquoi le pluriel devait partir avec l'alias

Une fois l'alias retiré, les **douze** appelants de
`emitToConversationParticipants` passaient tous un tableau d'**un** élément. Le
pluriel ne décrivait donc plus aucun besoin : il ne servait plus qu'à rendre le
doublement d'un fan-out exprimable **en un caractère**, sur la fonction qui
porte les diffusions les plus chaudes du service.

Retirer l'alias sans retirer le pluriel aurait laissé le défaut réparé et
l'arme chargée. Un second nom se réintroduit maintenant par un second APPEL —
qui se voit en revue, là où un second élément de tableau ne se voit pas.

C'est la même préférence que celle qui court dans tout ce dépôt : rendre la
régression **inexprimable** plutôt que la garder par un témoin. Le témoin reste
quand même (§ 5), parce que les deux protègent des choses différentes — la
forme empêche le doublement PAR CETTE FONCTION, le témoin empêche le doublement
TOUT COURT.

---

## 5. Les gardes, et ce qui les distingue d'une décoration

**Comportement** — `services/gateway/src/socketio/__tests__/readReceiptEventName.test.ts` :

- l'éventail des pairs et la copie de l'acteur font **deux** émissions, jamais
  quatre ;
- un `received`, qui n'a qu'une audience, en fait **une** ;
- le nom émis est celui que les clients écoutent réellement ;
- le contrat partagé ne déclare **qu'un** nom d'accusé de lecture.

**Contrat** — `packages/shared/__tests__/types/socketio-events.test.ts` : le
témoin qui affirmait l'existence de l'alias affirme maintenant son unicité.

Le point qui décide de leur valeur : **la garde porte sur le NOMBRE avant de
porter sur le nom.** Un témoin qui se contenterait d'affirmer
« `read-status:updated` est émis » resterait VERT sous un troisième alias ajouté
demain — c'est-à-dire sous la régression même qu'il prétend garder. Les deux
gardes filtrent donc les émissions dont le nom *parle* d'accusé de lecture
(`event.includes('read-status')`) et comptent ce qui reste.

**ROUGE prouvé avant livraison** : les 4 témoins du fichier de comportement
tombent sur le code d'avant (`4 failed, 4 total`), chacun sur l'assertion qu'il
nomme.

---

## 6. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| `vitest` `packages/shared` | ✅ **83 fichiers / 2 168 témoins** verts |
| `readReceiptEventName.test.ts` | ✅ 4/4 (RED prouvé avant) |
| Suite gateway complète | _(voir § 6 bis)_ |
| Clients (web / iOS / Android) | **aucun changement** — `git diff apps/ packages/MeeshySDK` est vide |

### 6 bis. Les témoins qui gelaient la dual-émission

Onze fichiers de test affirmaient le doublement — c'est ce qui rend le défaut
intéressant : il était **gardé**, donc stable, donc invisible. Aucun d'eux
n'était faux ; ils décrivaient fidèlement un programme dont la prémisse était
périmée. Tous ont été repris plutôt que supprimés, et deux ont été RENFORCÉS au
passage, en remplaçant « le second nom porte le même objet » par « il n'y a
qu'un nom » (`read-status-anonymous-participant`, `ConversationHandler`) : la
seconde formulation tombe sous un troisième alias, la première non.

> **Une fenêtre de coexistence est une DETTE À ÉCHÉANCE, pas un état stable.**
> Elle se justifie par une migration à venir ; si la migration n'a pas de date,
> d'acteur et de critère de fin, ce qu'on a livré n'est pas une transition mais
> un doublement permanent — et les témoins écrits pour la protéger la rendront
> stable. Toute dual-émission future doit nommer, dans le même commit, ce qui
> l'éteindra.

---

## 7. Pistes pour le cycle 65

1. **Les trois écouteurs iOS sans émetteur** (§ 1) — `message:translated`,
   `system:message`, `conversation:online-stats`. Aucun effet visible
   aujourd'hui : iOS écoute aussi `message:translation`, le vrai nom. Mais ce
   sont trois contrats déclarés que rien n'honore, exactement le motif retiré
   au cycle 60 pour `user:status`. À trancher un par un : écouteur mort à
   supprimer, ou émetteur manquant à écrire. **Bloqué sur l'absence de Xcode**
   pour la moitié client.
2. **La clé de réouverture du dossier § 3** — un consommateur client RÉEL du nom
   conforme, c'est-à-dire une raison autre que la convention. Nouvelle.
3. **Le flake non identifié de `packages/shared`** (cycle 61 bis § 7) — intacte.
   Le prochain run de CI rouge doit le NOMMER (`--reporter=json --outputFile`).
   Noter que la suite `shared` est passée verte ici (83/83), donc le flake n'est
   pas déterministe.
4. **`conversations.infinite()` en pagination keyset** (cycles 59/60) — intacte,
   et toujours soumise à la règle du cycle 63 § 7-8 : mesurer avant de trancher.
5. **La file hors-ligne par APPAREIL** (cycle 58 § 7) — intacte. Le défaut est
   réel et connu : `connectedUsers.has(queueKey)` est indexé par UTILISATEUR, si
   bien qu'un appareil hors ligne ne reçoit rien tant qu'un autre appareil du
   même compte est connecté. Même règle : mesurer d'abord.
6. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, bloquée sur l'absence de Xcode.
7. **`PUT /conversations/:id` accepte toujours de renommer un tête-à-tête** —
   intacte. Vérifiée à nouveau ce cycle : la garde en place ne filtre que
   `defaultWriteRole` / `isAnnouncementChannel` / `slowModeSeconds` ; `title`
   reste modifiable par l'initiateur, pour les deux parties.
8. **Le vocabulaire du contrat gelé** (cycle 62 § 7-1, requalifié au cycle 63) —
   intacte, sans urgence.
