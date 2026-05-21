# Refonte du lecteur audio iOS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unifier le widget audio des bulles de message en une seule vue (`AudioPlayerView`) avec un bouton de tête à 3 états, et rendre un audio jouable immédiatement après son envoi.

**Architecture:** Un enum `AudioAvailability` (`.ready` / `.needsDownload` / `.downloading`) pilote l'état du bouton de tête de `AudioPlayerView`. `AudioMediaView` (app) résout cette disponibilité via un `.task(id: attachment.fileUrl)` — qui se ré-exécute quand l'URL bascule optimiste (`file://`) → serveur (`https://`) — et rend une seule `AudioPlayerView` (plus de swap placeholder ↔ player).

**Tech Stack:** Swift 6, SwiftUI, MeeshySDK (SPM local), XCTest / Swift Testing, `./apps/ios/meeshy.sh`.

**Spec source:** `docs/superpowers/specs/2026-05-19-audio-player-unification-design.md`

**Note d'implémentation (écart vs spec §3.1) :** `AudioAvailability` est placé dans **MeeshySDK core** (`Sources/MeeshySDK/Models/`) plutôt que MeeshyUI. Raison : MeeshyUI utilise `defaultIsolation(MainActor)` (friction `nonisolated` sur la logique pure + tests non-`@MainActor`), tandis que MeeshySDK core est un module Swift 6 standard où le pattern de test « modèle » (Swift Testing) est déjà rodé. `AudioPlayerView` (MeeshyUI) et `AudioMediaView` (app) importent déjà `MeeshySDK` — l'enum est visible partout. Fonctionnellement équivalent.

**Note pbxproj :** aucun fichier neuf n'est ajouté à l'app (`apps/ios` = xcodeproj classique). Les seuls fichiers neufs sont dans le package SPM `MeeshySDK` (auto-découverts, aucune entrée pbxproj requise).

**Coordination :** un agent séparé retravaille `AudioFullscreenView`. Ce plan ne touche **pas** ce fichier. Seul couplage : `AudioMediaView` présente `AudioFullscreenView` via `.fullScreenCover` — interface inchangée ici.

---

## File Structure

| Fichier | Rôle | Action |
|---------|------|--------|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/AudioAvailability.swift` | Enum d'état de disponibilité audio + résolveur pur | Créer |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Models/AudioAvailabilityTests.swift` | Tests du résolveur | Créer |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` | Lecteur audio — bouton de tête 3 états | Modifier |
| `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` | `AudioMediaView` — vue unifiée, résolution de disponibilité | Modifier |

---

## Task 1 : Enum `AudioAvailability` + résolveur pur

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/AudioAvailability.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/AudioAvailabilityTests.swift`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Models/AudioAvailabilityTests.swift` :

```swift
import Testing
@testable import MeeshySDK

struct AudioAvailabilityTests {
    @Test func resolve_localFileThatExists_isReady() {
        let result = AudioAvailability.resolve(
            isLocalFile: true, localFileExists: true, isServerCached: false
        )
        #expect(result == .ready)
    }

    @Test func resolve_localFileMissing_needsDownload() {
        let result = AudioAvailability.resolve(
            isLocalFile: true, localFileExists: false, isServerCached: false
        )
        #expect(result == .needsDownload)
    }

    @Test func resolve_serverAudioCached_isReady() {
        let result = AudioAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: true
        )
        #expect(result == .ready)
    }

    @Test func resolve_serverAudioNotCached_needsDownload() {
        let result = AudioAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: false
        )
        #expect(result == .needsDownload)
    }
}
```

- [ ] **Step 2: Lancer le test — vérifier qu'il échoue**

Run:
```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/AudioAvailabilityTests \
  -derivedDataPath ../../apps/ios/Build -quiet
```
Expected: ÉCHEC de compilation — `cannot find 'AudioAvailability' in scope`.

- [ ] **Step 3: Créer l'enum + le résolveur**

Créer `packages/MeeshySDK/Sources/MeeshySDK/Models/AudioAvailability.swift` :

```swift
import Foundation

/// Disponibilité de lecture d'un audio dans une bulle de message.
/// Pilote l'état du bouton de tête de `AudioPlayerView` :
/// `.ready` → play, `.needsDownload` → bouton télécharger,
/// `.downloading` → anneau de progression.
public enum AudioAvailability: Equatable, Sendable {
    /// Jouable immédiatement : fichier local présent OU audio en cache.
    case ready
    /// Audio serveur pas encore en cache : un téléchargement est requis.
    case needsDownload
    /// Téléchargement en cours. `progress` dans [0, 1] ; 0 = indéterminé.
    case downloading(progress: Double)

