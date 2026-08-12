# Déduplication du trigger « … » sur ReelFeedCard + libellé Sauvegarder média — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sur les cartes Reel du Feed, ne garder qu'un seul trigger « … » (haut-droite, comme les posts normaux) et distinguer le libellé « Sauvegarder » (téléchargement de média) du libellé « Enregistrer » (bookmark), partout où cette distinction s'applique.

**Architecture:** Édition SwiftUI ciblée sur 4 fichiers de vue existants (pas de nouveau composant, pas de refactor structurel) + une nouvelle clé dans le String Catalog `Localizable.xcstrings`, traduite immédiatement dans les 6 locales non-source pour ne pas faire grossir le plafond du test `LocalizationConsistencyTests.test_untranslatedKeyBacklogDoesNotGrow`.

**Tech Stack:** SwiftUI (iOS 16+), XCTest (source-guard tests par inspection de source, pattern déjà en usage dans `ReelCaptionRichTextGuardTests.swift`), String Catalog (`.xcstrings`).

**Spec :** `docs/superpowers/specs/2026-08-06-reel-feed-card-menu-dedup-design.md`

## Global Constraints

- **XcodeGen est la source de vérité du projet** (`apps/ios/project.yml`). Tout **nouveau** fichier `.swift` sous `Meeshy/` ou `MeeshyTests/` doit être suivi d'un `cd apps/ios && xcodegen generate` avant que `xcodebuild`/`meeshy.sh` ne le voie — `meeshy.sh` ne lance PAS xcodegen lui-même. Éditer un fichier **existant** ne nécessite PAS de regénération.
- **Simulateur de test = iOS 18.2 éphémère, jamais le simulateur de dev principal.** Les runtimes 18.5+/26.x crashent au teardown XCTest (`swift_task_deinitOnExecutorMainActorBackDeploy`) — voir `apps/ios/CLAUDE.md` § « Reproduire la CI iOS Tests ». Chaque tâche crée son propre simulateur `tmp182`, l'utilise, puis le détruit.
- **`-only-testing:` sélectionne des CLASSES XCTest, pas des noms de fichiers.**
- Le gate complet `./apps/ios/meeshy.sh test` (suite phasée ~365 classes) n'est PAS exécuté à chaque tâche — trop lent pour un cycle TDD par tâche et déjà couvert par la CI (« iOS Tests » régénère via xcodegen et tourne sur push). Chaque tâche compile + exécute uniquement les classes de test qu'elle touche. La Tâche 6 fait une passe plus large (build complet + toutes les classes créées/modifiées par ce plan + `LocalizationConsistencyTests`).
- Bookmark reste un bouton dédié de la barre d'action/rail dans TOUS les fichiers touchés — jamais déplacé dans le menu « … ». Aucune tâche de ce plan ne doit toucher `ReelFeedCard.swift:397-402` (bouton bookmark de `actionsRow`), `ReelsPlayerView.swift:1052-1062` (bouton bookmark de `ReelActionRail`), `FeedPostCard.swift:1052` (bouton bookmark dédié de `actionsBar`), ou `PostDetailView.swift:1660-1680` (bouton bookmark dédié de la barre d'action détail).
- Nouvelle clé i18n `feed.reel.save_media` : `defaultValue` FR = « Sauvegarder », traduite `translated` dans les 6 locales expédiées non-`fr` (`en`, `de`, `es`, `pt-BR`, `it`, `ar`) dès son introduction (Tâche 2) — jamais seulement `fr`+`en`.

## File Structure

- Modifier `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift` — retirer le trigger « … » redondant (Tâche 1), renommer le libellé média (Tâche 2).
- Modifier `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift` — renommer le libellé média (Tâche 3).
- Modifier `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` — libellé dynamique (Tâche 4).
- Modifier `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` — libellé dynamique (Tâche 5).
- Modifier `apps/ios/Meeshy/Localizable.xcstrings` — nouvelle clé (Tâche 2).
- Créer `apps/ios/MeeshyTests/Unit/Views/ReelFeedCardMenuTriggerGuardTests.swift` (Tâche 1).
- Créer `apps/ios/MeeshyTests/Unit/Views/MediaSaveLabelGuardTests.swift` (Tâche 2), étendu par les Tâches 3, 4, 5.

