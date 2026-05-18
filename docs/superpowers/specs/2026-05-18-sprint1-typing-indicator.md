# Sprint 1 — Indicateur « X écrit » (liste + écran conversation)

**Status:** Draft (2026-05-18)

**Scope:**
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift`
- (lecture seule, vérification) `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`, `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift`, `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`, `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`, `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`, `services/gateway/src/socketio/handlers/StatusHandler.ts`

---

## Problème / Symptômes

L'indicateur « X est en train d'écrire » ne s'affiche jamais, à deux endroits :

- **(A) Liste de conversations** — la ligne (`ThemedConversationRow`) devrait remplacer l'aperçu du dernier message par l'indicateur de frappe lorsqu'un tiers tape. Rien ne s'affiche.
- **(B) Écran de conversation** — l'indicateur porté par le bouton « scroll-to-bottom » (`ConversationScrollControlsView`) ne fonctionne pas non plus, et aucun indicateur ne s'affiche après le dernier message quand l'utilisateur est en bas.

### Ce qui fonctionne déjà — NE PAS TOUCHER

Tout le pipeline réseau est correct et vérifié :

| Étape | Symbole | Fichier:ligne (vérifié) |
|---|---|---|
| Émission (composer) | `onTextChange: { viewModel.onTextChanged($0) }` | `ConversationView+Composer.swift:47` |
| Émission (VM) | `func onTextChanged(_:)` | `ConversationViewModel.swift:830` |
| Émission (handler) | `func onTextChanged(_:)` | `ConversationSocketHandler.swift:151` |
| Émission (socket) | `emitTypingStart(conversationId:)` → `socket?.emit("typing:start", ...)` | `MessageSocketManager.swift:1154-1155` |
| Serveur (rebroadcast) | `handleTypingStart` → `socket.to(room).emit(SERVER_EVENTS.TYPING_START, typingEvent)` | `StatusHandler.ts:45`, emit `:92` |
| Réception (décodage) | `socket.on("typing:start")` → `decode(TypingEvent.self, …)` → `typingStarted.send(event)` | `MessageSocketManager.swift:1728-1733` |
| Modèle réseau | `struct TypingEvent: Decodable, Sendable` (pas de `CodingKeys`, camelCase ⇒ OK avec le payload serveur) | `MessageSocketManager.swift:37-45` |
| État VM écran conv. | `@Published var typingUsernames: [String]` | `ConversationViewModel.swift:130` |

Le serveur ré-émet `{ userId, username, conversationId, isTyping }` en camelCase (`StatusHandler.ts:84-89`). Le bug est **100 % côté UI / consommateur iOS**.

---

## Causes racines

| ID | Cause | Emplacement (vérifié) |
|---|---|---|
| RC1.1 | `ConversationListViewModel.typingUsernames` est un `var` simple, **pas `@Published`**. Le listener socket le mute sans déclencher `objectWillChange` ⇒ SwiftUI ne re-render jamais la liste. Le commentaire au-dessus assume volontairement ce choix « pour éviter un full re-render », mais aucun mécanisme compensatoire n'a été mis en place. | `ConversationListViewModel.swift:60-63` (déclaration + commentaire), `:579` (mutation dans le listener `typingStarted`) |
| RC1.2 | Le bouton « scroll-to-bottom » (qui porte l'indicateur via `ConversationScrollControlsView`) n'est inséré dans la hiérarchie que si `!scrollState.isNearBottom`. En bas (état normal), le bouton **et son indicateur n'existent pas**. | `ConversationView.swift:1021-1027` |
| RC1.3 | `inlineTypingIndicator` (« bulle de frappe après le dernier message ») est défini mais **référencé nulle part** — code mort jamais branché dans la liste de messages. | `ConversationView+ScrollIndicators.swift:95-128` (défini), aucun call-site |
| RC1.4 | `headerState.typingDotPhase` (passé au bouton via `ConversationScrollControlsView(... typingDotPhase: headerState.typingDotPhase ...)`) est initialisé à `0` et **jamais incrémenté** ⇒ points figés même quand le bouton est visible. | `ConversationView.swift:135` (déclaration dans `ConversationHeaderState`), `ConversationView+ScrollIndicators.swift:42` (passage au composant) |

### Notes de vérification (code réel)

- **RC1.1** — confirmé : `var typingUsernames: [String: String]` à `ConversationListViewModel.swift:63`, commentaire « NOT @Published to avoid triggering a full list re-render » lignes `60-62`, mutation à `:579`. La base material est exacte.
- **RC1.2** — confirmé : `ConversationView.swift:1021` `if !scrollState.isNearBottom || viewModel.isSearchingQuotedMessage { ... scrollToBottomButton ... }`.
- **RC1.3** — confirmé : `inlineTypingIndicator` est défini en `ConversationView+ScrollIndicators.swift:95`. Une recherche globale (`grep -rn inlineTypingIndicator apps/ios`) ne retourne **que** la définition — aucun call-site. C'est bien du code mort.
- **RC1.4** — confirmé : `var typingDotPhase: Int = 0` à `ConversationView.swift:135`, passé au composant à `ConversationView+ScrollIndicators.swift:42`. Jamais muté ailleurs (`grep typingDotPhase` ne retourne que la déclaration et le passage).

### Découvertes additionnelles vs. base material (à intégrer dans la solution)

1. **L'infrastructure d'animation existe déjà partiellement.** `ConversationView` possède un `typingDotPublisher` partagé (`Timer.publish(every: 0.5, …)`, `ConversationView.swift:179`) et `typingDotConnection` (`:180`). Le timer est **connecté** dans `bodyWithLifecycle` (`ConversationView.swift:722-724`) et annulé dans `onDisappear` (`:728-729`). `inlineTypingIndicator` consomme déjà ce publisher via `.onReceive(typingDotPublisher)` pour avancer `headerState.inlineTypingDotPhase` (`ConversationView+ScrollIndicators.swift:118-121`). **RC1.4 doit réutiliser ce même `typingDotPublisher`**, pas créer un nouveau `Timer` — cela élimine le risque « Timer & Swift 6 » décrit dans la base material.
2. **`ThemedConversationRow` est DÉJÀ `Equatable` et déjà appliqué `.equatable()`.** Conformance `extension ThemedConversationRow: @MainActor Equatable` à `ThemedConversationRow.swift:569-583`, et le `==` compare explicitement `lhs.typingUsername == rhs.typingUsername` (`:573`). Le call-site `ConversationListView+Rows.swift:52-70` instancie `ThemedConversationRow` à l'intérieur de `ConversationRowItem` et applique `.equatable()` (`:70`). **La migration Equatable redoutée dans la base material n'est PAS nécessaire** — elle est déjà faite. Passer `typingUsernames` en `@Published` est donc sûr : seule la ligne dont le `typingUsername` change re-render réellement son body.
3. **L'indicateur de la liste a déjà sa vue et son câblage.** `typingIndicatorView` est défini à `ThemedConversationRow.swift:380-389` (texte + `TypingDotsView`), et `lastMessagePreviewView` (`:444-447`) affiche `typingIndicatorView` dès que `typingUsername != nil`. Le `typingUsername` est passé depuis `ConversationListView.swift:273` (`typingUsername: conversationViewModel.typingUsernames[conversation.id]`). **La seule pièce manquante est l'observabilité (RC1.1).**
4. **La liste de messages n'est PAS une `List`/`LazyVStack` SwiftUI** — c'est un `UICollectionView` hébergé via `MessageListView` (`UIViewControllerRepresentable`, `MessageListView.swift:302`) instancié dans `ConversationView.bodyContent` (`ConversationView.swift:808-949`). On **ne peut donc pas** « append `inlineTypingIndicator` comme dernière row » de manière SwiftUI native. RC1.3 doit le placer comme **overlay SwiftUI ancré bas**, juste au-dessus du composer (voir Design § RC1.3).
5. **Le timeout de frappe côté liste existe déjà.** `scheduleTypingCleanup` (`ConversationListViewModel.swift:804-811`) arme un `Timer` 15 s qui appelle `clearTyping` (`:813-817`) → `typingUsernames.removeValue(...)`. Le `typing:stop` est également géré (`:584-589`). Le risque « entrée bloquée » de la base material est donc couvert côté liste. Côté écran conversation, vérifier le pendant dans `ConversationViewModel` (voir Risques).

---

## Design / Solution

### RC1.1 — Rendre l'état de frappe observable (liste)

Changer la déclaration `ConversationListViewModel.swift:63` :

```swift
// AVANT
var typingUsernames: [String: String] = [:]  // conversationId → displayName