    /// Résout la disponibilité « au repos » (hors téléchargement actif) à
    /// partir de faits déjà collectés. Fonction pure : testable sans I/O.
    /// - Parameters:
    ///   - isLocalFile: l'URL de l'attachment utilise le schéma `file://`.
    ///   - localFileExists: le fichier local existe sur le disque.
    ///   - isServerCached: l'audio serveur est présent dans le cache disque.
    public static func resolve(
        isLocalFile: Bool,
        localFileExists: Bool,
        isServerCached: Bool
    ) -> AudioAvailability {
        if isLocalFile {
            return localFileExists ? .ready : .needsDownload
        }
        return isServerCached ? .ready : .needsDownload
    }
}
```

- [ ] **Step 4: Lancer le test — vérifier qu'il passe**

Run:
```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/AudioAvailabilityTests \
  -derivedDataPath ../../apps/ios/Build -quiet
```
Expected: SUCCÈS — 4 tests passent.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/AudioAvailability.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/AudioAvailabilityTests.swift
git commit -m "feat(ios): AudioAvailability — état de disponibilité audio + résolveur pur"
```

---

## Task 2 : `AudioPlayerView` — bouton de tête à 3 états

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`

`AudioPlayerView` est une `View` SwiftUI : pas de test unitaire (vérification = build + smoke visuel en Task 4). `availability` a une valeur par défaut `.ready` → les appelants existants (composer) ne changent pas.

- [ ] **Step 1: Ajouter les propriétés stockées**

Dans `AudioPlayerView`, juste après la ligne `private var bottomSlot: AnyView?` :

```swift
    private var availability: AudioAvailability
    private var onDownload: (() -> Void)?
```

- [ ] **Step 2: Étendre l'init**

Remplacer la signature et le corps de l'`init` public. Ancien début de signature :

```swift
                externalLanguage: Binding<String?>? = nil,
                @ViewBuilder bottomContent: () -> some View = { EmptyView() }) {
```

Nouveau (insérer `availability` + `onDownload` avant `bottomContent`) :

```swift
                externalLanguage: Binding<String?>? = nil,
                availability: AudioAvailability = .ready,
                onDownload: (() -> Void)? = nil,
                @ViewBuilder bottomContent: () -> some View = { EmptyView() }) {
```

Et dans le corps de l'init, juste après `self.externalLanguage = externalLanguage` :

```swift
        self.availability = availability
        self.onDownload = onDownload
```

- [ ] **Step 3: Réécrire `playButton` + ajouter les helpers**

Remplacer **intégralement** le bloc `// MARK: - Play Button` / `private var playButton: some View { ... }` (la propriété actuelle `playButton`) par :

```swift
    // MARK: - Play Button
    private var playButton: some View {
        Button {
            switch availability {
            case .ready:
                handlePlayTap()
            case .needsDownload:
                onDownload?()
                HapticFeedback.light()
            case .downloading:
                break
            }
        } label: {
            playButtonLabel
        }
        .disabled(isDownloading)
    }

    private var isDownloading: Bool {
        if case .downloading = availability { return true }
        return false
    }

    private func handlePlayTap() {
        if player.isPlaying || player.progress > 0 {
            player.togglePlayPause()
        } else if attachment.fileUrl.hasPrefix("file://"),
                  let localURL = URL(string: attachment.fileUrl) {
            // Optimistic local audio: AudioPlaybackManager.play(urlString:)
            // routes through DiskCacheStore.data(for:), which rejects
            // file:// schemes. Read the on-device file directly instead.
            player.playLocal(url: localURL)
        } else {
            player.play(urlString: currentAudioUrl)
        }
        HapticFeedback.light()
    }

    @ViewBuilder
    private var playButtonLabel: some View {
        let size: CGFloat = context.isCompact ? 34 : 40
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [accent, accent.opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size, height: size)
                .shadow(color: accent.opacity(0.3), radius: 6, y: 2)

            switch availability {
            case .ready:
                if player.isLoading {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.6)
                } else {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: context.isCompact ? 13 : 15, weight: .bold))
                        .foregroundColor(.white)
                        .offset(x: player.isPlaying ? 0 : 1)
                }
            case .needsDownload:
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: context.isCompact ? 13 : 15, weight: .bold))
                    .foregroundColor(.white)
            case .downloading(let progress):
                if progress > 0 {
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(Color.white, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: size * 0.5, height: size * 0.5)
                        .animation(.linear(duration: 0.2), value: progress)
                } else {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.6)
                }
            }
        }
    }
```

- [ ] **Step 4: Désactiver le seek de la waveform hors état `.ready`**

Dans `waveformProgress`, le `.overlay(...)` contient un `GeometryReader` avec un `Color.clear ... .onTapGesture`. Ajouter `.allowsHitTesting(availability == .ready)` sur ce `GeometryReader`. Bloc actuel :

```swift
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        let fraction = max(0, min(1, location.x / geo.size.width))
                        player.seek(to: fraction)
                        HapticFeedback.light()
                    }
            }
        )
```

Nouveau :

```swift
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        let fraction = max(0, min(1, location.x / geo.size.width))
                        player.seek(to: fraction)
                        HapticFeedback.light()
                    }
            }
            .allowsHitTesting(availability == .ready)
        )
```

- [ ] **Step 5: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`. (Le diagnostic SourceKit « No such module 'MeeshySDK' » est un faux positif connu — seul le résultat `xcodebuild` compte.)

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift
git commit -m "feat(ios): AudioPlayerView — bouton de tête 3 états (play/télécharger/progression)"
```

---

## Task 3 : `AudioMediaView` — vue audio unifiée

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`

`AudioMediaView` (≈ lignes 333-628). Vérification = build + smoke (Task 4).

- [ ] **Step 1: Ajouter `attachment.fileUrl` à l'égalité**

Dans `AudioMediaView`, le `static func ==`. Ajouter une ligne après `lhs.attachment.id == rhs.attachment.id` :

```swift
    static func == (lhs: AudioMediaView, rhs: AudioMediaView) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.attachment.fileUrl == rhs.attachment.fileUrl
            && lhs.message.id == rhs.message.id
            && lhs.message.deliveryStatus == rhs.message.deliveryStatus
            && lhs.message.updatedAt == rhs.message.updatedAt
            && lhs.isDark == rhs.isDark
            && lhs.accentColor == rhs.accentColor
            && lhs.contactColor == rhs.contactColor
            && lhs.activeAudioLanguageOverride == rhs.activeAudioLanguageOverride
            && lhs.footerModel == rhs.footerModel
    }
