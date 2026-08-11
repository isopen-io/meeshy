# Exactitude de la lecture — design

Date : 2026-07-24
Lot 1 de 2. Prérequis de `2026-07-24-media-views-enrichment-design.md`.

## Problème

Un message est marqué lu sans que personne ne l'ait affiché.

`markMessagesAsRead` (`MessageReadStatusService.ts:577`) délègue à
`freezeMessageStatus` (:759), qui sélectionne les messages par **fenêtre
temporelle** — `createdAt ∈ (readAt précédent, maintenant]` — et leur écrit à tous
le même `readAt`. Le paramètre `latestMessageId` sert au curseur et à la
déduplication, mais **n'entre jamais** dans la sélection du gel (:670-676).

Ouvrir une conversation à 200 non-lus dont 10 tiennent à l'écran marque les 200
comme lus, et l'expéditeur voit 200 coches bleues.

Aucun client ne fournit la donnée qui permettrait de faire mieux :

- **iOS** — la liste est un `UICollectionView` (`MessageListViewController`).
  `indexPathsForVisibleItems` existe mais n'est jamais remonté ; ni `willDisplay`
  ni `didEndDisplaying` ne sont implémentés. `upToMessageId` vaut
  `messages.last?.id`, soit le dernier message **chargé** et non **vu**
  (`ConversationViewModel.swift:3525`), puis il est jeté :
  `OutboxDispatcher.dispatchMarkAsRead` (:265) poste `body: nil`.
- **Web** — aucun `IntersectionObserver` sur les bulles.
  `markAsRead(conversationId)` part à l'ouverture, au scroll près du bas et après
  envoi, **sans aucun identifiant** (`messages.service.ts:136`).

### Ce que ce n'est pas

Ce comportement n'est pas une régression : il est décrit comme intentionnel dans
`docs/plans/2026-03-09-message-delivery-read-status-design.md` (L.129-152), qui
assume le modèle curseur `cursor.lastReadAt >= message.createdAt → lu`. Le présent
document **change cette décision**.

`tasks/proof-read-state-exactness.md` mérite une note de portée — non parce que
ses théorèmes seraient faux, mais parce qu'ils ne couvrent pas cette question.
Correction d'une affirmation antérieure de ce spec : son lemme L1 (`rc ≤ N(c)`)
est une borne de cardinalité et **tient**, quelle que soit la sémantique de
« lu ». La preuve établit que le client reflète fidèlement les compteurs du
serveur ; elle ne demande jamais si l'ensemble « lu » du serveur correspond à ce
qui a été affiché. `ReadReceiptGate` (T3) ne comble pas ce vide : il gate **quand**
un accusé est émis, pas **quels messages** il couvre.

## Principe directeur

> **Livré = récupéré. Lu = affiché.**

`deliveredAt` reste géré par fenêtre temporelle, et c'est correct : tout message
récupéré par le client a bien été livré. Seul le chemin `readAt` change. Cette
distinction borne le lot — `markMessagesAsReceived` n'est pas touché.

## 1. Contrat client → serveur

`POST /conversations/:id/mark-read` reçoit un body optionnel :

```ts
export const MarkReadBodySchema = z.object({
  messageIds: z.array(CommonSchemas.mongoId).max(200).optional(),
}).strict();
```

**Le body reste optionnel, et son absence conserve le comportement par fenêtre.**
Ce n'est pas une concession de confort : les binaires iOS déjà distribués
continueront de poster `body: nil` pendant des semaines. Supprimer le repli
casserait la lecture pour ces versions.

`markMessagesAsRead` gagne un paramètre `options?: { messageIds?: string[] }`.

## 2. Gel borné

`freezeMessageStatus` accepte `messageIds?: string[]` :

- fourni → sélection `where: { id: { in: messageIds }, … }` ;
- absent → fenêtre `(since, at]` actuelle.

Le reste est inchangé : garde write-once (`readAt: null` dans le `where` du
`updateMany`), `createMany` pour les entrées manquantes, aucune exception propagée.

## 3. Curseur exact — préfixe contigu

