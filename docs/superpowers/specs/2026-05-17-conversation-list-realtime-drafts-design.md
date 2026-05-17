# Conception — Liste de conversations : indicateur coloré, remontée temps réel, brouillons

Date : 2026-05-17
Statut : validé (en attente de revue du spec écrit)

## Contexte

La liste de conversations iOS (`ConversationListView` + `ThemedConversationRow`,
ViewModel `ConversationListViewModel`) présente trois manques signalés par l'utilisateur :

1. L'indicateur de durée du dernier message reste en couleur d'accent même quand
   la conversation a des messages non lus — il devrait reprendre la couleur de la
   pill du compteur de non-lus pour renforcer visuellement l'état non-lu.
2. La remontée d'une conversation en tête de liste n'est pas fiable à la réception
   d'un message — en particulier quand le message arrive pendant que l'app est en
   arrière-plan (via le système de notifications iOS plutôt que via le websocket).
3. Une conversation dans laquelle l'utilisateur a un brouillon en cours ne remonte
   pas en tête de liste et n'est pas signalée comme telle.

### État du code (vérifié)

- `ConversationListViewModel` est un `@StateObject` de `RootView` — **vivant toute la
  session**, jamais recréé en naviguant dans/hors d'une conversation. Pas de perte
  d'abonnement Combine.
- Le chemin websocket de remontée existe déjà : le ViewModel écoute
  `messageSocket.conversationUpdated` et appelle `bumpToTop(...)` quand
  `lastMessageAt` augmente. Le décodage de `lastMessageAt` (`ConversationUpdatedEvent`)
  est correct (stratégie ISO8601 custom dans `MessageSocketManager.decode`).
- Le vrai trou de la remontée : quand l'app est en arrière-plan, le socket est
  déconnecté ; les events `conversation:updated` émis pendant ce temps sont perdus.
  Au retour au premier plan, rien ne réordonne la liste.
- `DraftStore` (`apps/ios/Meeshy/Features/Main/Services/DraftStore.swift`) persiste
  par conversation le **texte, la référence de réponse, la langue et les effets**
  d'un brouillon dans `UserDefaults` (clé `meeshy_draft_<conversationId>`). Les
  pièces jointes média en attente ne sont **pas** persistées (transitoires, vivant
  dans `composerState`, perdues à la navigation).

## Objectifs

- L'indicateur de durée passe à la couleur de la pill de non-lus quand
  `unreadCount > 0`.
- Une conversation remonte en tête de liste **instantanément** à la réception d'un
  message par l'app, que ce soit via le websocket Meeshy ou via les notifications
  iOS, y compris au retour de l'arrière-plan.
- Une conversation avec un brouillon actif remonte en tête des conversations
  non-épinglées et affiche un badge « Brouillon ».

## Hors périmètre

- **Approche B (brouillons média durables)** : persister les pièces jointes en
  attente dans `MessageDraft` pour qu'un brouillon média seul survive à la
  navigation et remonte la conversation. Décidé : non traité pour l'instant. La
  remontée et le badge brouillon sont pilotés uniquement par les brouillons
  persistés (texte / réponse / effets). Un média joint puis abandonné sans texte ne
  déclenche pas de remontée durable — cohérent puisque le média est de toute façon
  jeté à la navigation.

---

## Partie 1 — Indicateur de durée coloré quand il y a des non-lus