// APRÈS
@Published var typingUsernames: [String: String] = [:]  // conversationId → displayName
```

Mettre à jour le commentaire `:60-62` pour refléter le nouveau raisonnement :

```swift
/// Typing usernames indexed by conversationId. @Published — ConversationRowItem
/// + ThemedConversationRow are Equatable with .equatable() applied
/// (ConversationListView+Rows.swift:70), so only the row whose typingUsername
/// changed re-evaluates its body. The full list does NOT re-render.
```

Aucune autre modification : la mutation `:579` et le cleanup `:816` continuent de fonctionner — `@Published` émet `objectWillChange` automatiquement à chaque mutation du dictionnaire.

**Pourquoi c'est sûr (Zero Unnecessary Re-render).** `ConversationListView.body` se ré-évalue, mais chaque `ForEach` produit des `ConversationRowItem` → `ThemedConversationRow().equatable()`. Le diff Equatable (`ThemedConversationRow.swift:570-582`) compare `typingUsername` ; seules les lignes dont la valeur a changé re-render leur body. Coût net : identique à un `objectWillChange.send()` manuel, mais idiomatique et sans risque d'oubli.

**Alternative rejetée.** Garder le `var` et appeler `objectWillChange.send()` après chaque mutation (`:579` et `:816`). Coût de re-render identique, mais (a) facile à oublier sur un futur call-site, (b) moins idiomatique. `@Published` est préféré.

### RC1.2 + RC1.3 — Indicateur dans l'écran de conversation (cas « en bas »)

Comme la liste de messages est un `UICollectionView` (cf. découverte #4), on **ne branche pas** `inlineTypingIndicator` comme footer de collection view. On le présente comme **overlay SwiftUI** ancré en bas du `ZStack` `bodyContent`, juste au-dessus du composer, visible uniquement quand `!viewModel.typingUsernames.isEmpty`.

Dans `ConversationView.swift`, à l'intérieur du `ZStack` de `bodyContent` (`:794`), après le bloc `MessageListView(...)` (`:808-949`) et avant `floatingHeaderSection` (`:951`), ajouter :

```swift
if !viewModel.typingUsernames.isEmpty {
    VStack {
        Spacer()
        inlineTypingIndicator
            .padding(.horizontal, 16)
            .padding(.bottom, composerHeight + 8)
    }
    .zIndex(58)   // sous le scrollToBottomButton (zIndex 60), au-dessus de la liste
    .transition(.move(edge: .bottom).combined(with: .opacity))
    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.typingUsernames.isEmpty)
    .allowsHitTesting(false)
}
```

- `inlineTypingIndicator` (`ConversationView+ScrollIndicators.swift:95-128`) est utilisé **tel quel** — il lit déjà `typingLabel` (donc `viewModel.typingUsernames`) et anime `headerState.inlineTypingDotPhase` via `.onReceive(typingDotPublisher)` (`:118-121`).
- `viewModel.typingUsernames` est déjà `@Published` (`ConversationViewModel.swift:130`) — aucune modification de VM nécessaire pour ce point.
- Placement « après le dernier message » : l'overlay flotte au-dessus du bas de la liste, au-dessus du composer. Quand l'utilisateur est en bas, c'est visuellement équivalent à une bulle de frappe sous le dernier message (placement standard des apps de messagerie). Quand l'utilisateur est remonté, l'overlay reste ancré bas — c'est cohérent, et le bouton scroll-to-bottom (RC1.4) porte alors l'indicateur principal.

> Note de design : si une intégration « vraie cellule de collection view » est souhaitée plus tard, ce serait un footer supplémentaire (`UICollectionView` supplementary view) dans `MessageListViewController` — explicitement **hors scope** de ce sprint. L'overlay SwiftUI est la solution minimale et suffisante.

### RC1.4 — Bouton scroll-to-bottom (cas « remonté »)

Quand l'utilisateur a remonté, le bouton est visible (`ConversationView.swift:1021`) et porte l'indicateur via `ConversationScrollControlsView(... typingDotPhase: headerState.typingDotPhase ...)` (`ConversationView+ScrollIndicators.swift:42`). Il faut faire avancer `headerState.typingDotPhase`.

Réutiliser le `typingDotPublisher` partagé déjà connecté (cf. découverte #1) — **ne pas créer de nouveau `Timer`**. Ajouter un `.onReceive` sur la même vue que le bouton. Dans `ConversationView.swift`, sur le bloc qui présente `scrollToBottomButton` (`:1021-1027`), ajouter :

```swift
if !scrollState.isNearBottom || viewModel.isSearchingQuotedMessage {
    VStack { Spacer(); HStack { Spacer(); scrollToBottomButton.padding(.trailing, 16).padding(.bottom, composerHeight + 8) } }
        .zIndex(60)
        .transition(.asymmetric(insertion: .scale(scale: 0.8).combined(with: .opacity), removal: .scale(scale: 0.6).combined(with: .opacity)))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: scrollState.isNearBottom)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.isSearchingQuotedMessage)
        .onReceive(typingDotPublisher) { _ in
            guard !viewModel.typingUsernames.isEmpty else { return }
            headerState.typingDotPhase = (headerState.typingDotPhase + 1) % 3
        }
}
```

C'est exactement le même pattern que `inlineTypingIndicator` (`ConversationView+ScrollIndicators.swift:118-121`) pour `inlineTypingDotPhase`. Le `guard` évite d'avancer la phase quand personne ne tape (économie de re-render). Le publisher est connecté/déconnecté avec le cycle de vie de la vue (`:722-724`, `:728-729`) — pas de fuite, pas de `[weak self]` (vue = struct).

### RC1.4 (REFACTOR, T4) — Mutualiser l'animation des points

`inlineTypingIndicator` (`inlineTypingDotPhase`) et le bouton (`typingDotPhase`) appliquent le **même** incrément `(phase + 1) % 3` sur réception du même publisher. Option de refactor : extraire un modificateur de vue dédié.

```swift
// ConversationView+ScrollIndicators.swift
private struct TypingDotPhaseAdvancer: ViewModifier {
    let publisher: Publishers.Autoconnect<Timer.TimerPublisher>   // ou le type exact du shared publisher
    let isActive: Bool
    @Binding var phase: Int