---

### Task 1: ReelFeedCard — un seul trigger « … »

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift:380-424`
- Test: Create `apps/ios/MeeshyTests/Unit/Views/ReelFeedCardMenuTriggerGuardTests.swift`

**Interfaces:**
- Consumes: rien de nouveau — `moreOptionsMenuContent` (propriété `@ViewBuilder` existante, lignes 429-489, inchangée) reste utilisée uniquement par `reelGlyph` (ligne 235-257, inchangée).
- Produces: rien d'exporté — changement interne à la vue.

- [ ] **Step 1: Écrire le test source-guard qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/ReelFeedCardMenuTriggerGuardTests.swift` :

```swift
import XCTest
@testable import Meeshy

final class ReelFeedCardMenuTriggerGuardTests: XCTestCase {
    private func sourceWithoutComments(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(path)
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .replacingOccurrences(of: #"//[^\n]*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
    }

    func test_reelFeedCard_hasOnlyOneMoreOptionsTrigger() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelFeedCard.swift")
        XCTAssertFalse(source.contains("private var moreOptionsMenu:"),
            "Le trigger « … » bas-droite (property moreOptionsMenu) doit être entièrement supprimé — reelGlyph (haut-droite) devient le seul point d'entrée du menu")
        XCTAssertTrue(source.contains("private var reelGlyph"),
            "reelGlyph doit rester le seul trigger « … » de la carte")
        XCTAssertTrue(source.contains("moreOptionsMenuContent"),
            "Le contenu partagé du menu (moreOptionsMenuContent) doit rester, référencé uniquement par reelGlyph")
    }
}
```

- [ ] **Step 2: Régénérer le projet XcodeGen (nouveau fichier de test)**

```bash
cd apps/ios && xcodegen generate && cd -
```

Vérifier que le diff ne touche que ce qui est attendu :

```bash
git status --short apps/ios/Meeshy.xcodeproj
```

Attendu : `apps/ios/Meeshy.xcodeproj/project.pbxproj` modifié (ajout de la référence au nouveau fichier de test). Si d'autres fichiers apparaissent dans ce diff, ne pas continuer — investiguer avant de poursuivre (état du worktree potentiellement inattendu).

- [ ] **Step 3: Compiler et lancer le test, vérifier qu'il échoue**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
SIM=$(xcrun simctl create tmp182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/ReelFeedCardMenuTriggerGuardTests \
  -derivedDataPath apps/ios/Build
```

Attendu : **FAIL** sur `test_reelFeedCard_hasOnlyOneMoreOptionsTrigger` (la première assertion échoue : `moreOptionsMenu` existe encore).

- [ ] **Step 4: Implémenter — retirer le trigger bas-droite**

Dans `ReelFeedCard.swift`, remplacer (lignes 380-424) :

```swift
    private var actionsRow: some View {
        HStack(spacing: 0) {
            likeButton
            Spacer()
            reelButton(outline: "bubble.right", filled: "bubble.right.fill",
                       tint: .white,
                       count: post.commentCount,
                       label: String(localized: "feed.post.comments_count", defaultValue: "\(post.commentCount) commentaires", bundle: .main),
                       hint: String(localized: "a11y.feed.reel.comments.hint", defaultValue: "Ouvre les commentaires du réel", bundle: .main)) { onComment(post.id) }
            Spacer()
            reelButton(outline: "arrow.2.squarepath", filled: "arrow.2.squarepath",
                       tint: isReposted ? MeeshyColors.success : .white,
                       count: displayRepostCount,
                       label: String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main),
                       hint: String(localized: "a11y.feed.post.repost.hint", defaultValue: "Repartage ou cite cette publication", bundle: .main),
                       participated: isReposted) { onRepost(post.id) }
            Spacer()
            reelButton(outline: "bookmark", filled: "bookmark.fill",
                       tint: isBookmarked ? MeeshyColors.warning : .white,
                       count: displayBookmarkCount,
                       label: String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main),
                       hint: String(localized: "a11y.feed.post.save.hint", defaultValue: "Enregistre la publication dans vos favoris", bundle: .main),
                       participated: isBookmarked) { onBookmark(post.id) }
            Spacer()
            // Partager reste disponible dans le menu « … » — retiré des icônes
            // principales pour ne pas dupliquer Repartager (même slot d'intention).
            moreOptionsMenu
        }
    }

    /// Menu « … » — mêmes actions/libellés/icônes que `FeedPostCard.moreOptionsMenu`
    /// (ouvrir/copier/partager/enregistrer/épingler/modifier/supprimer/signaler),
    /// parité de la carte Réel plein-cadre avec la carte poste standard.
    private var moreOptionsMenu: some View {
        Menu {
            moreOptionsMenuContent
        } label: {
            Image(systemName: "ellipsis")
                .font(MeeshyFont.relative(18))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
        }
        .accessibilityLabel(String(localized: "feed.post.more_options", defaultValue: "Plus d'options", bundle: .main))
        .accessibilityHint(String(localized: "feed.post.more_options.hint", defaultValue: "Ouvre le menu des actions", bundle: .main))
    }
