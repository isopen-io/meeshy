# iOS — Lecture YouTube intégrée (embeds vidéo client) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher et lire des vidéos YouTube directement dans Meeshy (Feed, détail de poste, messages) via une vignette façade qui charge un player officiel WKWebView au tap.

**Architecture:** Un résolveur pur en core (`EmbeddableVideoResolver` → `EmbeddedVideo`), deux atomes agnostiques en MeeshyUI (`VideoEmbedThumbnail`, `YouTubeEmbedPlayerView` WKWebView + IFrame API), un orchestrateur app-side (`VideoEmbedContainer` conforme `StoppablePlayer`) câblé sur les 3 surfaces. Coordination via `PlaybackCoordinator` (single-active) + `MediaSessionCoordinator` (session audio, call-aware) — tous deux existants.

**Tech Stack:** Swift 6 (defaultIsolation MainActor en MeeshyUI), SwiftUI, WebKit (WKWebView + YouTube IFrame Player API), Swift Testing (SDK) + XCTest (app). Cibles iOS 17 (app) / iOS 16 (SDK).

**Spec de référence:** `docs/superpowers/specs/2026-06-18-ios-youtube-video-embed-design.md`

---

## Structure de fichiers

**Nouveaux :**
- `packages/MeeshySDK/Sources/MeeshySDK/Services/EmbeddableVideoResolver.swift` — résolveur pur + `EmbeddedVideo` + `VideoEmbedProvider`.
- `packages/MeeshySDK/Tests/MeeshySDKTests/EmbeddableVideoResolverTests.swift` — tests purs.
- `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEmbedThumbnail.swift` — atome vignette.
- `packages/MeeshySDK/Sources/MeeshyUI/Media/YouTubeEmbedPlayerView.swift` — atome player WKWebView + `YouTubeEmbedController`.
- `apps/ios/Meeshy/Features/Main/Views/VideoEmbedContainer.swift` — orchestrateur app (`VideoEmbedModel` + vue).
- `apps/ios/MeeshyTests/VideoEmbedModelTests.swift` — tests modèle (gate appel + phases).

**Modifiés :**
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` — précédence embed/OG.
- `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` — résolution parent + passage param.
- `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` — param `embeddedVideo` + `==`.
- `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` — détection + embed.
- `apps/ios/Meeshy.xcodeproj/project.pbxproj` — entrées pour `VideoEmbedContainer.swift` uniquement.
- (vérif) `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift`.

---

## Task 0 : Verrouiller les signatures des coordinateurs (lecture seule)

Avant tout code, confirmer les API réelles que `VideoEmbedModel` appellera. Aucune modif.

**Files:**
- Read: `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift`
- Read: `packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift`
- Read: `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift`
- Read: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaCoordinator.swift`

- [ ] **Step 1: Confirmer le protocole `StoppablePlayer`**

Run: `grep -n "protocol StoppablePlayer\|func registerExternal\|func unregisterExternal\|func willStartPlaying\|func stopAll" packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift`
Attendu : voir `protocol StoppablePlayer: AnyObject { func stop() }`, `registerExternal(_:)`, `unregisterExternal(_:)`, `willStartPlaying(external:)`, `stopAll()`.
Noter : est-ce que `willStartPlaying(external:)` appelle `SharedAVPlayerManager.shared.stop()` (stoppe la vidéo native) ? Est-ce que `stopAll()` stoppe aussi les `externalPlayers` ?

- [ ] **Step 2: Confirmer la signature `activatePlaybackSync`**

Run: `grep -rn "activatePlaybackSync\|deactivatePlaybackSync\|var isCallActive\|let events\|enum Event" packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift`
Attendu : noter la signature EXACTE utilisée par `SharedAVPlayerManager` (probablement `activatePlaybackSync(options: [.duckOthers])`). `VideoEmbedModel` devra l'appeler à l'identique. Noter les cas de `enum Event`.

- [ ] **Step 3: Confirmer le pattern de référence**

Run: `grep -n "registerExternal\|willStartPlaying(external\|func stop\|activatePlaybackSync\|deactivatePlaybackSync" packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaCoordinator.swift`
Attendu : `StoryMediaCoordinator` enregistre via `registerExternal(self)`, réclame via `willStartPlaying(external: self)`, et `stop()` fait le nettoyage. C'est le modèle à copier.

- [ ] **Step 4: Noter les écarts**

Si `willStartPlaying(external:)` ne stoppe PAS la vidéo native, le noter : la Task 7 ajoutera `SharedAVPlayerManager.shared.stop()` dans `VideoEmbedModel.start()` (ou ajustera le coordinateur). Pas de commit (lecture seule).