`_advanceCursor` (:389) écrit aujourd'hui `lastReadMessageId = messageId`,
`lastReadAt = now`, `unreadCount = 0` : ouvrir une conversation vide le badge.

Le curseur avance désormais jusqu'au **plus long préfixe contigu de messages lus**
à partir de sa position courante. Concrètement, après le gel :

1. Charger les ids des messages postérieurs au curseur, triés croissant, bornés à
   500.
2. Charger les `MessageStatusEntry` de ces ids ayant `readAt != null`.
3. Avancer tant qu'il n'y a pas de trou ; s'arrêter au premier manquant.

L'étape 3 est une fonction pure :

```
computeContiguousReadPrefix(orderedMessageIds, readIdSet) -> string | null
```

Propriétés : lecture contiguë depuis le dernier point → le curseur suit
exactement ; saut vers le bas → le curseur ne franchit pas le trou et le badge
reste haut. C'est le comportement voulu : les messages sautés ne sont pas lus.

`unreadCount` reste un simple `count(createdAt > plancher)` — **aucune requête
coûteuse n'est introduite**. Le plancher est la **position chronologique** du
curseur, `lastReadMessageCreatedAt` (repli `lastReadAt` pour les curseurs
hérités, puis `joinedAt`), et NON le `lastReadAt` mural. En mode exact
`_advanceCursor` écrit `lastReadAt = now` (postérieur à tous les messages en
base) tout en conservant la vraie position dans `lastReadMessageCreatedAt` :
plancher sur `lastReadAt` compterait `createdAt > now` = 0 et effacerait le
badge à l'ouverture — l'exact opposé du « badge reste haut » ci-dessus. Voir
`getUnreadCount` / `getUnreadCountsForUser` / `getUnreadCountsForParticipants`.
La borne de 500 protège d'un scan non maîtrisé sur une conversation très en
retard ; le curseur rattrapera au passage suivant.

## 4. Retrait du repli curseur, avec bascule

Tous les chemins de lecture appliquent `frozen?.readAt ?? cursorRead` où
`cursorRead` vaut `lastReadAt >= message.createdAt`. **Corriger le gel sans
toucher ce repli ne changerait rien** : le curseur continuerait à déclarer lu tout
message plus ancien que `lastReadAt`.

Le repli ne peut pas être supprimé sèchement : les messages historiques n'ont pas
d'entrée `readAt`, et le retrait les ferait tous basculer en « jamais vu ».

D'où une **date de bascule**, `EXACT_READ_TRACKING_SINCE` (variable
d'environnement).

**La bascule est opt-in, et c'est délibéré.** Sur ce dépôt, pousser sur `main`
déclenche le déploiement ; faire par défaut de la date de déploiement le seuil
reviendrait à rendre le changement visible au moment même de la livraison, sans
maîtrise du calendrier. Absente, vide ou illisible, la variable conserve le repli
curseur — donc le comportement historique à l'identique. Une valeur illisible
n'arme jamais la bascule par accident : le repli est le seul défaut sûr.

```
resolveReadAt({ frozenReadAt, cursorLastReadAt, messageCreatedAt, cutover })
```

- `messageCreatedAt < cutover` → repli curseur autorisé (héritage) ;
- `messageCreatedAt >= cutover` → `frozenReadAt` seul fait foi.

Fonction pure, appliquée aux **cinq** sites porteurs du repli, tous de forme
identique (`const readAt = frozen?.readAt ?? cursorRead`) :
`getMessageReadStatus`, `getConversationReadStatuses`, `getMessageStatusDetails`
et `getLatestMessageSummary` dans `MessageReadStatusService.ts`, plus le bloc
d'enrichissement de `routes/conversations/messages.ts`.

Correction d'un recensement initial erroné : `messages-advanced.ts` **n'a pas** ce
repli — il lit les compteurs dénormalisés `Message.readCount`/`readByAllAt` et les
`statusEntries.readAt` bruts, sans jamais consulter le curseur. Rien à y basculer.
Incohérence connexe repérée au passage, hors périmètre : ces compteurs
dénormalisés ne sont jamais mis à jour en base, donc ce point d'entrée renvoie des
valeurs figées.