    func body(content: Content) -> some View {
        content.onReceive(publisher) { _ in
            guard isActive else { return }
            phase = (phase + 1) % 3
        }
    }
}

extension View {
    func advancingTypingDotPhase(_ phase: Binding<Int>, on publisher: ..., isActive: Bool) -> some View {
        modifier(TypingDotPhaseAdvancer(publisher: publisher, isActive: isActive, phase: phase))
    }
}
```

Appliqué ensuite sur `inlineTypingIndicator` ET sur le bloc bouton. **Conditionnel** : si le type exact du publisher (`typingDotPublisher` est un `Timer.TimerPublisher`, pas autoconnect — il est `.connect()`-é manuellement) rend la signature lourde, garder les deux `.onReceive` en l'état (3 lignes chacun) et documenter le pattern par un commentaire. Ne pas sur-ingénier — c'est un REFACTOR optionnel, exécuté seulement s'il ajoute de la valeur.

---

## Tâches (TDD RED → GREEN → REFACTOR)

### T0 — RED (tests)

`apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift` :

- `test_typingStartedEvent_publishesTypingUsername_triggersObjectWillChange` — injecter un mock `MessageSocketManaging` (protocole), émettre un `TypingEvent` sur `typingStarted`, vérifier que `sut.typingUsernames[conversationId] == username` ET qu'un `objectWillChange` a été reçu (souscrire à `sut.objectWillChange` via `XCTestExpectation` + `AnyCancellable`). RED tant que `typingUsernames` est un `var` non publié.
- `test_typingStoppedEvent_removesTypingUsername` — émettre `typingStopped`, vérifier la suppression de l'entrée (régression sur le cleanup `:584-589` / `:813-817`).

`apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift` :

- `test_typingUsernames_whenSocketEmitsTypingStart_updatesPublishedState` — **probablement déjà couvert** (`typingUsernames` est déjà `@Published` côté `ConversationViewModel`). Confirmer l'existence ; si absent, l'ajouter. Pas de changement de production attendu pour ce test.

UI / comportement de ligne :

- `test_themedConversationRow_withTypingUsername_showsTypingIndicator` — vérifier via le `==` Equatable de `ThemedConversationRow` (`:570-582`) que deux instances qui ne diffèrent que par `typingUsername` ne sont **pas** égales (donc re-render ciblé). Test pur, sans rendu. Optionnellement un snapshot test (dossier `MeeshyTests/Snapshots/`) si l'infra snapshot est disponible.

> Convention de nommage respectée : `test_{method}_{condition}_{expectedResult}`. Mocks : `Mock{ServiceName}` conformes à `{ServiceName}Providing`, stubs `Result<T, Error>` + compteurs d'appels.

### T1 — GREEN (RC1.1)

- `@Published var typingUsernames` dans `ConversationListViewModel` (`:63`) + mise à jour du commentaire (`:60-62`).
- Vérifier (lecture seule) la conformance Equatable de `ThemedConversationRow` (`:569-583`) et l'application de `.equatable()` (`ConversationListView+Rows.swift:70`) — **déjà en place**, aucun changement requis.
- `ConversationListViewModelTests` passent au vert.

### T2 — GREEN (RC1.2 + RC1.3)

- Brancher `inlineTypingIndicator` en overlay SwiftUI ancré bas dans `ConversationView.bodyContent` (`ConversationView.swift`, dans le `ZStack` `:794`, après `MessageListView` `:949`, avant `floatingHeaderSection` `:951`).
- Aucun nouveau symbole — `inlineTypingIndicator` est consommé tel quel.

### T3 — GREEN (RC1.4)

- Ajouter `.onReceive(typingDotPublisher)` sur le bloc `scrollToBottomButton` (`ConversationView.swift:1021-1027`) pour avancer `headerState.typingDotPhase`, gardé par `!viewModel.typingUsernames.isEmpty`.

### T4 — REFACTOR (optionnel)

- Mutualiser l'avancée de phase (`inlineTypingDotPhase` + `typingDotPhase`) via `TypingDotPhaseAdvancer` si la signature du publisher reste lisible. Sinon, conserver les deux `.onReceive` et documenter.

### T5 — VÉRIFICATION

- `./apps/ios/meeshy.sh test` au vert (unitaires). `./apps/ios/meeshy.sh test --ui` si snapshot ajouté.
- `./apps/ios/meeshy.sh build` propre.
- Test manuel deux comptes (`atabeth` / `jcharlesnm`) — voir Critères d'acceptation.

---

## Risques

| Risque | Mitigation |
|---|---|
| **Re-render de la liste entière** si `@Published` est ajouté sans Equatable sur les lignes. | Non applicable ici : `ThemedConversationRow` est déjà `Equatable` (`:569-583`, compare `typingUsername`) et `.equatable()` est déjà appliqué (`ConversationListView+Rows.swift:70`). Vérifier en T1 que rien n'a régressé. Aligné avec la règle « Zero Unnecessary Re-render ». |
| **Timer & Swift 6** — un `Timer` créé dans une struct View pose des problèmes d'isolation. | Évité : on **réutilise** le `typingDotPublisher` existant (`ConversationView.swift:179-180`), déjà `@State`, déjà connecté dans `bodyWithLifecycle` (`:722-724`) et annulé en `onDisappear` (`:728-729`). Aucun nouveau `Timer`, aucun `[weak self]` (struct). |
| **Indicateur figé après arrêt de frappe (liste).** | Couvert : `scheduleTypingCleanup` (`ConversationListViewModel.swift:804-811`) arme un timeout 15 s, et `typing:stop` est géré (`:584-589`). À re-vérifier en T5. |
| **Indicateur figé après arrêt de frappe (écran conversation).** | À CONFIRMER en T0 : vérifier que `ConversationViewModel` retire bien l'entrée de `typingUsernames` sur `typing:stop` ou via timeout (pendant du cleanup liste). Si absent, c'est un bug de production à corriger dans ce sprint (ajout d'un cleanup symétrique côté `ConversationViewModel`). À traiter explicitement, ne pas supposer que c'est OK. |
| **Overlay `inlineTypingIndicator` chevauche le bouton scroll-to-bottom** quand l'utilisateur est remonté ET un tiers tape. | `zIndex(58)` pour l'overlay (sous le bouton à `zIndex(60)`) + `.allowsHitTesting(false)`. Visuellement, quand l'utilisateur est remonté, le bouton (avec ses propres points) est l'indicateur dominant ; l'overlay ancré bas reste discret. Acceptable ; à valider en T5. |
| **`typingDotPublisher` non connecté à l'ouverture** ⇒ points figés brièvement. | Le publisher est connecté dans `bodyWithLifecycle.onAppear` (`:722-724`). Le `.onReceive` du bouton commence à recevoir dès la connexion. Délai imperceptible (< 0,5 s). |

---

## Critères d'acceptation / Vérification

1. Un tiers tape dans une conversation → la ligne correspondante de la **liste** affiche l'indicateur à la place de l'aperçu, en **< 1 s**.
2. **Écran conversation, scrollé en bas** : bulle de frappe animée affichée au-dessus du composer (effet « après le dernier message »).
3. **Écran conversation, scrollé vers le haut** : le bouton scroll-to-bottom affiche l'indicateur avec **points animés** (`typingDotPhase` qui avance).
4. L'indicateur disparaît quand la frappe s'arrête (`typing:stop`) ou après timeout (15 s liste ; pendant à confirmer/corriger côté écran conversation).
5. `./apps/ios/meeshy.sh test` au vert.
6. **Zero Unnecessary Re-render** : lors d'une frappe distante, seule la ligne concernée re-render son body (vérifiable via SwiftUI Instruments ou un `let _ = Self._printChanges()` temporaire).

### Protocole de test manuel (T5)

1. Connecter `atabeth` (simulateur) et `jcharlesnm` (second simulateur ou device).
2. `jcharlesnm` ouvre une conversation commune et tape — sur l'écran liste de `atabeth`, la ligne montre « jcharlesnm écrit » + points animés en < 1 s.
3. `atabeth` ouvre la conversation, reste en bas — la bulle de frappe apparaît animée au-dessus du composer pendant que `jcharlesnm` tape.
4. `atabeth` remonte de plusieurs messages — le bouton scroll-to-bottom apparaît avec ses points animés.
5. `jcharlesnm` arrête de taper — les trois indicateurs disparaissent (immédiatement sur `typing:stop`, sinon au timeout).

---

## Fichiers

| Fichier | Changement |
|---|---|
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` | `var typingUsernames` → `@Published var typingUsernames` (`:63`) ; commentaire mis à jour (`:60-62`). |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` | Overlay `inlineTypingIndicator` ancré bas dans `bodyContent` (dans le `ZStack` `:794`) ; `.onReceive(typingDotPublisher)` sur le bloc `scrollToBottomButton` (`:1021-1027`). |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift` | (T4 optionnel) extraction de `TypingDotPhaseAdvancer`. Sinon, fichier inchangé. |
| `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift` | Nouveaux tests T0 (fichier existant — extension). |
| `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift` | Confirmation/ajout test T0 (fichier existant — extension). |