---

## Task 1 : `EmbeddedVideo` + `VideoEmbedProvider` + `EmbeddableVideoResolver` (core, pur)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/EmbeddableVideoResolver.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/EmbeddableVideoResolverTests.swift`

- [ ] **Step 1: Écrire les tests qui échouent**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/EmbeddableVideoResolverTests.swift` :

```swift
import Testing
import Foundation
@testable import MeeshySDK

@Suite("EmbeddableVideoResolver")
struct EmbeddableVideoResolverTests {

    @Test("watch?v= résout l'id")
    func watchURL() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        #expect(v?.provider == .youtube)
        #expect(v?.videoId == "dQw4w9WgXcQ")
        #expect(v?.startSeconds == nil)
    }

    @Test("youtu.be court résout l'id")
    func shortURL() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/dQw4w9WgXcQ")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("shorts résout l'id")
    func shortsURL() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://www.youtube.com/shorts/dQw4w9WgXcQ")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("embed résout l'id")
    func embedURL() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://www.youtube.com/embed/dQw4w9WgXcQ")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("m.youtube.com résout l'id")
    func mobileURL() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://m.youtube.com/watch?v=dQw4w9WgXcQ")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("timestamp t=90 (secondes) parsé")
    func startSeconds() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/dQw4w9WgXcQ?t=90")
        #expect(v?.startSeconds == 90)
    }

    @Test("timestamp t=1m30s parsé")
    func startHMS() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")
        #expect(v?.startSeconds == 90)
    }

    @Test("params parasites ignorés")
    func noiseParams() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&si=abc")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("URL non-YouTube → nil")
    func nonYouTube() {
        #expect(EmbeddableVideoResolver.resolve(urlString: "https://vimeo.com/12345") == nil)
        #expect(EmbeddableVideoResolver.resolve(urlString: "https://example.com/watch?v=abc") == nil)
    }

    @Test("URL malformée / non-http → nil")
    func malformed() {
        #expect(EmbeddableVideoResolver.resolve(urlString: "pas une url") == nil)
        #expect(EmbeddableVideoResolver.resolve(urlString: "mailto:a@b.com") == nil)
    }

    @Test("resolve(in:) extrait la première URL d'un texte")
    func inText() {
        let v = EmbeddableVideoResolver.resolve(in: "Regarde ça https://youtu.be/dQw4w9WgXcQ c'est top")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("thumbnailURL et embedURL bien construites")
    func urls() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/dQw4w9WgXcQ")!
        #expect(v.thumbnailURL().absoluteString == "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
        #expect(v.embedURL.absoluteString == "https://www.youtube.com/embed/dQw4w9WgXcQ")
    }
}
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec (compile error)**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/EmbeddableVideoResolver -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -20`
Attendu : ÉCHEC de compilation (`cannot find 'EmbeddableVideoResolver'`).

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/MeeshySDK/Sources/MeeshySDK/Services/EmbeddableVideoResolver.swift` :