```

par :

```swift
    private var actionsRow: some View {
        HStack(spacing: 0) {
            likeButton
            Spacer()
            reelButton(outline: "bubble.right", filled: "bubble.right.fill",
                       tint: .white,
                       count: post.commentCount,
                       label: String(localized: "feed.post.comments_count", defaultValue: "\(post.commentCount) commentaires", bundle: .main),
                       hint: String(localized: "a11y.feed.reel.comments.hint", defaultValue: "Ouvre les commentaires du réel", bundle: .main)) { onComment(post.id) }
            Spacer()
            reelButton(outline: "arrow.2.squarepath", filled: "arrow.2.squarepath",
                       tint: isReposted ? MeeshyColors.success : .white,
                       count: displayRepostCount,
                       label: String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main),
                       hint: String(localized: "a11y.feed.post.repost.hint", defaultValue: "Repartage ou cite cette publication", bundle: .main),
                       participated: isReposted) { onRepost(post.id) }
            Spacer()
            reelButton(outline: "bookmark", filled: "bookmark.fill",
                       tint: isBookmarked ? MeeshyColors.warning : .white,
                       count: displayBookmarkCount,
                       label: String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main),
                       hint: String(localized: "a11y.feed.post.save.hint", defaultValue: "Enregistre la publication dans vos favoris", bundle: .main),
                       participated: isBookmarked) { onBookmark(post.id) }
            // Partager et le menu « … » restent disponibles via `reelGlyph`
            // (coin haut-droit) — un seul trigger, pas de doublon en bas.
        }
    }
```

(La propriété `moreOptionsMenu`, désormais sans appelant, est supprimée — pas seulement son appel dans `actionsRow`.)

- [ ] **Step 5: Recompiler et relancer le test, vérifier qu'il passe**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/ReelFeedCardMenuTriggerGuardTests \
  -derivedDataPath apps/ios/Build
xcrun simctl delete $SIM
```

Attendu : **PASS**.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift \
        apps/ios/MeeshyTests/Unit/Views/ReelFeedCardMenuTriggerGuardTests.swift \
        apps/ios/Meeshy.xcodeproj
git commit -m "$(cat <<'EOF'
fix(ios/reels): un seul trigger « … » sur ReelFeedCard (retire le doublon bas-droite)
EOF
)"
```

---

### Task 2: Nouvelle clé i18n `feed.reel.save_media` + rename sur ReelFeedCard

**Files:**
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (insertion après l'entrée `"feed.post.save"`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift:452` (dans `moreOptionsMenuContent`)
- Test: Create `apps/ios/MeeshyTests/Unit/Views/MediaSaveLabelGuardTests.swift`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: clé i18n `feed.reel.save_media` (`defaultValue` FR « Sauvegarder », traduite dans les 6 locales) — consommée par les Tâches 3, 4, 5.