```

Raison : sans `fileUrl` dans `==`, la bulle `.equatable()` ne se re-rend pas quand l'URL bascule `file://` → `https://`, donc le `.task(id:)` ne verrait jamais le nouvel `id`.

- [ ] **Step 2: Remplacer l'état `@State`**

Supprimer la ligne `@State private var isCached = false`.
Ajouter à la place :

```swift
    @State private var resolvedAvailability: AudioAvailability = .needsDownload
```

(Conserver `isAudioPlaying`, `showAudioFullscreen`, `selectedAudioLangCode`, `downloader`.)

- [ ] **Step 3: Supprimer `isPlayable`**

Supprimer entièrement la propriété calculée :

```swift
    private var isPlayable: Bool {
        isCached || attachment.fileUrl.hasPrefix("file://")
    }
```

(et son commentaire de doc juste au-dessus).

- [ ] **Step 4: Ajouter la disponibilité combinée + le résolveur**

Ajouter ces deux membres dans `AudioMediaView` (par ex. juste avant `var body`) :

```swift
    /// Disponibilité effective : un téléchargement actif prime, puis un
    /// téléchargement terminé, sinon la résolution « au repos » du `.task`.
    private var availability: AudioAvailability {
        if downloader.isDownloading {
            return .downloading(progress: downloader.progress)
        }
        if downloader.isCached {
            return .ready
        }
        return resolvedAvailability
    }

    /// Résout `resolvedAvailability` depuis l'attachment courant. Appelé par
    /// `.task(id: attachment.fileUrl)` : se ré-exécute quand l'URL bascule
    /// optimiste (`file://`) → serveur (`https://`) à la réconciliation.
    private func resolveAvailability() async {
        let urlString = attachment.fileUrl
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(
                atPath: URL(string: urlString)?.path ?? ""
            )
            resolvedAvailability = AudioAvailability.resolve(
                isLocalFile: true, localFileExists: exists, isServerCached: false
            )
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.audio.isCached(resolved)
        resolvedAvailability = AudioAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: cached
        )
    }
