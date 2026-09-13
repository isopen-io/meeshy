# L'appui long montre le message tel qu'on le lit — plan d'implémentation

> **Pour les agents d'exécution :** SOUS-SKILL REQUIS : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`, tâche par tâche. Les étapes se cochent (`- [ ]`).

**But :**
- Un appui long montre le message dans le rendu de son mode, à taille réelle, en Bulle, Focal, Script et Rivière.
- La barre de réactions apparaît 2× plus grande et sans fond.
- Le clavier se baisse avant le menu et se relève à sa fermeture.
- En Script, un double tap ouvre la barre et un menu Liquid Glass de toutes les options.

**Architecture :**
- La liste UIKit (et l'hôte Rivière) remet à l'overlay une copie inerte de la rangée, construite par le même code que la cellule. Un lien choisit le fournisseur selon le mode de lecture.
- L'overlay neuf (`LiftedMessageOverlay`) pose barre, copie et menu par une loi de géométrie pure.
- Les actions passent par un routeur unique, et le contexte de menu par une fabrique unique.
- Un drapeau, résolu par le programme bêta jusqu'à validation, garde l'ancien chemin vivant.

**Stack :**
- Swift 6.0, SwiftUI + UIKit (`UICollectionView`, `UIHostingConfiguration`), iOS 16 → 26.
- XCTest (app) ; `MeeshyUITests` (SDK) ; xcodegen.

**Spec :** `docs/superpowers/specs/2026-09-10-appui-long-rendu-du-mode-design.md` (commit e8f28f7f5f). Le plan argumente depuis la spec : l'exécutant lit les deux.

**Pilotage :** milestone #89.
- Issues de livraison : #5980 clavier · #5981 rendu du mode · #5982 barre 2× · #5983 Rivière · #5984 double tap Script.
- Suivis : #5985 retraits · #5988 `isTyping` · #5989 décision « Transférer » · #5995 décision d'activation pour tous.

## Contraintes globales

- **Worktree et branche** : `/Users/smpceo/Documents/v2_meeshy-longpress`, branche `claude/appui-long-rendu-du-mode`. Ne jamais toucher `/Users/smpceo/Documents/v2_meeshy`.
- **Cible** :
  - Swift `6.0`, `IPHONEOS_DEPLOYMENT_TARGET 16.0` ;
  - l'app compile en `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor` ;
  - tests de l'app `@MainActor`, `@testable import Meeshy` ; tests du SDK `@testable import MeeshyUI`.
- **Rien n'est retiré avant validation (D3)** : l'aperçu reconstruit, `buildNativeMessageMenu`, `nativeMenuButton` et le `.contextMenu` Rivière restent. Leur retrait est #5985.
- **Budget (D4)** :
  - Δ ≤ 0 par fichier pour `ConversationView.swift`, `MessageListViewController.swift` et `MessageOverlayMenu.swift`, relevé par `wc -l` avant/après et écrit dans le commit ;
  - `FocalRow.swift` n'est jamais modifié ;
  - un fichier neuf reste sous 1 200 lignes (`FileSizeBudgetGuardTests`, règle 1).
- **Drapeau (D2)** : `MeeshyFeatureFlags.isLiftedRowLongPressEnabled`. `MEESHY_FLAG_LIFTED_ROW_LONG_PRESS` (`1`/`0`) prime sur la clé posée `meeshy.flag.lifted_row_long_press`, qui prime sur `BetaFeaturesPreference.isEnabled`. Drapeau éteint : comportement actuel à l'identique.
- **Clavier (D7)** : « levé » = `keyboardHeight > 0`. `isTyping` n'est ni lié ni réécrit (#5988). La relève passe par `composerState.focusTrigger`, et seulement si le composer est monté.
- **Géométrie (§6)** :
  - échelle toujours 1 ;
  - barre à 16 pt des bords, plafonnée à 520 pt, bord bas 8 pt au-dessus de la rangée (appui long) ou centrée sur son bord haut (double tap) ;
  - menu 6 pt sous la rangée ;
  - précédence 5 > 4 > 3/6.
- **Pas de nouvelle haptique** : le geste (moyenne) et l'apparition de l'overlay gardent les leurs.
- **Style** :
  - `MeeshyFont.relative`, jamais `.system(size:)` ;
  - `.adaptiveOnChange`, jamais `.onChange` brut ;
  - chaînes `String(localized:defaultValue:bundle: .main)` sur clés existantes, sinon entrée au catalogue ;
  - `AnyView` pour tout calque lourd monté dans le `body` de `ConversationView` (`ConversationViewBodyTypeDepthTests`).
- **Tests** :
  - `test_{méthode}_{condition}_{résultatAttendu}` ;
  - comportement par l'API publique ;
  - garde de source seulement pour le câblage de `ConversationView` ;
  - une garde re-pointée ne perd aucune assertion.
- **Commandes, simulateurs et commits** : section « Environnement commun » ci-dessous ; le contrat d'interfaces complet est en annexe (`docs/superpowers/plans/2026-09-10-appui-long-rendu-du-mode-contrat.md`).
- **Clôture** : jamais `Closes #n` avant la Tâche 24, et jamais sans captures au simulateur.

## Réconciliation de l'assemblage (à lire avant la Tâche 1)

Les quatre parties ont été rédigées en parallèle contre un contrat commun (annexe `docs/superpowers/plans/2026-09-10-appui-long-rendu-du-mode-contrat.md`). Chaque partie déclare ses écarts en tête. L'assemblage les a croisés et retient ceci :

| Point de contact | Décision retenue |
|---|---|
| Cache de paquets Swift | `-clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages`. C'est un clone copie-sur-écriture du cache complet de l'arbre principal, rangé sous `apps/ios/Build`, que git ignore. S'il manque : `mkdir -p /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build && cp -Rc /Users/smpceo/Documents/v2_meeshy/apps/ios/SourcePackages /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages`. |
| Espace disque | Avant tout build, `df -h /System/Volumes/Data` doit montrer au moins 5 Gi libres. Sinon, s'arrêter et prévenir le porteur. Ne jamais supprimer le cache, le DerivedData ou le simulateur d'une autre session sans son accord. |
| Emplacement de `Meeshy.app` | `WorkspaceSettings` peut forcer les produits dans `apps/ios/Build/Products` malgré `-derivedDataPath`. Toute commande qui pose `APP=` le résout d'abord : `APP=$(ls -d /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd/Build/Products/Debug-iphonesimulator/Meeshy.app /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/Products/Debug-iphonesimulator/Meeshy.app 2>/dev/null \| head -1)`. |
| Réveil du clavier | Un seul site écrit `composerState.focusTrigger = true` : `raiseComposerKeyboardIfMounted()` (Tâche 4). Les Tâches 10, 16, 19 et 22 l'appellent. |
| Porte de présentation | `overlayState.showOverlayMenu = true` vit dans `continueLongPressPresentation` (Tâche 4). La Tâche 16 la complète sans la réécrire, et garde le jeton de présentation. |
| Drapeau | Lu seulement dans `ConversationView` et ses extensions, jamais dans `MessageListViewController.swift` ni `MessageListView.swift` (`BetaFeaturesReadingModesIntegrationTests`). La liste reçoit un rappel `onScriptDoubleTap`, présent ou nil ; la Rivière, un `onLongPress` non nil. |
| `makeRowContent` | `func makeRowContent(localId: String, forLiftedCopy: Bool) -> MessageRowContent?` (Tâche 14). La Tâche 22 pose le double tap sur l'ancre `focalRow.equatable()` de son corps. |
| Contexte Rivière | La Tâche 16 construit déjà `menuContext(for: message, isRiver: readingModeController.mode == .river)` : l'étape 3g de la Tâche 19 ne réécrit rien. |
| Rendu du double tap | Livré par la Tâche 16 (`MessageOptionsGlassMenu` + `allOptionSections`). La Tâche 22 ne fait que brancher le geste. |
| Emojis rapides | `EmojiUsageTracker` quitte `MessageOverlayMenu.swift` en Tâche 6 ; la Tâche 16 lui ajoute `overlayQuickDefaults`. |
| pbxproj | Un fichier Swift neuf ajoute DEUX lignes `.swift in Sources`. |
| Captures | Racine unique, hors dépôt : `/Users/smpceo/Documents/meeshy-longpress-captures/`. |
| Envois vers un serveur | Les Tâches 17 (étapes 3b et 3e), 20 et 23 ne publient rien sans l'accord EXPLICITE du porteur, demandé dans la session au moment de l'étape : l'app peut viser la production. Sans accord, les captures se font sur des messages existants, et chaque cas sans message adéquat est consigné « non vérifié ». |

**Compensations de budget (D4), sans chevauchement entre tâches** (Δ nets annoncés par les parties, prouvés par `wc -l` dans chaque commit) :

| Tâche | `ConversationView.swift` | `MessageListViewController.swift` | `MessageOverlayMenu.swift` |
|---|---|---|---|
| 1 | −57 (`ConversationOverlayState`) | — | — |
| 6 | −19 (`HeaderSearchGlyph`) | — | −57 (`EmojiUsageTracker`) |
| 8 | −18 (contexte de la feuille par la fabrique) | — | — |
| 14 | −5 (`ConversationHeaderState`) | −4 (`cellFrameInWindow`) | — |
| 16 | −5 (`PreviewMedia`) | — | −5 (`defaultEmojis`) |
| 19 | −11 (fermetures `onOpenProfile` et `onViewStory` du montage Rivière) | — | — |
| 22 | −6 (fermeture `onRetry`) | −32 (`messageIdsInGroup(endingAt:)`) | — |

Un Δ réel supérieur à celui du tableau n'est pas un échec tant qu'il reste ≤ 0. Un Δ > 0 est un échec de la tâche.


## Environnement commun (toutes les tâches)


- **Worktree** : `/Users/smpceo/Documents/v2_meeshy-longpress`, branche `claude/appui-long-rendu-du-mode`. Ne JAMAIS toucher `/Users/smpceo/Documents/v2_meeshy` (WIP d'une autre session).
- **Cible** : Swift 6.0, iOS 16.0 minimum. L'app compile en `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor` : un type neuf est `@MainActor` par défaut, et les tests de l'app sont `@MainActor final class …: XCTestCase`, `@testable import Meeshy`.
- **Style** :
  - doc-comments en français, denses comme le code voisin ;
  - `MeeshyFont.relative(…)`, jamais `.system(size:)` (`FixedFontSizeGuardTests`) ;
  - `.adaptiveOnChange`, jamais `.onChange` brut ;
  - chaînes `String(localized: "<clé existante>", defaultValue: "…", bundle: .main)` en réutilisant les clés existantes ; une clé neuve exige son entrée au catalogue `Localizable.xcstrings` (`LocalizationConsistencyTests`).
- **Tests** : XCTest, `test_{méthode}_{condition}_{résultatAttendu}`, fabriques de données sans mutation partagée. On teste le comportement par l'API publique. Garde de source (`AppSourceGuard.stripComments`) seulement là où aucune API ne se teste (câblage de `ConversationView`).
- **Simulateurs dédiés** (créés en Tâche 1) :
  - `Meeshy-LongPress` : iPhone 16 Pro, runtime `com.apple.CoreSimulator.SimRuntime.iOS-26-1` ;
  - `Meeshy-LongPress-18` : iPhone 16 Pro, runtime `iOS-18-2`.
- **Test ciblé de l'app** (jamais `meeshy.sh test` pendant les tâches ; le gate complet est en Tâche 24) :
  ```bash
  cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
  xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
    -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
    -configuration Debug -enableCodeCoverage NO \
    -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
    -skipPackageUpdates \
    -only-testing:MeeshyTests/<Classe> \
    -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
    2>&1 | tee /tmp/meeshy-longpress-<Classe>.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
  ```
  - Un fichier neuf n'entre au bundle qu'après `xcodegen generate`. Avant de committer, vérifier le delta du pbxproj : `grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj`, comparé à `git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources'`, doit valoir +N (jamais −).
  - Le pbxproj régénéré se committe avec la tâche.
  - Un RED qui ne rougit pas signale un fichier absent du bundle.
- **Test ciblé du SDK** :
  ```bash
  cd /Users/smpceo/Documents/v2_meeshy-longpress/packages/MeeshySDK && \
  xcodebuild test -scheme MeeshySDK-Package \
    -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
    -skipPackageUpdates -only-testing:MeeshyUITests/<Classe> \
    -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/MeeshySDK-longpress-dd \
    2>&1 | tee /tmp/meeshy-longpress-sdk-<Classe>.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
  ```
- **Commit par tâche** :
  - `git add <chemins explicites>` ;
  - `git commit -m "<type>(ios|sdk): <résultat en français> (#n)"`, avec `Refs #n` dans le corps (jamais `Closes` avant la Tâche 24), puis les trailers :
    ```
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
    ```
  - `git show --stat HEAD` pour vérifier le contenu, puis `git push origin claude/appui-long-rendu-du-mode`.
- **Budget (D4)** : toute tâche qui touche `ConversationView.swift`, `MessageListViewController.swift` ou `MessageOverlayMenu.swift` relève `wc -l` avant et après, et écrit le Δ dans le corps du commit. **Δ ≤ 0 par fichier.** Compenser par une relocalisation pure vers un fichier neuf, en vérifiant d'abord qu'aucune garde de `apps/ios/MeeshyTests` ne lit le bloc déplacé (`git grep -n '<ancre>' -- apps/ios/MeeshyTests`). `FocalRow.swift` n'est jamais modifié.

## Répartition et ordre d'exécution


| Partie | Tâches | Issues | Rédacteur |
|---|---|---|---|
| P1 | 1 Préparation · 2 Drapeau · 3 Loi de présentation · 4 Clavier câblé | #5980 | agent P1 |
| P2 | 5 SDK barre · 6 Actions Rivière · 7 Libellés + toutes les options · 8 Fabrique de contexte · 9 `initialItem: .media` · 10 Routeur · 11 Menu glass | #5982, #5983, #5984 | agent P2 |
| P3 | 12 Effets coupés · 13 Lien fournisseurs · 14 Rangée de la liste · 15 Géométrie · 16 Overlay remonté + montage · 17 Vérif. simulateur Bulle/Focal/Script | #5981, #5982 | agent P3 |
| P4 | 18 Bulle Rivière · 19 Fournisseur Rivière + câblage · 20 Vérif. Rivière · 21 Éligibilité double tap · 22 Double tap câblé · 23 Vérif. double tap | #5983, #5984 | agent P4 |
| — | 24 Gate complet, preuve de budget, clôture des issues | tous | orchestrateur |

Ordre d'exécution : 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24. Une tâche peut consommer tout ce que produit une tâche de numéro inférieur.

---

## Partie P1 — Préparation, drapeau, loi de présentation, clavier câblé (#5980)

Tâches 1 à 4 du plan « L'appui long montre le message tel qu'on le lit ». Contrat : `docs/superpowers/plans/2026-09-10-appui-long-rendu-du-mode-contrat.md`. Spec : `docs/superpowers/specs/2026-09-10-appui-long-rendu-du-mode-design.md` (§2.3, D7, §4, §5.1, §5.3, §9).

Toutes les commandes partent du worktree `/Users/smpceo/Documents/v2_meeshy-longpress` : le répertoire courant du shell retombe entre deux appels, chaque commande commence donc par `cd /Users/smpceo/Documents/v2_meeshy-longpress && `.

> ⚠️ Écart au contrat
>
> 1. **Tâche 1 — une garde lit la déclaration.** Le contrat dit « Aucune garde ne lit la déclaration ». C'est faux : `ConversationSelectionGuardTests.test_selectionCap_is100` (`apps/ios/MeeshyTests/Unit/ConversationSelectionGuardTests.swift:40-46`) cherche `static let selectionCap = 100` dans `ConversationView.swift`, et ce texte est DANS le bloc déplacé. Le relevé sur les 24 propriétés du type ne trouve aucune autre garde touchée. La Tâche 1 re-pointe donc cette garde sur l'unité de l'écran (`AppSourceGuard.conversationViewSource()`), sans changer son assertion, et ajoute `ConversationOverlayState.swift` à `AppSourceGuard.conversationViewCompanions`.
> 2. **Tâche 1 — `legacyLineCeiling` n'est pas abaissé.** D4 demande d'abaisser le plafond quand le cumul baisse. S'il descendait ici, les Tâches 8, 10, 16, 19 et 22, qui reconsomment la réserve dans `ConversationView.swift`, feraient rougir `FileSizeBudgetGuardTests`. Le cumul est remesuré et le plafond abaissé en Tâche 24. La garde est à sens unique (`XCTAssertLessThanOrEqual`) : une baisse ne la fait pas rougir.
> 3. **Tâche 4 — un ajout à la loi, sans renommage.** La décision de fermeture devient une loi pure testable par son comportement (spec §9.1, « Fermeture ») plutôt qu'une garde de source. Ajouts dans `LongPressPresentationPlan.swift` :
>    ```swift
>    struct LongPressDismissRestoration: Equatable { let raisesKeyboard: Bool; let restoredShowOptions: Bool? }
>    extension LongPressPresentationPlan {
>        static func dismissRestoration(keyboardWasVisible: Bool, showOptions: Bool, isEditing: Bool, isSelectionModeActive: Bool) -> LongPressDismissRestoration
>    }
>    ```
>    `restoreStateAfterLongPressIfNeeded()` garde sa signature et son effet (contrat Tâche 4). La Tâche 16 peut y ajouter `overlayState.liftedRow = nil` sans rien casser.
> 4. **Tâche 4 — `raiseComposerKeyboardIfMounted()` suit l'aiguillage réel du `body`.** Le contrat résume la garde à `!overlayState.isSelectionModeActive`. Or `ConversationView.swift:1938-1951` remplace aussi la barre pour un contact bloqué (`blockedDirectParticipantId != nil`) et une conversation fermée (`viewModel.isConversationClosed`). Un `focusTrigger` posé sur une barre démontée n'est jamais consommé : il reste à `true`, et le réveil suivant (`true` sur `true`) ne déclenche plus rien. La garde lit donc les trois conditions. Le nom ne change pas.
> 5. **Tâche 4 — `keyboardWasVisible` exclut le champ de recherche.** Le champ de recherche de l'en-tête est lié (`ConversationView+MessageRow.swift:69`, `.focused($isSearchFocused)`). Avec `keyboardHeight > 0` seul, un appui long pendant une recherche relèverait à la fermeture le clavier du COMPOSER. La valeur mémorisée est `keyboardHeight > 0 && !isSearchFocused`. La baisse, elle, reste pilotée par la transition : le clavier de recherche est bien baissé avant le menu.
> 6. **Tâche 4 — `presentLongPressMenu` écarte une présentation périmée.** À la fin de l'attente, la suite n'a lieu que si `overlayState.overlayMessage?.id == message.id` et si le menu n'est pas déjà ouvert : un second appui long pendant la descente du clavier a pris la place du premier. L'ancre `restoreAfterLongPress = (keyboardWasVisible:` est conservée.

---

### Tâche 1 : L'état d'overlay de la conversation quitte le fichier hors budget

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift`
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:24-80` (retrait pur du bloc)
- Modifier : `apps/ios/MeeshyTests/Helpers/AppSourceGuard.swift:151-154` (compagnon de l'unité)
- Test : `apps/ios/MeeshyTests/Unit/ConversationSelectionGuardTests.swift:38-46` (re-pointage et témoin)
- Régénéré : `apps/ios/Meeshy.xcodeproj/project.pbxproj`

**Interfaces :**
- Consomme : rien.
- Produit :
  - `struct ConversationOverlayState`, à l'identique, dans `ConversationOverlayState.swift` ;
  - `AppSourceGuard.conversationViewCompanions`, qui contient `"Meeshy/Features/Main/Views/ConversationOverlayState.swift"` ;
  - les simulateurs `Meeshy-LongPress` (iOS 26.1) et `Meeshy-LongPress-18` (iOS 18.2) ;
  - la réserve : `ConversationView.swift` passe de 2861 à 2804 lignes (Δ −57).

- [ ] **Étape 0 : Simulateurs dédiés et relevés de départ**

Création idempotente : un simulateur qui existe déjà n'est pas recréé.

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
xcrun simctl list devices | grep -qE '^[[:space:]]+Meeshy-LongPress \(' \
  || xcrun simctl create "Meeshy-LongPress" com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro com.apple.CoreSimulator.SimRuntime.iOS-26-1 ; \
xcrun simctl list devices | grep -qE '^[[:space:]]+Meeshy-LongPress-18 \(' \
  || xcrun simctl create "Meeshy-LongPress-18" com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro com.apple.CoreSimulator.SimRuntime.iOS-18-2 ; \
xcrun simctl list devices | grep -E 'Meeshy-LongPress'
```

Attendu : exactement deux lignes, `Meeshy-LongPress (<UDID>) (Shutdown)` et `Meeshy-LongPress-18 (<UDID>) (Shutdown)`. Relancer la commande ne doit pas ajouter de troisième ligne.

Relevés :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift && \
git grep -n 'struct ConversationOverlayState' -- apps/ios/MeeshyTests ; \
git grep -n 'static let selectionCap = 100' -- apps/ios/MeeshyTests ; \
grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj
```

Attendu :
- `2861 apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` ;
- aucune ligne pour `struct ConversationOverlayState` ;
- une seule ligne : `apps/ios/MeeshyTests/Unit/ConversationSelectionGuardTests.swift:43:` — c'est la garde à re-pointer ;
- `3582`.

- [ ] **Étape 1 : Écrire le test qui échoue**

Dans `apps/ios/MeeshyTests/Unit/ConversationSelectionGuardTests.swift`, remplacer (lignes 38-46, verbatim) :

```swift
    // MARK: - Le plafond est bien 100 (retour porteur 2026-08-27)

    func test_selectionCap_is100() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(
            code.contains("static let selectionCap = 100"),
            "Le plafond de sélection doit être EXACTEMENT 100 — retour porteur explicite."
        )
    }
```

par :

```swift
    // MARK: - Le plafond est bien 100 (retour porteur 2026-08-27)

    /// Lu dans l'UNITÉ de l'écran, jamais dans son seul fichier-tête : l'état
    /// d'overlay a quitté `ConversationView.swift` (#5980, réserve de budget
    /// D4). Une garde qui lirait encore la tête rougirait sur un déménagement
    /// alors que le plafond n'a pas bougé (leçon 347).
    func test_selectionCap_is100() throws {
        let unit = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        XCTAssertTrue(
            unit.contains("static let selectionCap = 100"),
            "Le plafond de sélection doit être EXACTEMENT 100 — retour porteur explicite."
        )
    }

    /// **La réserve de budget ne se reconsomme pas en silence (#5980, D4).**
    /// `ConversationOverlayState` vit dans son fichier : le recopier dans
    /// `ConversationView.swift`, hors budget, rendrait les 57 lignes que le
    /// câblage de l'appui long compense. Le fichier appartient à l'unité de
    /// l'écran — sans cette adresse, les gardes qui la balaient perdraient le
    /// type.
    func test_overlayState_livesInItsOwnFile_withinTheConversationUnit() throws {
        let head = try source("Features/Main/Views/ConversationView.swift")
        let own = try source("Features/Main/Views/ConversationOverlayState.swift")
        XCTAssertFalse(
            head.contains("struct ConversationOverlayState"),
            "`ConversationOverlayState` est revenu dans `ConversationView.swift`, fichier hors budget."
        )
        XCTAssertTrue(
            own.contains("struct ConversationOverlayState {"),
            "`ConversationOverlayState.swift` doit déclarer le type."
        )
        XCTAssertTrue(
            AppSourceGuard.conversationViewCompanions.contains("Meeshy/Features/Main/Views/ConversationOverlayState.swift"),
            "Le fichier doit être un compagnon de l'unité `ConversationView`, sinon les gardes qui la balaient ne le voient pas."
        )
    }
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/ConversationSelectionGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-ConversationSelectionGuardTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```

Attendu : ÉCHEC.
- `Test Case '-[MeeshyTests.ConversationSelectionGuardTests test_overlayState_livesInItsOwnFile_withinTheConversationUnit]' failed` : `ConversationOverlayState.swift` n'existe pas, donc `source(…)` lève une erreur.
- `test_selectionCap_is100` passe : l'unité contient encore la tête.
- `Executed 20 tests, with 1 failure`.

Lire le code de sortie AVEC le journal `/tmp/meeshy-longpress-ConversationSelectionGuardTests.log` : un `** TEST FAILED **` sans ligne `Test Case … failed` est un échec de compilation, pas le RED attendu.

- [ ] **Étape 3.1 : Créer le fichier du type, à l'identique**

Créer `apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift` :

```swift
import SwiftUI
import MeeshySDK

// Extrait de `ConversationView.swift` (2 861 lignes, hors budget de la
// directive 2026-09-02, qui interdit d'AJOUTER à un fichier hors budget). Le
// câblage de l'appui long (#5980–#5984) ajoute des lignes à la vue : on
// extrait d'abord, on ajoute ensuite. Relocalisation PURE — le type est
// recopié à l'identique. Responsabilité tenue ici : l'ÉTAT des surfaces
// posées au-dessus du fil (menu d'appui long, sélection, feuilles, viewer de
// stories, fil de réponses), et rien d'autre.

struct ConversationOverlayState {
    var overlayMessage: Message? = nil
    /// Aperçu d'appui long en Focal : pixels de la cellule vivante + frame
    /// écran, capturés par le contrôleur au moment du geste. `nil` en mode
    /// bulles — l'overlay garde alors son `ThemedMessageBubble` historique.
    var showOverlayMenu = false
    var longPressEnabled = false
    /// **L'état à restituer à la fermeture du menu longpress (#4004).**
    /// `presentLongPressMenu` désactive le clavier/le panneau d'options AVANT
    /// de présenter le menu — sans cette mémoire, ils resteraient fermés une
    /// fois le menu refermé, même si l'auteur était en train de taper.
    /// `nil` tant qu'aucun longpress n'a capturé d'état à restituer.
    var restoreAfterLongPress: (isTyping: Bool, showOptions: Bool)? = nil
    /// **Mode sélection multiple (#4005).** `true` pendant que la liste bascule
    /// en sélection ; chaque bulle devient tappable pour ajouter/retirer de
    /// `selectedMessageIds`, plafonné à `ConversationOverlayState.
    /// selectionCap`. Quitter le mode (bouton Annuler) vide la sélection —
    /// jamais de sélection résiduelle qui réapparaît au prochain appui long.
    var isSelectionModeActive = false
    var selectedMessageIds: Set<String> = []
    /// Maximum de messages ET pièces jointes sélectionnables au total
    /// (retour porteur 2026-08-27, #4005).
    static let selectionCap = 100
    var detailSheetMessage: Message? = nil
    /// Message whose call-detail sheet (transcript-aware, `CallSummaryDetailSheet`)
    /// is presented — separate from `detailSheetMessage`, which stays wired to
    /// `MessageMoreSheet` for regular messages.
    var callDetailMessage: Message? = nil
    var moreSheetInitialItem: MoreItem? = nil
    /// Message dont le picker d'emoji complet (réaction) est présenté.
    var fullReactionPickerMessage: Message? = nil
    var quickReactionMessageId: String? = nil

    /// Bubble cell frame (window coordinates) of the message whose
    /// add-reaction button opened the quick-reaction bar. Anchors the bar's
    /// placement; `nil` falls back to the legacy bottom-pinned position.
    var quickReactionAnchorFrame: CGRect? = nil
    var emojiOnlyMode = false
    var deleteConfirmMessageId: String? = nil
    /// #4024 — confirmation de suppression GROUPÉE (mode sélection multiple),
    /// distincte de `deleteConfirmMessageId` (suppression d'UN message).
    var deleteConfirmSelectionActive = false
    /// Message dont la feuille de partage système (`UIActivityViewController`)
    /// est présentée — action « Partager » du menu « Plus… ».
    var shareMessage: Message? = nil
    var showStoryViewer = false
    var storyViewerUserId: String? = nil
    var storyViewerGroupIndex: Int = 0
    var storyViewerSlideIndex: Int = 0
    /// `true` quand le viewer est ouvert depuis l'avatar d'un expéditeur
    /// (première non-vue) ; `false` quand une story-reply cible une slide
    /// précise via `storyViewerSlideIndex`.
    var storyViewerStartAtFirstUnviewed = false
    var showReplyThread = false
    var replyThreadParentId: String? = nil
}
```

- [ ] **Étape 3.2 : Retirer le bloc de `ConversationView.swift`**

Dans `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`, remplacer (lignes 22-81, verbatim) :

```swift
}

struct ConversationOverlayState {
    var overlayMessage: Message? = nil
    /// Aperçu d'appui long en Focal : pixels de la cellule vivante + frame
    /// écran, capturés par le contrôleur au moment du geste. `nil` en mode
    /// bulles — l'overlay garde alors son `ThemedMessageBubble` historique.
    var showOverlayMenu = false
    var longPressEnabled = false
    /// **L'état à restituer à la fermeture du menu longpress (#4004).**
    /// `presentLongPressMenu` désactive le clavier/le panneau d'options AVANT
    /// de présenter le menu — sans cette mémoire, ils resteraient fermés une
    /// fois le menu refermé, même si l'auteur était en train de taper.
    /// `nil` tant qu'aucun longpress n'a capturé d'état à restituer.
    var restoreAfterLongPress: (isTyping: Bool, showOptions: Bool)? = nil
    /// **Mode sélection multiple (#4005).** `true` pendant que la liste bascule
    /// en sélection ; chaque bulle devient tappable pour ajouter/retirer de
    /// `selectedMessageIds`, plafonné à `ConversationOverlayState.
    /// selectionCap`. Quitter le mode (bouton Annuler) vide la sélection —
    /// jamais de sélection résiduelle qui réapparaît au prochain appui long.
    var isSelectionModeActive = false
    var selectedMessageIds: Set<String> = []
    /// Maximum de messages ET pièces jointes sélectionnables au total
    /// (retour porteur 2026-08-27, #4005).
    static let selectionCap = 100
    var detailSheetMessage: Message? = nil
    /// Message whose call-detail sheet (transcript-aware, `CallSummaryDetailSheet`)
    /// is presented — separate from `detailSheetMessage`, which stays wired to
    /// `MessageMoreSheet` for regular messages.
    var callDetailMessage: Message? = nil
    var moreSheetInitialItem: MoreItem? = nil
    /// Message dont le picker d'emoji complet (réaction) est présenté.
    var fullReactionPickerMessage: Message? = nil
    var quickReactionMessageId: String? = nil

    /// Bubble cell frame (window coordinates) of the message whose
    /// add-reaction button opened the quick-reaction bar. Anchors the bar's
    /// placement; `nil` falls back to the legacy bottom-pinned position.
    var quickReactionAnchorFrame: CGRect? = nil
    var emojiOnlyMode = false
    var deleteConfirmMessageId: String? = nil
    /// #4024 — confirmation de suppression GROUPÉE (mode sélection multiple),
    /// distincte de `deleteConfirmMessageId` (suppression d'UN message).
    var deleteConfirmSelectionActive = false
    /// Message dont la feuille de partage système (`UIActivityViewController`)
    /// est présentée — action « Partager » du menu « Plus… ».
    var shareMessage: Message? = nil
    var showStoryViewer = false
    var storyViewerUserId: String? = nil
    var storyViewerGroupIndex: Int = 0
    var storyViewerSlideIndex: Int = 0
    /// `true` quand le viewer est ouvert depuis l'avatar d'un expéditeur
    /// (première non-vue) ; `false` quand une story-reply cible une slide
    /// précise via `storyViewerSlideIndex`.
    var storyViewerStartAtFirstUnviewed = false
    var showReplyThread = false
    var replyThreadParentId: String? = nil
}

struct ConversationScrollState {
```

par :

```swift
}

struct ConversationScrollState {
```

Vérifier :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift && \
git diff --stat -- apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
```

Attendu : `2804` et `1 file changed, 57 deletions(-)`, sans aucune insertion.

- [ ] **Étape 3.3 : Nommer le compagnon dans l'unité de l'écran**

Dans `apps/ios/MeeshyTests/Helpers/AppSourceGuard.swift`, remplacer (lignes 151-154, verbatim) :

```swift
    static let conversationViewPath = "Meeshy/Features/Main/Views/ConversationView.swift"
    static let conversationViewCompanions = [
        "Meeshy/Features/Main/Views/ConversationComposerState.swift"
    ]
```

par :

```swift
    static let conversationViewPath = "Meeshy/Features/Main/Views/ConversationView.swift"
    static let conversationViewCompanions = [
        "Meeshy/Features/Main/Views/ConversationComposerState.swift",
        // L'état d'overlay, sorti de la tête le 2026-09-10 (#5980) pour
        // compenser le câblage de l'appui long (D4). Même raison que l'état du
        // composer : son nom ne porte pas celui du type hôte, le glob ne le
        // voit pas.
        "Meeshy/Features/Main/Views/ConversationOverlayState.swift"
    ]
```

L'unité lue par `ConversationEditDraftGuardTests`, `KeyboardTransitionTests`, `ConversationViewReadingModeAffordanceTests`, `ConversationCatchUpLawTests` et `ConversationTopChromeFadeTests` retrouve exactement le texte qu'elle contenait avant le déplacement.

- [ ] **Étape 4 : Lancer les tests et constater le succès**

Commande :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/ConversationSelectionGuardTests \
  -only-testing:MeeshyTests/ConversationEditDraftGuardTests \
  -only-testing:MeeshyTests/KeyboardTransitionTests \
  -only-testing:MeeshyTests/ConversationViewReadingModeAffordanceTests \
  -only-testing:MeeshyTests/ConversationCatchUpLawTests \
  -only-testing:MeeshyTests/ConversationTopChromeFadeTests \
  -only-testing:MeeshyTests/ConversationLongPressMenuGuardTests \
  -only-testing:MeeshyTests/FileSizeBudgetGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-Tache1.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```

Attendu : SUCCÈS.
- Aucune ligne `failed` ni `error:`.
- `Executed 94 tests, with 0 failures`, soit 20 + 4 + 18 + 17 + 10 + 11 + 10 + 4. Un total plus bas signale une classe qui n'a pas tourné : relire le journal.
- `FileSizeBudgetGuardTests` passe : le fichier neuf est sous le budget et le cumul de la dette baisse.

Vérifier que le fichier neuf est entré au projet :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
echo "après: $(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj) / avant: $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources')" && \
grep -c 'ConversationOverlayState.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git status --short
```

Attendu :
- `après: 3584 / avant: 3582` : +2, une entrée de fichier et une entrée de phase de compilation ;
- `2` ;
- `git status` montre exactement ces cinq chemins :
  - `M apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
  - `?? apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift`
  - `M apps/ios/MeeshyTests/Helpers/AppSourceGuard.swift`
  - `M apps/ios/MeeshyTests/Unit/ConversationSelectionGuardTests.swift`
  - `M apps/ios/Meeshy.xcodeproj/project.pbxproj`
  
  Le répertoire `docs/superpowers/plans/parts/` peut apparaître en `??` : il ne se committe pas avec la tâche. Tout autre chemin sous `apps/ios` est à examiner avant de committer.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/MeeshyTests/Helpers/AppSourceGuard.swift \
        apps/ios/MeeshyTests/Unit/ConversationSelectionGuardTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -F - <<'EOF'
refactor(ios): l'état d'overlay de la conversation quitte le fichier hors budget (#5980)

Relocalisation PURE de `struct ConversationOverlayState`, recopié à
l'identique de `ConversationView.swift` vers `ConversationOverlayState.swift`.
Aucune ligne de logique ne change : c'est la réserve de compensation du
câblage de l'appui long (D4).

Budget (D4) :
- ConversationView.swift : 2861 → 2804 lignes (Δ −57)
- legacyLineCeiling non abaissé : la réserve sert les tâches suivantes du lot,
  et le cumul est remesuré à la clôture (garde à sens unique).

Gardes :
- ConversationSelectionGuardTests.test_selectionCap_is100 lisait la
  DÉCLARATION dans la tête. Elle lit désormais l'unité de l'écran
  (AppSourceGuard.conversationViewSource()), assertion inchangée.
- ConversationOverlayState.swift entre dans conversationViewCompanions :
  les cinq gardes qui balaient l'unité lisent le même texte qu'avant.
- Témoin neuf : le type ne revient pas dans la tête.

Simulateurs dédiés : Meeshy-LongPress (iOS 26.1), Meeshy-LongPress-18 (iOS 18.2).

Refs #5980

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

Attendu : `git show --stat HEAD` liste les cinq chemins, avec `ConversationView.swift | 57 -`.

---

### Tâche 2 : Un drapeau garde l'appui long actuel vivant tant que le nouveau n'est pas validé

**Fichiers :**
- Modifier : `apps/ios/Meeshy/Features/Main/Focal/Preferences/MeeshyFeatureFlags.swift:82-94`
- Test : `apps/ios/MeeshyTests/Unit/Focal/LiftedRowLongPressFlagTests.swift` (neuf)
- Régénéré : `apps/ios/Meeshy.xcodeproj/project.pbxproj`

**Interfaces :**
- Consomme :
  - `BetaFeaturesPreference.isEnabled(defaults: UserDefaults, environment: [String: String]) -> Bool` ;
  - `BetaFeaturesPreference.setEnabled(_: Bool, defaults: UserDefaults)` ;
  - `BetaFeaturesPreference.environmentKey` ;
  - `ProcessEnvironmentSnapshot.current` ;
  - `LentilleFeatureFlag.readingModes.userDefaultsKey`.
- Produit (dans `nonisolated enum MeeshyFeatureFlags`) :
  ```swift
  static var isLiftedRowLongPressEnabled: Bool
  static func isLiftedRowLongPressEnabled(defaults: UserDefaults, environment: [String: String]) -> Bool
  ```
  Clés : `MEESHY_FLAG_LIFTED_ROW_LONG_PRESS` (environnement) et `meeshy.flag.lifted_row_long_press` (UserDefaults).

Rappel : `MessageListViewController.swift` et `MessageListView.swift` n'ont PAS le droit de lire ce drapeau. `BetaFeaturesReadingModesIntegrationTests.test_messageListViewController_neverMentionsFlagOrPreferenceTypes` n'y tolère que `MeeshyFeatureFlags.isAgentGrammarEnabled`. Le drapeau se lit dans `ConversationView` et descend par paramètre.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Focal/LiftedRowLongPressFlagTests.swift` :

```swift
import XCTest
@testable import Meeshy

/// **#5980 / #5981 — le drapeau de l'appui long qui montre le message tel
/// qu'on le lit (D2).**
///
/// Cascade à trois étages, dans l'ordre :
/// 1. l'environnement (`MEESHY_FLAG_LIFTED_ROW_LONG_PRESS`) ;
/// 2. sinon la clé propre SI ELLE EST POSÉE, dans les deux sens ;
/// 3. sinon le programme bêta, qui naît éteint.
///
/// Seule la variante injectable est lue, jamais `.standard` : pas de résidu
/// d'une suite à l'autre.
@MainActor
final class LiftedRowLongPressFlagTests: XCTestCase {

    private static let flagKey = "meeshy.flag.lifted_row_long_press"
    private static let flagEnvironmentKey = "MEESHY_FLAG_LIFTED_ROW_LONG_PRESS"

    private func makeIsolatedDefaults(flag: Bool? = nil, beta: Bool? = nil) -> UserDefaults {
        let defaults = UserDefaults(suiteName: "LiftedRowLongPressFlagTests-\(UUID().uuidString)")!
        if let flag { defaults.set(flag, forKey: Self.flagKey) }
        if let beta { BetaFeaturesPreference.setEnabled(beta, defaults: defaults) }
        return defaults
    }

    func test_isLiftedRowLongPressEnabled_nothingSet_isOff() {
        XCTAssertFalse(
            MeeshyFeatureFlags.isLiftedRowLongPressEnabled(defaults: makeIsolatedDefaults(), environment: [:]),
            "Une installation qui n'a rien demandé garde l'appui long actuel (D2)."
        )
    }

    func test_isLiftedRowLongPressEnabled_environmentOne_winsOverKeyAndBeta() {
        let defaults = makeIsolatedDefaults(flag: false, beta: false)
        XCTAssertTrue(
            MeeshyFeatureFlags.isLiftedRowLongPressEnabled(defaults: defaults, environment: [Self.flagEnvironmentKey: "1"])
        )
    }

    func test_isLiftedRowLongPressEnabled_environmentZero_winsOverKeyAndBeta() {
        let defaults = makeIsolatedDefaults(flag: true, beta: true)
        XCTAssertFalse(
            MeeshyFeatureFlags.isLiftedRowLongPressEnabled(defaults: defaults, environment: [Self.flagEnvironmentKey: "0"])
        )
    }

    func test_isLiftedRowLongPressEnabled_unknownEnvironmentValue_fallsThroughToTheKey() {
        let defaults = makeIsolatedDefaults(flag: true, beta: false)
        XCTAssertTrue(
            MeeshyFeatureFlags.isLiftedRowLongPressEnabled(defaults: defaults, environment: [Self.flagEnvironmentKey: "yes"])
        )
    }

    func test_isLiftedRowLongPressEnabled_keySetTrue_winsOverBetaOff() {
        let defaults = makeIsolatedDefaults(flag: true, beta: false)
        XCTAssertTrue(MeeshyFeatureFlags.isLiftedRowLongPressEnabled(defaults: defaults, environment: [:]))
    }

    func test_isLiftedRowLongPressEnabled_keySetFalse_winsOverBetaOn() {
        let defaults = makeIsolatedDefaults(flag: false, beta: true)
        XCTAssertFalse(
            MeeshyFeatureFlags.isLiftedRowLongPressEnabled(defaults: defaults, environment: [:]),
            "Une clé posée à `false` coupe le drapeau même bêta activée — la clé propre prime dans les deux sens."
        )
    }

    func test_isLiftedRowLongPressEnabled_noKey_followsBetaProgrammeOn() {
        let defaults = makeIsolatedDefaults(beta: true)
        XCTAssertTrue(MeeshyFeatureFlags.isLiftedRowLongPressEnabled(defaults: defaults, environment: [:]))
    }

    func test_isLiftedRowLongPressEnabled_noKey_followsBetaForcedByEnvironment() {
        let defaults = makeIsolatedDefaults()
        XCTAssertTrue(
            MeeshyFeatureFlags.isLiftedRowLongPressEnabled(
                defaults: defaults,
                environment: [BetaFeaturesPreference.environmentKey: "1"]
            )
        )
    }

    func test_isLiftedRowLongPressEnabled_independentFromReadingModesKey() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        XCTAssertFalse(
            MeeshyFeatureFlags.isLiftedRowLongPressEnabled(defaults: defaults, environment: [:]),
            "Allumer les modes de lecture n'allume pas l'appui long remonté : deux drapeaux, deux décisions."
        )
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LiftedRowLongPressFlagTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LiftedRowLongPressFlagTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```

Attendu : ÉCHEC de compilation du bundle de tests, avec des lignes `LiftedRowLongPressFlagTests.swift:…: error: type 'MeeshyFeatureFlags' has no member 'isLiftedRowLongPressEnabled'`.

S'il n'y a ni `error:` ni `Executed`, le fichier n'est pas entré au bundle : relancer `xcodegen generate`.

- [ ] **Étape 3 : Implémentation minimale**

Dans `apps/ios/Meeshy/Features/Main/Focal/Preferences/MeeshyFeatureFlags.swift`, remplacer (lignes 82-94, verbatim) :

```swift
    /// Variante injectable — voir `isReadingModesEnabled(defaults:environment:)`,
    /// même règle : jamais `.standard` dans un test.
    static func isAgentGrammarEnabled(
        defaults: UserDefaults,
        environment: [String: String]
    ) -> Bool {
        switch environment[agentGrammarEnvironmentKey] {
        case "1": return true
        case "0": return false
        default: return defaults.bool(forKey: agentGrammarUserDefaultsKey)
        }
    }
}
```

par :

```swift
    /// Variante injectable — voir `isReadingModesEnabled(defaults:environment:)`,
    /// même règle : jamais `.standard` dans un test.
    static func isAgentGrammarEnabled(
        defaults: UserDefaults,
        environment: [String: String]
    ) -> Bool {
        switch environment[agentGrammarEnvironmentKey] {
        case "1": return true
        case "0": return false
        default: return defaults.bool(forKey: agentGrammarUserDefaultsKey)
        }
    }

    // MARK: - `lifted_row_long_press` (#5980, #5981 — D2)

    /// **L'appui long qui montre le message tel qu'on le lit.** Le drapeau
    /// couvre :
    /// - la rangée de SON mode, remontée au-dessus du voile ;
    /// - la barre de réactions 2× sans fond ;
    /// - l'appui long de la Rivière ;
    /// - le double tap du Script.
    ///
    /// Éteint, l'overlay actuel, le `.contextMenu` de la Rivière et l'absence
    /// de double tap servent à l'identique : rien n'est retiré avant
    /// validation (#5985). L'activation pour tous est une décision du porteur,
    /// après validation au simulateur.
    ///
    /// Cascade à trois étages, la même que `LentilleFeatureFlag.isEnabled` :
    /// 1. l'environnement (`1` force, `0` coupe) ;
    /// 2. sinon la clé propre SI ELLE EST POSÉE, dans les deux sens : un
    ///    `false` posé coupe même bêta activée ;
    /// 3. sinon le programme bêta, qui naît éteint (2026-08-22).
    ///
    /// Ce n'est pas un `LentilleFeatureFlag` : il ne gouverne aucun mode de
    /// lecture. `BetaFeaturesPreference.enabledFeatures`, la liste des coches
    /// de la section « Bêta », ne le nomme donc pas. L'interrupteur est la
    /// bascule « Bêta » elle-même, ou la clé.
    private static let liftedRowLongPressUserDefaultsKey = "meeshy.flag.lifted_row_long_press"
    private static let liftedRowLongPressEnvironmentKey = "MEESHY_FLAG_LIFTED_ROW_LONG_PRESS"

    static var isLiftedRowLongPressEnabled: Bool {
        isLiftedRowLongPressEnabled(defaults: .standard, environment: ProcessEnvironmentSnapshot.current)
    }

    /// Variante injectable — même règle : jamais `.standard` dans un test.
    static func isLiftedRowLongPressEnabled(
        defaults: UserDefaults,
        environment: [String: String]
    ) -> Bool {
        switch environment[liftedRowLongPressEnvironmentKey] {
        case "1": return true
        case "0": return false
        default: break
        }
        guard defaults.object(forKey: liftedRowLongPressUserDefaultsKey) != nil else {
            return BetaFeaturesPreference.isEnabled(defaults: defaults, environment: environment)
        }
        return defaults.bool(forKey: liftedRowLongPressUserDefaultsKey)
    }
}
```

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LiftedRowLongPressFlagTests \
  -only-testing:MeeshyTests/AgentGrammarGateTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LiftedRowLongPressFlagTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```

Attendu : SUCCÈS.
- Les neuf `test_isLiftedRowLongPressEnabled_*` sont `passed`.
- `AgentGrammarGateTests` (13) reste vert : le fichier voisin n'a pas bougé.
- `Executed 22 tests, with 0 failures`.

Delta du projet :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
echo "après: $(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj) / avant: $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources')" && \
git status --short -- apps/ios
```

Attendu :
- +2 (`après: 3586 / avant: 3584`) ;
- `git status` ne montre que trois chemins :
  - `M apps/ios/Meeshy/Features/Main/Focal/Preferences/MeeshyFeatureFlags.swift`
  - `M apps/ios/Meeshy.xcodeproj/project.pbxproj`
  - `?? apps/ios/MeeshyTests/Unit/Focal/LiftedRowLongPressFlagTests.swift`

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add apps/ios/Meeshy/Features/Main/Focal/Preferences/MeeshyFeatureFlags.swift \
        apps/ios/MeeshyTests/Unit/Focal/LiftedRowLongPressFlagTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -F - <<'EOF'
feat(ios): un drapeau garde l'appui long actuel vivant tant que le nouveau n'est pas validé (#5980)

MeeshyFeatureFlags.isLiftedRowLongPressEnabled se résout en trois étages :
1. MEESHY_FLAG_LIFTED_ROW_LONG_PRESS (1/0) ;
2. sinon la clé meeshy.flag.lifted_row_long_press si elle est posée ;
3. sinon le programme bêta, qui naît éteint.

Éteint, l'overlay actuel, le .contextMenu de la Rivière et l'absence de
double tap servent à l'identique (D2). Neuf témoins couvrent la priorité de
l'environnement, la clé posée dans les deux sens, le repli bêta et
l'indépendance vis-à-vis des modes de lecture.

Aucun fichier hors budget touché.

Refs #5980

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

Attendu : `git show --stat HEAD` liste les trois chemins.

---

### Tâche 3 : Une loi pure décide de l'attente du clavier et du recentrage avant le menu

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Views/LongPressPresentationPlan.swift`
- Test : `apps/ios/MeeshyTests/Unit/Views/LongPressPresentationPlanTests.swift` (neuf)
- Régénéré : `apps/ios/Meeshy.xcodeproj/project.pbxproj`

**Interfaces :**
- Consomme :
  - `KeyboardTransition` (`Views/KeyboardTransition.swift`) : `init(height:duration:curve:announcedAt:)`, `height`, `duration`, `announcedAt`, `isLive(at:)`, `static let liveSlack` (0,1 s), `static let fallbackDuration` ;
  - `typealias ConversationReadingMode = ReadingModeOrchestrator.ConversationReadingMode` (`Focal/Preferences/ReadingModePreferenceStore.swift:20`), cas `focal, script, summary, river, bubbles` ;
  - `ConversationView.longPressRepositionThreshold` (`Views/ConversationView+LongPressMenu.swift:14`, `0.6`).
- Produit :
  ```swift
  enum LongPressPresentationStyle: Equatable { case longPress, scriptDoubleTap }

  enum LongPressPresentationPlan {
      static let recenterThreshold: CGFloat = 0.6
      static func keyboardWait(for transition: KeyboardTransition?, now: Date) -> TimeInterval?
      static func shouldRecenter(cellFrame: CGRect?, windowHeight: CGFloat, mode: ConversationReadingMode) -> Bool
  }
  ```
  Les deux types sont isolés `@MainActor` par défaut (`SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor`), comme `KeyboardTransition`, qu'ils lisent.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/LongPressPresentationPlanTests.swift` :

```swift
import XCTest
import UIKit
@testable import Meeshy

/// **#5980 — ce qui se décide AVANT d'ouvrir le menu d'un message.**
///
/// Deux questions, une seule source pour y répondre :
/// - combien attendre que le clavier soit descendu ;
/// - faut-il recentrer le message.
///
/// La loi est pure : ni clavier, ni fenêtre, ni horloge réelle. L'instant est
/// fixé, et la transition annoncée est une valeur.
@MainActor
final class LongPressPresentationPlanTests: XCTestCase {

    private static let now = Date(timeIntervalSinceReferenceDate: 800_000_000)
    private static let windowHeight: CGFloat = 1000

    private func transition(
        height: CGFloat = 336,
        duration: TimeInterval = 0.35,
        announcedSecondsAgo: TimeInterval
    ) -> KeyboardTransition {
        KeyboardTransition(
            height: height,
            duration: duration,
            curve: .curveEaseInOut,
            announcedAt: Self.now.addingTimeInterval(-announcedSecondsAgo)
        )
    }

    private func cellFrame(midY: CGFloat) -> CGRect {
        CGRect(x: 0, y: midY - 40, width: 390, height: 80)
    }

    // MARK: - keyboardWait

    func test_keyboardWait_noTransitionKnown_returnsNil() {
        XCTAssertNil(
            LongPressPresentationPlan.keyboardWait(for: nil, now: Self.now),
            "Aucun clavier n'a jamais parlé : ni baisse ni attente, la présentation est synchrone."
        )
    }

    func test_keyboardWait_keyboardDown_returnsNil() {
        XCTAssertNil(
            LongPressPresentationPlan.keyboardWait(for: transition(height: 0, announcedSecondsAgo: 5), now: Self.now),
            "Clavier baissé (hauteur 0) : ni baisse ni attente."
        )
    }

    func test_keyboardWait_keyboardUpAndSettled_waitsDurationPlusSlack() throws {
        let wait = try XCTUnwrap(
            LongPressPresentationPlan.keyboardWait(for: transition(duration: 0.35, announcedSecondsAgo: 5), now: Self.now)
        )
        XCTAssertEqual(wait, 0.35 + KeyboardTransition.liveSlack, accuracy: 0.0001)
    }

    func test_keyboardWait_keyboardStillRising_addsTheRemainderOfTheAnnouncement() throws {
        let wait = try XCTUnwrap(
            LongPressPresentationPlan.keyboardWait(for: transition(duration: 0.35, announcedSecondsAgo: 0.1), now: Self.now)
        )
        let remainder = 0.35 + KeyboardTransition.liveSlack - 0.1
        XCTAssertEqual(wait, remainder + 0.35 + KeyboardTransition.liveSlack, accuracy: 0.0001)
    }

    func test_keyboardWait_announcementJustOver_addsNoRemainder() throws {
        let elapsed = 0.35 + KeyboardTransition.liveSlack
        let wait = try XCTUnwrap(
            LongPressPresentationPlan.keyboardWait(for: transition(duration: 0.35, announcedSecondsAgo: elapsed), now: Self.now)
        )
        XCTAssertEqual(wait, 0.35 + KeyboardTransition.liveSlack, accuracy: 0.0001)
    }

    // MARK: - shouldRecenter

    func test_shouldRecenter_messageBelowThreshold_outsideRiver_recenters() {
        for mode in ConversationReadingMode.allCases where mode != .river {
            XCTAssertTrue(
                LongPressPresentationPlan.shouldRecenter(
                    cellFrame: cellFrame(midY: 800),
                    windowHeight: Self.windowHeight,
                    mode: mode
                ),
                "Message trop bas en \(mode) : la liste le recentre avant le menu."
            )
        }
    }

    func test_shouldRecenter_messageAboveThreshold_doesNotRecenter() {
        XCTAssertFalse(
            LongPressPresentationPlan.shouldRecenter(cellFrame: cellFrame(midY: 300), windowHeight: Self.windowHeight, mode: .focal)
        )
    }

    func test_shouldRecenter_messageExactlyOnThreshold_doesNotRecenter() {
        XCTAssertFalse(
            LongPressPresentationPlan.shouldRecenter(cellFrame: cellFrame(midY: 600), windowHeight: Self.windowHeight, mode: .script),
            "Le seuil est STRICT : un milieu posé sur les 60 % ne recentre pas."
        )
    }

    func test_shouldRecenter_river_neverRecenters_evenAtTheBottom() {
        XCTAssertFalse(
            LongPressPresentationPlan.shouldRecenter(cellFrame: cellFrame(midY: 990), windowHeight: Self.windowHeight, mode: .river),
            "La Rivière ne recentre jamais : son pane ne défile pas par `scrollState` (D5)."
        )
    }

    func test_shouldRecenter_unknownFrame_doesNotRecenter() {
        XCTAssertFalse(
            LongPressPresentationPlan.shouldRecenter(cellFrame: nil, windowHeight: Self.windowHeight, mode: .bubbles),
            "Cellule non matérialisée : rien à mesurer, rien à recentrer."
        )
    }

    func test_recenterThreshold_isTheConversationThreshold() {
        XCTAssertEqual(
            LongPressPresentationPlan.recenterThreshold,
            ConversationView.longPressRepositionThreshold,
            "Un seul seuil : la loi et la conversation ne peuvent pas diverger (D3)."
        )
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LongPressPresentationPlanTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LongPressPresentationPlanTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```

Attendu : ÉCHEC de compilation, avec des lignes `LongPressPresentationPlanTests.swift:…: error: cannot find 'LongPressPresentationPlan' in scope`.

- [ ] **Étape 3 : Implémentation minimale**

Créer `apps/ios/Meeshy/Features/Main/Views/LongPressPresentationPlan.swift` :

```swift
// apps/ios/Meeshy/Features/Main/Views/LongPressPresentationPlan.swift

import CoreGraphics
import Foundation

/// Les deux présentations du menu d'un message (#5980, #5984).
///
/// - `.longPress` : la liste compacte sous la rangée, la barre de réactions
///   sans fond au-dessus.
/// - `.scriptDoubleTap` : la porte complète du Script. La barre garde sa
///   capsule, à cheval sur la rangée, et toutes les options sont dessous (D6).
enum LongPressPresentationStyle: Equatable {
    case longPress
    case scriptDoubleTap
}

/// **Ce qui se décide AVANT d'ouvrir le menu d'un message (#5980).**
///
/// Deux questions, dans cet ordre :
/// 1. combien de temps laisser au clavier pour descendre ;
/// 2. faut-il recentrer le message avant de présenter.
///
/// Une seule source y répond. La conversation n'en garde que le câblage
/// (`ConversationView+LongPressMenu`).
///
/// La loi est pure. Ses entrées sont des valeurs : la transition ANNONCÉE
/// par le clavier, l'instant, le cadre, le mode. Elle ne relit jamais l'état
/// juste après `resignFirstResponder`, où rien n'a encore bougé (D7).
enum LongPressPresentationPlan {

    /// Au-delà de cette fraction de la hauteur de fenêtre, le milieu du
    /// message est trop bas pour que le menu tienne dessous : la liste le
    /// recentre d'abord. `ConversationView.longPressRepositionThreshold` en
    /// est la projection.
    static let recenterThreshold: CGFloat = 0.6

    /// L'attente avant de présenter, calculée depuis la transition connue
    /// AVANT la baisse.
    ///
    /// `nil` ⇒ aucun clavier levé : ni baisse ni attente, la présentation est
    /// synchrone. Sinon, l'attente est la somme de deux termes :
    /// - ce qui reste de l'annonce en cours, si le clavier bouge encore ;
    /// - la descente estimée, soit la durée annoncée plus la marge
    ///   `liveSlack`.
    ///
    /// La descente n'est annoncée qu'une fois déclenchée. La durée de la
    /// dernière annonce connue en est l'estimation, et `KeyboardTransition`
    /// la remplace déjà par `fallbackDuration` quand le clavier n'en annonce
    /// aucune. Un clavier matériel ou flottant qui n'annonce rien ne
    /// déclenche aucune attente.
    static func keyboardWait(for transition: KeyboardTransition?, now: Date) -> TimeInterval? {
        guard let transition, transition.height > 0 else { return nil }
        let descent = transition.duration + KeyboardTransition.liveSlack
        let remainder = transition.isLive(at: now)
            ? max(0, descent - now.timeIntervalSince(transition.announcedAt))
            : 0
        return remainder + descent
    }

    /// Faut-il recentrer le message avant de présenter ?
    ///
    /// - **Jamais en Rivière (D5).** Son pane ne défile pas par `scrollState`,
    ///   et la liste du Fil, cachée dessous, défilerait pour rien. La
    ///   géométrie de l'overlay tient le bloc dans l'écran.
    /// - **Jamais sur un cadre inconnu.** La cellule n'est pas matérialisée :
    ///   il n'y a rien à mesurer.
    /// - **Sinon**, dès que le milieu du cadre dépasse STRICTEMENT le seuil de
    ///   la hauteur de FENÊTRE (`DeviceLayout.windowSize`, jamais la dalle).
    static func shouldRecenter(cellFrame: CGRect?, windowHeight: CGFloat, mode: ConversationReadingMode) -> Bool {
        guard mode != .river, let cellFrame else { return false }
        return cellFrame.midY > windowHeight * recenterThreshold
    }
}
```

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LongPressPresentationPlanTests \
  -only-testing:MeeshyTests/KeyboardTransitionTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LongPressPresentationPlanTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```

Attendu : SUCCÈS.
- Les onze tests de `LongPressPresentationPlanTests` et les dix-huit de `KeyboardTransitionTests` sont `passed`.
- `Executed 29 tests, with 0 failures`.

Delta du projet :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
echo "après: $(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj) / avant: $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources')" && \
git status --short -- apps/ios
```

Attendu :
- +4, un fichier d'app et un fichier de test (`après: 3590 / avant: 3586`) ;
- trois chemins :
  - `?? apps/ios/Meeshy/Features/Main/Views/LongPressPresentationPlan.swift`
  - `?? apps/ios/MeeshyTests/Unit/Views/LongPressPresentationPlanTests.swift`
  - `M apps/ios/Meeshy.xcodeproj/project.pbxproj`

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add apps/ios/Meeshy/Features/Main/Views/LongPressPresentationPlan.swift \
        apps/ios/MeeshyTests/Unit/Views/LongPressPresentationPlanTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -F - <<'EOF'
feat(ios): une loi pure décide de l'attente du clavier et du recentrage avant le menu (#5980)

LongPressPresentationPlan répond aux deux questions posées AVANT d'ouvrir le
menu d'un message.

- keyboardWait : nil sans clavier levé. Sinon, le reste de l'annonce en cours
  si elle vit, plus la durée annoncée et liveSlack. La valeur est calculée sur
  la transition connue avant la baisse, jamais relue après
  resignFirstResponder.
- shouldRecenter : jamais en Rivière ni sur un cadre inconnu. Sinon, milieu du
  cadre > 60 % de la hauteur de fenêtre. Le seuil égale
  ConversationView.longPressRepositionThreshold.

LongPressPresentationStyle nomme les deux présentations (.longPress,
.scriptDoubleTap). Onze témoins de comportement.

Aucun fichier hors budget touché.

Refs #5980

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

Attendu : `git show --stat HEAD` liste les trois chemins.

---

### Tâche 4 : Le clavier se baisse avant le menu et revient au composer à la fermeture

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Views/KeyboardDismissing.swift`
- Modifier : `apps/ios/Meeshy/Features/Main/Views/LongPressPresentationPlan.swift` (fin du fichier, loi de fermeture)
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift:1-109` (réécriture)
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationComposerState.swift:106` (ajout sous `draftBeforeEdit`)
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift:193-195`
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift:19-24` (fichier créé en Tâche 1)
- Test : `apps/ios/MeeshyTests/Unit/ConversationLongPressMenuGuardTests.swift` (re-pointée)
- Test : `apps/ios/MeeshyTests/Unit/Views/LongPressPresentationPlanTests.swift` (témoins de la loi de fermeture)
- Régénéré : `apps/ios/Meeshy.xcodeproj/project.pbxproj`

**Interfaces :**
- Consomme :
  - Tâche 1 : `ConversationOverlayState.swift` et `AppSourceGuard.conversationViewCompanions`, qui le nomme.
  - Tâche 3 : `LongPressPresentationPlan.keyboardWait(for:now:)`, `.shouldRecenter(cellFrame:windowHeight:mode:)`, `.recenterThreshold`, et `LongPressPresentationStyle`.
  - Existant, tout en accès interne :
    - `ConversationView.keyboardHeight: CGFloat` (`+Keyboard.swift:15`) ;
    - `keyboardTransition: KeyboardTransition?` (`ConversationView.swift:307`) ;
    - `isSearchFocused` (`@FocusState`, `:273`, lié en `+MessageRow.swift:69`) ;
    - `readingModeController.mode` (`@Published private(set)`, lisible) ;
    - `blockedDirectParticipantId: String?` (`:438`) ;
    - `viewModel.isConversationClosed` ;
    - `scrollState`, `composerState`, `overlayState` ;
    - `UniversalComposerBar.focusTrigger: Binding<Bool>` (`UniversalComposerBar.swift:286`). Il est déclaré après `hideEffects` (`:263`) et `onAnyInteraction` (`:282`), et la conversation ne passe aucun paramètre déclaré entre les deux.
- Produit :
  ```swift
  @MainActor protocol KeyboardDismissing { func dismissKeyboard() }
  struct SystemKeyboardDismisser: KeyboardDismissing { func dismissKeyboard() }

  // ConversationComposerState
  var focusTrigger = false

  // ConversationOverlayState
  var restoreAfterLongPress: (keyboardWasVisible: Bool, showOptions: Bool)? = nil

  // LongPressPresentationPlan.swift
  struct LongPressDismissRestoration: Equatable { let raisesKeyboard: Bool; let restoredShowOptions: Bool? }
  extension LongPressPresentationPlan {
      static func dismissRestoration(keyboardWasVisible: Bool, showOptions: Bool, isEditing: Bool, isSelectionModeActive: Bool) -> LongPressDismissRestoration
  }

  // extension ConversationView (ConversationView+LongPressMenu.swift)
  static let longPressRepositionThreshold: CGFloat   // = LongPressPresentationPlan.recenterThreshold
  static let longPressRepositionDelay: TimeInterval   // 0.3, inchangé
  static var keyboardDismisser: any KeyboardDismissing = SystemKeyboardDismisser()
  func presentLongPressMenu(for message: Message, cellFrame: CGRect?, style: LongPressPresentationStyle = .longPress)
  func continueLongPressPresentation(for message: Message, cellFrame: CGRect?, style: LongPressPresentationStyle)
  func raiseComposerKeyboardIfMounted()
  func restoreStateAfterLongPressIfNeeded()
  ```
  - `UniversalComposerBar(…, hideEffects: …, focusTrigger: $composerState.focusTrigger)`.
  - `composerState.focusTrigger = true` s'écrit en UN seul site de l'unité `ConversationView` : `raiseComposerKeyboardIfMounted()`. Les Tâches 10, 16, 19 et 22 appellent cette méthode et n'écrivent jamais le réveil elles-mêmes. La garde `test_focusTrigger_isWokenFromASingleSite_inTheConversationUnit` compte ces écritures.
  - `ConversationView.swift` n'est pas touché : Δ 0, la réserve de la Tâche 1 reste entière.

- [ ] **Étape 1 : Re-pointer la garde de câblage (test qui échoue)**

Remplacer le contenu ENTIER de `apps/ios/MeeshyTests/Unit/ConversationLongPressMenuGuardTests.swift` (lu en entier : 211 lignes, 10 tests) par le texte ci-dessous.
- Cinq tests restent mot pour mot : `cellFrameInWindow`, `onLongPress` type, `centersVertically`, `customLongPressSite`, `dismissSite`.
- Quatre sont re-pointés sur les nouvelles ancres : `dismissesKeyboard…`, `scrollsTowardCenter`, `savesState…`, `restore…`.
- Le test de sélection devient `raiseComposerKeyboardIfMounted_neverWakesAnUnmountedComposer`. Son comportement est aussi témoigné à l'Étape 3.
- Trois tests sont neufs.

L'assertion d'ORDRE est gardée et renforcée : la présentation n'a qu'une porte (`continueLongPressPresentation`), et quand un clavier est levé, cette porte n'est planifiée qu'APRÈS `Self.keyboardDismisser.dismissKeyboard()`.

```swift
import XCTest
@testable import Meeshy

/// **#4004, #5980 — le menu longpress custom baisse le clavier, attend sa
/// descente, remonte le message vers le centre s'il est trop bas, puis
/// présente. À la fermeture, le composer retrouve son clavier.**
///
/// Périmètre : le menu longpress CUSTOM piloté par
/// `overlayState.showOverlayMenu`. Le menu NATIF (`.contextMenu`, iOS 26+)
/// est présenté par le système sans point d'interception AVANT ouverture —
/// hors périmètre de cette garde.
///
/// Garde de SOURCE, là seulement où aucune API ne se teste : le câblage de
/// `ConversationView`, qu'on ne monte pas sans UIKit réel (R5/R15). Les
/// DÉCISIONS — attente du clavier, recentrage, restitution — sont une loi
/// pure testée par son comportement (`LongPressPresentationPlanTests`).
final class ConversationLongPressMenuGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
        return AppSourceGuard.stripComments(
            try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        )
    }

    private func body(of anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }

    // MARK: - `presentLongPressMenu` baisse le clavier AVANT de présenter

    func test_presentLongPressMenu_dismissesKeyboardAndOptionsBeforePresenting() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let present = body(of: "func presentLongPressMenu(", in: code),
              let proceed = body(of: "func continueLongPressPresentation(", in: code) else {
            return XCTFail("`presentLongPressMenu` / `continueLongPressPresentation` introuvables — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            present.contains("Self.keyboardDismisser.dismissKeyboard()"),
            "`presentLongPressMenu` doit BAISSER le clavier par `KeyboardDismissing` avant de présenter le menu."
        )
        XCTAssertTrue(
            present.contains("composerState.showOptions = false"),
            "`presentLongPressMenu` doit fermer le panneau d'options du composer s'il était ouvert."
        )
        XCTAssertTrue(
            present.contains("LongPressPresentationPlan.keyboardWait(for: keyboardTransition, now: Date())"),
            "L'attente se calcule par la loi, sur la transition connue AVANT la baisse — jamais relue juste après `resignFirstResponder`."
        )
        XCTAssertFalse(
            present.contains("showOverlayMenu = true"),
            "`presentLongPressMenu` ne présente pas lui-même : la présentation n'a qu'une porte, `continueLongPressPresentation`."
        )
        XCTAssertTrue(
            proceed.contains("showOverlayMenu = true"),
            "`continueLongPressPresentation` est la porte de présentation."
        )
        guard let dismissRange = present.range(of: "Self.keyboardDismisser.dismissKeyboard()") else {
            return XCTFail("Ancre `Self.keyboardDismisser.dismissKeyboard()` introuvable.")
        }
        let beforeDismiss = present[..<dismissRange.lowerBound]
        let afterDismiss = present[dismissRange.upperBound...]
        XCTAssertFalse(
            beforeDismiss.contains("asyncAfter"),
            "Aucune présentation différée ne se planifie AVANT la baisse du clavier."
        )
        XCTAssertTrue(
            afterDismiss.contains("asyncAfter(deadline: .now() + wait)")
                && afterDismiss.contains("continueLongPressPresentation("),
            "Clavier levé : la présentation se planifie APRÈS la baisse, au terme de l'attente — la baisse "
                + "précède toujours `showOverlayMenu = true`."
        )
    }

    // MARK: - Repositionnement vers le centre quand la loi le décide

    func test_continueLongPressPresentation_scrollsTowardCenter_whenTheLawSaysSo() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func continueLongPressPresentation(", in: code) else {
            return XCTFail("`continueLongPressPresentation` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("LongPressPresentationPlan.shouldRecenter(") && fn.contains("cellFrame: cellFrame"),
            "Le recentrage se décide par la loi, sur le cadre reçu du site d'appel UIKit (`cellFrameInWindow`) — "
                + "PAS `frameTracker`, jamais alimenté en mode liste standard (revue 2026-08-27)."
        )
        XCTAssertTrue(
            fn.contains("mode: readingModeController.mode"),
            "La loi reçoit le mode COURANT : c'est elle qui refuse tout recentrage en Rivière (D5)."
        )
        XCTAssertTrue(
            fn.contains("windowHeight: DeviceLayout.windowSize.height"),
            "Le seuil se mesure sur la FENÊTRE, jamais sur la dalle (Split View, Slide Over)."
        )
        XCTAssertFalse(
            code.contains("frameTracker.frame(for:"),
            "Le menu longpress ne doit PLUS lire `frameTracker` : `MessageFramePreferenceKey` ne traverse la "
                + "frontière UIKit qu'en mode Rivière — l'utiliser rendrait le repositionnement un NO-OP "
                + "silencieux en mode liste standard."
        )
        XCTAssertTrue(
            fn.contains("scrollState.scrollToMessageId ="),
            "Le recentrage passe par `scrollState.scrollToMessageId` — le même mécanisme que le saut vers une "
                + "citation ou un message non lu."
        )
        XCTAssertTrue(
            fn.contains("scrollState.scrollToMessageTrigger +="),
            "Le recentrage incrémente `scrollToMessageTrigger` pour déclencher le scroll."
        )
        guard let trigger = fn.range(of: "scrollState.scrollToMessageTrigger +="),
              let delayed = fn.range(of: "asyncAfter(deadline: .now() + Self.longPressRepositionDelay)") else {
            return XCTFail("Ancres du scroll / de la présentation différée introuvables.")
        }
        XCTAssertTrue(
            trigger.lowerBound < delayed.lowerBound,
            "Le message remonte AVANT que le menu ne se présente, jamais après."
        )
    }

    // MARK: - Le frame voyage AVEC l'appel, résolu côté UIKit (même patron qu'`onAddReaction`)

    func test_cellFrameInWindow_isTheSourceOfTruth_forTheStandardListMode() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        guard let handler = body(of: "let longPressHandler: ((String) -> Void) = { [weak self] tappedId in", in: code) else {
            return XCTFail("Le wrapper `longPressHandler` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            handler.contains("self.onLongPress?(tappedId, self.cellFrameInWindow(messageId: tappedId))"),
            "Le wrapper `longPressHandler` doit résoudre le frame via `cellFrameInWindow` et le transmettre "
                + "AVEC l'id — même patron qu'`addReactionHandler`, la seule voie fiable en mode liste standard."
        )
    }

    func test_onLongPress_propertyType_carriesTheFrame() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(
            code.contains("var onLongPress: ((String, CGRect?) -> Void)?"),
            "`MessageListViewController.onLongPress` doit porter le frame (`CGRect?`), pas seulement l'id."
        )
    }

    // MARK: - `scrollToItem` est bien CENTRÉ (pas top/bottom)

    func test_scrollToMessage_centersVertically() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        guard let fn = body(of: "private func beginVerifiedScroll(", in: code) else {
            return XCTFail("`beginVerifiedScroll` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("at: .centeredVertically"),
            "Le scroll déclenché par le longpress doit centrer verticalement le message — sans ce "
                + "positionnement, remonter la liste ne garantit pas que le menu tienne entièrement à l'écran."
        )
    }

    // MARK: - Le site du longpress custom appelle le point d'entrée unique

    func test_customLongPressSite_callsPresentLongPressMenu() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(
            code.contains("presentLongPressMenu(for: msg, cellFrame: cellFrame)"),
            "Le site du longpress custom doit appeler `presentLongPressMenu(for:cellFrame:)` avec le frame "
                + "reçu du callback — point d'entrée unique."
        )
    }

    // MARK: - L'état baissé à l'ouverture est mémorisé ET restitué à la fermeture

    func test_presentLongPressMenu_savesStateBeforeDismissing() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func presentLongPressMenu(", in: code) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        guard let saveRange = fn.range(of: "restoreAfterLongPress = (keyboardWasVisible: keyboardHeight > 0 && !isSearchFocused, showOptions: composerState.showOptions)"),
              let closeOptionsRange = fn.range(of: "composerState.showOptions = false"),
              let dismissRange = fn.range(of: "Self.keyboardDismisser.dismissKeyboard()") else {
            return XCTFail("Ancres de sauvegarde / fermeture du panneau / baisse du clavier introuvables.")
        }
        XCTAssertTrue(
            saveRange.lowerBound < closeOptionsRange.lowerBound,
            "L'état doit être SAUVEGARDÉ avant que le panneau ne se ferme — sinon on mémorise déjà `false`."
        )
        XCTAssertTrue(
            saveRange.lowerBound < dismissRange.lowerBound,
            "L'état du clavier doit être SAUVEGARDÉ avant la baisse — après, la hauteur lue ne dit plus ce qui "
                + "était à l'écran."
        )
    }

    func test_restoreStateAfterLongPressIfNeeded_appliesTheDismissLaw() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func restoreStateAfterLongPressIfNeeded(", in: code) else {
            return XCTFail("`restoreStateAfterLongPressIfNeeded` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("LongPressPresentationPlan.dismissRestoration("),
            "La restitution suit la loi `dismissRestoration`, testée par son comportement — pas une seconde "
                + "décision écrite dans la vue."
        )
        XCTAssertTrue(
            fn.contains("keyboardWasVisible: saved.keyboardWasVisible"),
            "La loi reçoit l'état MÉMORISÉ à l'ouverture, pas celui du moment."
        )
        XCTAssertTrue(
            fn.contains("isEditing: composerState.editingMessageId != nil"),
            "« Modifier » ouvre l'édition au MÊME dismiss : sans ce signal, la restitution laisserait baissé le "
                + "clavier que l'édition veut levé."
        )
        XCTAssertTrue(
            fn.contains("isSelectionModeActive: overlayState.isSelectionModeActive"),
            "« Sélectionner » rouvrait le clavier (retour porteur 2026-08-27) : la loi doit savoir qu'une "
                + "sélection vient de s'ouvrir."
        )
        XCTAssertTrue(
            fn.contains("raiseComposerKeyboardIfMounted()"),
            "La relève passe par le réveil du composer — le seul site qui pose `focusTrigger`."
        )
        XCTAssertTrue(
            fn.contains("composerState.showOptions = showOptions"),
            "Le panneau d'options est restitué quand la loi le dit."
        )
    }

    // MARK: - Le réveil du composer (#5980)

    func test_raiseComposerKeyboardIfMounted_neverWakesAnUnmountedComposer() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func raiseComposerKeyboardIfMounted(", in: code) else {
            return XCTFail("`raiseComposerKeyboardIfMounted` introuvable — la garde ne mesurerait rien.")
        }
        guard let selectionGuard = fn.range(of: "guard !overlayState.isSelectionModeActive"),
              let wake = fn.range(of: "composerState.focusTrigger = true") else {
            return XCTFail("Ancres `guard !overlayState.isSelectionModeActive` / `composerState.focusTrigger = true` introuvables.")
        }
        XCTAssertTrue(
            selectionGuard.lowerBound < wake.lowerBound,
            "Mode sélection : le composer est REMPLACÉ par `selectionToolbar` — aucun `focusTrigger` ne doit être "
                + "posé. Posé sur une barre démontée, il n'est jamais consommé et fige le réveil suivant "
                + "(`true` sur `true`)."
        )
        XCTAssertTrue(
            fn.contains("blockedDirectParticipantId == nil") && fn.contains("!viewModel.isConversationClosed"),
            "Contact bloqué et conversation fermée remplacent aussi la barre (aiguillage du `body`) : même garde."
        )
    }

    func test_focusTrigger_isWokenFromASingleSite_inTheConversationUnit() throws {
        let unit = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        XCTAssertEqual(
            unit.components(separatedBy: "focusTrigger = true").count - 1, 1,
            "`composerState.focusTrigger = true` s'écrit en UN site de l'écran, `raiseComposerKeyboardIfMounted()` : "
                + "un réveil posé ailleurs contournerait la garde du composer démonté."
        )
    }

    func test_themedComposer_passesTheFocusTrigger() throws {
        let code = try source("Features/Main/Views/ConversationView+Composer.swift")
        XCTAssertTrue(
            code.contains("focusTrigger: $composerState.focusTrigger"),
            "Sans `focusTrigger:` passé à `UniversalComposerBar`, la barre reçoit `.constant(false)` : le réveil "
                + "posé par la conversation ne lève aucun clavier (#5980)."
        )
    }

    func test_longPressMenu_neverWritesIsTyping() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        XCTAssertFalse(
            code.contains("isTyping"),
            "`isTyping` n'est lié à aucun champ : y écrire ne baisse ni ne lève rien. Le clavier se lit "
                + "`keyboardHeight`, se baisse par `KeyboardDismissing`, se relève par `focusTrigger` — "
                + "réveiller les lecteurs d'`isTyping` est #5988."
        )
    }

    // MARK: - Le site de fermeture appelle la restitution via `adaptiveOnChange`, jamais `onChange` brut

    func test_dismissSite_wiresRestoration_viaAdaptiveOnChange() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(
            code.contains(".adaptiveOnChange(of: overlayState.showOverlayMenu)"),
            "La fermeture du menu doit être observée via `.adaptiveOnChange`, convention du dépôt "
                + "(`ConversationView.body` a déjà crashé de profondeur de pile par `.onChange` brut empilé)."
        )
        XCTAssertTrue(
            code.contains("restoreStateAfterLongPressIfNeeded()"),
            "Le site de fermeture doit appeler `restoreStateAfterLongPressIfNeeded()`."
        )
        XCTAssertFalse(
            code.contains(".onChange(of: overlayState.showOverlayMenu)"),
            "Un `.onChange` brut a remplacé `.adaptiveOnChange` — régression de la convention du dépôt."
        )
    }
}
```

- [ ] **Étape 2 : Lancer la garde et constater l'échec**

Commande :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/ConversationLongPressMenuGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-ConversationLongPressMenuGuardTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```

Attendu : ÉCHEC, `Executed 13 tests, with 8 failures`.

`failed` (huit) :
- `test_presentLongPressMenu_dismissesKeyboardAndOptionsBeforePresenting` : `continueLongPressPresentation` n'existe pas ;
- `test_continueLongPressPresentation_scrollsTowardCenter_whenTheLawSaysSo` ;
- `test_presentLongPressMenu_savesStateBeforeDismissing` : ancre `keyboardWasVisible` absente ;
- `test_restoreStateAfterLongPressIfNeeded_appliesTheDismissLaw` ;
- `test_raiseComposerKeyboardIfMounted_neverWakesAnUnmountedComposer` ;
- `test_focusTrigger_isWokenFromASingleSite_inTheConversationUnit` : 0 site au lieu de 1 ;
- `test_themedComposer_passesTheFocusTrigger` ;
- `test_longPressMenu_neverWritesIsTyping` : le fichier écrit encore `isTyping`.

`passed` (cinq) : `cellFrameInWindow…`, `onLongPress_propertyType…`, `scrollToMessage_centersVertically`, `customLongPressSite…`, `dismissSite…`.

- [ ] **Étape 3 : Écrire les témoins de la loi de fermeture (test qui échoue)**

Dans `apps/ios/MeeshyTests/Unit/Views/LongPressPresentationPlanTests.swift` (créé en Tâche 3), remplacer (verbatim, fin du fichier) :

```swift
    func test_recenterThreshold_isTheConversationThreshold() {
        XCTAssertEqual(
            LongPressPresentationPlan.recenterThreshold,
            ConversationView.longPressRepositionThreshold,
            "Un seul seuil : la loi et la conversation ne peuvent pas diverger (D3)."
        )
    }
}
```

par :

```swift
    func test_recenterThreshold_isTheConversationThreshold() {
        XCTAssertEqual(
            LongPressPresentationPlan.recenterThreshold,
            ConversationView.longPressRepositionThreshold,
            "Un seul seuil : la loi et la conversation ne peuvent pas diverger (D3)."
        )
    }

    // MARK: - dismissRestoration (#5980, spec §9.1 « Fermeture »)

    func test_dismissRestoration_noAction_keyboardWasUp_raisesItBack() {
        XCTAssertEqual(
            LongPressPresentationPlan.dismissRestoration(
                keyboardWasVisible: true, showOptions: false, isEditing: false, isSelectionModeActive: false
            ),
            LongPressDismissRestoration(raisesKeyboard: true, restoredShowOptions: false),
            "Fermeture sans action, clavier levé à l'ouverture : il revient."
        )
    }

    func test_dismissRestoration_noAction_keyboardWasDown_restoresOnlyTheOptions() {
        XCTAssertEqual(
            LongPressPresentationPlan.dismissRestoration(
                keyboardWasVisible: false, showOptions: true, isEditing: false, isSelectionModeActive: false
            ),
            LongPressDismissRestoration(raisesKeyboard: false, restoredShowOptions: true),
            "Fermeture sans action, clavier baissé à l'ouverture : aucun clavier n'apparaît, le panneau revient."
        )
    }

    func test_dismissRestoration_editingJustStarted_raisesTheKeyboard_evenIfItWasDown() {
        XCTAssertEqual(
            LongPressPresentationPlan.dismissRestoration(
                keyboardWasVisible: false, showOptions: true, isEditing: true, isSelectionModeActive: false
            ),
            LongPressDismissRestoration(raisesKeyboard: true, restoredShowOptions: nil),
            "« Modifier » : le clavier se lève pour taper la modification, le panneau reste fermé (D7)."
        )
    }

    func test_dismissRestoration_selectionJustStarted_raisesNothing_restoresNothing() {
        XCTAssertEqual(
            LongPressPresentationPlan.dismissRestoration(
                keyboardWasVisible: true, showOptions: true, isEditing: false, isSelectionModeActive: true
            ),
            LongPressDismissRestoration(raisesKeyboard: false, restoredShowOptions: nil),
            "« Sélectionner » : le composer est remplacé par la barre de sélection — aucun réveil (retour porteur 2026-08-27)."
        )
    }

    func test_dismissRestoration_selectionWinsOverEditing() {
        XCTAssertEqual(
            LongPressPresentationPlan.dismissRestoration(
                keyboardWasVisible: true, showOptions: false, isEditing: true, isSelectionModeActive: true
            ),
            LongPressDismissRestoration(raisesKeyboard: false, restoredShowOptions: nil),
            "Composer démonté : même une édition ne pose aucun réveil."
        )
    }
}
```

- [ ] **Étape 4 : Lancer les témoins de la loi et constater l'échec**

Commande :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LongPressPresentationPlanTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LongPressPresentationPlanTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```

Attendu : ÉCHEC de compilation du bundle de tests, avec :
- `LongPressPresentationPlanTests.swift:…: error: type 'LongPressPresentationPlan' has no member 'dismissRestoration'` ;
- `…: error: cannot find 'LongPressDismissRestoration' in scope`.

- [ ] **Étape 5.1 : Implémentation — le protocole de baisse du clavier**

Créer `apps/ios/Meeshy/Features/Main/Views/KeyboardDismissing.swift` :

```swift
// apps/ios/Meeshy/Features/Main/Views/KeyboardDismissing.swift

import UIKit

/// **Baisser le clavier, quel que soit le champ qui le tient (#5980, D7).**
///
/// La conversation ne sait pas QUI est premier répondant :
/// - le champ du composer vit dans `UniversalComposerBar`, derrière son
///   propre `@FocusState` ;
/// - le champ de recherche vit dans l'en-tête ;
/// - `ConversationView.isTyping` n'est lié à aucun champ depuis
///   `6c994219e8` (#5988) : y écrire `false` ne baissait rien.
///
/// L'action remonte donc la chaîne des répondants jusqu'au champ qui tient
/// le clavier. La perte de focus du composer enregistre le brouillon
/// (`onFocusChange`) : c'est voulu.
///
/// Un protocole, pour qu'un double puisse compter les appels ;
/// l'implémentation système ne se teste pas hors d'une fenêtre.
@MainActor
protocol KeyboardDismissing {
    func dismissKeyboard()
}

struct SystemKeyboardDismisser: KeyboardDismissing {
    func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}
```

- [ ] **Étape 5.2 : Implémentation — la loi de fermeture**

Dans `apps/ios/Meeshy/Features/Main/Views/LongPressPresentationPlan.swift`, remplacer (verbatim, fin du fichier créé en Tâche 3) :

```swift
    static func shouldRecenter(cellFrame: CGRect?, windowHeight: CGFloat, mode: ConversationReadingMode) -> Bool {
        guard mode != .river, let cellFrame else { return false }
        return cellFrame.midY > windowHeight * recenterThreshold
    }
}
```

par :

```swift
    static func shouldRecenter(cellFrame: CGRect?, windowHeight: CGFloat, mode: ConversationReadingMode) -> Bool {
        guard mode != .river, let cellFrame else { return false }
        return cellFrame.midY > windowHeight * recenterThreshold
    }
}

/// Ce que la fermeture du menu d'un message rend au composer (#5980, D7).
struct LongPressDismissRestoration: Equatable {
    /// Lever le clavier du composer (par `raiseComposerKeyboardIfMounted()`).
    let raisesKeyboard: Bool
    /// L'état du panneau d'options à reposer ; `nil` ⇒ n'y pas toucher.
    let restoredShowOptions: Bool?
}

extension LongPressPresentationPlan {

    /// Ce que la fermeture rend. Les cas se tranchent dans cet ordre :
    /// 1. **Sélection ouverte** (« Sélectionner », au même dismiss) : la barre
    ///    de sélection a REMPLACÉ le composer. Il n'y a rien à lever ni à
    ///    reposer (retour porteur 2026-08-27).
    /// 2. **Édition ouverte** (« Modifier ») : le clavier se lève pour taper
    ///    la modification, quel qu'ait été son état, et le panneau reste
    ///    fermé. Comportement nouveau : l'ancien réveil passait par
    ///    `isTyping`, lié à aucun champ.
    /// 3. **Sinon** : l'état d'avant l'appui long, clavier et panneau.
    static func dismissRestoration(
        keyboardWasVisible: Bool,
        showOptions: Bool,
        isEditing: Bool,
        isSelectionModeActive: Bool
    ) -> LongPressDismissRestoration {
        guard !isSelectionModeActive else {
            return LongPressDismissRestoration(raisesKeyboard: false, restoredShowOptions: nil)
        }
        guard !isEditing else {
            return LongPressDismissRestoration(raisesKeyboard: true, restoredShowOptions: nil)
        }
        return LongPressDismissRestoration(raisesKeyboard: keyboardWasVisible, restoredShowOptions: showOptions)
    }
}
```

- [ ] **Étape 5.3 : Implémentation — le réveil du composer, déclaré puis passé à la barre**

Dans `apps/ios/Meeshy/Features/Main/Views/ConversationComposerState.swift`, remplacer (lignes 104-106, verbatim) :

```swift
    /// Posé UNE fois par `beginEdit` (jamais réécrit tant qu'une édition est
    /// en cours), consommé et effacé par `cancelEdit`.
    var draftBeforeEdit: String? = nil
```

par :

```swift
    /// Posé UNE fois par `beginEdit` (jamais réécrit tant qu'une édition est
    /// en cours), consommé et effacé par `cancelEdit`.
    var draftBeforeEdit: String? = nil
    /// **Le réveil du champ du composer (#5980, D7).** Posé à vrai pour lever
    /// le clavier ; `UniversalComposerBar` le consomme et le remet elle-même
    /// à faux (`UniversalComposerBar+Layout`). Un seul site l'écrit :
    /// `ConversationView.raiseComposerKeyboardIfMounted()`. Posé pendant que
    /// la barre est démontée, il resterait vrai sans jamais être consommé, et
    /// le réveil suivant ne changerait plus rien.
    var focusTrigger = false
```

Dans `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift`, remplacer (lignes 192-195, verbatim) :

```swift
            pendingEffects: $viewModel.pendingEffects,
            onRequestEffectsPicker: { viewModel.showEffectsPicker = true },
            hideEffects: composerState.editingMessageId != nil
            )
```

par :

```swift
            pendingEffects: $viewModel.pendingEffects,
            onRequestEffectsPicker: { viewModel.showEffectsPicker = true },
            hideEffects: composerState.editingMessageId != nil,
            // Réveil du champ (#5980). Déclaré après `hideEffects` et
            // `onAnyInteraction`, il vient en dernier dans l'ordre de
            // l'initialiseur memberwise. Seul `raiseComposerKeyboardIfMounted()`
            // le pose ; la barre le remet elle-même à faux.
            focusTrigger: $composerState.focusTrigger
            )
```

- [ ] **Étape 5.4 : Implémentation — la mémoire de l'ouverture change de sens**

Dans `apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift`, remplacer (lignes 19-24, verbatim) :

```swift
    /// **L'état à restituer à la fermeture du menu longpress (#4004).**
    /// `presentLongPressMenu` désactive le clavier/le panneau d'options AVANT
    /// de présenter le menu — sans cette mémoire, ils resteraient fermés une
    /// fois le menu refermé, même si l'auteur était en train de taper.
    /// `nil` tant qu'aucun longpress n'a capturé d'état à restituer.
    var restoreAfterLongPress: (isTyping: Bool, showOptions: Bool)? = nil
```

par :

```swift
    /// **L'état à restituer à la fermeture du menu longpress (#4004, #5980).**
    /// `presentLongPressMenu` baisse le clavier et ferme le panneau d'options
    /// AVANT de présenter le menu. Sans cette mémoire, ils resteraient fermés
    /// une fois le menu refermé, même si l'auteur était en train de taper.
    ///
    /// `keyboardWasVisible` se lit sur la transition du clavier
    /// (`keyboardHeight > 0`, hors champ de recherche), jamais sur
    /// `isTyping`, lié à aucun champ (#5988).
    ///
    /// `nil` tant qu'aucun longpress n'a capturé d'état à restituer.
    var restoreAfterLongPress: (keyboardWasVisible: Bool, showOptions: Bool)? = nil
```

- [ ] **Étape 5.5 : Implémentation — le câblage de l'appui long**

Remplacer le contenu ENTIER de `apps/ios/Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift` (lu en entier, 109 lignes) par :

```swift
// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Longpress Menu Presentation (#4004, #5980)

extension ConversationView {

    /// Sous ce seuil (fraction de la hauteur d'écran), le message est jugé
    /// assez haut pour que le menu s'affiche entièrement sans remonter la
    /// liste. Au-delà, le message est trop bas — la liste remonte jusqu'à ce
    /// qu'il soit proche du centre vertical AVANT que le menu ne s'ouvre.
    /// Projection de la loi : une seule valeur (D3). Cette adresse reste
    /// jusqu'à #5985.
    static let longPressRepositionThreshold: CGFloat = LongPressPresentationPlan.recenterThreshold

    /// Le temps laissé à `scrollToItem(at: .centeredVertically, animated:
    /// true)` (`MessageListViewController.beginVerifiedScroll`) pour amener
    /// le message vers le centre avant de présenter le menu par-dessus.
    static let longPressRepositionDelay: TimeInterval = 0.3

    /// Qui baisse le clavier : le système en production, un double qui compte
    /// les appels dans un test.
    static var keyboardDismisser: any KeyboardDismissing = SystemKeyboardDismisser()

    /// **Le point d'entrée UNIQUE du menu longpress (#4004, #5980).**
    ///
    /// Trois temps, tous AVANT la présentation (sinon le menu s'ouvrirait mal
    /// placé puis se recalerait sous les yeux de l'auteur) :
    /// 1. l'état à restituer est MÉMORISÉ, puis le panneau d'options se ferme ;
    /// 2. si un clavier est levé, `KeyboardDismissing` le BAISSE et la suite
    ///    attend sa descente. L'attente vient de
    ///    `LongPressPresentationPlan.keyboardWait`, calculée sur la transition
    ///    connue AVANT la baisse : juste après `resignFirstResponder`, rien
    ///    n'a encore bougé. Sans clavier, la suite est synchrone ;
    /// 3. `continueLongPressPresentation` recentre si besoin, puis présente.
    ///
    /// « Clavier levé » se lit sur la transition (`keyboardHeight > 0`).
    /// `isTyping` n'est lié à aucun champ : y écrire ne baissait rien, et sa
    /// relève ne relevait rien (#5988). Le champ de recherche de l'en-tête est
    /// baissé comme tout autre champ, mais il ne fait pas relever le clavier
    /// du composer à la fermeture.
    ///
    /// `cellFrame` (`nil` si la cellule n'est pas matérialisée) vient du SITE
    /// D'APPEL UIKit (`MessageListViewController.cellFrameInWindow`, même
    /// patron qu'`onAddReaction`), jamais de `frameTracker` (revue
    /// 2026-08-27) : `MessageFramePreferenceKey` ne traverse la frontière
    /// UIKit qu'en mode Rivière.
    ///
    /// Au terme de l'attente, la présentation n'a lieu que si ce message est
    /// toujours celui de l'overlay et si le menu n'est pas déjà ouvert. Sinon,
    /// un second appui long pendant la descente a pris sa place.
    func presentLongPressMenu(for message: Message, cellFrame: CGRect?, style: LongPressPresentationStyle = .longPress) {
        overlayState.overlayMessage = message
        overlayState.restoreAfterLongPress = (keyboardWasVisible: keyboardHeight > 0 && !isSearchFocused, showOptions: composerState.showOptions)
        composerState.showOptions = false

        guard let wait = LongPressPresentationPlan.keyboardWait(for: keyboardTransition, now: Date()) else {
            continueLongPressPresentation(for: message, cellFrame: cellFrame, style: style)
            return
        }

        Self.keyboardDismisser.dismissKeyboard()
        // `self` est une struct SwiftUI : la fermeture copie la vue, mais
        // `@State` porte un stockage PARTAGÉ — lire et muter `overlayState` ici
        // touche bien l'état affiché, sans risque de cycle (pas de classe).
        DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
            guard self.overlayState.overlayMessage?.id == message.id,
                  !self.overlayState.showOverlayMenu else { return }
            self.continueLongPressPresentation(for: message, cellFrame: cellFrame, style: style)
        }
    }

    /// **Recentre si la loi le décide, puis présente (#4004, #5980).**
    ///
    /// `LongPressPresentationPlan.shouldRecenter` décide sur le mode COURANT.
    /// - **En Rivière, jamais** : son pane ne défile pas par `scrollState`, et
    ///   la liste du Fil, cachée dessous, défilerait pour rien.
    /// - **Hors Rivière**, un message trop bas fait remonter la liste vers son
    ///   centre AVANT que `showOverlayMenu` ne passe à `true`. Le mécanisme est
    ///   le scroll centré existant (`scrollState.scrollToMessageId` /
    ///   `scrollToMessageTrigger`), la MÊME voie que le saut vers une citation
    ///   ou un message non lu.
    ///
    /// `DeviceLayout.windowSize`, jamais `UIScreen.main.bounds` : le seuil se
    /// mesure sur la FENÊTRE où l'app est rendue, pas sur la dalle. En Split
    /// View ou Slide Over, la dalle est bien plus haute que la fenêtre : une
    /// cellule au bas de la fenêtre restait alors sous le seuil, et le menu
    /// paraissait sans le recentrage qu'il exige.
    ///
    /// `cellFrame` est celui du GESTE. Quand un clavier vient de descendre, la
    /// liste a bougé depuis ; la relecture du cadre après l'attente arrive
    /// avec la rangée remontée (#5981).
    func continueLongPressPresentation(for message: Message, cellFrame: CGRect?, style: LongPressPresentationStyle) {
        guard LongPressPresentationPlan.shouldRecenter(
            cellFrame: cellFrame,
            windowHeight: DeviceLayout.windowSize.height,
            mode: readingModeController.mode
        ) else {
            overlayState.showOverlayMenu = true
            return
        }

        scrollState.scrollToMessageId = message.id
        scrollState.scrollToMessageTrigger += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.longPressRepositionDelay) {
            self.overlayState.showOverlayMenu = true
        }
    }

    /// **Lève le clavier du composer, s'il est monté (#5980, D7).**
    ///
    /// Le vrai focus est celui de `UniversalComposerBar` : son réveil
    /// `focusTrigger` le prend, puis se remet lui-même à faux. Posé sur une
    /// barre démontée, il ne serait jamais consommé, et le réveil suivant ne
    /// changerait plus rien. D'où la garde, qui suit l'aiguillage du `body` :
    /// la sélection, un contact bloqué et une conversation fermée remplacent
    /// tous trois la barre.
    ///
    /// C'est le SEUL site de l'écran qui pose le réveil : tout lever de clavier
    /// du composer passe par ici.
    func raiseComposerKeyboardIfMounted() {
        guard !overlayState.isSelectionModeActive,
              blockedDirectParticipantId == nil,
              !viewModel.isConversationClosed else { return }
        composerState.focusTrigger = true
    }

    /// **Restitue ce que `presentLongPressMenu` a baissé (#4004, #5980).**
    /// Appelée quand le menu se referme (`.adaptiveOnChange(of:
    /// overlayState.showOverlayMenu)`, câblé au site de montage du menu).
    ///
    /// La décision est la loi `LongPressPresentationPlan.dismissRestoration`.
    /// Ses deux signaux, `editingMessageId != nil` et `isSelectionModeActive`,
    /// sont posés au MÊME dismiss : l'overlay exécute l'action choisie
    /// (« Modifier », « Sélectionner »), puis se referme.
    func restoreStateAfterLongPressIfNeeded() {
        guard let saved = overlayState.restoreAfterLongPress else { return }
        overlayState.restoreAfterLongPress = nil
        let restoration = LongPressPresentationPlan.dismissRestoration(
            keyboardWasVisible: saved.keyboardWasVisible,
            showOptions: saved.showOptions,
            isEditing: composerState.editingMessageId != nil,
            isSelectionModeActive: overlayState.isSelectionModeActive
        )
        if restoration.raisesKeyboard {
            raiseComposerKeyboardIfMounted()
        }
        guard let showOptions = restoration.restoredShowOptions else { return }
        composerState.showOptions = showOptions
    }
}
```

Points de contrôle, à relire avant de lancer :
- **Texte que lit `CallDetailRoutingTests`** (source brute, commentaires compris) :
  - le fichier contient `overlayState.showOverlayMenu = true` ;
  - il ne contient ni `messageSource != .system` ni `overlayState.callDetailMessage = msg`.
- **Site d'appel inchangé.** `ConversationView.swift:1722` appelle toujours `presentLongPressMenu(for: msg, cellFrame: cellFrame)`, et `style` y prend sa valeur par défaut.

- [ ] **Étape 6 : Lancer les tests et constater le succès**

Commande :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/ConversationLongPressMenuGuardTests \
  -only-testing:MeeshyTests/LongPressPresentationPlanTests \
  -only-testing:MeeshyTests/CallDetailRoutingTests \
  -only-testing:MeeshyTests/ConversationSelectionGuardTests \
  -only-testing:MeeshyTests/ConversationEditDraftGuardTests \
  -only-testing:MeeshyTests/KeyboardTransitionTests \
  -only-testing:MeeshyTests/ConversationStickerSendGuardTests \
  -only-testing:MeeshyTests/ComposerIngestWiringParityTests \
  -only-testing:MeeshyTests/FileSizeBudgetGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-Tache4.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```

Attendu : SUCCÈS.
- Aucune ligne `failed` ni `error:`.
- `Executed 84 tests, with 0 failures`, soit 13 + 16 + 4 + 20 + 4 + 18 + 4 + 1 + 4. Un total plus bas signale une classe qui n'a pas tourné : relire `/tmp/meeshy-longpress-Tache4.log`.

Preuve de budget (D4) et delta du projet :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
      apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift \
      apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift && \
git diff --stat HEAD -- apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
      apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift \
      apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift && \
echo "après: $(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj) / avant: $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources')" && \
git status --short -- apps/ios
```

Attendu :
- `ConversationView.swift` vaut toujours `2804` ;
- le `git diff --stat` sur les trois fichiers hors budget est VIDE (Δ 0 chacun) ;
- +2 sur le projet (`KeyboardDismissing.swift`) ;
- `git status` montre exactement neuf chemins :
  - `M apps/ios/Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift`
  - `M apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift`
  - `M apps/ios/Meeshy/Features/Main/Views/ConversationComposerState.swift`
  - `M apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift`
  - `M apps/ios/Meeshy/Features/Main/Views/LongPressPresentationPlan.swift`
  - `?? apps/ios/Meeshy/Features/Main/Views/KeyboardDismissing.swift`
  - `M apps/ios/MeeshyTests/Unit/ConversationLongPressMenuGuardTests.swift`
  - `M apps/ios/MeeshyTests/Unit/Views/LongPressPresentationPlanTests.swift`
  - `M apps/ios/Meeshy.xcodeproj/project.pbxproj`

- [ ] **Étape 7 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add apps/ios/Meeshy/Features/Main/Views/KeyboardDismissing.swift \
        apps/ios/Meeshy/Features/Main/Views/LongPressPresentationPlan.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationComposerState.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift \
        apps/ios/MeeshyTests/Unit/ConversationLongPressMenuGuardTests.swift \
        apps/ios/MeeshyTests/Unit/Views/LongPressPresentationPlanTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -F - <<'EOF'
fix(ios): le clavier se baisse avant le menu d'appui long et revient au composer à la fermeture (#5980)

isTyping n'était lié à aucun champ : presentLongPressMenu, la restitution et
« Modifier » écrivaient dans le vide. Le clavier restait levé sous le menu, et
rien ne le relevait après.

- Clavier levé = keyboardHeight > 0 (hors champ de recherche). La baisse passe
  par KeyboardDismissing (resignFirstResponder envoyé à l'application).
- L'attente vient de LongPressPresentationPlan.keyboardWait, calculée sur la
  transition connue AVANT la baisse. Sans clavier, la présentation reste
  synchrone.
- continueLongPressPresentation recentre par la loi (jamais en Rivière), puis
  présente. Une présentation périmée (second appui long pendant la descente)
  est écartée.
- La relève passe par composerState.focusTrigger, enfin passé à
  UniversalComposerBar. raiseComposerKeyboardIfMounted() en est le seul
  site : il ne réveille jamais une barre démontée (sélection, contact
  bloqué, conversation fermée).
- La fermeture suit LongPressPresentationPlan.dismissRestoration : sélection ⇒
  rien ; édition ⇒ clavier levé (nouveau) ; sinon l'état d'avant.

Gardes : ConversationLongPressMenuGuardTests est re-pointée sur les nouvelles
ancres. L'ordre « la baisse précède showOverlayMenu = true » est gardé : la
présentation n'a qu'une porte, planifiée après la baisse. Témoins neufs :
réveil à site unique, focusTrigger passé à la barre, isTyping jamais écrit.
Cinq témoins de comportement pour la loi de fermeture.

Budget (D4) : ConversationView.swift, MessageListViewController.swift et
MessageOverlayMenu.swift non touchés (Δ 0). ConversationView.swift reste à 2804.

Refs #5980

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

Attendu : `git show --stat HEAD` liste les neuf chemins.

---

### Ce que P1 laisse aux tâches suivantes (à relire avant de les exécuter)

- **Réserve de budget.** `ConversationView.swift` passe à 2804 lignes en Tâche 1 (Δ −57). `legacyLineCeiling` reste à 60 862 jusqu'à la Tâche 24, qui remesure le cumul.
- **Réveil à site unique.** Les Tâches 10, 16, 19 et 22 appellent `raiseComposerKeyboardIfMounted()` et n'écrivent jamais `composerState.focusTrigger = true`. `test_focusTrigger_isWokenFromASingleSite_inTheConversationUnit` compte une seule écriture dans l'unité `ConversationView`, glob `ConversationView+*.swift` compris.
- **Porte unique de présentation.** La Tâche 16 garde `showOverlayMenu = true` dans `continueLongPressPresentation`, et jamais dans `presentLongPressMenu`. Si le recentrage lit `row.frameInWindow`, le texte `cellFrame: cellFrame` doit rester sur le chemin de repli. Sinon `test_continueLongPressPresentation_scrollsTowardCenter_whenTheLawSaysSo` est à re-pointer, sans l'affaiblir.
- **Drapeau hors de la liste.** `MessageListViewController.swift` et `MessageListView.swift` ne peuvent pas lire `MeeshyFeatureFlags.isLiftedRowLongPressEnabled` (`BetaFeaturesReadingModesIntegrationTests`). Les Tâches 14 et 22 reçoivent le drapeau en paramètre, depuis `ConversationView`.
- **Cadre du geste périmé** après la descente du clavier, sur le chemin de la Tâche 4 : la relecture arrive en Tâche 16. Impact faible drapeau éteint : l'overlay actuel ne se place pas sur `cellFrame`.
- **Clavier flottant ou matériel sur iPad** (spec §9.3, mesure 3). Si `keyboardWillHide` n'est pas émis, `keyboardTransition` garde une hauteur non nulle : attente inutile d'environ 0,45 s, et clavier du composer relevé à la fermeture. À mesurer en Tâche 17.
- **Recherche.** Un appui long pendant une recherche baisse le clavier de recherche sans le rendre à la fermeture (écart 5). Ouvrir une issue de suivi si le porteur veut que le focus revienne à la recherche.

---

## Partie P2 — Barre 2×, actions Rivière, toutes les options, fabrique, routeur, menu glass (Tâches 5 à 11)

Issues : #5982 (barre 2×), #5983 (Rivière), #5984 (double tap Script). Contrat : `docs/superpowers/plans/2026-09-10-appui-long-rendu-du-mode-contrat.md`. Spec : `docs/superpowers/specs/2026-09-10-appui-long-rendu-du-mode-design.md` (§2.4, D5, D8, D9, §4, §7, §9).

> ⚠️ Écart au contrat
>
> 1. **Compte du pbxproj.** Un fichier Swift neuf ajoute DEUX lignes `.swift in Sources` (entrée `PBXBuildFile` + entrée de la phase de sources ; mesuré : `grep -c 'MessageActionsMenu.swift in Sources'` rend 2). Le delta attendu est donc **+2 × fichiers neufs**, jamais « +N ».
> 2. **`HeaderSearchGlyph` perd son `private`** (Tâche 6). Relocalisé hors de `ConversationView.swift` pour compenser les deux lignes ajoutées à `nativeMenuButton`, il doit devenir `internal` : `ConversationView.swift` l'emploie encore, et `private` au niveau fichier le rendrait invisible. Le corps est déplacé octet pour octet.
> 3. **`initialItem: .media` pose la confirmation après `MessageMoreSheet.mediaConfirmationDelay` (0,45 s), pas dans le même tour que `onAppear`** (Tâche 9). Un `confirmationDialog` demandé pendant la montée d'une feuille n'est pas présenté par UIKit (« presentation is in progress »). La présence de la confirmation est vérifiée au simulateur en Tâche 23.
> 4. **`legacyLineCeiling` n'est pas abaissé par les Tâches 6 et 8**, qui font pourtant baisser le cumul de la dette (−76 puis −18). La garde est à sens unique (`≤`), donc elle reste verte. Le plafond se REMESURE une fois, en Tâche 24, sur l'arbre final. L'abaisser à chaque tâche ferait se chevaucher les parties qui touchent la même constante.
>
> **Ajouts au contrat** (signatures neuves, aucune ne remplace une signature du contrat) :
> - Tâche 5 : `EmojiReactionPicker.expandTileDiameter`, `.stripVerticalPadding`, `static func waveEntranceStart(scale:reduceMotion:) -> WaveEntranceStart`, `struct WaveEntranceStart: Equatable { let rise: CGFloat; let scale: CGFloat }`.
> - Tâche 6 : `struct EmojiUsageTracker` et `struct HeaderSearchGlyph` changent de FICHIER (relocalisations pures), pas d'API.
> - Tâche 7 : `PrimaryAction` et `MoreItem` deviennent `CaseIterable` ; `OptionSection.isEmpty` ; `MessageActionResolver.overflowTwin(of:) -> MoreItem?` et `nonEmptySections(_:) -> [OptionSection]` ; `MessageOptionLabels.actionsSectionTitle`, `.infoSectionTitle`, `.moderationSectionTitle`.
> - Tâche 8 : champs de `MessageMenuFacts` = `canModerate`, `isStarred`, `hasEditRevisions`, `stickerFavorite: Bool?`, `showReadReceipts`, `isRiver`.
> - Tâche 9 : `MessageMoreSheet.mediaConfirmationDelay: TimeInterval`.
> - Tâche 10 : `MessageActionRouter.make(execute: @escaping (MessageActionRoute) -> Void) -> MessageActionRouter` et `ConversationView.performMessageRoute(_:for:)`.
> - Tâche 11 : `MessageOptionsGlassMenu.Row` (`.primary(PrimaryAction)` · `.more(MoreItem)`, `isDestructive`), `rows(of:)`, `headerTitle(of:)`, `servedHeight(sections:maxHeight:)`, et les cotes `rowHeight`, `headerHeight`, `sectionGap`, `verticalPadding`.

**Rappels communs à toutes les tâches de cette partie :**
- worktree `/Users/smpceo/Documents/v2_meeshy-longpress` ;
- le cwd du shell retombe entre deux appels : chaque commande commence par `cd` ;
- lors d'un appel de la surcharge `MessageOptionLabels.label(_:)`, `symbol(_:)` ou `MessageActionRouting.route(_:)` avec un littéral partagé par les deux enums (`.reply`, `.edit`, `.copy`, `.pin`, `.unpin`, `.star`, `.unstar`, `.delete`), qualifier le type (`PrimaryAction.reply`), sinon l'appel est ambigu.

---

### Tâche 5 : La barre de réactions sait se montrer sans fond, monte à sa taille et devient un fondu sous Reduce Motion

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift:57-359` (au-dessus de `EmojiReactionPicker`, propriétés et init l.78-115, `emojiList` l.153, `expandButton` l.168 et 179, `quickEmojiStrip` l.188-190, `scrollableQuickEmojiStrip` l.202 et 218-221, bloc neuf avant `reactToEmoji` l.224, `QuickReactionStripChrome` l.292, `WaveTileModifier` l.315-359)
- Test : `packages/MeeshySDK/Tests/MeeshyUITests/Primitives/EmojiReactionPickerLayoutTests.swift` (créer)

**Interfaces :**
- Consomme :
  - `public enum MeeshyMotion { public nonisolated static func shouldReduce(system: Bool, userForced: Bool) -> Bool }` (`MeeshyUI/Theme/Accessibility.swift`) ;
  - `EnvironmentValues.meeshyForceReduceMotion: Bool` ;
  - `EnvironmentValues.accessibilityReduceMotion`.
- Produit :
  ```swift
  nonisolated public enum EmojiReactionPickerChrome: Equatable, Sendable { case capsule, none }
  // EmojiReactionPicker
  public var chrome: EmojiReactionPickerChrome
  public init(quickEmojis:style:scale:scrollable:chrome: EmojiReactionPickerChrome = .capsule, onReact:onDismiss:onExpandFullPicker:highlightedIndex:scrubFrameSpace:onTileFrames:)
  static let expandTileDiameter: CGFloat          // 32
  static let stripVerticalPadding: CGFloat        // 6
  public static func stripHeight(scale: CGFloat) -> CGFloat          // (32 + 2 × 6) × scale
  static func waveRise(scale: CGFloat) -> CGFloat                    // 16 × max(1, scale)
  static func waveEntranceStart(scale: CGFloat, reduceMotion: Bool) -> WaveEntranceStart
  nonisolated struct WaveEntranceStart: Equatable, Sendable { let rise: CGFloat; let scale: CGFloat }
  ```

Les six consommateurs sont inchangés, et leur rendu aussi :
- `MessageOverlayMenu.swift:498`, `ConversationView+MessageRow.swift:275`, `MessageReactionsDetailView.swift:31`, `BubbleStandardLayout+Media.swift:428` (`scale: 0.78`), `PostReactionPalette.swift:36`, `StoryViewerView+Sidebar.swift:488` ;
- aucun ne passe `chrome:`, et le paramètre a un défaut `.capsule` ;
- sous l'échelle 1, la montée reste de 16 pt et l'échelle de départ de 0,55.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Primitives/EmojiReactionPickerLayoutTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

/// `EmojiReactionPicker` — cotes et entrée en vague de la barre de réactions
/// rapides, que l'appui long remonté pose à l'échelle 2 et sans fond (#5982).
///
/// Ce qui se teste ici est ce qui peut régresser sans qu'aucune vue ne le
/// dise : l'estimation de hauteur que la géométrie de l'overlay lit avant la
/// mesure, la montée de la vague (la barre compacte d'une pièce jointe à
/// `scale: 0.78` doit garder ses 16 pt), le fond par défaut des six surfaces
/// existantes, et le point de départ sous Reduce Motion.
@MainActor
final class EmojiReactionPickerLayoutTests: XCTestCase {

    // MARK: - Hauteur estimée

    func test_stripHeight_atScaleOne_isTheExpandTileAndItsTwoPaddings() {
        XCTAssertEqual(EmojiReactionPicker.stripHeight(scale: 1), 44)
    }

    func test_stripHeight_atScaleTwo_isTwiceTheScaleOneHeight() {
        XCTAssertEqual(EmojiReactionPicker.stripHeight(scale: 2), 88)
        XCTAssertEqual(
            EmojiReactionPicker.stripHeight(scale: 2),
            2 * EmojiReactionPicker.stripHeight(scale: 1),
            "toutes les cotes de la barre sont multipliées par `scale` : l'estimation doit l'être aussi"
        )
    }

    // MARK: - Fond

    func test_chrome_byDefault_isCapsule() {
        XCTAssertEqual(EmojiReactionPicker().chrome, EmojiReactionPickerChrome.capsule)
        XCTAssertEqual(
            EmojiReactionPicker(scale: 0.78, scrollable: true).chrome,
            EmojiReactionPickerChrome.capsule,
            "les six surfaces existantes ne passent pas `chrome:` — elles gardent leur capsule"
        )
    }

    func test_chrome_none_isKeptByTheInitialiser() {
        let barre = EmojiReactionPicker(scale: 2, scrollable: true, chrome: EmojiReactionPickerChrome.none)
        XCTAssertEqual(barre.chrome, EmojiReactionPickerChrome.none)
    }

    // MARK: - Vague d'entrée

    func test_waveRise_atOrBelowScaleOne_keepsSixteenPoints() {
        XCTAssertEqual(EmojiReactionPicker.waveRise(scale: 0.78), 16, "la barre compacte d'une pièce jointe ne change pas de montée")
        XCTAssertEqual(EmojiReactionPicker.waveRise(scale: 1), 16)
    }

    func test_waveRise_atScaleTwo_isThirtyTwoPoints() {
        XCTAssertEqual(EmojiReactionPicker.waveRise(scale: 2), 32)
    }

    func test_waveEntranceStart_withoutReduceMotion_keepsTheHistoricalPop() {
        XCTAssertEqual(
            EmojiReactionPicker.waveEntranceStart(scale: 1, reduceMotion: false),
            WaveEntranceStart(rise: 16, scale: 0.55)
        )
        XCTAssertEqual(
            EmojiReactionPicker.waveEntranceStart(scale: 2, reduceMotion: false),
            WaveEntranceStart(rise: 32, scale: 0.55)
        )
    }

    func test_waveEntranceStart_underReduceMotion_isAFadeWithoutRiseNorGrowth() {
        XCTAssertEqual(
            EmojiReactionPicker.waveEntranceStart(scale: 2, reduceMotion: true),
            WaveEntranceStart(rise: 0, scale: 1),
            "Reduce Motion : la tuile ne monte pas et ne grossit pas, seule l'opacité s'anime"
        )
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/packages/MeeshySDK && \
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -skipPackageUpdates -only-testing:MeeshyUITests/EmojiReactionPickerLayoutTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/MeeshySDK-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-sdk-EmojiReactionPickerLayoutTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation du bundle de test, avec entre autres :
- `error: type 'EmojiReactionPicker' has no member 'stripHeight'` ;
- `error: cannot find 'EmojiReactionPickerChrome' in scope` ;
- `error: cannot find 'WaveEntranceStart' in scope`.

- [ ] **Étape 3 : Implémentation minimale**

Tous les blocs ci-dessous sont dans `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift`.

**3a — le type du fond.** Remplacer :
```swift
public struct EmojiReactionPicker: View {
    public var quickEmojis: [String]
```
par :
```swift
/// **Le fond de la barre de réactions rapides.** `.capsule` pose la pilule
/// flottante (`QuickReactionStripChrome` : verre sur iOS 26, matière avant) ;
/// `.none` rend les tuiles NUES, pour un hôte qui fournit déjà son voile —
/// l'overlay d'appui long remonté, où la barre 2× flotte au-dessus de la
/// rangée sans rien derrière elle (#5982).
nonisolated public enum EmojiReactionPickerChrome: Equatable, Sendable {
    case capsule
    case none
}

public struct EmojiReactionPicker: View {
    public var quickEmojis: [String]
```

**3b — la propriété.** Remplacer :
```swift
    public var scrollable: Bool
    public var onReact: ((String) -> Void)?
```
par :
```swift
    public var scrollable: Bool
    /// Fond de la barre : `.capsule` par défaut (rendu inchangé des surfaces
    /// existantes) ou `.none` (tuiles nues sur le voile de l'hôte).
    public var chrome: EmojiReactionPickerChrome
    public var onReact: ((String) -> Void)?
```

**3c — l'initialiseur (paramètre juste après `scrollable`).** Remplacer :
```swift
        scrollable: Bool = false,
        onReact: ((String) -> Void)? = nil,
```
par :
```swift
        scrollable: Bool = false,
        chrome: EmojiReactionPickerChrome = .capsule,
        onReact: ((String) -> Void)? = nil,
```
puis remplacer :
```swift
        self.scrollable = scrollable
        self.onReact = onReact; self.onDismiss = onDismiss
```
par :
```swift
        self.scrollable = scrollable
        self.chrome = chrome
        self.onReact = onReact; self.onDismiss = onDismiss
```

**3d — la vague reçoit l'échelle (deux sites).** Remplacer :
```swift
                .modifier(WaveTileModifier(index: index, hasEntered: hasEntered))
```
par :
```swift
                .modifier(WaveTileModifier(index: index, hasEntered: hasEntered, scale: scale))
```
puis remplacer :
```swift
            .modifier(WaveTileModifier(index: quickEmojis.count, hasEntered: hasEntered))
```
par :
```swift
            .modifier(WaveTileModifier(index: quickEmojis.count, hasEntered: hasEntered, scale: scale))
```

**3e — les cotes nommées, lues par le rendu ET par l'estimation.** Remplacer :
```swift
                        .frame(width: 32 * scale, height: 32 * scale)
```
par :
```swift
                        .frame(width: Self.expandTileDiameter * scale, height: Self.expandTileDiameter * scale)
```
Remplacer :
```swift
        .padding(.horizontal, 10 * scale)
        .padding(.vertical, 6 * scale)
        .modifier(QuickReactionStripChrome(style: style))
    }
```
par :
```swift
        .padding(.horizontal, 10 * scale)
        .padding(.vertical, Self.stripVerticalPadding * scale)
        .modifier(EmojiReactionPickerChromeModifier(style: style, chrome: chrome))
    }
```
Remplacer :
```swift
                emojiList
                    .padding(.vertical, 6 * scale)
```
par :
```swift
                emojiList
                    .padding(.vertical, Self.stripVerticalPadding * scale)
```
Remplacer :
```swift
            expandButton
                .padding(.trailing, 10 * scale)
        }
        .modifier(QuickReactionStripChrome(style: style))
    }
```
par :
```swift
            expandButton
                .padding(.trailing, 10 * scale)
        }
        .modifier(EmojiReactionPickerChromeModifier(style: style, chrome: chrome))
    }
```

**3f — les lois de cote et de vague.** Remplacer :
```swift
    private func reactToEmoji(_ emoji: String) {
```
par :
```swift
    // MARK: - Cotes et vague (lues par le rendu et par les hôtes)

    /// Diamètre du « + » — la tuile la plus haute de la barre.
    static let expandTileDiameter: CGFloat = 32
    /// Marge verticale posée de chaque côté des tuiles.
    static let stripVerticalPadding: CGFloat = 6

    /// **Hauteur ESTIMÉE de la barre à l'échelle `scale`.** La tuile la plus
    /// haute (le « + ») et ses deux marges verticales, multipliées par
    /// `scale` comme dans le rendu. C'est l'estimation de première pose :
    /// l'hôte mesure ensuite la hauteur réelle.
    public static func stripHeight(scale: CGFloat) -> CGFloat {
        (expandTileDiameter + 2 * stripVerticalPadding) * scale
    }

    /// **Montée de la vague d'entrée** : 16 pt jusqu'à l'échelle 1 (la barre
    /// compacte d'une pièce jointe, `scale: 0.78`, garde ses 16 pt), puis
    /// proportionnelle. Une barre 2× monte de 32 pt, sans quoi sa vague
    /// paraîtrait deux fois plus timide que celle de la barre ordinaire.
    static func waveRise(scale: CGFloat) -> CGFloat {
        16 * max(1, scale)
    }

    /// **Point de départ de l'entrée d'une tuile.** Reduce Motion ⇒ ni montée
    /// ni grossissement : la vague devient un fondu en cascade (WCAG 2.3.3).
    static func waveEntranceStart(scale: CGFloat, reduceMotion: Bool) -> WaveEntranceStart {
        reduceMotion
            ? WaveEntranceStart(rise: 0, scale: 1)
            : WaveEntranceStart(rise: waveRise(scale: scale), scale: 0.55)
    }

    private func reactToEmoji(_ emoji: String) {
```

**3g — le modificateur de fond et la valeur de départ.** Remplacer :
```swift
public extension View {
    /// Applique le chrome flottant de la barre de quick-réaction (la capsule
```
par :
```swift
/// Pose la capsule, ou rien, selon `chrome`. `.none` rend le contenu tel
/// quel : ni verre, ni matière, ni ombre.
private struct EmojiReactionPickerChromeModifier: ViewModifier {
    let style: EmojiReactionPicker.Style
    let chrome: EmojiReactionPickerChrome

    func body(content: Content) -> some View {
        switch chrome {
        case .capsule:
            content.modifier(QuickReactionStripChrome(style: style))
        case .none:
            content
        }
    }
}

/// Point de départ de l'entrée en vague d'une tuile : `rise` pt sous sa
/// place, à l'échelle `scale`. La tuile va de ce point à (0, 1).
nonisolated struct WaveEntranceStart: Equatable, Sendable {
    let rise: CGFloat
    let scale: CGFloat
}

public extension View {
    /// Applique le chrome flottant de la barre de quick-réaction (la capsule
```

**3h — la vague lit l'échelle et Reduce Motion.** Remplacer :
```swift
private struct WaveTileModifier: ViewModifier {
    let index: Int
    let hasEntered: Bool

    /// `t` va de 0 (tuile cachee, sous la ligne) a 1 (tuile posee).
    @State private var t: CGFloat = 0

    /// Delai d'entree : decalage croissant => effet de cascade sinusoidale.
    private var staggerDelay: Double { Double(index) * 0.045 }

    // La tuile arrive depuis ~16pt sous sa position finale.
    private var riseOffset: CGFloat { 16 * (1 - t) }

    // Demarre legerement reduite pour un "pop" a l'arrivee.
    private var entranceScale: CGFloat { 0.55 + 0.45 * t }
```
par :
```swift
private struct WaveTileModifier: ViewModifier {
    let index: Int
    let hasEntered: Bool
    let scale: CGFloat

    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced

    /// `t` va de 0 (tuile cachee, sous la ligne) a 1 (tuile posee).
    @State private var t: CGFloat = 0

    /// Delai d'entree : decalage croissant => effet de cascade sinusoidale.
    private var staggerDelay: Double { Double(index) * 0.045 }

    /// Depart de la tuile : `EmojiReactionPicker.waveEntranceStart`, qui tient
    /// la montee proportionnelle a l'echelle et le fondu sous Reduce Motion.
    private var start: WaveEntranceStart {
        EmojiReactionPicker.waveEntranceStart(
            scale: scale,
            reduceMotion: MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced)
        )
    }

    // La tuile arrive depuis `start.rise` sous sa position finale.
    private var riseOffset: CGFloat { start.rise * (1 - t) }

    // Demarre a `start.scale` pour un "pop" a l'arrivee (1 sous Reduce Motion).
    private var entranceScale: CGFloat { start.scale + (1 - start.scale) * t }
```
(Le reste de `WaveTileModifier`, `body` et `animateIn()`, est inchangé.)

- [ ] **Étape 4 : Lancer le test et constater le succès**

4a — Commande : celle de l'Étape 2.
Attendu : `Executed 8 tests, with 0 failures`.

4b — Les consommateurs de l'app compilent, et les deux gardes qui citent le picker restent vertes :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/StoryViewerReactionFlowTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-ConversationMenuSystemDesignGuardTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : aucune ligne `error:`, et `with 0 failures`.

4c — Aucun consommateur ne change de fond :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && git grep -n "chrome:" -- apps packages/MeeshySDK/Sources | grep -v "EmojiReactionPicker.swift"
```
Attendu : aucune sortie.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Primitives/EmojiReactionPickerLayoutTests.swift && \
git commit -m "$(cat <<'EOF'
feat(sdk): la barre de réactions sait se montrer sans fond, monte à sa taille et devient un fondu sous Reduce Motion (#5982)

- `EmojiReactionPickerChrome` (`.capsule` par défaut, `.none`) : paramètre
  `chrome:` juste après `scrollable`. Les six surfaces existantes ne le
  passent pas et gardent leur capsule.
- `stripHeight(scale:)` estime la hauteur depuis les cotes que le rendu lit
  (`expandTileDiameter`, `stripVerticalPadding`) : 44 pt à 1, 88 pt à 2.
- `waveRise(scale:)` = 16 × max(1, scale) : la barre compacte à 0,78 garde
  ses 16 pt, la barre 2× monte de 32 pt.
- `WaveTileModifier` lit `accessibilityReduceMotion` et
  `meeshyForceReduceMotion` : sous Reduce Motion, ni montée ni échelle de
  départ, fondu seul.

Refs #5982

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
)" && git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```
Attendu (`git show --stat`) : deux fichiers, dont un créé.

---

### Tâche 6 : En Rivière, la liste compacte offre « Ouvrir dans le fil » et « Répondre »

**Fichiers :**
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift:5-26` (`PrimaryAction`), `:110-115` (fin de `MessageMenuContext`), `:253-256` (`primaryActions`)
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift:96-130` (`symbol`, `label`)
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift:201-227` (`handlePrimaryAction`) et `:1375-1434` (relocalisation de `EmojiUsageTracker`)
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (fin de fichier : `case .callDetail:` de `nativeMenuButton`, puis relocalisation de `HeaderSearchGlyph` ; numéros d'origine l.2829-2861, décalés par la Tâche 1)
- Créer : `apps/ios/Meeshy/Features/Main/Components/EmojiUsageTracker.swift` (relocalisation pure)
- Créer : `apps/ios/Meeshy/Features/Main/Views/HeaderSearchGlyph.swift` (relocalisation pure, `private` retiré — voir l'écart n° 2)
- Test : `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift:7-25` (fabrique `ctx`) et nouveaux témoins

**Interfaces :**
- Consomme : `MessageActionResolver.primaryActions(_:)`, `MessageMenuContext` (existants).
- Produit :
  ```swift
  enum PrimaryAction: String, Equatable { …; case openInThread; case reply }
  struct MessageMenuContext: Equatable { …; var isRiver: Bool = false }   // dernier champ ⇒ dernier argument du memberwise
  // primaryActions : ctx.isRiver ⇒ .openInThread, .reply insérés juste après .callDetail (en tête s'il est absent)
  ```

**Gardes vérifiées** (aucune ne lit les blocs relocalisés) :
- `EmojiUsageTracker` est lu seulement comme APPEL :
  - `ComposerTourbillonAndQuickEmojiSourceGuardTests` lit l'unité du composer (`AppSourceGuard.unit(composerPath)`) ;
  - `ConversationMenuSystemDesignGuardTests:400` lit le bloc `buildNativeMessageMenu`.
- Les sept gardes qui lisent `MessageOverlayMenu.swift` cherchent `LocalizedNumber.`, `DeviceLayout…`, `EmojiReactionPicker`, `ThemedMessageBubble`, `MessageActionsMenu(` et les sites de police figée : rien de cela n'est dans `EmojiUsageTracker`.
- `HeaderSearchGlyph` n'est cité par aucun test. Vérifier avec `git grep -n "HeaderSearchGlyph" -- apps/ios/MeeshyTests`, qui ne doit rien rendre.
- `test_buildNativeMessageMenu_compactRow_resolver_confirmedDelete` borne sa fenêtre à 6 500 caractères depuis `func nativeMenuButton(`. `.delete` précède `.callDetail`, et les lignes ajoutées suivent `.callDetail` : la fenêtre est intacte.
- `MessageMoreJumpsToViewsGuardTests` cherche le premier `case .more:`, qui n'est pas touché.

- [ ] **Étape 1 : Écrire le test qui échoue**

Dans `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift`, remplacer :
```swift
    private func ctx(
        isMine: Bool = false, canEdit: Bool = false, canDelete: Bool = false,
        hasText: Bool = true, hasMedia: Bool = false, hasTimebasedMedia: Bool = false,
        isPinned: Bool = false, isStarred: Bool = false,
        isEdited: Bool = false, hasEditRevisions: Bool = false,
        saveableAttachmentCount: Int = 0,
        canComposeMedia: Bool = false,
        showReadReceipts: Bool = true,
        isForwardable: Bool = true
    ) -> MessageMenuContext {
        MessageMenuContext(isMine: isMine, canEdit: canEdit, canDelete: canDelete,
            hasText: hasText, hasMedia: hasMedia, hasTimebasedMedia: hasTimebasedMedia,
            isPinned: isPinned, isStarred: isStarred, isEdited: isEdited,
            hasEditRevisions: hasEditRevisions,
            saveableAttachmentCount: saveableAttachmentCount,
            canComposeMedia: canComposeMedia,
            showReadReceipts: showReadReceipts,
            isForwardable: isForwardable)
    }
```
par :
```swift
    private func ctx(
        isMine: Bool = false, canEdit: Bool = false, canDelete: Bool = false,
        hasText: Bool = true, hasMedia: Bool = false, hasTimebasedMedia: Bool = false,
        isPinned: Bool = false, isStarred: Bool = false,
        isEdited: Bool = false, hasEditRevisions: Bool = false,
        hasCallSummary: Bool = false,
        saveableAttachmentCount: Int = 0,
        canComposeMedia: Bool = false,
        showReadReceipts: Bool = true,
        isForwardable: Bool = true,
        isRiver: Bool = false
    ) -> MessageMenuContext {
        MessageMenuContext(isMine: isMine, canEdit: canEdit, canDelete: canDelete,
            hasText: hasText, hasMedia: hasMedia, hasTimebasedMedia: hasTimebasedMedia,
            isPinned: isPinned, isStarred: isStarred, isEdited: isEdited,
            hasEditRevisions: hasEditRevisions,
            hasCallSummary: hasCallSummary,
            saveableAttachmentCount: saveableAttachmentCount,
            canComposeMedia: canComposeMedia,
            showReadReceipts: showReadReceipts,
            isForwardable: isForwardable,
            isRiver: isRiver)
    }
```

Puis, dans le même fichier, remplacer :
```swift
    // MARK: - Lot 5 (O13) — « Composer » : DEUX gestes, jamais trois
```
par :
```swift
    // MARK: - Rivière (D5, #5983) — « Ouvrir dans le fil » et « Répondre »

    /// La Rivière n'a ni glissé de réponse ni fil visible : les deux retours
    /// que son `.contextMenu` offrait entrent dans la liste compacte, EN TÊTE
    /// quand aucun résumé d'appel ne les précède.
    func test_primaryActions_river_insertsOpenInThreadThenReplyAtHead() {
        XCTAssertEqual(
            MessageActionResolver.primaryActions(ctx(isRiver: true)),
            [.openInThread, .reply, .select, .translate, .copy, .more]
        )
    }

    /// `.callDetail` reste la première entrée : les deux actes Rivière se
    /// posent juste APRÈS lui, jamais avant.
    func test_primaryActions_riverWithCallSummary_insertsThemRightAfterCallDetail() {
        XCTAssertEqual(
            MessageActionResolver.primaryActions(ctx(hasCallSummary: true, isRiver: true)),
            [.callDetail, .openInThread, .reply, .select, .translate, .copy, .more]
        )
    }

    /// Les actes voisins gardent leur ordre : Éditer suit les actes Rivière.
    func test_primaryActions_riverOwnEditableText_keepsEditAfterTheRiverActions() {
        XCTAssertEqual(
            MessageActionResolver.primaryActions(ctx(isMine: true, canEdit: true, canDelete: true, isRiver: true)),
            [.openInThread, .reply, .edit, .select, .translate, .copy, .more]
        )
    }

    /// Hors Rivière, le fil est déjà là et le glissé répond : aucun doublon.
    func test_primaryActions_outsideRiver_neverOffersOpenInThreadNorReply() {
        let horsRiviere = [
            ctx(),
            ctx(isMine: true, canEdit: true, canDelete: true),
            ctx(hasCallSummary: true),
            ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 1, canComposeMedia: true)
        ]
        for contexte in horsRiviere {
            let actions = MessageActionResolver.primaryActions(contexte)
            XCTAssertFalse(actions.contains(.openInThread), "\(actions)")
            XCTAssertFalse(actions.contains(.reply), "\(actions)")
        }
    }

    // MARK: - Lot 5 (O13) — « Composer » : DEUX gestes, jamais trois
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageActionResolverTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageActionResolverTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation, avec :
- `error: extra argument 'isRiver' in call` ;
- `error: type 'PrimaryAction' has no member 'openInThread'`.

- [ ] **Étape 3 : Implémentation minimale**

**3a — relever les tailles avant toute édition (D4) :**
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift | tee /tmp/p2-t6-avant.txt
```

**3b — relocaliser `EmojiUsageTracker` (bloc final de `MessageOverlayMenu.swift`, à l'identique) :**
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Meeshy/Features/Main/Components && \
L=$(grep -n '^// MARK: - Emoji Usage Tracker$' MessageOverlayMenu.swift | cut -d: -f1) && echo "ancre=$L" && \
test "$(sed -n "$((L + 2))p" MessageOverlayMenu.swift)" = "struct EmojiUsageTracker {" && \
{ printf 'import Foundation\n\n'; tail -n +"$L" MessageOverlayMenu.swift; } > EmojiUsageTracker.swift && \
sed -i '' "$((L - 1)),\$d" MessageOverlayMenu.swift && \
tail -n 3 MessageOverlayMenu.swift && head -n 5 EmojiUsageTracker.swift
```
Attendu :
- `tail` montre `        NotificationCenter.default.removeObserver(self)`, `    }`, `}` (fin de `OverlayAudioPlayer`) ;
- `head` montre `import Foundation`, une ligne vide, `// MARK: - Emoji Usage Tracker`, une ligne vide, `struct EmojiUsageTracker {`.

Preuve de relocalisation pure :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
diff <(git show HEAD:apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift | sed -n '/^\/\/ MARK: - Emoji Usage Tracker$/,$p') \
     <(sed -n '/^\/\/ MARK: - Emoji Usage Tracker$/,$p' apps/ios/Meeshy/Features/Main/Components/EmojiUsageTracker.swift) && echo IDENTIQUE
```
Attendu : `IDENTIQUE`.

**3c — relocaliser `HeaderSearchGlyph` (bloc final de `ConversationView.swift`) :**
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Meeshy/Features/Main/Views && \
L=$(grep -n '^// MARK: - Header Search Glyph' ConversationView.swift | cut -d: -f1) && echo "ancre=$L" && \
{ printf 'import SwiftUI\nimport MeeshySDK\nimport MeeshyUI\n\n'; tail -n +"$L" ConversationView.swift | sed 's/^private struct HeaderSearchGlyph: View {$/struct HeaderSearchGlyph: View {/'; } > HeaderSearchGlyph.swift && \
sed -i '' "$((L - 1)),\$d" ConversationView.swift && \
tail -n 3 ConversationView.swift && grep -n "struct HeaderSearchGlyph" HeaderSearchGlyph.swift
```
Attendu :
- `tail` montre `        }`, `    }`, `}` (fin du `switch`, de `nativeMenuButton` et de `ConversationView`) ;
- `grep` rend `12:struct HeaderSearchGlyph: View {`.

Preuve (une seule ligne diffère, le `private`) :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
diff <(git show HEAD:apps/ios/Meeshy/Features/Main/Views/ConversationView.swift | sed -n '/^\/\/ MARK: - Header Search Glyph/,$p') \
     <(sed -n '/^\/\/ MARK: - Header Search Glyph/,$p' apps/ios/Meeshy/Features/Main/Views/HeaderSearchGlyph.swift)
```
Attendu : exactement `< private struct HeaderSearchGlyph: View {` / `> struct HeaderSearchGlyph: View {`.

Contenu résultant de `apps/ios/Meeshy/Features/Main/Views/HeaderSearchGlyph.swift` :
```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Header Search Glyph (extracted struct to keep the Button's type trivial)

/// Struct NOMINALE : le type structurel du glyphe (opaques `adaptiveGlass` +
/// `meeshyTapTarget`, chacun portant ses 2 branches #available) reste scopé à
/// ce body au lieu de gonfler le mangled name du Button parent — dont le
/// décodage récursif débordait la pile du main thread au 1er rendu SUR DEVICE
/// (.ips 2026-07-30, `expandedHeaderSearchButton.getter`).
struct HeaderSearchGlyph: View {
    let accentColor: String
    let secondaryColor: String

    var body: some View {
        Image(systemName: "magnifyingglass")
            .font(MeeshyFont.relative(13, weight: .semibold))
            .foregroundStyle(LinearGradient(colors: [Color(hex: accentColor), Color(hex: secondaryColor)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: 28, height: 28)
            .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(0.25))
            .meeshyTapTarget()
    }
}
```

**3d — `MessageActionResolver.swift`.** Remplacer :
```swift
    /// enterrée derrière un geste supplémentaire — retour porteur explicite.
    case select
}
```
par :
```swift
    /// enterrée derrière un geste supplémentaire — retour porteur explicite.
    case select
    /// **Ouvrir dans le fil** (Rivière, D5, #5983) — bascule en Script et
    /// atterrit sur le message. N'existe que dans un contexte `isRiver` : hors
    /// Rivière, le fil est déjà ce qu'on regarde.
    case openInThread
    /// **Répondre** (Rivière, D5, #5983) — la Rivière n'a pas de glissé de
    /// réponse ; cette entrée en tient lieu. Mêmes mots et même glyphe que
    /// l'entrée `MoreItem.reply` de « Plus… ».
    case reply
}
```
Remplacer :
```swift
    /// qu'un seul site d'énonciation, et ce résolveur reste une logique pure.
    var isForwardable: Bool = true
}
```
par :
```swift
    /// qu'un seul site d'énonciation, et ce résolveur reste une logique pure.
    var isForwardable: Bool = true
    /// **Le menu s'ouvre depuis la Rivière** (D5, #5983). Un fait porté par le
    /// contexte, jamais une branche de vue : il ajoute « Ouvrir dans le fil »
    /// et « Répondre » à la liste compacte.
    var isRiver: Bool = false
}
```
Remplacer :
```swift
        var out: [PrimaryAction] = []
        if ctx.hasCallSummary { out.append(.callDetail) }
        if ctx.isMine && ctx.canEdit && ctx.hasText { out.append(.edit) }
```
par :
```swift
        var out: [PrimaryAction] = []
        if ctx.hasCallSummary { out.append(.callDetail) }
        // Rivière (D5) : les deux retours que son `.contextMenu` offrait, juste
        // après le détail d'appel — en tête quand il n'y en a pas.
        if ctx.isRiver { out.append(contentsOf: [.openInThread, .reply]) }
        if ctx.isMine && ctx.canEdit && ctx.hasText { out.append(.edit) }
```

**3e — `MessageActionsMenu.swift`** (mêmes glyphes et mêmes clés que le `.contextMenu` de `RiverBubbleView`). Remplacer :
```swift
        case .callDetail: return "info.circle"
        case .select: return "checkmark.circle"
        }
    }
```
par :
```swift
        case .callDetail: return "info.circle"
        case .select: return "checkmark.circle"
        case .openInThread: return "text.bubble"
        case .reply: return "arrowshape.turn.up.left"
        }
    }
```
Remplacer :
```swift
        case .select: return String(localized: "action.select", defaultValue: "Sélectionner", bundle: .main)
        }
    }
```
par :
```swift
        case .select: return String(localized: "action.select", defaultValue: "Sélectionner", bundle: .main)
        case .openInThread: return String(localized: "riviere.bubble.openInThread", defaultValue: "Ouvrir dans le fil", bundle: .main)
        case .reply: return String(localized: "action.reply", defaultValue: "Répondre", bundle: .main)
        }
    }
```
(`MessageActionsMenu.swift` est épinglé dans `fullyLocalizedScreens` : les deux `defaultValue` valent la source `fr` du catalogue, soit « Ouvrir dans le fil » et « Répondre », mesurées, les deux clés étant présentes dans les sept locales.)

**3f — `MessageOverlayMenu.swift`** (l'overlay historique ne pose jamais `isRiver`, D8). Remplacer :
```swift
        case .callDetail:
            onShowCallDetail?()
        }
        dismiss()
    }
```
par :
```swift
        case .callDetail:
            onShowCallDetail?()
        case .openInThread, .reply:
            // Actes de la Rivière : ce contexte ne pose jamais `isRiver` (D8).
            break
        }
        dismiss()
    }
```

**3g — `ConversationView.swift`** (`nativeMenuButton`, chemin mort gardé par D3). Remplacer :
```swift
        case .callDetail:
            Button {
                overlayState.callDetailMessage = msg
            } label: {
                Label(
                    String(localized: "bubble.call.details.action", defaultValue: "Détails de l'appel", bundle: .main),
                    systemImage: "info.circle"
                )
            }
        }
    }
}
```
par :
```swift
        case .callDetail:
            Button {
                overlayState.callDetailMessage = msg
            } label: {
                Label(
                    String(localized: "bubble.call.details.action", defaultValue: "Détails de l'appel", bundle: .main),
                    systemImage: "info.circle"
                )
            }
        case .openInThread, .reply:
            EmptyView()
        }
    }
}
```

**3h — relever les tailles après :**
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift | tee /tmp/p2-t6-apres.txt && \
paste /tmp/p2-t6-avant.txt /tmp/p2-t6-apres.txt
```
Attendu :
- `ConversationView.swift` : Δ = −19 (+2 lignes au `switch`, −21 lignes relocalisées) ;
- `MessageOverlayMenu.swift` : Δ = −57 (+3, −60).

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande : celle de l'Étape 2, avec les gardes touchées par les relocalisations et par le memberwise :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageActionResolverTests \
  -only-testing:MeeshyTests/CallDetailRoutingTests \
  -only-testing:MeeshyTests/MessageStickerMenuEntryTests \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/MessageMoreJumpsToViewsGuardTests \
  -only-testing:MeeshyTests/NumericAccessibilityValueGuardTests \
  -only-testing:MeeshyTests/BubbleWindowMetricsTests \
  -only-testing:MeeshyTests/ComposerTourbillonAndQuickEmojiSourceGuardTests \
  -only-testing:MeeshyTests/FileSizeBudgetGuardTests \
  -only-testing:MeeshyTests/FixedFontSizeGuardTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageActionResolverTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu :
- les quatre témoins Rivière passent ;
- `with 0 failures` et aucune ligne `error:` ;
- si `FileSizeBudgetGuardTests` ou `LocalizationConsistencyTests` rougissent, comparer à `origin/dev` avant de conclure (rouges hérités possibles, voir la mémoire « Suite iOS : 26 rouges HÉRITÉS »).

Vérifier le pbxproj :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
echo "avant $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources') après $(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj)"
```
Attendu : après = avant + 4 (deux fichiers neufs × 2).

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift \
        apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift \
        apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift \
        apps/ios/Meeshy/Features/Main/Components/EmojiUsageTracker.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/HeaderSearchGlyph.swift \
        apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -m "$(cat <<'EOF'
feat(ios): en Rivière, la liste compacte offre « Ouvrir dans le fil » et « Répondre » (#5983)

- `PrimaryAction.openInThread` et `.reply`, portés par
  `MessageMenuContext.isRiver` (défaut `false`) : insérés juste après
  `.callDetail`, en tête s'il est absent. Hors Rivière, rien ne change.
- `MessageActionsMenu` : glyphes `text.bubble` et
  `arrowshape.turn.up.left`, clés `riviere.bubble.openInThread` et
  `action.reply`, les mêmes que le `.contextMenu` de la Rivière.
- `switch` exhaustifs complétés : `MessageOverlayMenu.handlePrimaryAction`
  (inerte, l'overlay historique ne pose jamais `isRiver`, D8) et
  `nativeMenuButton` (`EmptyView`, chemin mort gardé par D3).

Budget (D4), wc -l avant → après :
- ConversationView.swift : Δ −19 (+2 au switch, −21 : `HeaderSearchGlyph`
  relocalisé dans `HeaderSearchGlyph.swift`, `private` retiré car encore
  utilisé par l'en-tête) ;
- MessageOverlayMenu.swift : Δ −57 (+3, −60 : `EmojiUsageTracker`
  relocalisé à l'identique dans `EmojiUsageTracker.swift`).
Aucune garde ne lit les blocs déplacés. Cumul de la dette −76 ;
`legacyLineCeiling` remesuré en Tâche 24.

Refs #5983

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
)" && git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```
Attendu (`git show --stat`) :
- huit chemins, dont deux fichiers créés ;
- les deltas de `ConversationView.swift` et de `MessageOverlayMenu.swift` sont négatifs.

---

### Tâche 7 : Les options d'un message ont une seule source de mots et se rangent toutes en sections

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Components/MessageOptionLabels.swift`
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift:5` (`PrimaryAction`), `:31` (`MoreItem`), `:54-59` (après `MoreSection`), fin de fichier (extension)
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift:56-77` (`row`), `:96-134` (switches privés supprimés)
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift:195, 207, 221-227, 317, 322, 339, 392, 395, 458-513`
- Modifier : `apps/ios/MeeshyTests/Unit/LocalizationConsistencyTests.swift` (fin de `fullyLocalizedScreens`)
- Test : `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift` (témoins de sections) ; créer `apps/ios/MeeshyTests/Unit/Components/MessageOptionLabelsTests.swift`

**Interfaces :**
- Consomme : `PrimaryAction.openInThread`, `.reply` et `MessageMenuContext.isRiver` (Tâche 6) ; `MessageActionResolver.primaryActions(_:)`, `moreSections(_:)`.
- Produit :
  ```swift
  enum PrimaryAction: String, Equatable, CaseIterable { … }
  enum MoreItem: String, Equatable, CaseIterable { … }
  enum MessageOptionLabels {
      static func symbol(_ action: PrimaryAction) -> String
      static func label(_ action: PrimaryAction) -> String
      static func symbol(_ item: MoreItem) -> String
      static func label(_ item: MoreItem) -> String
      static var actionsSectionTitle: String
      static var infoSectionTitle: String
      static var moderationSectionTitle: String
  }
  enum OptionSection: Equatable { case quick([PrimaryAction]); case actions([MoreItem]); case info([MoreItem]); case moderation([MoreItem]) }
  extension OptionSection { var isEmpty: Bool }
  extension MessageActionResolver {
      static func allOptionSections(_ ctx: MessageMenuContext) -> [OptionSection]
      static func overflowTwin(of action: PrimaryAction) -> MoreItem?
      static func nonEmptySections(_ sections: [OptionSection]) -> [OptionSection]
  }
  ```

**Gardes vérifiées :**
- `LocalizationConsistencyTests.fullyLocalizedScreens` épingle `MessageActionsMenu.swift` (13) et `MessageMoreSheet.swift` (29) : le cliquet suit un CHEMIN.
  - Les 33 clés déplacées doivent donc entrer dans la liste avec `MessageOptionLabels.swift`. Sans cela, elles sortiraient en silence des deux règles (sept locales, `defaultValue` = source `fr`).
  - Toutes les valeurs ont été mesurées identiques au catalogue.
- `MessageMoreSheetAccessibilityTests` lit :
  - la suite de `private func pellet(` (`.accessibilityAddTraits(` + `isActive`) ;
  - les 900 caractères après le premier `selectedItem = nil` (`.accessibilityLabel(` + `common.close`).
  
  Les deux restent en place.
- `ConversationMenuSystemDesignGuardTests` :
  - lit dans `MessageActionsMenu.swift` `.adaptiveGlass(in: RoundedRectangle`, `MenuRowHighlightButtonStyle` et `@ScaledMetric(relativeTo: .body) private var rowMinHeight`, ainsi que l'absence de `.buttonStyle(.plain)` ;
  - lit dans `MessageMoreSheet.swift` la branche `.media` et le dialogue.
  
  Rien de tout cela ne bouge.

**Limite du témoin « sections vides retirées » :** aucun contexte réel ne produit aujourd'hui de section vide (`.select` est toujours rapide, `.thread` toujours dans « Faire », `.reactions` toujours dans les infos, `.report` toujours en modération). Le filtre est donc éprouvé sur `nonEmptySections(_:)`, la fonction que `allOptionSections` applique. Un témoin bâti sur des contextes réels ne pourrait pas rougir.

- [ ] **Étape 1 : Écrire le test qui échoue**

**1a — `MessageActionResolverTests.swift`.** Remplacer :
```swift
    // MARK: - Helpers

    private func actionItems(_ sections: [MoreSection]) -> [MoreItem] {
```
par :
```swift
    // MARK: - allOptionSections : toutes les options, en sections (§7.2, #5984)

    /// Le menu complet d'un texte reçu : les rapides d'abord, puis « Faire »,
    /// « Infos » et « Modération ». « Copier » et « Traduire » (qui mène au
    /// panneau langue) sont déjà rapides : ils ne reparaissent pas plus bas.
    func test_allOptionSections_receivedText_isQuickActionsInfoModeration_withoutDuplicates() {
        XCTAssertEqual(
            MessageActionResolver.allOptionSections(ctx()),
            [
                .quick([.select, .translate, .copy]),
                .actions([.reply, .forward, .thread, .share, .pin, .star]),
                .info([.reactions, .views, .sentiment]),
                .moderation([.report])
            ]
        )
    }

    func test_allOptionSections_ownEditableText_dropsEditAndCopyFromActions_andDeleteIsLast() {
        let sections = MessageActionResolver.allOptionSections(ctx(isMine: true, canEdit: true, canDelete: true))
        XCTAssertEqual(sections.first, .quick([.edit, .select, .translate, .copy]))
        XCTAssertEqual(optionActions(sections), [.reply, .forward, .thread, .share, .pin, .star, .delete])
    }

    /// « Supprimer le média » reste : il ouvre sa confirmation, jamais une
    /// suppression directe. « Supprimer » ferme la section, isolé.
    func test_allOptionSections_deletableMedia_keepsMedia_andDeleteIsLast() {
        let actions = optionActions(MessageActionResolver.allOptionSections(ctx(isMine: true, canDelete: true, hasMedia: true)))
        XCTAssertTrue(actions.contains(.media))
        XCTAssertEqual(actions.last, .delete)
    }

    /// En Rivière, « Répondre » est déjà rapide : il quitte « Faire ».
    func test_allOptionSections_river_dropsReplyFromActions() {
        let sections = MessageActionResolver.allOptionSections(ctx(isRiver: true))
        XCTAssertEqual(sections.first, .quick([.openInThread, .reply, .select, .translate, .copy]))
        XCTAssertEqual(optionActions(sections), [.forward, .thread, .share, .pin, .star])
    }

    func test_allOptionSections_viewOnceMedia_offersNoForward() {
        let actions = optionActions(MessageActionResolver.allOptionSections(
            ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 1, isForwardable: false)))
        XCTAssertEqual(actions, [.reply, .thread, .share, .pin, .star])
    }

    func test_allOptionSections_noText_hasNeitherTranslateCopyNorSentiment() {
        let sections = MessageActionResolver.allOptionSections(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 1))
        XCTAssertEqual(sections.first, .quick([.select, .saveMedia]))
        XCTAssertEqual(optionInfo(sections), [.reactions, .views])
    }

    /// Discrimination : « Langue » ne disparaît QUE si « Traduire » est rapide.
    /// Un audio sans texte n'offre pas « Traduire » : sa langue reste en infos.
    func test_allOptionSections_timebasedMediaWithoutText_keepsLanguageInInfo() {
        let sections = MessageActionResolver.allOptionSections(ctx(hasText: false, hasMedia: true, hasTimebasedMedia: true))
        XCTAssertEqual(optionInfo(sections), [.language, .transcription, .reactions, .views])
    }

    func test_allOptionSections_receivedText_offersNoEditAnywhere() {
        let sections = MessageActionResolver.allOptionSections(ctx())
        XCTAssertFalse(optionQuick(sections).contains(.edit))
        XCTAssertFalse(optionActions(sections).contains(.edit))
    }

    func test_allOptionSections_editedWithRevisions_keepsHistoryInInfo() {
        let sections = MessageActionResolver.allOptionSections(ctx(isEdited: true, hasEditRevisions: true))
        XCTAssertTrue(optionInfo(sections).contains(.history))
    }

    func test_nonEmptySections_dropsEmptySections_andKeepsTheOrder() {
        XCTAssertEqual(
            MessageActionResolver.nonEmptySections([.quick([]), .actions([.reply]), .info([]), .moderation([.report])]),
            [.actions([.reply]), .moderation([.report])]
        )
    }

    /// Le jumeau est la MÊME destination. « Sélectionner » n'a pas de jumeau :
    /// « Transférer » arme aussi la sélection, mais reste un geste distinct
    /// tant que #5989 n'a pas tranché.
    func test_overflowTwin_isTheSameDestination_andSelectHasNone() {
        XCTAssertEqual(MessageActionResolver.overflowTwin(of: .translate), .language)
        XCTAssertEqual(MessageActionResolver.overflowTwin(of: .reply), .reply)
        XCTAssertEqual(MessageActionResolver.overflowTwin(of: .edit), .edit)
        XCTAssertEqual(MessageActionResolver.overflowTwin(of: .copy), .copy)
        XCTAssertNil(MessageActionResolver.overflowTwin(of: .select))
        XCTAssertNil(MessageActionResolver.overflowTwin(of: .saveMedia), "« Média » ouvre un sous-menu plus large qu'« Enregistrer »")
    }

    // MARK: - Helpers

    private func optionQuick(_ sections: [OptionSection]) -> [PrimaryAction] {
        for s in sections { if case .quick(let items) = s { return items } }
        return []
    }

    private func optionActions(_ sections: [OptionSection]) -> [MoreItem] {
        for s in sections { if case .actions(let items) = s { return items } }
        return []
    }

    private func optionInfo(_ sections: [OptionSection]) -> [MoreItem] {
        for s in sections { if case .info(let items) = s { return items } }
        return []
    }

    private func actionItems(_ sections: [MoreSection]) -> [MoreItem] {
```

**1b — créer `apps/ios/MeeshyTests/Unit/Components/MessageOptionLabelsTests.swift` :**
```swift
import XCTest
import UIKit
@testable import Meeshy

/// **Les mots et les glyphes des options d'un message — UNE source (#5984).**
///
/// Le menu compact (`MessageActionsMenu`) et la feuille « Plus… »
/// (`MessageMoreSheet`) portaient chacun leur `switch` de libellés. Le menu
/// complet du double tap les montre CÔTE À CÔTE : deux copies se liraient
/// comme deux actes. Ce qui se vérifie ici : chaque option a un mot et un
/// glyphe qui EXISTE, un même acte garde le même mot et le même glyphe dans
/// les deux types, la Rivière garde ses glyphes, et les deux menus n'ont
/// plus de copie.
@MainActor
final class MessageOptionLabelsTests: XCTestCase {

    private func appSource(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - Chaque option a un mot et un glyphe réel

    func test_everyPrimaryAction_hasALabelAndARealSymbol() {
        for action in PrimaryAction.allCases {
            XCTAssertFalse(MessageOptionLabels.label(action).isEmpty, "\(action)")
            XCTAssertNotNil(
                UIImage(systemName: MessageOptionLabels.symbol(action)),
                "\(action) : « \(MessageOptionLabels.symbol(action)) » n'est pas un SF Symbol — la ligne n'aurait pas d'icône"
            )
        }
    }

    func test_everyMoreItem_hasALabelAndARealSymbol() {
        for item in MoreItem.allCases {
            XCTAssertFalse(MessageOptionLabels.label(item).isEmpty, "\(item)")
            XCTAssertNotNil(
                UIImage(systemName: MessageOptionLabels.symbol(item)),
                "\(item) : « \(MessageOptionLabels.symbol(item)) » n'est pas un SF Symbol"
            )
        }
    }

    // MARK: - Un même acte, un même mot, un même glyphe

    func test_sameAct_inQuickAndInMore_readsTheSameWordAndGlyph() {
        let jumeaux: [(PrimaryAction, MoreItem)] = [(.reply, .reply), (.edit, .edit), (.copy, .copy), (.delete, .delete)]
        for (rapide, plus) in jumeaux {
            XCTAssertEqual(MessageOptionLabels.label(rapide), MessageOptionLabels.label(plus), "\(rapide)")
            XCTAssertEqual(MessageOptionLabels.symbol(rapide), MessageOptionLabels.symbol(plus), "\(rapide)")
        }
    }

    /// La Rivière offrait déjà ces deux actes dans son `.contextMenu` : la
    /// liste compacte doit les dessiner avec les MÊMES glyphes (dimension 6).
    func test_riverActs_useTheGlyphsOfTheRiverContextMenu() throws {
        let riviere = try appSource("Features/Main/Riviere/View/RiverBubbleView.swift")
        XCTAssertTrue(riviere.contains("systemImage: \"\(MessageOptionLabels.symbol(.openInThread))\""))
        XCTAssertTrue(riviere.contains("systemImage: \"\(MessageOptionLabels.symbol(PrimaryAction.reply))\""))
    }

    // MARK: - Les deux menus n'ont plus de copie

    func test_compactMenuAndMoreSheet_readTheirWordsFromTheSingleSource() throws {
        for path in ["Features/Main/Components/MessageActionsMenu.swift", "Features/Main/Components/MessageMoreSheet.swift"] {
            let source = try appSource(path)
            XCTAssertFalse(source.contains("func symbol("), "\(path) réécrit ses glyphes")
            XCTAssertFalse(source.contains("func label("), "\(path) réécrit ses libellés")
            XCTAssertFalse(source.contains("func labelText("), "\(path) réécrit ses libellés")
            XCTAssertTrue(source.contains("MessageOptionLabels.label("), "\(path) doit lire MessageOptionLabels")
            XCTAssertTrue(source.contains("MessageOptionLabels.symbol("), "\(path) doit lire MessageOptionLabels")
        }
    }

    func test_moreSheetSectionTitles_comeFromTheSingleSource() throws {
        let sheet = try appSource("Features/Main/Components/MessageMoreSheet.swift")
        XCTAssertFalse(sheet.contains("\"message-more.section.actions\""))
        XCTAssertFalse(sheet.contains("\"message-more.section.info\""))
        XCTAssertFalse(sheet.contains("\"message-more.section.moderation\""))
        XCTAssertTrue(sheet.contains("MessageOptionLabels.actionsSectionTitle"))
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande (commande ciblée du contrat, deux classes) :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageActionResolverTests \
  -only-testing:MeeshyTests/MessageOptionLabelsTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageOptionLabelsTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation, avec :
- `error: cannot find type 'OptionSection' in scope` ;
- `error: type 'MessageActionResolver' has no member 'allOptionSections'` ;
- `error: cannot find 'MessageOptionLabels' in scope` ;
- `error: type 'PrimaryAction' has no member 'allCases'`.

- [ ] **Étape 3 : Implémentation minimale**

**3a — créer `apps/ios/Meeshy/Features/Main/Components/MessageOptionLabels.swift` :**
```swift
import Foundation

/// **Les mots et les glyphes des options d'un message — UNE source (#5984).**
///
/// Trois surfaces les montrent : la liste compacte de l'appui long
/// (`MessageActionsMenu`), la feuille « Plus… » (`MessageMoreSheet`) et le
/// menu complet du double tap Script (`MessageOptionsGlassMenu`), qui aligne
/// les deux familles côte à côte. Deux `switch` recopiés se liraient comme
/// deux actes différents dès que l'un change.
///
/// `PrimaryAction` et `MoreItem` gardent chacun leurs mots quand ils diffèrent
/// déjà (« Ajouter aux favoris » dans la liste, « Favori » en pastille) : la
/// source est unique, pas le vocabulaire aplati.
enum MessageOptionLabels {

    static func symbol(_ action: PrimaryAction) -> String {
        switch action {
        case .edit: return "pencil"
        case .translate: return "globe"
        case .copy: return "doc.on.doc"
        case .saveMedia: return "arrow.down.to.line"
        case .compose: return "wand.and.stars"
        case .pin: return "pin.fill"
        case .unpin: return "pin.slash.fill"
        case .star: return "star.fill"
        case .unstar: return "star.slash.fill"
        case .more: return "ellipsis"
        case .delete: return "trash"
        case .callDetail: return "info.circle"
        case .select: return "checkmark.circle"
        case .openInThread: return "text.bubble"
        case .reply: return "arrowshape.turn.up.left"
        }
    }

    static func label(_ action: PrimaryAction) -> String {
        switch action {
        case .edit: return String(localized: "action.edit", defaultValue: "Modifier", bundle: .main)
        case .translate: return String(localized: "action.translate", defaultValue: "Traduire", bundle: .main)
        case .copy: return String(localized: "action.copy", defaultValue: "Copier", bundle: .main)
        case .saveMedia: return String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main)
        case .compose: return String(localized: "message.compose.title", defaultValue: "Composer", bundle: .main)
        case .pin: return String(localized: "action.pin", defaultValue: "Épingler", bundle: .main)
        case .unpin: return String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main)
        case .star: return String(localized: "action.star", defaultValue: "Ajouter aux favoris", bundle: .main)
        case .unstar: return String(localized: "action.unstar", defaultValue: "Retirer des favoris", bundle: .main)
        case .more: return String(localized: "action.more", defaultValue: "Plus…", bundle: .main)
        case .delete: return String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main)
        case .callDetail: return String(localized: "bubble.call.details.action", defaultValue: "Détails de l'appel", bundle: .main)
        case .select: return String(localized: "action.select", defaultValue: "Sélectionner", bundle: .main)
        case .openInThread: return String(localized: "riviere.bubble.openInThread", defaultValue: "Ouvrir dans le fil", bundle: .main)
        case .reply: return String(localized: "action.reply", defaultValue: "Répondre", bundle: .main)
        }
    }

    static func symbol(_ item: MoreItem) -> String {
        switch item {
        case .reply: return "arrowshape.turn.up.left"
        case .forward: return "arrowshape.turn.up.right"
        case .thread: return "bubble.left.and.bubble.right"
        case .media: return "paperclip.badge.ellipsis"
        case .pin: return "pin"
        case .unpin: return "pin.slash"
        case .star: return "star"
        case .unstar: return "star.slash"
        case .pinSticker: return "rectangle.portrait.on.rectangle.portrait.angled"
        case .unpinSticker: return "rectangle.portrait.slash"
        case .delete: return "trash"
        case .edit: return "pencil"
        case .copy: return "doc.on.doc"
        case .share: return "square.and.arrow.up"
        case .language: return "globe"
        case .views: return "eye"
        case .reactions: return "face.smiling"
        case .transcription: return "waveform"
        case .sentiment: return "brain.head.profile"
        case .history: return "clock.arrow.circlepath"
        case .report: return "exclamationmark.triangle"
        }
    }

    static func label(_ item: MoreItem) -> String {
        switch item {
        case .reply: return String(localized: "action.reply", defaultValue: "Répondre", bundle: .main)
        case .forward: return String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main)
        case .thread: return String(localized: "action.thread", defaultValue: "Discussion", bundle: .main)
        case .media: return String(localized: "action.media", defaultValue: "Média", bundle: .main)
        case .pin: return String(localized: "action.pin", defaultValue: "Épingler", bundle: .main)
        case .unpin: return String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main)
        case .star: return String(localized: "action.favorite", defaultValue: "Favori", bundle: .main)
        case .unstar: return String(localized: "action.unfavorite", defaultValue: "Retirer le favori", bundle: .main)
        // Le libellé NOMME l'objet — « la décoration », pas « le favori ».
        // Voisin de `star`, il en désigne un autre : le message reste dans sa
        // conversation, la décoration part dans la palette.
        case .pinSticker: return String(localized: "action.pinSticker",
                                        defaultValue: "Épingler la décoration", bundle: .main)
        case .unpinSticker: return String(localized: "action.unpinSticker",
                                          defaultValue: "Retirer la décoration", bundle: .main)
        case .delete: return String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main)
        case .edit: return String(localized: "action.edit", defaultValue: "Modifier", bundle: .main)
        case .copy: return String(localized: "action.copy", defaultValue: "Copier", bundle: .main)
        case .share: return String(localized: "action.share", defaultValue: "Partager", bundle: .main)
        case .language: return String(localized: "message-detail.tab.language", defaultValue: "Traduire", bundle: .main)
        case .views: return String(localized: "message-detail.tab.views", defaultValue: "Qui a vu", bundle: .main)
        case .reactions: return String(localized: "message-detail.tab.reactions", defaultValue: "Réactions", bundle: .main)
        case .transcription: return String(localized: "message-detail.tab.transcription", defaultValue: "Transcription", bundle: .main)
        case .sentiment: return String(localized: "message-detail.tab.sentiment", defaultValue: "Sentiment", bundle: .main)
        case .history: return String(localized: "message-detail.tab.history", defaultValue: "Historique", bundle: .main)
        case .report: return String(localized: "message-detail.tab.report", defaultValue: "Signaler", bundle: .main)
        }
    }

    // MARK: - Titres de section (feuille « Plus… » et menu complet)

    static var actionsSectionTitle: String {
        String(localized: "message-more.section.actions", defaultValue: "Actions", bundle: .main)
    }

    static var infoSectionTitle: String {
        String(localized: "message-more.section.info", defaultValue: "Infos & Prisme", bundle: .main)
    }

    static var moderationSectionTitle: String {
        String(localized: "message-more.section.moderation", defaultValue: "Modération", bundle: .main)
    }
}
```

**3b — `MessageActionResolver.swift`.** Remplacer `enum PrimaryAction: String, Equatable {` par `enum PrimaryAction: String, Equatable, CaseIterable {`, puis `enum MoreItem: String, Equatable {` par `enum MoreItem: String, Equatable, CaseIterable {`.

Remplacer :
```swift
/// Section de la feuille « Plus… ».
enum MoreSection: Equatable {
    case actions([MoreItem])
    case info([MoreItem])
    case moderation([MoreItem])
}
```
par :
```swift
/// Section de la feuille « Plus… ».
enum MoreSection: Equatable {
    case actions([MoreItem])
    case info([MoreItem])
    case moderation([MoreItem])
}

/// **Section du menu COMPLET** — le double tap Script (D6, spec §7.2, #5984) :
/// les rapides de l'appui long, puis ce que « Plus… » contient de plus.
enum OptionSection: Equatable {
    case quick([PrimaryAction])
    case actions([MoreItem])
    case info([MoreItem])
    case moderation([MoreItem])
}

extension OptionSection {
    var isEmpty: Bool {
        switch self {
        case .quick(let actions): return actions.isEmpty
        case .actions(let items), .info(let items), .moderation(let items): return items.isEmpty
        }
    }
}
```

Remplacer (fin du fichier) :
```swift
        sections.append(.moderation([.report]))
        return sections
    }
}
```
par :
```swift
        sections.append(.moderation([.report]))
        return sections
    }
}

extension MessageActionResolver {
    /// **Toutes les options d'un message, en sections** (spec §7.2) : les
    /// rapides (`primaryActions` sans « Plus… »), puis « Faire », « Infos » et
    /// « Modération » de `moreSections`, privés de ce que les rapides offrent
    /// déjà (`overflowTwin`). « Supprimer » ferme « Faire » ; les sections
    /// vides ne sont pas servies.
    static func allOptionSections(_ ctx: MessageMenuContext) -> [OptionSection] {
        let quick = primaryActions(ctx).filter { $0 != .more }
        let twins = Set(quick.compactMap { overflowTwin(of: $0) })
        let more = moreSections(ctx)
        let faire = more.flatMap { section -> [MoreItem] in
            if case .actions(let items) = section { return items }
            return []
        }
        let infos = more.flatMap { section -> [MoreItem] in
            if case .info(let items) = section { return items }
            return []
        }
        let moderation = more.flatMap { section -> [MoreItem] in
            if case .moderation(let items) = section { return items }
            return []
        }
        let actions = faire.filter { !twins.contains($0) && $0 != .delete } + faire.filter { $0 == .delete }
        return nonEmptySections([
            .quick(quick),
            .actions(actions),
            .info(infos.filter { !twins.contains($0) }),
            .moderation(moderation)
        ])
    }

    /// **Le jumeau « Plus… » d'une action rapide** : la MÊME destination sous
    /// l'autre type. `nil` ⇒ aucun doublon dans la feuille. `.select` n'a pas de
    /// jumeau : « Transférer » arme aussi la sélection mais reste un geste
    /// distinct (#5989) ; `.saveMedia` non plus : « Média » ouvre un sous-menu
    /// plus large.
    static func overflowTwin(of action: PrimaryAction) -> MoreItem? {
        switch action {
        case .edit: return .edit
        case .copy: return .copy
        case .reply: return .reply
        case .translate: return .language
        case .pin: return .pin
        case .unpin: return .unpin
        case .star: return .star
        case .unstar: return .unstar
        case .delete: return .delete
        case .saveMedia, .compose, .callDetail, .select, .more, .openInThread: return nil
        }
    }

    /// Les sections non vides, dans leur ordre.
    static func nonEmptySections(_ sections: [OptionSection]) -> [OptionSection] {
        sections.filter { !$0.isEmpty }
    }
}
```

**3c — `MessageActionsMenu.swift`.** Remplacer `                Image(systemName: symbol(action))` par `                Image(systemName: MessageOptionLabels.symbol(action))`. Remplacer `                Text(label(action))` par `                Text(MessageOptionLabels.label(action))`. Remplacer `        .accessibilityLabel(label(action))` par `        .accessibilityLabel(MessageOptionLabels.label(action))`.

Puis remplacer (état laissé par la Tâche 6) :
```swift
        return CGSize(width: menuWidth, height: CGFloat(count) * scaledRow + 20)
    }

    private func symbol(_ a: PrimaryAction) -> String {
        switch a {
        case .edit: return "pencil"
        case .translate: return "globe"
        case .copy: return "doc.on.doc"
        case .saveMedia: return "arrow.down.to.line"
        case .compose: return "wand.and.stars"
        case .pin: return "pin.fill"
        case .unpin: return "pin.slash.fill"
        case .star: return "star.fill"
        case .unstar: return "star.slash.fill"
        case .more: return "ellipsis"
        case .delete: return "trash"
        case .callDetail: return "info.circle"
        case .select: return "checkmark.circle"
        case .openInThread: return "text.bubble"
        case .reply: return "arrowshape.turn.up.left"
        }
    }

    private func label(_ a: PrimaryAction) -> String {
        switch a {
        case .edit: return String(localized: "action.edit", defaultValue: "Modifier", bundle: .main)
        case .translate: return String(localized: "action.translate", defaultValue: "Traduire", bundle: .main)
        case .copy: return String(localized: "action.copy", defaultValue: "Copier", bundle: .main)
        case .saveMedia: return String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main)
        case .compose: return String(localized: "message.compose.title", defaultValue: "Composer", bundle: .main)
        case .pin: return String(localized: "action.pin", defaultValue: "Épingler", bundle: .main)
        case .unpin: return String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main)
        case .star: return String(localized: "action.star", defaultValue: "Ajouter aux favoris", bundle: .main)
        case .unstar: return String(localized: "action.unstar", defaultValue: "Retirer des favoris", bundle: .main)
        case .more: return String(localized: "action.more", defaultValue: "Plus…", bundle: .main)
        case .delete: return String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main)
        case .callDetail: return String(localized: "bubble.call.details.action", defaultValue: "Détails de l'appel", bundle: .main)
        case .select: return String(localized: "action.select", defaultValue: "Sélectionner", bundle: .main)
        case .openInThread: return String(localized: "riviere.bubble.openInThread", defaultValue: "Ouvrir dans le fil", bundle: .main)
        case .reply: return String(localized: "action.reply", defaultValue: "Répondre", bundle: .main)
        }
    }
}
```
par :
```swift
        return CGSize(width: menuWidth, height: CGFloat(count) * scaledRow + 20)
    }
}
```

**3d — `MessageMoreSheet.swift`.**
- Remplacer TOUTES les occurrences (3) de `Image(systemName: symbol(item))` par `Image(systemName: MessageOptionLabels.symbol(item))`.
- Remplacer TOUTES les occurrences (4) de `labelText(item)` par `MessageOptionLabels.label(item)`.

Puis remplacer :
```swift
        case .actions(let items):
            pelletSubGrid(title: String(localized: "message-more.section.actions", defaultValue: "Actions", bundle: .main), items: items)
        case .info(let items):
            pelletSubGrid(title: String(localized: "message-more.section.info", defaultValue: "Infos & Prisme", bundle: .main), items: items)
        case .moderation(let items):
            pelletSubGrid(title: String(localized: "message-more.section.moderation", defaultValue: "Modération", bundle: .main), items: items)
```
par :
```swift
        case .actions(let items):
            pelletSubGrid(title: MessageOptionLabels.actionsSectionTitle, items: items)
        case .info(let items):
            pelletSubGrid(title: MessageOptionLabels.infoSectionTitle, items: items)
        case .moderation(let items):
            pelletSubGrid(title: MessageOptionLabels.moderationSectionTitle, items: items)
```
Puis remplacer :
```swift
             .pinSticker, .unpinSticker, .delete, .edit, .copy, .share:
            EmptyView()
        }
    }

    private func symbol(_ item: MoreItem) -> String {
        switch item {
        case .reply: return "arrowshape.turn.up.left"
        case .forward: return "arrowshape.turn.up.right"
        case .thread: return "bubble.left.and.bubble.right"
        case .media: return "paperclip.badge.ellipsis"
        case .pin: return "pin"
        case .unpin: return "pin.slash"
        case .star: return "star"
        case .unstar: return "star.slash"
        case .pinSticker: return "rectangle.portrait.on.rectangle.portrait.angled"
        case .unpinSticker: return "rectangle.portrait.slash"
        case .delete: return "trash"
        case .edit: return "pencil"
        case .copy: return "doc.on.doc"
        case .share: return "square.and.arrow.up"
        case .language: return "globe"
        case .views: return "eye"
        case .reactions: return "face.smiling"
        case .transcription: return "waveform"
        case .sentiment: return "brain.head.profile"
        case .history: return "clock.arrow.circlepath"
        case .report: return "exclamationmark.triangle"
        }
    }

    private func labelText(_ item: MoreItem) -> String {
        switch item {
        case .reply: return String(localized: "action.reply", defaultValue: "Répondre", bundle: .main)
        case .forward: return String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main)
        case .thread: return String(localized: "action.thread", defaultValue: "Discussion", bundle: .main)
        case .media: return String(localized: "action.media", defaultValue: "Média", bundle: .main)
        case .pin: return String(localized: "action.pin", defaultValue: "Épingler", bundle: .main)
        case .unpin: return String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main)
        case .star: return String(localized: "action.favorite", defaultValue: "Favori", bundle: .main)
        case .unstar: return String(localized: "action.unfavorite", defaultValue: "Retirer le favori", bundle: .main)
        // Le libellé NOMME l'objet — « la décoration », pas « le favori ».
        // Voisin de `star`, il en désigne un autre : le message reste dans sa
        // conversation, la décoration part dans la palette.
        case .pinSticker: return String(localized: "action.pinSticker",
                                        defaultValue: "Épingler la décoration", bundle: .main)
        case .unpinSticker: return String(localized: "action.unpinSticker",
                                          defaultValue: "Retirer la décoration", bundle: .main)
        case .delete: return String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main)
        case .edit: return String(localized: "action.edit", defaultValue: "Modifier", bundle: .main)
        case .copy: return String(localized: "action.copy", defaultValue: "Copier", bundle: .main)
        case .share: return String(localized: "action.share", defaultValue: "Partager", bundle: .main)
        case .language: return String(localized: "message-detail.tab.language", defaultValue: "Traduire", bundle: .main)
        case .views: return String(localized: "message-detail.tab.views", defaultValue: "Qui a vu", bundle: .main)
        case .reactions: return String(localized: "message-detail.tab.reactions", defaultValue: "Réactions", bundle: .main)
        case .transcription: return String(localized: "message-detail.tab.transcription", defaultValue: "Transcription", bundle: .main)
        case .sentiment: return String(localized: "message-detail.tab.sentiment", defaultValue: "Sentiment", bundle: .main)
        case .history: return String(localized: "message-detail.tab.history", defaultValue: "Historique", bundle: .main)
        case .report: return String(localized: "message-detail.tab.report", defaultValue: "Signaler", bundle: .main)
        }
    }
}
```
par :
```swift
             .pinSticker, .unpinSticker, .delete, .edit, .copy, .share:
            EmptyView()
        }
    }
}
```

**3e — `LocalizationConsistencyTests.swift` : le cliquet suit les clés.** Remplacer :
```swift
        "apps/ios/Meeshy/Features/Main/Views/StorySentinelView.swift",  // 4
    ]
```
par :
```swift
        "apps/ios/Meeshy/Features/Main/Views/StorySentinelView.swift",  // 4
        // #5984 — les mots des options d'un message quittent `MessageActionsMenu`
        // et `MessageMoreSheet` (tous deux épinglés) pour leur source UNIQUE. Le
        // cliquet suit le CODE : sans cette ligne, 33 clés sortiraient des deux
        // règles au moment même où elles déménagent.
        "apps/ios/Meeshy/Features/Main/Components/MessageOptionLabels.swift",  // 33
    ]
```

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande : celle de l'Étape 2, avec en plus :
```
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -only-testing:MeeshyTests/MessageMoreSheetAccessibilityTests \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/MessageStickerMenuEntryTests \
```
Attendu :
- les 11 témoins de sections et les 6 de `MessageOptionLabelsTests` passent ;
- `test_fullyLocalizedScreensStayTranslatedInEveryShippedLocale` et `test_fullyLocalizedScreenDefaultValuesMatchTheCatalogSourceLanguage` restent verts ;
- `with 0 failures`.

Vérifier le pbxproj : après = avant + 4 (commande de la Tâche 6, Étape 4).

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add apps/ios/Meeshy/Features/Main/Components/MessageOptionLabels.swift \
        apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift \
        apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift \
        apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift \
        apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift \
        apps/ios/MeeshyTests/Unit/Components/MessageOptionLabelsTests.swift \
        apps/ios/MeeshyTests/Unit/LocalizationConsistencyTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -m "$(cat <<'EOF'
feat(ios): les options d'un message ont une seule source de mots et se rangent toutes en sections (#5984)

- `MessageOptionLabels` : glyphes, libellés et titres de section de
  `PrimaryAction` et de `MoreItem`, extraits à l'identique de
  `MessageActionsMenu` et de `MessageMoreSheet`, qui les lisent désormais.
  Témoins : chaque glyphe est un SF Symbol réel ; un même acte garde son mot
  et son glyphe dans les deux types ; la Rivière garde ses glyphes.
- `MessageActionResolver.allOptionSections(_:)` (§7.2) : rapides sans
  « Plus… », puis « Faire » sans ce que les rapides offrent déjà
  (`overflowTwin` : edit, copy, reply ; `language` si « Traduire » est
  rapide), `delete` en dernier, « Infos », « Modération ». Les sections vides
  ne sont pas servies (`nonEmptySections`).
- `PrimaryAction` et `MoreItem` deviennent `CaseIterable`.
- `fullyLocalizedScreens` épingle `MessageOptionLabels.swift` : les 33 clés
  déplacées restent sous les deux règles du cliquet i18n.

Refs #5984

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
)" && git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

---

### Tâche 8 : Une seule fabrique construit le contexte d'un message avec les vraies valeurs de la conversation

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Components/MessageMenuContextFactory.swift`
- Créer : `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageMenuContext.swift`
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (numéros d'origine l.937-955 : le `let ctx = MessageMenuContext(…)` de `.sheet(item: $overlayState.detailSheetMessage)`)
- Test : `apps/ios/MeeshyTests/Unit/Components/MessageMenuContextFactoryTests.swift` (créer)

**Interfaces :**
- Consomme :
  - `MessageMenuContext` avec `isRiver` (Tâche 6) ;
  - `ComposableAttachment.offers(message:)` ;
  - `MessageStickerFavorite.state(for:in:)` (`@MainActor`, magasin `.shared` par défaut) ;
  - `ConversationViewModel.isStarred(messageId:) -> Bool` et `editRevisions(for:) -> [EditRevision]` ;
  - `ConversationView.isCurrentUserAdminOrMod` ;
  - `UserPreferencesManager.shared.privacy.showReadReceipts`.
- Produit :
  ```swift
  struct MessageMenuFacts: Equatable {
      let canModerate: Bool
      let isStarred: Bool
      let hasEditRevisions: Bool
      let stickerFavorite: Bool?
      let showReadReceipts: Bool
      let isRiver: Bool
  }
  enum MessageMenuContextFactory { static func make(message: Message, facts: MessageMenuFacts) -> MessageMenuContext }
  extension ConversationView { func menuContext(for message: Message, isRiver: Bool) -> MessageMenuContext }
  ```

D8 : la feuille « Plus… » adopte la fabrique ; l'overlay historique (`MessageOverlayMenu.menuContext`) et `buildNativeMessageMenu` gardent le leur jusqu'à #5985.

Le contexte de la feuille ne posait ni `hasCallSummary`, ni `saveableAttachmentCount`, ni `canComposeMedia`. Ces trois champs ne gouvernent que `primaryActions`, que la feuille ne lit pas : ses sections sont identiques avant et après. Le menu compact neuf et le menu complet, eux, ont besoin des trois.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Components/MessageMenuContextFactoryTests.swift` :
```swift
import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un contexte de menu, une fabrique (D8, #5984).**
///
/// Trois sites construisaient `MessageMenuContext` à la main, et ils
/// divergeaient : l'overlay posait `hasEditRevisions: true` et ignorait le
/// favori de sticker, pendant que la feuille « Plus… » lisait les vraies
/// valeurs. Le menu compact neuf, le menu complet et la feuille passent par
/// `MessageMenuContextFactory` : ce que le MESSAGE dit se lit sur lui ; ce que
/// la CONVERSATION sait arrive par `MessageMenuFacts`.
@MainActor
final class MessageMenuContextFactoryTests: XCTestCase {

    private func facts(
        canModerate: Bool = false, isStarred: Bool = false, hasEditRevisions: Bool = false,
        stickerFavorite: Bool? = nil, showReadReceipts: Bool = true, isRiver: Bool = false
    ) -> MessageMenuFacts {
        MessageMenuFacts(canModerate: canModerate, isStarred: isStarred, hasEditRevisions: hasEditRevisions,
                         stickerFavorite: stickerFavorite, showReadReceipts: showReadReceipts, isRiver: isRiver)
    }

    private func message(
        content: String = "coucou", isEdited: Bool = false, pinnedAt: Date? = nil,
        attachments: [MeeshyMessageAttachment] = [], isMe: Bool = false,
        callSummary: CallSummaryMetadata? = nil, isViewOnce: Bool = false
    ) -> Message {
        var m = MeeshyMessage(conversationId: "conv-1", content: content, isEdited: isEdited,
                              pinnedAt: pinnedAt, attachments: attachments, isMe: isMe,
                              callSummary: callSummary)
        m.isViewOnce = isViewOnce
        return m
    }

    private func piece(_ mimeType: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: mimeType, fileUrl: "https://cdn.example/x")
    }

    private func appel() -> CallSummaryMetadata {
        CallSummaryMetadata(callId: "call-1", initiatorId: "user-1", callType: .audio, outcome: .completed,
                            durationSeconds: 42, bytesTotal: nil, bytesEstimated: false, networkQuality: nil)
    }

    private func info(_ ctx: MessageMenuContext) -> [MoreItem] {
        MessageActionResolver.moreSections(ctx).flatMap { section -> [MoreItem] in
            if case .info(let items) = section { return items }
            return []
        }
    }

    private func actions(_ ctx: MessageMenuContext) -> [MoreItem] {
        MessageActionResolver.moreSections(ctx).flatMap { section -> [MoreItem] in
            if case .actions(let items) = section { return items }
            return []
        }
    }

    // MARK: - Les valeurs RÉELLES de la conversation (D8)

    /// Le défaut de l'overlay : `hasEditRevisions: true` en dur ouvrait
    /// « Historique » sur un message édité dont aucune révision n'existe.
    func test_make_editedWithoutRevisions_servesNoHistory() {
        let edite = message(isEdited: true)
        XCTAssertFalse(info(MessageMenuContextFactory.make(message: edite, facts: facts(hasEditRevisions: false))).contains(.history))
        XCTAssertTrue(info(MessageMenuContextFactory.make(message: edite, facts: facts(hasEditRevisions: true))).contains(.history))
    }

    /// Le second défaut de l'overlay : le favori de sticker absent. La fabrique
    /// porte le tri-état tel quel — `nil` retire l'entrée, `false` l'offre en
    /// « épingler », `true` en « retirer ».
    func test_make_stickerFavorite_servesTheDecorationEntry() {
        let msg = message()
        XCTAssertTrue(actions(MessageMenuContextFactory.make(message: msg, facts: facts(stickerFavorite: false))).contains(.pinSticker))
        XCTAssertTrue(actions(MessageMenuContextFactory.make(message: msg, facts: facts(stickerFavorite: true))).contains(.unpinSticker))
        let sansSticker = actions(MessageMenuContextFactory.make(message: msg, facts: facts(stickerFavorite: nil)))
        XCTAssertFalse(sansSticker.contains(.pinSticker))
        XCTAssertFalse(sansSticker.contains(.unpinSticker))
    }

    func test_make_carriesStarReadReceiptsAndRiver() {
        let ctx = MessageMenuContextFactory.make(
            message: message(), facts: facts(isStarred: true, showReadReceipts: false, isRiver: true))
        XCTAssertTrue(ctx.isStarred)
        XCTAssertFalse(ctx.showReadReceipts)
        XCTAssertTrue(ctx.isRiver)
    }

    // MARK: - Ce que le MESSAGE dit de lui-même

    func test_make_editAndDelete_areOpenToTheAuthorAndToModerators() {
        let auteur = MessageMenuContextFactory.make(message: message(isMe: true), facts: facts())
        XCTAssertTrue(auteur.isMine)
        XCTAssertTrue(auteur.canEdit)
        XCTAssertTrue(auteur.canDelete)

        let moderateur = MessageMenuContextFactory.make(message: message(isMe: false), facts: facts(canModerate: true))
        XCTAssertFalse(moderateur.isMine)
        XCTAssertTrue(moderateur.canEdit)
        XCTAssertTrue(moderateur.canDelete)

        let lecteur = MessageMenuContextFactory.make(message: message(isMe: false), facts: facts(canModerate: false))
        XCTAssertFalse(lecteur.canEdit)
        XCTAssertFalse(lecteur.canDelete)
    }

    func test_make_whitespaceIsNotText_andAudioIsTimebasedMedia() {
        let ctx = MessageMenuContextFactory.make(
            message: message(content: "  \n\t ", attachments: [piece("audio/m4a")]), facts: facts())
        XCTAssertFalse(ctx.hasText)
        XCTAssertTrue(ctx.hasMedia)
        XCTAssertTrue(ctx.hasTimebasedMedia)

        let image = MessageMenuContextFactory.make(message: message(attachments: [piece("image/jpeg")]), facts: facts())
        XCTAssertTrue(image.hasText)
        XCTAssertFalse(image.hasTimebasedMedia)
    }

    /// « Enregistrer » n'est offert que pour UNE pièce : un lieu n'en est pas une.
    func test_make_saveableCount_excludesLocations() {
        let ctx = MessageMenuContextFactory.make(
            message: message(attachments: [piece("image/jpeg"), piece("application/x-location")]), facts: facts())
        XCTAssertEqual(ctx.saveableAttachmentCount, 1)
    }

    func test_make_readsPinCallSummaryForwardabilityAndCompose() {
        let epingle = MessageMenuContextFactory.make(
            message: message(pinnedAt: Date(), callSummary: appel()), facts: facts())
        XCTAssertTrue(epingle.isPinned)
        XCTAssertTrue(epingle.hasCallSummary)
        XCTAssertTrue(epingle.isForwardable)
        XCTAssertTrue(epingle.canComposeMedia, "un texte sème la description d'un atelier (#4025)")

        let vueUnique = MessageMenuContextFactory.make(message: message(isViewOnce: true), facts: facts())
        XCTAssertFalse(vueUnique.isForwardable)
        XCTAssertFalse(vueUnique.canComposeMedia, "clause O13 : une vue unique ne se compose pas")
        XCTAssertFalse(vueUnique.isPinned)
        XCTAssertFalse(vueUnique.hasCallSummary)
    }

    // MARK: - Câblage (garde de source : `ConversationView` ne se monte pas en test)

    private func appSource(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func balancedBody(after marker: String, in source: String) -> String? {
        guard let open = source.range(of: marker) else { return nil }
        var depth = 1
        var index = open.upperBound
        while index < source.endIndex {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" {
                depth -= 1
                if depth == 0 { return String(source[open.upperBound..<index]) }
            }
            index = source.index(after: index)
        }
        return nil
    }

    func test_moreSheet_buildsItsContextThroughTheFactory() throws {
        let view = try appSource("Features/Main/Views/ConversationView.swift")
        let sheet = try XCTUnwrap(
            balancedBody(after: ".sheet(item: $overlayState.detailSheetMessage) {", in: view),
            "la feuille « Plus… » doit rester montée par `.sheet(item: $overlayState.detailSheetMessage)`"
        )
        XCTAssertTrue(sheet.contains("menuContext(for: msg, isRiver: false)"))
        XCTAssertFalse(sheet.contains("MessageMenuContext("), "la feuille ne construit plus son contexte à la main (D8)")
    }

    func test_menuContext_readsTheRealValuesOfTheConversation() throws {
        let source = try appSource("Features/Main/Views/ConversationView+MessageMenuContext.swift")
        XCTAssertTrue(source.contains("MessageMenuContextFactory.make("))
        XCTAssertTrue(source.contains("canModerate: isCurrentUserAdminOrMod"))
        XCTAssertTrue(source.contains("viewModel.isStarred(messageId: message.id)"))
        XCTAssertTrue(source.contains("!viewModel.editRevisions(for: message.id).isEmpty"))
        XCTAssertTrue(source.contains("MessageStickerFavorite.state(for: message.sticker)"))
        XCTAssertTrue(source.contains("UserPreferencesManager.shared.privacy.showReadReceipts"))
        XCTAssertFalse(source.contains("hasEditRevisions: true"), "la valeur en dur de l'overlay ne doit pas renaître ici")
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageMenuContextFactoryTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageMenuContextFactoryTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation, avec :
- `error: cannot find type 'MessageMenuFacts' in scope` ;
- `error: cannot find 'MessageMenuContextFactory' in scope`.

- [ ] **Étape 3 : Implémentation minimale**

**3a — relever la taille avant (D4) :** `cd /Users/smpceo/Documents/v2_meeshy-longpress && wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift | tee /tmp/p2-t8-avant.txt`

**3b — créer `apps/ios/Meeshy/Features/Main/Components/MessageMenuContextFactory.swift` :**
```swift
import Foundation
import MeeshySDK

/// **Ce que la CONVERSATION sait d'un message et que le message ne dit pas.**
///
/// Rôle du lecteur, favori, révisions d'édition, épinglage de sa décoration,
/// réglage de réciprocité des accusés, mode de lecture : autant de verdicts
/// lus à l'hôte, remis tels quels. La fabrique ne touche à aucun singleton :
/// elle se teste sans conversation montée.
struct MessageMenuFacts: Equatable {
    /// Le lecteur est ADMIN ou MODÉRATEUR : il édite et supprime ce qui n'est
    /// pas à lui.
    let canModerate: Bool
    let isStarred: Bool
    /// `!viewModel.editRevisions(for:).isEmpty` — jamais une constante.
    let hasEditRevisions: Bool
    /// Tri-état de `MessageStickerFavorite.state(for:)` : `nil` ⇒ pas un sticker.
    let stickerFavorite: Bool?
    let showReadReceipts: Bool
    /// Le menu s'ouvre depuis la Rivière (D5).
    let isRiver: Bool
}

/// **UNE fabrique de `MessageMenuContext` (D8, #5984).** Le menu compact
/// neuf, le menu complet du double tap et la feuille « Plus… » passent ici :
/// trois constructions à la main avaient déjà divergé (révisions en dur,
/// favori de sticker oublié).
enum MessageMenuContextFactory {
    static func make(message: Message, facts: MessageMenuFacts) -> MessageMenuContext {
        MessageMenuContext(
            isMine: message.isMe,
            canEdit: message.isMe || facts.canModerate,
            canDelete: message.isMe || facts.canModerate,
            hasText: !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            hasMedia: !message.attachments.isEmpty,
            hasTimebasedMedia: message.attachments.contains { AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack },
            isPinned: message.pinnedAt != nil,
            isStarred: facts.isStarred,
            isEdited: message.isEdited,
            hasEditRevisions: facts.hasEditRevisions,
            hasCallSummary: message.callSummary != nil,
            saveableAttachmentCount: message.attachments.filter { $0.type != .location }.count,
            canComposeMedia: ComposableAttachment.offers(message: message),
            stickerFavorite: facts.stickerFavorite,
            showReadReceipts: facts.showReadReceipts,
            isForwardable: message.isForwardable,
            isRiver: facts.isRiver
        )
    }
}
```

**3c — créer `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageMenuContext.swift` :**
```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Contexte de menu d'un message (D8, #5984)

extension ConversationView {

    /// **Le contexte de menu d'un message, avec les vraies valeurs de la
    /// conversation.** Lu par la feuille « Plus… », le menu compact de l'appui
    /// long remonté (`isRiver` selon le mode) et le menu complet du double tap.
    func menuContext(for message: Message, isRiver: Bool) -> MessageMenuContext {
        MessageMenuContextFactory.make(
            message: message,
            facts: MessageMenuFacts(
                canModerate: isCurrentUserAdminOrMod,
                isStarred: viewModel.isStarred(messageId: message.id),
                hasEditRevisions: !viewModel.editRevisions(for: message.id).isEmpty,
                stickerFavorite: MessageStickerFavorite.state(for: message.sticker),
                showReadReceipts: UserPreferencesManager.shared.privacy.showReadReceipts,
                isRiver: isRiver
            )
        )
    }
}
```

**3d — la feuille adopte la fabrique (`ConversationView.swift`).** Remplacer :
```swift
            .sheet(item: $overlayState.detailSheetMessage) { msg in
                let ctx = MessageMenuContext(
                    isMine: msg.isMe,
                    canEdit: msg.isMe || isCurrentUserAdminOrMod,
                    canDelete: msg.isMe || isCurrentUserAdminOrMod,
                    hasText: !msg.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                    hasMedia: !msg.attachments.isEmpty,
                    hasTimebasedMedia: msg.attachments.contains { AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack },
                    isPinned: msg.pinnedAt != nil,
                    isStarred: viewModel.isStarred(messageId: msg.id),
                    isEdited: msg.isEdited,
                    hasEditRevisions: !viewModel.editRevisions(for: msg.id).isEmpty,
                    // **La décoration du message, et son état d'épinglage**
                    // (2026-09-05). `nil` ⇒ ce n'est pas un sticker, et
                    // l'entrée n'existe pas — la loi 4 tenue par la RÈGLE, pas
                    // par un grisé.
                    stickerFavorite: MessageStickerFavorite.state(for: msg.sticker),
                    showReadReceipts: UserPreferencesManager.shared.privacy.showReadReceipts,
                    isForwardable: msg.isForwardable
                )
                MessageMoreSheet(
```
par :
```swift
            .sheet(item: $overlayState.detailSheetMessage) { msg in
                let ctx = menuContext(for: msg, isRiver: false)
                MessageMoreSheet(
```

**3e — relever la taille après :**
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift | tee /tmp/p2-t8-apres.txt && paste /tmp/p2-t8-avant.txt /tmp/p2-t8-apres.txt
```
Attendu : Δ = −18.

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande : celle de l'Étape 2, avec en plus :
```
  -only-testing:MeeshyTests/MessageMoreJumpsToViewsGuardTests \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/MessageStickerMenuEntryTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -only-testing:MeeshyTests/FileSizeBudgetGuardTests \
```
Attendu :
- les 9 témoins de `MessageMenuContextFactoryTests` passent ;
- les closures de la feuille (`onShowMore`, `onShowMessageInfo`, `onShowReadStatus`) ne bougent pas, et `MessageMoreJumpsToViewsGuardTests` reste vert ;
- `with 0 failures`.

pbxproj : après = avant + 6 (trois fichiers neufs).

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add apps/ios/Meeshy/Features/Main/Components/MessageMenuContextFactory.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageMenuContext.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/MeeshyTests/Unit/Components/MessageMenuContextFactoryTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -m "$(cat <<'EOF'
feat(ios): une seule fabrique construit le contexte de menu d'un message avec les vraies valeurs de la conversation (#5984)

- `MessageMenuFacts` porte ce que la conversation sait (modération,
  favori, révisions d'édition RÉELLES, favori de sticker, réciprocité des
  accusés, Rivière).
- `MessageMenuContextFactory.make(message:facts:)` lit le reste sur le
  message, y compris `hasCallSummary`, `saveableAttachmentCount` et
  `canComposeMedia` qu'il manquait à la feuille.
- `ConversationView.menuContext(for:isRiver:)` alimente la fabrique. La
  feuille « Plus… » l'adopte (sections inchangées) ; l'overlay historique
  garde le sien jusqu'à #5985 (D8).

Budget (D4) : ConversationView.swift Δ −18 (19 lignes de construction
remplacées par un appel). Cumul de la dette −18 ; `legacyLineCeiling`
remesuré en Tâche 24.

Refs #5984

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
)" && git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

---

### Tâche 9 : « Supprimer le média » choisi dans un menu ouvre « Plus… » directement sur sa confirmation

**Fichiers :**
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift:57-59` (déclarations statiques ajoutées sous `showDeleteMediaConfirm`), `:102-107` (`onAppear`)
- Test : `apps/ios/MeeshyTests/Unit/Views/MessageMoreSheetMediaConfirmationTests.swift` (créer)

**Interfaces :**
- Consomme : `MoreItem.allCases` (Tâche 7).
- Produit :
  ```swift
  // MessageMoreSheet
  static func presentsMediaConfirmation(initialItem: MoreItem?) -> Bool   // initialItem == .media
  static let mediaConfirmationDelay: TimeInterval                          // 0.45
  ```

Aujourd'hui, `initialItem` n'ouvre que les explorations, et la confirmation du média est un `@State` privé posé par le seul tap sur la pastille. Le menu complet (Tâche 11), aiguillé par le routeur (Tâche 10 : `MoreItem.media` → `.openMore(.media)`), doit pouvoir ouvrir la feuille directement sur cette confirmation. Aucune suppression directe n'est possible : la garde `test_media_requestsConfirmation_neverDeletesDirectly` lit toujours `showDeleteMediaConfirm = true` et la branche `.media` de `handleMoreItemTap`, que cette tâche ne touche pas.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/MessageMoreSheetMediaConfirmationTests.swift` :
```swift
import XCTest
@testable import Meeshy

/// **« Supprimer le média » choisi ailleurs que dans la feuille (#5984).**
///
/// Le menu complet du double tap Script montre « Média » dans « Faire ». Il ne
/// supprime jamais directement : il ferme le menu et ouvre « Plus… » sur la
/// confirmation (Enregistrer / Transférer / Supprimer). `initialItem` ne savait
/// ouvrir que les explorations ; la confirmation, `@State` privé, n'était posée
/// que par le tap sur la pastille.
@MainActor
final class MessageMoreSheetMediaConfirmationTests: XCTestCase {

    func test_presentsMediaConfirmation_media_isTrue() {
        XCTAssertTrue(MessageMoreSheet.presentsMediaConfirmation(initialItem: .media))
    }

    func test_presentsMediaConfirmation_withoutInitialItem_isFalse() {
        XCTAssertFalse(MessageMoreSheet.presentsMediaConfirmation(initialItem: nil))
    }

    /// Discrimination : aucune autre entrée, exploration ou action, n'ouvre la
    /// confirmation — « Supprimer » (le message) moins que toute autre.
    func test_presentsMediaConfirmation_everyOtherItem_isFalse() {
        for item in MoreItem.allCases where item != .media {
            XCTAssertFalse(MessageMoreSheet.presentsMediaConfirmation(initialItem: item), "\(item)")
        }
    }

    /// Garde de source : la feuille ne se monte pas en test. L'apparition
    /// consulte la règle, puis arme la confirmation après le délai nommé.
    func test_onAppear_armsTheConfirmation_whenTheRuleSaysSo() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/MessageMoreSheet.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        guard let open = source.range(of: ".onAppear {") else {
            return XCTFail("`.onAppear {` introuvable — la garde ne mesurerait rien")
        }
        var depth = 1
        var index = open.upperBound
        while index < source.endIndex, depth > 0 {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" { depth -= 1 }
            index = source.index(after: index)
        }
        let appearance = String(source[open.upperBound..<index])
        guard let rule = appearance.range(of: "Self.presentsMediaConfirmation(initialItem: initialItem)") else {
            return XCTFail("l'apparition doit consulter `presentsMediaConfirmation(initialItem:)`")
        }
        XCTAssertNotNil(
            appearance.range(of: "showDeleteMediaConfirm = true", range: rule.upperBound..<appearance.endIndex),
            "la confirmation doit être armée APRÈS la règle, dans l'apparition"
        )
        XCTAssertTrue(appearance.contains("Self.mediaConfirmationDelay"))
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageMoreSheetMediaConfirmationTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageMoreSheetMediaConfirmationTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation, `error: type 'MessageMoreSheet' has no member 'presentsMediaConfirmation'`.

- [ ] **Étape 3 : Implémentation minimale**

Dans `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift`, remplacer :
```swift
    @State private var showDeleteMediaConfirm = false

    private var theme: ThemeManager { ThemeManager.shared }
```
par :
```swift
    @State private var showDeleteMediaConfirm = false

    /// **« Supprimer le média » choisi AILLEURS ouvre la feuille sur sa
    /// confirmation** (menu complet du double tap Script, #5984). Jamais de
    /// suppression directe : c'est le même dialogue que le tap sur la pastille.
    static func presentsMediaConfirmation(initialItem: MoreItem?) -> Bool {
        initialItem == .media
    }

    /// Délai laissé à la montée de la feuille avant de poser la confirmation :
    /// un `confirmationDialog` demandé pendant qu'une présentation est en cours
    /// n'est pas présenté.
    static let mediaConfirmationDelay: TimeInterval = 0.45

    private var theme: ThemeManager { ThemeManager.shared }
```
Puis remplacer :
```swift
        .onAppear {
            if let initialItem, isExploration(initialItem) { selectedItem = initialItem }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7).delay(0.1)) {
```
par :
```swift
        .onAppear {
            if let initialItem, isExploration(initialItem) { selectedItem = initialItem }
            if Self.presentsMediaConfirmation(initialItem: initialItem) {
                DispatchQueue.main.asyncAfter(deadline: .now() + Self.mediaConfirmationDelay) {
                    showDeleteMediaConfirm = true
                }
            }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7).delay(0.1)) {
```

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande : celle de l'Étape 2, avec en plus :
```
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/MessageMoreSheetAccessibilityTests \
```
Attendu :
- les 4 témoins passent ;
- `test_media_requestsConfirmation_neverDeletesDirectly` et `test_media_confirmDialog_offersSaveForwardDelete_deleteIsLastAndOnlyDestructive` restent verts ;
- `with 0 failures`.

pbxproj : après = avant + 2.

La présence effective du dialogue se vérifie au simulateur en Tâche 23 : double tap en Script sur un message à média, puis « Média ». Attendu : la feuille monte, puis le dialogue Enregistrer / Transférer / Supprimer apparaît. Si le dialogue manque sur iOS 18, allonger `mediaConfirmationDelay` et reprendre la mesure. Aucun autre site n'est à retoucher.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift \
        apps/ios/MeeshyTests/Unit/Views/MessageMoreSheetMediaConfirmationTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -m "$(cat <<'EOF'
feat(ios): « Supprimer le média » choisi dans un menu ouvre « Plus… » directement sur sa confirmation (#5984)

- `MessageMoreSheet.presentsMediaConfirmation(initialItem:)` : vrai pour
  `.media` seulement.
- À l'apparition, la feuille arme `showDeleteMediaConfirm` après
  `mediaConfirmationDelay` (0,45 s) : un dialogue demandé pendant la montée
  de la feuille n'est pas présenté. C'est le même dialogue que le tap sur la
  pastille ; aucune suppression directe.

Refs #5984

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
)" && git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

---

### Tâche 10 : Les nouvelles portes aiguillent chaque option vers les mêmes méthodes que la feuille « Plus… »

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageActionRouter.swift`
- Test : `apps/ios/MeeshyTests/Unit/Components/MessageActionRoutingTests.swift` (créer) ; `apps/ios/MeeshyTests/Unit/Views/MessageActionRouterWiringGuardTests.swift` (créer)
- `ConversationView.swift` n'est PAS modifié (Δ 0). Toutes les méthodes appelées sont `internal` et déjà utilisées hors de ce fichier :
  - `beginEdit(_:)`, dans `+ComposerBanners.swift` ;
  - `beginSelectionMode(seedingWith:)`, dans `+Selection.swift` ;
  - `triggerReply(for:)` et `requestDeleteMessage(_:)`, dans `+MessageRow.swift` ;
  - `raiseComposerKeyboardIfMounted()`, dans `+LongPressMenu.swift` (Tâche 4) ;
  - `overlayState`, `composerState`, `scrollState`, `viewModel`, `readingModeController`, `mediaSaveCoordinator`, `conversation` et `accentColor`, déclarés sans `private`.

**Interfaces :**
- Consomme :
  - `raiseComposerKeyboardIfMounted()` (Tâche 4). C'est l'unique site de `composerState.focusTrigger = true`, que compte `ConversationLongPressMenuGuardTests.test_focusTrigger_isWokenFromASingleSite_inTheConversationUnit` : ce fichier n'écrit JAMAIS `focusTrigger`, pas même en commentaire.
  - `PrimaryAction.allCases`, `MoreItem.allCases` et `MessageActionResolver.overflowTwin(of:)` (Tâche 7).
  - `MessageMoreSheet.presentsMediaConfirmation(initialItem:)` (Tâche 9), rejointe par `.openMore(.media)`.
  - `ReadingModeController.select(_:)`, `.mode`.
- Produit :
  ```swift
  enum MessageActionRoute: Equatable {
      case beginEdit, beginSelection, openMore(MoreItem?), copyDisplayedText, saveMedia, compose,
           callDetail, openInThread, reply, togglePin, toggleStar, toggleStickerFavorite,
           share, openThread, delete
  }
  enum MessageActionRouting {
      static func route(_ action: PrimaryAction) -> MessageActionRoute
      static func route(_ item: MoreItem) -> MessageActionRoute
  }
  struct MessageActionRouter {
      let perform: (PrimaryAction) -> Void
      let performMore: (MoreItem) -> Void
      static func make(execute: @escaping (MessageActionRoute) -> Void) -> MessageActionRouter
  }
  extension ConversationView {
      func messageActionRouter(for message: Message) -> MessageActionRouter
      func performMessageRoute(_ route: MessageActionRoute, for message: Message)
  }
  ```

D9 : le routeur sert la liste compacte de l'appui long remonté (P3, Tâche 16) et le menu complet (P4, Tâche 22). La feuille « Plus… » garde ses closures (`MessageMoreJumpsToViewsGuardTests`). Le routeur ne ferme aucun menu : l'hôte ferme d'abord, puis appelle `perform`.

« Transférer » arme la sélection comme la feuille (#5989). « Copier » copie le texte affiché, comme l'overlay servi aujourd'hui.

- [ ] **Étape 1 : Écrire le test qui échoue**

**1a — créer `apps/ios/MeeshyTests/Unit/Components/MessageActionRoutingTests.swift` :**
```swift
import XCTest
@testable import Meeshy

/// **La loi d'aiguillage des options d'un message (D9, #5983, #5984).**
///
/// Cinq sites aiguillaient les options chacun à sa façon, avec deux
/// divergences (« Transférer », « Copier »). Les portes neuves passent par
/// UNE loi pure : chaque `PrimaryAction` et chaque `MoreItem` a UNE
/// destination, et deux jumeaux mènent au même endroit.
@MainActor
final class MessageActionRoutingTests: XCTestCase {

    func test_route_everyPrimaryAction_hasItsDestination() {
        let attendu: [PrimaryAction: MessageActionRoute] = [
            .edit: .beginEdit, .select: .beginSelection, .translate: .openMore(.language),
            .copy: .copyDisplayedText, .saveMedia: .saveMedia, .compose: .compose,
            .callDetail: .callDetail, .more: .openMore(nil), .openInThread: .openInThread,
            .reply: .reply, .pin: .togglePin, .unpin: .togglePin,
            .star: .toggleStar, .unstar: .toggleStar, .delete: .delete
        ]
        XCTAssertEqual(attendu.count, PrimaryAction.allCases.count, "une action neuve doit recevoir sa destination dans ce tableau")
        for action in PrimaryAction.allCases {
            XCTAssertEqual(MessageActionRouting.route(action), attendu[action], "\(action)")
        }
    }

    func test_route_everyMoreItem_hasItsDestination() {
        let attendu: [MoreItem: MessageActionRoute] = [
            .reply: .reply, .forward: .beginSelection, .thread: .openThread, .media: .openMore(.media),
            .pin: .togglePin, .unpin: .togglePin, .star: .toggleStar, .unstar: .toggleStar,
            .pinSticker: .toggleStickerFavorite, .unpinSticker: .toggleStickerFavorite,
            .edit: .beginEdit, .copy: .copyDisplayedText, .share: .share, .delete: .delete,
            .language: .openMore(.language), .views: .openMore(.views), .reactions: .openMore(.reactions),
            .transcription: .openMore(.transcription), .sentiment: .openMore(.sentiment),
            .history: .openMore(.history), .report: .openMore(.report)
        ]
        XCTAssertEqual(attendu.count, MoreItem.allCases.count, "une entrée neuve doit recevoir sa destination dans ce tableau")
        for item in MoreItem.allCases {
            XCTAssertEqual(MessageActionRouting.route(item), attendu[item], "\(item)")
        }
    }

    /// « Transférer » reprend l'effet de la feuille : armer la sélection
    /// (#4021), en attendant la décision #5989.
    func test_route_forward_armsTheSelection_likeTheMoreSheet() {
        XCTAssertEqual(MessageActionRouting.route(MoreItem.forward), .beginSelection)
    }

    /// « Média » ne supprime JAMAIS directement : il ouvre « Plus… » sur sa
    /// confirmation.
    func test_route_media_opensMoreOnItsConfirmation_neverDeletes() {
        XCTAssertEqual(MessageActionRouting.route(MoreItem.media), .openMore(.media))
        XCTAssertNotEqual(MessageActionRouting.route(MoreItem.media), .delete)
    }

    /// Le menu complet retire de « Faire » les jumeaux des actions rapides
    /// (`overflowTwin`) : ce retrait n'est juste que si les deux mènent au
    /// MÊME endroit.
    func test_route_quickActionAndItsOverflowTwin_leadToTheSameDestination() {
        for action in PrimaryAction.allCases {
            guard let jumeau = MessageActionResolver.overflowTwin(of: action) else { continue }
            XCTAssertEqual(MessageActionRouting.route(action), MessageActionRouting.route(jumeau), "\(action) ↔ \(jumeau)")
        }
    }

    func test_make_sendsEachGestureThroughTheLaw() {
        let journal = RouteJournal()
        let router = MessageActionRouter.make { journal.routes.append($0) }
        router.perform(.translate)
        router.perform(PrimaryAction.reply)
        router.performMore(.forward)
        router.performMore(.report)
        XCTAssertEqual(journal.routes, [.openMore(.language), .reply, .beginSelection, .openMore(.report)])
    }
}

private final class RouteJournal {
    var routes: [MessageActionRoute] = []
}
```

**1b — créer `apps/ios/MeeshyTests/Unit/Views/MessageActionRouterWiringGuardTests.swift` :**
```swift
import XCTest
@testable import Meeshy

/// **Le routeur appelle les MÊMES méthodes que la feuille « Plus… » (D9).**
///
/// Garde de source : `ConversationView` ne se monte pas en test. Chaque
/// branche de `performMessageRoute` est lue, puis comparée à la closure de la
/// feuille qui fait le même geste. Si l'une change de méthode sans l'autre,
/// ce témoin rougit : deux portes pour un même acte auraient divergé.
@MainActor
final class MessageActionRouterWiringGuardTests: XCTestCase {

    private func appSource(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func balancedBody(after marker: String, in source: String) -> String? {
        guard let open = source.range(of: marker) else { return nil }
        var depth = 1
        var index = open.upperBound
        while index < source.endIndex {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" {
                depth -= 1
                if depth == 0 { return String(source[open.upperBound..<index]) }
            }
            index = source.index(after: index)
        }
        return nil
    }

    private func routerFile() throws -> String {
        try appSource("Features/Main/Views/ConversationView+MessageActionRouter.swift")
    }

    private func routerBody() throws -> String {
        try XCTUnwrap(
            balancedBody(after: "func performMessageRoute(_ route: MessageActionRoute, for message: Message) {", in: try routerFile()),
            "`performMessageRoute(_:for:)` introuvable — la garde ne mesurerait rien"
        )
    }

    private func branch(_ name: String, in body: String) throws -> String {
        let start = try XCTUnwrap(body.range(of: "case .\(name)"), "branche `.\(name)` introuvable")
        let end = body.range(of: "case .", range: start.upperBound..<body.endIndex)?.lowerBound ?? body.endIndex
        return String(body[start.upperBound..<end])
    }

    func test_everyRoute_callsTheSameMethodAsTheMoreSheet() throws {
        let body = try routerBody()
        let view = try appSource("Features/Main/Views/ConversationView.swift")
        let sheet = try XCTUnwrap(balancedBody(after: ".sheet(item: $overlayState.detailSheetMessage) {", in: view))
        let parite: [(route: String, routeur: String, feuille: String)] = [
            ("beginEdit", "beginEdit(message)", "beginEdit(msg)"),
            ("beginSelection", "beginSelectionMode(seedingWith: message.id)", "beginSelectionMode(seedingWith: msg.id)"),
            ("copyDisplayedText",
             "UIPasteboard.general.string = viewModel.preferredTranslation(for: message.id)?.translatedContent ?? message.content",
             "UIPasteboard.general.string = viewModel.preferredTranslation(for: msg.id)?.translatedContent ?? msg.content"),
            ("saveMedia", "mediaSaveCoordinator.requestSave(MediaSaveRequest(", "mediaSaveCoordinator.requestSave(MediaSaveRequest("),
            ("reply", "triggerReply(for: message)", "triggerReply(for: msg)"),
            ("togglePin", "viewModel.togglePin(messageId: message.id)", "viewModel.togglePin(messageId: msg.id)"),
            ("toggleStar",
             "viewModel.toggleStar(messageId: message.id, conversationName: conversation?.name, conversationAccentColor: accentColor)",
             "viewModel.toggleStar(messageId: msg.id, conversationName: conversation?.name, conversationAccentColor: accentColor)"),
            ("toggleStickerFavorite", "MessageStickerFavorite.toggle(for: message.sticker)", "MessageStickerFavorite.toggle(for: msg.sticker)"),
            ("share", "overlayState.shareMessage = message", "overlayState.shareMessage = msg"),
            ("openThread", "overlayState.replyThreadParentId = message.id", "overlayState.replyThreadParentId = msg.id"),
            ("delete", "requestDeleteMessage(message.id)", "requestDeleteMessage(msg.id)")
        ]
        for cas in parite {
            XCTAssertTrue(try branch(cas.route, in: body).contains(cas.routeur), "`.\(cas.route)` doit appeler `\(cas.routeur)`")
            XCTAssertTrue(sheet.contains(cas.feuille), "la feuille n'appelle plus `\(cas.feuille)` : le routeur et elle ont divergé")
        }
    }

    /// D7 : Éditer et Répondre relèvent le clavier APRÈS leur action, par le
    /// site UNIQUE de la Tâche 4 — jamais en écrivant le réveil ici.
    func test_editAndReply_raiseTheKeyboardThroughTheSingleSite() throws {
        let body = try routerBody()
        let cas: [(route: String, action: String)] = [("beginEdit", "beginEdit(message)"), ("reply", "triggerReply(for: message)")]
        for (route, action) in cas {
            let branche = try branch(route, in: body)
            let geste = try XCTUnwrap(branche.range(of: action), "`.\(route)` doit appeler `\(action)`")
            XCTAssertNotNil(
                branche.range(of: "raiseComposerKeyboardIfMounted()", range: geste.upperBound..<branche.endIndex),
                "`.\(route)` doit relever le clavier après `\(action)`"
            )
        }
        XCTAssertFalse(try routerFile().contains("focusTrigger"), "le réveil du clavier a UN site : `raiseComposerKeyboardIfMounted()`")
    }

    /// Mêmes retours au Fil que les rappels de la Rivière
    /// (`onOpenInThread` / `onReply` dans `ConversationView`).
    func test_openInThreadAndReplyFromTheRiver_goBackToScriptAndLandOnTheMessage() throws {
        let body = try routerBody()
        let ouvrir = try branch("openInThread", in: body)
        XCTAssertTrue(ouvrir.contains("readingModeController.select(.script)"))
        XCTAssertTrue(ouvrir.contains("scrollState.scrollToMessageId = message.id"))
        XCTAssertTrue(ouvrir.contains("scrollState.scrollToMessageTrigger += 1"))

        let repondre = try branch("reply", in: body)
        XCTAssertTrue(repondre.contains("readingModeController.mode == .river"))
        XCTAssertTrue(repondre.contains("readingModeController.select(.script)"))
        XCTAssertTrue(repondre.contains("scrollState.scrollToMessageId = message.id"))
        XCTAssertTrue(repondre.contains("scrollState.scrollToMessageTrigger += 1"))
    }

    func test_openMoreComposeAndCallDetail_openTheirPresentations() throws {
        let body = try routerBody()
        let plus = try branch("openMore", in: body)
        XCTAssertTrue(plus.contains("overlayState.moreSheetInitialItem = item"))
        XCTAssertTrue(plus.contains("overlayState.detailSheetMessage = message"))
        XCTAssertTrue(try branch("compose", in: body).contains("composerState.composeMediaTarget = ComposableMessageTarget(message: message)"))
        XCTAssertTrue(try branch("callDetail", in: body).contains("overlayState.callDetailMessage = message"))
        XCTAssertTrue(try branch("copyDisplayedText", in: body).contains("HapticFeedback.success()"))
    }

    func test_router_isBuiltThroughTheLaw() throws {
        XCTAssertTrue(try routerFile().contains("MessageActionRouter.make { route in performMessageRoute(route, for: message) }"))
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageActionRoutingTests \
  -only-testing:MeeshyTests/MessageActionRouterWiringGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageActionRoutingTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation, avec :
- `error: cannot find type 'MessageActionRoute' in scope` ;
- `error: cannot find 'MessageActionRouting' in scope` ;
- `error: cannot find 'MessageActionRouter' in scope`.

- [ ] **Étape 3 : Implémentation minimale**

Créer `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageActionRouter.swift` :
```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Aiguillage des options d'un message (D9, #5983, #5984)

/// **Où mène une option.** Quinze destinations pour trente-six entrées :
/// `PrimaryAction` et `MoreItem` s'y rejoignent, si bien que deux jumeaux
/// (« Copier » rapide et « Copier » en pastille) ne peuvent pas diverger.
enum MessageActionRoute: Equatable {
    case beginEdit, beginSelection, openMore(MoreItem?), copyDisplayedText, saveMedia, compose,
         callDetail, openInThread, reply, togglePin, toggleStar, toggleStickerFavorite,
         share, openThread, delete
}

/// **La loi d'aiguillage** — pure et exhaustive (aucun `default`) : une option
/// neuve ne compile pas tant qu'elle n'a pas de destination.
enum MessageActionRouting {

    static func route(_ action: PrimaryAction) -> MessageActionRoute {
        switch action {
        case .edit: return .beginEdit
        case .select: return .beginSelection
        case .translate: return .openMore(.language)
        case .copy: return .copyDisplayedText
        case .saveMedia: return .saveMedia
        case .compose: return .compose
        case .callDetail: return .callDetail
        case .more: return .openMore(nil)
        case .openInThread: return .openInThread
        case .reply: return .reply
        case .pin, .unpin: return .togglePin
        case .star, .unstar: return .toggleStar
        case .delete: return .delete
        }
    }

    /// « Transférer » arme la sélection comme la feuille (#5989). « Média »
    /// rouvre « Plus… » sur sa confirmation, jamais une suppression. Les infos
    /// et la modération rouvrent « Plus… » sur leur panneau, qui garde ses
    /// contenus (langues, réactions, motifs).
    static func route(_ item: MoreItem) -> MessageActionRoute {
        switch item {
        case .reply: return .reply
        case .forward: return .beginSelection
        case .thread: return .openThread
        case .media: return .openMore(.media)
        case .pin, .unpin: return .togglePin
        case .star, .unstar: return .toggleStar
        case .pinSticker, .unpinSticker: return .toggleStickerFavorite
        case .edit: return .beginEdit
        case .copy: return .copyDisplayedText
        case .share: return .share
        case .delete: return .delete
        case .language, .views, .reactions, .transcription, .sentiment, .history, .report:
            return .openMore(item)
        }
    }
}

/// **Le routeur remis aux portes neuves** — la liste compacte de l'appui long
/// remonté et le menu complet du double tap. L'hôte ferme son menu, puis
/// appelle `perform` : le routeur ne ferme rien. L'overlay historique, la barre
/// rapide, les rappels de la liste et la feuille « Plus… » gardent leurs
/// closures jusqu'à #5985.
struct MessageActionRouter {
    let perform: (PrimaryAction) -> Void
    let performMore: (MoreItem) -> Void

    static func make(execute: @escaping (MessageActionRoute) -> Void) -> MessageActionRouter {
        MessageActionRouter(
            perform: { execute(MessageActionRouting.route($0)) },
            performMore: { execute(MessageActionRouting.route($0)) }
        )
    }
}

extension ConversationView {

    /// Le routeur d'un message. Chaque destination appelle la MÊME méthode que
    /// la feuille « Plus… » (`MessageActionRouterWiringGuardTests`).
    func messageActionRouter(for message: Message) -> MessageActionRouter {
        MessageActionRouter.make { route in performMessageRoute(route, for: message) }
    }

    /// Éditer et Répondre relèvent le clavier après leur action, par
    /// `raiseComposerKeyboardIfMounted()` (D7) — le seul réveil du composer de
    /// l'écran. Répondre depuis la Rivière rejoint d'abord le Script et atterrit
    /// sur le message, comme le rappel `onReply` de la Rivière.
    func performMessageRoute(_ route: MessageActionRoute, for message: Message) {
        switch route {
        case .beginEdit:
            beginEdit(message)
            raiseComposerKeyboardIfMounted()
        case .beginSelection:
            beginSelectionMode(seedingWith: message.id)
        case .openMore(let item):
            overlayState.moreSheetInitialItem = item
            overlayState.detailSheetMessage = message
        case .copyDisplayedText:
            UIPasteboard.general.string = viewModel.preferredTranslation(for: message.id)?.translatedContent ?? message.content
            HapticFeedback.success()
        case .saveMedia:
            guard let attachment = message.attachments.first(where: { $0.type != .location }) else { return }
            HapticFeedback.light()
            mediaSaveCoordinator.requestSave(MediaSaveRequest(
                kind: attachment.kind,
                remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
                suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                attachmentId: attachment.id.isEmpty ? nil : attachment.id
            ))
        case .compose:
            composerState.composeMediaTarget = ComposableMessageTarget(message: message)
        case .callDetail:
            overlayState.callDetailMessage = message
        case .openInThread:
            readingModeController.select(.script)
            scrollState.scrollToMessageId = message.id
            scrollState.scrollToMessageTrigger += 1
        case .reply:
            let depuisLaRiviere = readingModeController.mode == .river
            if depuisLaRiviere { readingModeController.select(.script) }
            triggerReply(for: message)
            raiseComposerKeyboardIfMounted()
            if depuisLaRiviere {
                scrollState.scrollToMessageId = message.id
                scrollState.scrollToMessageTrigger += 1
            }
        case .togglePin:
            Task { await viewModel.togglePin(messageId: message.id) }
            HapticFeedback.medium()
        case .toggleStar:
            _ = viewModel.toggleStar(messageId: message.id, conversationName: conversation?.name, conversationAccentColor: accentColor)
        case .toggleStickerFavorite:
            MessageStickerFavorite.toggle(for: message.sticker)
            HapticFeedback.light()
        case .share:
            overlayState.shareMessage = message
        case .openThread:
            overlayState.replyThreadParentId = message.id
            overlayState.showReplyThread = true
        case .delete:
            requestDeleteMessage(message.id)
        }
    }
}
```

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande : celle de l'Étape 2, avec en plus :
```
  -only-testing:MeeshyTests/ConversationLongPressMenuGuardTests \
  -only-testing:MeeshyTests/MessageMoreJumpsToViewsGuardTests \
```
Attendu :
- les 6 témoins de `MessageActionRoutingTests` et les 5 de `MessageActionRouterWiringGuardTests` passent ;
- `test_focusTrigger_isWokenFromASingleSite_inTheConversationUnit` reste vert : une seule écriture du réveil dans l'unité `ConversationView`, ce fichier compris ;
- `with 0 failures`.

pbxproj : après = avant + 6 (trois fichiers neufs).

Contrôle budget : `git diff --stat HEAD -- apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` ne rend rien (Δ 0).

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageActionRouter.swift \
        apps/ios/MeeshyTests/Unit/Components/MessageActionRoutingTests.swift \
        apps/ios/MeeshyTests/Unit/Views/MessageActionRouterWiringGuardTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -m "$(cat <<'EOF'
feat(ios): les nouvelles portes aiguillent chaque option vers les mêmes méthodes que la feuille « Plus… » (#5983, #5984)

- `MessageActionRouting` : loi pure et exhaustive, une destination par
  `PrimaryAction` et par `MoreItem` ; les jumeaux de `overflowTwin` mènent
  au même endroit (témoin croisé).
- « Transférer » arme la sélection (#5989) ; « Média » rouvre « Plus… » sur
  sa confirmation ; les infos et la modération sur leur panneau.
- `MessageActionRouter.make(execute:)` et
  `ConversationView.messageActionRouter(for:)` : chaque branche de
  `performMessageRoute` appelle la méthode de la closure correspondante de
  la feuille. Une garde de source compare les deux sites.
- Éditer et Répondre relèvent le clavier par
  `raiseComposerKeyboardIfMounted()`, seul réveil du composer (Tâche 4) ;
  Répondre et Ouvrir dans le fil depuis la Rivière rejoignent le Script et
  atterrissent sur le message.

Budget (D4) : ConversationView.swift non modifié (Δ 0).

Refs #5983
Refs #5984

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
)" && git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

---

### Tâche 11 : Toutes les options d'un message tiennent dans un menu Liquid Glass en sections, borné et accessible

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Components/MessageOptionsGlassMenu.swift`
- Test : `apps/ios/MeeshyTests/Unit/Components/MessageOptionsGlassMenuTests.swift` (créer)

**Interfaces :**
- Consomme :
  - `OptionSection`, `OptionSection.isEmpty`, `MessageActionResolver.nonEmptySections(_:)` et `MessageOptionLabels` (Tâche 7) ;
  - `View.adaptiveGlass(in:tint:interactive:)` (`MeeshyUI/Compatibility/AdaptiveGlass.swift`) ;
  - `MenuRowHighlightButtonStyle` (`Views/ConversationContextMenuView.swift:382`, interne) ;
  - `MeeshyFont.relative(_:weight:design:)`, `MeeshyColors.error`, `HapticFeedback.light()`.
- Produit :
  ```swift
  struct MessageOptionsGlassMenu: View {
      let sections: [OptionSection]
      let accentHex: String
      let maxHeight: CGFloat
      let onPrimary: (PrimaryAction) -> Void
      let onMore: (MoreItem) -> Void
      enum Row: Hashable { case primary(PrimaryAction), more(MoreItem); var isDestructive: Bool; var label: String; var symbol: String }
      static let menuWidth: CGFloat = 280
      static let rowHeight: CGFloat = 44
      static let headerHeight: CGFloat = 28
      static let sectionGap: CGFloat = 8
      static let verticalPadding: CGFloat = 6
      static func rows(of section: OptionSection) -> [Row]
      static func headerTitle(of section: OptionSection) -> String?
      static func estimatedHeight(sections: [OptionSection]) -> CGFloat
      static func minimumHeight() -> CGFloat                                  // trois lignes
      static func servedHeight(sections: [OptionSection], maxHeight: CGFloat) -> CGFloat
  }
  ```

Le consommateur est P4 (Tâche 22) : `MessageOptionsGlassMenu(sections: MessageActionResolver.allOptionSections(ctx), accentHex:, maxHeight:, onPrimary: router.perform, onMore: router.performMore)`, dans `LiftedMessageOverlay` en présentation `.scriptDoubleTap`.

Rendu retenu :
- **Dimensions et verre** :
  - largeur 280 pt ;
  - `adaptiveGlass` (verre iOS 26, matière avant) ;
  - aucune teinte ni ombre manuelle, comme `MessageActionsMenu`.
- **Défilement** :
  - hauteur servie = contenu, bornée par `maxHeight`, jamais sous trois lignes (spec §6, règle 6) ;
  - au-delà, le menu défile, et sans débordement le défilement est coupé (`.scrollDisabled`, iOS 16).
- **Lignes** :
  - « Supprimer » est en `MeeshyColors.error`, précédé d'un séparateur ;
  - rapides sans titre, puis « Actions », « Infos & Prisme », « Modération » (clés existantes, aucune clé neuve).
- **Accessibilité** :
  - chaque ligne est un bouton étiqueté ;
  - chaque titre porte `.isHeader` ;
  - le conteneur est `.contain`.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Components/MessageOptionsGlassMenuTests.swift` :
```swift
import XCTest
import UIKit
@testable import Meeshy

/// **Le menu complet du double tap Script (D6, #5984).**
///
/// Ce qui se teste : quelles lignes une section sert, laquelle est rouge,
/// quelle section a un titre, et la hauteur que la géométrie de l'overlay lit
/// avant de poser le menu — la somme des lignes, titres, séparateurs et
/// marges, bornée par l'espace disponible sans descendre sous trois lignes.
/// Le design système et l'accessibilité se lisent sur la source : aucune
/// inspection de vue SwiftUI n'existe dans ce dépôt.
@MainActor
final class MessageOptionsGlassMenuTests: XCTestCase {

    private func scaled(_ value: CGFloat) -> CGFloat {
        UIFontMetrics.default.scaledValue(for: value)
    }

    private func longMenu() -> [OptionSection] {
        [
            .quick([.edit, .select, .translate, .copy]),
            .actions([.reply, .forward, .thread, .share, .pin, .star, .delete]),
            .info([.reactions, .views, .sentiment]),
            .moderation([.report])
        ]
    }

    // MARK: - Lignes, couleur, titres

    func test_rows_quickServesPrimaryActions_andOtherSectionsServeMoreItems() {
        XCTAssertEqual(MessageOptionsGlassMenu.rows(of: .quick([.edit, .select])), [.primary(.edit), .primary(.select)])
        XCTAssertEqual(MessageOptionsGlassMenu.rows(of: .info([.reactions])), [.more(.reactions)])
        XCTAssertEqual(MessageOptionsGlassMenu.rows(of: .moderation([.report])), [.more(.report)])
    }

    func test_onlyDelete_isDestructive() {
        XCTAssertTrue(MessageOptionsGlassMenu.Row.more(.delete).isDestructive)
        XCTAssertTrue(MessageOptionsGlassMenu.Row.primary(.delete).isDestructive)
        XCTAssertFalse(MessageOptionsGlassMenu.Row.more(.media).isDestructive, "« Média » ouvre sa confirmation : il n'est pas rouge")
        XCTAssertFalse(MessageOptionsGlassMenu.Row.more(.report).isDestructive)
    }

    func test_headerTitle_quickHasNone_otherSectionsCarryTheSheetTitles() {
        XCTAssertNil(MessageOptionsGlassMenu.headerTitle(of: .quick([.select])))
        XCTAssertEqual(MessageOptionsGlassMenu.headerTitle(of: .actions([.reply])), MessageOptionLabels.actionsSectionTitle)
        XCTAssertEqual(MessageOptionsGlassMenu.headerTitle(of: .info([.views])), MessageOptionLabels.infoSectionTitle)
        XCTAssertEqual(MessageOptionsGlassMenu.headerTitle(of: .moderation([.report])), MessageOptionLabels.moderationSectionTitle)
    }

    // MARK: - Hauteur

    func test_estimatedHeight_sumsRowsHeadersGapsAndPadding() {
        let sections: [OptionSection] = [.quick([.edit, .select, .copy]), .actions([.reply, .delete]), .moderation([.report])]
        XCTAssertEqual(
            MessageOptionsGlassMenu.estimatedHeight(sections: sections),
            6 * scaled(44) + 2 * scaled(28) + 2 * 8 + 2 * 6,
            accuracy: 0.001,
            "six lignes, deux titres (la section rapide n'en a pas), deux séparateurs, deux marges"
        )
    }

    func test_estimatedHeight_ignoresEmptySections() {
        XCTAssertEqual(
            MessageOptionsGlassMenu.estimatedHeight(sections: [.quick([.select]), .info([])]),
            MessageOptionsGlassMenu.estimatedHeight(sections: [.quick([.select])]),
            accuracy: 0.001
        )
    }

    func test_minimumHeight_isThreeRowsAndTheirPadding() {
        XCTAssertEqual(MessageOptionsGlassMenu.minimumHeight(), 3 * scaled(44) + 2 * 6, accuracy: 0.001)
    }

    func test_servedHeight_fitsItsContent_whenThereIsRoom() {
        let sections: [OptionSection] = [.quick([.select, .copy])]
        XCTAssertEqual(
            MessageOptionsGlassMenu.servedHeight(sections: sections, maxHeight: 1_000),
            MessageOptionsGlassMenu.estimatedHeight(sections: sections),
            accuracy: 0.001
        )
    }

    func test_servedHeight_isBoundedByMaxHeight_soTheMenuScrolls() {
        let plafond = MessageOptionsGlassMenu.minimumHeight() + 40
        XCTAssertGreaterThan(MessageOptionsGlassMenu.estimatedHeight(sections: longMenu()), plafond)
        XCTAssertEqual(MessageOptionsGlassMenu.servedHeight(sections: longMenu(), maxHeight: plafond), plafond, accuracy: 0.001)
    }

    func test_servedHeight_neverDropsBelowThreeRows() {
        XCTAssertEqual(
            MessageOptionsGlassMenu.servedHeight(sections: longMenu(), maxHeight: 40),
            MessageOptionsGlassMenu.minimumHeight(),
            accuracy: 0.001
        )
    }

    // MARK: - Design système et accessibilité (garde de source)

    private func menuSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/MessageOptionsGlassMenu.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_menu_rendersTheSystemDesign_likeTheCompactMenu() throws {
        let source = try menuSource()
        XCTAssertTrue(source.contains(".adaptiveGlass(in: RoundedRectangle"), "verre iOS 26, matière avant")
        XCTAssertTrue(source.contains("MenuRowHighlightButtonStyle()"), "surlignage de la ligne pressée (parité UIMenu)")
        XCTAssertFalse(source.contains(".buttonStyle(.plain)"))
        XCTAssertTrue(source.contains("@ScaledMetric(relativeTo: .body) private var rowMinHeight"), "Dynamic Type")
        XCTAssertTrue(source.contains("MeeshyColors.error"), "« Supprimer » en rouge sémantique")
        XCTAssertTrue(source.contains("MessageOptionLabels.label("))
        XCTAssertTrue(source.contains("MessageOptionLabels.symbol("))
    }

    func test_menu_exposesRowsAsLabelledButtons_andSectionTitlesAsHeaders() throws {
        let source = try menuSource()
        XCTAssertTrue(source.contains(".accessibilityAddTraits(.isHeader)"))
        XCTAssertTrue(source.contains(".accessibilityLabel(row.label)"))
        XCTAssertTrue(source.contains(".accessibilityAddTraits(.isButton)"))
        XCTAssertTrue(source.contains(".accessibilityElement(children: .contain)"))
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageOptionsGlassMenuTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageOptionsGlassMenuTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation, `error: cannot find 'MessageOptionsGlassMenu' in scope`.

- [ ] **Étape 3 : Implémentation minimale**

Créer `apps/ios/Meeshy/Features/Main/Components/MessageOptionsGlassMenu.swift` :
```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Toutes les options d'un message, en sections, sur une surface Liquid
/// Glass** — le menu que le double tap ouvre en Script, juste sous la rangée
/// (D6, spec §5.2 et §7.2, #5984).
///
/// Même design système que la liste compacte (`MessageActionsMenu`) :
/// `adaptiveGlass`, surlignage de ligne pressée, métriques Dynamic Type,
/// « Supprimer » en rouge sémantique. Il ajoute les titres de section et une
/// hauteur BORNÉE : l'espace sous la rangée, jamais moins de trois lignes, et
/// le défilement au-delà. La hauteur est une loi statique, lue par la
/// géométrie de l'overlay avant la pose.
struct MessageOptionsGlassMenu: View {
    let sections: [OptionSection]
    let accentHex: String
    let maxHeight: CGFloat
    let onPrimary: (PrimaryAction) -> Void
    let onMore: (MoreItem) -> Void

    @ScaledMetric(relativeTo: .body) private var rowMinHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .body) private var headerMinHeight: CGFloat = 28
    @ScaledMetric(relativeTo: .body) private var iconColumnWidth: CGFloat = 24

    private var accent: Color { Color(hex: accentHex) }

    /// Une ligne : une action rapide, ou une entrée de « Plus… ».
    enum Row: Hashable {
        case primary(PrimaryAction)
        case more(MoreItem)

        var isDestructive: Bool { self == .primary(.delete) || self == .more(.delete) }

        var label: String {
            switch self {
            case .primary(let action): return MessageOptionLabels.label(action)
            case .more(let item): return MessageOptionLabels.label(item)
            }
        }

        var symbol: String {
            switch self {
            case .primary(let action): return MessageOptionLabels.symbol(action)
            case .more(let item): return MessageOptionLabels.symbol(item)
            }
        }
    }

    // MARK: - Cotes et lois

    static let menuWidth: CGFloat = 280
    static let rowHeight: CGFloat = 44
    static let headerHeight: CGFloat = 28
    static let sectionGap: CGFloat = 8
    static let verticalPadding: CGFloat = 6

    static func rows(of section: OptionSection) -> [Row] {
        switch section {
        case .quick(let actions): return actions.map { .primary($0) }
        case .actions(let items), .info(let items), .moderation(let items): return items.map { .more($0) }
        }
    }

    /// Les rapides n'ont pas de titre : ils continuent la liste de l'appui long.
    static func headerTitle(of section: OptionSection) -> String? {
        switch section {
        case .quick: return nil
        case .actions: return MessageOptionLabels.actionsSectionTitle
        case .info: return MessageOptionLabels.infoSectionTitle
        case .moderation: return MessageOptionLabels.moderationSectionTitle
        }
    }

    /// Hauteur du contenu entier : lignes et titres mis à l'échelle Dynamic
    /// Type (même facteur que les `@ScaledMetric` du rendu), séparateurs entre
    /// sections, marges verticales. Les sections vides ne comptent pas.
    static func estimatedHeight(sections: [OptionSection]) -> CGFloat {
        let served = MessageActionResolver.nonEmptySections(sections)
        let scaledRow = UIFontMetrics.default.scaledValue(for: rowHeight)
        let scaledHeader = UIFontMetrics.default.scaledValue(for: headerHeight)
        let rowCount = served.reduce(0) { $0 + Self.rows(of: $1).count }
        let headerCount = served.filter { Self.headerTitle(of: $0) != nil }.count
        let gapCount = max(0, served.count - 1)
        return CGFloat(rowCount) * scaledRow
            + CGFloat(headerCount) * scaledHeader
            + CGFloat(gapCount) * sectionGap
            + 2 * verticalPadding
    }

    /// Trois lignes : en deçà, la géométrie déplace le bloc plutôt que
    /// d'écraser le menu (spec §6, règle 6).
    static func minimumHeight() -> CGFloat {
        3 * UIFontMetrics.default.scaledValue(for: rowHeight) + 2 * verticalPadding
    }

    /// Hauteur posée : le contenu, bornée par `maxHeight`, jamais sous trois
    /// lignes. Au-delà, le menu défile.
    static func servedHeight(sections: [OptionSection], maxHeight: CGFloat) -> CGFloat {
        min(estimatedHeight(sections: sections), max(maxHeight, minimumHeight()))
    }

    // MARK: - Rendu

    var body: some View {
        let served = MessageActionResolver.nonEmptySections(sections)
        let estimated = Self.estimatedHeight(sections: served)
        let height = Self.servedHeight(sections: served, maxHeight: maxHeight)
        return ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(served.enumerated()), id: \.offset) { index, section in
                    if index > 0 {
                        Divider()
                            .overlay(accent.opacity(0.12))
                            .padding(.vertical, Self.sectionGap / 2)
                    }
                    sectionView(section)
                }
            }
            .padding(.vertical, Self.verticalPadding)
        }
        .scrollDisabled(estimated <= height)
        .frame(width: Self.menuWidth, height: height)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func sectionView(_ section: OptionSection) -> some View {
        if let title = Self.headerTitle(of: section) {
            Text(title)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: headerMinHeight, alignment: .bottomLeading)
                .accessibilityAddTraits(.isHeader)
        }
        ForEach(Self.rows(of: section), id: \.self) { row in
            if row.isDestructive {
                Divider().overlay(accent.opacity(0.12))
            }
            rowView(row)
        }
    }

    private func rowView(_ row: Row) -> some View {
        let tint = row.isDestructive ? MeeshyColors.error : accent
        return Button {
            HapticFeedback.light()
            switch row {
            case .primary(let action): onPrimary(action)
            case .more(let item): onMore(item)
            }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: row.symbol)
                    .font(MeeshyFont.relative(17, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: iconColumnWidth)
                Text(row.label)
                    .font(MeeshyFont.relative(16))
                Spacer(minLength: 0)
            }
            .foregroundStyle(tint)
            .padding(.horizontal, 16)
            .frame(minHeight: rowMinHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuRowHighlightButtonStyle())
        .accessibilityLabel(row.label)
        .accessibilityAddTraits(.isButton)
    }
}
```

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande : celle de l'Étape 2, avec en plus :
```
  -only-testing:MeeshyTests/FixedFontSizeGuardTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -only-testing:MeeshyTests/FileSizeBudgetGuardTests \
```
Attendu :
- les 11 témoins passent ;
- aucune taille figée ni clé neuve ;
- `with 0 failures`.

pbxproj : après = avant + 4 (deux fichiers neufs).

Contrôle final de la partie, après cette tâche :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git log --oneline -7 && \
git diff --stat HEAD~6 -- apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift apps/ios/Meeshy/Features/Main/Focal/Row/FocalRow.swift
```
Attendu :
- sept commits P2 (Tâches 5 à 11) ;
- sur les six commits applicatifs : `ConversationView.swift` −37 lignes nettes (−19, −18), `MessageOverlayMenu.swift` −57 ;
- `MessageListViewController.swift` et `FocalRow.swift` absents du diff.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git add apps/ios/Meeshy/Features/Main/Components/MessageOptionsGlassMenu.swift \
        apps/ios/MeeshyTests/Unit/Components/MessageOptionsGlassMenuTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -m "$(cat <<'EOF'
feat(ios): toutes les options d'un message tiennent dans un menu Liquid Glass en sections, borné et accessible (#5984)

- `MessageOptionsGlassMenu` (280 pt), pour le double tap en Script.
- Design système de la liste compacte : `adaptiveGlass` (verre iOS 26,
  matière avant), `MenuRowHighlightButtonStyle`, `@ScaledMetric`.
- Rapides sans titre, puis « Actions », « Infos & Prisme », « Modération »
  (titres de `MessageOptionLabels`, aucune clé neuve). « Supprimer » en
  `MeeshyColors.error`, après un séparateur.
- `estimatedHeight`, `minimumHeight` (trois lignes) et `servedHeight` :
  contenu borné par `maxHeight`, jamais sous trois lignes, défilement
  au-delà (coupé quand tout tient).
- VoiceOver : lignes étiquetées `.isButton`, titres `.isHeader`, conteneur
  `.contain`.

Refs #5984

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
)" && git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

---

## Points de vigilance de la partie P2

- **Collision de relocalisation.** La Tâche 6 prend `HeaderSearchGlyph` (fin de `ConversationView.swift`) et `EmojiUsageTracker` (fin de `MessageOverlayMenu.swift`). Une autre partie qui aurait choisi l'un de ces blocs pour compenser doit en prendre un autre. Si la compensation est lue en cumul depuis la base, P2 ne consomme pas la réserve de la Tâche 1.
- **Chemin de `fullyLocalizedScreens`.** `MessageActionsMenu.swift` y reste épinglé sans clé après la Tâche 7, ce que la règle accepte. Si la Tâche 24 élague la liste, garder `MessageOptionLabels.swift`.
- **Rouges hérités.** Les suites globales (`FileSizeBudgetGuardTests`, `LocalizationConsistencyTests`, `FixedFontSizeGuardTests`) peuvent porter des rouges venus de `dev`. Comparer à `origin/dev` avant de conclure à une régression du lot.
- **Délai de confirmation du média (Tâche 9).** À mesurer au simulateur sur iOS 26 et iOS 18 (Tâche 23).

---

## Partie P3 — La rangée remontée et l'overlay (#5981, #5982)

Tâches 12 à 17 du plan « L'appui long montre le message tel qu'on le lit ». Contrat : `docs/superpowers/plans/2026-09-10-appui-long-rendu-du-mode-contrat.md`. Spec : `docs/superpowers/specs/2026-09-10-appui-long-rendu-du-mode-design.md` (D1, D4, §4, §5, §6, §8, §9).

Toutes les commandes partent du worktree `/Users/smpceo/Documents/v2_meeshy-longpress`. Le répertoire courant du shell retombe entre deux appels : chaque commande commence donc par `cd`.

> ⚠️ Écart au contrat
>
> 1. **Tâche 12 — nom de la fonction pure.** C'est `MessageEffects.playbackPlan(reduceMotion:suppressAppearance:)`, une extension app posée dans `MessageEffectModifiers.swift`.
>    - Elle retire les drapeaux d'apparition AVANT la règle du SDK.
>    - Raison : `MessageEffectPlan` n'a pas d'initialiseur public qui permettrait de vider son champ `appearance` après coup.
> 2. **Tâche 14 — `makeRowContent` rend une VALEUR, pas une vue.**
>    - Signature : `func makeRowContent(localId: String, forLiftedCopy: Bool) -> MessageRowContent?`.
>    - Le type rendu, déclaré dans `MessageListViewController+LiftedRow.swift` :
>      ```swift
>      struct MessageRowContent {
>          let message: Message
>          let row: AnyView
>          let nativePreview: () -> AnyView
>          let isGroupHead: Bool
>          let onLongPress: () -> Void
>      }
>      ```
>    - Raison : en plus de la rangée, la cellule a besoin de trois choses.
>      - L'aperçu du menu natif, qui n'est pas la rangée : rangée plate, ou bulle `standalone`.
>      - La tête de groupe. Elle alimente `cell.tag`, que la méthode n'a pas le droit d'écrire.
>      - Le gestionnaire d'appui long, qu'elle partage avec `focalActions.onMore`.
>    - `row` porte `if let focalRow { focalRow.equatable() } else { messageBubble }`. L'ancre de la Tâche 22 reste donc dans le corps de `makeRowContent`, avec `focalRow` et `forLiftedCopy` en portée (écart 6 de P4).
> 3. **Tâche 14 — les cinq `environmentObject` passent du `BubbleSwipeContainer` à la rangée.**
>    - Le conteneur ne lit aucun objet d'environnement : l'effet est identique.
>    - La copie remontée, qui n'a pas de conteneur, en a besoin.
> 4. **Tâche 14 — deux changements de portée dans le contrôleur.**
>    - `resolveLocalId(_:)` perd son `private`.
>    - `cellFrameInWindow(messageId:)` déménage tel quel dans `MessageListViewController+LiftedRow.swift` (30 lignes, relocalisation pure).
>    - C'est la compensation D4 de l'extraction, qui ajoute 26 lignes. L'extension a de toute façon besoin des deux.
>    - Aucune garde ne lit ces textes (preuve `git grep` à l'Étape 3 de la Tâche 14).
> 5. **Tâche 14 — `ConversationViewReadingModeSourceGuardTests` est re-pointée.**
>    - Ses deux littéraux portent l'indentation de la fermeture de cellule (12 espaces) ; dans la méthode, le code est indenté à 8.
>    - L'assertion ne change pas, seule l'indentation suit.
> 6. **Tâche 15 — deux fonctions pures ajoutées à `LiftedOverlayLayout`** (§6.7 iPad, testées) :
>    - `rowFrameInHost(_:hostFrameInWindow:)` ;
>    - `safeAreaInHost(windowSafeAreaTop:windowSafeAreaBottom:windowHeight:hostFrameInWindow:)`.
>
>    La règle 5 est précisée. Elle s'applique quand la rangée, alignée sous la barre au plus haut, ne laisse pas au menu sa hauteur minimale :
>    ```
>    topLimit + stripAbove + rowHeight + menuGap + min(minimumMenuHeight, menuHeight) > bottomLimit
>    ```
>    Le cas « la rangée seule dépasse » en fait partie.
> 7. **Tâche 16 — `continueLongPressPresentation` est complétée, pas réécrite** (contraintes P1).
>    - `overlayState.showOverlayMenu = true` y reste.
>    - Le recentrage garde le texte `cellFrame: cellFrame` : le paramètre est ré-lié au cadre de la rangée quand elle existe.
>    - Le jeton de P1 (`overlayMessage?.id == message.id`, menu pas encore ouvert) est re-vérifié au terme du recentrage.
>    - Ajouts :
>      - la loi pure testée `LiftedOverlayPresentation.row(flagEnabled:link:messageId:mode:)` ;
>      - `ConversationView.liftedRowToPresent(for:)`.
> 8. **Tâche 16 — le drapeau ne descend dans aucun fichier de liste** (garde `BetaFeaturesReadingModesIntegrationTests`).
>    - Il est lu par `liftedRowToPresent(for:)`, dans `ConversationView+LiftedOverlay.swift`.
>    - La liste enregistre son fournisseur sans condition. Drapeau éteint, ce fournisseur n'est jamais interrogé.
> 9. **Tâche 16 — le menu glass n'est pas mesuré.**
>    - Sa hauteur rendue dépend du `maxHeight` que lui donne la géométrie. La mesurer ferait une boucle : mesure → géométrie → `maxHeight` → mesure.
>    - La géométrie prend donc `MessageOptionsGlassMenu.estimatedHeight(sections:)`.
>    - La barre et le menu compact, dont la taille ne dépend pas de la géométrie, sont mesurés par `PreferenceKey`.
> 10. **Tâche 16 — une seule liste d'emojis rapides.**
>     - La liste devient `EmojiUsageTracker.overlayQuickDefaults`, dans `EmojiUsageTracker.swift` (relocalisé par la Tâche 6).
>     - `MessageOverlayMenu.defaultEmojis` la lit : Δ −5 sur ce fichier.
> 11. **Tâche 16 — haptiques.** `LiftedMessageOverlay` reprend celles de l'overlay actuel, et n'en ajoute aucune :
>     - apparition : moyenne ;
>     - fermeture : légère ;
>     - armement du glissé : moyenne.
> 12. **Pbxproj.** Comme l'a relevé P2, un fichier Swift neuf ajoute DEUX lignes `.swift in Sources`. Le delta attendu est donc +2 × nombre de fichiers neufs.

**Budget D4 de cette partie, par commit** (chaque Δ est prouvé par `wc -l` dans le message de commit) :

| Tâche | `MessageListViewController.swift` | `ConversationView.swift` | `MessageOverlayMenu.swift` |
|---|---|---|---|
| 12, 13, 15 | — | — | — |
| 14 | +26 (extraction) −30 (`cellFrameInWindow`) = **−4** | +1 (lien) −6 (`ConversationHeaderState`) = **−5** | — |
| 16 | — | +1 (`overlayMenuContent`) −6 (`PreviewMedia`) = **−5** | −5 (liste d'emojis) = **−5** |

`legacyLineCeiling` n'est pas abaissé ici : il est remesuré en Tâche 24, comme dans P1 et P2.

**Commande de test ciblé** : c'est celle du contrat. Chaque étape la redonne en entier, `<Classe>` rempli. Plusieurs classes se passent par plusieurs `-only-testing:`.

---

### Tâche 12 : La copie d'un message à effet ne rejoue pas son apparition

**Fichiers :**
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageEffectModifiers.swift:601` (bloc neuf avant `// MARK: - Orchestration`) et `:619-625` (`MessageEffectsModifier`)
- Test : `apps/ios/MeeshyTests/Unit/Views/MessageEffectsAppearanceSuppressionTests.swift` (créer)

**Interfaces :**
- Consomme : `MessageEffects.playbackPlan(reduceMotion:) -> MessageEffectPlan`, `MessageEffectFlags.appearanceMask` (SDK, existants).
- Produit :
  ```swift
  extension EnvironmentValues { var suppressesAppearanceEffects: Bool { get set } }   // défaut false
  extension MessageEffects { func playbackPlan(reduceMotion: Bool, suppressAppearance: Bool) -> MessageEffectPlan }
  ```

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/MessageEffectsAppearanceSuppressionTests.swift` :

```swift
import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// #5981 — la copie de la rangée que l'appui long remonte est une SECONDE
/// instance du message. `MessageEffectsModifier` n'ayant aucune mémoire de
/// lecture, elle rejouerait confettis, explosion et secousse. La valeur
/// d'environnement coupe l'apparition et garde les effets persistants.
@MainActor
final class MessageEffectsAppearanceSuppressionTests: XCTestCase {

    private func effects(_ flags: MessageEffectFlags) -> MessageEffects {
        MessageEffects(flags: flags, glowIntensity: 0.7)
    }

    func test_playbackPlan_suppressAppearance_emptiesAppearanceAndKeepsPersistent() {
        let plan = effects([.confetti, .shake, .glow, .sparkle])
            .playbackPlan(reduceMotion: false, suppressAppearance: true)

        XCTAssertTrue(plan.appearance.isEmpty, "la copie ne rejoue ni confettis ni secousse")
        XCTAssertEqual(plan.persistent, [.glow, .sparkle], "halo et scintillement font partie du format du message")
        XCTAssertTrue(plan.animatesPersistent)
    }

    func test_playbackPlan_noSuppression_matchesTheSDKPlan() {
        let source = effects([.confetti, .shake, .glow, .sparkle])

        XCTAssertEqual(
            source.playbackPlan(reduceMotion: false, suppressAppearance: false),
            source.playbackPlan(reduceMotion: false),
            "hors copie, la cellule garde exactement la règle du SDK"
        )
    }

    func test_playbackPlan_suppressUnderReduceMotion_keepsOnlyTheFixedPersistentEffects() {
        let plan = effects([.fireworks, .glow, .pulse, .rainbow])
            .playbackPlan(reduceMotion: true, suppressAppearance: true)

        XCTAssertTrue(plan.appearance.isEmpty)
        XCTAssertEqual(plan.persistent, [.glow, .rainbow], "Réduire les animations reste décidé par la règle du SDK")
        XCTAssertFalse(plan.animatesPersistent)
    }

    func test_playbackPlan_suppressOnAppearanceOnlyMessage_isEmpty() {
        XCTAssertTrue(
            effects([.explode, .waoo]).playbackPlan(reduceMotion: false, suppressAppearance: true).isEmpty,
            "un message sans effet persistant ne paie aucun modificateur dans la copie"
        )
    }

    func test_suppressesAppearanceEffects_defaultValue_isFalse() {
        XCTAssertFalse(EnvironmentValues().suppressesAppearanceEffects)
    }

    func test_suppressesAppearanceEffects_writtenValue_isReadBack() {
        var values = EnvironmentValues()
        values.suppressesAppearanceEffects = true
        XCTAssertTrue(values.suppressesAppearanceEffects)
    }

    /// Garde de source : le `body` d'un `ViewModifier` ne se teste pas sans
    /// hôte de rendu. On vérifie seulement que le modificateur lit la valeur
    /// et la passe à la loi testée ci-dessus.
    func test_messageEffectsModifier_readsTheSuppressionFromTheEnvironment() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Components/MessageEffectModifiers.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        let start = try XCTUnwrap(code.range(of: "struct MessageEffectsModifier: ViewModifier"))
        let end = try XCTUnwrap(code.range(of: "extension View {", range: start.upperBound..<code.endIndex))
        let modifier = code[start.lowerBound..<end.lowerBound]

        XCTAssertTrue(modifier.contains("@Environment(\\.suppressesAppearanceEffects) private var suppressesAppearanceEffects"))
        XCTAssertTrue(modifier.contains("effects.playbackPlan(reduceMotion: reduceMotion, suppressAppearance: suppressesAppearanceEffects)"))
        XCTAssertFalse(modifier.contains("effects.playbackPlan(reduceMotion: reduceMotion)\n"), "l'ancien appel sans suppression ne doit pas survivre")
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageEffectsAppearanceSuppressionTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageEffectsAppearanceSuppressionTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation du bundle de tests :
- `error: extra argument 'suppressAppearance' in call` ;
- `error: value of type 'EnvironmentValues' has no member 'suppressesAppearanceEffects'`.

- [ ] **Étape 3 : Implémentation minimale**

3a — Dans `MessageEffectModifiers.swift`, remplacer :

```swift
// MARK: - Orchestration

/// Applique les effets d'un message : une exécution par affichage à l'écran.
```

par :

```swift
// MARK: - Apparition coupée (copie remontée de l'appui long)

private struct SuppressesAppearanceEffectsKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// **Une seconde instance d'un message ne rejoue pas son entrée (#5981).**
    ///
    /// `MessageEffectsModifier` n'a aucune mémoire de lecture : toute instance
    /// neuve rejoue confettis, explosion et secousse. La copie de la rangée que
    /// l'appui long remonte au-dessus du voile EST une instance neuve — sans
    /// cette valeur, ouvrir le menu d'un message à effet le ferait exploser une
    /// seconde fois. Vraie ⇒ plan d'apparition vide ; les effets persistants
    /// (halo, aurore) restent, ils font partie du format du message.
    var suppressesAppearanceEffects: Bool {
        get { self[SuppressesAppearanceEffectsKey.self] }
        set { self[SuppressesAppearanceEffectsKey.self] = newValue }
    }
}

extension MessageEffects {
    /// Le plan de lecture, apparition coupée à la demande. Les drapeaux
    /// d'apparition sont retirés AVANT la règle du SDK : `MessageEffectPlan` ne
    /// se construit que par elle, et elle garde seule la décision « Réduire les
    /// animations » sur les persistants. Le plan ne lit que les drapeaux.
    func playbackPlan(reduceMotion: Bool, suppressAppearance: Bool) -> MessageEffectPlan {
        guard suppressAppearance else { return playbackPlan(reduceMotion: reduceMotion) }
        return MessageEffects(flags: flags.subtracting(.appearanceMask)).playbackPlan(reduceMotion: reduceMotion)
    }
}

// MARK: - Orchestration

/// Applique les effets d'un message : une exécution par affichage à l'écran.
```

3b — Dans le même fichier, remplacer :

```swift
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        let plan = effects.playbackPlan(reduceMotion: reduceMotion)
```

par :

```swift
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.suppressesAppearanceEffects) private var suppressesAppearanceEffects

    func body(content: Content) -> some View {
        let plan = effects.playbackPlan(reduceMotion: reduceMotion, suppressAppearance: suppressesAppearanceEffects)
```

Les deux blocs cités sont uniques dans le fichier (`grep -c 'let plan = effects.playbackPlan(reduceMotion: reduceMotion)'` rend 1 avant l'édition).

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageEffectsAppearanceSuppressionTests \
  -only-testing:MeeshyTests/EffectOverlayMountingSourceGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageEffectsAppearanceSuppressionTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : les 7 tests de `MessageEffectsAppearanceSuppressionTests` et ceux d'`EffectOverlayMountingSourceGuardTests` passent. La dernière ligne est `Executed N tests, with 0 failures`, où N compte les deux classes.

La garde des overlays balaie `struct \w*Overlay: View` : la clé neuve ne porte pas ce suffixe.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
echo "pbxproj : $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources') -> $(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj) (attendu +2)" && \
git add apps/ios/Meeshy/Features/Main/Components/MessageEffectModifiers.swift \
        apps/ios/MeeshyTests/Unit/Views/MessageEffectsAppearanceSuppressionTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -F - <<'EOF'
feat(ios): la copie d'un message à effet ne rejoue pas son apparition (#5981)

La rangée remontée par l'appui long est une seconde instance du message ;
MessageEffectsModifier n'ayant aucune mémoire de lecture, elle rejouait
confettis, explosion et secousse. La valeur d'environnement
suppressesAppearanceEffects vide le plan d'apparition et garde les effets
persistants, par une loi pure testée (playbackPlan(reduceMotion:suppressAppearance:)).

Aucun fichier hors budget touché.

Refs #5981

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

---

### Tâche 13 : La conversation choisit par le mode qui lui remet la rangée d'un message

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Views/LiftedMessageRow.swift`
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift` (fichier des Tâches 1 et 4, ligne `var restoreAfterLongPress: (keyboardWasVisible: Bool, showOptions: Bool)? = nil`)
- Test : `apps/ios/MeeshyTests/Unit/Views/LiftedRowProviderLinkTests.swift` (créer)

**Interfaces :**
- Consomme :
  - `ConversationReadingMode` (`.bubbles`, `.focal`, `.script`, `.summary`, `.river`) ;
  - `LongPressPresentationStyle` (Tâche 3).
- Produit :
  ```swift
  struct LiftedMessageRow {
      enum Alignment: Equatable { case leading, trailing, fullWidth }
      let messageId: String
      let content: AnyView
      let frameInWindow: CGRect
      let alignment: Alignment
  }
  @MainActor protocol LiftedRowProviding: AnyObject { func liftedRow(for messageId: String) -> LiftedMessageRow? }
  final class LiftedRowProviderLink {
      enum Slot: Hashable { case thread, river }
      func register(_ provider: any LiftedRowProviding, for slot: Slot)
      static func slot(for mode: ConversationReadingMode) -> Slot
      func liftedRow(for messageId: String, mode: ConversationReadingMode) -> LiftedMessageRow?
  }
  // ConversationOverlayState
  let liftedRowLink = LiftedRowProviderLink()
  var liftedRow: LiftedMessageRow? = nil
  var liftedStyle: LongPressPresentationStyle = .longPress
  ```
  Pour les tests des Tâches 14 et 16, qui les réutilisent :
  - `FakeLiftedRowProvider` ;
  - `LiftedRowFixtures.row(_:frame:alignment:)`.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/LiftedRowProviderLinkTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import Meeshy

/// Double de fournisseur : rend les rangées qu'on lui donne et compte les
/// demandes. Partagé par les tests des Tâches 14 et 16.
@MainActor
final class FakeLiftedRowProvider: LiftedRowProviding {
    private let rows: [String: LiftedMessageRow]
    private(set) var requestedIds: [String] = []

    init(rows: [String: LiftedMessageRow]) {
        self.rows = rows
    }

    func liftedRow(for messageId: String) -> LiftedMessageRow? {
        requestedIds.append(messageId)
        return rows[messageId]
    }

    // iOS 26.1 : une deinit isolée synthétisée double-libère hors tâche (SE-0466).
    nonisolated deinit {}
}

@MainActor
enum LiftedRowFixtures {
    static func row(
        _ messageId: String,
        frame: CGRect = CGRect(x: 0, y: 120, width: 320, height: 64),
        alignment: LiftedMessageRow.Alignment = .leading
    ) -> LiftedMessageRow {
        LiftedMessageRow(messageId: messageId, content: AnyView(EmptyView()), frameInWindow: frame, alignment: alignment)
    }
}

/// #5981, D5 — le fournisseur de rangée se choisit PAR LE MODE, jamais « le
/// premier qui répond » : en Rivière, la liste du Fil reste vivante sous une
/// vue cachée et rendrait encore des cadres.
@MainActor
final class LiftedRowProviderLinkTests: XCTestCase {

    func test_slot_riverMode_isRiver() {
        XCTAssertEqual(LiftedRowProviderLink.slot(for: .river), .river)
    }

    func test_slot_everyOtherMode_isThread() {
        for mode: ConversationReadingMode in [.bubbles, .focal, .script, .summary] {
            XCTAssertEqual(LiftedRowProviderLink.slot(for: mode), .thread, "\(mode)")
        }
    }

    func test_liftedRow_threadProviderInScript_returnsItsRow() {
        let link = LiftedRowProviderLink()
        let provider = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1")])
        link.register(provider, for: .thread)

        let row = link.liftedRow(for: "m1", mode: .script)

        XCTAssertEqual(row?.messageId, "m1")
        XCTAssertEqual(row?.frameInWindow, CGRect(x: 0, y: 120, width: 320, height: 64))
        XCTAssertEqual(provider.requestedIds, ["m1"])
    }

    func test_liftedRow_riverMode_neverAsksTheThreadProvider() {
        let link = LiftedRowProviderLink()
        let thread = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1")])
        link.register(thread, for: .thread)

        XCTAssertNil(link.liftedRow(for: "m1", mode: .river))
        XCTAssertEqual(thread.requestedIds, [], "la liste cachée sous le pane Rivière n'est jamais interrogée")
    }

    func test_liftedRow_riverMode_asksTheRiverProviderOnly() {
        let link = LiftedRowProviderLink()
        let thread = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1")])
        let river = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1", alignment: .trailing)])
        link.register(thread, for: .thread)
        link.register(river, for: .river)

        XCTAssertEqual(link.liftedRow(for: "m1", mode: .river)?.alignment, .trailing)
        XCTAssertEqual(thread.requestedIds, [])
        XCTAssertEqual(river.requestedIds, ["m1"])
    }

    func test_liftedRow_unknownMessage_returnsNil() {
        let link = LiftedRowProviderLink()
        let provider = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1")])
        link.register(provider, for: .thread)

        XCTAssertNil(link.liftedRow(for: "m2", mode: .bubbles))
    }

    func test_liftedRow_providerReleased_returnsNil() {
        let link = LiftedRowProviderLink()
        registerTransientProvider(on: link)

        XCTAssertNil(link.liftedRow(for: "m1", mode: .focal), "le lien tient ses fournisseurs FAIBLEMENT")
    }

    func test_register_sameSlotTwice_keepsTheLatestProvider() {
        let link = LiftedRowProviderLink()
        let first = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1", alignment: .leading)])
        let second = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1", alignment: .fullWidth)])
        link.register(first, for: .thread)
        link.register(second, for: .thread)

        XCTAssertEqual(link.liftedRow(for: "m1", mode: .bubbles)?.alignment, .fullWidth)
        XCTAssertEqual(first.requestedIds, [])
    }

    func test_conversationOverlayState_defaults_noLiftedRowAndLongPressStyle() {
        let state = ConversationOverlayState()

        XCTAssertNil(state.liftedRow)
        XCTAssertEqual(state.liftedStyle, .longPress)
    }

    func test_conversationOverlayState_copies_shareTheSameLink() {
        let state = ConversationOverlayState()
        let copy = state

        XCTAssertTrue(state.liftedRowLink === copy.liftedRowLink, "une copie de l'état SwiftUI garde le même lien")
    }

    /// Le fournisseur n'existe que dans cette portée : au retour, plus rien ne le retient.
    private func registerTransientProvider(on link: LiftedRowProviderLink) {
        let provider = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1")])
        link.register(provider, for: .thread)
        XCTAssertNotNil(link.liftedRow(for: "m1", mode: .focal), "témoin : vivant, le fournisseur répond")
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LiftedRowProviderLinkTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LiftedRowProviderLinkTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation :
- `error: cannot find type 'LiftedRowProviding' in scope` ;
- `error: cannot find type 'LiftedMessageRow' in scope` ;
- `error: cannot find 'LiftedRowProviderLink' in scope`.

- [ ] **Étape 3 : Implémentation minimale**

3a — Créer `apps/ios/Meeshy/Features/Main/Views/LiftedMessageRow.swift` :

```swift
import SwiftUI

/// **La rangée d'un message, telle que la conversation la montre, remise à
/// l'overlay d'appui long (#5981, D1).**
///
/// Construite par le MÊME code que la cellule
/// (`MessageListViewController.makeRowContent`, fournisseur Rivière) : inerte,
/// hors focus, effets d'apparition coupés. `frameInWindow` est le cadre de la
/// cellule dans la FENÊTRE — l'overlay le convertit dans son propre repère
/// avant toute géométrie (colonne de détail iPad, §6.7).
struct LiftedMessageRow {
    /// Côté où la rangée se lit. Sémantique, jamais physique :
    /// `LiftedOverlayLayout` la projette selon le sens de lecture.
    enum Alignment: Equatable { case leading, trailing, fullWidth }

    let messageId: String
    let content: AnyView
    let frameInWindow: CGRect
    let alignment: Alignment
}

/// Rend la rangée d'un message affichée par ce fournisseur, `nil` si elle
/// n'est pas matérialisée (hors écran, vue cachée).
@MainActor
protocol LiftedRowProviding: AnyObject {
    func liftedRow(for messageId: String) -> LiftedMessageRow?
}

/// **Le lien entre la conversation et ceux qui affichent ses rangées (D5).**
///
/// Le choix se fait PAR LE MODE, jamais « le premier qui répond » : en Rivière,
/// le contrôleur de liste reste vivant sous une vue cachée et rendrait encore
/// des cadres. Références FAIBLES : la conversation tient le lien, chaque
/// fournisseur est tenu par son propre hôte. Aucun rappel existant ne change
/// de signature.
final class LiftedRowProviderLink {
    enum Slot: Hashable { case thread, river }

    private struct WeakProvider {
        weak var provider: (any LiftedRowProviding)?
    }

    private var providers: [Slot: WeakProvider] = [:]

    func register(_ provider: any LiftedRowProviding, for slot: Slot) {
        providers[slot] = WeakProvider(provider: provider)
    }

    static func slot(for mode: ConversationReadingMode) -> Slot {
        mode == .river ? .river : .thread
    }

    func liftedRow(for messageId: String, mode: ConversationReadingMode) -> LiftedMessageRow? {
        providers[Self.slot(for: mode)]?.provider?.liftedRow(for: messageId)
    }

    // iOS 26.1 : une deinit isolée synthétisée double-libère hors tâche (SE-0466).
    nonisolated deinit {}
}
```

3b — Vérifier qu'aucun site ne construit l'état avec des arguments. Le `let` avec valeur initiale sort de l'init memberwise :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && git grep -n "ConversationOverlayState(" -- apps/ios
```
Attendu : seules des occurrences `ConversationOverlayState()` (dont `ConversationView.swift`, `@State var overlayState = ConversationOverlayState()`).

3c — Dans `apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift`, remplacer :

```swift
    var restoreAfterLongPress: (keyboardWasVisible: Bool, showOptions: Bool)? = nil
```

par :

```swift
    var restoreAfterLongPress: (keyboardWasVisible: Bool, showOptions: Bool)? = nil
    /// Lien vers les fournisseurs de rangée (liste, Rivière) — une instance par
    /// conversation, gardée par le stockage de `@State` (#5981).
    let liftedRowLink = LiftedRowProviderLink()
    /// Rangée remontée pendant l'appui long ; `nil` ⇒ l'overlay actuel sert.
    var liftedRow: LiftedMessageRow? = nil
    var liftedStyle: LongPressPresentationStyle = .longPress
```

Si la ligne citée est introuvable (`grep -n "var restoreAfterLongPress" apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift`), la Tâche 4 n'est pas livrée : s'arrêter.

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LiftedRowProviderLinkTests \
  -only-testing:MeeshyTests/ConversationSelectionGuardTests \
  -only-testing:MeeshyTests/MainActorDeinitSourceGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LiftedRowProviderLinkTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu :
- les 10 tests de `LiftedRowProviderLinkTests` passent ;
- `ConversationSelectionGuardTests` et `MainActorDeinitSourceGuardTests` restent verts ;
- 0 échec.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
echo "pbxproj : $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources') -> $(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj) (attendu +4)" && \
git add apps/ios/Meeshy/Features/Main/Views/LiftedMessageRow.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift \
        apps/ios/MeeshyTests/Unit/Views/LiftedRowProviderLinkTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -F - <<'EOF'
feat(ios): la conversation choisit par le mode qui lui remet la rangée d'un message (#5981)

LiftedMessageRow, LiftedRowProviding et LiftedRowProviderLink : la liste et
l'hôte Rivière s'enregistrent chacun sous leur emplacement, la conversation
interroge celui du mode courant (jamais la liste cachée sous le pane Rivière),
par références faibles. ConversationOverlayState porte le lien, la rangée
remontée et le style de présentation.

Aucun fichier hors budget touché.

Refs #5981

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

---

### Tâche 14 : La liste remet à l'overlay la rangée que sa cellule affiche, construite par le même code

**Fichiers :**
- Modifier : `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift` :
  - `:1078` : insertion de `makeRowContent` avant `// MARK: - DataSource` ;
  - `:1198-1807` : fermeture `messageRegistration` ;
  - `:2536` : `resolveLocalId` perd `private` ;
  - `:2679-2708` : le bloc `// MARK: - Cell Frame Lookup` sort du fichier.
- Créer : `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+LiftedRow.swift`
- Modifier : `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift` :
  - `:548` : propriété `liftedRowLink` ;
  - `:644` et `:758` : enregistrement du contrôleur, au montage et à la mise à jour.
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` :
  - montage de `MessageListView`, ligne `overlaidMessageId:` ;
  - bloc `struct ConversationHeaderState` déplacé.
- Créer : `apps/ios/Meeshy/Features/Main/Views/ConversationHeaderState.swift`
- Modifier (re-pointage, §9.2) : `apps/ios/MeeshyTests/Unit/Focal/ConversationViewReadingModeSourceGuardTests.swift:146,150`
- Test : `apps/ios/MeeshyTests/Unit/Views/MessageListLiftedRowTests.swift` (créer)

**Interfaces :**
- Consomme :
  - `EnvironmentValues.suppressesAppearanceEffects` (Tâche 12) ;
  - `LiftedMessageRow`, `LiftedRowProviding`, `LiftedRowProviderLink`, `ConversationOverlayState.liftedRowLink`, `FakeLiftedRowProvider`/`LiftedRowFixtures` (Tâche 13).
- Produit :
  ```swift
  struct MessageRowContent {
      let message: Message
      let row: AnyView                 // bulle ou FocalRow, cinq environmentObject posés
      let nativePreview: () -> AnyView // aperçu du .contextMenu natif
      let isGroupHead: Bool
      let onLongPress: () -> Void
  }
  // MessageListViewController.swift
  func makeRowContent(localId: String, forLiftedCopy: Bool) -> MessageRowContent?
  func resolveLocalId(_ id: String) -> String            // internal (était private)
  // MessageListViewController+LiftedRow.swift
  func cellFrameInWindow(messageId: String) -> CGRect?    // relocalisée, inchangée
  extension MessageListViewController: LiftedRowProviding {
      func liftedRow(for messageId: String) -> LiftedMessageRow?
      static func liftedAlignment(usesFlatRow: Bool, isMine: Bool) -> LiftedMessageRow.Alignment
  }
  // MessageListView
  var liftedRowLink: LiftedRowProviderLink? = nil         // déclarée juste après overlaidMessageId
  ```
- Pour la Tâche 22 (P4) :
  - dans le corps de `makeRowContent`, l'ancre `focalRow.equatable()` est dans `row: AnyView(Group { if let focalRow { focalRow.equatable() } else { messageBubble } } …)` ;
  - `forLiftedCopy` et `focalRow` y sont en portée.

- [ ] **Étape 1 : Écrire les tests qui échouent**

Créer `apps/ios/MeeshyTests/Unit/Views/MessageListLiftedRowTests.swift` :

```swift
import XCTest
import GRDB
import SwiftUI
@testable import Meeshy
@testable import MeeshySDK

/// #5981, D1 — la liste remet à l'overlay la rangée que SA cellule affiche :
/// même cadre que la cellule, `nil` quand la liste ne se dessine pas ou que la
/// cellule n'est pas matérialisée.
@MainActor
final class MessageListLiftedRowTests: XCTestCase {

    // MARK: - Loi d'alignement

    func test_liftedAlignment_flatRow_isFullWidth_whoeverWroteIt() {
        XCTAssertEqual(MessageListViewController.liftedAlignment(usesFlatRow: true, isMine: true), .fullWidth)
        XCTAssertEqual(MessageListViewController.liftedAlignment(usesFlatRow: true, isMine: false), .fullWidth)
    }

    func test_liftedAlignment_myBubble_isTrailing() {
        XCTAssertEqual(MessageListViewController.liftedAlignment(usesFlatRow: false, isMine: true), .trailing)
    }

    func test_liftedAlignment_receivedBubble_isLeading() {
        XCTAssertEqual(MessageListViewController.liftedAlignment(usesFlatRow: false, isMine: false), .leading)
    }

    // MARK: - Hôte réel

    func test_liftedRow_realizedCell_returnsTheCellFrameAndItsSide() async throws {
        let (vc, window) = try await makeHostedController()
        let frame = try await realizedFrame(of: "m1", in: vc)

        let row = try XCTUnwrap(vc.liftedRow(for: "m1"))

        XCTAssertEqual(row.messageId, "m1")
        XCTAssertEqual(row.frameInWindow, frame, "la copie se pose au cadre de la cellule, jamais recalculé")
        XCTAssertEqual(row.alignment, .leading, "bulle reçue en mode Bulles")
        withExtendedLifetime(window) {}
    }

    func test_liftedRow_hiddenList_returnsNil() async throws {
        let (vc, window) = try await makeHostedController()
        _ = try await realizedFrame(of: "m1", in: vc)

        vc.view.isHidden = true

        XCTAssertNil(vc.liftedRow(for: "m1"), "sous un pane opaque, la liste ne remet aucune rangée")
        withExtendedLifetime(window) {}
    }

    func test_liftedRow_unknownMessage_returnsNil() async throws {
        let (vc, window) = try await makeHostedController()
        _ = try await realizedFrame(of: "m1", in: vc)

        XCTAssertNil(vc.liftedRow(for: "absent"))
        withExtendedLifetime(window) {}
    }

    func test_liftedRow_throughTheLink_answersTheThreadModesOnly() async throws {
        let (vc, window) = try await makeHostedController()
        _ = try await realizedFrame(of: "m1", in: vc)
        let link = LiftedRowProviderLink()
        link.register(vc, for: .thread)

        XCTAssertEqual(link.liftedRow(for: "m1", mode: .bubbles)?.messageId, "m1")
        XCTAssertNil(link.liftedRow(for: "m1", mode: .river))
        withExtendedLifetime(window) {}
    }

    // MARK: - Harnais

    private func makeHostedController() async throws -> (MessageListViewController, UIWindow) {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        try pool.write { db in try Self.record(localId: "m1", senderId: "A").insert(db) }
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()
        let vc = MessageListViewController(
            store: store,
            currentUserId: "user_me",
            accentColor: "#6366F1",
            isDirect: false,
            isDark: false,
            router: Router(),
            storyViewModel: StoryViewModel(),
            statusViewModel: StatusViewModel(),
            conversationListViewModel: ConversationListViewModel()
        )
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
        return (vc, window)
    }

    /// Témoin DISCRIMINANT : sans cellule matérialisée, les trois tests `nil`
    /// ci-dessus seraient verts pour une mauvaise raison.
    private func realizedFrame(of messageId: String, in vc: MessageListViewController) async throws -> CGRect {
        for _ in 0..<150 {
            vc.view.layoutIfNeeded()
            if let frame = vc.cellFrameInWindow(messageId: messageId) { return frame }
            try await Task.sleep(for: .milliseconds(20))
        }
        return try XCTUnwrap(
            vc.cellFrameInWindow(messageId: messageId),
            "la cellule de \(messageId) n'a jamais été matérialisée — le harnais ne mesure rien"
        )
    }

    private static func record(localId: String, senderId: String) -> MessageRecord {
        let createdAt = Date(timeIntervalSince1970: 1_700_000_000)
        return MessageRecord(
            localId: localId, serverId: nil, conversationId: "c1", senderId: senderId,
            content: "message \(localId)", originalLanguage: "fr", messageType: "text",
            messageSource: "user", contentType: "text", state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil, replyToId: nil,
            storyReplyToId: nil, forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil, expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0, isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil, senderName: nil, senderUsername: nil, senderColor: nil,
            senderAvatarURL: nil, deliveredCount: 0, readCount: 0, deliveredToAllAt: nil,
            readByAllAt: nil, createdAt: createdAt, sentAt: nil, deliveredAt: nil, readAt: nil,
            updatedAt: createdAt, attachmentsJson: nil, reactionsJson: nil, reactionCount: 0,
            currentUserReactionsJson: nil, mentionedUsersJson: nil, cachedBubbleWidth: nil,
            cachedBubbleHeight: nil, cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil, layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
    }
}

/// Garde de source — la copie est INERTE et HORS FOCUS, et la cellule passe
/// par la même méthode. Aucune API ne rend ces modificateurs observables.
@MainActor
final class LiftedRowCopySourceGuardTests: XCTestCase {

    private func stripped(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent(relative)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_liftedCopy_isInert_withoutAppearanceEffects() throws {
        let ext = try stripped("Meeshy/Features/Main/Views/MessageListViewController+LiftedRow.swift")

        XCTAssertTrue(ext.contains("makeRowContent(localId: resolveLocalId(messageId), forLiftedCopy: true)"))
        XCTAssertTrue(ext.contains(".allowsHitTesting(false)"))
        XCTAssertTrue(ext.contains(".accessibilityHidden(true)"))
        XCTAssertTrue(ext.contains(".environment(\\.suppressesAppearanceEffects, true)"))
        XCTAssertTrue(ext.contains("guard isViewLoaded, !view.isHidden,"))
    }

    func test_liftedCopy_isBuiltOutOfFocus_andTheMethodWritesNothingOnTheCell() throws {
        let host = try stripped("Meeshy/Features/Main/Views/MessageListViewController.swift")

        XCTAssertTrue(host.contains("func makeRowContent(localId: String, forLiftedCopy: Bool) -> MessageRowContent?"))
        XCTAssertTrue(host.contains("isFocused: !forLiftedCopy && self.focalDetailedLocalId == localId,"))
        XCTAssertFalse(host.contains("cell.tag = isFirstInGroup"), "la tête de groupe remonte à la cellule par `isGroupHead`")
    }

    func test_cell_buildsItsRowThroughTheSameMethod_once() throws {
        let host = try stripped("Meeshy/Features/Main/Views/MessageListViewController.swift")

        XCTAssertEqual(host.components(separatedBy: "self.makeRowContent(localId: localId, forLiftedCopy: false)").count - 1, 1)
        XCTAssertTrue(host.contains("content.row"))
        XCTAssertTrue(host.contains("content.nativePreview()"))
    }

    func test_messageListView_registersTheController_atMountAndAtUpdate() throws {
        let list = try stripped("Meeshy/Features/Main/Views/MessageListView.swift")

        XCTAssertEqual(list.components(separatedBy: "liftedRowLink?.register(vc, for: .thread)").count - 1, 2)
    }

    func test_conversationView_passesItsLinkToTheList() throws {
        let view = try stripped("Meeshy/Features/Main/Views/ConversationView.swift")

        XCTAssertTrue(view.contains("liftedRowLink: overlayState.liftedRowLink,"))
    }
}
```

- [ ] **Étape 2 : Lancer les tests et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageListLiftedRowTests \
  -only-testing:MeeshyTests/LiftedRowCopySourceGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageListLiftedRowTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation :
- `error: type 'MessageListViewController' has no member 'liftedAlignment'` ;
- `error: value of type 'MessageListViewController' has no member 'liftedRow'` ;
- `error: argument type 'MessageListViewController' does not conform to expected type 'LiftedRowProviding'`.

- [ ] **Étape 3a : Relever les tailles et prouver qu'aucune garde ne lit les blocs déplacés**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
wc -l apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift apps/ios/Meeshy/Features/Main/Views/ConversationView.swift | tee /tmp/p3-t14-avant.txt && \
for a in "func cellFrameInWindow" "cell.convert(cell.bounds" "Cell Frame Lookup" "focalOverlayPreview" "resolveLocalId" "struct ConversationHeaderState" "showStoryViewerFromHeader = false" "MessageRowContent"; do \
  printf '%-36s -> %s\n' "$a" "$(git grep -l -F "$a" -- apps/ios/MeeshyTests | tr '\n' ' ')"; done && \
git grep -n "struct ConversationHeaderState" -- apps/ios/Meeshy
```
Attendu :
- après chaque `->`, rien : aucune garde ne lit ces textes ;
- une seule déclaration, `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:…:struct ConversationHeaderState {`.

Si `struct ConversationHeaderState` a déjà quitté `ConversationView.swift` (tâche antérieure), l'Étape 3h déplace à sa place `struct PendingAudioEdit`, doc-comment de deux lignes compris. La même commande `git grep` doit alors rendre vide pour `PendingAudioEdit`.

- [ ] **Étape 3b : `resolveLocalId` devient visible de l'extension**

Dans `MessageListViewController.swift`, remplacer :

```swift
    private func resolveLocalId(_ id: String) -> String {
```

par :

```swift
    func resolveLocalId(_ id: String) -> String {
```

- [ ] **Étape 3c : Extraire `makeRowContent` et relocaliser `cellFrameInWindow` (script à ancres)**

Écrire `/tmp/p3_t14_extract.py` :

```python
import pathlib
import sys

ROOT = pathlib.Path("/Users/smpceo/Documents/v2_meeshy-longpress")
HOST = ROOT / "apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift"
EXT = ROOT / "apps/ios/Meeshy/Features/Main/Views/MessageListViewController+LiftedRow.swift"

lines = HOST.read_text(encoding="utf-8").split("\n")


def fail(message):
    sys.exit(f"ARRÊT — {message}")


def only(text, start=0, end=None):
    end = len(lines) if end is None else end
    hits = [i for i in range(start, end) if lines[i] == text]
    if len(hits) != 1:
        fail(f"ancre attendue une fois dans [{start}, {end}), trouvée {len(hits)} fois : {text!r}")
    return hits[0]


def expect(index, text):
    if lines[index] != text:
        fail(f"ligne {index + 1} : attendu {text!r}, lu {lines[index]!r}")


def dedent(block, width):
    out = []
    for line in block:
        if line.strip() == "":
            out.append("")
        elif line.startswith(" " * width):
            out.append(line[width:])
        else:
            fail(f"ligne moins indentée que {width} espaces : {line!r}")
    return out


def replace_once(block, old, new):
    hits = [i for i, line in enumerate(block) if line == old]
    if len(hits) != 1:
        fail(f"remplacement attendu une fois, trouvé {len(hits)} fois : {old!r}")
    return block[:hits[0]] + new + block[hits[0] + 1:]


if EXT.exists():
    fail(f"{EXT.name} existe déjà : le script ne se rejoue pas")

datasource = only("    // MARK: - DataSource")
reg = only("        let messageRegistration = UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> { [weak self] cell, _, item in")
close = only("            FocalScrollPerspective.hideFocusCard(in: cell.contentView)", reg) + 1
expect(close, "        }")
frame_lookup = only("    // MARK: - Cell Frame Lookup")
slow = only("    // MARK: - Slow Continuous Scroll (Quoted Message Search)")
if not (datasource < reg < close < frame_lookup < slow):
    fail("ordre des ancres du fichier inattendu")

guard = only("            guard case .message(let localId) = item,", reg, close)
expect(guard + 1, "                  let message = self.store.domainMessage(for: localId, currentUserId: self.currentUserId) else {")
expect(guard + 2, "                cell.contentConfiguration = nil")
expect(guard + 3, "                return")
expect(guard + 4, "            }")
lets_start = guard + 5
expect(lets_start, "            let accent = self.accentColor")

native_start = only("            // Menu d'appui long — DEUX chemins par version d'OS (miroir des", reg, close)
bubble_start = only("            // Bulle construite UNE fois, réutilisée pour le contenu de cellule", reg, close)
chips_start = only("            // Chips du message en focus SUR la ligne de la carte : elles", reg, close)
expect(chips_start - 1, "")
hosting = only("            cell.contentConfiguration = UIHostingConfiguration {", chips_start, close)
mux = only("                    if let focalRow {", hosting, close)
expect(mux + 1, "                        focalRow.equatable()")
expect(mux + 2, "                    } else {")
expect(mux + 3, "                        messageBubble")
expect(mux + 4, "                    }")
expect(mux + 5, "                }")
env_start = mux + 6
expect(env_start, "                .environmentObject(host)")
env_last = only("                .environmentObject(timestampReveal)", hosting, close)
native_menu = only("                .nativeMessageContextMenu(menu: nativeMenu) {", hosting, close)
expect(native_menu + 1, "                    MessageMenuPreviewContainer {")
preview_close = native_menu + 16
expect(preview_close, "                    }")
expect(preview_close + 1, "                }")
if not (lets_start < native_start < bubble_start < chips_start < hosting < mux < env_last < native_menu):
    fail("ordre interne de la fermeture inattendu")

cell_only_lets = [
    "            let swipeReplyHandler = self.onSwipeReply",
    "            let swipeForwardHandler = self.onSwipeForward",
    "            let selectionModeActive = self.isSelectionModeActive",
    "            let selectedIds = self.selectedMessageIds",
    "            let toggleSelectionHandler = self.onToggleSelection",
]
for text in cell_only_lets:
    only(text, lets_start, native_start)

row_lets = [line for line in lines[lets_start:native_start] if line not in cell_only_lets]
row_body = lines[bubble_start:chips_start - 1]
row_body = replace_once(
    row_body,
    "            let messageBubble = EquatableMessageBubble(bubble: makeThemedBubble(false)).equatable()",
    ["            let messageBubble = EquatableMessageBubble(bubble: makeThemedBubble(false)).equatable()",
     "            var isGroupHead = false"],
)
row_body = replace_once(
    row_body,
    "                cell.tag = isFirstInGroup ? FocalScrollPerspective.groupHeadCellTag : 0",
    ["                isGroupHead = isFirstInGroup"],
)
row_body = replace_once(
    row_body,
    "                    isFocused: self.focalDetailedLocalId == localId,",
    ["                    isFocused: !forLiftedCopy && self.focalDetailedLocalId == localId,"],
)

method = [
    "    /// **La rangée d'un message, construite UNE fois pour la cellule et pour la",
    "    /// copie que l'appui long remonte (#5981, D1).** Bulle ou rangée plate,",
    "    /// AVANT contre-flip, conteneur de balayage et menu natif, les cinq objets",
    "    /// d'environnement posés. Rien n'est écrit sur la cellule : la tête de",
    "    /// groupe remonte dans `isGroupHead`. `forLiftedCopy` construit la rangée",
    "    /// HORS focus : les chips du focus débordent de la cellule et ne font pas",
    "    /// partie du format du message.",
    "    func makeRowContent(localId: String, forLiftedCopy: Bool) -> MessageRowContent? {",
    "        guard let message = store.domainMessage(for: localId, currentUserId: currentUserId) else { return nil }",
] + dedent(row_lets, 4) + dedent(row_body, 4) + [
    "        return MessageRowContent(",
    "            message: message,",
    "            row: AnyView(Group {",
] + dedent(lines[mux:mux + 5], 4) + [
    "            }",
] + dedent(lines[env_start:env_last], 4) + [
    "            .environmentObject(timestampReveal)),",
    "            nativePreview: { AnyView(MessageMenuPreviewContainer {",
] + dedent(lines[native_menu + 2:preview_close], 8) + [
    "            }) },",
    "            isGroupHead: isGroupHead,",
    "            onLongPress: { longPressHandler(messageId) }",
    "        )",
    "    }",
    "",
]

chips_to_mux = replace_once(
    lines[chips_start:mux],
    "                    onLongPress: { longPressHandler(messageId) },",
    ["                    onLongPress: content.onLongPress,"],
)

cell = lines[reg:guard] + [
    "            guard case .message(let localId) = item,",
    "                  let content = self.makeRowContent(localId: localId, forLiftedCopy: false) else {",
    "                cell.contentConfiguration = nil",
    "                return",
    "            }",
    "            if content.isGroupHead { cell.tag = FocalScrollPerspective.groupHeadCellTag }",
    "            let message = content.message",
    "            let messageId = message.id",
    "            let isMine = message.isMe",
] + cell_only_lets + [""] + lines[native_start:bubble_start] + [""] + chips_to_mux + [
    "                    content.row",
    lines[mux + 5],
] + lines[env_last + 1:native_menu + 1] + [
    "                    content.nativePreview()",
] + lines[preview_close + 1:close + 1]

relocated = lines[frame_lookup:slow]
new_lines = lines[:datasource] + method + lines[datasource:reg] + cell + lines[close + 1:frame_lookup] + lines[slow:]
HOST.write_text("\n".join(new_lines), encoding="utf-8")

header = """import SwiftUI
import UIKit
import MeeshySDK

/// **Ce que `makeRowContent` rend : la rangée d'un message et ce que sa cellule
/// en tire (#5981).**
///
/// - `row` : bulle ou rangée plate, les cinq objets d'environnement posés,
///   AVANT contre-flip, conteneur de balayage et menu natif.
/// - `nativePreview` : l'aperçu du `.contextMenu` natif (iOS 26) — la rangée
///   plate, ou la bulle `standalone`. Construit à la demande.
/// - `isGroupHead` : l'étiquette que la CELLULE pose (`cell.tag`).
/// - `onLongPress` : le même gestionnaire que le « … » de la rangée plate.
struct MessageRowContent {
    let message: Message
    let row: AnyView
    let nativePreview: () -> AnyView
    let isGroupHead: Bool
    let onLongPress: () -> Void
}

extension MessageListViewController {

"""
EXT.write_text(header + "\n".join(relocated) + "\n}\n", encoding="utf-8")
print(f"hôte : {len(lines) - 1} -> {len(new_lines) - 1} lignes ; méthode : {len(method)} ; cellule : {len(cell)} ; relocalisé : {len(relocated)}")
```

Lancer :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && python3 /tmp/p3_t14_extract.py && \
diff <(git show HEAD:apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift | sed -n '/^    \/\/ MARK: - Cell Frame Lookup$/,/^    \/\/ MARK: - Slow Continuous Scroll/p' | sed '$d') \
     <(sed -n '/^    \/\/ MARK: - Cell Frame Lookup$/,/^}$/p' apps/ios/Meeshy/Features/Main/Views/MessageListViewController+LiftedRow.swift | sed '$d') && echo RELOCALISATION-IDENTIQUE && \
wc -l apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift
```
Attendu :
- `hôte : 3422 -> 3418 lignes ; méthode : 524 ; cellule : 112 ; relocalisé : 30` ;
- `RELOCALISATION-IDENTIQUE` ;
- `3418 …/MessageListViewController.swift`.

Ces nombres valent si le fichier mesure encore 3422 lignes, soit l'état de HEAD `e8f28f7f5f`, qu'aucune tâche antérieure ne modifie. Sinon le `Δ −4` reste l'attendu. Une ligne `ARRÊT — …` signifie qu'une ancre a changé : relire la ligne citée, ne rien forcer.

- [ ] **Étape 3d : Re-pointer la garde sensible à l'indentation**

Dans `apps/ios/MeeshyTests/Unit/Focal/ConversationViewReadingModeSourceGuardTests.swift`, remplacer :

```swift
            code.contains("let focalRow: EquatableFocalRow?\n            if self.readingMode.usesFlatRow {"),
```

par :

```swift
            code.contains("let focalRow: EquatableFocalRow?\n        if self.readingMode.usesFlatRow {"),
```

puis remplacer :

```swift
            code.contains("} else {\n                focalRow = nil\n            }"),
```

par :

```swift
            code.contains("} else {\n            focalRow = nil\n        }"),
```

Même assertion : le mux reste sous `if self.readingMode.usesFlatRow`, et `focalRow = nil` reste explicite. Seule l'indentation suit la méthode.

- [ ] **Étape 3e : Compiler et faire tourner les gardes qui lisent l'hôte (extraction seule, avant la copie)**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/ConversationLongPressMenuGuardTests \
  -only-testing:MeeshyTests/ConversationSelectionGuardTests \
  -only-testing:MeeshyTests/AgentGrammarGateTests \
  -only-testing:MeeshyTests/BetaFeaturesReadingModesIntegrationTests \
  -only-testing:MeeshyTests/ConversationViewReadingModeSourceGuardTests \
  -only-testing:MeeshyTests/FocalBetaPreviewNavigationSourceGuardTests \
  -only-testing:MeeshyTests/FocalChromeReturnTests \
  -only-testing:MeeshyTests/FocalFocusedRowDetailsGuardTests \
  -only-testing:MeeshyTests/FocalMatrixWiringGuardTests \
  -only-testing:MeeshyTests/FocalQuotedReplyRichTests \
  -only-testing:MeeshyTests/FocalRealtimeMatrixTests \
  -only-testing:MeeshyTests/FocalRowInputEquatableTests \
  -only-testing:MeeshyTests/FocalScrollPerspectiveTests \
  -only-testing:MeeshyTests/FocalScrollTimePillMountGuardTests \
  -only-testing:MeeshyTests/FileSizeBudgetGuardTests \
  -only-testing:MeeshyTests/PerpetualMotionGuardTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -only-testing:MeeshyTests/ConversationCatchUpLawTests \
  -only-testing:MeeshyTests/BubbleQuotedReplyAttachmentKindTests \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/ConversationTopChromeFadeTests \
  -only-testing:MeeshyTests/MessageListDataSourceQuiescenceTests \
  -only-testing:MeeshyTests/MessageListSeenTrackingModeGateTests \
  -only-testing:MeeshyTests/MessageListStickyDayMemoGuardTests \
  -only-testing:MeeshyTests/MessageListTimerQuiescenceGuardTests \
  -only-testing:MeeshyTests/MessageListDormantRenderingSourceGuardTests \
  -only-testing:MeeshyTests/MessageGroupLanguageFanOutTests \
  -only-testing:MeeshyTests/MessageListHeightEstimationTests \
  -only-testing:MeeshyTests/MessageListLayoutOffsetTests \
  -only-testing:MeeshyTests/FixedFontSizeGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-t14-gardes.log | grep -E "Test Case '.*' failed|error:|Executed [0-9]+ test"
```
Attendu : aucune ligne `error:` venue de l'app, et aucune ligne `Test Case … failed` venue des 30 classes nommées.

La compilation du bundle échoue encore sur `MessageListLiftedRowTests.swift` (conformance absente jusqu'à l'Étape 3f). Pour mesurer les gardes, écarter provisoirement ce fichier du bundle :
1. `mv apps/ios/MeeshyTests/Unit/Views/MessageListLiftedRowTests.swift /tmp/`, puis relancer la commande ;
2. le remettre en place en Étape 3f.

Lire le compte `Executed N tests, with 0 failures` : N doit être non nul.

- [ ] **Étape 3f : La liste devient fournisseur de rangée (la copie inerte)**

Remettre le test en place :

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && test -f /tmp/MessageListLiftedRowTests.swift && mv /tmp/MessageListLiftedRowTests.swift apps/ios/MeeshyTests/Unit/Views/ || test -f apps/ios/MeeshyTests/Unit/Views/MessageListLiftedRowTests.swift
```

Dans `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+LiftedRow.swift`, remplacer :

```swift
extension MessageListViewController {

    // MARK: - Cell Frame Lookup
```

par :

```swift
extension MessageListViewController: LiftedRowProviding {

    /// **La rangée que la cellule affiche, pour l'overlay d'appui long (#5981).**
    ///
    /// `nil` quand la liste ne se DESSINE pas (vue cachée sous le pane Rivière
    /// ou Résumé : le contrôleur y reste vivant et rendrait encore des cadres)
    /// ou quand la cellule n'est pas matérialisée — l'overlay actuel sert alors.
    /// Le cadre est celui de la cellule dans la fenêtre ; la pose Focal
    /// (transformation du calque du `contentView`) n'y entre pas, la copie est
    /// posée à plat.
    func liftedRow(for messageId: String) -> LiftedMessageRow? {
        guard isViewLoaded, !view.isHidden,
              let frame = cellFrameInWindow(messageId: messageId),
              let content = makeRowContent(localId: resolveLocalId(messageId), forLiftedCopy: true)
        else { return nil }
        return LiftedMessageRow(
            messageId: messageId,
            content: AnyView(
                content.row
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    .environment(\.suppressesAppearanceEffects, true)
            ),
            frameInWindow: frame,
            alignment: Self.liftedAlignment(usesFlatRow: readingMode.usesFlatRow, isMine: content.message.isMe)
        )
    }

    /// Rangée plate (Focal, Script) : pleine largeur, quel que soit l'auteur.
    /// Bulle : du côté de son auteur.
    static func liftedAlignment(usesFlatRow: Bool, isMine: Bool) -> LiftedMessageRow.Alignment {
        if usesFlatRow { return .fullWidth }
        return isMine ? .trailing : .leading
    }
}

extension MessageListViewController {

    // MARK: - Cell Frame Lookup
```

Ce fichier appartient à l'unité `AppSourceGuard.unit("…MessageListViewController.swift")`. Il ne contient :
- ni `MeeshyFeatureFlags` ;
- ni `readingMode == .river` ;
- ni `dataSource.apply(` ;
- ni `Timer(`.

Ces quatre textes sont comptés ou interdits par `BetaFeaturesReadingModesIntegrationTests`, `MessageListStickyDayMemoGuardTests`, `MessageListDataSourceQuiescenceTests` et `FocalScrollTimePillMountGuardTests`.

- [ ] **Étape 3g : `MessageListView` enregistre le contrôleur sous l'emplacement du fil**

Dans `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`, remplacer :

```swift
    var overlaidMessageId: String? = nil
    /// Long-press on a call-summary notice → request the shared call-detail
```

par :

```swift
    var overlaidMessageId: String? = nil
    /// Lien auquel la liste s'inscrit comme fournisseur de rangée (#5981) :
    /// l'overlay d'appui long lui demande la rangée que la cellule affiche.
    /// `nil` pour les écrans qui ne présentent pas cet overlay.
    var liftedRowLink: LiftedRowProviderLink? = nil
    /// Long-press on a call-summary notice → request the shared call-detail
```

Puis remplacer, dans les DEUX fonctions (`makeUIViewController` et `updateUIViewController`, outil Edit avec `replace_all: true`) :

```swift
        vc.overlaidMessageId = overlaidMessageId
```

par :

```swift
        vc.overlaidMessageId = overlaidMessageId
        liftedRowLink?.register(vc, for: .thread)
```

Vérifier :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && grep -c 'liftedRowLink?.register(vc, for: .thread)' apps/ios/Meeshy/Features/Main/Views/MessageListView.swift
```
Attendu : `2`.

Ce fichier ne mentionne aucun drapeau (`BetaFeaturesReadingModesIntegrationTests`).

- [ ] **Étape 3h : `ConversationView` passe son lien, et `ConversationHeaderState` sort du fichier (compensation D4)**

Dans `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`, remplacer :

```swift
                overlaidMessageId: overlayState.showOverlayMenu ? overlayState.overlayMessage?.id : nil,
                onCallDetailRequest: { messageId in
```

par :

```swift
                overlaidMessageId: overlayState.showOverlayMenu ? overlayState.overlayMessage?.id : nil,
                liftedRowLink: overlayState.liftedRowLink,
                onCallDetailRequest: { messageId in
```

Puis, dans le même fichier, supprimer ces six lignes (ligne vide finale comprise) :

```swift
struct ConversationHeaderState {
    var showStoryViewerFromHeader = false
    var storyUserIdForHeader: String?
    var showSearch = false
    var searchQuery = ""
}

```

et créer `apps/ios/Meeshy/Features/Main/Views/ConversationHeaderState.swift` :

```swift
import Foundation

struct ConversationHeaderState {
    var showStoryViewerFromHeader = false
    var storyUserIdForHeader: String?
    var showSearch = false
    var searchQuery = ""
}
```

Preuve de relocalisation pure :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
diff <(git show HEAD:apps/ios/Meeshy/Features/Main/Views/ConversationView.swift | sed -n '/^struct ConversationHeaderState {$/,/^}$/p') \
     <(sed -n '/^struct ConversationHeaderState {$/,/^}$/p' apps/ios/Meeshy/Features/Main/Views/ConversationHeaderState.swift) && echo IDENTIQUE && \
git grep -n "struct ConversationHeaderState" -- apps/ios/Meeshy
```
Attendu :
- `IDENTIQUE` ;
- une seule déclaration, dans `ConversationHeaderState.swift`.

Repli (Étape 3a) : si ce bloc était déjà parti, supprimer puis recréer à l'identique `struct PendingAudioEdit` avec ses deux lignes de doc-comment, dans `PendingAudioEdit.swift`. Même preuve `diff`, avec le motif `/^\/\/\/ A pending audio attachment/,/^}$/`.

- [ ] **Étape 4 : Lancer les tests et constater le succès**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/MessageListLiftedRowTests \
  -only-testing:MeeshyTests/LiftedRowCopySourceGuardTests \
  -only-testing:MeeshyTests/LiftedRowProviderLinkTests \
  -only-testing:MeeshyTests/ConversationViewReadingModeSourceGuardTests \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/ConversationLongPressMenuGuardTests \
  -only-testing:MeeshyTests/FocalFocusedRowDetailsGuardTests \
  -only-testing:MeeshyTests/FocalMatrixWiringGuardTests \
  -only-testing:MeeshyTests/FocalQuotedReplyRichTests \
  -only-testing:MeeshyTests/BubbleQuotedReplyAttachmentKindTests \
  -only-testing:MeeshyTests/BetaFeaturesReadingModesIntegrationTests \
  -only-testing:MeeshyTests/MessageListDataSourceQuiescenceTests \
  -only-testing:MeeshyTests/MessageListStickyDayMemoGuardTests \
  -only-testing:MeeshyTests/MessageListTimerQuiescenceGuardTests \
  -only-testing:MeeshyTests/FocalScrollTimePillMountGuardTests \
  -only-testing:MeeshyTests/AgentGrammarGateTests \
  -only-testing:MeeshyTests/FileSizeBudgetGuardTests \
  -only-testing:MeeshyTests/ConversationSelectionGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-MessageListLiftedRowTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu :
- les 7 tests de `MessageListLiftedRowTests` et les 5 de `LiftedRowCopySourceGuardTests` passent ;
- les gardes nommées restent vertes : `Executed N tests, with 0 failures`.

Si `test_liftedRow_realizedCell_returnsTheCellFrameAndItsSide` échoue sur « la cellule de m1 n'a jamais été matérialisée », c'est le harnais qui ne mesure rien, pas le produit. Relever le journal `/tmp/meeshy-longpress-MessageListLiftedRowTests.log` avant de toucher au code.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
wc -l apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift apps/ios/Meeshy/Features/Main/Views/ConversationView.swift | tee /tmp/p3-t14-apres.txt && \
VC_AVANT=$(awk '/MessageListViewController.swift/{print $1}' /tmp/p3-t14-avant.txt) && VC_APRES=$(awk '/MessageListViewController.swift/{print $1}' /tmp/p3-t14-apres.txt) && \
CV_AVANT=$(awk '/ConversationView.swift/{print $1}' /tmp/p3-t14-avant.txt) && CV_APRES=$(awk '/ConversationView.swift/{print $1}' /tmp/p3-t14-apres.txt) && \
test "$VC_APRES" -le "$VC_AVANT" && test "$CV_APRES" -le "$CV_AVANT" && \
echo "pbxproj : $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources') -> $(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj) (attendu +6)" && \
git add apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift \
        apps/ios/Meeshy/Features/Main/Views/MessageListViewController+LiftedRow.swift \
        apps/ios/Meeshy/Features/Main/Views/MessageListView.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationHeaderState.swift \
        apps/ios/MeeshyTests/Unit/Focal/ConversationViewReadingModeSourceGuardTests.swift \
        apps/ios/MeeshyTests/Unit/Views/MessageListLiftedRowTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -F - <<EOF
feat(ios): la liste remet à l'overlay la rangée que sa cellule affiche (#5981)

La fermeture de cellule de MessageListViewController construit désormais sa
rangée par makeRowContent(localId:forLiftedCopy:), dans le même fichier. La
cellule l'enveloppe (balayage, contre-flip, menu natif) ; la liste, inscrite
au lien sous l'emplacement du fil, la remet à l'overlay hors focus, inerte et
sans effets d'apparition, au cadre de sa cellule. Vue cachée ou cellule non
matérialisée : nil, l'overlay actuel sert.

Budget D4 (wc -l) :
- MessageListViewController.swift : ${VC_AVANT} -> ${VC_APRES} (extraction +26, cellFrameInWindow relocalisé -30)
- ConversationView.swift : ${CV_AVANT} -> ${CV_APRES} (lien +1, ConversationHeaderState relocalisé -6)
Garde re-pointée sans affaiblissement : ConversationViewReadingModeSourceGuardTests
(indentation de la méthode).

Refs #5981

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

---

### Tâche 15 : La barre, la rangée et le menu tiennent dans l'écran d'un seul bloc

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Components/LiftedOverlayLayout.swift`
- Test : `apps/ios/MeeshyTests/Unit/Components/LiftedOverlayLayoutTests.swift` (créer)

**Interfaces :**
- Consomme :
  - `LongPressPresentationStyle` (Tâche 3) ;
  - `LiftedMessageRow.Alignment` (Tâche 13).
- Produit :
  ```swift
  struct LiftedOverlayLayoutInput: Equatable {
      var rowFrame: CGRect; var hostSize: CGSize; var safeAreaTop: CGFloat; var safeAreaBottom: CGFloat
      var stripSize: CGSize; var menuSize: CGSize; var minimumMenuHeight: CGFloat
      var style: LongPressPresentationStyle; var alignment: LiftedMessageRow.Alignment; var isRightToLeft: Bool
  }
  struct LiftedOverlayLayout: Equatable {
      let stripFrame: CGRect; let rowFrame: CGRect; let menuFrame: CGRect; let menuOverlapsRow: Bool
      static let edgeInset: CGFloat = 16
      static let stripMaxWidth: CGFloat = 520
      static let stripGap: CGFloat = 8
      static let menuGap: CGFloat = 6
      static func resolve(_ input: LiftedOverlayLayoutInput) -> LiftedOverlayLayout
      static func rowFrameInHost(_ frameInWindow: CGRect, hostFrameInWindow: CGRect) -> CGRect
      static func safeAreaInHost(windowSafeAreaTop: CGFloat, windowSafeAreaBottom: CGFloat,
                                 windowHeight: CGFloat, hostFrameInWindow: CGRect) -> (top: CGFloat, bottom: CGFloat)
  }
  ```

**La loi, telle qu'elle est testée** (spec §6). Notations :
- `top = safeAreaTop`, `bottom = hostSize.height − safeAreaBottom` ;
- `stripAbove` vaut :
  - appui long : `stripHeight + 8` ;
  - double tap : `stripHeight / 2` ;
- `highest = top + stripAbove` : la plus haute position possible du haut de la rangée.

Précédence : la règle 5, puis la règle 4, puis les règles 3 et 6.

1. **Règle 5** : elle s'applique si `highest + rowHeight + 6 + min(minimumMenuHeight, menuHeight) > bottom`.
   - La rangée se pose à `highest`.
   - Le menu se pose sur sa partie basse, bord bas à `bottom`, avec la hauteur `min(menuHeight, bottom − highest)`.
   - `menuOverlapsRow` vaut vrai.
2. **Règles 4, 3 et 6**, sinon.
   - Position de départ : `naturalTop = max(rowFrame.minY, highest)`.
   - Espace sous la rangée : `spaceBelow = bottom − (naturalTop + rowHeight + 6)`.
   - Montée du bloc : `lift = min(max(0, menuHeight − spaceBelow), naturalTop − highest)`.
   - Haut de la rangée : `rowTop = naturalTop − lift`.
   - Hauteur servie au menu : `min(menuHeight, spaceBelow + lift)` ; il défile au-delà.
3. **Barre** : sa largeur vaut `min(hostWidth − 32, 520)`.
   - Appui long : bord bas 8 pt au-dessus de la rangée.
   - Double tap : centre sur le bord haut de la rangée.
4. **Abscisse**, ancrée à droite si `(alignment == .trailing) != isRightToLeft`, et `.fullWidth` suit `.leading` :
   - ancrage à droite : `rowFrame.maxX − largeur` ;
   - sinon : `rowFrame.minX` ;
   - bornée à 16 pt des deux bords.
5. **Échelle 1** : la rangée ne change jamais ni de taille ni d'abscisse.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Components/LiftedOverlayLayoutTests.swift`. L'hôte vaut 400 × 800 pt, zones sûres 50 / 30 : `top = 50`, `bottom = 770`, largeur de barre `368`.

```swift
import XCTest
@testable import Meeshy

/// #5982, spec §6 — géométrie de l'appui long remonté. Tous les nombres
/// attendus sont calculés à la main dans les commentaires.
@MainActor
final class LiftedOverlayLayoutTests: XCTestCase {

    private func input(
        row: CGRect,
        host: CGSize = CGSize(width: 400, height: 800),
        safeTop: CGFloat = 50,
        safeBottom: CGFloat = 30,
        stripHeight: CGFloat = 64,
        menu: CGSize = CGSize(width: 240, height: 200),
        minimumMenu: CGFloat? = nil,
        style: LongPressPresentationStyle = .longPress,
        alignment: LiftedMessageRow.Alignment = .leading,
        rightToLeft: Bool = false
    ) -> LiftedOverlayLayoutInput {
        LiftedOverlayLayoutInput(
            rowFrame: row,
            hostSize: host,
            safeAreaTop: safeTop,
            safeAreaBottom: safeBottom,
            stripSize: CGSize(width: 368, height: stripHeight),
            menuSize: menu,
            minimumMenuHeight: minimumMenu ?? menu.height,
            style: style,
            alignment: alignment,
            isRightToLeft: rightToLeft
        )
    }

    // MARK: - Règle 3 : nominal

    func test_resolve_receivedBubbleWithRoom_stripAboveMenuBelowRowUnmoved() {
        // stripAbove 72 ; highest 122 ; 122+80+6+200 = 408 ≤ 770 ; spaceBelow 770−386 = 384 ; lift 0.
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 16, y: 300, width: 250, height: 80)))

        XCTAssertEqual(layout.stripFrame, CGRect(x: 16, y: 228, width: 368, height: 64))
        XCTAssertEqual(layout.rowFrame, CGRect(x: 16, y: 300, width: 250, height: 80))
        XCTAssertEqual(layout.menuFrame, CGRect(x: 16, y: 386, width: 240, height: 200))
        XCTAssertFalse(layout.menuOverlapsRow)
    }

    func test_resolve_myBubble_menuOnTheTrailingEdge() {
        // maxX 384 ; menu 384−240 = 144 (borne 400−16−240 = 144).
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 134, y: 300, width: 250, height: 80), alignment: .trailing))

        XCTAssertEqual(layout.menuFrame, CGRect(x: 144, y: 386, width: 240, height: 200))
        XCTAssertEqual(layout.stripFrame.minX, 16)
    }

    // MARK: - RTL

    func test_resolve_receivedBubbleInRightToLeft_menuOnTheRight() {
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 134, y: 300, width: 250, height: 80), alignment: .leading, rightToLeft: true))

        XCTAssertEqual(layout.menuFrame.minX, 144, "leading, en RTL, c'est la droite")
    }

    func test_resolve_myBubbleInRightToLeft_menuOnTheLeft() {
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 16, y: 300, width: 250, height: 80), alignment: .trailing, rightToLeft: true))

        XCTAssertEqual(layout.menuFrame.minX, 16, "trailing, en RTL, c'est la gauche")
    }

    // MARK: - Règle 4 : tenir dans l'écran

    func test_resolve_rowNearTheBottom_liftsTheWholeBlockJustEnough() {
        // naturalTop 600 ; spaceBelow 770−686 = 84 ; lift min(200−84, 600−122) = 116 ; rowTop 484.
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 16, y: 600, width: 250, height: 80)))

        XCTAssertEqual(layout.stripFrame, CGRect(x: 16, y: 412, width: 368, height: 64))
        XCTAssertEqual(layout.rowFrame, CGRect(x: 16, y: 484, width: 250, height: 80))
        XCTAssertEqual(layout.menuFrame, CGRect(x: 16, y: 570, width: 240, height: 200))
        XCTAssertEqual(layout.menuFrame.maxY, 770, "le menu touche la zone sûre basse, pas plus bas")
        XCTAssertFalse(layout.menuOverlapsRow)
    }

    func test_resolve_rowUnderTheTopSafeArea_slidesDownUntilTheStripFits() {
        // naturalTop max(60, 122) = 122 ; bord haut de la barre 122−72 = 50 = zone sûre.
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 16, y: 60, width: 250, height: 80)))

        XCTAssertEqual(layout.stripFrame, CGRect(x: 16, y: 50, width: 368, height: 64))
        XCTAssertEqual(layout.rowFrame, CGRect(x: 16, y: 122, width: 250, height: 80))
        XCTAssertEqual(layout.menuFrame, CGRect(x: 16, y: 208, width: 240, height: 200))
    }

    // MARK: - Règle 5 : message trop haut

    func test_resolve_rowTallerThanTheRoom_alignsUnderTheStripAndMenuOverlapsItsBottom() {
        // 122+700+6+200 = 1028 > 770 ; rowTop 122 ; menu 200, bord bas 770.
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 16, y: 100, width: 250, height: 700)))

        XCTAssertEqual(layout.stripFrame, CGRect(x: 16, y: 50, width: 368, height: 64))
        XCTAssertEqual(layout.rowFrame, CGRect(x: 16, y: 122, width: 250, height: 700))
        XCTAssertEqual(layout.menuFrame, CGRect(x: 16, y: 570, width: 240, height: 200))
        XCTAssertTrue(layout.menuOverlapsRow)
    }

    func test_resolve_rowTallerThanTheScreen_menuOverlapsRow() {
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 16, y: -200, width: 250, height: 1200)))

        XCTAssertEqual(layout.rowFrame, CGRect(x: 16, y: 122, width: 250, height: 1200))
        XCTAssertEqual(layout.menuFrame, CGRect(x: 16, y: 570, width: 240, height: 200))
        XCTAssertTrue(layout.menuOverlapsRow)
    }

    // MARK: - Précédence

    func test_resolve_precedence_rule5BeatsRule4_menuKeepsItsFullHeight() {
        // 122+500+6+200 = 828 > 770 ⇒ règle 5. La règle 4 seule aurait servi min(200, −136+278) = 142 pt.
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 16, y: 400, width: 250, height: 500)))

        XCTAssertTrue(layout.menuOverlapsRow)
        XCTAssertEqual(layout.menuFrame, CGRect(x: 16, y: 570, width: 240, height: 200))
        XCTAssertEqual(layout.rowFrame.minY, 122)
    }

    func test_resolve_precedence_rule4BeatsRule3_menuNeverLeavesTheScreen() {
        // Règle 3 seule : menu à 686, bas à 886 > 770. La règle 4 fait monter le bloc.
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 16, y: 600, width: 250, height: 80)))

        XCTAssertLessThanOrEqual(layout.menuFrame.maxY, 770)
        XCTAssertEqual(layout.menuFrame.minY - layout.rowFrame.maxY, LiftedOverlayLayout.menuGap)
    }

    // MARK: - Double tap : barre à cheval, menu complet

    func test_resolve_scriptDoubleTap_centersTheStripOnTheRowTopEdge() {
        // stripAbove 32 ; highest 82 ; spaceBelow 770−396 = 374 ≥ 300 ; bord haut barre 300−32 = 268.
        let layout = LiftedOverlayLayout.resolve(input(
            row: CGRect(x: 0, y: 300, width: 400, height: 90),
            menu: CGSize(width: 280, height: 300),
            minimumMenu: 132,
            style: .scriptDoubleTap,
            alignment: .fullWidth
        ))

        XCTAssertEqual(layout.stripFrame, CGRect(x: 16, y: 268, width: 368, height: 64))
        XCTAssertEqual(layout.stripFrame.midY, layout.rowFrame.minY, "centre de la barre sur le bord haut de la rangée")
        XCTAssertEqual(layout.rowFrame, CGRect(x: 0, y: 300, width: 400, height: 90))
        XCTAssertEqual(layout.menuFrame, CGRect(x: 16, y: 396, width: 280, height: 300))
    }

    func test_resolve_fullOptionsTallerThanTheRoom_liftsThenScrolls() {
        // spaceBelow 374 ; lift min(900−374, 300−82) = 218 ; rowTop 82 ; menu 374+218 = 592, bas 770.
        let layout = LiftedOverlayLayout.resolve(input(
            row: CGRect(x: 0, y: 300, width: 400, height: 90),
            menu: CGSize(width: 280, height: 900),
            minimumMenu: 132,
            style: .scriptDoubleTap,
            alignment: .fullWidth
        ))

        XCTAssertEqual(layout.stripFrame, CGRect(x: 16, y: 50, width: 368, height: 64))
        XCTAssertEqual(layout.rowFrame, CGRect(x: 0, y: 82, width: 400, height: 90))
        XCTAssertEqual(layout.menuFrame, CGRect(x: 16, y: 178, width: 280, height: 592))
        XCTAssertFalse(layout.menuOverlapsRow)
    }

    func test_resolve_menuHeightAtLeastItsMinimum_staysUnderTheRow() {
        // 82+540+6+132 = 760 ≤ 770 ; spaceBelow 124 ; lift min(276, 18) = 18 ; menu 142 ≥ 132.
        let layout = LiftedOverlayLayout.resolve(input(
            row: CGRect(x: 0, y: 100, width: 400, height: 540),
            menu: CGSize(width: 280, height: 400),
            minimumMenu: 132,
            style: .scriptDoubleTap,
            alignment: .fullWidth
        ))

        XCTAssertEqual(layout.rowFrame, CGRect(x: 0, y: 82, width: 400, height: 540))
        XCTAssertEqual(layout.menuFrame, CGRect(x: 16, y: 628, width: 280, height: 142))
        XCTAssertFalse(layout.menuOverlapsRow)
    }

    func test_resolve_menuMinimumUnreachable_fallsBackToRule5() {
        // 82+540+6+150 = 778 > 770 ⇒ règle 5 ; menu min(400, 770−82) = 400, haut 370.
        let layout = LiftedOverlayLayout.resolve(input(
            row: CGRect(x: 0, y: 100, width: 400, height: 540),
            menu: CGSize(width: 280, height: 400),
            minimumMenu: 150,
            style: .scriptDoubleTap,
            alignment: .fullWidth
        ))

        XCTAssertEqual(layout.menuFrame, CGRect(x: 16, y: 370, width: 280, height: 400))
        XCTAssertTrue(layout.menuOverlapsRow)
    }

    // MARK: - Largeur et bornes

    func test_resolve_iPad_stripCappedAt520_andKeptInsideTheHost() {
        // top 24, bottom 1346 ; barre min(992, 520) = 520 ; x voulu 500, borne 1024−16−520 = 488.
        let layout = LiftedOverlayLayout.resolve(input(
            row: CGRect(x: 500, y: 600, width: 300, height: 80),
            host: CGSize(width: 1024, height: 1366),
            safeTop: 24,
            safeBottom: 20
        ))

        XCTAssertEqual(layout.stripFrame, CGRect(x: 488, y: 528, width: 520, height: 64))
        XCTAssertEqual(layout.menuFrame, CGRect(x: 500, y: 686, width: 240, height: 200))
    }

    func test_resolve_trailingRowAgainstTheEdge_menuKeeps16Points() {
        // x voulu 400−240 = 160, borne 144 ⇒ bord droit 384 = 400−16.
        let layout = LiftedOverlayLayout.resolve(input(row: CGRect(x: 200, y: 300, width: 200, height: 80), alignment: .trailing))

        XCTAssertEqual(layout.menuFrame, CGRect(x: 144, y: 386, width: 240, height: 200))
        XCTAssertEqual(layout.stripFrame.minX, 16)
    }

    // MARK: - Échelle 1

    func test_resolve_anyInput_neverResizesNorMovesTheRowHorizontally() {
        let inputs = [
            input(row: CGRect(x: 16, y: 300, width: 250, height: 80)),
            input(row: CGRect(x: 16, y: 600, width: 250, height: 80)),
            input(row: CGRect(x: 16, y: 100, width: 250, height: 700)),
            input(row: CGRect(x: 0, y: 300, width: 400, height: 90), menu: CGSize(width: 280, height: 900), minimumMenu: 132, style: .scriptDoubleTap, alignment: .fullWidth),
            input(row: CGRect(x: 500, y: 600, width: 300, height: 80), host: CGSize(width: 1024, height: 1366), safeTop: 24, safeBottom: 20),
        ]
        for value in inputs {
            let layout = LiftedOverlayLayout.resolve(value)
            XCTAssertEqual(layout.rowFrame.size, value.rowFrame.size, "échelle 1 : \(value.rowFrame)")
            XCTAssertEqual(layout.rowFrame.minX, value.rowFrame.minX)
        }
    }

    // MARK: - Conversion fenêtre → hôte (iPad, §6.7)

    func test_rowFrameInHost_detailColumn_subtractsTheHostOrigin() {
        XCTAssertEqual(
            LiftedOverlayLayout.rowFrameInHost(CGRect(x: 420, y: 300, width: 300, height: 80), hostFrameInWindow: CGRect(x: 320, y: 0, width: 704, height: 1366)),
            CGRect(x: 100, y: 300, width: 300, height: 80)
        )
    }

    func test_safeAreaInHost_fullScreenHost_keepsTheWindowInsets() {
        let insets = LiftedOverlayLayout.safeAreaInHost(windowSafeAreaTop: 62, windowSafeAreaBottom: 34, windowHeight: 874, hostFrameInWindow: CGRect(x: 0, y: 0, width: 402, height: 874))

        XCTAssertEqual(insets.top, 62)
        XCTAssertEqual(insets.bottom, 34)
    }

    func test_safeAreaInHost_hostBelowTheTopInset_hasNoTopInset() {
        // haut : max(0, 24−50) = 0 ; bas : max(0, 1366 − (1366−20)) = 20.
        let insets = LiftedOverlayLayout.safeAreaInHost(windowSafeAreaTop: 24, windowSafeAreaBottom: 20, windowHeight: 1366, hostFrameInWindow: CGRect(x: 320, y: 50, width: 704, height: 1316))

        XCTAssertEqual(insets.top, 0)
        XCTAssertEqual(insets.bottom, 20)
    }

    func test_safeAreaInHost_hostEndingAboveTheBottomInset_hasNoBottomInset() {
        // bas : max(0, 700 − (874−34)) = 0.
        let insets = LiftedOverlayLayout.safeAreaInHost(windowSafeAreaTop: 62, windowSafeAreaBottom: 34, windowHeight: 874, hostFrameInWindow: CGRect(x: 0, y: 0, width: 402, height: 700))

        XCTAssertEqual(insets.bottom, 0)
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LiftedOverlayLayoutTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LiftedOverlayLayoutTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation :
- `error: cannot find type 'LiftedOverlayLayoutInput' in scope` ;
- `error: cannot find 'LiftedOverlayLayout' in scope`.

- [ ] **Étape 3 : Implémentation minimale**

Créer `apps/ios/Meeshy/Features/Main/Components/LiftedOverlayLayout.swift` :

```swift
import CoreGraphics

/// Entrées de la géométrie de l'appui long remonté, toutes dans le repère de
/// l'HÔTE de l'overlay (jamais la fenêtre : colonne de détail iPad, §6.7).
struct LiftedOverlayLayoutInput: Equatable {
    var rowFrame: CGRect
    var hostSize: CGSize
    var safeAreaTop: CGFloat
    var safeAreaBottom: CGFloat
    /// Taille MESURÉE de la barre (`EmojiReactionPicker.stripHeight(scale: 2)` en estimation initiale).
    var stripSize: CGSize
    var menuSize: CGSize
    /// Liste compacte : sa hauteur entière (elle ne défile pas). Menu complet : trois lignes.
    var minimumMenuHeight: CGFloat
    var style: LongPressPresentationStyle
    var alignment: LiftedMessageRow.Alignment
    var isRightToLeft: Bool
}

/// **Géométrie de l'appui long remonté (#5982, spec §6).**
///
/// Échelle toujours 1 : la rangée garde sa taille et son abscisse, seul le bloc
/// barre + rangée + menu glisse verticalement. Précédence : règle 5 (message
/// trop haut, le menu se pose sur sa partie basse), puis règle 4 (le bloc glisse
/// d'un seul tenant, au plus court), puis règles 3 et 6 (menu 6 pt sous la
/// rangée, hauteur bornée par l'espace dessous, défilement au-delà).
struct LiftedOverlayLayout: Equatable {
    let stripFrame: CGRect
    let rowFrame: CGRect
    let menuFrame: CGRect
    /// Règle 5 : le menu est posé en verre sur la partie basse de la rangée.
    let menuOverlapsRow: Bool

    static let edgeInset: CGFloat = 16
    static let stripMaxWidth: CGFloat = 520
    static let stripGap: CGFloat = 8
    static let menuGap: CGFloat = 6

    private struct VerticalPlacement {
        let rowTop: CGFloat
        let menuTop: CGFloat
        let menuHeight: CGFloat
        let overlaps: Bool
    }

    static func resolve(_ input: LiftedOverlayLayoutInput) -> LiftedOverlayLayout {
        let availableWidth = max(0, input.hostSize.width - 2 * edgeInset)
        let stripWidth = min(availableWidth, stripMaxWidth)
        let menuWidth = min(input.menuSize.width, availableWidth)
        let stripHeight = input.stripSize.height
        let placement = verticalPlacement(input)
        let stripTop = input.style == .longPress
            ? placement.rowTop - stripGap - stripHeight
            : placement.rowTop - stripHeight / 2
        return LiftedOverlayLayout(
            stripFrame: CGRect(x: originX(width: stripWidth, input: input), y: stripTop, width: stripWidth, height: stripHeight),
            rowFrame: CGRect(x: input.rowFrame.minX, y: placement.rowTop, width: input.rowFrame.width, height: input.rowFrame.height),
            menuFrame: CGRect(x: originX(width: menuWidth, input: input), y: placement.menuTop, width: menuWidth, height: placement.menuHeight),
            menuOverlapsRow: placement.overlaps
        )
    }

    /// Le cadre fenêtre d'une rangée, dans le repère de l'hôte.
    static func rowFrameInHost(_ frameInWindow: CGRect, hostFrameInWindow: CGRect) -> CGRect {
        frameInWindow.offsetBy(dx: -hostFrameInWindow.minX, dy: -hostFrameInWindow.minY)
    }

    /// Les zones sûres de la fenêtre, ramenées à ce qui recouvre l'hôte.
    static func safeAreaInHost(
        windowSafeAreaTop: CGFloat,
        windowSafeAreaBottom: CGFloat,
        windowHeight: CGFloat,
        hostFrameInWindow: CGRect
    ) -> (top: CGFloat, bottom: CGFloat) {
        (top: max(0, windowSafeAreaTop - hostFrameInWindow.minY),
         bottom: max(0, hostFrameInWindow.maxY - (windowHeight - windowSafeAreaBottom)))
    }

    private static func verticalPlacement(_ input: LiftedOverlayLayoutInput) -> VerticalPlacement {
        let bottom = input.hostSize.height - input.safeAreaBottom
        let stripAbove = input.style == .longPress
            ? input.stripSize.height + stripGap
            : input.stripSize.height / 2
        let highest = input.safeAreaTop + stripAbove
        let rowHeight = input.rowFrame.height
        let menuHeight = input.menuSize.height
        let minimumMenu = min(input.minimumMenuHeight, menuHeight)

        guard highest + rowHeight + menuGap + minimumMenu <= bottom else {
            let served = max(0, min(menuHeight, bottom - highest))
            return VerticalPlacement(rowTop: highest, menuTop: bottom - served, menuHeight: served, overlaps: true)
        }
        let naturalTop = max(input.rowFrame.minY, highest)
        let spaceBelow = bottom - (naturalTop + rowHeight + menuGap)
        let lift = min(max(0, menuHeight - spaceBelow), naturalTop - highest)
        let rowTop = naturalTop - lift
        return VerticalPlacement(
            rowTop: rowTop,
            menuTop: rowTop + rowHeight + menuGap,
            menuHeight: min(menuHeight, spaceBelow + lift),
            overlaps: false
        )
    }

    /// Côté de lecture : mes bulles à droite (LTR), les reçues et les rangées
    /// pleine largeur au bord de lecture ; bornée à 16 pt des deux bords.
    private static func originX(width: CGFloat, input: LiftedOverlayLayoutInput) -> CGFloat {
        let anchorsRight = input.alignment == .trailing ? !input.isRightToLeft : input.isRightToLeft
        let wanted = anchorsRight ? input.rowFrame.maxX - width : input.rowFrame.minX
        return min(max(wanted, edgeInset), input.hostSize.width - edgeInset - width)
    }
}
```

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LiftedOverlayLayoutTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LiftedOverlayLayoutTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : `Executed 21 tests, with 0 failures`.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
echo "pbxproj : $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources') -> $(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj) (attendu +4)" && \
git add apps/ios/Meeshy/Features/Main/Components/LiftedOverlayLayout.swift \
        apps/ios/MeeshyTests/Unit/Components/LiftedOverlayLayoutTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -F - <<'EOF'
feat(ios): la barre, la rangée et le menu tiennent dans l'écran d'un seul bloc (#5982)

LiftedOverlayLayout.resolve, loi pure de la spec §6 : échelle 1, barre 8 pt
au-dessus (appui long) ou à cheval sur le bord haut (double tap), menu 6 pt
dessous, glissé d'un seul bloc au plus court, menu posé sur la partie basse
d'un message trop haut (précédence 5 > 4 > 3/6), côté de lecture en RTL,
barre plafonnée à 520 pt, conversion fenêtre → hôte pour l'iPad.

Aucun fichier hors budget touché.

Refs #5981
Refs #5982

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

---

### Tâche 16 : L'appui long montre la vraie rangée remontée au-dessus du voile, barre 2× au-dessus, menu dessous

**Fichiers :**
- Créer :
  - `apps/ios/Meeshy/Features/Main/Components/LiftedMessageOverlay.swift`
  - `apps/ios/Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift`
  - `apps/ios/Meeshy/Features/Main/Views/PreviewMedia.swift`
- Modifier :
  - `apps/ios/Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift` (version de la Tâche 4) : `continueLongPressPresentation`, première ligne de `restoreStateAfterLongPressIfNeeded`.
  - `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` : `overlayMenuContent` (+1) ; `struct PreviewMedia` sort du fichier (−6).
  - `apps/ios/Meeshy/Features/Main/Components/EmojiUsageTracker.swift` (fichier créé par la Tâche 6) : liste partagée.
  - `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift:99-104` : `defaultEmojis`.
  - `apps/ios/MeeshyTests/Unit/Views/ConversationViewBodyTypeDepthTests.swift` : profondeur du nouvel overlay et entrée d'érasure.
- Test : `apps/ios/MeeshyTests/Unit/Views/LiftedOverlayPresentationTests.swift` (créer)

**Interfaces :**
- Consomme :
  - **Tâche 2** : `MeeshyFeatureFlags.isLiftedRowLongPressEnabled`.
  - **Tâche 3** : `LongPressPresentationPlan.shouldRecenter(cellFrame:windowHeight:mode:)`, `LongPressPresentationStyle`.
  - **Tâche 4** :
    - `presentLongPressMenu(for:cellFrame:style:)` et son jeton (`overlayMessage?.id == message.id`, menu fermé) ;
    - `continueLongPressPresentation(for:cellFrame:style:)` ;
    - `restoreStateAfterLongPressIfNeeded()` ;
    - `ConversationView.longPressRepositionDelay`.
  - **Tâche 5** : `EmojiReactionPicker(quickEmojis:style:scale:scrollable:chrome:onReact:onDismiss:onExpandFullPicker:…)`, `EmojiReactionPicker.stripHeight(scale:)`, `EmojiReactionPickerChrome`.
  - **Tâche 6** : `EmojiUsageTracker` (dans `EmojiUsageTracker.swift`).
  - **Tâche 7** : `OptionSection`, `MessageActionResolver.allOptionSections(_:)`.
  - **Tâche 8** : `ConversationView.menuContext(for:isRiver:)`.
  - **Tâche 10** : `ConversationView.messageActionRouter(for:) -> MessageActionRouter` (`perform`, `performMore`). Le routeur ne ferme rien : l'hôte ferme d'abord.
  - **Tâche 11** : `MessageOptionsGlassMenu(sections:accentHex:maxHeight:onPrimary:onMore:)`, `menuWidth`, `estimatedHeight(sections:)`, `minimumHeight()`.
  - **Tâches 13 à 15** : `LiftedMessageRow`, `LiftedRowProviderLink`, `ConversationOverlayState.liftedRow/liftedStyle/liftedRowLink`, `LiftedOverlayLayout`.
  - **Existants** : `MessageActionsMenu(actions:accentHex:onSelect:)`, `MessageActionsMenu.estimatedSize(actionCount:)`, `MessageOverlayDragLaw`, `DeviceLayout`, `HapticFeedback`.
- Produit :
  ```swift
  struct LiftedMessageOverlay: View {
      let row: LiftedMessageRow; let style: LongPressPresentationStyle; let accentHex: String
      let compactActions: [PrimaryAction]; let optionSections: [OptionSection]
      @Binding var isPresented: Bool
      let onReact: (String) -> Void; let onExpandFullPicker: () -> Void
      let onPrimary: (PrimaryAction) -> Void; let onMore: (MoreItem) -> Void; let onShowMore: () -> Void
  }
  enum LiftedOverlayPresentation {
      static func row(flagEnabled: Bool, link: LiftedRowProviderLink, messageId: String, mode: ConversationReadingMode) -> LiftedMessageRow?
  }
  extension ConversationView {
      func liftedRowToPresent(for message: Message) -> LiftedMessageRow?
      func liftedOverlayContent(for message: Message) -> AnyView?   // nil ⇒ l'overlay actuel sert
  }
  extension EmojiUsageTracker { static let overlayQuickDefaults: [String] }
  ```
  La Tâche 22 (P4) monte ce même overlay avec `style: .scriptDoubleTap`. Il en gère déjà les deux présentations :
  - appui long : barre sans fond + liste compacte ;
  - double tap : barre avec capsule à cheval + menu glass.

- [ ] **Étape 1 : Écrire les tests qui échouent**

1a — Créer `apps/ios/MeeshyTests/Unit/Views/LiftedOverlayPresentationTests.swift` :

```swift
import XCTest
@testable import Meeshy

/// #5981, D2 — drapeau éteint ou rangée absente ⇒ l'overlay actuel sert.
@MainActor
final class LiftedOverlayPresentationTests: XCTestCase {

    func test_row_flagOff_returnsNil_andNeverAsksTheProvider() {
        let link = LiftedRowProviderLink()
        let provider = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1")])
        link.register(provider, for: .thread)

        XCTAssertNil(LiftedOverlayPresentation.row(flagEnabled: false, link: link, messageId: "m1", mode: .script))
        XCTAssertEqual(provider.requestedIds, [], "drapeau éteint : aucune rangée n'est construite")
    }

    func test_row_flagOn_threadModeWithProvider_returnsTheRow() {
        let link = LiftedRowProviderLink()
        let provider = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1", alignment: .fullWidth)])
        link.register(provider, for: .thread)

        XCTAssertEqual(LiftedOverlayPresentation.row(flagEnabled: true, link: link, messageId: "m1", mode: .focal)?.alignment, .fullWidth)
    }

    func test_row_flagOn_noProvider_returnsNil() {
        XCTAssertNil(LiftedOverlayPresentation.row(flagEnabled: true, link: LiftedRowProviderLink(), messageId: "m1", mode: .bubbles))
    }

    func test_row_flagOn_riverModeWithOnlyTheThreadProvider_returnsNil() {
        let link = LiftedRowProviderLink()
        let thread = FakeLiftedRowProvider(rows: ["m1": LiftedRowFixtures.row("m1")])
        link.register(thread, for: .thread)

        XCTAssertNil(LiftedOverlayPresentation.row(flagEnabled: true, link: link, messageId: "m1", mode: .river))
        XCTAssertEqual(thread.requestedIds, [])
    }
}

/// Garde de source — le câblage de `ConversationView` et l'ordre « fermer puis
/// agir » ne s'observent par aucune API (vue SwiftUI, extension d'écran).
@MainActor
final class LiftedOverlayWiringSourceGuardTests: XCTestCase {

    private func stripped(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent(relative)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func body(of anchor: String, in code: String) throws -> String {
        let start = try XCTUnwrap(code.range(of: anchor), "ancre introuvable : \(anchor)")
        var depth = 0
        var opened = false
        var out = ""
        for character in code[start.lowerBound...] {
            out.append(character)
            if character == "{" { depth += 1; opened = true }
            if character == "}" {
                depth -= 1
                if opened && depth == 0 { return out }
            }
        }
        return out
    }

    private func assertOrder(_ texts: [String], in block: String, _ message: String, line: UInt = #line) throws {
        let positions = try texts.map { try XCTUnwrap(block.range(of: $0), "\(message) — introuvable : \($0)", line: line).lowerBound }
        XCTAssertEqual(positions, positions.sorted(), message, line: line)
    }

    func test_overlayMenuContent_triesTheLiftedOverlayFirst() throws {
        let view = try stripped("Meeshy/Features/Main/Views/ConversationView.swift")
        let content = try body(of: "private var overlayMenuContent: AnyView {", in: view)

        try assertOrder(
            ["if let lifted = liftedOverlayContent(for: msg) { return lifted }", "MessageOverlayMenu("],
            in: content,
            "la rangée remontée est essayée avant l'overlay actuel, qui reste le repli"
        )
    }

    func test_continueLongPressPresentation_readsTheLiftedRow_andKeepsItsSingleDoor() throws {
        let code = try stripped("Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift")
        let proceed = try body(of: "func continueLongPressPresentation(", in: code)

        XCTAssertTrue(proceed.contains("let lifted = liftedRowToPresent(for: message)"))
        XCTAssertTrue(proceed.contains("cellFrame: cellFrame"), "la loi de recentrage reçoit le cadre de la rangée quand elle existe")
        XCTAssertTrue(proceed.contains("overlayState.liftedRow = lifted"))
        XCTAssertTrue(proceed.contains("guard self.overlayState.overlayMessage?.id == message.id"), "jeton de P1 : un second appui long a pris la place")
        XCTAssertTrue(proceed.contains("self.liftedRowToPresent(for: message)"), "après recentrage, la rangée est RELUE")
        XCTAssertTrue(proceed.contains("overlayState.showOverlayMenu = true"), "la présentation n'a qu'une porte")
    }

    func test_restoreStateAfterLongPress_clearsTheLiftedCopyBeforeAnythingElse() throws {
        let code = try stripped("Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift")
        let restore = try body(of: "func restoreStateAfterLongPressIfNeeded(", in: code)

        try assertOrder(
            ["overlayState.liftedRow = nil", "guard let saved = overlayState.restoreAfterLongPress"],
            in: restore,
            "la copie est vidée à chaque fermeture, même sans état à restituer"
        )
    }

    func test_liftedOverlay_closesFirst_thenActs_thenDropsThePresentation() throws {
        let overlay = try stripped("Meeshy/Features/Main/Components/LiftedMessageOverlay.swift")
        let close = try body(of: "private func close(then action:", in: overlay)

        try assertOrder(
            ["isVisible = false", "action()", "isPresented = false"],
            in: close,
            "fermer d'abord, agir ensuite, avant que la restitution du clavier ne lise l'état"
        )
    }

    func test_liftedOverlay_reusesTheSharedParts_andAddsNoHaptic() throws {
        let overlay = try stripped("Meeshy/Features/Main/Components/LiftedMessageOverlay.swift")

        for part in [
            "EmojiReactionPicker(", "scale: 2,", "scrollable: true,", "chrome: style == .longPress ? .none : .capsule,",
            "EmojiUsageTracker.recordUsage(emoji: emoji)", "EmojiUsageTracker.overlayQuickDefaults",
            "MessageOverlayDragLaw.outcome(", "MessageActionsMenu(", "MessageOptionsGlassMenu(",
            "LiftedOverlayLayout.resolve(", ".accessibilityAddTraits(.isModal)", ".accessibilityAction(.escape)",
        ] {
            XCTAssertTrue(overlay.contains(part), "attendu : \(part)")
        }
        XCTAssertEqual(
            overlay.components(separatedBy: "HapticFeedback.").count - 1, 3,
            "les trois haptiques de l'overlay actuel (apparition, fermeture, armement du glissé) — aucune de plus"
        )
    }

    func test_bothOverlays_readOneQuickEmojiList() throws {
        let legacy = try stripped("Meeshy/Features/Main/Components/MessageOverlayMenu.swift")

        XCTAssertTrue(legacy.contains("private let defaultEmojis = EmojiUsageTracker.overlayQuickDefaults"))
    }
}
```

1b — Dans `apps/ios/MeeshyTests/Unit/Views/ConversationViewBodyTypeDepthTests.swift`, remplacer :

```swift
    func test_conversationListViewBody_nestingStaysWithinStackBudget() throws {
        try assertNestingWithinBudget(of: ConversationListView.Body.self, label: "ConversationListView.body")
    }
```

par :

```swift
    func test_conversationListViewBody_nestingStaysWithinStackBudget() throws {
        try assertNestingWithinBudget(of: ConversationListView.Body.self, label: "ConversationListView.body")
    }

    /// #5981 — l'overlay de l'appui long remonté est une racine d'évaluation
    /// à part entière (monté sous `AnyView`) : son propre `body` se borne.
    func test_liftedMessageOverlayBody_nestingStaysWithinStackBudget() throws {
        try assertNestingWithinBudget(of: LiftedMessageOverlay.Body.self, label: "LiftedMessageOverlay.body")
    }
```

puis, dans le même fichier, remplacer :

```swift
        ("func quickReactionBarOverlay(for messageId: String) -> AnyView",
         "Meeshy/Features/Main/Views/ConversationView+MessageRow.swift"),
```

par :

```swift
        ("func quickReactionBarOverlay(for messageId: String) -> AnyView",
         "Meeshy/Features/Main/Views/ConversationView+MessageRow.swift"),
        ("func liftedOverlayContent(for message: Message) -> AnyView?",
         "Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift"),
```

- [ ] **Étape 2 : Lancer les tests et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LiftedOverlayPresentationTests \
  -only-testing:MeeshyTests/LiftedOverlayWiringSourceGuardTests \
  -only-testing:MeeshyTests/ConversationViewBodyTypeDepthTests \
  -only-testing:MeeshyTests/ConversationViewLayerErasureSourceGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LiftedOverlayPresentationTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation :
- `error: cannot find 'LiftedOverlayPresentation' in scope` ;
- `error: cannot find type 'LiftedMessageOverlay' in scope`.

- [ ] **Étape 3a : Une seule liste d'emojis rapides**

Relever les tailles :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift | tee /tmp/p3-t16-avant.txt && \
git grep -n "defaultEmojis\|struct PreviewMedia\|PreviewMedia(" -- apps/ios/MeeshyTests; \
git grep -n "struct EmojiUsageTracker" -- apps/ios/Meeshy
```
Attendu :
- aucune ligne sous `apps/ios/MeeshyTests` ;
- une déclaration, `apps/ios/Meeshy/Features/Main/Components/EmojiUsageTracker.swift:…:struct EmojiUsageTracker {`.

Dans `apps/ios/Meeshy/Features/Main/Components/EmojiUsageTracker.swift`, remplacer :

```swift
struct EmojiUsageTracker {
    private static let key = "com.meeshy.emojiUsageCount"
```

par :

```swift
struct EmojiUsageTracker {
    private static let key = "com.meeshy.emojiUsageCount"

    /// Les emojis rapides par défaut des overlays d'appui long — liste UNIQUE,
    /// lue par `MessageOverlayMenu` et `LiftedMessageOverlay`. Les six premiers
    /// sont les réactions populaires visibles sans défiler ; la queue se
    /// découvre au glissé horizontal.
    static let overlayQuickDefaults: [String] = [
        "😂", "❤️", "👍", "😮", "😢", "🔥",
        "🎉", "💯", "🥰", "😎", "🙏", "💀",
        "🤣", "✨", "👏", "🤔", "🥺", "😍",
        "🫶", "💪"
    ]
```

Dans `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`, remplacer :

```swift
    private let defaultEmojis = [
        "😂", "❤️", "👍", "😮", "😢", "🔥",
        "🎉", "💯", "🥰", "😎", "🙏", "💀",
        "🤣", "✨", "👏", "🤔", "🥺", "😍",
        "🫶", "💪"
    ]
```

par :

```swift
    private let defaultEmojis = EmojiUsageTracker.overlayQuickDefaults
```

- [ ] **Étape 3b : Créer l'overlay**

Créer `apps/ios/Meeshy/Features/Main/Components/LiftedMessageOverlay.swift` :

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'appui long montre le message tel qu'on le lit (#5981, #5982).**
///
/// La rangée que la conversation affiche — construite par le même code que sa
/// cellule, inerte, hors focus — est posée au cadre de la cellule, à l'échelle
/// 1, au-dessus du voile. La barre de réactions 2× entre au-dessus : sans fond
/// à l'appui long, avec sa capsule à cheval sur le bord haut au double tap
/// Script. Dessous : la liste compacte (appui long) ou toutes les options en
/// verre (double tap). La géométrie est `LiftedOverlayLayout`.
///
/// Repris de `MessageOverlayMenu`, à l'identique : le voile et sa fermeture
/// (entrée `.spring(0.42, 0.74)`, sortie `.spring(0.32, 0.86)`, présentation
/// retirée à 0,26 s), `MessageOverlayDragLaw` (haut fort : « Plus… » ; bas :
/// fermeture), `EmojiUsageTracker`, la modale VoiceOver et ses trois
/// haptiques. Une action choisie FERME d'abord, puis s'exécute — avant que la
/// présentation ne tombe, pour que la restitution du clavier voie l'édition ou
/// la sélection qu'elle vient d'ouvrir.
struct LiftedMessageOverlay: View {
    let row: LiftedMessageRow
    let style: LongPressPresentationStyle
    let accentHex: String
    let compactActions: [PrimaryAction]
    let optionSections: [OptionSection]
    @Binding var isPresented: Bool
    let onReact: (String) -> Void
    let onExpandFullPicker: () -> Void
    let onPrimary: (PrimaryAction) -> Void
    let onMore: (MoreItem) -> Void
    let onShowMore: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.layoutDirection) private var layoutDirection
    @State private var isVisible = false
    /// Classement figé pour la présentation : la table d'usage ne change pas
    /// tant que l'overlay est ouvert (une réaction le ferme).
    @State private var cachedTopEmojis: [String]?
    @State private var measuredStripSize: CGSize?
    /// Seul le menu COMPACT est mesuré : la hauteur servie du menu complet
    /// dépend du `maxHeight` que la géométrie lui donne, la mesurer bouclerait.
    @State private var measuredCompactMenuSize: CGSize?
    @State private var dragHapticArmed = false
    @GestureState(resetTransaction: Transaction(animation: .spring(response: 0.35, dampingFraction: 0.75)))
    private var menuDragOffset: CGFloat = 0
    @GestureState(resetTransaction: Transaction(animation: .spring(response: 0.35, dampingFraction: 0.75)))
    private var backgroundDragOffset: CGFloat = 0

    private var isDark: Bool { colorScheme == .dark }
    private var clusterDragOffset: CGFloat { menuDragOffset + backgroundDragOffset }

    var body: some View {
        GeometryReader { proxy in
            let hostFrame = proxy.frame(in: .global)
            let source = LiftedOverlayLayout.rowFrameInHost(row.frameInWindow, hostFrameInWindow: hostFrame)
            let layout = LiftedOverlayLayout.resolve(layoutInput(source: source, hostFrame: hostFrame))
            ZStack(alignment: .topLeading) {
                dismissBackground
                rowCopy(source: source, target: layout.rowFrame)
                strip(frame: layout.stripFrame, source: source)
                menu(frame: layout.menuFrame, source: source)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .ignoresSafeArea()
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { close() }
        .onAppear {
            HapticFeedback.medium()
            if cachedTopEmojis == nil {
                cachedTopEmojis = EmojiUsageTracker.topEmojis(count: 20, defaults: EmojiUsageTracker.overlayQuickDefaults)
            }
            withAnimation(.spring(response: 0.42, dampingFraction: 0.74)) {
                isVisible = true
            }
        }
    }

    // MARK: - Géométrie

    /// Sous `.ignoresSafeArea()`, le lecteur de géométrie rend des zones sûres
    /// nulles : elles viennent de la fenêtre, ramenées au repère de l'hôte.
    private func layoutInput(source: CGRect, hostFrame: CGRect) -> LiftedOverlayLayoutInput {
        let insets = LiftedOverlayLayout.safeAreaInHost(
            windowSafeAreaTop: DeviceLayout.safeAreaTop,
            windowSafeAreaBottom: DeviceLayout.safeAreaBottom,
            windowHeight: DeviceLayout.windowSize.height,
            hostFrameInWindow: hostFrame
        )
        let menuSize = naturalMenuSize
        return LiftedOverlayLayoutInput(
            rowFrame: source,
            hostSize: hostFrame.size,
            safeAreaTop: insets.top,
            safeAreaBottom: insets.bottom,
            stripSize: measuredStripSize
                ?? CGSize(width: LiftedOverlayLayout.stripMaxWidth, height: EmojiReactionPicker.stripHeight(scale: 2)),
            menuSize: menuSize,
            minimumMenuHeight: style == .longPress ? menuSize.height : MessageOptionsGlassMenu.minimumHeight(),
            style: style,
            alignment: row.alignment,
            isRightToLeft: layoutDirection == .rightToLeft
        )
    }

    private var naturalMenuSize: CGSize {
        switch style {
        case .longPress:
            return measuredCompactMenuSize ?? MessageActionsMenu.estimatedSize(actionCount: compactActions.count)
        case .scriptDoubleTap:
            return CGSize(
                width: MessageOptionsGlassMenu.menuWidth,
                height: MessageOptionsGlassMenu.estimatedHeight(sections: optionSections)
            )
        }
    }

    // MARK: - Calques

    /// Assombrissement net + lueur accent, sans matière plein écran : le verre
    /// du menu échantillonne le contenu réel (comme `MessageOverlayMenu`).
    private var dismissBackground: some View {
        ZStack {
            Color.black
                .opacity(isVisible ? (isDark ? 0.5 : 0.4) : 0)
            RadialGradient(
                colors: [Color(hex: accentHex).opacity(isDark ? 0.30 : 0.20), Color.clear],
                center: .bottom,
                startRadius: 12,
                endRadius: 520
            )
            .opacity(isVisible ? 1 : 0)
            .blendMode(isDark ? .screen : .multiply)
        }
        .animation(.easeOut(duration: 0.26), value: isVisible)
        .contentShape(Rectangle())
        .onTapGesture { close() }
        .gesture(clusterDragGesture($backgroundDragOffset))
    }

    /// La copie ne se touche pas : un glissé posé sur elle atteint le voile,
    /// qui porte la même loi que le menu.
    private func rowCopy(source: CGRect, target: CGRect) -> some View {
        row.content
            .frame(width: source.width, height: source.height, alignment: .top)
            .position(x: source.midX, y: isVisible ? target.midY : source.midY)
            .offset(y: clusterDragOffset)
    }

    private func strip(frame: CGRect, source: CGRect) -> some View {
        EmojiReactionPicker(
            quickEmojis: cachedTopEmojis ?? EmojiUsageTracker.topEmojis(count: 20, defaults: EmojiUsageTracker.overlayQuickDefaults),
            style: isDark ? .dark : .light,
            scale: 2,
            scrollable: true,
            chrome: style == .longPress ? .none : .capsule,
            onReact: { emoji in
                close {
                    EmojiUsageTracker.recordUsage(emoji: emoji)
                    onReact(emoji)
                }
            },
            onExpandFullPicker: { close(then: onExpandFullPicker) }
        )
        .frame(width: frame.width)
        .background(GeometryReader { Color.clear.preference(key: LiftedStripSizeKey.self, value: $0.size) })
        .onPreferenceChange(LiftedStripSizeKey.self) { size in
            if size != .zero { measuredStripSize = size }
        }
        .position(x: frame.midX, y: isVisible ? frame.midY : source.minY)
        .offset(y: clusterDragOffset)
    }

    /// Liste compacte : le glissé a priorité sur ses lignes (un glissé lent
    /// amorcé sur « Épingler » épinglait). Menu complet : il défile, le glissé
    /// passe par le voile.
    private func menu(frame: CGRect, source: CGRect) -> some View {
        menuContent(maxHeight: frame.height)
            .frame(width: frame.width, height: frame.height, alignment: .top)
            .scaleEffect(isVisible ? 1 : 0.85, anchor: .top)
            .opacity(isVisible ? 1 : 0)
            .position(
                x: frame.midX,
                y: isVisible ? frame.midY : source.maxY + LiftedOverlayLayout.menuGap + frame.height / 2
            )
            .offset(y: clusterDragOffset)
            .highPriorityGesture(clusterDragGesture($menuDragOffset), including: style == .longPress ? .all : .subviews)
    }

    @ViewBuilder
    private func menuContent(maxHeight: CGFloat) -> some View {
        switch style {
        case .longPress:
            MessageActionsMenu(
                actions: compactActions,
                accentHex: accentHex,
                onSelect: { action in close { onPrimary(action) } }
            )
            .background(GeometryReader { Color.clear.preference(key: LiftedMenuSizeKey.self, value: $0.size) })
            .onPreferenceChange(LiftedMenuSizeKey.self) { size in
                if size != .zero { measuredCompactMenuSize = size }
            }
        case .scriptDoubleTap:
            MessageOptionsGlassMenu(
                sections: optionSections,
                accentHex: accentHex,
                maxHeight: maxHeight,
                onPrimary: { action in close { onPrimary(action) } },
                onMore: { item in close { onMore(item) } }
            )
        }
    }

    // MARK: - Glissé et fermeture

    private func clusterDragGesture(_ offset: GestureState<CGFloat>) -> some Gesture {
        DragGesture(minimumDistance: 12)
            .updating(offset) { value, state, _ in
                guard isVisible else { return }
                state = MessageOverlayDragLaw.displayOffset(for: value.translation.height)
            }
            .onChanged { value in
                guard isVisible,
                      MessageOverlayDragLaw.isArmed(translation: value.translation.height),
                      !dragHapticArmed else { return }
                dragHapticArmed = true
                HapticFeedback.medium()
            }
            .onEnded { value in
                defer { dragHapticArmed = false }
                guard isVisible else { return }
                switch MessageOverlayDragLaw.outcome(
                    translation: value.translation.height,
                    predicted: value.predictedEndTranslation.height
                ) {
                case .openMore:
                    close(then: onShowMore)
                case .dismiss:
                    close()
                case .snapBack:
                    break
                }
            }
    }

    private func close(then action: @escaping () -> Void = {}) {
        guard isVisible else { return }
        HapticFeedback.light()
        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
            isVisible = false
        }
        action()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.26) {
            isPresented = false
        }
    }
}

private struct LiftedStripSizeKey: PreferenceKey {
    static let defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        let next = nextValue()
        if next != .zero { value = next }
    }
}

private struct LiftedMenuSizeKey: PreferenceKey {
    static let defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        let next = nextValue()
        if next != .zero { value = next }
    }
}
```

Relectures avant de compiler :
- **Polices** : aucun `.system(size:)`, aucune police du tout (`FixedFontSizeGuardTests`).
- **Changements d'état** : aucun `.onChange` brut.
- **Rivière** : ni `RiverStreamHost` ni `RiverConversationHost(`, pas même en commentaire (`RiverScreenNotMountedTests`).
- **Clavier** : aucun texte `focusTrigger` (garde de P1 : un seul site dans l'unité de la conversation).

- [ ] **Étape 3c : L'écran sait quelle rangée remonter et monte l'overlay**

Créer `apps/ios/Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift` :

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Qui présente la rangée remontée (#5981, D2).** Loi pure : le drapeau
/// d'abord, puis le fournisseur du mode courant. `nil` ⇒ l'overlay actuel sert,
/// à l'identique.
enum LiftedOverlayPresentation {
    static func row(
        flagEnabled: Bool,
        link: LiftedRowProviderLink,
        messageId: String,
        mode: ConversationReadingMode
    ) -> LiftedMessageRow? {
        guard flagEnabled else { return nil }
        return link.liftedRow(for: messageId, mode: mode)
    }
}

extension ConversationView {

    /// La rangée à remonter pour ce message, lue au geste et relue après le
    /// recentrage. Le drapeau se lit ICI, jamais dans les fichiers de liste
    /// (`BetaFeaturesReadingModesIntegrationTests`).
    func liftedRowToPresent(for message: Message) -> LiftedMessageRow? {
        LiftedOverlayPresentation.row(
            flagEnabled: MeeshyFeatureFlags.isLiftedRowLongPressEnabled,
            link: overlayState.liftedRowLink,
            messageId: message.id,
            mode: readingModeController.mode
        )
    }

    /// **L'overlay de l'appui long remonté, ou `nil` pour laisser servir
    /// l'overlay actuel.** Érasé en `AnyView` à sa déclaration
    /// (`ConversationViewLayerErasureSourceGuardTests`) : son type ne remonte
    /// pas dans celui de `ConversationView.body`.
    func liftedOverlayContent(for message: Message) -> AnyView? {
        guard let row = overlayState.liftedRow, row.messageId == message.id else { return nil }
        let context = menuContext(for: message, isRiver: readingModeController.mode == .river)
        let router = messageActionRouter(for: message)
        return AnyView(
            LiftedMessageOverlay(
                row: row,
                style: overlayState.liftedStyle,
                accentHex: accentColor,
                compactActions: MessageActionResolver.primaryActions(context),
                optionSections: MessageActionResolver.allOptionSections(context),
                isPresented: $overlayState.showOverlayMenu,
                onReact: { emoji in viewModel.toggleReaction(messageId: message.id, emoji: emoji) },
                onExpandFullPicker: { overlayState.fullReactionPickerMessage = message },
                onPrimary: router.perform,
                onMore: router.performMore,
                onShowMore: {
                    overlayState.moreSheetInitialItem = nil
                    overlayState.detailSheetMessage = message
                }
            )
            .transition(.opacity)
            .zIndex(999)
        )
    }
}
```

- [ ] **Étape 3d : La présentation lit la rangée, la relit après recentrage, la vide à la fermeture**

Dans `apps/ios/Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift` (texte de la Tâche 4), remplacer :

```swift
    func continueLongPressPresentation(for message: Message, cellFrame: CGRect?, style: LongPressPresentationStyle) {
        guard LongPressPresentationPlan.shouldRecenter(
            cellFrame: cellFrame,
            windowHeight: DeviceLayout.windowSize.height,
            mode: readingModeController.mode
        ) else {
            overlayState.showOverlayMenu = true
            return
        }

        scrollState.scrollToMessageId = message.id
        scrollState.scrollToMessageTrigger += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.longPressRepositionDelay) {
            self.overlayState.showOverlayMenu = true
        }
    }
```

par :

```swift
    func continueLongPressPresentation(for message: Message, cellFrame: CGRect?, style: LongPressPresentationStyle) {
        let lifted = liftedRowToPresent(for: message)
        let cellFrame = lifted?.frameInWindow ?? cellFrame
        overlayState.liftedStyle = style
        guard LongPressPresentationPlan.shouldRecenter(
            cellFrame: cellFrame,
            windowHeight: DeviceLayout.windowSize.height,
            mode: readingModeController.mode
        ) else {
            overlayState.liftedRow = lifted
            overlayState.showOverlayMenu = true
            return
        }

        scrollState.scrollToMessageId = message.id
        scrollState.scrollToMessageTrigger += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.longPressRepositionDelay) {
            guard self.overlayState.overlayMessage?.id == message.id,
                  !self.overlayState.showOverlayMenu else { return }
            self.overlayState.liftedRow = lifted == nil ? nil : self.liftedRowToPresent(for: message)
            self.overlayState.showOverlayMenu = true
        }
    }
```

Trois effets :
- **Drapeau éteint** (`lifted == nil`) : même chemin qu'en Tâche 4, plus le jeton au terme du recentrage.
- **Rangée relue après recentrage et absente** : l'overlay actuel sert, par la règle « `nil` ⇒ repli ».
- **Ré-liaison de `cellFrame` sur le paramètre** : elle est vérifiée par `swiftc -typecheck -swift-version 6 -default-isolation MainActor`.

Puis, dans le même fichier, remplacer :

```swift
    func restoreStateAfterLongPressIfNeeded() {
        guard let saved = overlayState.restoreAfterLongPress else { return }
```

par :

```swift
    func restoreStateAfterLongPressIfNeeded() {
        overlayState.liftedRow = nil
        guard let saved = overlayState.restoreAfterLongPress else { return }
```

- [ ] **Étape 3e : `overlayMenuContent` essaie la rangée remontée, et `PreviewMedia` sort du fichier (D4)**

Dans `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`, remplacer :

```swift
    private var overlayMenuContent: AnyView {
        guard overlayState.showOverlayMenu, let msg = overlayState.overlayMessage else {
            return AnyView(EmptyView())
        }
        return AnyView(
```

par :

```swift
    private var overlayMenuContent: AnyView {
        guard overlayState.showOverlayMenu, let msg = overlayState.overlayMessage else {
            return AnyView(EmptyView())
        }
        if let lifted = liftedOverlayContent(for: msg) { return lifted }
        return AnyView(
```

Puis supprimer ces six lignes (ligne vide finale comprise) :

```swift
struct PreviewMedia: Identifiable {
    let id = UUID()
    let url: URL
    let type: String?
}

```

et créer `apps/ios/Meeshy/Features/Main/Views/PreviewMedia.swift` :

```swift
import Foundation

struct PreviewMedia: Identifiable {
    let id = UUID()
    let url: URL
    let type: String?
}
```

Preuve :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
diff <(git show HEAD:apps/ios/Meeshy/Features/Main/Views/ConversationView.swift | sed -n '/^struct PreviewMedia: Identifiable {$/,/^}$/p') \
     <(sed -n '/^struct PreviewMedia: Identifiable {$/,/^}$/p' apps/ios/Meeshy/Features/Main/Views/PreviewMedia.swift) && echo IDENTIQUE && \
git grep -n "struct PreviewMedia" -- apps/ios/Meeshy
```
Attendu :
- `IDENTIQUE` ;
- une seule déclaration, dans `PreviewMedia.swift`.

Repli : si `struct PreviewMedia` n'est plus dans `ConversationView.swift`, déplacer à l'identique `struct FocalShareFileItem` (deux lignes de doc-comment comprises, 7 lignes). Le fichier cible est `FocalShareFileItem.swift`, avec la même preuve `diff` sur le motif `/^\/\/\/ Lot 3.2 — enveloppe/,/^}$/`.

- [ ] **Étape 4 : Lancer les tests et constater le succès**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/LiftedOverlayPresentationTests \
  -only-testing:MeeshyTests/LiftedOverlayWiringSourceGuardTests \
  -only-testing:MeeshyTests/ConversationViewBodyTypeDepthTests \
  -only-testing:MeeshyTests/ConversationViewLayerErasureSourceGuardTests \
  -only-testing:MeeshyTests/ConversationLongPressMenuGuardTests \
  -only-testing:MeeshyTests/CallDetailRoutingTests \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/MessageOverlayDragLawTests \
  -only-testing:MeeshyTests/BetaFeaturesReadingModesIntegrationTests \
  -only-testing:MeeshyTests/RiverScreenNotMountedTests \
  -only-testing:MeeshyTests/FixedFontSizeGuardTests \
  -only-testing:MeeshyTests/FileSizeBudgetGuardTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -only-testing:MeeshyTests/LiftedRowProviderLinkTests \
  -only-testing:MeeshyTests/LiftedOverlayLayoutTests \
  -only-testing:MeeshyTests/MessageListLiftedRowTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-LiftedOverlayPresentationTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test|\[profondeur #5837\] LiftedMessageOverlay"
```
Attendu :
- les 4 tests de `LiftedOverlayPresentationTests` et les 6 de `LiftedOverlayWiringSourceGuardTests` passent ;
- `ConversationViewBodyTypeDepthTests` passe : la ligne `[profondeur #5837] LiftedMessageOverlay.body = N niveaux` est imprimée, avec `N ≤ 40`. Relever N pour le commit ;
- les gardes nommées restent vertes : `Executed M tests, with 0 failures`.

Si N dépasse 40, on ne pose pas un `AnyView` de plus. Le remède est d'extraire `strip` et `menu` en `struct View` nominales privées, dans le même fichier, sans rien changer à leur corps (mémoire #5837 : seule une frontière nominale coupe le type).

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift | tee /tmp/p3-t16-apres.txt && \
CV_AVANT=$(awk '/ConversationView.swift/{print $1}' /tmp/p3-t16-avant.txt) && CV_APRES=$(awk '/ConversationView.swift/{print $1}' /tmp/p3-t16-apres.txt) && \
OM_AVANT=$(awk '/MessageOverlayMenu.swift/{print $1}' /tmp/p3-t16-avant.txt) && OM_APRES=$(awk '/MessageOverlayMenu.swift/{print $1}' /tmp/p3-t16-apres.txt) && \
test "$CV_APRES" -le "$CV_AVANT" && test "$OM_APRES" -le "$OM_AVANT" && \
PROFONDEUR=$(grep -o '\[profondeur #5837\] LiftedMessageOverlay.body = [0-9]* niveaux' /tmp/meeshy-longpress-LiftedOverlayPresentationTests.log | head -1) && \
echo "pbxproj : $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources') -> $(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj) (attendu +8)" && \
git add apps/ios/Meeshy/Features/Main/Components/LiftedMessageOverlay.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/PreviewMedia.swift \
        apps/ios/Meeshy/Features/Main/Components/EmojiUsageTracker.swift \
        apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift \
        apps/ios/MeeshyTests/Unit/Views/ConversationViewBodyTypeDepthTests.swift \
        apps/ios/MeeshyTests/Unit/Views/LiftedOverlayPresentationTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -F - <<EOF
feat(ios): l'appui long montre la vraie rangée remontée, barre 2× et menu dessous (#5981)

Drapeau actif et rangée remise par le fournisseur du mode : LiftedMessageOverlay
pose la rangée de la cellule à son cadre, échelle 1, au-dessus du voile ; la
barre de réactions 2× entre au-dessus (sans fond à l'appui long, capsule à
cheval au double tap) ; dessous, la liste compacte ou toutes les options en
verre, placées par LiftedOverlayLayout. Voile, fermeture, MessageOverlayDragLaw,
modale VoiceOver et haptiques repris de l'overlay actuel ; une action ferme
d'abord puis s'exécute. La rangée est relue après recentrage, sous le jeton de
présentation, et vidée à chaque fermeture. Drapeau éteint ou rangée absente :
l'overlay actuel sert à l'identique.

Budget D4 (wc -l) :
- ConversationView.swift : ${CV_AVANT} -> ${CV_APRES} (overlayMenuContent +1, PreviewMedia relocalisé -6)
- MessageOverlayMenu.swift : ${OM_AVANT} -> ${OM_APRES} (liste d'emojis partagée -5)
${PROFONDEUR}

Refs #5981
Refs #5982

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
EOF
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```

---

### Tâche 17 : Au simulateur, Bulle, Focal et Script montrent le message tel qu'on le lit

**Fichiers :**
- Créer (hors dépôt) :
  - `/tmp/p3-sim.sh` : pilotage des simulateurs ;
  - `/tmp/p3-seed.sh` : messages de test.
- Captures : `/Users/smpceo/Documents/meeshy-longpress-captures/p3/<ios26|ios18>-<bulle|focal|script>-<cas>.png`, hors dépôt. Elles sont jointes par la Tâche 24.
- Aucun fichier du dépôt n'est modifié : pas de commit.

**Interfaces :**
- Consomme :
  - le comportement livré par les Tâches 12 à 16 ;
  - la clé `meeshy.flag.lifted_row_long_press` (Tâche 2) et `meeshy.pref.beta_features_enabled` (`BetaFeaturesPreference.userDefaultsKey`) ;
  - le bundle `me.meeshy.app` (`apps/ios/project.yml:168`) ;
  - les libellés d'accessibilité réels : « Nom d'utilisateur », « Mot de passe », « Se connecter », « Mode de lecture : %@ », « Bulles » / « Focal » / « Script », « Envoyer le message ».
- Produit : une capture nommée par case de la matrice §9.3, hors Rivière et double tap, soit 11 cas × 3 modes × 2 simulateurs = **66 captures**. Plus un compte rendu daté posé en commentaire de #5981 et #5982.

**Matrice** (même liste de cas dans chaque mode et sur chaque simulateur) :

| cas | geste | ce que la capture doit montrer |
|---|---|---|
| `texte-court` | appui long sur « LP-court » | la rangée du MODE (bulle en Bulle, rangée plate en Focal/Script), à sa taille, au cadre de sa cellule ; barre 2× sans fond au-dessus ; liste compacte dessous ; fond flouté et assombri |
| `texte-long` | appui long sur « LP-long » | rangée alignée sous la barre, liste compacte posée sur sa partie basse (règle 5) |
| `image` | appui long sur le message image | le rendu de la cellule (grille, rayon, légende), jamais l'aperçu plafonné à 200 pt |
| `video` | appui long sur le message vidéo | le lecteur de la cellule, jamais l'aperçu 16:9 reconstruit |
| `audio` | appui long sur le message vocal | la forme d'onde et la transcription de la cellule |
| `fichier` | appui long sur le message fichier | la carte fichier de la cellule |
| `effet` | appui long sur « LP-effet », capture immédiate | halo présent, aucun confetti rejoué sur la copie |
| `clavier-ouvert` | champ du composer touché, puis appui long sur « LP-court » | clavier baissé AVANT l'apparition du menu, rangée non recouverte |
| `clavier-rendu` | fermeture par glissé vers le bas, sans action | clavier relevé dans le composer |
| `bas-ecran` | appui long sur « LP-bas » (dernier message) | bloc remonté : menu entier au-dessus de la zone sûre basse |
| `drapeau-eteint` | drapeau à `NO`, appui long sur « LP-court » | l'overlay actuel, à l'identique (aperçu reconstruit, capsule de réactions) |

- [ ] **Étape 1 : Écrire l'outillage et le témoin de complétude**

Créer `/tmp/p3-sim.sh` :

```bash
#!/usr/bin/env bash
set -euo pipefail

APP=/Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd/Build/Products/Debug-iphonesimulator/Meeshy.app
BUNDLE=me.meeshy.app
SKILL="$HOME/.claude/skills/ios-simulator/scripts"
SHOTS=/Users/smpceo/Documents/meeshy-longpress-captures/p3

sim_id() {
  xcrun simctl list devices | grep -m1 "$1 (" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}'
}

# Centre de l'élément dont le libellé d'accessibilité CONTIENT (mode contains) ou
# VAUT (mode exact) le texte. Réessaie : l'arbre se remplit après l'animation.
center_of() {
  local udid=$1 needle=$2 match=${3:-contains} attempt
  for attempt in 1 2 3 4 5 6 7 8; do
    if idb ui describe-all --udid "$udid" --json | python3 -c '
import json, sys
needle, match = sys.argv[1], sys.argv[2]
for element in json.load(sys.stdin):
    label = element.get("AXLabel") or ""
    if (label == needle) if match == "exact" else (needle in label):
        frame = element["frame"]
        print(int(frame["x"] + frame["width"] / 2), int(frame["y"] + frame["height"] / 2))
        sys.exit(0)
sys.exit(1)
' "$needle" "$match"; then return 0; fi
  done
  echo "introuvable dans l'arbre d'accessibilité : $needle" >&2
  return 1
}

expected_captures() {
  local prefix mode cas
  for prefix in ios26 ios18; do
    for mode in bulle focal script; do
      for cas in texte-court texte-long image video audio fichier effet clavier-ouvert clavier-rendu bas-ecran drapeau-eteint; do
        echo "$prefix-$mode-$cas"
      done
    done
  done
}

cmd=${1:?commande}; shift
case "$cmd" in
  prepare)
    for name in Meeshy-LongPress Meeshy-LongPress-18; do
      udid=$(sim_id "$name")
      xcrun simctl boot "$udid" 2>/dev/null || true
      xcrun simctl bootstatus "$udid" -b >/dev/null
      xcrun simctl install "$udid" "$APP"
      xcrun simctl spawn "$udid" defaults write "$BUNDLE" meeshy.pref.beta_features_enabled -bool YES
      xcrun simctl spawn "$udid" defaults write "$BUNDLE" meeshy.flag.lifted_row_long_press -bool YES
      xcrun simctl launch --terminate-running-process "$udid" "$BUNDLE" >/dev/null
      echo "$name $udid prêt"
    done
    open -a Simulator ;;
  flag)
    udid=$(sim_id "$1")
    if [ "$2" = on ]; then value=YES; else value=NO; fi
    xcrun simctl spawn "$udid" defaults write "$BUNDLE" meeshy.flag.lifted_row_long_press -bool "$value"
    xcrun simctl launch --terminate-running-process "$udid" "$BUNDLE" >/dev/null
    echo "drapeau $value sur $1" ;;
  login)
    udid=$(sim_id "$1")
    set -a; source /Users/smpceo/Documents/v2_meeshy/apps/ios/fastlane/.env; set +a
    read -r x y < <(center_of "$udid" "Nom d'utilisateur" exact); idb ui tap --udid "$udid" "$x" "$y"
    idb ui text --udid "$udid" "$DEMO_USER"
    read -r x y < <(center_of "$udid" "Mot de passe" exact); idb ui tap --udid "$udid" "$x" "$y"
    idb ui text --udid "$udid" "$DEMO_PASSWORD"
    read -r x y < <(center_of "$udid" "Se connecter" exact); idb ui tap --udid "$udid" "$x" "$y"
    echo "connexion envoyée sur $1" ;;
  tap)
    udid=$(sim_id "$1"); read -r x y < <(center_of "$udid" "$2" "${3:-contains}")
    idb ui tap --udid "$udid" "$x" "$y" ;;
  press)
    udid=$(sim_id "$1"); read -r x y < <(center_of "$udid" "$2" "${3:-contains}")
    idb ui tap --udid "$udid" --duration 0.8 "$x" "$y" ;;
  mode)
    udid=$(sim_id "$1")
    read -r x y < <(center_of "$udid" "Mode de lecture"); idb ui tap --udid "$udid" --duration 0.8 "$x" "$y"
    read -r x y < <(center_of "$udid" "$2" exact); idb ui tap --udid "$udid" "$x" "$y"
    center_of "$udid" "Mode de lecture : $2" exact >/dev/null && echo "mode $2 actif sur $1" ;;
  focus-composer)
    udid=$(sim_id "$1"); python3 "$SKILL/navigator.py" --udid "$udid" --find-type TextField --tap ;;
  dismiss)
    udid=$(sim_id "$1"); idb ui swipe --udid "$udid" --duration 0.25 200 260 200 480 ;;
  labels)
    udid=$(sim_id "$1")
    idb ui describe-all --udid "$udid" --json | python3 -c '
import json, sys
for element in json.load(sys.stdin):
    label = element.get("AXLabel")
    if label:
        print(element["type"], "|", label[:90])' ;;
  shot)
    udid=$(sim_id "$1"); mkdir -p "$SHOTS"
    xcrun simctl io "$udid" screenshot "$SHOTS/$2.png" >/dev/null
    echo "$SHOTS/$2.png" ;;
  check-matrix)
    missing=0
    while read -r name; do
      if [ ! -s "$SHOTS/$name.png" ]; then echo "MANQUE $name"; missing=$((missing + 1)); fi
    done < <(expected_captures)
    echo "captures manquantes : $missing / 66"
    [ "$missing" -eq 0 ] ;;
  *) echo "commande inconnue : $cmd" >&2; exit 2 ;;
esac
```

Créer `/tmp/p3-seed.sh`, qui sème les textes par l'API de l'environnement que l'app interroge. Les identifiants ne sont jamais affichés :

```bash
#!/usr/bin/env bash
set -euo pipefail
set -a; source /Users/smpceo/Documents/v2_meeshy/apps/ios/fastlane/.env; set +a

UDID=$(xcrun simctl list devices | grep -m1 "Meeshy-LongPress (" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}')
HOST=$(xcrun simctl spawn "$UDID" defaults read me.meeshy.app meeshy_selected_environment 2>/dev/null || echo gate.meeshy.me)
API="https://$HOST/api/v1"
echo "environnement interrogé : $HOST"

TOKEN=$(python3 -c 'import json, os; print(json.dumps({"username": os.environ["DEMO_USER"], "password": os.environ["DEMO_PASSWORD"]}))' \
  | curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' --data @- \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["data"]["token"])')

CONV=$(curl -sf "$API/conversations?limit=50" -H "Authorization: Bearer $TOKEN" | python3 -c '
import json, sys
data = json.load(sys.stdin)["data"]
items = data if isinstance(data, list) else data.get("conversations", [])
tests = [c for c in items if (c.get("title") or c.get("name") or "").lower().startswith("test")]
if len(tests) != 1:
    sys.exit("ARRÊT — %d conversation(s) dont le titre commence par « test » : il en faut exactement une. On n écrit jamais dans la conversation d un tiers." % len(tests))
print(tests[0]["id"])
')
echo "conversation de test : $CONV"

send() {
  python3 -c 'import json, sys; print(json.dumps(json.loads(sys.argv[1])))' "$1" \
    | curl -sf -X POST "$API/conversations/$CONV/messages" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data @- >/dev/null
  echo "envoyé : $(printf '%s' "$1" | cut -c1-60)"
}

send '{"content":"LP-court : on se voit demain ?","originalLanguage":"fr"}'
send "$(python3 -c 'import json; print(json.dumps({"content": " ".join("LP-long ligne %d, un message plus haut que l’écran." % i for i in range(1, 61)), "originalLanguage": "fr"}))')"
send '{"content":"LP-effet : confettis et halo","originalLanguage":"fr","effectFlags":67584}'
send '{"content":"LP-bas : dernier message du fil","originalLanguage":"fr"}'
```

`effectFlags` 67584 = confettis (`1 << 11`, 2048) + halo (`1 << 16`, 65536) : bits de `MessageEffectFlags`.

- [ ] **Étape 2 : Lancer le témoin et constater l'échec**

Commande :
```bash
chmod +x /tmp/p3-sim.sh /tmp/p3-seed.sh && bash /tmp/p3-sim.sh check-matrix
```
Attendu : ÉCHEC (code de sortie 1), 66 lignes `MANQUE …`, puis `captures manquantes : 66 / 66`.

- [ ] **Étape 3a : Construire, installer, allumer bêta et drapeau, se connecter**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild build -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-build-t17.log | grep -E "error:|\*\* BUILD (SUCCEEDED|FAILED) \*\*" && \
bash /tmp/p3-sim.sh prepare
```
Attendu :
- `** BUILD SUCCEEDED **` ;
- `Meeshy-LongPress <udid> prêt` ;
- `Meeshy-LongPress-18 <udid> prêt`.

Le même `Meeshy.app` (cible iOS 16) s'installe sur les deux runtimes.

Puis, pour chacun des deux simulateurs :
```bash
bash /tmp/p3-sim.sh labels Meeshy-LongPress | grep -E "Nom d'utilisateur|Mot de passe|Se connecter" && bash /tmp/p3-sim.sh login Meeshy-LongPress
bash /tmp/p3-sim.sh labels Meeshy-LongPress-18 | grep -E "Nom d'utilisateur|Mot de passe|Se connecter" && bash /tmp/p3-sim.sh login Meeshy-LongPress-18
```
Attendu : `connexion envoyée sur …`, puis la liste des conversations à l'écran (`labels` ne montre plus « Se connecter »).

Si l'écran propose « Comptes sauvegardés » au lieu des champs, taper d'abord « Autre compte » : `bash /tmp/p3-sim.sh tap <sim> "Autre compte" exact`.

Vérifier la cible produit, sur chaque simulateur :
```bash
bash /tmp/p3-sim.sh labels Meeshy-LongPress | grep -c . ; xcrun simctl spawn "$(xcrun simctl list devices | grep -m1 'Meeshy-LongPress (' | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}')" defaults read me.meeshy.app meeshy.flag.lifted_row_long_press
```
Attendu :
- plus d'un nœud d'accessibilité (app native, pas une vue web unique) ;
- `1`.

- [ ] **Étape 3b : Semer les messages de test**

> ⚠️ **Porte du porteur : rien ne part vers un serveur sans accord explicite.**
> - `p3-seed.sh` et les envois manuels publient de vrais messages sur l'environnement que l'app interroge, la production par défaut.
> - Avant cette étape, demander au porteur dans la session : « Puis-je envoyer ces messages de test dans la conversation « <titre> » sur <hôte> ? ».
> - Sans accord : ne rien envoyer, capturer sur les messages déjà présents, et marquer `non vérifié (envoi non autorisé)` chaque cas sans message adéquat.

Médias d'abord, par l'app, sur `Meeshy-LongPress`, dans la conversation de test (celle dont le titre commence par « test ») :
```bash
UDID=$(xcrun simctl list devices | grep -m1 "Meeshy-LongPress (" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}') && \
xcrun simctl io "$UDID" screenshot /tmp/lp-image.png && xcrun simctl addmedia "$UDID" /tmp/lp-image.png && \
printf 'LP-fichier : document de test\n' > /tmp/lp-fichier.txt && cupsfilter -m application/pdf /tmp/lp-fichier.txt > /tmp/lp-fichier.pdf 2>/dev/null && head -c 5 /tmp/lp-fichier.pdf && ls -l /tmp/lp-image.png /tmp/lp-fichier.pdf
```

Vidéo : lancer en arrière-plan `xcrun simctl io <UDID> recordVideo --codec=h264 --force /tmp/lp-video.mp4`, l'arrêter après environ 4 s par `pkill -INT -f "recordVideo"`, puis `xcrun simctl addmedia <UDID> /tmp/lp-video.mp4`.

Étapes manuelles dans l'app, chacune suivie de « Envoyer le message » :
1. pièce jointe → Photos → la capture ;
2. pièce jointe → Photos → la vidéo ;
3. micro maintenu 3 s ;
4. glisser `/tmp/lp-fichier.pdf` depuis le Finder sur la fenêtre du simulateur (il rejoint Fichiers), puis pièce jointe → Fichiers → `lp-fichier.pdf`.

Puis les textes, par l'API :
```bash
bash /tmp/p3-seed.sh
```
Attendu :
- `environnement interrogé : …` ;
- `conversation de test : <id>` ;
- quatre lignes `envoyé : …`.

Une ligne `ARRÊT — …` : ne pas contourner. Créer ou renommer UNE conversation de test avec le porteur, puis relancer.

- [ ] **Étape 3c : Captures sur `Meeshy-LongPress` (iOS 26), dans chaque mode**

Ouvrir la conversation de test : `bash /tmp/p3-sim.sh tap Meeshy-LongPress "<titre exact de la conversation de test>"`.

Puis, pour `MODE` valant `Bulles`, puis `Focal`, puis `Script`, avec `M` valant `bulle`, `focal`, `script`, lancer ce bloc en remplaçant `MODE` et `M` à la main :

```bash
S=Meeshy-LongPress; P=ios26; MODE=Bulles; M=bulle
bash /tmp/p3-sim.sh mode $S $MODE
bash /tmp/p3-sim.sh press $S "LP-court"  && bash /tmp/p3-sim.sh shot $S $P-$M-texte-court  && bash /tmp/p3-sim.sh dismiss $S
bash /tmp/p3-sim.sh press $S "LP-long"   && bash /tmp/p3-sim.sh shot $S $P-$M-texte-long   && bash /tmp/p3-sim.sh dismiss $S
bash /tmp/p3-sim.sh press $S "LP-effet"  && bash /tmp/p3-sim.sh shot $S $P-$M-effet        && bash /tmp/p3-sim.sh dismiss $S
bash /tmp/p3-sim.sh press $S "LP-bas"    && bash /tmp/p3-sim.sh shot $S $P-$M-bas-ecran    && bash /tmp/p3-sim.sh dismiss $S
bash /tmp/p3-sim.sh focus-composer $S && bash /tmp/p3-sim.sh press $S "LP-court" && bash /tmp/p3-sim.sh shot $S $P-$M-clavier-ouvert && \
  bash /tmp/p3-sim.sh dismiss $S && bash /tmp/p3-sim.sh shot $S $P-$M-clavier-rendu
bash /tmp/p3-sim.sh labels $S | grep -iE "image|photo|vidéo|video|audio|vocal|fichier|pdf"
```

La dernière ligne rend le libellé exact de chaque message média. Pour chacun, lancer `press` avec un fragment de ce libellé, puis `shot` sous le nom `$P-$M-image`, `$P-$M-video`, `$P-$M-audio` ou `$P-$M-fichier`, puis `dismiss`.

Si un message à atteindre n'est pas à l'écran, faire défiler par `python3 ~/.claude/skills/ios-simulator/scripts/gesture.py --udid <UDID> --scroll up`. Si un appui long ouvre le menu d'un autre message, relire `labels` : le fragment était ambigu.

Drapeau éteint, une fois par mode :
```bash
S=Meeshy-LongPress; P=ios26; MODE=Bulles; M=bulle
bash /tmp/p3-sim.sh flag $S off && bash /tmp/p3-sim.sh tap $S "<titre exact de la conversation de test>" && bash /tmp/p3-sim.sh mode $S $MODE && \
bash /tmp/p3-sim.sh press $S "LP-court" && bash /tmp/p3-sim.sh shot $S $P-$M-drapeau-eteint && bash /tmp/p3-sim.sh dismiss $S && \
bash /tmp/p3-sim.sh flag $S on && bash /tmp/p3-sim.sh tap $S "<titre exact de la conversation de test>"
```

Relire chaque capture (outil Read sur le PNG) contre la colonne « ce que la capture doit montrer » de la matrice. Une capture qui ne le montre pas est un DÉFAUT à corriger dans la tâche concernée, pas une case cochée.

- [ ] **Étape 3d : Mêmes captures sur `Meeshy-LongPress-18` (iOS 18)**

Rejouer l'Étape 3c à l'identique, avec `S=Meeshy-LongPress-18; P=ios18`. Sur iOS 18, le menu compact est en matière (pas de verre) : c'est attendu.

- [ ] **Étape 3d bis : Clair et sombre (spec §8)**

```bash
UDID=$(xcrun simctl list devices | grep -m1 "Meeshy-LongPress (" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}') && xcrun simctl ui "$UDID" appearance dark
```
Puis, pour chaque couple (`MODE`, `M`) : (`Bulles`, `bulle`), (`Focal`, `focal`), (`Script`, `script`) :
```bash
S=Meeshy-LongPress; P=ios26; MODE=Bulles; M=bulle
bash /tmp/p3-sim.sh mode $S $MODE && bash /tmp/p3-sim.sh press $S "LP-court" && bash /tmp/p3-sim.sh shot $S $P-$M-texte-court-sombre && bash /tmp/p3-sim.sh dismiss $S
```
Relire chaque capture : la barre sans fond reste lisible sur le voile sombre, et la rangée est identique à celle de la cellule.

Ensuite :
```bash
UDID=$(xcrun simctl list devices | grep -m1 "Meeshy-LongPress (" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}') && xcrun simctl ui "$UDID" appearance light
```
Ces trois captures s'ajoutent aux 66, hors `check-matrix`.

- [ ] **Étape 3e : Les mesures ouvertes de la spec (§9.3, points 4 et 5), sur iOS 26**

Chaque mesure se consigne dans le compte rendu. Une capture d'appui est prise sous le nom `ios26-mesure-<n>`.

1. **Pose Focal** : en Focal, faire défiler puis relâcher. Appui long sur le message au centre dès l'arrêt : la copie est à plat, à sa taille, même si la cellule était en pose.
2. **Vidéo en lecture** : lancer la vidéo de test, puis appui long. Noter si la copie repart de sa vignette (limite assumée, D1).
3. **Image hors cache** : quitter et rouvrir la conversation, puis appui long immédiat sur l'image. Noter un éventuel flash de vignette.
4. **Média flouté déjà révélé** (envoi soumis à la même porte que l'Étape 3b) : envoyer depuis le composer une image floutée, la révéler, puis appui long. Noter si la copie reparaît floutée.

- [ ] **Étape 4 : Relancer le témoin et constater le succès**

Commande :
```bash
bash /tmp/p3-sim.sh check-matrix && ls /Users/smpceo/Documents/meeshy-longpress-captures/p3 | grep -c 'mesure'
```
Attendu :
- aucune ligne `MANQUE` ;
- `captures manquantes : 0 / 66`, code de sortie 0 ;
- au moins `4` captures de mesure.

Chaque capture a été relue à l'Étape 3c ou 3d.

- [ ] **Étape 5 : Consigner le compte rendu (pas de commit : aucun fichier du dépôt n'est touché)**

Écrire `/tmp/p3-t17-compte-rendu.md` : date du jour, révision (`git -C /Users/smpceo/Documents/v2_meeshy-longpress rev-parse --short HEAD`), dossier des captures, puis la matrice.
- Une ligne par cas.
- Colonnes `ios26-bulle … ios18-script`, chaque cellule `✓` ou `✗ <défaut observé>`.
- Ensuite, les quatre mesures de l'Étape 3e.

Puis :
```bash
gh issue comment 5981 --repo isopen-io/meeshy --body-file /tmp/p3-t17-compte-rendu.md && \
gh issue comment 5982 --repo isopen-io/meeshy --body-file /tmp/p3-t17-compte-rendu.md
```

**Critère de fin de la Tâche 17** :
- les 66 captures existent et montrent chacune ce que dit la matrice ;
- chaque `✗` est corrigé dans sa tâche (ou fait l'objet d'une issue ouverte dans le milestone #89) avant de passer à la Partie P4 ;
- les issues restent ouvertes (`Refs`), et leur clôture appartient à la Tâche 24.

---

## Partie P4 — La Rivière rejoint l'overlay commun, le double tap Script ouvre toutes les options (Tâches 18 à 23)

- **Issues** : #5983 (Rivière), #5984 (double tap Script). Commits : `Refs #n`, jamais `Closes` (Tâche 24).
- **Spec** : `docs/superpowers/specs/2026-09-10-appui-long-rendu-du-mode-design.md` §2.2, §2.4, D1, D5, D6, §4, §5.1, §5.2, §8, §9.
- **Numéros de ligne** : relevés sur `e8f28f7f5f`. Les Tâches 1 à 17 les décalent (la Tâche 1 retire à elle seule ~56 lignes de `ConversationView.swift`) : **se fier à l'ancre citée, jamais au numéro**. Chaque bloc « Remplacer » cite le texte exact à retrouver ; s'il est introuvable, s'arrêter et relire le fichier (une tâche antérieure l'a changé).
- **Shell** : le répertoire et les variables ne persistent pas entre deux appels. Chaque bloc commence par `cd /Users/smpceo/Documents/v2_meeshy-longpress && …` et recalcule `SIM`.

> ⚠️ **Écart au contrat 1 — le fournisseur Rivière est tenu et inscrit par `RiverConversationHost`, pas par `ConversationView`.**
> Contrat : « `RiverStreamHost` et `RiverConversationHost` reçoivent `liftedRowProvider` […] `ConversationView` enregistre le fournisseur sous `.river` ».
> Plan : `RiverConversationHost` possède `@State private var liftedRowProvider = RiverLiftedRowProvider()` et l'inscrit par `.onAppear { liftedRowLink?.register(liftedRowProvider, for: .river) }`. Il reçoit `liftedRowLink: LiftedRowProviderLink?` au lieu du fournisseur. `RiverStreamHost` reçoit bien `liftedRowProvider`, comme le contrat le prévoit. `ConversationView` passe `liftedRowLink: overlayState.liftedRowLink`.
> Raisons :
> 1. le lien est FAIBLE : il faut un propriétaire dont la vie est celle du pane Rivière, et `@State` la donne exactement ;
> 2. c'est le miroir de la Tâche 14, où la liste inscrit elle-même son contrôleur ;
> 3. tenu par `ConversationView` ou `ConversationOverlayState`, le fournisseur survivrait au pane et retiendrait les contenus de la Rivière après qu'on a quitté le mode (dimension 3) ;
> 4. `ConversationView.swift` gagne une ligne au lieu d'un `@State` et d'une inscription (D4).

> ⚠️ **Écart au contrat 2 — `RiverStreamHost` reçoit aussi `paneOriginInWindow: CGPoint`.**
> L'origine du pane dans la fenêtre est lue dans le `GeometryReader` qui existe déjà dans `RiverConversationHost.body` (`proxy.frame(in: .global).origin`). Aucune mesure neuve n'est déclarée dans `Riviere/View/`.

> ⚠️ **Écart au contrat 3 — les actions VoiceOver passent par `.accessibilityActions { Button … }`, pas par trois `.accessibilityAction(named:)`.**
> Une fermeture absente (`onOpenInThread == nil`) ne crée alors aucune action inerte (loi 4). Les libellés viennent de `MessageOptionLabels.label(_:)` (Tâche 7) : un seul vocabulaire. Même forme pour l'action « Toutes les options » du double tap.

> ⚠️ **Écart au contrat 4 — ajouts purs autour de `RiverBubblePresentation`.**
> - L'énumération est déclarée `nonisolated enum RiverBubblePresentation: Equatable { case inStream, lifted }` : même nom, mêmes cas. `nonisolated` suit `RiverGroupPosition` et laisse la loi pure la lire.
> - Deux types s'ajoutent dans `RiverBubbleView.swift` : la loi `RiverBubbleInteraction` et `RiverBubbleGesture`. Ils rendent « quel geste pour quelle présentation » testable sans monter la vue.

> ⚠️ **Écart au contrat 5 — `ScriptMessageDoubleTap` pose `.gesture(TapGesture(count: 2)…, including: isEnabled ? .all : .subviews)`, pas `onTapGesture(count: 2)` + `guard isEnabled`.**
> - Même identité stable que le patron `QuickReactionDoubleTap`.
> - Éteint, aucun reconnaisseur de double tap n'est actif. « Drapeau éteint : rien » tient au geste près, en Focal comme en Script.
> - Les gestes des zones internes (`.subviews`) restent intacts.

> ⚠️ **Écart au contrat 6 — le double tap se pose par `scriptDoubleTap(for:isLiftedCopy:)`, et le drapeau arrive par la PRÉSENCE du rappel.**
> - C'est une méthode d'extension de `MessageListViewController`, dans le fichier neuf `MessageListViewController+ScriptDoubleTap.swift`.
> - Elle tire `messageId` et `kind` de `EquatableFocalRow.row.input.content` : le câblage ne dépend pas des paramètres que P3 fixe pour `makeRowContent`, sauf `forLiftedCopy`, nommé par le contrat.
> - L'ancre `focalRow.equatable()` reste dans le texte.
> - **Le contrôleur ne lit aucun drapeau** (contrainte P1, garde `BetaFeaturesReadingModesIntegrationTests` : ni `MessageListViewController.swift` ni `MessageListView.swift` ne mentionnent `MeeshyFeatureFlags`, commentaires compris). `ConversationView` pose `onScriptDoubleTap: scriptDoubleTapHandler`, qui vaut `nil` drapeau éteint ; le contrôleur appelle `ScriptDoubleTapEligibility.accepts(mode:kind:flag: onScriptDoubleTap != nil)`. Même principe qu'en Rivière (`onLongPress == nil` ⇒ `.contextMenu`). Le gestionnaire relit le drapeau au geste.

**Contraintes P1 respectées par cette partie** :
- aucun `composerState.focusTrigger = true` : le clavier ne se relève que par `raiseComposerKeyboardIfMounted()`, et aucune tâche de P4 n'en a besoin ;
- `continueLongPressPresentation` n'est pas touchée : sa loi `LongPressPresentationPlan.shouldRecenter` rend déjà `false` en Rivière, et `overlayState.showOverlayMenu = true` y reste.

**Précisions (conformes au contrat)** :
- `onScriptDoubleTap` est déclaré dans `MessageListView` juste après `onAddReaction`, jamais après `onLongPress`. Ainsi l'ordre memberwise ne croise pas `liftedRowLink`, ajouté par la Tâche 14.
- Les fichiers des Tâches 21 et 22 vivent dans `apps/ios/Meeshy/Features/Main/Focal/Gestures/` (dossier neuf). Quatre gardes balaient `Focal/Row/` (`FocalVoiceOverParityTests`, `FocalDynamicTypeTests`, `FocalRealtimeMatrixTests`, `FocalPaletteContrastTests`) ; `FocalNoBubbleSourceGuardTests` balaie tout `Focal/` et n'interdit rien de ce que ces fichiers contiennent.
- `RiverScreenNotMountedTests` lit le texte BRUT (commentaires compris) de tout fichier hors `Riviere/`. Les fichiers neufs sous `Views/` ne doivent contenir ni le mot `RiverStreamHost`, ni `RiverConversationHost(` — y compris dans un commentaire.

## Commandes simulateur communes (S0 à S11)

Utilisées par les Tâches 20 et 23. Chaque bloc est autonome (le shell ne garde rien).

**S0 — Espace disque.** Mesuré à 2,8 Gio libres le 2026-09-10 (disque à 100 %).
```bash
df -h /System/Volumes/Data | tail -1
```
Attendu : au moins 5 Gi dans la colonne « Avail ». Sinon **s'arrêter** et prévenir le porteur. Ne supprimer aucun DerivedData ni simulateur d'une autre session (`Meeshy Ref-Native`, `Meeshy Poc-Web-V31` sont démarrés par d'autres sessions).

**S1 — Construire l'app** (le même `.app` sert iOS 26 et iOS 18 : cible 16.0).
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild build -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-build.log | grep -E "error:|\*\* BUILD (SUCCEEDED|FAILED) \*\*"
```
Attendu : `** BUILD SUCCEEDED **`. Lire le code de sortie AVEC le journal : un `grep` vide sur un échec ne prouve rien.

**S2 — Identifiant du simulateur** (première ligne de chaque bloc suivant) :
```bash
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress \(/{print $2; exit}')      # iOS 26.1
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress-18 \(/{print $2; exit}')   # iOS 18.2
```
Le motif `Meeshy-LongPress \(` (espace avant la parenthèse) n'attrape pas `Meeshy-LongPress-18`. Vérifier `echo "$SIM"` : 36 caractères.

**S3 — Préparer le simulateur** (français, pour lire les libellés `defaultValue`) :
```bash
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress \(/{print $2; exit}') && \
xcrun simctl boot "$SIM" 2>/dev/null; \
xcrun simctl spawn "$SIM" defaults write -g AppleLanguages -array fr-FR && \
xcrun simctl spawn "$SIM" defaults write -g AppleLocale -string fr_FR && \
xcrun simctl shutdown "$SIM" && xcrun simctl boot "$SIM" && open -a Simulator
```

**S4 — Installer, allumer la bêta, lancer.**
- Le drapeau suit la bêta (étage 3) : la clé propre est effacée.
- L'app pointe la PRODUCTION par défaut (`MeeshyConfig.selectedEnvironment`) : **ne rien envoyer**. La vérification ne lit que des conversations existantes et n'envoie aucun message.
```bash
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress \(/{print $2; exit}') && \
APP=/Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd/Build/Products/Debug-iphonesimulator/Meeshy.app && \
xcrun simctl install "$SIM" "$APP" && \
xcrun simctl terminate "$SIM" me.meeshy.app 2>/dev/null; \
xcrun simctl spawn "$SIM" defaults write me.meeshy.app meeshy.pref.beta_features_enabled -bool YES && \
xcrun simctl spawn "$SIM" defaults delete me.meeshy.app meeshy.flag.lifted_row_long_press 2>/dev/null; \
xcrun simctl launch "$SIM" me.meeshy.app && \
xcrun simctl get_app_container "$SIM" me.meeshy.app
```
Attendu : le chemin rendu finit par `/Meeshy.app`. `me.meeshy.app` est partagé avec la coque web-v3 : un autre chemin veut dire que ce n'est pas l'app native.

**S5 — Connexion.** Les identifiants sont extraits sans jamais être affichés ; `onSubmit { attemptLogin() }` valide sur Retour (HID 40).
```bash
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress \(/{print $2; exit}') && \
ENVF=/Users/smpceo/Documents/v2_meeshy/apps/ios/fastlane/.env && \
U=$(grep '^DEMO_USER=' "$ENVF" | head -1 | cut -d= -f2- | tr -d "\"'") && \
P=$(grep '^DEMO_PASSWORD=' "$ENVF" | head -1 | cut -d= -f2- | tr -d "\"'") && \
idb ui describe-all --udid "$SIM" | python3 -c "
import sys,json
for e in json.load(sys.stdin):
    if e.get('type') in ('TextField','SecureTextField'):
        f=e['frame']; print(e['type'], round(f['x']+f['width']/2), round(f['y']+f['height']/2))"
```
Puis, avec les centres relevés (`XU YU` pour `TextField`, `XP YP` pour `SecureTextField`) :
```bash
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress \(/{print $2; exit}') && \
ENVF=/Users/smpceo/Documents/v2_meeshy/apps/ios/fastlane/.env && \
U=$(grep '^DEMO_USER=' "$ENVF" | head -1 | cut -d= -f2- | tr -d "\"'") && \
P=$(grep '^DEMO_PASSWORD=' "$ENVF" | head -1 | cut -d= -f2- | tr -d "\"'") && \
idb ui tap XU YU --udid "$SIM" && idb ui text "$U" --udid "$SIM" && \
idb ui tap XP YP --udid "$SIM" && idb ui text "$P" --udid "$SIM" && \
idb ui key 40 --udid "$SIM" && echo "connexion envoyée"
```
- Ne jamais ajouter `echo "$U"`, `echo "$P"` ni `set -x`.
- Si un écran d'accueil précède le formulaire, S6 puis toucher l'entrée de connexion qu'il liste.

**S6 — Relevé d'écran** (centre `x y`, type, libellé ; c'est lui qui donne toutes les coordonnées) :
```bash
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress \(/{print $2; exit}') && \
idb ui describe-all --udid "$SIM" | python3 -c "
import sys,json
for e in json.load(sys.stdin):
    l=(e.get('AXLabel') or '').strip()
    if l:
        f=e['frame']; print(round(f['x']+f['width']/2), round(f['y']+f['height']/2), e.get('type'), e.get('enabled'), l[:80])"
```
Un relevé qui rend UN seul nœud décrit une WKWebView (la coque) : refaire S4.

**S7 — Gestes** (`X Y` venus de S6 ; toujours `--udid`, deux autres simulateurs sont démarrés) :
```bash
idb ui tap X Y --udid "$SIM"                                            # tap
idb ui tap X Y --duration 0.8 --udid "$SIM"                             # appui long
(idb ui tap X Y --udid "$SIM" & sleep 0.12; idb ui tap X Y --udid "$SIM"; wait)   # double tap
python3 ~/.claude/skills/ios-simulator/scripts/gesture.py --swipe-from X1,Y1 --swipe-to X2,Y2 --udid "$SIM"
```
- Deux processus `idb` n'ont pas une latence garantie : le double tap se tente **trois fois**.
- Faute d'overlay au troisième essai, **étape manuelle explicite** : dans la fenêtre Simulator, double-cliquer au trackpad sur le même point (le Simulator traduit un double clic en double tap). La capture S8 suit.
- Consigner dans le compte rendu lequel des deux chemins a servi.

**S8 — Capture** :
```bash
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress \(/{print $2; exit}') && \
CAP=/Users/smpceo/Documents/meeshy-longpress-captures/riviere-ios26 && mkdir -p "$CAP" && \
xcrun simctl io "$SIM" screenshot "$CAP/<nom>.png"
```
- Dossier hors dépôt : les captures ne se committent pas.
- Sous-dossiers : `riviere-ios26`, `riviere-ios18`, `script-ios26`, `script-ios18`.
- Pour une capture pendant une animation, lancer S8 environ une seconde après le geste.

**S9 — Actions VoiceOver.** D'abord prouver que la clé existe (leçon `idb` : l'indice est sous `help`, les actions sous `custom_actions`) :
```bash
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress \(/{print $2; exit}') && \
idb ui describe-all --udid "$SIM" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(sorted(d[0].keys()))
print('avec custom_actions:', len([e for e in d if e.get('custom_actions')]))
for e in d:
    if e.get('custom_actions'): print((e.get('AXLabel') or '')[:70], '->', e['custom_actions'])"
```
Un compte nul sur toute la page signifie que l'on lit la mauvaise clé, pas qu'aucune action n'existe.

**S10 — Drapeau.** Éteindre, puis rallumer : la clé est effacée, la bêta reprend la main.
```bash
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress \(/{print $2; exit}') && \
xcrun simctl terminate "$SIM" me.meeshy.app 2>/dev/null; \
xcrun simctl spawn "$SIM" defaults write me.meeshy.app meeshy.flag.lifted_row_long_press -bool NO && \
xcrun simctl launch "$SIM" me.meeshy.app
```
```bash
SIM=$(xcrun simctl list devices | awk -F '[()]' '/Meeshy-LongPress \(/{print $2; exit}') && \
xcrun simctl terminate "$SIM" me.meeshy.app 2>/dev/null; \
xcrun simctl spawn "$SIM" defaults delete me.meeshy.app meeshy.flag.lifted_row_long_press; \
xcrun simctl launch "$SIM" me.meeshy.app
```

**S11 — Choisir un mode de lecture** dans une conversation ouverte :
1. S6 : repérer le chip dont le libellé commence par « Mode de lecture : » (`ReadingModeChip`).
2. S7 appui long sur ce chip. Un tap ferait défiler les modes au lieu d'ouvrir leur liste.
3. S6 : repérer l'entrée voulue (« Script », « Rivière », « Focal », « Bulles »). Sa colonne `enabled` doit valoir `True`.
4. S7 tap sur l'entrée.
- « Rivière » exige un groupe d'au moins 5 participants actifs, jamais une conversation `direct` (`RiverModeGate`). Si l'entrée est désactivée dans toutes les conversations du compte, la vérification Rivière est **BLOQUÉE** : faire S8 sur le menu, le dire dans le compte rendu de #5983, ne pas conclure.

---

### Tâche 18 : La bulle Rivière sait s'effacer sous l'overlay, se laisser remonter inerte, et ouvrir l'overlay par l'appui long

**Fichiers :**
- Modifier : `apps/ios/Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift:229` (loi insérée avant `// MARK: - La bulle`), `:294-304` (propriétés et `==`), `:335-342` (`topSeam`), `:375-393` (`speechRow`), `:730-732` (modificateur ajouté après la vue)
- Test : `apps/ios/MeeshyTests/Unit/Riviere/RiverBubbleInteractionTests.swift` (neuf)
- Budget : `RiverBubbleView.swift` passe de 732 à environ 830 lignes, sous 1000.

**Interfaces :**
- Consomme :
  - `MessageOptionLabels.label(_ action: PrimaryAction) -> String` (Tâche 7), cas `.openInThread`, `.reply`, `.copy` — mêmes clés que le `.contextMenu` actuel (`riviere.bubble.openInThread`, `action.reply`, `action.copy`) ;
  - `HapticFeedback.medium()`, `BubbleAnimations.overlayRevealCrossfade` (existants).
- Produit :
  ```swift
  nonisolated enum RiverBubblePresentation: Equatable { case inStream, lifted }
  nonisolated enum RiverBubbleGesture: Equatable { case contextMenu, longPress, none }
  nonisolated enum RiverBubbleInteraction {
      static let longPressMinimumDuration: Double          // 0.35, comme ConditionalBubbleLongPress
      static let longPressMaximumDistance: CGFloat         // 6
      static func gesture(presentation: RiverBubblePresentation, hasLongPressHandler: Bool) -> RiverBubbleGesture
      static func publishesFrame(presentation: RiverBubblePresentation) -> Bool
      static func rendersTopSeam(presentation: RiverBubblePresentation, joinsAbove: Bool) -> Bool
      static func opacity(isHiddenForOverlay: Bool) -> Double
  }
  // RiverBubbleView, après `onReply` :
  var isHiddenForOverlay: Bool = false
  var presentation: RiverBubblePresentation = .inStream
  var onLongPress: ((String) -> Void)? = nil
  ```
- Égalité : `isHiddenForOverlay`, `presentation` et la PRÉSENCE de `onLongPress` entrent dans `==`. Les fermetures `onOpenReply`, `onOpenProfile`, `onViewStory`, `onOpenInThread`, `onReply` en restent exclues, comme aujourd'hui : elles ne changent pas la structure du rendu.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Riviere/RiverBubbleInteractionTests.swift` :

```swift
import XCTest
@testable import Meeshy

/// #5983 — la bulle Rivière choisit son geste par une LOI pure : `.contextMenu`
/// historique drapeau éteint, appui long vers l'overlay commun drapeau actif,
/// rien du tout pour la copie remontée. La vue n'est pas montable ici (aucun
/// ViewInspector) : la loi se teste par son comportement, l'égalité de la vue
/// par `==`, et le seul câblage par une garde de source minimale.
@MainActor
final class RiverBubbleInteractionTests: XCTestCase {

    // MARK: - Fabriques

    private func makeContent(groupPosition: RiverGroupPosition = .solo) -> RiverBubbleContent {
        RiverBubbleContent(
            bubble: RiverLaneResolver.RiverBubble(
                messageId: "m1",
                laneId: "lane-alice",
                laneIndex: 0,
                rank: 0,
                createdAtMs: 0,
                isViewer: false,
                replyToMessageId: nil,
                isFirstInGroup: true,
                isSystem: false
            ),
            senderDisplayName: "Alice",
            colorSeed: "Alice",
            timeString: "14:02",
            text: "On se voit demain ?",
            layout: .lanes,
            groupPosition: groupPosition
        )
    }

    private func makeView(
        isHiddenForOverlay: Bool = false,
        presentation: RiverBubblePresentation = .inStream,
        onLongPress: ((String) -> Void)? = nil
    ) -> RiverBubbleView {
        RiverBubbleView(
            content: makeContent(),
            contentWidth: 260,
            isHiddenForOverlay: isHiddenForOverlay,
            presentation: presentation,
            onLongPress: onLongPress
        )
    }

    // MARK: - Geste

    func test_gesture_inStreamWithoutLongPressHandler_keepsTheContextMenu() {
        XCTAssertEqual(
            RiverBubbleInteraction.gesture(presentation: .inStream, hasLongPressHandler: false),
            .contextMenu,
            "Drapeau éteint, l'hôte ne pose pas d'appui long : le menu natif de trois actes sert à l'identique (D2)."
        )
    }

    func test_gesture_inStreamWithLongPressHandler_opensTheCommonOverlay() {
        XCTAssertEqual(
            RiverBubbleInteraction.gesture(presentation: .inStream, hasLongPressHandler: true),
            .longPress
        )
    }

    func test_gesture_liftedCopy_isInert_withOrWithoutHandler() {
        XCTAssertEqual(RiverBubbleInteraction.gesture(presentation: .lifted, hasLongPressHandler: false), .none)
        XCTAssertEqual(
            RiverBubbleInteraction.gesture(presentation: .lifted, hasLongPressHandler: true),
            .none,
            "La copie posée au-dessus du voile ne rouvre jamais un menu par-dessus elle-même."
        )
    }

    func test_longPressThresholds_matchTheThreadLongPress() {
        XCTAssertEqual(RiverBubbleInteraction.longPressMinimumDuration, 0.35)
        XCTAssertEqual(RiverBubbleInteraction.longPressMaximumDistance, 6)
    }

    // MARK: - Cadre publié et respiration de tête

    func test_publishesFrame_inStream_publishes() {
        XCTAssertTrue(RiverBubbleInteraction.publishesFrame(presentation: .inStream))
    }

    func test_publishesFrame_liftedCopy_neverPublishes() {
        XCTAssertFalse(
            RiverBubbleInteraction.publishesFrame(presentation: .lifted),
            "Une copie qui publie écraserait le cadre de la bulle d'origine, et les couloirs suivraient l'overlay."
        )
    }

    func test_rendersTopSeam_liftedCopy_neverDrawsTheGap() {
        XCTAssertFalse(RiverBubbleInteraction.rendersTopSeam(presentation: .lifted, joinsAbove: false))
        XCTAssertFalse(RiverBubbleInteraction.rendersTopSeam(presentation: .lifted, joinsAbove: true))
    }

    func test_rendersTopSeam_inStream_followsTheGroupJoin() {
        XCTAssertTrue(RiverBubbleInteraction.rendersTopSeam(presentation: .inStream, joinsAbove: false))
        XCTAssertFalse(RiverBubbleInteraction.rendersTopSeam(presentation: .inStream, joinsAbove: true))
    }

    // MARK: - Masquage

    func test_opacity_hiddenForOverlay_isZero() {
        XCTAssertEqual(RiverBubbleInteraction.opacity(isHiddenForOverlay: true), 0)
    }

    func test_opacity_notHidden_isOne() {
        XCTAssertEqual(RiverBubbleInteraction.opacity(isHiddenForOverlay: false), 1)
    }

    // MARK: - Égalité de la vue

    func test_equality_sameInputs_isEqual_evenWithDistinctHandlers() {
        XCTAssertTrue(makeView(onLongPress: { _ in }) == makeView(onLongPress: { _ in }))
    }

    func test_equality_hiddenForOverlayChanges_invalidatesTheBubble() {
        XCTAssertFalse(
            makeView(isHiddenForOverlay: false) == makeView(isHiddenForOverlay: true),
            "Sans ce champ dans `==`, la bulle d'origine resterait visible sous sa copie : une double bulle."
        )
    }

    func test_equality_presentationChanges_invalidatesTheBubble() {
        XCTAssertFalse(makeView(presentation: .inStream) == makeView(presentation: .lifted))
    }

    func test_equality_longPressHandlerAppears_invalidatesTheBubble() {
        XCTAssertFalse(
            makeView(onLongPress: nil) == makeView(onLongPress: { _ in }),
            "La présence du rappel choisit le geste : une bascule du drapeau doit reconstruire la bulle."
        )
    }

    // MARK: - Câblage (garde de source minimale)

    func test_speechRow_routesItsGestureFrameAndOpacityThroughTheLaw() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift")
        )
        .components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")

        XCTAssertTrue(
            code.contains("RiverBubbleInteraction.gesture(presentation: presentation, hasLongPressHandler: onLongPress != nil)"),
            "Une loi que la vue ne consulte pas ne gouverne rien."
        )
        XCTAssertTrue(code.contains("if RiverBubbleInteraction.publishesFrame(presentation: presentation) {"))
        XCTAssertTrue(code.contains(".opacity(RiverBubbleInteraction.opacity(isHiddenForOverlay: isHiddenForOverlay))"))
        XCTAssertTrue(
            code.contains("case .contextMenu: content.contextMenu { menu }"),
            "Drapeau éteint, le menu natif reçoit le `bubbleMenu` actuel, sans retouche."
        )
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/RiverBubbleInteractionTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-RiverBubbleInteractionTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation du bundle de tests.
- `RiverBubbleInteractionTests.swift:…: error: cannot find 'RiverBubbleInteraction' in scope` ;
- `error: cannot find type 'RiverBubblePresentation' in scope` ;
- `error: extra arguments at positions #3, #4, #5 in call` (ou `incorrect argument labels`) sur `RiverBubbleView(`.

Aucun `error:` ⇒ le fichier n'est pas entré au bundle : relancer `xcodegen generate`.

- [ ] **Étape 3 : Implémentation minimale**

**3a — La loi.** Dans `RiverBubbleView.swift`, remplacer :
```swift
// MARK: - La bulle

/// La bulle Rivière — anatomie GELÉE de la rangée plate du Fil (`thread.*`,
```
par :
```swift
// MARK: - Présentation et geste — une LOI pure, éprouvée sans monter la vue

/// Où vit la bulle : dans le flux (`.inStream`), ou remontée au-dessus du voile
/// de l'appui long (`.lifted`, #5983). Même discipline que `RiverGroupPosition` :
/// une valeur décrite par l'appelant, jamais une branche devinée par la vue.
nonisolated enum RiverBubblePresentation: Equatable {
    case inStream
    case lifted
}

/// Le geste que porte une prise de parole.
nonisolated enum RiverBubbleGesture: Equatable {
    /// Drapeau éteint : le menu natif de trois actes, à l'identique (D2).
    case contextMenu
    /// Drapeau actif : l'appui long ouvre l'overlay commun aux quatre modes (D5).
    case longPress
    /// La copie remontée : inerte.
    case none
}

nonisolated enum RiverBubbleInteraction {

    /// Les seuils de `ConditionalBubbleLongPress` : un même geste ne se déclenche
    /// ni plus tôt ni plus loin selon le mode de lecture.
    static let longPressMinimumDuration: Double = 0.35
    static let longPressMaximumDistance: CGFloat = 6

    static func gesture(presentation: RiverBubblePresentation, hasLongPressHandler: Bool) -> RiverBubbleGesture {
        switch presentation {
        case .lifted:
            return .none
        case .inStream:
            return hasLongPressHandler ? .longPress : .contextMenu
        }
    }

    /// La copie ne publie jamais : son cadre écraserait celui de la bulle
    /// d'origine dans `MessageFramePreferenceKey`, et `RiverLaneCanvas`
    /// tracerait les couloirs vers l'overlay.
    static func publishesFrame(presentation: RiverBubblePresentation) -> Bool {
        presentation == .inStream
    }

    /// La respiration de tête (`Row.gap`) est hors du cadre publié : la copie,
    /// posée à ce cadre, descendrait d'autant si elle la portait.
    static func rendersTopSeam(presentation: RiverBubblePresentation, joinsAbove: Bool) -> Bool {
        presentation == .inStream && !joinsAbove
    }

    /// L'opacité seule change : le cadre continue d'être publié, la géométrie
    /// des couloirs ne bouge pas pendant l'overlay.
    static func opacity(isHiddenForOverlay: Bool) -> Double {
        isHiddenForOverlay ? 0 : 1
    }
}

// MARK: - La bulle

/// La bulle Rivière — anatomie GELÉE de la rangée plate du Fil (`thread.*`,
```

**3b — Les propriétés et l'égalité.** Remplacer :
```swift
    /// Lot 3 — l'appui long : « Ouvrir dans le fil » (retour Script +
    /// atterrissage, comme Résumé), « Répondre » (Script + composeur),
    /// « Copier ». Les deux premiers sont des actes de l'hôte.
    var onOpenInThread: ((String) -> Void)? = nil
    var onReply: ((String) -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme

    static func == (lhs: RiverBubbleView, rhs: RiverBubbleView) -> Bool {
        lhs.content == rhs.content && lhs.contentWidth == rhs.contentWidth
    }
```
par :
```swift
    /// Lot 3 — l'appui long : « Ouvrir dans le fil » (retour Script +
    /// atterrissage, comme Résumé), « Répondre » (Script + composeur),
    /// « Copier ». Les deux premiers sont des actes de l'hôte.
    var onOpenInThread: ((String) -> Void)? = nil
    var onReply: ((String) -> Void)? = nil
    /// #5983 — la bulle d'origine s'efface pendant que l'overlay présente sa
    /// copie (anti double bulle) : l'opacité seule change.
    var isHiddenForOverlay: Bool = false
    /// `.lifted` : la copie que pose `RiverLiftedRowProvider` — ni menu, ni cadre
    /// publié, ni geste, ni respiration de tête.
    var presentation: RiverBubblePresentation = .inStream
    /// Posé par l'hôte quand le drapeau de l'appui long est actif : le geste
    /// ouvre l'overlay commun au lieu du `.contextMenu`.
    var onLongPress: ((String) -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme

    /// Les fermetures ne se comparent pas ; la PRÉSENCE de `onLongPress`, elle,
    /// choisit le geste. Elle entre donc dans l'égalité : sans elle, une bascule
    /// du drapeau laisserait l'ancien geste sur une bulle jugée identique.
    static func == (lhs: RiverBubbleView, rhs: RiverBubbleView) -> Bool {
        lhs.content == rhs.content
            && lhs.contentWidth == rhs.contentWidth
            && lhs.isHiddenForOverlay == rhs.isHiddenForOverlay
            && lhs.presentation == rhs.presentation
            && (lhs.onLongPress == nil) == (rhs.onLongPress == nil)
    }
```

**3c — La respiration de tête.** Remplacer :
```swift
    @ViewBuilder
    private var topSeam: some View {
        if !content.groupPosition.joinsAbove {
            Color.clear
                .frame(width: contentWidth, height: RiverMetrics.Row.gap)
                .accessibilityHidden(true)
        }
    }
```
par :
```swift
    @ViewBuilder
    private var topSeam: some View {
        if RiverBubbleInteraction.rendersTopSeam(presentation: presentation, joinsAbove: content.groupPosition.joinsAbove) {
            Color.clear
                .frame(width: contentWidth, height: RiverMetrics.Row.gap)
                .accessibilityHidden(true)
        }
    }
```

**3d — La prise de parole.** Remplacer :
```swift
    private var speechRow: some View {
        VStack(alignment: .leading, spacing: RiverMetrics.Bubble.baseGap) {
            if content.bubble.isFirstInGroup {
                identityHeader
            }
            messageBox
        }
        .background(
            GeometryReader { proxy in
                Color.clear.preference(
                    key: MessageFramePreferenceKey.self,
                    value: [content.bubble.messageId: proxy.frame(in: .named(RiverCoordinateSpace.name))]
                )
            }
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .contextMenu { bubbleMenu }
    }
```
par :
```swift
    private var speechRow: some View {
        VStack(alignment: .leading, spacing: RiverMetrics.Bubble.baseGap) {
            if content.bubble.isFirstInGroup {
                identityHeader
            }
            messageBox
        }
        .background {
            if RiverBubbleInteraction.publishesFrame(presentation: presentation) {
                GeometryReader { proxy in
                    Color.clear.preference(
                        key: MessageFramePreferenceKey.self,
                        value: [content.bubble.messageId: proxy.frame(in: .named(RiverCoordinateSpace.name))]
                    )
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .modifier(RiverBubbleGestures(
            gesture: RiverBubbleInteraction.gesture(presentation: presentation, hasLongPressHandler: onLongPress != nil),
            messageId: content.bubble.messageId,
            copiedText: content.text,
            menu: bubbleMenu,
            onLongPress: onLongPress,
            onOpenInThread: onOpenInThread,
            onReply: onReply
        ))
        // Même fondu que la cellule du fil (`BubbleSwipeContainer`).
        .opacity(RiverBubbleInteraction.opacity(isHiddenForOverlay: isHiddenForOverlay))
        .animation(BubbleAnimations.overlayRevealCrossfade, value: isHiddenForOverlay)
    }
```

**3e — Le geste en type nommé.** À la fin du fichier, remplacer :
```swift
        return parts.joined(separator: ", ")
    }
}
```
par :
```swift
        return parts.joined(separator: ", ")
    }
}

// MARK: - Le geste — un TYPE NOMMÉ, jamais trois branches dans le body

/// Trois branches posées dans `speechRow` tripleraient son type générique : le
/// débordement de pile par profondeur de type (#4361). Un modificateur nommé
/// referme cette profondeur derrière un seul `ModifiedContent`.
///
/// `.longPress` reprend le geste du fil (`ConditionalBubbleLongPress`) : même
/// durée, même tolérance, même haptique moyenne, en `simultaneousGesture` pour
/// ne disputer ni le pan du pane, ni le balayage des couloirs, ni le tap
/// curseur. VoiceOver y reçoit les actes du `.contextMenu` qu'il remplace, par
/// des actions nommées présentes seulement quand l'hôte les offre.
private struct RiverBubbleGestures<Menu: View>: ViewModifier {
    let gesture: RiverBubbleGesture
    let messageId: String
    let copiedText: String
    let menu: Menu
    let onLongPress: ((String) -> Void)?
    let onOpenInThread: ((String) -> Void)?
    let onReply: ((String) -> Void)?

    func body(content: Content) -> some View {
        switch gesture {
        case .contextMenu:
            content.contextMenu { menu }
        case .longPress:
            content
                .simultaneousGesture(
                    LongPressGesture(
                        minimumDuration: RiverBubbleInteraction.longPressMinimumDuration,
                        maximumDistance: RiverBubbleInteraction.longPressMaximumDistance
                    )
                    .onEnded { _ in
                        HapticFeedback.medium()
                        onLongPress?(messageId)
                    }
                )
                .accessibilityActions {
                    if let onOpenInThread {
                        Button(MessageOptionLabels.label(.openInThread)) { onOpenInThread(messageId) }
                    }
                    if let onReply {
                        Button(MessageOptionLabels.label(.reply)) { onReply(messageId) }
                    }
                    Button(MessageOptionLabels.label(.copy)) { UIPasteboard.general.string = copiedText }
                }
        case .none:
            content
        }
    }
}
```

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande (la classe de la tâche et les gardes qui lisent `RiverBubbleView.swift` ou `Riviere/View/`) :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/RiverBubbleInteractionTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -only-testing:MeeshyTests/ForwardAttributionSingleSiteTests \
  -only-testing:MeeshyTests/StoryCitationAcrossSkinsTests \
  -only-testing:MeeshyTests/RiverSourceGuardTests \
  -only-testing:MeeshyTests/RiverTypingIndicatorTests \
  -only-testing:MeeshyTests/RiverStreamHostSourceGuardTests \
  -only-testing:MeeshyTests/FixedFontSizeGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-RiverBubbleInteractionTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu :
- les 15 tests de `RiverBubbleInteractionTests` `passed` ;
- une ligne `Executed N tests, with 0 failures` ;
- compter les noms DISTINCTS de classes dans le journal : 8 classes, sinon une n'a pas tourné.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
test "$(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj)" -eq "$(( $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources') + 2 ))" && echo "pbxproj +2 OK (1 fichier neuf = 2 lignes)" && \
git add apps/ios/Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift \
        apps/ios/MeeshyTests/Unit/Riviere/RiverBubbleInteractionTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -m "feat(ios): la bulle Rivière s'efface sous l'overlay, se remonte inerte et ouvre l'overlay par l'appui long (#5983)" \
  -m "Une loi pure (RiverBubbleInteraction) choisit le geste : .contextMenu drapeau éteint, appui long 0,35 s vers l'overlay commun drapeau actif, rien pour la copie remontée. La copie ne publie pas de cadre et ne porte pas la respiration de tête ; la bulle d'origine s'efface par l'opacité seule. isHiddenForOverlay, presentation et la présence de onLongPress entrent dans ==. VoiceOver reçoit Ouvrir dans le fil, Répondre et Copier en actions nommées (MessageOptionLabels)." \
  -m "Refs #5983" \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK" && \
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```
Attendu : `git show --stat` liste les trois chemins, et seulement eux.

---

### Tâche 19 : La Rivière remet sa bulle à l'overlay commun, convertie du pane vers la fenêtre

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Riviere/View/RiverLiftedRowProvider.swift`
- Créer : `apps/ios/Meeshy/Features/Main/Views/ConversationView+RiverLongPress.swift`
- Modifier : `apps/ios/Meeshy/Features/Main/Riviere/View/RiverStreamHost.swift`
  - `:94-96` : nouvelles propriétés ;
  - `:138-140` : disposition du fournisseur ;
  - `:229-232` : alimentation de la disposition ;
  - `:473-475` : alimentation des cadres ;
  - `:550-558` : masquage et appui long de la cellule.
- Modifier : `apps/ios/Meeshy/Features/Main/Riviere/View/RiverConversationHost.swift`
  - `:36-39` : propriétés ;
  - `:80-97` : `init` ;
  - `:123` : fournisseur en `@State` ;
  - `:197-204` : relais vers `RiverStreamHost` ;
  - `:212` : inscription au lien.
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:1421-1436, 1452-1453` (branche `.river`)
- Modifier, si besoin : `apps/ios/Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift` (Tâche 16), argument `isRiver:` de `menuContext(for:isRiver:)`
- Test : `apps/ios/MeeshyTests/Unit/Riviere/RiverLiftedRowProviderTests.swift` (neuf)
- Test : `apps/ios/MeeshyTests/Unit/Riviere/RiverLongPressWiringTests.swift` (neuf)
- Budget :
  - `ConversationView.swift` : Δ −11. Deux fermetures (16 lignes) sont relocalisées en méthodes, instructions inchangées, et 3 lignes de câblage s'ajoutent. Aucune garde ne lit ces fermetures (`git grep` de `participantProfileTarget`, `storyViewerStartAtFirstUnviewed`, `onOpenProfile: { user` dans `apps/ios/MeeshyTests` : 0).
  - `RiverStreamHost.swift` passe à environ 690 lignes et `RiverConversationHost.swift` à environ 305, tous deux sous 1000.

**Interfaces :**
- Consomme :
  ```swift
  // Tâche 13
  struct LiftedMessageRow { enum Alignment: Equatable { case leading, trailing, fullWidth }; let messageId: String; let content: AnyView; let frameInWindow: CGRect; let alignment: Alignment }
  protocol LiftedRowProviding: AnyObject { func liftedRow(for messageId: String) -> LiftedMessageRow? }
  final class LiftedRowProviderLink { func register(_ provider: LiftedRowProviding, for slot: Slot); func liftedRow(for messageId: String, mode: ConversationReadingMode) -> LiftedMessageRow? }
  // ConversationOverlayState : let liftedRowLink = LiftedRowProviderLink()
  // Tâche 12
  EnvironmentValues.suppressesAppearanceEffects: Bool
  // Tâche 4
  func presentLongPressMenu(for message: Message, cellFrame: CGRect?, style: LongPressPresentationStyle = .longPress)
  // Tâche 2
  static var isLiftedRowLongPressEnabled: Bool   // MeeshyFeatureFlags
  // Tâche 8
  func menuContext(for message: Message, isRiver: Bool) -> MessageMenuContext
  // Tâche 18
  RiverBubbleView(content:contentWidth:…, isHiddenForOverlay:, presentation:, onLongPress:)
  ```
- Produit :
  ```swift
  final class RiverLiftedRowProvider: LiftedRowProviding {
      struct Layout: Equatable { var paneOriginInWindow: CGPoint; var contents: [RiverBubbleContent]; var contentWidth: CGFloat }
      func update(frames: [String: CGRect])     // repère du pane (RiverCoordinateSpace)
      func update(layout: Layout)
      func liftedRow(for messageId: String) -> LiftedMessageRow?
  }
  // RiverStreamHost, après `onReply` :
  var liftedRowProvider: RiverLiftedRowProvider? = nil
  var paneOriginInWindow: CGPoint = .zero
  var overlaidMessageId: String? = nil
  var onLongPress: ((String) -> Void)? = nil
  // RiverConversationHost (propriétés ET paramètres d'init, après `onReply`) :
  var liftedRowLink: LiftedRowProviderLink? = nil
  var overlaidMessageId: String? = nil
  var onLongPress: ((String) -> Void)? = nil
  // ConversationView (ConversationView+RiverLongPress.swift) :
  var riverLongPressHandler: ((String) -> Void)? { get }   // nil drapeau éteint
  func openRiverVoiceProfile(_ user: ProfileSheetUser)
  func openRiverVoiceStory(_ userId: String)
  ```

- [ ] **Étape 1 : Écrire les tests qui échouent**

Créer `apps/ios/MeeshyTests/Unit/Riviere/RiverLiftedRowProviderTests.swift` :

```swift
import XCTest
@testable import Meeshy

/// #5983 — la Rivière n'a pas de cellule UIKit à relire : ses cadres vivent dans
/// le repère du PANE. Le fournisseur rend la bulle au cadre FENÊTRE que l'overlay
/// attend, rien pour ce qui n'est ni publié ni une prise de parole, et le lien
/// ne le consulte qu'en mode Rivière.
@MainActor
final class RiverLiftedRowProviderTests: XCTestCase {

    // MARK: - Fabriques

    private func makeContent(messageId: String, isViewer: Bool = false, isSystem: Bool = false) -> RiverBubbleContent {
        RiverBubbleContent(
            bubble: RiverLaneResolver.RiverBubble(
                messageId: messageId,
                laneId: isViewer ? "lane-viewer" : "lane-alice",
                laneIndex: isViewer ? 0 : 1,
                rank: 0,
                createdAtMs: 0,
                isViewer: isViewer,
                replyToMessageId: nil,
                isFirstInGroup: true,
                isSystem: isSystem
            ),
            senderDisplayName: isViewer ? "Toi" : "Alice",
            colorSeed: isViewer ? "Toi" : "Alice",
            timeString: "14:02",
            text: "On se voit demain ?",
            layout: .lanes
        )
    }

    private func makeProvider(
        frames: [String: CGRect],
        paneOriginInWindow: CGPoint = .zero,
        contents: [RiverBubbleContent],
        contentWidth: CGFloat = 260
    ) -> RiverLiftedRowProvider {
        let provider = RiverLiftedRowProvider()
        provider.update(frames: frames)
        provider.update(layout: RiverLiftedRowProvider.Layout(
            paneOriginInWindow: paneOriginInWindow,
            contents: contents,
            contentWidth: contentWidth
        ))
        return provider
    }

    // MARK: - Conversion pane → fenêtre

    func test_liftedRow_materializedBubble_convertsItsFrameFromThePaneToTheWindow() {
        let provider = makeProvider(
            frames: ["m1": CGRect(x: 24, y: 300, width: 260, height: 88)],
            paneOriginInWindow: CGPoint(x: 320, y: 12),
            contents: [makeContent(messageId: "m1")]
        )

        let row = provider.liftedRow(for: "m1")

        XCTAssertEqual(row?.messageId, "m1")
        XCTAssertEqual(
            row?.frameInWindow,
            CGRect(x: 344, y: 312, width: 260, height: 88),
            "Le cadre publié vit dans le repère du pane : l'overlay le recevrait décalé de la colonne de détail (iPad)."
        )
    }

    func test_liftedRow_afterScroll_readsTheLatestFrames() {
        let provider = makeProvider(
            frames: ["m1": CGRect(x: 24, y: 300, width: 260, height: 88)],
            contents: [makeContent(messageId: "m1")]
        )

        provider.update(frames: ["m1": CGRect(x: 24, y: 120, width: 260, height: 88)])

        XCTAssertEqual(provider.liftedRow(for: "m1")?.frameInWindow.minY, 120)
    }

    // MARK: - Alignement

    func test_liftedRow_viewerBubble_alignsTrailing() {
        let provider = makeProvider(
            frames: ["m1": CGRect(x: 24, y: 300, width: 260, height: 88)],
            contents: [makeContent(messageId: "m1", isViewer: true)]
        )
        XCTAssertEqual(provider.liftedRow(for: "m1")?.alignment, .trailing)
    }

    func test_liftedRow_otherVoice_alignsLeading() {
        let provider = makeProvider(
            frames: ["m1": CGRect(x: 324, y: 300, width: 260, height: 88)],
            contents: [makeContent(messageId: "m1", isViewer: false)]
        )
        XCTAssertEqual(provider.liftedRow(for: "m1")?.alignment, .leading)
    }

    // MARK: - Rien à remettre ⇒ l'overlay actuel sert

    func test_liftedRow_bubbleWithoutPublishedFrame_returnsNil() {
        let provider = makeProvider(frames: [:], contents: [makeContent(messageId: "m1")])
        XCTAssertNil(provider.liftedRow(for: "m1"), "Bulle non matérialisée par la pile paresseuse : repli explicite (§8).")
    }

    func test_liftedRow_frameWithoutContent_returnsNil() {
        let provider = makeProvider(frames: ["m1": CGRect(x: 0, y: 0, width: 260, height: 88)], contents: [])
        XCTAssertNil(provider.liftedRow(for: "m1"))
    }

    func test_liftedRow_systemNotice_returnsNil() {
        let provider = makeProvider(
            frames: ["s1": CGRect(x: 0, y: 0, width: 600, height: 40)],
            contents: [makeContent(messageId: "s1", isSystem: true)]
        )
        XCTAssertNil(provider.liftedRow(for: "s1"), "Un avis système n'est la voix de personne : pas de bulle à remonter.")
    }

    // MARK: - Le lien choisit par le mode, et ne retient rien

    func test_link_riverSlot_answersOnlyInRiverMode() {
        let provider = makeProvider(
            frames: ["m1": CGRect(x: 24, y: 300, width: 260, height: 88)],
            contents: [makeContent(messageId: "m1")]
        )
        let link = LiftedRowProviderLink()

        link.register(provider, for: .river)

        XCTAssertNotNil(link.liftedRow(for: "m1", mode: .river))
        XCTAssertNil(
            link.liftedRow(for: "m1", mode: .script),
            "Hors Rivière, c'est la liste qui répond, jamais le premier fournisseur venu (D5)."
        )
    }

    func test_link_providerReleasedWithItsPane_stopsAnswering() {
        let link = LiftedRowProviderLink()
        do {
            let provider = makeProvider(
                frames: ["m1": CGRect(x: 24, y: 300, width: 260, height: 88)],
                contents: [makeContent(messageId: "m1")]
            )
            link.register(provider, for: .river)
            XCTAssertNotNil(link.liftedRow(for: "m1", mode: .river))
        }
        XCTAssertNil(
            link.liftedRow(for: "m1", mode: .river),
            "Le lien est faible : quitter la Rivière libère son fournisseur et les contenus qu'il référençait."
        )
    }
}
```

Créer `apps/ios/MeeshyTests/Unit/Riviere/RiverLongPressWiringTests.swift` :

```swift
import XCTest
@testable import Meeshy

/// #5983 — le câblage de l'appui long Rivière traverse trois vues SwiftUI que ce
/// dépôt ne sait pas monter (aucun ViewInspector) : garde de SOURCE, sur le
/// patron de `RiverCatchUpWiringTests`, bornée à la branche `.river`.
@MainActor
final class RiverLongPressWiringTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Riviere
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private func normalized(_ relativePath: String) throws -> String {
        let raw = try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func riverBranch() throws -> String {
        let code = try normalized("Meeshy/Features/Main/Views/ConversationView.swift")
        let start = try XCTUnwrap(code.range(of: "if readingModeController.mode == .river {"))
        let end = try XCTUnwrap(
            code.range(of: "if readingModeController.mode == .summary {", options: [], range: start.upperBound ..< code.endIndex)
        )
        return String(code[start.upperBound ..< end.lowerBound])
    }

    func test_conversationView_riverBranch_passesTheLinkTheHiddenBubbleAndTheLongPress() throws {
        let branch = try riverBranch()
        XCTAssertTrue(branch.contains("liftedRowLink: overlayState.liftedRowLink,"))
        XCTAssertTrue(branch.contains("overlaidMessageId: overlayState.showOverlayMenu ? overlayState.overlayMessage?.id : nil,"))
        XCTAssertTrue(branch.contains("onLongPress: riverLongPressHandler,"))
    }

    func test_riverLongPressHandler_isNilWhenTheFlagIsOff_andPresentsWithoutACellFrame() throws {
        let code = try normalized("Meeshy/Features/Main/Views/ConversationView+RiverLongPress.swift")
        XCTAssertTrue(
            code.contains("guard MeeshyFeatureFlags.isLiftedRowLongPressEnabled else { return nil }"),
            "Drapeau éteint, la bulle garde son `.contextMenu` : le rappel doit être ABSENT, pas inerte."
        )
        XCTAssertTrue(code.contains("guard overlayState.longPressEnabled, overlayState.quickReactionMessageId == nil,"))
        XCTAssertTrue(
            code.contains("presentLongPressMenu(for: msg, cellFrame: nil)"),
            "Aucun cadre : la Rivière ne recentre jamais, sa rangée est relue par son fournisseur."
        )
    }

    func test_liftedOverlay_buildsTheRiverCompactMenu_fromTheCurrentMode() throws {
        let code = try normalized("Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift")
        XCTAssertTrue(
            code.contains("isRiver: readingModeController.mode == .river"),
            "La liste compacte Rivière (« Ouvrir dans le fil », « Répondre ») est portée par le contexte, jamais par une branche de vue (§7.1)."
        )
    }

    func test_conversationHost_ownsRegistersAndRelaysTheRiverProvider() throws {
        let code = try normalized("Meeshy/Features/Main/Riviere/View/RiverConversationHost.swift")
        XCTAssertTrue(code.contains("@State private var liftedRowProvider = RiverLiftedRowProvider()"))
        XCTAssertTrue(code.contains(".onAppear { liftedRowLink?.register(liftedRowProvider, for: .river) }"))
        XCTAssertTrue(code.contains("liftedRowProvider: liftedRowProvider, paneOriginInWindow: proxy.frame(in: .global).origin, overlaidMessageId: overlaidMessageId, onLongPress: onLongPress,"))
    }

    func test_streamHost_feedsTheProvider_andHidesTheOverlaidBubble() throws {
        let code = try normalized("Meeshy/Features/Main/Riviere/View/RiverStreamHost.swift")
        XCTAssertTrue(code.contains("liftedRowProvider?.update(frames: next)"))
        XCTAssertTrue(code.contains(".adaptiveOnChange(of: liftedRowLayout, initial: true) { _, next in liftedRowProvider?.update(layout: next) }"))
        XCTAssertTrue(code.contains("isHiddenForOverlay: bubble.messageId == overlaidMessageId, onLongPress: onLongPress )"))
    }
}
```

- [ ] **Étape 2 : Lancer les tests et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/RiverLiftedRowProviderTests \
  -only-testing:MeeshyTests/RiverLongPressWiringTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-RiverLiftedRowProviderTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation — `RiverLiftedRowProviderTests.swift:…: error: cannot find 'RiverLiftedRowProvider' in scope`.

- [ ] **Étape 3 : Implémentation minimale**

**3a — Relever le budget avant toute édition :**
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
```
Noter la valeur `AVANT`.

**3b — Le fournisseur.** Créer `apps/ios/Meeshy/Features/Main/Riviere/View/RiverLiftedRowProvider.swift` :

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce que la Rivière remet à l'overlay de l'appui long** (#5983, D5).
///
/// La liste relit sa cellule UIKit ; la Rivière n'en a pas. Ses bulles publient
/// leur cadre dans le repère du PANE (`RiverCoordinateSpace`), gardé par l'écran
/// qui les assemble. Ce fournisseur en conserve la dernière lecture et ne la
/// convertit vers la fenêtre qu'au moment du geste.
///
/// **Qui le tient** : l'hôte de conversation Rivière, en `@State`. Le lien
/// (`LiftedRowProviderLink`) est FAIBLE : la vie du fournisseur est celle du
/// pane. Quitter la Rivière le libère avec les contenus qu'il référençait, et le
/// lien cesse de répondre pour `.river`.
///
/// **Alimenté, jamais mesurant** : les cadres arrivent à chaque changement
/// (`update(frames:)`), la disposition quand elle change (`update(layout:)`).
/// Aucune mesure n'est déclarée ici.
///
/// La copie est la MÊME vue que la bulle du flux, en présentation `.lifted` :
/// sans menu, sans cadre publié, sans geste, inerte et cachée de VoiceOver (D1).
final class RiverLiftedRowProvider: LiftedRowProviding {

    struct Layout: Equatable {
        var paneOriginInWindow: CGPoint
        var contents: [RiverBubbleContent]
        var contentWidth: CGFloat
    }

    private var frames: [String: CGRect] = [:]
    private var layout = Layout(paneOriginInWindow: .zero, contents: [], contentWidth: 0)

    /// Même règle que `ContentsMemo` : sous l'isolation MainActor par défaut, une
    /// deinit synthétisée double-libère sur iOS 26.1 au démontage hors tâche.
    nonisolated deinit {}

    func update(frames: [String: CGRect]) {
        self.frames = frames
    }

    func update(layout: Layout) {
        self.layout = layout
    }

    func liftedRow(for messageId: String) -> LiftedMessageRow? {
        guard let frameInPane = frames[messageId],
              let content = layout.contents.first(where: { $0.bubble.messageId == messageId }),
              !content.bubble.isSystem
        else { return nil }
        return LiftedMessageRow(
            messageId: messageId,
            content: AnyView(
                RiverBubbleView(content: content, contentWidth: layout.contentWidth, presentation: .lifted)
                    .frame(width: layout.contentWidth, alignment: .leading)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    .environment(\.suppressesAppearanceEffects, true)
            ),
            frameInWindow: frameInPane.offsetBy(dx: layout.paneOriginInWindow.x, dy: layout.paneOriginInWindow.y),
            alignment: content.bubble.isViewer ? .trailing : .leading
        )
    }
}
```

**3c — `RiverStreamHost` reçoit le fournisseur et ce qu'il lui faut.** Dans `RiverStreamHost.swift`, remplacer :
```swift
    /// Lot 3 — retours au Fil depuis une bulle (appui long).
    var onOpenInThread: ((String) -> Void)? = nil
    var onReply: ((String) -> Void)? = nil
```
par :
```swift
    /// Lot 3 — retours au Fil depuis une bulle (appui long).
    var onOpenInThread: ((String) -> Void)? = nil
    var onReply: ((String) -> Void)? = nil
    /// #5983 — l'overlay commun de l'appui long : le fournisseur que cet écran
    /// alimente, l'origine du pane dans la fenêtre (MESURÉE par l'appelant), la
    /// bulle à effacer pendant l'overlay, et l'appui long qui remplace le
    /// `.contextMenu` quand l'appelant le pose.
    var liftedRowProvider: RiverLiftedRowProvider? = nil
    var paneOriginInWindow: CGPoint = .zero
    var overlaidMessageId: String? = nil
    var onLongPress: ((String) -> Void)? = nil
```

Remplacer :
```swift
    private var contentByMessageId: [String: RiverBubbleContent] {
        Dictionary(uniqueKeysWithValues: contents.map { ($0.bubble.messageId, $0) })
    }
```
par :
```swift
    private var contentByMessageId: [String: RiverBubbleContent] {
        Dictionary(uniqueKeysWithValues: contents.map { ($0.bubble.messageId, $0) })
    }

    /// Ce que le fournisseur de l'appui long relit au geste. `contents` est le
    /// tableau MÉMOÏSÉ de l'hôte : sa comparaison prend le raccourci d'identité
    /// de tampon et ne coûte rien pendant le défilement.
    private var liftedRowLayout: RiverLiftedRowProvider.Layout {
        RiverLiftedRowProvider.Layout(
            paneOriginInWindow: paneOriginInWindow,
            contents: contents,
            contentWidth: columns.bubbleContentWidth
        )
    }
```

Remplacer :
```swift
                .adaptiveOnChange(of: landingToken) { _, _ in
                    hasLandedOnCursor = false
                    landOnCursor()
                }
        }
    }
```
par :
```swift
                .adaptiveOnChange(of: landingToken) { _, _ in
                    hasLandedOnCursor = false
                    landOnCursor()
                }
                // #5983 — la disposition que l'overlay de l'appui long relit.
                .adaptiveOnChange(of: liftedRowLayout, initial: true) { _, next in
                    liftedRowProvider?.update(layout: next)
                }
        }
    }
```

Remplacer :
```swift
        // Les cadres publiés bougent à chaque défilement : c'est le signal
        // qui montre la poignée, sans second lecteur d'offset.
        .adaptiveOnChange(of: frames) { _, _ in noteScrollActivity() }
```
par :
```swift
        // Les cadres publiés bougent à chaque défilement : c'est le signal
        // qui montre la poignée, sans second lecteur d'offset — et la dernière
        // lecture que garde le fournisseur de l'appui long (#5983).
        .adaptiveOnChange(of: frames) { _, next in
            noteScrollActivity()
            liftedRowProvider?.update(frames: next)
        }
```

Remplacer :
```swift
            RiverBubbleView(
                content: content,
                contentWidth: columns.bubbleContentWidth,
                onOpenReply: openReply,
                onOpenProfile: onOpenProfile,
                onViewStory: onViewStory,
                onOpenInThread: onOpenInThread,
                onReply: onReply
            )
```
par :
```swift
            RiverBubbleView(
                content: content,
                contentWidth: columns.bubbleContentWidth,
                onOpenReply: openReply,
                onOpenProfile: onOpenProfile,
                onViewStory: onViewStory,
                onOpenInThread: onOpenInThread,
                onReply: onReply,
                isHiddenForOverlay: bubble.messageId == overlaidMessageId,
                onLongPress: onLongPress
            )
```

**3d — `RiverConversationHost` tient, inscrit et relaie.** Dans `RiverConversationHost.swift`, remplacer :
```swift
    /// Lot 3 — retours au Fil depuis une bulle (appui long), DITS par
    /// l'appelant qui possède le contrôleur de mode et le composeur.
    var onOpenInThread: ((String) -> Void)? = nil
    var onReply: ((String) -> Void)? = nil
```
par :
```swift
    /// Lot 3 — retours au Fil depuis une bulle (appui long), DITS par
    /// l'appelant qui possède le contrôleur de mode et le composeur.
    var onOpenInThread: ((String) -> Void)? = nil
    var onReply: ((String) -> Void)? = nil
    /// #5983 — le lien où cet hôte inscrit SON fournisseur de rangée sous
    /// `.river`, la bulle que l'overlay présente, et l'appui long (`nil` ⇒ le
    /// `.contextMenu` historique). Le lien est faible : le fournisseur vit ici,
    /// en `@State`, exactement aussi longtemps que le pane.
    var liftedRowLink: LiftedRowProviderLink? = nil
    var overlaidMessageId: String? = nil
    var onLongPress: ((String) -> Void)? = nil
```

Remplacer :
```swift
        onReply: ((String) -> Void)? = nil,
        onReachPresent: (() -> Void)? = nil,
```
par :
```swift
        onReply: ((String) -> Void)? = nil,
        liftedRowLink: LiftedRowProviderLink? = nil,
        overlaidMessageId: String? = nil,
        onLongPress: ((String) -> Void)? = nil,
        onReachPresent: (() -> Void)? = nil,
```

Remplacer :
```swift
        self.onReply = onReply
```
par :
```swift
        self.onReply = onReply
        self.liftedRowLink = liftedRowLink
        self.overlaidMessageId = overlaidMessageId
        self.onLongPress = onLongPress
```

Remplacer :
```swift
    @State private var memo = ContentsMemo()
```
par :
```swift
    @State private var memo = ContentsMemo()

    /// #5983 — même raison que `memo` : une RÉFÉRENCE tenue en `@State` garde
    /// son identité, et la nourrir ne réévalue aucun body.
    @State private var liftedRowProvider = RiverLiftedRowProvider()
```

Remplacer :
```swift
                onReply: onReply,
                navigation: navigation
```
par :
```swift
                onReply: onReply,
                liftedRowProvider: liftedRowProvider,
                paneOriginInWindow: proxy.frame(in: .global).origin,
                overlaidMessageId: overlaidMessageId,
                onLongPress: onLongPress,
                navigation: navigation
```

Remplacer :
```swift
        .contentShape(Rectangle())
```
par :
```swift
        .contentShape(Rectangle())
        // #5983 — l'hôte inscrit le fournisseur qu'il tient.
        .onAppear { liftedRowLink?.register(liftedRowProvider, for: .river) }
```

**3e — L'extension de la conversation.** Créer `apps/ios/Meeshy/Features/Main/Views/ConversationView+RiverLongPress.swift`.

Ne JAMAIS y écrire, même en commentaire, le nom de la peau des couloirs ni l'appel de l'hôte de conversation Rivière : `RiverScreenNotMountedTests` lit le texte brut de tout fichier hors `Riviere/`.

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Rivière : appui long, fiche et story d'une voix (#5983)

extension ConversationView {

    /// **L'appui long d'une bulle Rivière ouvre l'overlay commun aux quatre
    /// modes** — drapeau actif seulement. `nil` rend à la bulle son
    /// `.contextMenu` de trois actes, à l'identique (D2).
    ///
    /// Mêmes gardes que l'appui long du fil : pas avant que l'écran l'autorise
    /// (`longPressEnabled`), jamais par-dessus la barre de réaction rapide. Aucun
    /// cadre : la Rivière ne recentre jamais (`LongPressPresentationPlan
    /// .shouldRecenter`), sa rangée est relue par le fournisseur inscrit sous
    /// `.river`.
    var riverLongPressHandler: ((String) -> Void)? {
        guard MeeshyFeatureFlags.isLiftedRowLongPressEnabled else { return nil }
        return { messageId in
            guard overlayState.longPressEnabled,
                  overlayState.quickReactionMessageId == nil,
                  let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
            presentLongPressMenu(for: msg, cellFrame: nil)
        }
    }

    /// R-5 — la fiche d'une voix : fiche de participation pour un visiteur sans
    /// compte, profil sinon. Relocalisée telle quelle depuis la fermeture
    /// `onOpenProfile` du montage Rivière (#5983, D4).
    func openRiverVoiceProfile(_ user: ProfileSheetUser) {
        if user.isAnonymous, let participantId = user.participantId, let conversationId = conversation?.id {
            router.participantProfileTarget = ParticipantProfileTarget(
                conversationId: conversationId,
                participantId: participantId
            )
        } else {
            router.deepLinkProfileUser = user
        }
    }

    /// R-5 — la story d'une voix, depuis sa première non vue. Relocalisée telle
    /// quelle depuis la fermeture `onViewStory` du montage Rivière (#5983, D4).
    func openRiverVoiceStory(_ userId: String) {
        overlayState.storyViewerUserId = userId
        overlayState.storyViewerSlideIndex = 0
        overlayState.storyViewerStartAtFirstUnviewed = true
        overlayState.showStoryViewer = true
    }
}
```

**3f — Le montage Rivière de `ConversationView.swift`.** Remplacer :
```swift
                    onOpenProfile: { user in
                        if user.isAnonymous, let participantId = user.participantId, let conversationId = conversation?.id {
                            router.participantProfileTarget = ParticipantProfileTarget(
                                conversationId: conversationId,
                                participantId: participantId
                            )
                        } else {
                            router.deepLinkProfileUser = user
                        }
                    },
                    onViewStory: { userId in
                        overlayState.storyViewerUserId = userId
                        overlayState.storyViewerSlideIndex = 0
                        overlayState.storyViewerStartAtFirstUnviewed = true
                        overlayState.showStoryViewer = true
                    },
```
par :
```swift
                    onOpenProfile: openRiverVoiceProfile,
                    onViewStory: openRiverVoiceStory,
```

Remplacer :
```swift
                    // #3901 — la Rivière ne rend jamais bulle par bulle
```
par :
```swift
                    liftedRowLink: overlayState.liftedRowLink,
                    overlaidMessageId: overlayState.showOverlayMenu ? overlayState.overlayMessage?.id : nil,
                    onLongPress: riverLongPressHandler,
                    // #3901 — la Rivière ne rend jamais bulle par bulle
```
L'ordre des arguments suit l'`init` : `onReply`, puis les trois nouveaux, puis `onReachPresent`.

**3g — La liste compacte Rivière.** Relever l'appel de la Tâche 16 :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && grep -n "menuContext(for:" apps/ios/Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift
```
Attendu : une ligne.
- Si elle contient déjà `isRiver: readingModeController.mode == .river`, ne rien écrire.
- Sinon, sur cette ligne (Edit, texte relevé tel quel), remplacer l'argument `isRiver: <valeur relevée>` par `isRiver: readingModeController.mode == .river`.
- Aucune ligne relevée : s'arrêter. La Tâche 16 n'a pas construit son contexte par la fabrique (D8), à corriger avant de continuer.

**3h — Relever le budget :**
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && wc -l apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
```
Attendu : `APRÈS = AVANT − 11`. Tout Δ > 0 est un échec de la tâche.

- [ ] **Étape 4 : Lancer les tests et constater le succès**

Commande (classes de la tâche, gardes Rivière, gardes de l'appui long, budget) :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/RiverLiftedRowProviderTests \
  -only-testing:MeeshyTests/RiverLongPressWiringTests \
  -only-testing:MeeshyTests/RiverBubbleInteractionTests \
  -only-testing:MeeshyTests/RiverStreamHostSourceGuardTests \
  -only-testing:MeeshyTests/ReadingDirectionGuardTests \
  -only-testing:MeeshyTests/RiverTypingIndicatorTests \
  -only-testing:MeeshyTests/RiverCatchUpWiringTests \
  -only-testing:MeeshyTests/RiverScreenNotMountedTests \
  -only-testing:MeeshyTests/RiverActivationLockTests \
  -only-testing:MeeshyTests/RiverSourceGuardTests \
  -only-testing:MeeshyTests/CallDetailRoutingTests \
  -only-testing:MeeshyTests/ConversationLongPressMenuGuardTests \
  -only-testing:MeeshyTests/ConversationViewBodyTypeDepthTests \
  -only-testing:MeeshyTests/FileSizeBudgetGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-RiverLiftedRowProviderTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu :
- les 9 tests de `RiverLiftedRowProviderTests` et les 5 de `RiverLongPressWiringTests` `passed` ;
- `Executed N tests, with 0 failures` ;
- 14 noms de classes distincts dans le journal.

Gardes à surveiller :
- `RiverScreenNotMountedTests` rougit si le fichier `ConversationView+RiverLongPress.swift` nomme la peau ;
- `FileSizeBudgetGuardTests` est un cliquet à UN sens (`XCTAssertLessThanOrEqual`) : un Δ négatif le laisse vert.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
test "$(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj)" -eq "$(( $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources') + 8 ))" && echo "pbxproj +8 OK (4 fichiers neufs × 2 lignes)" && \
git add apps/ios/Meeshy/Features/Main/Riviere/View/RiverLiftedRowProvider.swift \
        apps/ios/Meeshy/Features/Main/Riviere/View/RiverStreamHost.swift \
        apps/ios/Meeshy/Features/Main/Riviere/View/RiverConversationHost.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+RiverLongPress.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/MeeshyTests/Unit/Riviere/RiverLiftedRowProviderTests.swift \
        apps/ios/MeeshyTests/Unit/Riviere/RiverLongPressWiringTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git status --short apps/ios/Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift
```
- Si la dernière commande affiche ` M` (l'étape 3g a modifié le fichier), ajouter ce chemin : `git add apps/ios/Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift`.
- Puis, en remplaçant `AVANT` et `APRÈS` par les valeurs relevées :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
git commit -m "feat(ios): la Rivière remet sa bulle à l'overlay commun, convertie du pane vers la fenêtre (#5983)" \
  -m "RiverLiftedRowProvider, tenu en @State par RiverConversationHost et inscrit sous .river dans le lien faible, garde les cadres publiés (repère du pane) et la disposition (origine du pane, contenus, largeur). Il rend la bulle en présentation .lifted au cadre fenêtre, alignée trailing pour le lecteur, nil hors cadre ou pour un avis. RiverStreamHost efface la bulle présentée et pose l'appui long ; ConversationView le passe seulement drapeau actif (riverLongPressHandler), sans cadre : la Rivière ne recentre jamais. La liste compacte Rivière suit le mode courant (menuContext isRiver)." \
  -m "Budget D4 : ConversationView.swift AVANT → APRÈS (Δ −11). Les fermetures onOpenProfile et onViewStory du montage Rivière sont relocalisées telles quelles en méthodes ; aucune garde ne les lit." \
  -m "Refs #5983" \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK" && \
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```
Attendu : `git show --stat` liste les huit (ou neuf) chemins, et seulement eux.

---

### Tâche 20 : L'appui long en Rivière est vérifié au simulateur, drapeau allumé et éteint, sur iOS 26 et iOS 18

Vérification sans code : les étapes suivent la matrice §9.3 (colonne Rivière) et remplacent le cycle rouge-vert. Chaque constat est une capture nommée. Aucune issue ne se ferme ici (Tâche 24).

**Fichiers :**
- Aucun fichier du dépôt.
- Captures : `/Users/smpceo/Documents/meeshy-longpress-captures/riviere-ios26/`, `…/riviere-ios18/` (hors dépôt).
- Compte rendu : `/Users/smpceo/Documents/meeshy-longpress-captures/riviere-compte-rendu.md` (entrée de `gh issue comment`, hors dépôt).

**Interfaces :**
- Consomme : Tâches 18 et 19 poussées ; les commandes S0 à S11 de cette partie ; simulateurs `Meeshy-LongPress` et `Meeshy-LongPress-18` (Tâche 1).
- Produit : un commentaire sur #5983, qui liste chaque constat ✓/✗ avec le chemin de sa capture.

- [ ] **Étape 1 : Construire et installer**
  1. S0, puis S1 (`** BUILD SUCCEEDED **`).
  2. S3, S4 et S5 sur `Meeshy-LongPress`.
  3. S6 : le relevé doit montrer la liste des conversations (plusieurs nœuds).

- [ ] **Étape 2 : Atteindre la Rivière**
  1. Ouvrir une conversation de GROUPE (S6, puis S7 tap sur son nom).
  2. S11 → « Script ». Noter en texte le libellé de la bulle la plus HAUTE du relevé S6 : c'est le repère du point 7 de l'étape 3.
  3. S11 → « Rivière ». Cas BLOQUÉ : voir S11.
  4. S8 `r0-riviere.png`.

- [ ] **Étape 3 : Matrice drapeau ALLUMÉ** (S6 pour chaque coordonnée ; capture S8 environ une seconde après le geste)

Pour chaque point, le geste, puis la capture et le constat attendu.

1. **Texte court.** S7 appui long sur le texte d'une bulle d'une autre voix.
   - `r1-ouvert.png` : voile flouté ; à la place exacte de la bulle, la MÊME bulle Rivière (contour de couloir, identité, heure en base, même largeur), jamais une bulle du Fil ni un aperçu réduit.
   - Au-dessus, la barre de réactions 2× sans fond, en vague.
   - Dessous, la liste compacte : « Ouvrir dans le fil », « Répondre », puis les actions habituelles.
   - Une seule bulle visible : la bulle d'origine est effacée, pas doublée.
   - Toucher le voile loin du menu. `r1-ferme.png` : la bulle réapparaît, rien n'a bougé.
2. **Actions de la liste compacte.**
   - « Ouvrir dans le fil » : le mode passe à Script, sur le message. `r2-ouvrir-fil.png`.
   - Revenir en Rivière (S11), appui long, « Répondre » : Script, composeur en mode réponse. `r2-repondre.png`.
3. **Texte long** (bulle plus haute que l'écran, si la conversation en a une).
   - `r3-long.png` : la bulle sous la barre, le menu posé en verre sur sa partie basse (règle 5).
   - Sinon noter « non disponible ».
4. **Message à effet d'apparition.** Appui long.
   - `r4-effet.png` : aucun effet ne se rejoue. `RiverBubbleView` ne monte pas `MessageEffectsModifier` : le constat attendu est « rien ne se joue », ni dans le flux ni dans la copie.
5. **Clavier levé.**
   1. S6 : repérer le champ du composeur (`TextField`, en bas), S7 tap : le clavier monte, `r5-clavier.png`.
   2. Appui long sur une bulle. `r5-ouvert.png` : clavier baissé AVANT l'overlay, bulle à sa place.
   3. Toucher le voile. `r5-ferme.png` : le clavier remonte.
6. **Message en bas d'écran** (la bulle la plus proche du composeur).
   - `r6-bas.png` : le pane Rivière n'a pas défilé sous le voile ; le bloc barre-bulle-menu a glissé d'un seul tenant pour tenir à l'écran (règle 4).
7. **La liste cachée du Fil ne défile pas.**
   1. Refaire le point 6 et fermer.
   2. S11 → « Script ». S6 : la bulle la plus haute a le MÊME libellé que le repère de l'étape 2, et non le message pressé en Rivière. `r7-fil-intact.png`.
   3. S11 → « Rivière ».
8. **VoiceOver.** S9 :
   - la clé `custom_actions` existe (compte global non nul) ;
   - la bulle pressée au point 1 liste « Ouvrir dans le fil », « Répondre », « Copier ».
   - Coller la sortie dans le compte rendu.
9. **Appui long sur le NOM** d'une tête de groupe.
   - `r9-nom.png` : le menu s'ouvre ; au relâcher, la fiche de profil ne s'ouvre PAS par-dessus.
   - Si elle s'ouvre, le défaut est RÉEL (geste simultané avec le bouton du nom) : le noter ✗, et exécuter l'étape 6.
10. **Gestes voisins.** Menu fermé :
    - S7 glissé horizontal de 120 pt sur le pane : le curseur change de couloir ;
    - S7 tap sur une bulle : le curseur s'y pose, sans menu ;
    - pincement, `python3 ~/.claude/skills/ios-simulator/scripts/gesture.py --pinch out --udid "$SIM"` : les couloirs s'élargissent.
    - `r10-gestes.png`.

- [ ] **Étape 4 : Drapeau ÉTEINT, puis iOS 18**
  1. S10 (éteindre). Rouvrir la même conversation ; S11 → « Rivière » si le mode n'est pas resté.
  2. S7 appui long sur une bulle. `r-off-menu.png` : le menu contextuel NATIF, trois actes (« Ouvrir dans le fil », « Répondre », « Copier ») ; ni barre de réactions, ni voile de l'overlay.
  3. S9 : coller la sortie telle quelle.
  4. S10 (rallumer).
  5. Refaire S3, S4 et S5 sur `Meeshy-LongPress-18` (S2 variante iOS 18 dans chaque bloc), captures dans `riviere-ios18/`.
  6. Refaire l'étape 2, puis les points 1, 5, 8 de l'étape 3 et le point 2 ci-dessus.

- [ ] **Étape 5 : Écrire le compte rendu**

Écrire `/Users/smpceo/Documents/meeshy-longpress-captures/riviere-compte-rendu.md`. Il comprend :
- une ligne par constat : identifiant, simulateur, ✓/✗, chemin de la capture ;
- les sorties S9 ;
- la mention du cas BLOQUÉ s'il s'est produit.

Puis :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
gh issue comment 5983 --repo isopen-io/meeshy \
  --body-file /Users/smpceo/Documents/meeshy-longpress-captures/riviere-compte-rendu.md
```
Attendu : l'URL du commentaire.
- Pas de commit : aucun fichier du dépôt n'a changé (`git status --short` vide).
- Les captures restent sur disque ; la Tâche 24 les joint au commentaire de clôture.

- [ ] **Étape 6 (seulement si un constat est ✗) : ouvrir l'issue du défaut mesuré**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
URL=$(gh issue create --repo isopen-io/meeshy \
  --title "<résultat attendu, ex. : Un appui long sur le nom d'une voix en Rivière n'ouvre plus sa fiche par-dessus le menu>" \
  --body "Contexte : vérification simulateur de #5983 (Tâche 20). Preuve : <capture>. Critère de fin : le constat <id> est ✓ sur Meeshy-LongPress et Meeshy-LongPress-18." \
  --milestone "L'appui long montre le message tel qu'on le lit, dans les quatre modes") && \
gh project item-add 1 --owner isopen-io --url "$URL" && echo "$URL"
```
Remplacer les deux gabarits `<…>` par le constat mesuré avant d'exécuter. Citer l'URL dans le compte rendu.

---

### Tâche 21 : Une loi dit quand le double tap d'une rangée Script ouvre toutes les options

**Fichiers :**
- Créer : `apps/ios/Meeshy/Features/Main/Focal/Gestures/ScriptDoubleTapEligibility.swift`
- Test : `apps/ios/MeeshyTests/Unit/Focal/ScriptDoubleTapEligibilityTests.swift` (neuf)

**Interfaces :**
- Consomme :
  - `QuickReactionGesture.acceptsDoubleTap(kind: BubbleContent.Kind) -> Bool` (`ThemedMessageBubble.swift:65`, existant) ;
  - `ConversationReadingMode` (`typealias` de `ReadingModeOrchestrator.ConversationReadingMode` : `.focal`, `.script`, `.summary`, `.river`, `.bubbles`) ;
  - `BubbleContent.Kind` (`.standard`, `.deleted`, `.burned`, `.ephemeralExpired`, `.system`).
- Produit :
  ```swift
  nonisolated enum ScriptDoubleTapEligibility {
      static func accepts(mode: ConversationReadingMode, kind: BubbleContent.Kind, flag: Bool) -> Bool
  }
  ```

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Focal/ScriptDoubleTapEligibilityTests.swift` :

```swift
import XCTest
@testable import Meeshy

/// #5984, D6 — le double tap d'une rangée ouvre TOUTES les options en Script, et
/// nulle part ailleurs. La loi délègue la nature du message à
/// `QuickReactionGesture.acceptsDoubleTap(kind:)` : ce fichier prouve la
/// délégation, pas une seconde écriture de la règle.
@MainActor
final class ScriptDoubleTapEligibilityTests: XCTestCase {

    private static let everyKind: [BubbleContent.Kind] = [.standard, .deleted, .burned, .ephemeralExpired, .system]

    func test_accepts_scriptStandardMessageWithTheFlag_isTrue() {
        XCTAssertTrue(ScriptDoubleTapEligibility.accepts(mode: .script, kind: .standard, flag: true))
    }

    func test_accepts_everyOtherReadingMode_isFalse() {
        for mode in [ConversationReadingMode.focal, .bubbles, .summary, .river] {
            XCTAssertFalse(
                ScriptDoubleTapEligibility.accepts(mode: mode, kind: .standard, flag: true),
                "\(mode) : en Bulles le double tap reste la barre de réaction rapide, en Focal il n'existe pas (§10)."
            )
        }
    }

    func test_accepts_nonStandardMessages_isFalse() {
        for kind in [BubbleContent.Kind.system, .deleted, .burned, .ephemeralExpired] {
            XCTAssertFalse(
                ScriptDoubleTapEligibility.accepts(mode: .script, kind: kind, flag: true),
                "\(kind) : rien à y faire, et un avis garde l'action propre de sa carte (§8)."
            )
        }
    }

    func test_accepts_flagOff_isFalse() {
        XCTAssertFalse(
            ScriptDoubleTapEligibility.accepts(mode: .script, kind: .standard, flag: false),
            "Drapeau éteint : aucun geste nouveau avant validation (D2)."
        )
    }

    func test_accepts_exactlyOneCombination_isTrue() {
        let accepted = ConversationReadingMode.allCases.flatMap { mode in
            Self.everyKind.flatMap { kind in
                [true, false].filter { flag in ScriptDoubleTapEligibility.accepts(mode: mode, kind: kind, flag: flag) }
            }
        }
        XCTAssertEqual(
            accepted.count, 1,
            "Non-vacuité : sur 5 modes × 5 natures × 2 états du drapeau, une seule combinaison ouvre le menu."
        )
    }

    func test_accepts_inScriptWithTheFlag_followsTheQuickReactionLaw_forEveryKind() {
        for kind in Self.everyKind {
            XCTAssertEqual(
                ScriptDoubleTapEligibility.accepts(mode: .script, kind: kind, flag: true),
                QuickReactionGesture.acceptsDoubleTap(kind: kind),
                "\(kind) : la nature du message se lit chez `QuickReactionGesture`, jamais réécrite ici."
            )
        }
    }
}
```

- [ ] **Étape 2 : Lancer le test et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/ScriptDoubleTapEligibilityTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-ScriptDoubleTapEligibilityTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC de compilation — `ScriptDoubleTapEligibilityTests.swift:…: error: cannot find 'ScriptDoubleTapEligibility' in scope`.

- [ ] **Étape 3 : Implémentation minimale**

Créer `apps/ios/Meeshy/Features/Main/Focal/Gestures/ScriptDoubleTapEligibility.swift`. Le dossier `Gestures/` est neuf ; `project.yml` inclut `Meeshy/` récursivement, donc `xcodegen generate` le prend.

```swift
import Foundation

/// **Le double tap d'une rangée Script ouvre TOUTES les options** (#5984, D6).
///
/// Une loi plutôt qu'un `if` dans la cellule. Elle DÉLÈGUE la nature du message
/// à `QuickReactionGesture.acceptsDoubleTap(kind:)`, la règle du double tap de
/// la bulle, et n'ajoute que ce qui distingue ce geste : le mode Script et le
/// drapeau de l'appui long.
///
/// - Focal, Bulles, Résumé, Rivière : `false`. En Bulles, le double tap reste la
///   barre de réaction rapide ; en Focal, il n'existe pas (§10).
/// - `.system`, `.deleted`, `.burned`, `.ephemeralExpired` : `false`. Rien à y
///   faire, et un avis garde l'action propre de sa carte (§8).
/// - Drapeau éteint : `false`. Aucun geste nouveau avant validation (D2). Le
///   drapeau est REÇU : l'hôte de la liste ne lit aucun drapeau.
nonisolated enum ScriptDoubleTapEligibility {

    static func accepts(mode: ConversationReadingMode, kind: BubbleContent.Kind, flag: Bool) -> Bool {
        mode == .script && QuickReactionGesture.acceptsDoubleTap(kind: kind) && flag
    }
}
```

- [ ] **Étape 4 : Lancer le test et constater le succès**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/ScriptDoubleTapEligibilityTests \
  -only-testing:MeeshyTests/BubbleContentMatrixTests \
  -only-testing:MeeshyTests/FocalNoBubbleSourceGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-ScriptDoubleTapEligibilityTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : les 6 tests de `ScriptDoubleTapEligibilityTests` `passed`, `Executed N tests, with 0 failures`, 3 classes distinctes dans le journal.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
test "$(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj)" -eq "$(( $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources') + 4 ))" && echo "pbxproj +4 OK (2 fichiers neufs × 2 lignes)" && \
git add apps/ios/Meeshy/Features/Main/Focal/Gestures/ScriptDoubleTapEligibility.swift \
        apps/ios/MeeshyTests/Unit/Focal/ScriptDoubleTapEligibilityTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git status --short apps/ios/Meeshy/Features/Main/Focal/Gestures/ && \
git commit -m "feat(ios): une loi dit quand le double tap d'une rangée Script ouvre toutes les options (#5984)" \
  -m "ScriptDoubleTapEligibility.accepts(mode:kind:flag:) = mode Script, nature acceptée par QuickReactionGesture.acceptsDoubleTap(kind:), drapeau reçu. Une seule combinaison sur cinquante ouvre le menu ; la nature du message est déléguée, jamais réécrite." \
  -m "Refs #5984" \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK" && \
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```
Attendu :
- `git status --short` affiche le fichier neuf avant le commit (le `.gitignore` ne masque pas `Gestures/`) ;
- `git show --stat` liste les trois chemins.

---

### Tâche 22 : En Script, un double tap sur une rangée ouvre toutes les options

**Fichiers :**
- Créer :
  - `apps/ios/Meeshy/Features/Main/Focal/Gestures/ScriptMessageDoubleTap.swift`
  - `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ScriptDoubleTap.swift`
  - `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+MessageGroup.swift` (relocalisation D4)
  - `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScriptDoubleTap.swift`
- Modifier :
  - `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift`
    - `:195` : rappel ajouté sous `onLongPress` ;
    - corps de `makeRowContent` (Tâche 14) : ancre `focalRow.equatable()` ;
    - `:1044-1078` : `messageIdsInGroup(endingAt:)` sort du fichier.
  - `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`
    - `:560` : propriété ;
    - `:649` et `:763` : relais du rappel au montage et à la mise à jour.
  - `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (montage de `MessageListView`)
    - ajout avant `onToggleReaction:` ;
    - la fermeture `onRetry` sort du fichier.
  - `apps/ios/Meeshy/Localizable.xcstrings` : clé neuve `a11y.message.actions.all_options`, avant `a11y.message.actions.forward`.
- Test :
  - `apps/ios/MeeshyTests/Unit/Focal/ScriptDoubleTapWiringTests.swift` (neuf)
  - `apps/ios/MeeshyTests/Unit/LocalizationConsistencyTests+ScriptDoubleTap.swift` (neuf, extension de la suite existante)
- Budget D4, compensation désignée pour la réconciliation :
  - **`MessageListViewController.swift` : +3 −35 = Δ −32.**
    - Relocalisation pure de `messageIdsInGroup(endingAt:)` avec son `// MARK:` et son doc-comment.
    - Preuve : `git grep -n messageIdsInGroup -- apps/ios/MeeshyTests` ne rend que `MessageGroupLanguageFanOutTests.swift`, qui APPELLE la méthode sur un contrôleur (comportement) et ne lit aucun texte source.
    - Repli, si une tâche antérieure l'a déjà déplacée : `focalFocusTimestamp(for:)` (16 lignes, Δ −13). `FocalFocusedRowDetailsGuardTests` ne lit que son APPEL, qui reste.
  - **`ConversationView.swift` : +1 −7 = Δ −6.**
    - Relocalisation de la fermeture `onRetry` du montage de la liste.
    - Preuve : `git grep -n "onRetry: { messageId" -- apps/ios/MeeshyTests` rend 0 ; `retryMessage(messageId` n'apparaît que dans `ConversationViewModelOfflineQueueTests.swift`, qui ne lit pas `ConversationView.swift`.
  - Blocs déjà pris ailleurs, donc écartés : `HeaderSearchGlyph` (P2), `cellFrameInWindow`, `ConversationHeaderState`, `PreviewMedia` (P3).

**Interfaces :**
- Consomme :
  ```swift
  // Tâche 21
  ScriptDoubleTapEligibility.accepts(mode: ConversationReadingMode, kind: BubbleContent.Kind, flag: Bool) -> Bool
  // Tâche 14 (P3)
  func makeRowContent(localId: String, forLiftedCopy: Bool) -> MessageRowContent?   // `focalRow` et `forLiftedCopy` en portée de l'ancre
  // Tâche 4
  func presentLongPressMenu(for message: Message, cellFrame: CGRect?, style: LongPressPresentationStyle = .longPress)
  // Tâche 2 — lu par ConversationView SEULE
  MeeshyFeatureFlags.isLiftedRowLongPressEnabled
  // Tâche 16 (P3) — rendu de la présentation `.scriptDoubleTap`
  LiftedMessageOverlay(style:optionSections:…) ; MessageOptionsGlassMenu(sections:accentHex:maxHeight:onPrimary:onMore:)
  // existants
  MessageListViewController.cellFrameInWindow(messageId:)   // relocalisé par P3, même type
  EquatableFocalRow.row: FocalRow ; FocalRow.input: FocalRowInput ; FocalRowInput.content: BubbleContent ; BubbleContent.messageId, .kind
  ```
- Produit :
  ```swift
  struct ScriptMessageDoubleTap: ViewModifier { let isEnabled: Bool; let onOpen: () -> Void }
  // MessageListViewController
  var onScriptDoubleTap: ((String, CGRect?) -> Void)?
  func scriptDoubleTap(for row: EquatableFocalRow, isLiftedCopy: Bool) -> ScriptMessageDoubleTap
  // MessageListView
  var onScriptDoubleTap: ((String, CGRect?) -> Void)?
  // ConversationView (ConversationView+ScriptDoubleTap.swift)
  var scriptDoubleTapHandler: ((String, CGRect?) -> Void)? { get }   // nil drapeau éteint
  func presentScriptDoubleTapMenu(messageId: String, cellFrame: CGRect?)
  func retryFailedMessage(_ messageId: String)
  // Catalogue
  "a11y.message.actions.all_options" = « Toutes les options » (7 locales)
  ```

- [ ] **Étape 1 : Écrire les tests qui échouent**

Créer `apps/ios/MeeshyTests/Unit/Focal/ScriptDoubleTapWiringTests.swift` :

```swift
import XCTest
@testable import Meeshy

/// #5984 — le double tap Script traverse une cellule UIKit hébergeant du SwiftUI
/// et deux vues que ce dépôt ne monte pas : garde de SOURCE sur l'UNITÉ de chaque
/// type (`AppSourceGuard.unit`, qui inclut les extensions `Type+…`). La loi,
/// elle, est testée par son comportement (`ScriptDoubleTapEligibilityTests`).
@MainActor
final class ScriptDoubleTapWiringTests: XCTestCase {

    private func normalized(_ relativeToAppRoot: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relativeToAppRoot))
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func raw(_ relativeToAppRoot: String) throws -> String {
        try AppSourceGuard.unit(relativeToAppRoot)
    }

    // MARK: - La rangée plate porte le geste

    func test_flatRow_carriesTheScriptDoubleTap_onItsEquatableAnchor() throws {
        // Le modificateur se pose sur la ligne suivante (forme retenue) ou sur la
        // même ligne : les deux se lisent pareil une fois le raccord normalisé.
        let code = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
            .replacingOccurrences(of: "focalRow.equatable() .modifier(", with: "focalRow.equatable().modifier(")
        XCTAssertTrue(
            code.contains("focalRow.equatable().modifier(scriptDoubleTap(for: focalRow, isLiftedCopy: forLiftedCopy))"),
            "Le geste se pose sur la rangée plate de `makeRowContent`, derrière la porte `.equatable()`."
        )
    }

    func test_scriptDoubleTap_isGatedByTheLaw_theSelection_andTheLiftedCopy() throws {
        let code = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(code.contains("isEnabled: !isLiftedCopy && !isSelectionModeActive && ScriptDoubleTapEligibility.accepts("))
        XCTAssertTrue(code.contains("kind: content.kind, flag: onScriptDoubleTap != nil"))
        XCTAssertTrue(
            code.contains("self.onScriptDoubleTap?(messageId, self.cellFrameInWindow(messageId: messageId))"),
            "Le cadre voyage AVEC l'appel, résolu côté UIKit — même patron que `longPressHandler`."
        )
    }

    func test_controllerUnit_neverReadsAFeatureFlag() throws {
        let code = try raw("Meeshy/Features/Main/Views/MessageListViewController+ScriptDoubleTap.swift")
        XCTAssertFalse(
            code.contains("MeeshyFeatureFlags"),
            "L'hôte de la liste ne décide d'aucun drapeau : il le reçoit par la présence du rappel."
        )
    }

    func test_controllerAndListView_relayTheCallback_onMountAndUpdate() throws {
        let controller = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(controller.contains("var onScriptDoubleTap: ((String, CGRect?) -> Void)?"))

        let listView = try normalized("Meeshy/Features/Main/Views/MessageListView.swift")
        XCTAssertTrue(listView.contains("var onScriptDoubleTap: ((String, CGRect?) -> Void)?"))
        XCTAssertEqual(
            listView.components(separatedBy: "vc.onScriptDoubleTap = onScriptDoubleTap").count - 1, 2,
            "Relayé à la création ET à chaque mise à jour, comme `onAddReaction`."
        )
    }

    // MARK: - Le modificateur

    func test_scriptDoubleTap_installsNothingWhenDisabled_andAddsNoHaptic() throws {
        let code = try normalized("Meeshy/Features/Main/Focal/Gestures/ScriptMessageDoubleTap.swift")
        XCTAssertTrue(code.contains("TapGesture(count: 2).onEnded { onOpen() }, including: isEnabled ? .all : .subviews"))
        XCTAssertFalse(code.contains("HapticFeedback"), "Aucune haptique propre : l'overlay garde la sienne (§5.1).")
        XCTAssertTrue(
            code.contains(".accessibilityActions { if isEnabled {"),
            "VoiceOver reçoit l'action seulement quand le geste existe — jamais une action qui ne fait rien."
        )
        XCTAssertTrue(code.contains("\"a11y.message.actions.all_options\""))
    }

    // MARK: - La conversation ouvre toutes les options

    func test_conversationView_mountsTheHandlerOnTheList() throws {
        let view = try normalized("Meeshy/Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(view.contains("onScriptDoubleTap: scriptDoubleTapHandler, onToggleReaction:"))
    }

    /// Lu dans le fichier DÉDIÉ, jamais dans l'unité : `ConversationView+RiverLongPress.swift`
    /// porte la même garde de drapeau et satisferait l'assertion sans ce câblage.
    func test_scriptDoubleTapHandler_isNilWhenTheFlagIsOff_andOpensAllOptionsBehindTheLongPressGuards() throws {
        let code = try normalized("Meeshy/Features/Main/Views/ConversationView+ScriptDoubleTap.swift")
        XCTAssertTrue(
            code.contains("guard MeeshyFeatureFlags.isLiftedRowLongPressEnabled else { return nil } return presentScriptDoubleTapMenu(messageId:cellFrame:)"),
            "Drapeau éteint, la liste reçoit `nil` et n'installe aucun double tap."
        )
        XCTAssertTrue(
            code.contains("guard MeeshyFeatureFlags.isLiftedRowLongPressEnabled, overlayState.longPressEnabled, overlayState.quickReactionMessageId == nil, !overlayState.isSelectionModeActive,"),
            "Mêmes gardes que l'appui long, plus la sélection et le drapeau relus AU GESTE."
        )
        XCTAssertTrue(code.contains("presentLongPressMenu(for: msg, cellFrame: cellFrame, style: .scriptDoubleTap)"))
        XCTAssertFalse(code.contains("focusTrigger"), "Le clavier ne se relève que par `raiseComposerKeyboardIfMounted()` (contrainte P1).")
    }

    // MARK: - La présentation complète est rendue par l'overlay (Tâche 16)

    func test_liftedOverlay_rendersEveryOptionInGlass_forTheScriptDoubleTap() throws {
        let overlay = try normalized("Meeshy/Features/Main/Components/LiftedMessageOverlay.swift")
        XCTAssertTrue(overlay.contains("MessageOptionsGlassMenu("), "Le double tap Script ouvre TOUTES les options, en verre (D6).")

        let host = try normalized("Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift")
        XCTAssertTrue(
            host.contains("MessageActionResolver.allOptionSections("),
            "Les sections viennent de la loi `allOptionSections`, jamais d'une liste recopiée (§7.2)."
        )
    }
}
```

Créer `apps/ios/MeeshyTests/Unit/LocalizationConsistencyTests+ScriptDoubleTap.swift` :

```swift
import XCTest

/// #5984 — l'action VoiceOver du double tap Script, « Toutes les options », est
/// une clé NEUVE : aucune clé existante ne dit « toutes » (`a11y.message.actions
/// .long_press` dit « Plus d'options », l'action de l'appui long). L'édition du
/// catalogue est textuelle : cette garde la relit par le même lecteur que la
/// suite, pour prouver qu'aucune locale n'a été oubliée.
extension LocalizationConsistencyTests {

    func test_scriptAllOptionsKey_isTranslatedInAllSevenShippedLocales() throws {
        let env = try makeEnvironment()
        let shipped = try shippedLocales(repoRoot: env.repoRoot)
        let key = "a11y.message.actions.all_options"

        guard let translated = env.appCatalog.translations[key] else {
            return XCTFail("`\(key)` est absent du catalogue — VoiceOver prononcerait l'identifiant brut.")
        }
        XCTAssertEqual(
            env.appCatalog.sourceValues[key], "Toutes les options",
            "La valeur française du catalogue doit être le `defaultValue` du code."
        )
        let manquantes = shipped.subtracting(translated).sorted()
        XCTAssertTrue(manquantes.isEmpty, "`\(key)` manque dans : \(manquantes.joined(separator: ", ")).")
    }
}
```

- [ ] **Étape 2 : Lancer les tests et constater l'échec**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/ScriptDoubleTapWiringTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests/test_scriptAllOptionsKey_isTranslatedInAllSevenShippedLocales \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-ScriptDoubleTapWiringTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu : ÉCHEC. Le bundle compile (gardes de source seulement) et les tests rougissent :
- `test_flatRow_carriesTheScriptDoubleTap_onItsEquatableAnchor`, `test_scriptDoubleTap_isGatedBy…`, `test_controllerAndListView_relay…`, `test_conversationView_mountsTheHandlerOnTheList` : `failed` (ancres absentes) ;
- `test_controllerUnit_neverReadsAFeatureFlag`, `test_scriptDoubleTap_installsNothing…` et `test_scriptDoubleTapHandler_isNilWhenTheFlagIsOff…` : `failed`, fichier introuvable (`The file … couldn't be opened`) ;
- `test_scriptAllOptionsKey_isTranslatedInAllSevenShippedLocales` : `failed`, « `a11y.message.actions.all_options` est absent du catalogue » ;
- `test_liftedOverlay_rendersEveryOptionInGlass_forTheScriptDoubleTap` : VERT si la Tâche 16 rend déjà la présentation complète. S'il rougit, **s'arrêter** : ce rendu appartient à `LiftedMessageOverlay` (Tâche 16, `optionSections: [OptionSection]`) et doit être livré avant de câbler le geste qui l'ouvre.

- [ ] **Étape 3 : Implémentation minimale**

**3a — Relever le budget et la présence du bloc de compensation :**
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
wc -l apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift apps/ios/Meeshy/Features/Main/Views/ConversationView.swift && \
grep -c "func messageIdsInGroup(endingAt lastLocalId: String)" apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift
```
- Noter `AVANT_MLVC` et `AVANT_CV`.
- Le compte doit valoir `1` : on suit 3f. S'il vaut `0`, une tâche antérieure a déplacé ce bloc : on suit 3f-bis.

**3b — Le modificateur.** Créer `apps/ios/Meeshy/Features/Main/Focal/Gestures/ScriptMessageDoubleTap.swift` :

```swift
import SwiftUI

/// **Le double tap d'une rangée Script** (#5984, D6), en TYPE NOMMÉ sur le patron
/// de `QuickReactionDoubleTap`. Un modificateur empilé dans la fermeture de
/// cellule enrichirait le type générique jusqu'au débordement de pile (#4361) ;
/// une branche `if` chez l'appelant changerait l'identité de la rangée à chaque
/// bascule.
///
/// **Éteint, il n'installe rien.** `including: .subviews` retire la
/// reconnaissance du double tap et laisse intacts les gestes des zones internes
/// (citation, média, drapeaux, réactions), qui gardent leur tap simple et gagnent
/// au premier tap (§5.2, assumé). Allumé, le double tap ne se reconnaît que sur
/// les zones NEUTRES de la rangée.
///
/// **Aucune haptique propre** : l'overlay garde son haptique d'apparition, et
/// n'en reçoit aucune de plus (§5.1).
///
/// VoiceOver reçoit le même acte par une action nommée, présente seulement quand
/// le geste l'est : jamais une action qui ne fait rien (loi 4).
struct ScriptMessageDoubleTap: ViewModifier {

    let isEnabled: Bool
    let onOpen: () -> Void

    func body(content: Content) -> some View {
        content
            .gesture(
                TapGesture(count: 2).onEnded { onOpen() },
                including: isEnabled ? .all : .subviews
            )
            .accessibilityActions {
                if isEnabled {
                    Button(
                        String(localized: "a11y.message.actions.all_options", defaultValue: "Toutes les options", bundle: .main),
                        action: onOpen
                    )
                }
            }
    }
}
```

**3c — La résolution côté contrôleur.** Créer `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ScriptDoubleTap.swift`.

Aucun nom de drapeau n'y figure, même en commentaire : `test_controllerUnit_neverReadsAFeatureFlag` lit le texte brut.

```swift
import SwiftUI
import MeeshySDK

// MARK: - Double tap d'une rangée Script (#5984)

extension MessageListViewController {

    /// Le geste de la rangée plate, résolu depuis la rangée ELLE-MÊME : l'id et la
    /// nature du message viennent de son `BubbleContent`, jamais d'un second calcul.
    ///
    /// `isEnabled` réunit trois conditions :
    /// - la loi `ScriptDoubleTapEligibility` ;
    /// - le mode sélection, éteint (une seule intention à la fois, #4005) ;
    /// - la rangée n'est pas la copie remontée, qui ne reçoit jamais le geste.
    ///
    /// Le drapeau n'est pas lu ici : il est REÇU. La conversation ne pose
    /// `onScriptDoubleTap` que lorsqu'il est actif, l'hôte de la liste ne décide
    /// d'aucun drapeau.
    ///
    /// Le cadre voyage AVEC l'appel, résolu côté UIKit (`cellFrameInWindow`), comme
    /// pour `longPressHandler`.
    func scriptDoubleTap(for row: EquatableFocalRow, isLiftedCopy: Bool) -> ScriptMessageDoubleTap {
        let content = row.row.input.content
        let messageId = content.messageId
        return ScriptMessageDoubleTap(
            isEnabled: !isLiftedCopy
                && !isSelectionModeActive
                && ScriptDoubleTapEligibility.accepts(
                    mode: readingMode,
                    kind: content.kind,
                    flag: onScriptDoubleTap != nil
                ),
            onOpen: { [weak self] in
                guard let self else { return }
                self.onScriptDoubleTap?(messageId, self.cellFrameInWindow(messageId: messageId))
            }
        )
    }
}
```

**3d — Le rappel du contrôleur.** Dans `MessageListViewController.swift`, remplacer :
```swift
    var onLongPress: ((String, CGRect?) -> Void)?
    /// iOS 26+ : builder du contenu `.contextMenu` NATIF (Liquid Glass) d'une
```
par :
```swift
    var onLongPress: ((String, CGRect?) -> Void)?
    /// #5984 — double tap d'une rangée Script : id et cadre fenêtre ; `nil` éteint le geste.
    var onScriptDoubleTap: ((String, CGRect?) -> Void)?
    /// iOS 26+ : builder du contenu `.contextMenu` NATIF (Liquid Glass) d'une
```

**3e — Le geste sur l'ancre de la rangée plate** (corps de `makeRowContent`, Tâche 14) :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && grep -n "focalRow.equatable()" apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift
```
Attendu : UNE ligne, dans `makeRowContent`.
- **Forme retenue, l'ancre est seule sur sa ligne** (`<indentation>focalRow.equatable()`). Edit : `old_string` = la ligne relevée, indentation comprise, et la ligne qui la suit ; `new_string` = les mêmes lignes, avec entre elles `<indentation + 4 espaces>.modifier(scriptDoubleTap(for: focalRow, isLiftedCopy: forLiftedCopy))`. La ligne `focalRow.equatable()` reste intacte : aucune garde qui l'épingle ne rougit (`ConversationViewReadingModeSourceGuardTests`, re-pointée par P3).
- **L'ancre est au milieu d'une ligne** (`{ focalRow.equatable() }`). Remplacer, sur cette ligne seulement, `focalRow.equatable()` par `focalRow.equatable().modifier(scriptDoubleTap(for: focalRow, isLiftedCopy: forLiftedCopy))`.
- Deux lignes relevées : appliquer la même forme aux deux (`forLiftedCopy` éteint déjà la copie).

**3f — Compensation D4 : `messageIdsInGroup` sort du contrôleur, telle quelle.** Dans `MessageListViewController.swift`, remplacer :
```swift
    // MARK: - Groupe de rangées (Script/Focal, #3919)

    /// Identifiants (ordre chronologique) du groupe qui se TERMINE au
    /// message `lastLocalId` — remonte `store.messages` tant que le message
    /// précédent CONTINUE le groupe (`MessageDayGrouping`, même règle que
    /// `isFirstInGroup`/`isLastInGroup`). Sert à appliquer un choix de langue
    /// posé sur le drapeau du DERNIER message à tout le groupe qu'il ferme.
    /// Portée non-`private` pour rester directement testable (même patron
    /// que `fireOrDeferRecoveryInvalidation` de `MessageListLayout`).
    func messageIdsInGroup(endingAt lastLocalId: String) -> [String] {
        guard let lastIndex = store.index(of: lastLocalId) else { return [lastLocalId] }
        var ids = [lastLocalId]
        var index = lastIndex
        while index > 0 {
            let current = store.messages[index]
            let previous = store.messages[index - 1]
            let isHead = MessageDayGrouping.isGroupHead(
                previous: .init(
                    senderId: previous.senderId,
                    isSystem: previous.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                    createdAt: previous.createdAt
                ),
                current: .init(
                    senderId: current.senderId,
                    isSystem: current.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                    createdAt: current.createdAt
                )
            )
            if isHead { break }
            ids.append(previous.localId)
            index -= 1
        }
        return ids
    }

    // MARK: - DataSource
```
par :
```swift
    // MARK: - DataSource
```
Créer `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+MessageGroup.swift` :
```swift
import Foundation
import MeeshySDK

// MARK: - Groupe de rangées (Script/Focal, #3919)

extension MessageListViewController {

    /// Identifiants (ordre chronologique) du groupe qui se TERMINE au
    /// message `lastLocalId` — remonte `store.messages` tant que le message
    /// précédent CONTINUE le groupe (`MessageDayGrouping`, même règle que
    /// `isFirstInGroup`/`isLastInGroup`). Sert à appliquer un choix de langue
    /// posé sur le drapeau du DERNIER message à tout le groupe qu'il ferme.
    /// Portée non-`private` pour rester directement testable (même patron
    /// que `fireOrDeferRecoveryInvalidation` de `MessageListLayout`).
    func messageIdsInGroup(endingAt lastLocalId: String) -> [String] {
        guard let lastIndex = store.index(of: lastLocalId) else { return [lastLocalId] }
        var ids = [lastLocalId]
        var index = lastIndex
        while index > 0 {
            let current = store.messages[index]
            let previous = store.messages[index - 1]
            let isHead = MessageDayGrouping.isGroupHead(
                previous: .init(
                    senderId: previous.senderId,
                    isSystem: previous.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                    createdAt: previous.createdAt
                ),
                current: .init(
                    senderId: current.senderId,
                    isSystem: current.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                    createdAt: current.createdAt
                )
            )
            if isHead { break }
            ids.append(previous.localId)
            index -= 1
        }
        return ids
    }
}
```

**3f-bis — Repli (seulement si 3a a compté `0`) : `focalFocusTimestamp(for:)` sort du contrôleur, telle quelle.** Remplacer :
```swift
    /// Les détails du message en focus (identité, jour + heure, texte
    /// plafonné) — par UNE reconfiguration ciblée, jamais par frame : posés à
    /// la pose tant que la scène est active, rendus à l'aplatissement.
    /// Même loi et mêmes mots que le message en focus de la rangée.
    func focalFocusTimestamp(for sentAt: Date) -> String {
        FocalFocusTimestamp.label(
            sentAt: sentAt,
            timeString: TimeStringCache.shared.format(sentAt),
            now: Date(),
            calendar: .current,
            locale: .current,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui"),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier"),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier")
        )
    }

    /// JAMAIS un `apply` synchrone : cette méthode est appelée depuis des
```
par :
```swift
    /// JAMAIS un `apply` synchrone : cette méthode est appelée depuis des
```
Créer `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+FocalFocusTimestamp.swift` : `import Foundation` puis `extension MessageListViewController { … }`, qui contient les 16 lignes retirées (doc-comment et fonction), à l'identique. À l'étape 3j et à l'étape 5, remplacer `+MessageGroup` par `+FocalFocusTimestamp` ; le Δ attendu devient −14.

**3g — Le relais de `MessageListView`.** Dans `MessageListView.swift`, remplacer :
```swift
    var onAddReaction: ((String, CGRect?) -> Void)?
    /// Toggle a reaction emoji on a message (tap an existing reaction chip).
```
par :
```swift
    var onAddReaction: ((String, CGRect?) -> Void)?
    /// #5984 — double tap d'une rangée Script : id et cadre fenêtre ; `nil` éteint le geste.
    var onScriptDoubleTap: ((String, CGRect?) -> Void)?
    /// Toggle a reaction emoji on a message (tap an existing reaction chip).
```
Puis, avec `replace_all: true` (deux occurrences : `makeUIViewController` et `updateUIViewController`), remplacer :
```swift
        vc.onAddReaction = onAddReaction
```
par :
```swift
        vc.onAddReaction = onAddReaction
        vc.onScriptDoubleTap = onScriptDoubleTap
```

**3h — La conversation.** Créer `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScriptDoubleTap.swift` :
```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Double tap d'une rangée Script (#5984)

extension ConversationView {

    /// Posé sur la liste seulement drapeau actif. `nil` : la liste n'installe
    /// aucun double tap, et Script reste tel qu'aujourd'hui (D2).
    var scriptDoubleTapHandler: ((String, CGRect?) -> Void)? {
        guard MeeshyFeatureFlags.isLiftedRowLongPressEnabled else { return nil }
        return presentScriptDoubleTapMenu(messageId:cellFrame:)
    }

    /// **Le double tap d'une rangée Script ouvre TOUTES les options** (D6).
    ///
    /// C'est la même porte que l'appui long (`presentLongPressMenu`), en
    /// présentation `.scriptDoubleTap` : barre avec sa capsule, menu glass de
    /// toutes les options.
    ///
    /// Gardes :
    /// - celles de l'appui long du fil : écran prêt (`longPressEnabled`),
    ///   exclusivité de la barre de réaction rapide ;
    /// - le mode sélection (#4005) ;
    /// - le drapeau, relu AU GESTE : une cellule configurée avant une bascule ne
    ///   rouvre pas une porte refermée.
    func presentScriptDoubleTapMenu(messageId: String, cellFrame: CGRect?) {
        guard MeeshyFeatureFlags.isLiftedRowLongPressEnabled,
              overlayState.longPressEnabled,
              overlayState.quickReactionMessageId == nil,
              !overlayState.isSelectionModeActive,
              let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
        presentLongPressMenu(for: msg, cellFrame: cellFrame, style: .scriptDoubleTap)
    }

    /// Tap sur la bande orange d'un envoi ÉCHOUÉ. Relocalisé tel quel depuis la
    /// fermeture `onRetry` du montage de la liste (#5984, D4).
    ///
    /// `retryMessage` supprime la rangée échouée et renvoie avec le MÊME
    /// `clientMessageId` (déduplication passerelle), puis réveille le vidage de
    /// l'outbox : le renvoi part vraiment. L'ancienne remise à zéro de
    /// l'`OfflineQueue` locale ne vidait jamais sur un appareil au premier plan.
    func retryFailedMessage(_ messageId: String) {
        Task { await viewModel.retryMessage(messageId: messageId) }
    }
}
```
Dans `ConversationView.swift`, remplacer :
```swift
                onToggleReaction: { messageId, emoji in
```
par :
```swift
                onScriptDoubleTap: scriptDoubleTapHandler,
                onToggleReaction: { messageId, emoji in
```
Puis remplacer :
```swift
                onRetry: { messageId in
                    // Tap on the orange retry band of a FAILED outgoing message.
                    // `retryMessage` deletes the failed row and re-sends with the
                    // SAME clientMessageId (gateway dedup) AND kicks the outbox
                    // flusher — so the resend actually fires (the old local
                    // OfflineQueue reset never flushed on a foregrounded device).
                    Task { await viewModel.retryMessage(messageId: messageId) }
                },
```
par :
```swift
                onRetry: retryFailedMessage,
```

**3i — La clé du catalogue**, insérée à sa place alphabétique, par l'outil Edit et jamais par `json.dump`, qui réordonnerait le fichier. Dans `apps/ios/Meeshy/Localizable.xcstrings`, remplacer :
```json
    "a11y.message.actions.forward": {
```
par :
```json
    "a11y.message.actions.all_options": {
      "extractionState": "manual",
      "localizations": {
        "ar": {
          "stringUnit": {
            "state": "translated",
            "value": "جميع الخيارات"
          }
        },
        "de": {
          "stringUnit": {
            "state": "translated",
            "value": "Alle Optionen"
          }
        },
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "All options"
          }
        },
        "es": {
          "stringUnit": {
            "state": "translated",
            "value": "Todas las opciones"
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Toutes les options"
          }
        },
        "it": {
          "stringUnit": {
            "state": "translated",
            "value": "Tutte le opzioni"
          }
        },
        "pt-BR": {
          "stringUnit": {
            "state": "translated",
            "value": "Todas as opções"
          }
        }
      }
    },
    "a11y.message.actions.forward": {
```
Vérifier que le JSON reste valide :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && python3 -c "import json; json.load(open('apps/ios/Meeshy/Localizable.xcstrings')); print('xcstrings OK')"
```

**3j — Relever le budget :**
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && wc -l apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
```
Attendu :
- `MessageListViewController.swift` = `AVANT_MLVC − 32` (repli 3f-bis : `− 14`) ;
- `ConversationView.swift` = `AVANT_CV − 6`.

Tout Δ > 0 est un échec de la tâche.

- [ ] **Étape 4 : Lancer les tests et constater le succès**

Commande :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -only-testing:MeeshyTests/ScriptDoubleTapWiringTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -only-testing:MeeshyTests/ScriptDoubleTapEligibilityTests \
  -only-testing:MeeshyTests/ConversationViewReadingModeSourceGuardTests \
  -only-testing:MeeshyTests/BetaFeaturesReadingModesIntegrationTests \
  -only-testing:MeeshyTests/MessageGroupLanguageFanOutTests \
  -only-testing:MeeshyTests/FocalFocusedRowDetailsGuardTests \
  -only-testing:MeeshyTests/ConversationLongPressMenuGuardTests \
  -only-testing:MeeshyTests/CallDetailRoutingTests \
  -only-testing:MeeshyTests/ConversationMenuSystemDesignGuardTests \
  -only-testing:MeeshyTests/MessageMoreJumpsToViewsGuardTests \
  -only-testing:MeeshyTests/ConversationViewBodyTypeDepthTests \
  -only-testing:MeeshyTests/FocalNoBubbleSourceGuardTests \
  -only-testing:MeeshyTests/FixedFontSizeGuardTests \
  -only-testing:MeeshyTests/FileSizeBudgetGuardTests \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  2>&1 | tee /tmp/meeshy-longpress-ScriptDoubleTapWiringTests.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
```
Attendu :
- les 9 tests de `ScriptDoubleTapWiringTests` et `test_scriptAllOptionsKey_isTranslatedInAllSevenShippedLocales` `passed` ;
- `Executed N tests, with 0 failures` ;
- 15 noms de classes distincts dans le journal.

Deux gardes à suivre de près :
- `BetaFeaturesReadingModesIntegrationTests` prouve qu'aucun drapeau n'est entré dans la liste ;
- `MessageGroupLanguageFanOutTests` prouve que `messageIdsInGroup` sert toujours après son déménagement.

- [ ] **Étape 5 : Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
test "$(grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj)" -eq "$(( $(git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources') + 12 ))" && echo "pbxproj +12 OK (6 fichiers neufs × 2 lignes)" && \
git add apps/ios/Meeshy/Features/Main/Focal/Gestures/ScriptMessageDoubleTap.swift \
        apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ScriptDoubleTap.swift \
        apps/ios/Meeshy/Features/Main/Views/MessageListViewController+MessageGroup.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+ScriptDoubleTap.swift \
        apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift \
        apps/ios/Meeshy/Features/Main/Views/MessageListView.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Localizable.xcstrings \
        apps/ios/MeeshyTests/Unit/Focal/ScriptDoubleTapWiringTests.swift \
        apps/ios/MeeshyTests/Unit/LocalizationConsistencyTests+ScriptDoubleTap.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj && \
git commit -m "feat(ios): en Script, un double tap sur une rangée ouvre toutes les options (#5984)" \
  -m "ScriptMessageDoubleTap (TapGesture count 2, including .subviews quand il est éteint, sans haptique propre, action VoiceOver « Toutes les options ») se pose sur l'ancre focalRow.equatable() de makeRowContent. MessageListViewController+ScriptDoubleTap le résout depuis la rangée : loi ScriptDoubleTapEligibility, sélection éteinte, jamais sur la copie remontée, drapeau REÇU par la présence du rappel (aucun drapeau lu dans la liste). ConversationView ne pose onScriptDoubleTap que drapeau actif, puis présente en .scriptDoubleTap derrière les gardes de l'appui long. Clé a11y.message.actions.all_options, sept locales." \
  -m "Budget D4 : MessageListViewController.swift AVANT_MLVC → APRÈS (Δ −32, messageIdsInGroup relocalisée telle quelle dans +MessageGroup) ; ConversationView.swift AVANT_CV → APRÈS (Δ −6, fermeture onRetry relocalisée en retryFailedMessage). Aucune garde ne lit ces textes." \
  -m "Refs #5984" \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK" && \
git show --stat HEAD && git push origin claude/appui-long-rendu-du-mode
```
- Remplacer `AVANT_MLVC`, `AVANT_CV` et `APRÈS` par les valeurs relevées.
- Repli 3f-bis : remplacer `+MessageGroup.swift` par `+FocalFocusTimestamp.swift`, et le Δ par −14.
- Attendu : `git show --stat` liste les onze chemins, et seulement eux.

---

### Tâche 23 : Le double tap en Script est vérifié au simulateur, sans rien changer en Focal ni en Bulles, sur iOS 26 et iOS 18

Vérification sans code : les étapes suivent la ligne « double tap » de la matrice §9.3 et les mesures 1 et 5 qui la suivent. Chaque constat est une capture nommée. Aucune issue ne se ferme ici (Tâche 24).

**Fichiers :**
- Aucun fichier du dépôt.
- Captures : `/Users/smpceo/Documents/meeshy-longpress-captures/script-ios26/`, `…/script-ios18/` (hors dépôt).
- Compte rendu : `/Users/smpceo/Documents/meeshy-longpress-captures/script-compte-rendu.md` (entrée de `gh issue comment`, hors dépôt).

**Interfaces :**
- Consomme :
  - Tâches 21 et 22 poussées ;
  - le rendu `.scriptDoubleTap` de `LiftedMessageOverlay` (Tâche 16) ;
  - les commandes S0 à S11 ;
  - les simulateurs `Meeshy-LongPress` et `Meeshy-LongPress-18`.
- Produit : un commentaire sur #5984, qui liste chaque constat ✓/✗ avec le chemin de sa capture.

- [ ] **Étape 1 : Construire, installer, ouvrir une conversation en Script**
  1. S0, puis S1 (`** BUILD SUCCEEDED **` — la Tâche 22 a changé le code depuis la Tâche 20, on reconstruit).
  2. S4 sur `Meeshy-LongPress` (S3 et S5 déjà faits en Tâche 20 ; sinon les refaire).
  3. Ouvrir une conversation qui a, à l'écran ou en défilant :
     - un message texte d'une autre voix ;
     - un message avec citation ;
     - une image seule ;
     - un avis système.
  4. S11 → « Script ». `s0-script.png`.

- [ ] **Étape 2 : Matrice Script, drapeau ALLUMÉ** (S6 pour chaque coordonnée ; double tap = S7, trois essais, puis l'étape manuelle au trackpad ; capture S8 environ une seconde après le geste)

1. **Zone neutre d'un texte.** Double tap sur le TEXTE d'un message d'une autre voix (pas sur le nom, les drapeaux ni les réactions).
   - `s1-ouvert.png` : voile flouté.
   - La rangée plate, telle qu'on la lit (même retrait, même identité, jamais une bulle), posée à sa place.
   - La barre de réactions 2× AVEC sa capsule, centrée sur le bord HAUT de la rangée (à cheval).
   - Juste dessous, le menu en verre (iOS 26), en sections :
     - Rapides ;
     - Faire, avec « Supprimer » en dernier, en rouge ;
     - Infos ;
     - Modération.
   - Le compte rendu dit quel chemin a produit le double tap : `idb` ou trackpad.
2. **Défilement du menu.** Si le menu dépasse l'espace sous la rangée, un glissé vertical DANS le menu le fait défiler, et la conversation reste figée. `s2-defilement.png`.
3. **Une entrée « Infos ».** Toucher « Réactions » ou « Langue » : le menu se ferme, « Plus… » s'ouvre sur ce panneau. `s3-infos.png`. Fermer la feuille.
4. **Zones internes** (mesure §9.3-1), un double tap sur chacune :
   - **citation** : le premier tap mène au message cité, aucun menu ne s'ouvre — `s4-citation.png` ;
   - **image** : le premier tap ouvre le plein écran — `s4-media.png` ; fermer ;
   - **drapeau de langue ou chip de réaction** : le premier tap agit — `s4-bouton.png`.

   Noter à l'œil si le tap SIMPLE de ces zones a pris un retard perceptible par rapport au drapeau éteint (étape 3).
5. **Image seule.**
   - Double tap : le plein écran s'ouvre (aucune zone neutre) — `s5-image-double.png` ; fermer.
   - S7 appui long sur l'image : la liste compacte s'ouvre, jamais le menu complet — `s5-image-appui.png`.
6. **Avis système.** Double tap : aucun menu. L'action propre de la carte, s'il y en a une, est inchangée. `s6-systeme.png`.
7. **Clavier levé.**
   1. S7 tap sur le champ du composeur : le clavier monte.
   2. Double tap sur un texte. `s7-ouvert.png` : clavier baissé AVANT l'overlay.
   3. Toucher le voile. `s7-ferme.png` : le clavier remonte.
8. **Mode sélection.**
   1. S7 appui long sur un message, puis « Sélectionner ».
   2. Double tap sur un autre texte : seule la coche bascule, aucun menu. `s8-selection.png`.
   3. Quitter la sélection.
9. **VoiceOver.** S9 :
   - la rangée Script du point 1 liste « Toutes les options » (et l'existante « Plus d'options ») ;
   - l'avis système ne la liste pas ;
   - coller la sortie.

- [ ] **Étape 3 : Focal, Bulles, drapeau éteint, iOS 18**
  1. **Focal.** S11 → « Focal ». Double tap sur un texte : aucun overlay, rien de nouveau. `s-focal.png`. S9 : aucune « Toutes les options ».
  2. **Bulles.** S11 → « Bulles ». Double tap sur une bulle texte d'une autre voix : la barre de réaction rapide s'ouvre, comme avant. `s-bulles.png`.
  3. **Drapeau éteint.**
     1. S10 (éteindre). S11 → « Script ».
     2. Double tap sur un texte : rien. `s-off.png`.
     3. Refaire le point 4 de l'étape 2, sur la citation seulement, pour comparer le délai du tap simple.
     4. S9 : aucune « Toutes les options ».
     5. S10 (rallumer).
  4. **iOS 18.**
     - S3, S4 et S5 sur `Meeshy-LongPress-18`, captures dans `script-ios18/`.
     - Refaire les points 1, 4 (citation), 7 et 9 de l'étape 2.
     - Sur iOS 18, le menu s'affiche en matière (sans verre) : le noter.

- [ ] **Étape 4 : Compte rendu**

Écrire `/Users/smpceo/Documents/meeshy-longpress-captures/script-compte-rendu.md`. Il comprend :
- une ligne par constat : identifiant, simulateur, ✓/✗, chemin de la capture ;
- le chemin du double tap (`idb` ou trackpad) ;
- la note de délai des zones internes ;
- les sorties S9.

Puis :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
gh issue comment 5984 --repo isopen-io/meeshy \
  --body-file /Users/smpceo/Documents/meeshy-longpress-captures/script-compte-rendu.md
```
Attendu : l'URL du commentaire.
- `git status --short` reste vide : pas de commit.
- Les captures restent sur disque pour la Tâche 24.

- [ ] **Étape 5 (seulement si un constat est ✗) : ouvrir l'issue du défaut mesuré**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && \
URL=$(gh issue create --repo isopen-io/meeshy \
  --title "<résultat attendu, ex. : Un double tap sur une citation en Script ne retarde plus son tap simple>" \
  --body "Contexte : vérification simulateur de #5984 (Tâche 23). Preuve : <capture>. Critère de fin : le constat <id> est ✓ sur Meeshy-LongPress et Meeshy-LongPress-18." \
  --milestone "L'appui long montre le message tel qu'on le lit, dans les quatre modes") && \
gh project item-add 1 --owner isopen-io --url "$URL" && echo "$URL"
```
Remplacer les deux gabarits `<…>` par le constat mesuré avant d'exécuter. Citer l'URL dans le compte rendu.

---

## Clôture

### Tâche 24 : Le lot passe le gate complet, prouve son budget et livre ses issues

**Fichiers :**
- Modifier : `apps/ios/MeeshyTests/Unit/Guards/FileSizeBudgetGuardTests.swift:272` (`legacyLineCeiling`, si le cumul a baissé)
- Aucun code produit neuf.

**Interfaces :**
- Consomme : l'ensemble des Tâches 1 à 23, les captures des Tâches 17, 20 et 23.
- Produit : une PR vers `dev`, les commentaires de preuve sur #5980 à #5984, et les issues de suivi par dimension non mûre.

- [ ] **Étape 1 : Remettre la branche à jour sur `dev`**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && git fetch origin dev && git merge --no-edit origin/dev
```
Attendu : fusion propre. En cas de conflit sur `apps/ios/Meeshy.xcodeproj/project.pbxproj` :
1. prendre la version de `dev` (`git checkout --theirs apps/ios/Meeshy.xcodeproj/project.pbxproj`) ;
2. régénérer (`cd apps/ios && xcodegen generate`) ;
3. vérifier que chaque fichier neuf du lot a ses références (`grep -c 'LiftedMessageOverlay.swift' apps/ios/Meeshy.xcodeproj/project.pbxproj` ≥ 2, idem pour chaque fichier créé) ;
4. `git add` puis `git commit --no-edit`.

Tout autre conflit se résout en gardant les deux intentions, puis en relançant les tests ciblés des tâches concernées.

- [ ] **Étape 2 : Construire le bundle de test une fois, au premier plan, journal complet**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
  > /tmp/meeshy-longpress-bft.log 2>&1; echo "RC=$?"; grep -E "error:|\*\* TEST BUILD (SUCCEEDED|FAILED)" /tmp/meeshy-longpress-bft.log | head -20
```
Attendu : `RC=0` et `** TEST BUILD SUCCEEDED **`.

Puis trouver le `.xctestrun` :
```bash
ls /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/Products/*.xctestrun /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd/Build/Products/*.xctestrun 2>/dev/null
```
Attendu : un fichier `Meeshy_iphonesimulator26.1-arm64.xctestrun` (ou voisin). Retenir son chemin dans `XCTESTRUN`.

- [ ] **Étape 3 : Lancer toute la suite de l'app, détachée, avec un journal sur disque**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && \
nohup xcodebuild test-without-building -xctestrun "$XCTESTRUN" \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
  -only-testing:MeeshyTests \
  > /tmp/meeshy-longpress-suite.log 2>&1 & disown
```
Surveiller par un `Monitor` jusqu'à la présence de `Test Suite 'All tests' (passed|failed)` dans le journal, ou de `** TEST EXECUTE (SUCCEEDED|FAILED) **`. Ne jamais piper la suite dans `tail`.

- [ ] **Étape 4 : Compter les échecs par classe et les confronter aux rouges hérités (#5599)**

```bash
grep -E "Test Case '-\[MeeshyTests\.[A-Za-z0-9_]+ [a-zA-Z0-9_]+\]' failed" /tmp/meeshy-longpress-suite.log \
  | sed -E "s/.*MeeshyTests\.([A-Za-z0-9_]+) .*/\1/" | sort | uniq -c | sort -rn
grep -E "Executed [0-9]+ tests?, with [0-9]+ failures?" /tmp/meeshy-longpress-suite.log | tail -3
```

Classes héritées de #5599, à ne pas imputer au lot :
- `ComposerDocumentSurfaceTests`, `ComposerMediaStripTests`, `ComposerMediaIngestOrderTests`, `ComposerStoryCanvasTests`, `ComposerCanvasMatterArmsPostTests`, `ComposerCameraOpensTheMeubleTests` ;
- `MeeshyComposerHostPostSlidesGuardTests`, `PublishChainCensusTests` ;
- `FixedFontSizeGuardTests`, `ConversationSurfaceReachabilityGuardTests`, `CommentMediaGalleryWiringGuardTests`, `ExplicitPluralLabelTests`.

Verdict :
- **Une classe hors de cette liste** : l'échec appartient au lot. Appliquer `superpowers:systematic-debugging`, corriger en TDD dans la tâche concernée, commit, puis revenir à l'étape 2.
- **Une classe de la liste, avec un compte de tests échoués supérieur à la référence de dev** : même traitement.
- **Pour `FixedFontSizeGuardTests`**, lire le message : un fichier du lot nommé dans l'échec appartient au lot.

Référence de dev, si un doute subsiste sur une classe de la liste :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && BASE=$(git merge-base HEAD origin/dev) && \
git worktree add /Users/smpceo/Documents/v2_meeshy-longpress-ref "$BASE" && \
cd /Users/smpceo/Documents/v2_meeshy-longpress-ref/apps/ios && xcodegen generate >/dev/null && \
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress-18" \
  -configuration Debug -enableCodeCoverage NO \
  -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
  -skipPackageUpdates -only-testing:MeeshyTests/<Classe> \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-ref-dd \
  > /tmp/meeshy-longpress-ref.log 2>&1; grep -E "Executed [0-9]+ tests?, with [0-9]+ failures?" /tmp/meeshy-longpress-ref.log | tail -1
```
Attendu : le même compte d'échecs que sur la branche. Ensuite, `git worktree remove /Users/smpceo/Documents/v2_meeshy-longpress-ref`.

- [ ] **Étape 5 : Lancer la suite complète du SDK**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress/packages/MeeshySDK && \
nohup xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,name=Meeshy-LongPress-18" \
  -skipPackageUpdates \
  -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/MeeshySDK-longpress-dd \
  > /tmp/meeshy-longpress-sdk.log 2>&1 & disown
```
Surveiller jusqu'à `** TEST SUCCEEDED **` ou `** TEST FAILED **`.

Attendu : deux lignes `Test Suite 'All tests' passed` (`MeeshySDKTests` puis `MeeshyUITests`) :
```bash
grep -c "Test Suite 'All tests' passed" /tmp/meeshy-longpress-sdk.log
```
doit rendre `2`. Les lignes `error:` du simulateur (TCC) ne comptent pas.

- [ ] **Étape 6 : Prouver le budget par fichier et remesurer le cumul**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && BASE=$(git merge-base HEAD origin/dev) && \
for F in apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
         apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift \
         apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift \
         apps/ios/Meeshy/Features/Main/Focal/Row/FocalRow.swift; do \
  A=$(git show "$BASE:$F" | wc -l | tr -d ' '); B=$(wc -l < "$F" | tr -d ' '); echo "$F base=$A tête=$B Δ=$((B-A))"; done
```
Attendu : `Δ` ≤ 0 pour les trois premiers, `Δ=0` pour `FocalRow.swift`. Sinon, revenir à la tâche fautive et relocaliser.

Cumul au sens de la garde (`components(separatedBy: .newlines).count`) :
```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && python3 - <<'PY'
import re, pathlib
guard = pathlib.Path("apps/ios/MeeshyTests/Unit/Guards/FileSizeBudgetGuardTests.swift").read_text()
block = guard.split("legacyOverBudget: Set<String> = [", 1)[1].split("]", 1)[0]
names = set(re.findall(r'"([^"]+\.swift)"', block))
root = pathlib.Path("apps/ios/Meeshy")
total = 0
for p in root.rglob("*.swift"):
    if p.name in names:
        text = p.read_text(encoding="utf-8")
        total += len(re.split(r"[\n\x0b\x0c\r\x85\u2028\u2029]", text))
ceiling = int(re.search(r"legacyLineCeiling = ([0-9_]+)", guard).group(1).replace("_", ""))
print(f"cumul={total} plafond={ceiling} marge={ceiling-total}")
PY
```
Attendu : `cumul` ≤ `plafond`. Si `cumul < plafond`, abaisser le plafond au cumul mesuré.

Remplacer, dans `apps/ios/MeeshyTests/Unit/Guards/FileSizeBudgetGuardTests.swift:272` :
```swift
    private static let legacyLineCeiling = 60_862
```
par (avec la valeur mesurée, séparateur `_` des milliers) :
```swift
    private static let legacyLineCeiling = <cumul mesuré>
```
Ajouter au doc-comment du plafond, juste au-dessus de la déclaration, une ligne datée :
```swift
    /// **<cumul mesuré> depuis #5981.** L'appui long remonte la vraie rangée sans rien ajouter aux fichiers hors budget : `ConversationOverlayState` a quitté `ConversationView.swift`, et chaque ligne de câblage a été compensée par une relocalisation pure (spec D4).
```

- [ ] **Étape 7 : Vérifier la garde de taille et committer le plafond**

Commande : la commande de test ciblé du contrat avec `-only-testing:MeeshyTests/FileSizeBudgetGuardTests`.
Attendu : `Executed 4 tests, with 0 failures` (le nombre exact de tests de la classe, tous verts).

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && git add apps/ios/MeeshyTests/Unit/Guards/FileSizeBudgetGuardTests.swift && \
git commit -m "chore(ios): le plafond de la dette héritée descend au cumul remesuré après l'appui long (#5981)

Cumul mesuré au sens de la garde : <cumul> (plafond précédent 60 862).
Δ par fichier depuis la base :
- ConversationView.swift : <Δ>
- MessageListViewController.swift : <Δ>
- MessageOverlayMenu.swift : <Δ>
- FocalRow.swift : 0

Refs #5981

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK" && git show --stat HEAD | tail -3 && git push origin claude/appui-long-rendu-du-mode
```
Les chevrons `<…>` du message se remplacent par les valeurs relevées aux étapes 6 et 7, jamais committés tels quels.

- [ ] **Étape 8 : Ouvrir la PR vers `dev`**

```bash
cd /Users/smpceo/Documents/v2_meeshy-longpress && gh pr create -R isopen-io/meeshy --base dev --head claude/appui-long-rendu-du-mode \
  --title "L'appui long montre le message tel qu'on le lit, dans les quatre modes" \
  --body-file /tmp/meeshy-longpress-pr.md
```

Le fichier `/tmp/meeshy-longpress-pr.md` est écrit juste avant, avec :
1. **Ce qui change pour l'utilisateur** : quatre puces (rendu du mode, barre 2×, clavier, double tap Script).
2. **Drapeau** : D2 ; activation pour tous = #5995.
3. **Preuves** :
   - suite app (`Executed N tests, with M failures`, classes échouées toutes dans #5599) ;
   - SDK (`2 × All tests passed`) ;
   - budget (Δ par fichier) ;
   - captures des Tâches 17, 20 et 23 (chemins).
4. **Hors périmètre** : #5985, #5988, #5989.
5. Les lignes `Closes #5980`, `Closes #5981`, `Closes #5982`, `Closes #5983`, `Closes #5984`.
6. Pied de page :
   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
   ```

- [ ] **Étape 9 : Déposer la preuve et les dimensions sur chaque issue livrée**

Pour chacune de #5980, #5981, #5982, #5983 et #5984 :
```bash
gh issue comment <n> -R isopen-io/meeshy --body-file /tmp/meeshy-longpress-issue-<n>.md
```
Chaque corps contient :
- les commits de l'issue (`git log --oneline origin/dev..HEAD --grep '#<n>'`) ;
- le lien de la PR ;
- les tests ciblés verts ;
- les captures au simulateur de la tâche de vérification ;
- les **dimensions mûres** (parmi 4, 5, 6, 7, 8, 9, 13) ;
- les **dimensions non mûres**, chacune avec le numéro de l'issue ouverte pour elle (`gh issue create` + milestone #89 + inscription au projet « Meeshy — pilotage » en `Todo`, comme #5988).

Les issues se ferment par la fusion de la PR (`Closes`), jamais à la main avant.