- [ ] **Step 1: Écrire le test source-guard qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/MediaSaveLabelGuardTests.swift` :

```swift
import XCTest
@testable import Meeshy

final class MediaSaveLabelGuardTests: XCTestCase {
    private func sourceWithoutComments(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(path)
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .replacingOccurrences(of: #"//[^\n]*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
    }

    func test_reelFeedCard_saveMediaMenuItem_usesSauvegarderLabel() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelFeedCard.swift")
        XCTAssertTrue(source.contains(#"String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)"#),
            "Le téléchargement média du menu « … » de ReelFeedCard doit afficher « Sauvegarder », distinct du bookmark « Enregistrer »")
        XCTAssertTrue(source.contains(#"String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main)"#),
            "Le bouton bookmark dédié de la rail (actionsRow) doit rester « Enregistrer »")
    }
}
```

- [ ] **Step 2: Régénérer le projet XcodeGen (nouveau fichier de test)**

```bash
cd apps/ios && xcodegen generate && cd -
git status --short apps/ios/Meeshy.xcodeproj
```

Même vérification qu'à la Tâche 1 : le diff doit être limité à l'ajout du nouveau fichier de test.

- [ ] **Step 3: Compiler et lancer le test, vérifier qu'il échoue**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
SIM=$(xcrun simctl create tmp182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/MediaSaveLabelGuardTests \
  -derivedDataPath apps/ios/Build
```

Attendu : **FAIL** (le libellé `feed.reel.save_media` n'existe pas encore dans le fichier).

- [ ] **Step 4: Ajouter la clé au catalogue**

Dans `apps/ios/Meeshy/Localizable.xcstrings`, localiser le bloc de l'entrée `"feed.post.save"` (il se termine par une localisation `pt-BR` suivie de `},` puis de l'entrée `"feed.post.share"`) et insérer une nouvelle entrée `"feed.reel.save_media"` juste après :

```json
    "feed.post.save": {
      "extractionState": "manual",
      "localizations": {
        "ar": {
          "stringUnit": {
            "state": "translated",
            "value": "حفظ"
          }
        },
        "de": {
          "stringUnit": {
            "state": "translated",
            "value": "Speichern"
          }
        },
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Save"
          }
        },
        "es": {
          "stringUnit": {
            "state": "translated",
            "value": "Guardar"
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Enregistrer"
          }
        },
        "it": {
          "stringUnit": {
            "state": "translated",
            "value": "Salva"
          }
        },
        "pt-BR": {
          "stringUnit": {
            "state": "translated",
            "value": "Salvar"
          }
        }
      }
    },
    "feed.reel.save_media": {
      "extractionState": "manual",
      "localizations": {
        "ar": {
          "stringUnit": {
            "state": "translated",
            "value": "حفظ"
          }
        },
        "de": {
          "stringUnit": {
            "state": "translated",
            "value": "Speichern"
          }
        },
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Save"
          }
        },
        "es": {
          "stringUnit": {
            "state": "translated",
            "value": "Guardar"
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Sauvegarder"
          }
        },
        "it": {
          "stringUnit": {
            "state": "translated",
            "value": "Salva"
          }
        },
        "pt-BR": {
          "stringUnit": {
            "state": "translated",
            "value": "Salvar"
          }
        }
      }
    },
    "feed.post.share": {
```

Valider le JSON après édition :

```bash
python3 -c "import json; json.load(open('apps/ios/Meeshy/Localizable.xcstrings')); print('OK')"
```

- [ ] **Step 5: Implémenter — renommer le libellé dans ReelFeedCard**

Dans `ReelFeedCard.swift`, remplacer (ligne ~448-454) :

```swift
        if media != nil {
            Button {
                requestSaveMedia()
            } label: {
                Label(String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main), systemImage: "bookmark")
            }
        }
```

par :

```swift
        if media != nil {
            Button {
                requestSaveMedia()
            } label: {
                Label(String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main), systemImage: "bookmark")
            }
        }
```

- [ ] **Step 6: Recompiler et relancer le test, vérifier qu'il passe**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/MediaSaveLabelGuardTests \
  -derivedDataPath apps/ios/Build
xcrun simctl delete $SIM
```

Attendu : **PASS**.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Localizable.xcstrings \
        apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift \
        apps/ios/MeeshyTests/Unit/Views/MediaSaveLabelGuardTests.swift \
        apps/ios/Meeshy.xcodeproj
git commit -m "$(cat <<'EOF'
feat(ios/i18n): clé feed.reel.save_media « Sauvegarder » pour le média des reels
EOF
)"
```

---

### Task 3: ReelsPlayerView — rename sur le lecteur plein écran

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift:1107-1113`
- Test: Modify `apps/ios/MeeshyTests/Unit/Views/MediaSaveLabelGuardTests.swift`

**Interfaces:**
- Consumes: clé i18n `feed.reel.save_media` (Tâche 2).
- Produces: rien de nouveau.

- [ ] **Step 1: Ajouter le test qui échoue**

Ajouter dans `MediaSaveLabelGuardTests.swift` (dans la classe existante, après le test de la Tâche 2) :

```swift
    func test_reelsPlayerView_saveMediaMenuItem_usesSauvegarderLabel() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertTrue(source.contains(#"String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)"#),
            "Le téléchargement média du menu « … » du lecteur plein écran doit afficher « Sauvegarder »")
        XCTAssertTrue(source.contains(#"String(localized: "reels.action.bookmark", defaultValue: "Enregistrer", bundle: .main)"#),
            "Le bouton bookmark dédié de la rail (ReelActionRail) doit rester « Enregistrer »")
    }
```

- [ ] **Step 2: Compiler et lancer le test, vérifier qu'il échoue**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
SIM=$(xcrun simctl create tmp182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/MediaSaveLabelGuardTests/test_reelsPlayerView_saveMediaMenuItem_usesSauvegarderLabel \
  -derivedDataPath apps/ios/Build
```

Attendu : **FAIL**.

- [ ] **Step 3: Implémenter**

Dans `ReelsPlayerView.swift`, remplacer (lignes ~1107-1113) :

```swift
            if reel.primaryReelDisplayMedia != nil {
                Button {
                    onSaveMedia()
                } label: {
                    Label(String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main), systemImage: "bookmark")
                }
            }
```

par :

```swift
            if reel.primaryReelDisplayMedia != nil {
                Button {
                    onSaveMedia()
                } label: {
                    Label(String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main), systemImage: "bookmark")
                }
            }
```

- [ ] **Step 4: Recompiler et relancer le test, vérifier qu'il passe**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/MediaSaveLabelGuardTests \
  -derivedDataPath apps/ios/Build
xcrun simctl delete $SIM
```

Attendu : **PASS** (toute la classe, y compris le test de la Tâche 2).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift \
        apps/ios/MeeshyTests/Unit/Views/MediaSaveLabelGuardTests.swift
git commit -m "$(cat <<'EOF'
feat(ios/reels): libellé « Sauvegarder » pour le média dans le lecteur plein écran
EOF
)"
```

---

### Task 4: FeedPostCard — libellé dynamique (reel affiché sur iPad)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:731-740`
- Test: Modify `apps/ios/MeeshyTests/Unit/Views/MediaSaveLabelGuardTests.swift`

**Interfaces:**
- Consumes: clé i18n `feed.reel.save_media` (Tâche 2).
- Produces: rien de nouveau.

- [ ] **Step 1: Ajouter le test qui échoue**

Ajouter dans `MediaSaveLabelGuardTests.swift` :

```swift
    func test_feedPostCard_saveMenuItem_usesDynamicLabelByMediaPresence() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(source.contains(#"post.primaryReelDisplayMedia != nil"#),
            "La branche média du menu « … » de FeedPostCard doit rester conditionnée sur primaryReelDisplayMedia")
        XCTAssertTrue(source.contains(#"String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)"#),
            "Quand la branche média est active, le menu « … » de FeedPostCard doit afficher « Sauvegarder »")
        XCTAssertTrue(source.contains(#"String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main)"#),
            "La branche bookmark du menu ET le bouton dédié actionsBar doivent rester « Enregistrer »")
    }
```

- [ ] **Step 2: Compiler et lancer le test, vérifier qu'il échoue**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
SIM=$(xcrun simctl create tmp182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/MediaSaveLabelGuardTests/test_feedPostCard_saveMenuItem_usesDynamicLabelByMediaPresence \
  -derivedDataPath apps/ios/Build
```

Attendu : **FAIL** (la clé `feed.reel.save_media` n'apparaît pas encore dans `FeedPostCard.swift`).

- [ ] **Step 3: Implémenter**

Dans `FeedPostCard.swift`, remplacer (lignes ~731-740) :

```swift
                Button {
                    if post.primaryReelDisplayMedia != nil {
                        requestSaveMedia()
                    } else {
                        onBookmark?(post.id)
                        HapticFeedback.light()
                    }
                } label: {
                    Label(String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main), systemImage: "bookmark")
                }
```

par :

```swift
                Button {
                    if post.primaryReelDisplayMedia != nil {
                        requestSaveMedia()
                    } else {
                        onBookmark?(post.id)
                        HapticFeedback.light()
                    }
                } label: {
                    Label(
                        post.primaryReelDisplayMedia != nil
                            ? String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)
                            : String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main),
                        systemImage: "bookmark"
                    )
                }
```

Le bouton bookmark dédié de `actionsBar` (ligne ~1052, `.accessibilityLabel(String(localized: "feed.post.save", ...))`) n'est pas touché.

- [ ] **Step 4: Recompiler et relancer le test, vérifier qu'il passe**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/MediaSaveLabelGuardTests \
  -derivedDataPath apps/ios/Build
xcrun simctl delete $SIM
```

Attendu : **PASS**.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift \
        apps/ios/MeeshyTests/Unit/Views/MediaSaveLabelGuardTests.swift
git commit -m "$(cat <<'EOF'
feat(ios): FeedPostCard affiche « Sauvegarder » pour le média d'un reel dans le menu « … »
EOF
)"
```

---

### Task 5: PostDetailView — libellé dynamique (vue détail d'un reel)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift:1018-1026`
- Test: Modify `apps/ios/MeeshyTests/Unit/Views/MediaSaveLabelGuardTests.swift`