```

- [ ] **Step 5: Remplacer `body`**

Remplacer **intégralement** le `var body` actuel (le `VStack` avec le `ZStack` de swap `if isPlayable`, l'`.overlay` `audioDurationBadge`, et l'ancien `.task`) par :

```swift
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            audioPlayer

            if !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && visualAttachments.isEmpty {
                MessageTextRenderer.render(
                    message.content,
                    fontSize: 13,
                    color: isDark ? Color(hex: "818CF8").opacity(0.5) : Color(hex: "6366F1").opacity(0.4),
                    mentionColor: Color(hex: "818CF8"),
                    accentColor: Color(hex: contactColor),
                    mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                )
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 4)
                .padding(.top, 2)
                .tint(Color(hex: contactColor))
            }
        }
        .fullScreenCover(isPresented: $showAudioFullscreen) {
            AudioFullscreenView(
                allAudioItems: allAudioItems,
                startAttachmentId: attachment.id,
                contactColor: contactColor,
                mentionDisplayNames: mentionDisplayNames,
                onDismissToMessage: onScrollToMessage
            )
        }
        .onChange(of: activeAudioLanguageOverride) { _, newLang in
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                selectedAudioLangCode = newLang
            }
        }
        .task(id: attachment.fileUrl) {
            await resolveAvailability()
        }
    }
```

- [ ] **Step 6: Câbler `availability` + `onDownload` dans `audioPlayer`**

Remplacer **intégralement** la propriété `audioPlayer` par (les deux branches reçoivent les deux nouveaux paramètres, placés avant la closure `bottomContent`) :

```swift
    @ViewBuilder
    private var audioPlayer: some View {
        if hasPlayerBottomContent {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: { showAudioFullscreen = true },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode,
                availability: availability,
                onDownload: { downloader.start(attachment: attachment, onShare: nil) }
            ) {
                playerBottomContent
            }
        } else {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: { showAudioFullscreen = true },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode,
                availability: availability,
                onDownload: { downloader.start(attachment: attachment, onShare: nil) }
            )
        }
    }
```

- [ ] **Step 7: Supprimer le code mort du placeholder**

Supprimer **intégralement** ces membres de `AudioMediaView`, désormais inutilisés :
- `audioPlaceholder` (la propriété calculée entière)
- `waveformPlaceholder(accent:)` (utilisée seulement par `audioPlaceholder`)
- `audioDurationBadge(seconds:)` (utilisée seulement par l'ancien `.overlay` du `body`)
- `formatDuration(_:)` (utilisée seulement par `audioDurationBadge`)

Conserver `hasPlayerBottomContent`, `audioFooter`, `playerBottomContent`, `isPlayable`-est-déjà-supprimé.

- [ ] **Step 8: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`. Si une erreur « unused / cannot find » apparaît pour `formatDuration` ou un helper, vérifier qu'aucun autre membre ne l'utilise (recherche dans le fichier) avant suppression.

- [ ] **Step 9: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift
git commit -m "refactor(ios): AudioMediaView — vue audio unifiée, supprime le placeholder"
```

---

## Task 4 : Vérifier la lecture immédiate après envoi (Volet 2)

**Files:**
- Vérification ; modification de `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift` **uniquement si** l'étape 3 révèle un écart de clé de cache.

- [ ] **Step 1: Lancer l'app**

Run: `./apps/ios/meeshy.sh run`
(Connexion : `atabeth` / `<DEMO_PASSWORD — see apps/ios/fastlane/.env>` si nécessaire.)

- [ ] **Step 2: Reproduire l'envoi audio**

Dans une conversation : enregistrer un message audio et l'envoyer. Observer la bulle audio **sans quitter la conversation** pendant ~10 s (le temps que le serveur confirme via `message:new`).

Expected (comportement corrigé) :
- la bulle affiche le **lecteur** (bouton play) immédiatement après l'envoi ;
- le lecteur **reste** un lecteur play après la confirmation serveur — **aucun** basculement vers un bouton « télécharger ».

- [ ] **Step 3: Si le bouton « télécharger » réapparaît après confirmation — instrumenter**

Ajouter deux logs temporaires.

Dans `ConversationView+AttachmentHandlers.swift`, juste après la ligne
`let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString ?? result.fileUrl` (semis du cache audio) :

```swift
                        Logger.media.debug("[audio-rc3] seed key=\(renderKey, privacy: .public)")
```

Dans `ConversationMediaViews.swift`, dans `AudioMediaView.resolveAvailability()`, juste après le calcul de `resolved` (branche serveur) :

```swift
        Logger.media.debug("[audio-rc3] resolve key=\(resolved, privacy: .public) cached=\(cached)")