```swift
import Foundation

public enum VideoEmbedProvider: String, Sendable, Codable, Equatable {
    case youtube
}

public enum YouTubeThumbnailQuality: String, Sendable {
    case standard = "hqdefault"
    case high = "maxresdefault"
}

public struct EmbeddedVideo: Sendable, Codable, Equatable, Identifiable {
    public let provider: VideoEmbedProvider
    public let videoId: String
    public let startSeconds: Int?

    public init(provider: VideoEmbedProvider, videoId: String, startSeconds: Int? = nil) {
        self.provider = provider
        self.videoId = videoId
        self.startSeconds = startSeconds
    }

    public var id: String { "\(provider.rawValue):\(videoId)" }

    public func thumbnailURL(_ quality: YouTubeThumbnailQuality = .standard) -> URL {
        URL(string: "https://img.youtube.com/vi/\(videoId)/\(quality.rawValue).jpg")!
    }

    public var embedURL: URL {
        URL(string: "https://www.youtube.com/embed/\(videoId)")!
    }
}

public enum EmbeddableVideoResolver {

    private static let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    public static func resolve(in text: String) -> EmbeddedVideo? {
        guard let detector else { return nil }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        for match in detector.matches(in: text, options: [], range: range) {
            guard let url = match.url, let v = resolve(url: url) else { continue }
            return v
        }
        return nil
    }

    public static func resolve(urlString: String) -> EmbeddedVideo? {
        guard let url = URL(string: urlString) else { return nil }
        return resolve(url: url)
    }

    public static func resolve(url: URL) -> EmbeddedVideo? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
        guard let host = url.host?.lowercased() else { return nil }
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let start = parseStart(comps: comps, fragment: url.fragment)

        if host == "youtu.be" {
            return make(String(url.path.dropFirst()), start)
        }
        if host == "youtube.com" || host.hasSuffix(".youtube.com")
            || host == "youtube-nocookie.com" || host.hasSuffix(".youtube-nocookie.com") {
            if url.path == "/watch", let v = comps?.queryItems?.first(where: { $0.name == "v" })?.value {
                return make(v, start)
            }
            let parts = url.path.split(separator: "/").map(String.init)
            if parts.count >= 2, ["shorts", "embed", "v", "live"].contains(parts[0]) {
                return make(parts[1], start)
            }
        }
        return nil
    }

    private static func make(_ rawId: String, _ start: Int?) -> EmbeddedVideo? {
        let id = rawId.prefix { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }
        guard id.count >= 6, id.count <= 20 else { return nil }
        return EmbeddedVideo(provider: .youtube, videoId: String(id), startSeconds: start)
    }

    private static func parseStart(comps: URLComponents?, fragment: String?) -> Int? {
        let raw = comps?.queryItems?.first(where: { $0.name == "t" || $0.name == "start" })?.value
            ?? fragmentValue(fragment, key: "t")
        guard let raw else { return nil }
        return parseDuration(raw)
    }

    private static func fragmentValue(_ fragment: String?, key: String) -> String? {
        guard let fragment else { return nil }
        for pair in fragment.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1)
            if kv.count == 2, kv[0] == key { return String(kv[1]) }
            if kv.count == 1, fragment.hasPrefix("\(key)") { return String(fragment.dropFirst(key.count + 1)) }
        }
        return nil
    }

    private static func parseDuration(_ s: String) -> Int? {
        if let plain = Int(s) { return plain }
        var total = 0
        var number = ""
        var matched = false
        for ch in s {
            if ch.isNumber { number.append(ch); continue }
            guard let n = Int(number) else { return matched ? total : nil }
            switch ch {
            case "h", "H": total += n * 3600; matched = true
            case "m", "M": total += n * 60; matched = true
            case "s", "S": total += n; matched = true
            default: return matched ? total : nil
            }
            number = ""
        }
        if let n = Int(number) { total += n; matched = true }
        return matched ? total : nil
    }
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/EmbeddableVideoResolver -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -20`
Attendu : tous les tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/EmbeddableVideoResolver.swift packages/MeeshySDK/Tests/MeeshySDKTests/EmbeddableVideoResolverTests.swift
git commit -m "feat(sdk): EmbeddableVideoResolver + EmbeddedVideo (détection YouTube pure)"
```

---

## Task 2 : `VideoEmbedThumbnail` (atome MeeshyUI)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEmbedThumbnail.swift`

- [ ] **Step 1: Écrire l'atome**

Create `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEmbedThumbnail.swift` :

```swift
import SwiftUI

/// Vignette façade pour un embed vidéo : image + overlay play + badge provider.
/// Atome agnostique : ne dépend d'aucun singleton Meeshy.
public struct VideoEmbedThumbnail: View {
    public let thumbnailURLString: String
    public let providerLabel: String
    public let accent: Color
    public let onTap: () -> Void

    public init(thumbnailURLString: String,
                providerLabel: String,
                accent: Color,
                onTap: @escaping () -> Void) {
        self.thumbnailURLString = thumbnailURLString
        self.providerLabel = providerLabel
        self.accent = accent
        self.onTap = onTap
    }

    public var body: some View {
        Button(action: onTap) {
            ZStack {
                CachedAsyncImage(url: thumbnailURLString,
                                 targetSize: CGSize(width: 640, height: 360)) {
                    Color.black.opacity(0.2)
                }
                .aspectRatio(16.0 / 9.0, contentMode: .fill)

                Color.black.opacity(0.18)

                Image(systemName: "play.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
                    .padding(18)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().stroke(accent.opacity(0.6), lineWidth: 1.5))

                VStack {
                    Spacer()
                    HStack {
                        Text(providerLabel)
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.black.opacity(0.55), in: Capsule())
                        Spacer()
                    }
                    .padding(8)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Lire la vidéo \(providerLabel)")
    }
}
```

- [ ] **Step 2: Vérifier la compilation du package UI**

Run: `xcodebuild build -scheme MeeshyUI -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -15`
Attendu : `BUILD SUCCEEDED`. Si erreur sur `CachedAsyncImage` (signature), ouvrir `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift` et adapter l'appel à l'init exact.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEmbedThumbnail.swift
git commit -m "feat(ui): VideoEmbedThumbnail (vignette façade embed vidéo)"
```

---

## Task 3 : `YouTubeEmbedPlayerView` + `YouTubeEmbedController` (atome MeeshyUI, WKWebView)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Media/YouTubeEmbedPlayerView.swift`