**Le compteur de non-lus reste hors de cette bascule.** `getUnreadCount` dérive
uniquement du curseur (`count(createdAt > lastReadAt)`) et ne consulte jamais
`MessageStatusEntry`. Conséquence assumée : un message lu hors séquence — après un
trou — porte un `readAt` figé tout en restant compté non lu, puisque le curseur
s'arrête au trou. Rendre les deux strictement cohérents exigerait une anti-jointure
par message, coûteuse en MongoDB, que ce lot refuse explicitement.

## 5. Réciprocité `showReadReceipts`

Appliquée dans ce lot, sur les mêmes chemins de lecture que la bascule — les
toucher deux fois serait du gaspillage.

- Demandeur avec `showReadReceipts: false` → aucun détail de lecture d'autrui.
- Participants avec `showReadReceipts: false` → retirés des réponses.
- Sa propre ligne reste toujours visible.
- Les écritures continuent : seule l'exposition est filtrée, donc réversible.

**Le participant opt-out sort du numérateur ET du dénominateur.** Dans un groupe
de trois dont un a désactivé ses accusés, l'expéditeur voit « 0/2 » à « 2/2 », et
« lu par tous » reste atteignable. Les deux alternatives ont été écartées :
retirer seulement du numérateur rend le total définitivement inatteignable, ce qui
trahit l'existence d'un opt-out ; garder le compteur intact en masquant les noms
laisse déduire trivialement qui a lu, et vide la préférence de son sens.

**Moitié déjà en place.** Le versant « je n'émets pas d'accusés » existe :
`routes/conversations/messages.ts:344` gate le broadcast sur la préférence du
lecteur.

### Où vit la réciprocité — arbitrage

Le versant « je ne vois pas ceux des autres » dépend du **demandeur**. Or
`getMessageReadStatus(messageId, conversationId)` et
`getLatestMessageSummary(conversationId)` n'en reçoivent aucun, et cette dernière
alimente des broadcasts : un payload commun à toute la conversation ne peut pas
être filtré par spectateur sans passer à un envoi par destinataire.

La résolution tient à une distinction :

- **Masquer l'opt-out aux autres protège une donnée personnelle.** C'est une règle
  de confidentialité : elle doit être **autoritaire côté serveur**, sans quoi un
  client modifié la contourne. → implémentée ici.
- **Masquer les accusés des autres à l'opt-out est une règle d'équité** (« tu ne
  partages pas, tu ne vois pas »). Ce qu'elle cache est consenti par ceux qui l'ont
  émis : il n'y a rien à protéger contre l'utilisateur opt-out. → **côté client**.

Conséquences : aucun payload par destinataire, aucune refonte de la diffusion, et
un comportement **cohérent entre REST et temps réel** — ce qu'un filtrage REST seul
n'aurait pas donné, l'utilisateur voyant alors ses coches bouger en direct tout en
trouvant la feuille de détail vide. C'est aussi le modèle de WhatsApp.

La réciprocité rejoint donc les étapes 7 et 8 (clients).

**Fuite préexistante corrigée au passage.** `getLatestMessageSummary` agrège tous
les curseurs sans distinction : la lecture d'un participant opt-out ressortait
dans le résumé diffusé aux autres, contournant le gate de broadcast. Le résumé
exclut désormais ces participants avant diffusion.

### Comment la préférence est lue

Correction d'une affirmation antérieure de ce spec : `getPreferencesForUsers`
n'était **pas** un chargement groupé malgré son nom — un `Promise.all` sur des
appels unitaires, dont un test verrouillait le comportement. Corrigé séparément :
la méthode lit désormais tous les manquants en une requête, ce qui profite aussi à
la présence et aux handlers de messages.

`MessageReadStatusService` ne l'utilise pourtant pas. `PrivacyPreferencesService`
démarre un `setInterval` de nettoyage qui capture `this` : l'instance n'est donc
jamais collectée. Or `MessageReadStatusService` est construit **par requête** — en
créer une par instance fuirait un timer par requête.