**Aucun nouveau fichier `.swift` n'est créé.** Tous les changements branchent ou modifient des symboles existants (`inlineTypingIndicator`, `typingDotPublisher`, `typingIndicatorView`, `ThemedConversationRow` Equatable — tous déjà présents). Les tests sont ajoutés à des fichiers de test existants. ⇒ **Aucune entrée `project.pbxproj` à ajouter.**

Aucun changement gateway, aucun changement SDK, aucune migration de schéma.

---

## Coordination & Merge

Cette spec est l'une de trois specs de sprint rédigées **en parallèle** :

- **Sprint 1 — ce document** : `2026-05-18-sprint1-typing-indicator.md`
- **Sprint 2** : `2026-05-18-sprint2-realtime-message-rendering.md`
- **Sprint 3** : `2026-05-18-sprint3-optimistic-media.md`

**Ordre d'exécution recommandé global** : Sprint 2 → Sprint 3 → Sprint 1.

**Indépendance de Sprint 1.** Sprint 1 est **totalement indépendant** des Sprints 2 et 3 : aucun fichier source partagé. Les Sprints 2 et 3 touchent tous deux `ConversationSocketHandler.swift` autour des lignes 257-302 ; Sprint 1 ne touche **pas** `ConversationSocketHandler.swift` (il ne fait que lire `:151` pour vérification, sans le modifier). Sprint 1 peut donc être implémenté en sécurité dans un git worktree dédié (`feat/typing-indicator`), **en parallèle** des deux autres :

```bash
git worktree add ../v2_meeshy-feat-typing-indicator -b feat/typing-indicator main
```

**Caveat fichier partagé — `project.pbxproj`.** Selon la règle parallel-worktree de `CLAUDE.md`, `project.pbxproj` n'est géré que par le **dernier** worktree à merger. **Vérification effectuée : Sprint 1 ne crée aucun nouveau fichier `.swift`** (cf. section Fichiers — tout est du wiring de symboles existants + extension de fichiers de test existants). **Sprint 1 n'introduit donc aucun conflit `project.pbxproj`.** Il peut être mergé dans n'importe quel ordre vis-à-vis des Sprints 2/3, sans réconciliation `project.pbxproj`.

Après les trois merges : `./apps/ios/meeshy.sh build` propre depuis `main` pour capter d'éventuels problèmes d'intégration.