- [ ] **Step 1: Écrire le player WKWebView**

> **Sécurité — pas de SRI sur `iframe_api` (intentionnel).** Ne PAS ajouter
> `integrity="sha384-…"` au tag `<script src="https://www.youtube.com/iframe_api">`.
> C'est un loader bootstrap que YouTube met à jour et qui charge dynamiquement
> `www-widgetapi.js` ; un hash SRI le casserait et YouTube n'en publie pas. Chargement
> en HTTPS strict (ATS actif) + origin `https://www.youtube.com` via `baseURL`. C'est
> l'unique méthode d'embed conforme aux CGU YouTube.

Create `packages/MeeshySDK/Sources/MeeshyUI/Media/YouTubeEmbedPlayerView.swift` :

```swift
import SwiftUI
import WebKit

/// Contrôleur impératif d'un player YouTube hébergé en WKWebView.
/// Atome agnostique : l'app décide QUAND appeler play/pause.
@MainActor
public final class YouTubeEmbedController {
    fileprivate weak var webView: WKWebView?
    public init() {}

    public func play() { webView?.evaluateJavaScript("ytPlay();", completionHandler: nil) }
    public func pause() { webView?.evaluateJavaScript("ytPause();", completionHandler: nil) }

    /// Lit le temps courant (secondes) puis appelle le completion sur le main actor.
    public func currentTime(_ completion: @escaping @MainActor (Int) -> Void) {
        webView?.evaluateJavaScript("ytCurrentTime();") { value, _ in
            let seconds: Int
            if let i = value as? Int { seconds = i }
            else if let d = value as? Double { seconds = Int(d) }
            else { seconds = 0 }
            MainActor.assumeIsolated { completion(seconds) }
        }
    }
}

/// Player YouTube inline via l'IFrame Player API officielle (conforme CGU).
public struct YouTubeEmbedPlayerView: UIViewRepresentable {

    public enum State: String, Sendable {
        case ready, playing, paused, ended
    }

    public let videoId: String
    public let startSeconds: Int
    public let controller: YouTubeEmbedController
    public let onStateChange: (State) -> Void

    public init(videoId: String,
                startSeconds: Int = 0,
                controller: YouTubeEmbedController,
                onStateChange: @escaping (State) -> Void) {
        self.videoId = videoId
        self.startSeconds = startSeconds
        self.controller = controller
        self.onStateChange = onStateChange
    }

    public func makeCoordinator() -> Coordinator { Coordinator(onStateChange: onStateChange) }

    public func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let ucc = WKUserContentController()
        ucc.add(context.coordinator, name: "ytbridge")
        config.userContentController = ucc

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .black
        controller.webView = webView
        webView.loadHTMLString(Self.html(videoId: videoId, start: startSeconds),
                               baseURL: URL(string: "https://www.youtube.com"))
        return webView
    }

    public func updateUIView(_ uiView: WKWebView, context: Context) {}

    public static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "ytbridge")
        uiView.stopLoading()
        uiView.loadHTMLString("", baseURL: nil)
    }

    private static func html(videoId: String, start: Int) -> String {
        """
        <!DOCTYPE html><html><head>
        <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}#player{width:100%;height:100%}</style>
        </head><body>
        <div id="player"></div>
        <script src="https://www.youtube.com/iframe_api"></script>
        <script>
        var ytp;
        function onYouTubeIframeAPIReady(){
          ytp=new YT.Player('player',{width:'100%',height:'100%',videoId:'\(videoId)',
            playerVars:{playsinline:1,modestbranding:1,rel:0,start:\(start)},
            events:{
              'onReady':function(e){post('ready');},
              'onStateChange':function(e){
                if(e.data===YT.PlayerState.PLAYING)post('playing');
                else if(e.data===YT.PlayerState.PAUSED)post('paused');
                else if(e.data===YT.PlayerState.ENDED)post('ended');
              }
            }});
        }
        function post(s){window.webkit.messageHandlers.ytbridge.postMessage(s);}
        function ytPlay(){if(ytp&&ytp.playVideo)ytp.playVideo();}
        function ytPause(){if(ytp&&ytp.pauseVideo)ytp.pauseVideo();}
        function ytCurrentTime(){return (ytp&&ytp.getCurrentTime)?Math.floor(ytp.getCurrentTime()):0;}
        </script>
        </body></html>
        """
    }

    public final class Coordinator: NSObject, WKScriptMessageHandler {
        let onStateChange: (State) -> Void
        init(onStateChange: @escaping (State) -> Void) { self.onStateChange = onStateChange }

        public nonisolated func userContentController(_ userContentController: WKUserContentController,
                                                      didReceive message: WKScriptMessage) {
            let body = (message.body as? String) ?? ""
            guard let state = State(rawValue: body) else { return }
            MainActor.assumeIsolated { onStateChange(state) }
        }
    }
}
```