### Composant
`apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` — l'indicateur
`Text(timeAgo(conversation.lastMessageAt))` (aujourd'hui `.foregroundColor(accent)`).

### Comportement
- `conversation.unreadCount > 0` → couleur `MeeshyColors.error` (#F87171), dans les
  deux modes (clair et sombre).
- `conversation.unreadCount == 0` → `accent` (inchangé).

Choix de la teinte : `MeeshyColors.error` (et non `unreadBadgeBackground(isDark:)`)
parce que la variante sombre de la pill (#991B1B) est trop peu contrastée pour un
texte de 11pt sur fond sombre. `#F87171` est la même famille de rouge que la pill,
lisible dans les deux modes.

### Implémentation
Propriété calculée dans la row :
```swift
private var timestampColor: Color {
    conversation.unreadCount > 0 ? MeeshyColors.error : accent
}
```
appliquée via `.foregroundColor(timestampColor)`.

Un seul fichier touché. Pas d'impact accessibilité (le label VoiceOver inclut déjà
le nombre de non-lus). `renderFingerprint` de `Conversation` inclut déjà
`unreadCount` — l'`Equatable` de la row se met à jour correctement.

---

## Partie 2 — Remontée temps réel fiable

Trois axes complémentaires. La conception couvre toutes les voies par lesquelles
l'app apprend qu'un message est arrivé.

### 2a — Websocket (durcissement)

- La room utilisateur côté gateway est **confirmée présente** : le gateway ajoute
  le socket à `ROOMS.user(userId)` lors de l'authentification JWT. Le chemin
  `conversation:updated` est donc structurellement opérationnel. Étape 1 du plan :
  ajouter un log de confirmation à la réception du premier `conversationUpdated`
  pour valider en pratique (pas un blocage attendu).
- `bumpToTop(conversationId:newLastMessageAt:)` dans `ConversationListViewModel` :
  remplacer le `guard let idx = conversations.firstIndex(...) else { return }`
  silencieux par un log `Logger.messages.warning` quand la conversation est
  introuvable, et utiliser le cache d'index `convIndex(for:)` plutôt qu'un
  `firstIndex` O(n).

### 2b — Notifications push

`PushNotificationManager` (SDK, `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift`) :

- Nouveau publisher : `public let messageNotificationReceived = PassthroughSubject<String, Never>()`
  émettant le `conversationId`.
- Nouvelle méthode `noteMessageActivity(userInfo:)` : extrait `type` et
  `conversationId` du `userInfo` ; si `type == "message"` et `conversationId` non
  nil, émet `conversationId` sur `messageNotificationReceived`. Cette méthode
  **n'altère pas** `pendingNotificationPayload` (pas de déclenchement de
  navigation — uniquement le signal de remontée).

`AppDelegate` (`apps/ios/Meeshy/AppDelegate.swift`) :

- `userNotificationCenter(_:willPresent:)` (push au premier plan) et
  `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` (push
  silencieux) appellent `noteMessageActivity(userInfo:)` en plus de leur logique
  existante.
- **Isolation acteur** : `PushNotificationManager` est `@MainActor` et ces deux
  méthodes déléguées sont `nonisolated`. L'appel à `noteMessageActivity` doit se
  faire dans un contexte `@MainActor` — `didReceiveRemoteNotification` enveloppe
  déjà son traitement dans un `Task { @MainActor in }` (l'appel y est placé) ;
  `willPresent` doit faire de même (`Task { @MainActor in ... }`).

`ConversationListViewModel` :

- S'abonne à `messageNotificationReceived` avec `.receive(on: DispatchQueue.main)`
  (cohérent avec les autres abonnements de `subscribeToSocketEvents`) ; à réception
  → `bumpToTop(conversationId:, newLastMessageAt: Date())`.
- `Date()` (instant de réception) est utilisé car le payload push ne porte pas
  d'horodatage de message. Conséquence connue et bénigne : voir la section Risques.
- Si la conversation est inconnue du ViewModel → `fetchAndPrependMissingConversation`
  (mécanisme existant).
- Pour la testabilité, le publisher est injecté dans l'init du ViewModel
  (`messageNotificationPublisher: AnyPublisher<String, Never> = PushNotificationManager.shared.messageNotificationReceived.eraseToAnyPublisher()`).

### 2c — Resynchro au retour au premier plan

Les push « alerte » classiques reçus en arrière-plan ne déclenchent **aucun**
callback applicatif avant que l'utilisateur n'ouvre l'app. Filet de sécurité fiable :

- Le hook existant : `ConversationListView` observe déjà `scenePhase`
  (`@Environment(\.scenePhase)`) et, à la transition vers `.active`, appelle
  `conversationViewModel.handleForegroundReturn()`. ⚠️ `handleForegroundReturn()`
  ne rafraîchit aujourd'hui que les **stories** et est gardé sur `isCacheValid`
  (early-return si le cache est périmé — soit l'inverse du besoin ici). Il ne faut
  donc **ni le réutiliser ni le modifier**.
- Nouvelle méthode `handleForegroundReactivation()` sur `ConversationListViewModel` :
  re-trie la liste en mémoire et déclenche le rafraîchissement réseau cache-first
  des conversations. Elle est appelée depuis le `.onChange(of: scenePhase)` existant
  de `ConversationListView`, à côté de `handleForegroundReturn()` (stories).
- `MeeshyApp.swift` possède aussi un `scenePhase` au niveau app
  (`handleForegroundTransition()`) — on ne s'y greffe pas ; le hook au niveau
  `ConversationListView` est le bon point d'accroche pour la liste.

---

## Partie 3 — Remontée + badge « Brouillon » (Approche A)

### Modèle de données

Nouveau type valeur, app-side (à côté de `DraftStore`) — un brouillon est un concept
client-local, **aucune modification du modèle SDK `Conversation`** :

```swift
struct DraftSummary: Equatable, Sendable {
    let conversationId: String
    let previewText: String   // draft.text rogné ; peut être vide (réponse/effet seul)
    let updatedAt: Date
}
```

### `DraftStore` — ajouts

- `func allNonEmptyDrafts() -> [String: MessageDraft]` : scanne les clés
  `UserDefaults` préfixées `meeshy_draft_`, décode, filtre sur `!isEffectivelyEmpty`.
- `let changed = PassthroughSubject<Void, Never>()` : émis à chaque mutation —
  `save` (y compris la suppression implicite d'un brouillon devenu
  `isEffectivelyEmpty`), `remove`, `clearAll`, `purgeExpired`.

Aucun changement côté composer : `ConversationView` persiste déjà le brouillon à
chaque frappe via `persistDraft(text:)` → `DraftStore.save`. Note : `save()`
réhorodate lui-même `updatedAt = Date()` — `DraftSummary.updatedAt` est donc lu
depuis le brouillon **rechargé** via `allNonEmptyDrafts()`, jamais depuis une
valeur en mémoire pré-save.

### `ConversationListViewModel` — annotation et tri

- `@Published private(set) var draftSummaries: [String: DraftSummary]`.
- À l'init : peuplé depuis `DraftStore.allNonEmptyDrafts()`.
- S'abonne à `DraftStore.shared.changed` **avec un debounce (~300 ms)** — le
  composer persiste à chaque frappe, donc `changed` émet en rafale ; le debounce
  évite de recharger tous les brouillons + re-trier à chaque caractère (le
  codebase debounce déjà des pipelines similaires). À l'émission débouncée →
  recharge `draftSummaries` → re-trie.
- **Comparateur de tri consolidé** : le tri par `lastMessageAt` est aujourd'hui
  dupliqué à ~5 endroits (liste complète, sections, épinglées, catégories, « autres »).
  Il est extrait dans une seule fonction `conversationsAreInOrder(_:_:)` :
  1. Épinglées d'abord (`isPinned`).
  2. Parmi les **non-épinglées** : celles avec un brouillon actif d'abord.
  3. Entre brouillons : `DraftSummary.updatedAt` décroissant.
  4. Sinon : `lastMessageAt` décroissant.
  Les épinglées conservent leur tri actuel (`lastMessageAt` décroissant) — la
  priorité brouillon ne s'applique qu'aux non-épinglées, conformément à la décision
  produit (« en tête des non-épinglées »).

### `ThemedConversationRow` — affichage

- Nouveau paramètre `var draftSummary: DraftSummary? = nil` (`let`/`var` simple,
  pas d'`@ObservedObject` — respecte la règle « leaf view sans singleton observé »).
- `lastMessagePreviewView` : si `typingUsername == nil` et `draftSummary != nil`,
  afficher l'aperçu brouillon à la place de l'aperçu du dernier message. L'indicateur
  de frappe distante (`typingUsername`) reste prioritaire sur le brouillon.
- Aperçu brouillon : `« Brouillon : <previewText> »` — le mot « Brouillon » en
  `MeeshyColors.error`, le texte en `textSecondary`, `lineLimit(1)`. Si
  `previewText` est vide, afficher « Brouillon » seul.
- **`Equatable` (`==`) — obligatoire, pas optionnel** : ajouter
  `lhs.draftSummary == rhs.draftSummary` au comparateur. L'`==` actuel ne compare
  que `conversation.renderFingerprint` (+ un jeu de champs fixe) ; or un changement
  de brouillon **ne mute pas** le `Conversation`. Sans cette ligne, la row ne se
  ré-évalue jamais sur un changement de brouillon → le badge « Brouillon »
  n'apparaît jamais. `DraftSummary` est `Equatable`, la comparaison est saine.

### `ConversationListView` / `ConversationListView+Rows.swift`

- Passer `draftSummary: viewModel.draftSummaries[conversation.id]` à chaque
  `ThemedConversationRow`.

### Flux de données

```
Composer (frappe) → ConversationView.persistDraft → DraftStore.save
   → DraftStore.changed émis
   → ConversationListViewModel recharge draftSummaries + re-trie
   → la conversation remonte en tête des non-épinglées, row affiche « Brouillon : … »

Envoi du message → brouillon supprimé (DraftStore.delete) → changed émis
   → la conversation reste en tête (nouveau message) mais sans badge brouillon
```

---

## Stratégie de tests (TDD)

`ConversationListViewModel` (`apps/ios/MeeshyTests/`) :
- `test_bumpToTop_conversationInconnue_logEtNoOp`
- `test_conversationUpdated_remonteEnTete`
- `test_pushMessage_remonteConversation`
- `test_pushNonMessage_neRemontePas`
- `test_retourPremierPlan_retrie`
- `test_tri_conversationAvecBrouillon_audessusDesNonEpinglees`
- `test_tri_brouillons_ordonnesParUpdatedAtDecroissant`
- `test_tri_epingleeAudessusDeBrouillon`

`DraftStore` :
- `test_allNonEmptyDrafts_exclutLesBrouillonsVides`
- `test_save_emetChanged`
- `test_delete_emetChanged`

Le `ViewModel` accepte l'injection (`dateProvider`, services) et `DraftStore`
accepte un `UserDefaults` injectable — tests réalisables sans APNs ni I/O réelle.
`test_retourPremierPlan_retrie` cible directement
`ConversationListViewModel.handleForegroundReactivation()`.

`PushNotificationManager` (`packages/MeeshySDK/Tests/`) :
- `test_noteMessageActivity_typeMessage_emetConversationId`
- `test_noteMessageActivity_typeNonMessage_nEmetRien`
- `test_noteMessageActivity_sansConversationId_nEmetRien`

Le ViewModel reçoit le publisher push injecté pour permettre le test sans APNs.

Baseline snapshot facultative pour `ThemedConversationRow` (indicateur coloré +
badge brouillon) si l'infra snapshot couvre déjà la row.

## Risques

- **Horodatage `Date()` du bump push** : le payload push ne porte pas l'horodatage
  du message, donc le bump push écrit `lastMessageAt = Date()`. Conséquence connue
  et bénigne : (a) le handler websocket `conversationUpdated` gardant sur
  `newLastAt > lastMessageAt`, l'event `conversation:updated` du *même* message
  (horodatage serveur légèrement antérieur) sera rejeté — sans effet, la position
  est déjà correcte ; (b) `timeAgo()` et `conversationHeat` affichent « maintenant »
  jusqu'au prochain sync complet. Comme un message vient effectivement d'arriver,
  « maintenant » est correct en pratique ; l'auto-correction se fait au prochain
  rafraîchissement (2c ou refresh périodique). Aucune complexité ajoutée.
- **Throttling des push silencieux** par iOS : `didReceiveRemoteNotification` n'est
  appelé que pour les push `content-available` et n'est pas garanti. L'axe 2c
  (resynchro au premier plan) est le mécanisme fiable et ne dépend d'aucune
  livraison de push.
- **`changed` émis à chaque frappe** : le composer persiste à chaque caractère.
  Le debounce (~300 ms) de l'abonnement côté ViewModel (cf. §3) absorbe la rafale ;
  sans lui, rechargement complet des brouillons + re-tri par caractère.
- **`draftSummaries` `@Published`** : un changement ré-évalue la liste. Les
  brouillons changent rarement (post-debounce) et l'`Equatable` de la row absorbe
  les re-renders inutiles — impact négligeable.
- **Scan `UserDefaults`** pour énumérer les brouillons : nombre de brouillons faible
  en pratique, coût négligeable ; effectué hors chemin de rendu.

## Fichiers touchés

- `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` (parties 1 et 3)
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` (parties 2 et 3)
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` (partie 2c —
  branchement de `handleForegroundReactivation()` sur le `.onChange(scenePhase)`
  existant ; partie 3 — passage du `draftSummary`)
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift` (partie 3 —
  passage du `draftSummary`)
- `apps/ios/Meeshy/Features/Main/Services/DraftStore.swift` (partie 3)
- `apps/ios/Meeshy/AppDelegate.swift` (partie 2b)
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift` (partie 2b)
- Tests associés dans `apps/ios/MeeshyTests/` et `packages/MeeshySDK/Tests/`