**Interfaces:**
- Consumes: clé i18n `feed.reel.save_media` (Tâche 2).
- Produces: rien de nouveau.

- [ ] **Step 1: Ajouter le test qui échoue**

Ajouter dans `MediaSaveLabelGuardTests.swift` :

```swift
    func test_postDetailView_saveMenuItem_usesDynamicLabelByMediaPresence() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(source.contains(#"displayPost?.primaryReelDisplayMedia != nil"#),
            "La branche média du menu « … » de PostDetailView doit rester conditionnée sur primaryReelDisplayMedia")
        XCTAssertTrue(source.contains(#"String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)"#),
            "Quand la branche média est active, le menu « … » de PostDetailView doit afficher « Sauvegarder »")
        XCTAssertTrue(source.contains(#"String(localized: "a11y.post.bookmark_add", defaultValue: "Ajouter aux favoris", bundle: .main)"#),
            "Le bouton bookmark dédié de la barre d'action (hors menu), sur ses propres clés a11y.post.bookmark_*, ne doit pas être touché")
    }
```

- [ ] **Step 2: Compiler et lancer le test, vérifier qu'il échoue**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
SIM=$(xcrun simctl create tmp182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/MediaSaveLabelGuardTests/test_postDetailView_saveMenuItem_usesDynamicLabelByMediaPresence \
  -derivedDataPath apps/ios/Build
```

Attendu : **FAIL**.

- [ ] **Step 3: Implémenter**

Dans `PostDetailView.swift`, remplacer (lignes ~1018-1026) :

```swift
            Button {
                if displayPost?.primaryReelDisplayMedia != nil {
                    requestSaveMedia()
                } else {
                    toggleDetailBookmark()
                }
            } label: {
                Label(String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main), systemImage: isPostBookmarked ? "bookmark.fill" : "bookmark")
            }