Il lit donc l'opt-out en **une requête indexée**, avec la clé importée de
`PRIVACY_KEY_MAPPING` plutôt que dupliquée, pour ne pas forker la source de
vérité. Le défaut étant `true`, une ligne absente vaut « visible » ; seules les
lignes à `"false"` excluent.

Les participants anonymes et bots n'ont pas de `userId`, donc pas de préférence
stockée : ils restent visibles.

Repli **ouvert** en cas d'erreur — tout le monde reste visible. C'est la convention
déjà retenue par `PrivacyPreferencesService.fetchFromDatabase`, et échouer fermé
masquerait les accusés de **tous** sur un incident transitoire.

Le filtrage se fait **en amont**, sur la liste de participants : les opt-out
disparaissent ainsi du dénominateur comme du numérateur sans traitement séparé.

Côté web, `showReadReceipts` est aujourd'hui **totalement ignorée** — déclarée dans
le store et l'écran de réglages, lue par aucun composant de chat. Le gate serveur
la rend effective sans changement d'UI.

## 6. Clients — détection de visibilité

Règle commune : un message est **vu** s'il reste continûment affiché au moins
`dwellMs` (défaut 300 ms). Le seuil élimine les faux positifs du défilement rapide.

Accumulateur partagé, même comportement des deux côtés :

- entrée : événements `apparu(id, t)` / `disparu(id, t)` ;
- sortie : lot d'ids vus, vidé sur seuil de taille (50), inactivité (1 s), fin de
  défilement, passage en arrière-plan, fermeture de la conversation.

Implémentations miroir, mêmes cas de test — précédent établi par
`resolveUserLanguage()` :

- Swift : `SeenMessageAccumulator` (SDK)
- TS : `seen-message-accumulator.ts` (web)

### iOS

`MessageListViewController` implémente `willDisplay` / `didEndDisplaying` et
alimente l'accumulateur. Les lots remontent au `ConversationViewModel`, puis dans
l'Outbox.

`OutboxDispatcher.dispatchMarkAsRead` (:265) poste enfin un body — ce qui corrige
au passage l'abandon d'`upToMessageId`, dont le payload est produit, coalescé
(`OfflineQueue.swift:1155`) et couvert par trois fichiers de tests SDK avant
d'être jeté au dernier saut HTTP.

**2026-08-10 — suite :** `upToMessageId` a été RETIRÉ de `MarkAsReadPayload` plutôt
que branché ; `messageIds` + `caughtUpToMessageId` disent déjà, et exactement, ce
que le serveur doit savoir. Les rows persistées qui le portent encore se décodent
sans changement (clé inconnue ignorée). `ReadReceiptGate` a été supprimé au même
moment : plus aucun appelant depuis que l'accusé naît de l'observateur de
visibilité et non de l'arrivée d'un message.

### Web

`IntersectionObserver` sur les bulles (seuil 0.5), branché dans le composant de
liste, alimentant le même accumulateur. `markAsRead` transporte les ids.

Les trois déclencheurs actuels de `ConversationLayout.tsx` (:465, :484, :668)
subsistent comme déclencheurs de **vidange**, plus comme sources de vérité.
La garde morte `hasMarkedAsReadOnOpenRef` (assignée, jamais lue) est supprimée.

## 7. Tests

**Fonctions pures** (TS + Swift, mêmes cas)
- `computeContiguousReadPrefix` — préfixe complet, trou au milieu, ensemble vide,
  premier message manquant, entrée déjà entièrement lue.
- `resolveReadAt` — avant/après bascule, gel présent/absent, curseur nul.
- accumulateur — dwell non atteint, atteint, apparition/disparition/réapparition,
  vidange sur seuil, sur inactivité, sur arrière-plan.

**Gateway**
- `freezeMessageStatus` borné : **seuls** les ids nommés reçoivent `readAt`.
- Repli sans body : comportement fenêtre préservé (versions iOS déployées).
- Curseur : avance sur préfixe contigu, s'arrête au trou, borne de 500 respectée.
- Confidentialité : demandeur opt-out, participant opt-out, ligne propre visible,
  chargement groupé.