```

(`Logger` provient de `import os` ; `Logger.media` est déjà défini dans le projet — cf. `apps/ios/CLAUDE.md` section Logging.)

- [ ] **Step 4: Comparer les clés**

Run: `./apps/ios/meeshy.sh run`, refaire l'envoi audio, lire les logs (`[audio-rc3]`).
Expected : la clé `seed` et la clé `resolve` (branche serveur, après réconciliation) sont **identiques**.

- Si **identiques** et `cached=true` : le bug ne vient pas de la clé — ouvrir une session `superpowers:systematic-debugging` dédiée. Retirer les logs avant de committer.
- Si **différentes** : passer à l'étape 5.

- [ ] **Step 5: Aligner la clé de semis (si écart constaté)**

Si les clés diffèrent, le cache est semé sous une clé que le rendu ne résout jamais. Corriger dans `ConversationView+AttachmentHandlers.swift` : sémer aussi sous la clé que le rendu utilisera. Remplacer le bloc de semis audio :

```swift
                    if let audioData {
                        let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString ?? result.fileUrl
                        await CacheCoordinator.shared.audio.store(audioData, for: renderKey)
                    }
```

par (semis sous la clé TUS **et** sous la clé brute du résultat serveur, pour couvrir les deux formes résolues) :

```swift
                    if let audioData {
                        let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString ?? result.fileUrl
                        await CacheCoordinator.shared.audio.store(audioData, for: renderKey)
                        if renderKey != result.fileUrl {
                            await CacheCoordinator.shared.audio.store(audioData, for: result.fileUrl)
                        }
                    }
```

Si l'écart vient de la forme de l'URL renvoyée par `message:new` (différente de `result.fileUrl`), noter la valeur observée dans les logs de l'étape 4 et sémer également sous cette forme résolue.

- [ ] **Step 6: Retirer l'instrumentation**

Supprimer les deux lignes `Logger.media.debug("[audio-rc3] ...")` ajoutées à l'étape 3.

- [ ] **Step 7: Vérification finale**

Run: `./apps/ios/meeshy.sh run`, refaire l'envoi audio.
Expected : lecteur play immédiat, qui reste play après confirmation serveur ; lecture fonctionnelle au tap. Tester aussi un audio **reçu non téléchargé** : bouton télécharger → progression → play.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix(ios): audio jouable immédiatement après envoi (transition optimiste→confirmé)"
```

(Si aucune modification de fichier n'a été nécessaire — étape 4 « identiques » et bug absent — ce commit n'a pas lieu d'être ; la correction structurelle des Tasks 1-3 suffit.)

---

## Self-Review

**1. Couverture de la spec**

- Spec §2 « une seule vue audio » → Task 3 (suppression du swap placeholder, une seule `AudioPlayerView`).
- Spec §2 « lecture immédiate après envoi » → Task 3 (`.task(id:)` + `==` incluant `fileUrl`) + Task 4 (vérification/durcissement).
- Spec §3.1 `AudioAvailability` → Task 1 (placé en MeeshSDK core, écart documenté en en-tête).
- Spec §3.2 `AudioPlayerView` bouton 3 états + waveform non-seekable hors `.ready` → Task 2.
- Spec §3.3 `AudioMediaView` (suppression placeholder/`isPlayable`/`isCached`, `.task(id:)`, `AttachmentDownloader`, une seule `AudioPlayerView`) → Task 3.
- Spec §4 flux optimiste→confirmé → Task 3 (`.task(id:)`) + Task 4 (vérification de clé).
- Spec §5 gestion d'erreurs (échec téléchargement → retour `.needsDownload`) → couvert par la disponibilité combinée de Task 3 (`downloader.isDownloading`/`isCached` repassent à faux → `resolvedAvailability`).
- Spec §6 tests → Task 1 (XCTest/Swift Testing du résolveur) + Task 4 (smoke).
- Spec §3.3 « bouton plein écran conservé » → Task 3 Step 5 garde `.fullScreenCover` + `onFullscreen`.

Aucun écart non couvert.

**2. Placeholders** — aucun « TBD/TODO ». Task 4 est conditionnelle par nature (débogage) mais chaque étape donne le code exact et la repro exacte.

**3. Cohérence des types**

- `AudioAvailability.resolve(isLocalFile:localFileExists:isServerCached:)` — même signature en Task 1 (définition), Task 3 (appel).
- `AudioAvailability` cas `.ready` / `.needsDownload` / `.downloading(progress: Double)` — cohérents Task 1/2/3.
- `AudioPlayerView` nouveaux paramètres `availability: AudioAvailability = .ready`, `onDownload: (() -> Void)? = nil` — mêmes noms/types en Task 2 (init) et Task 3 (appel `audioPlayer`).
- `downloader.progress` (`Double`), `downloader.isDownloading`/`isCached` (`Bool`), `downloader.start(attachment:onShare:)` — conformes à `AttachmentDownloader` (`ConversationMediaViews.swift`).