```

par :

```swift
            Button {
                if displayPost?.primaryReelDisplayMedia != nil {
                    requestSaveMedia()
                } else {
                    toggleDetailBookmark()
                }
            } label: {
                Label(
                    displayPost?.primaryReelDisplayMedia != nil
                        ? String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)
                        : String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main),
                    systemImage: isPostBookmarked ? "bookmark.fill" : "bookmark"
                )
            }
```

Le bouton bookmark dédié de la barre d'action (autour de la ligne 1660-1680, clés `a11y.post.bookmark_add`/`_remove`) n'est pas touché.

- [ ] **Step 4: Recompiler et relancer le test, vérifier qu'il passe**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/MediaSaveLabelGuardTests \
  -derivedDataPath apps/ios/Build
xcrun simctl delete $SIM
```

Attendu : **PASS** (toute la classe `MediaSaveLabelGuardTests`, 4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift \
        apps/ios/MeeshyTests/Unit/Views/MediaSaveLabelGuardTests.swift
git commit -m "$(cat <<'EOF'
feat(ios): PostDetailView affiche « Sauvegarder » pour le média d'un reel dans le menu « … »
EOF
)"
```

---

### Task 6: Vérification finale

**Files:** aucun (vérification uniquement)

**Interfaces:** aucune.

- [ ] **Step 1: Régénérer une dernière fois et build complet**

```bash
cd apps/ios && xcodegen generate && cd -
git status --short apps/ios/Meeshy.xcodeproj
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : compile sans erreur ; aucun fichier inattendu dans le diff du pbxproj (juste un éventuel no-op si rien n'a changé depuis la Tâche 5).

- [ ] **Step 2: Lancer l'ensemble des tests créés/modifiés par ce plan + la garde i18n**

```bash
SIM=$(xcrun simctl create tmp182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/ReelFeedCardMenuTriggerGuardTests \
  -only-testing:MeeshyTests/MediaSaveLabelGuardTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -derivedDataPath apps/ios/Build
xcrun simctl delete $SIM
```

Attendu : **PASS** sur les 3 classes — en particulier `LocalizationConsistencyTests.test_untranslatedKeyBacklogDoesNotGrow` et `test_everyAppCatalogIdentifierKeyIsReferencedInCode`, qui valident que `feed.reel.save_media` est bien référencée et complètement traduite sans faire grossir le backlog pinné (`backlogCeiling = 1545`).

- [ ] **Step 3: Vérification manuelle rapide sur simulateur (optionnel mais recommandé)**

```bash
./apps/ios/meeshy.sh run
```

Dans le Feed, ouvrir une carte Reel : confirmer qu'un seul « … » est visible (haut-droite), que le bouton bas-droite a disparu (bookmark reste le dernier bouton, collé au bord droit), et que l'item média du menu affiche « Sauvegarder ». Répéter dans le lecteur plein écran (swipe reel) et dans la vue détail d'un post-reel (tap « Ouvrir »).

- [ ] **Step 4: Note finale**

Le gate CI complet (« iOS Tests », phases 0-3, régénère via xcodegen) validera l'intégralité de la suite au push — pas besoin de lancer `./apps/ios/meeshy.sh test` (suite phasée complète, ~365 classes) en local pour ce changement ciblé.

## Self-Review (fait par l'auteur du plan)

- **Couverture de la spec** : Changement 1 (un seul trigger) → Tâche 1. Changement 2 (rename Sauvegarder aux 4 sites + nouvelle clé traduite) → Tâches 2-5. Tests → intégrés à chaque tâche + Tâche 6. Hors-scope (media.save.title, story save, refactor composant partagé) → non touché par aucune tâche, conforme.
- **Placeholders** : aucun « TBD »/« later » — chaque étape contient le code exact, chaque commande est complète.
- **Cohérence des types/noms** : la clé `feed.reel.save_media` et son `defaultValue: "Sauvegarder"` sont identiques mot pour mot dans les Tâches 2, 3, 4, 5 et dans les 4 assertions de test correspondantes.