- [ ] **Step 2: Vérifier la compilation du package UI**

Run: `xcodebuild build -scheme MeeshyUI -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -25`
Attendu : `BUILD SUCCEEDED`.
Si erreur d'isolation sur `userContentController` (« does not satisfy nonisolated requirement ») : garder `nonisolated` (déjà le cas). Si erreur sur `MainActor.assumeIsolated` capturant `onStateChange` : c'est attendu car le callback WebKit arrive sur le main thread — laisser tel quel ; si le compilateur refuse, remplacer par `Task { @MainActor in onStateChange(state) }`.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/YouTubeEmbedPlayerView.swift
git commit -m "feat(ui): YouTubeEmbedPlayerView (WKWebView + IFrame Player API)"
```

---

## Task 4 : `VideoEmbedContainer` + `VideoEmbedModel` (orchestrateur app)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/VideoEmbedContainer.swift`
- Test: `apps/ios/MeeshyTests/VideoEmbedModelTests.swift`

> **Rappel Task 0** : appeler `activatePlaybackSync` avec la signature EXACTE relevée (ci-dessous on suppose `activatePlaybackSync(options: [.duckOthers])` ; ajuster si différent). Si `willStartPlaying(external:)` ne stoppe pas la vidéo native, ajouter `SharedAVPlayerManager.shared.stop()` dans `start()`.

- [ ] **Step 1: Écrire le test du modèle (gate appel + phases)**

Create `apps/ios/MeeshyTests/VideoEmbedModelTests.swift` :

```swift
import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class VideoEmbedModelTests: XCTestCase {

    override func tearDown() {
        MediaSessionCoordinator.shared.setCallActive(false)
        super.tearDown()
    }

    func test_start_whenCallActive_staysIdle() {
        MediaSessionCoordinator.shared.setCallActive(true)
        let model = VideoEmbedModel()
        model.start()
        XCTAssertEqual(model.phase, .idle)
    }

    func test_start_whenNoCall_movesToLoading() {
        MediaSessionCoordinator.shared.setCallActive(false)
        let model = VideoEmbedModel()
        model.start()
        XCTAssertEqual(model.phase, .loading)
    }

    func test_stop_resetsToIdle() {
        MediaSessionCoordinator.shared.setCallActive(false)
        let model = VideoEmbedModel()
        model.start()
        model.stop()
        XCTAssertEqual(model.phase, .idle)
    }

    func test_onState_playingMovesToPlaying() {
        MediaSessionCoordinator.shared.setCallActive(false)
        let model = VideoEmbedModel()
        model.start()
        model.onState(.playing)
        XCTAssertEqual(model.phase, .playing)
    }
}
```