- `deliveredAt` : **non-régression** — la fenêtre reste en place.

**Test verrou — à renommer, PAS à inverser**
`MessageReadStatusService.test.ts:602`
(`'should freeze a write-once readAt per message newly crossed'`) affirme que
**deux** messages reçoivent `readAt` alors que l'appel n'en nommait qu'un.

Correction de ce spec : ce test n'encode pas le bug, il décrit correctement le
**chemin hérité**. Puisque le corps de `mark-read` reste optionnel, ce chemin
subsiste et doit rester couvert. Le test est renommé pour l'expliciter, et le mode
exact fait l'objet de tests distincts.

**Piège découvert à l'implémentation, absent de ce spec à l'origine.** La garde de
déduplication est indexée sur le message le plus récent de la conversation. En mode
exact, deux lots successifs de messages affichés partagent ce message : la clé
serait identique et le second lot silencieusement avalé dans la fenêtre TTL, donc
perdu. La garde est neutralisée en mode exact — les écritures y sont write-once,
donc déjà idempotentes.

**Ordre inversé en mode exact.** On gèle AVANT d'avancer le curseur, alors que le
chemin hérité fait l'inverse : un message affiché est lu même quand le curseur ne
peut pas bouger, et geler après l'aurait perdu.

**Couverture du chemin armé.** Les tests existants n'exercent jamais la bascule,
puisqu'elle est désarmée par défaut : un câblage incorrect y passerait inaperçu.
Un bloc de tests dédié arme donc la variable et couvre les quatre sites du service.
Le cinquième — la route — est couvert par mutation : casser son câblage fait
échouer deux tests existants.

**iOS** — `willDisplay`/`didEndDisplaying` alimentent l'accumulateur, le lot part
dans l'Outbox, le body n'est plus nul.

**Web** — l'observer produit les ids attendus, la vidange transporte le payload.

## 8. Ordre de livraison

Chaque lot commité vert, séparément.

1. ✅ Fonctions pures TS + tests (`computeContiguousReadPrefix`, `resolveReadAt`).
2. ✅ Gel borné + `MarkReadBodySchema`.
3. ✅ Curseur à préfixe contigu.
4. ✅ Bascule `EXACT_READ_TRACKING_SINCE` (opt-in) sur les cinq lecteurs.
5. ✅ Exclusion `showReadReceipts` sur les quatre lecteurs du service
   (numérateur + dénominateur), fuite du résumé diffusé colmatée, et lecture
   réellement groupée des préférences.
6. Accumulateur de visibilité — TS (web) et Swift (iOS), mêmes cas de test.
7. iOS : visibilité, accumulateur, body de l'Outbox, **réciprocité d'affichage**.
8. Web : `IntersectionObserver`, accumulateur, payload, **réciprocité d'affichage**.
9. Correction de `tasks/proof-read-state-exactness.md` (lemme L1) et de
   `docs/plans/2026-03-09-message-delivery-read-status-design.md` (note de
   supersession).

Tant que les étapes 7 et 8 ne sont pas livrées, aucun client n'envoie de
`messageIds` : le gateway emprunte partout le chemin hérité et la production est
strictement inchangée, même bascule armée.

## Risques

- **Chute visible des accusés de lecture.** Après bascule, les coches bleues
  refléteront l'affichage réel : elles seront moins nombreuses. C'est l'objectif,
  mais cela peut être signalé comme une régression. La date de bascule permet de
  dater précisément le changement.
- **Badge de non-lus qui ne se vide plus à l'ouverture.** Changement de
  comportement validé, mais il modifie une habitude quotidienne. Aucune action
  « tout marquer comme lu » n'est prévue dans ce lot ; si le besoin se confirme,
  elle fera l'objet d'un lot dédié.
- **Versions clientes déployées.** Elles restent sur le chemin par fenêtre jusqu'à
  mise à jour. Les deux régimes coexistent, distingués par la présence du body.

## Hors périmètre

- `deliveredAt` — la fenêtre y est correcte.
- Action « tout marquer comme lu ».
- Stories, posts, réels.
- Vues enrichies des attachements — lot 2.