- [ ] **Step 2: Lancer le test, vérifier l'échec (compile)**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -15`
Attendu : ÉCHEC compile (`cannot find 'VideoEmbedModel'`). (Le test ne peut linker tant que le type n'existe pas.)

- [ ] **Step 3: Écrire le container + modèle**

Create `apps/ios/Meeshy/Features/Main/Views/VideoEmbedContainer.swift` :

```swift
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Orchestre la façade embed vidéo : vignette → (au tap) player WKWebView,
/// single-active via PlaybackCoordinator, call-aware via MediaSessionCoordinator.
@MainActor
final class VideoEmbedModel: ObservableObject, StoppablePlayer {

    enum Phase: Equatable { case idle, loading, playing, paused }

    @Published private(set) var phase: Phase = .idle
    let controller = YouTubeEmbedController()

    private var registered = false
    private var cancellables = Set<AnyCancellable>()

    func start() {
        guard phase == .idle else { return }
        guard !MediaSessionCoordinator.shared.isCallActive else { return }
        if !registered {
            PlaybackCoordinator.shared.registerExternal(self)
            registered = true
            observeInterruptions()
        }
        PlaybackCoordinator.shared.willStartPlaying(external: self)
        MediaSessionCoordinator.shared.activatePlaybackSync(options: [.duckOthers])
        phase = .loading
    }

    func onState(_ state: YouTubeEmbedPlayerView.State) {
        switch state {
        case .ready:
            controller.play()
        case .playing:
            phase = .playing
        case .paused:
            if phase != .idle { phase = .paused }
        case .ended:
            stop()
        }
    }

    /// StoppablePlayer — appelé par le coordinateur quand un autre média démarre ou sur appel.
    func stop() {
        controller.pause()
        if phase != .idle {
            phase = .idle
            MediaSessionCoordinator.shared.deactivatePlaybackSync()
        }
    }

    /// onDisappear (cellules recyclées en messages, scroll-off ailleurs).
    func teardown() {
        stop()
        if registered {
            PlaybackCoordinator.shared.unregisterExternal(self)
            registered = false
        }
    }

    private func observeInterruptions() {
        MediaSessionCoordinator.shared.events
            .sink { [weak self] event in
                Task { @MainActor in
                    switch event {
                    case .interruptionBegan, .routeChangedOldDeviceUnavailable:
                        self?.stop()
                    default:
                        break
                    }
                }
            }
            .store(in: &cancellables)
    }
}

struct VideoEmbedContainer: View {
    let video: EmbeddedVideo
    let accent: Color

    @StateObject private var model = VideoEmbedModel()
    @State private var showFullscreen = false
    @State private var fullscreenStart = 0

    init(video: EmbeddedVideo, accent: Color) {
        self.video = video
        self.accent = accent
    }

    var body: some View {
        Group {
            if model.phase == .idle {
                VideoEmbedThumbnail(
                    thumbnailURLString: video.thumbnailURL().absoluteString,
                    providerLabel: "YouTube",
                    accent: accent
                ) { model.start() }
            } else {
                ZStack(alignment: .topTrailing) {
                    YouTubeEmbedPlayerView(
                        videoId: video.videoId,
                        startSeconds: video.startSeconds ?? 0,
                        controller: model.controller,
                        onStateChange: { state in model.onState(state) }
                    )
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                    Button {
                        model.controller.currentTime { seconds in
                            fullscreenStart = seconds
                            model.controller.pause()
                            showFullscreen = true
                        }
                    } label: {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                            .padding(8)
                            .background(.black.opacity(0.5), in: Circle())
                    }
                    .padding(8)
                    .accessibilityLabel("Plein écran")
                }
            }
        }
        .onDisappear { model.teardown() }
        .fullScreenCover(isPresented: $showFullscreen) {
            YouTubeFullscreenView(video: video, startSeconds: fullscreenStart) {
                showFullscreen = false
            }
        }
    }
}

private struct YouTubeFullscreenView: View {
    let video: EmbeddedVideo
    let startSeconds: Int
    let onClose: () -> Void

    @StateObject private var model = VideoEmbedModel()

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            YouTubeEmbedPlayerView(
                videoId: video.videoId,
                startSeconds: startSeconds,
                controller: model.controller,
                onStateChange: { state in model.onState(state) }
            )
            .aspectRatio(16.0 / 9.0, contentMode: .fit)

            Button(action: { model.teardown(); onClose() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .padding(12)
                    .background(.black.opacity(0.5), in: Circle())
            }
            .padding(16)
            .accessibilityLabel("Fermer")
        }
        .onAppear { model.start() }
        .onDisappear { model.teardown() }
    }
}
```

- [ ] **Step 4: Câbler `VideoEmbedContainer.swift` dans le pbxproj**

Le fichier est app-side → entrées manuelles requises (objectVersion 63). Ajouter 2 UUIDs lisibles (ex `VEMB01...` / `VEMB02...`) et 4 entrées : `PBXFileReference`, `PBXBuildFile`, membership dans le `PBXGroup` `Views`, et dans la `PBXSourcesBuildPhase` de la cible `Meeshy`. Suivre exactement le pattern d'un fichier voisin (ex `VideoAvailabilityResolver.swift`) :

Run: `grep -n "VideoAvailabilityResolver.swift" apps/ios/Meeshy.xcodeproj/project.pbxproj`
Reproduire les 4 mêmes types de lignes pour `VideoEmbedContainer.swift` avec de nouveaux UUIDs.

- [ ] **Step 5: Lancer les tests, vérifier le succès**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -15`
Attendu : `BUILD SUCCEEDED`.
Run: `./apps/ios/meeshy.sh test 2>&1 | tail -25`
Attendu : `VideoEmbedModelTests` (4 tests) PASS. (Si flakiness sur d'autres suites, voir lessons — re-run avant de conclure à une régression.)

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/VideoEmbedContainer.swift apps/ios/MeeshyTests/VideoEmbedModelTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): VideoEmbedContainer + VideoEmbedModel (façade, single-active, call-aware)"
```

---

## Task 5 : Câblage Messages — précédence embed/OG dans `BubbleStandardLayout`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` (~lignes 884-894)

- [ ] **Step 1: Lire le point d'insertion exact**

Run: `grep -n "firstLinkURL\|LinkPreviewCard" apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`
Repérer le bloc actuel (forme attendue) :

```swift
if let url = content.text?.firstLinkURL {
    LinkPreviewCard(
        urlString: url,
        accentColor: contactColor,
        isDark: isDark
    )
    .padding(.top, 4)
}
```

Noter le **type** de `contactColor` (Color ou hex String) — `VideoEmbedContainer` attend `accent: Color`.

- [ ] **Step 2: Remplacer par la précédence embed/OG**

Remplacer le bloc ci-dessus par :

```swift
if let url = content.text?.firstLinkURL {
    if let video = EmbeddableVideoResolver.resolve(urlString: url) {
        VideoEmbedContainer(video: video, accent: contactColor)
            .padding(.top, 4)
    } else {
        LinkPreviewCard(
            urlString: url,
            accentColor: contactColor,
            isDark: isDark
        )
        .padding(.top, 4)
    }
}
```

Si `contactColor` n'est PAS un `Color` (ex hex `String`), convertir : `VideoEmbedContainer(video: video, accent: Color(hex: contactColor))` en utilisant le helper hex→Color existant (vérifier son nom via `grep -rn "init(hex" packages/MeeshySDK/Sources/MeeshyUI`).

- [ ] **Step 3: Vérifier le build + non-régression OG**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -15`
Attendu : `BUILD SUCCEEDED`.

- [ ] **Step 4: Vérification manuelle (simulateur)**

Lancer l'app, envoyer dans une conversation un message `https://youtu.be/dQw4w9WgXcQ` → vignette YouTube + play inline. Envoyer `https://exemple.com` → carte OG inchangée. (Voir skill `ios-simulator` pour l'automatisation.)

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift
git commit -m "feat(ios/messages): embed YouTube inline (précédence sur l'aperçu OG)"
```

---

## Task 6 : Câblage Feed — résolution parent + param `FeedPostCard`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`

- [ ] **Step 1: Lire les points d'ancrage**

Run: `grep -n "struct FeedPostCard\|init(\|static func ==\|Text(truncation\|feedPostCardView\|.equatable()" apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift apps/ios/Meeshy/Features/Main/Views/FeedView.swift`
Repérer : l'`init` de `FeedPostCard`, son `static func ==`, l'endroit où le texte du post est rendu, et `feedPostCardView(for:)` dans `FeedView`.

- [ ] **Step 2: Ajouter la propriété + paramètre `embeddedVideo` à `FeedPostCard`**

Dans `FeedPostCard`, ajouter la propriété stockée (près des autres `let`) :

```swift
let embeddedVideo: EmbeddedVideo?
```

Et l'ajouter à l'`init` (avec défaut pour ne pas casser les autres appels) :

```swift
embeddedVideo: EmbeddedVideo? = nil,
```

(en assignant `self.embeddedVideo = embeddedVideo` dans le corps de l'init).

- [ ] **Step 3: Rendre l'embed sous le texte**

Juste après le bloc de rendu du texte principal (avant le bloc repost/média), insérer :

```swift
if let embeddedVideo {
    VideoEmbedContainer(video: embeddedVideo, accent: accentColor)
        .padding(.vertical, 8)
}
```

(`accentColor` est la couleur d'accent déjà disponible dans `FeedPostCard` ; vérifier son type et convertir en `Color` si besoin, comme en Task 5.)

- [ ] **Step 4: Mettre à jour l'`Equatable` (footgun)**

Dans `static func == (lhs:rhs:)`, ajouter à la chaîne de comparaison :

```swift
&& lhs.embeddedVideo == rhs.embeddedVideo
```

- [ ] **Step 5: Résoudre côté parent dans `FeedView`**

Dans `feedPostCardView(for:)` (ou l'endroit où `FeedPostCard(...)` est construit), résoudre l'embed depuis le contenu du post et le passer :

```swift
FeedPostCard(
    // ... params existants ...
    embeddedVideo: EmbeddableVideoResolver.resolve(in: post.content ?? "")
)
.equatable()
```

(Adapter au nom réel du champ contenu : `post.content` est `String?` d'après la spec ; vérifier au Step 1.)

- [ ] **Step 6: Vérifier le build**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -15`
Attendu : `BUILD SUCCEEDED`.

- [ ] **Step 7: Vérification manuelle (simulateur)**

Ouvrir le Feed avec un post contenant un lien YouTube → vignette + lecture inline ; scroller pour confirmer que la vidéo s'arrête au scroll-off (teardown SwiftUI).

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift apps/ios/Meeshy/Features/Main/Views/FeedView.swift
git commit -m "feat(ios/feed): embed YouTube inline dans les posts (résolution parent + Equatable)"
```

---

## Task 7 : Câblage Détail de poste + vérif single-active vidéo native

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` (~lignes 878-916)
- (vérif) `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift`

- [ ] **Step 1: Lire le point d'ancrage du détail**

Run: `grep -n "effectiveContent\|Text(truncation\|textZone\|secondaryContent" apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`
Repérer la fin du bloc texte (avant le panneau de traduction secondaire).

- [ ] **Step 2: Insérer l'embed**

Après le bloc texte du détail, insérer :

```swift
if let video = EmbeddableVideoResolver.resolve(in: effectiveContent) {
    VideoEmbedContainer(video: video, accent: accentColor)
        .padding(.horizontal, 16)
        .padding(.top, 8)
}
```

(Adapter `effectiveContent` / `accentColor` aux noms réels relevés au Step 1.)

- [ ] **Step 3: Vérifier la sémantique single-active vs vidéo native (rappel Task 0)**

Run: `grep -n "func willStartPlaying(external\|SharedAVPlayerManager.shared.stop\|func stopAll" packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift`
- Si `willStartPlaying(external:)` appelle déjà `SharedAVPlayerManager.shared.stop()` → rien à faire.
- Sinon : dans `VideoEmbedModel.start()` (Task 4), ajouter après `willStartPlaying(external:)` :
  ```swift
  SharedAVPlayerManager.shared.stop()
  ```
  (import `MeeshyUI` déjà présent). Recommit la Task 4 ou inclure ici.

- [ ] **Step 4: Vérifier le build**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -15`
Attendu : `BUILD SUCCEEDED`.

- [ ] **Step 5: Vérification manuelle (simulateur)**

Ouvrir un détail de poste avec lien YouTube → embed inline + bouton plein écran (continuité au temps courant). Démarrer une vidéo native ailleurs → l'embed YouTube s'arrête (single-active). Simuler un appel → lecture coupée.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift apps/ios/Meeshy/Features/Main/Views/VideoEmbedContainer.swift
git commit -m "feat(ios/postdetail): embed YouTube inline + single-active vs vidéo native"
```

---

## Task 8 : Vérification d'intégration finale

**Files:** aucun (clean build + suite).

- [ ] **Step 1: Clean build depuis main**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -15`
Attendu : `BUILD SUCCEEDED`.

- [ ] **Step 2: Suite SDK**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/EmbeddableVideoResolver -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -20`
Attendu : PASS.

- [ ] **Step 3: Suite app**

Run: `./apps/ios/meeshy.sh test 2>&1 | tail -25`
Attendu : `VideoEmbedModelTests` PASS (re-run si une suite flaky connue échoue).

- [ ] **Step 4: Checklist perf/thermique manuelle**

Vérifier sur device/simu : (a) en scroll feed, aucune lecture n'est lancée sans tap (façade) ; (b) une seule vidéo active à la fois ; (c) `getCurrentTime` n'est appelé qu'à l'expand (pas de boucle 60 Hz) ; (d) lecture coupée sur appel ; (e) WKWebView détruit au scroll-off / fermeture de conversation (pas de lecture fantôme).

---

## Self-Review (effectuée)

**Couverture spec :** §Abstraction → Task 1. §Atomes MeeshyUI → Tasks 2-3. §VideoEmbedContainer + coordination → Task 4 (+ Task 0 verrouille les API). §Messages → Task 5. §Feed (mémoïsation parent + Equatable) → Task 6. §Détail + single-active vidéo native → Task 7. §Plein écran (continuité getCurrentTime) → Task 4 (`YouTubeFullscreenView`). §Perf/thermique/call-aware → Tasks 4 & 8. §Hook serveur (`metadata.embed`) → hors v1 (EmbeddedVideo Codable prêt). §Hors scope (web, OG postes, autres providers, oEmbed) → non implémentés, conforme.

**Placeholders :** aucun TODO/TBD ; les valeurs incertaines (signature `activatePlaybackSync`, type de `contactColor`/`accentColor`, sémantique `willStartPlaying(external:)`) sont traitées par des étapes de lecture explicites (Task 0, Steps « lire le point d'ancrage »), pas par des « à compléter ».

**Cohérence des types :** `EmbeddedVideo`/`EmbeddableVideoResolver.resolve(urlString:|in:)`, `YouTubeEmbedController.play/pause/currentTime`, `YouTubeEmbedPlayerView.State`, `VideoEmbedModel.Phase`, `StoppablePlayer.stop()` — noms identiques entre tâches de définition (1-4) et tâches d'usage (5-7).
