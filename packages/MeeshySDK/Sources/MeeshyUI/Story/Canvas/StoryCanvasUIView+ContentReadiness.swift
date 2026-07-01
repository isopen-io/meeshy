import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + ContentReadiness

extension StoryCanvasUIView {
    // MARK: - Content readiness (drives StoryReaderTimerController)

    /// Decides when the background media for the current slide is fully
    /// usable on screen and fires `onContentReady` exactly once per
    /// `rebuildLayers()` cycle. Behaviour per `Kind`:
    ///
    /// - `.solidColor`, `.gradient` : ready immediately (synchronous draw).
    ///   We post the callback through the next runloop tick to mirror the
    ///   async paths and keep the contract observable from a single test
    ///   `XCTestExpectation`.
    /// - `.image` : `StoryBackgroundLayer.configure(...)` writes a ThumbHash
    ///   placeholder synchronously, then `Task`-fetches the real bitmap and
    ///   reassigns `contentLayer.contents`. We KVO-observe that property and
    ///   fire when contents transitions from `nil`/`placeholder` to a real
    ///   `CGImage`. A nil ThumbHash + first contents arrival also counts.
    /// - `.video` : KVO `avPlayer.currentItem.status` and fire on
    ///   `.readyToPlay`. If the player is already ready at observation time
    ///   we fire on the next runloop tick.
    ///
    /// The observers are torn down on every entry so they cannot stack across
    /// slides (slide swipe in the reader rebuilds layers on every keyframe).
    func scheduleContentReadyEvaluation(for kind: StoryBackgroundLayer.Kind) {
        contentReadyFired = false
        backgroundContentReady = false
        foregroundReadinessTimedOut = false
        teardownReadinessObservers()

        // Explicit `_` placeholders on the comma-combined cases — Swift 6.2
        // under iOS 26.5 SDK no longer accepts the bare `.solidColor, .gradient`
        // shorthand here (the Xcode Cloud build reports `error: switch must be
        // exhaustive` for this site, misattributed to StoryAVCompositor.swift
        // because of cross-file batch compilation). Pinning the arities makes
        // the pattern unambiguous: solidColor has 1 associated value, gradient
        // has 2 named (colors:, direction:).
        switch kind {
        case .solidColor(_), .gradient(_, _):
            // No async work — yield to the next runloop tick so the caller
            // can attach `onContentReady` after `rebuildLayers()` returns
            // (the prefetcher attaches the callback right after init).
            DispatchQueue.main.async { [weak self] in
                self?.backgroundDidBecomeReady()
            }
        case .image:
            // Fast-path warm hit : si le `StoryBackgroundLayer` a déjà stampé
            // une image FINALE (warm L1 cache hit synchrone), le KVO observer
            // ne firerait jamais — quand le NSCache renvoie la même instance
            // UIImage entre le warm-hit et le re-stamp async, `contents` ne
            // change pas d'identité de référence. On fire `backgroundDidBecomeReady()`
            // directement, sans installer l'observer. Régression introduite
            // par a60f636b5 (2026-05-20) — sans ce shortcut, le loader reste
            // à 0% indéfiniment sur les stories image dès que le cache est
            // warmed (prefetcher ou première vue).
            if backgroundLayer.hasFinalContentStamped {
                DispatchQueue.main.async { [weak self] in
                    self?.backgroundDidBecomeReady()
                }
                break
            }
            thumbHashPlaceholderRef = backgroundLayer.contentLayer?.contents.map { $0 as AnyObject }
            // If the real bytes already landed synchronously (warm L1 cache),
            // we still want to honor the contract: fire on the next runloop
            // tick when no observable transition is pending.
            if let layer = backgroundLayer.contentLayer {
                imageContentsObserver = layer.observe(\.contents, options: [.new]) { [weak self] _, change in
                    // Convert the new contents to a Sendable `ObjectIdentifier`
                    // inside the KVO callback. AnyObject is non-Sendable so we
                    // cannot ship it across the actor hop, but ObjectIdentifier
                    // (a UInt wrapper) is Sendable and gives us the reference-
                    // equality semantics we need to distinguish the ThumbHash
                    // placeholder from the real loaded CGImage.
                    let newAny: Any? = change.newValue.flatMap { $0 }
                    let snapshotID: ObjectIdentifier? = (newAny as AnyObject?).map { ObjectIdentifier($0) }
                    Task { @MainActor in
                        guard let self else { return }
                        guard let snapshotID else { return }
                        // Fire only once the new contents differ from the
                        // ThumbHash placeholder reference. A nil placeholder
                        // (no thumbHash on the slide) makes the first non-nil
                        // assignment the trigger.
                        let placeholderID = self.thumbHashPlaceholderRef.map { ObjectIdentifier($0) }
                        if let placeholderID, snapshotID == placeholderID { return }
                        self.backgroundDidBecomeReady()
                    }
                }
                // Failsafe timeout 2s — si le KVO `contents` n'a jamais fire
                // (image déjà stampée avant que l'observer ne soit attaché,
                // ou bug d'identité de référence sur le NSCache), on force
                // `backgroundDidBecomeReady` après 2s pour ne pas geler la
                // progress bar indéfiniment (bug user-reporté 2026-05-27
                // « progress bar ne progresse même plus du tout »).
                pendingVideoReadinessTask?.cancel()
                pendingVideoReadinessTask = Task { @MainActor [weak self] in
                    try? await Task.sleep(for: .seconds(2))
                    if Task.isCancelled { return }
                    guard let self else { return }
                    guard !self.contentReadyFired else { return }
                    self.backgroundDidBecomeReady()
                }
            } else {
                // Defensive — no contentLayer means the kind switch already
                // settled (e.g. solidColor path took precedence). Fire async
                // so the contract still observes a single trailing-edge tick.
                DispatchQueue.main.async { [weak self] in
                    self?.backgroundDidBecomeReady()
                }
            }
        case .video:
            storyMediaLog.debug("readiness eval kind=video hasPlayer=\(self.backgroundLayer.avPlayer != nil, privacy: .public) hasItem=\(self.backgroundLayer.avPlayer?.currentItem != nil, privacy: .public) mode=\(String(describing: self.mode), privacy: .public)")
            // Gate sur la PRÉSENCE DU PLAYER, pas de `currentItem` : un
            // `AVQueuePlayer` fraîchement attaché (fond loopé) a un
            // `currentItem` nil le temps que son `AVPlayerLooper` enqueue le
            // template — exiger l'item ici faisait rater l'armement et,
            // `displayLinkTick` étant gated sur `contentReadyFired`, plus
            // rien ne ré-évaluait jamais : slide gelée sur son thumbnail
            // (bug user 2026-06-11).
            if backgroundLayer.avPlayer != nil {
                armBackgroundVideoReadinessObservation(item: backgroundLayer.avPlayer?.currentItem)
            }
            // Path cache miss : `backgroundLayer.configure` a démarré une
            // `Task` async pour résoudre l'URL distante (download / cache
            // disk) et le player n'est pas encore créé. Aucun sondage ici :
            // `backgroundLayer.onPlayerAttached` (câblé dans l'init) ré-arme
            // l'observation dès que l'attach différé survient — quelle que
            // soit la durée du download. L'ancien sondage 30 × 50 ms
            // abandonnait silencieusement après 1,5 s : un download plus
            // lent laissait `contentReadyFired` à false pour toujours →
            // thumbnail figé, progression sans frames ni audio, son qui ne
            // démarrait qu'au retour foreground via le bypass
            // `handleDidBecomeActive` (bug user 2026-06-11).
        }
    }

    /// Arme l'observation de readiness du fond vidéo : première frame
    /// composée (`isReadyForDisplay`), repli KVO `.status` quand aucun
    /// `AVPlayerLayer` n'est exploitable, et failsafe 2 s (un KVO peut être
    /// attaché APRÈS la transition sur un item recyclé warm — bug
    /// user-reporté 2026-05-27 « progress bar reste à 0% »). Réutilisé par
    /// l'évaluation initiale (player déjà attaché) ET par l'attach différé
    /// (`onPlayerAttached`) — volontairement NON destructif : ne touche ni
    /// `contentReadyFired` ni `backgroundContentReady`, donc inoffensif si
    /// la readiness a déjà fire.
    func armBackgroundVideoReadinessObservation(item: AVPlayerItem?) {
        storyMediaLog.debug("arm video readiness layerReady=\(self.backgroundLayer.avPlayerLayer?.isReadyForDisplay ?? false, privacy: .public) itemStatus=\(item?.status.rawValue ?? -1, privacy: .public)")
        // La progress bar ne doit démarrer que sur la PREMIÈRE FRAME
        // réellement à l'écran. `AVPlayerLayer.isReadyForDisplay`
        // (false→true une fois la frame décodée ET composée) est le seul
        // signal fiable : `isFileURL` ne prouve que la présence disque,
        // le decoder spinup (~50-150 ms, parfois bien plus sur un
        // fichier local lent/partiel) n'est PAS couvert — c'est ce qui
        // faisait avancer la progression sur le flou ThumbHash (bug
        // user-reporté 2026-06-09). Le ThumbHash reste visible pendant
        // le gap (UX inchangée), seul le timer attend la vraie frame.
        if waitBackgroundVideoFirstFrame() == false, let item {
            // Aucun `AVPlayerLayer` exploitable (cas rare) — repli sur le
            // KVO `.status` (métadonnées prêtes), ancien comportement.
            // `item` peut être nil (AVQueuePlayer dont le looper n'a pas
            // encore enqueué) — le failsafe 2 s ci-dessous couvre ce cas.
            videoStatusObserver = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
                guard observed.status == .readyToPlay else { return }
                Task { @MainActor in
                    self?.backgroundDidBecomeReady()
                }
            }
        }
        pendingVideoReadinessTask?.cancel()
        pendingVideoReadinessTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(2))
            if Task.isCancelled { return }
            guard let self else { return }
            guard !self.contentReadyFired else { return }
            self.backgroundDidBecomeReady()
        }
    }

    /// Démarre la readiness du fond vidéo sur la PREMIÈRE FRAME réellement
    /// composée à l'écran (`AVPlayerLayer.isReadyForDisplay`), et NON sur la
    /// simple présence disque du fichier. Fire `backgroundDidBecomeReady()`
    /// quand la frame est prête (immédiatement si déjà composée — ré-attache
    /// warm). Retourne `false` si aucun `AVPlayerLayer` n'est disponible : le
    /// caller retombe alors sur un observer `AVPlayerItem.status`. Le token KVO
    /// est libéré par `teardownReadinessObservers()`.
    @discardableResult
    func waitBackgroundVideoFirstFrame() -> Bool {
        guard let playerLayer = backgroundLayer.avPlayerLayer else { return false }
        if playerLayer.isReadyForDisplay {
            DispatchQueue.main.async { [weak self] in
                self?.backgroundDidBecomeReady()
            }
            return true
        }
        // `.initial` re-lit la valeur courante à l'enregistrement : protège
        // contre une transition false→true survenue entre le pré-check ci-dessus
        // et l'attache du KVO. Le `guard` interne rend l'appel synchrone no-op
        // tant que la frame n'est pas prête.
        videoFirstFrameObserver = playerLayer.observe(\.isReadyForDisplay, options: [.new, .initial]) { [weak self] layer, _ in
            guard layer.isReadyForDisplay else { return }
            Task { @MainActor in
                self?.backgroundDidBecomeReady()
            }
        }
        return true
    }

    /// Marks the slide background as visually settled. The combined readiness
    /// signal (`onContentReady`) still waits on foreground video — see
    /// `fireContentReadyIfNeeded()`.
    func backgroundDidBecomeReady() {
        backgroundContentReady = true
        recomputeContentProgress()
        fireContentReadyIfNeeded()
    }

    func fireContentReadyIfNeeded() {
        guard !contentReadyFired else { return }
        // The background must be settled first — a foreground video KVO ping
        // can otherwise call in before the background image bytes land.
        guard backgroundContentReady else {
            storyMediaLog.debug("contentReady held: background not settled")
            return
        }
        // T6 — the background may be settled, but if a foreground video clip is
        // still preparing the slide could be a black rectangle. Hold the signal
        // (and the progress timer) until at least one foreground video is
        // `.readyToPlay`; the KVO tokens re-trigger this method when it lands.
        //
        // CRITICAL — this gate applies ONLY when the background is NOT itself
        // visual media. With a background video/image the canvas is already
        // FILLED (the background fills it via resizeAspectFill), so there is no
        // black rectangle to hide: a slow / stalled foreground clip must NEVER
        // hold back the looping background video. Gating it here meant a
        // foreground clip on a slow network froze the background video — it
        // never started, never looped, and the playhead stayed frozen ("le fond
        // vidéo doit jouer en boucle même avec des vidéos en foreground", user
        // 2026-06-23). The foreground video is a timeline component: it appears
        // once its bytes land, like every other foreground element. The
        // `foregroundReadinessTimedOut` failsafe covers the remaining
        // colour/gradient-background case so it can never hang forever either.
        if !backgroundLayer.kind.isVisualMedia {
            guard foregroundVideosReady() || foregroundReadinessTimedOut else {
                storyMediaLog.debug("contentReady held: foreground video(s) not ready")
                observePendingForegroundVideos()
                return
            }
        }
        storyMediaLog.debug("contentReady FIRED mode=\(String(describing: self.mode), privacy: .public) pendingActivation=\(self.pendingBackgroundActivation, privacy: .public)")
        contentReadyFired = true
        onContentReady?()
        // Consume pending background activation: vidéo bg ET audio bg
        // démarrent ensemble une fois tous les médias chargés. Réutilise les
        // entry points canoniques pour ne pas dupliquer la session/setup
        // logic.
        if pendingBackgroundActivation {
            pendingBackgroundActivation = false
            if mode == .play {
                // Cale les players sur le playhead courant AVANT de lever les
                // gates : au GO `currentTime` vaut ~0 (slide fraîche) mais peut
                // être > 0 sur une ouverture à position (cover dismiss). Garantit
                // que `alignToTimelineThenPlay()` voie la bonne cible.
                pushSlidePlayheadToLayers()
                backgroundLayer.isPlaybackActive = true
                // « GO » synchronisé : la vidéo de fond, les vidéos foreground
                // et le mixer audio démarrent ensemble une fois tous les médias
                // chargeables prêts. `foregroundVideosPlaybackActive` lève le
                // gate des `StoryMediaLayer` (démarre celles déjà attachées et
                // autorise celles qui attacheront plus tard). Gardé sur
                // `window != nil` comme `handleDidBecomeActive` : un canvas
                // `.play` retenu hors écran (préemption / cross-fade sortant) ne
                // doit pas relancer ses foreground players.
                if window != nil {
                    // F7 — DELIBERATE double-cover. Setting
                    // `foregroundVideosPlaybackActive = true` raises each layer's
                    // `isPlaybackActive`, whose didSet aligns+plays layers attached
                    // BEFORE GO. The `forEachMediaLayer { startAlignedIfActive() }`
                    // second pass then also starts layers that attach AFTER GO; for
                    // already-aligned layers it is a NO-OP (the didSet idempotency
                    // guard skips them, and `alignToTimelineThenPlay`'s `play()` is
                    // a no-op when already playing + the seek only fires past the
                    // drift seuil). Both passes route through the single drift-aware
                    // path, replacing the raw `forEachAVPlayer { play() }` that
                    // bypassed timeline alignment (open-at-t>0 could flash frame 0).
                    foregroundVideosPlaybackActive = true
                    forEachMediaLayer { $0.startAlignedIfActive() }
                }
                startAudioPlayback()
            }
        }
        // Force `onContentProgress(1.0)` au moment où le signal binaire fire
        // afin que les listeners SwiftUI puissent fermer leur overlay même
        // si la slide n'a aucun foreground media (cas slide texte+bg).
        recomputeContentProgress()
    }

    /// Recalcule la fraction `[0, 1]` de contenu disponible localement et
    /// notifie via `onContentProgress`. Aggregé sur :
    /// - 1 point : background ready
    /// - N points : chaque foreground media (image=contents non nil, vidéo=AVPlayerItem.status != .unknown)
    func recomputeContentProgress() {
        guard onContentProgress != nil else { return }
        let bg: Double = backgroundContentReady ? 1.0 : 0.0
        var fgReady: Double = 0
        var fgTotal: Double = 0
        for sub in itemsContainer.sublayers ?? [] {
            guard let media = sub as? StoryMediaLayer,
                  let model = media.media,
                  model.isBackground == false else { continue }
            fgTotal += 1
            switch model.kind {
            case .image:
                if media.contents != nil { fgReady += 1 }
            case .video:
                if let status = media.avPlayer?.currentItem?.status,
                   status != .unknown {
                    fgReady += 1
                }
            case .none:
                fgReady += 1  // unknown kind, ne bloque pas
            }
        }
        let total = 1.0 + fgTotal
        let ready = bg + fgReady
        let progress = total > 0 ? min(1.0, max(0.0, ready / total)) : 1.0
        onContentProgress?(progress)
    }

    /// `AVPlayerItem`s of every foreground video layer currently on the canvas.
    /// A foreground video whose URL never resolved has no `AVPlayer` and so
    /// never blocks the readiness signal.
    func foregroundVideoItems() -> [AVPlayerItem] {
        var items: [AVPlayerItem] = []
        for sub in itemsContainer.sublayers ?? [] {
            if let media = sub as? StoryMediaLayer,
               let item = media.avPlayer?.currentItem {
                items.append(item)
            }
        }
        return items
    }

    /// Foreground videos are "ready" when there are none, or every one has
    /// *resolved* — `.readyToPlay` OR `.failed`. A broken / stuck clip
    /// (status `.failed`) must not freeze the slide timer forever, so it
    /// counts as resolved rather than blocking indefinitely.
    func foregroundVideosReady() -> Bool {
        let items = foregroundVideoItems()
        guard !items.isEmpty else { return true }
        return items.allSatisfy { $0.status != .unknown }
    }

    func observePendingForegroundVideos() {
        foregroundVideoStatusObservers.forEach { $0.invalidate() }
        foregroundVideoStatusObservers = []
        for item in foregroundVideoItems() where item.status == .unknown {
            let token = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
                guard observed.status != .unknown else { return }
                Task { @MainActor in
                    self?.recomputeContentProgress()
                    self?.fireContentReadyIfNeeded()
                }
            }
            foregroundVideoStatusObservers.append(token)
        }
        // Arm the failsafe ONCE — a foreground clip stuck on `.unknown` (its
        // KVO never fires `.readyToPlay` nor `.failed`) would otherwise hold
        // `contentReadyFired` false forever. Mirrors the background's 2 s
        // `pendingVideoReadinessTask`. Guarded on `== nil` so the repeated
        // gate re-entries during loading don't restart the timer.
        guard foregroundVideoReadinessFailsafe == nil else { return }
        foregroundVideoReadinessFailsafe = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(2))
            if Task.isCancelled { return }
            guard let self, !self.contentReadyFired else { return }
            self.foregroundReadinessTimedOut = true
            self.fireContentReadyIfNeeded()
        }
    }

    func teardownReadinessObservers() {
        imageContentsObserver?.invalidate()
        imageContentsObserver = nil
        videoStatusObserver?.invalidate()
        videoStatusObserver = nil
        videoFirstFrameObserver?.invalidate()
        videoFirstFrameObserver = nil
        pendingVideoReadinessTask?.cancel()
        pendingVideoReadinessTask = nil
        thumbHashPlaceholderRef = nil
        foregroundVideoStatusObservers.forEach { $0.invalidate() }
        foregroundVideoStatusObservers = []
        foregroundVideoReadinessFailsafe?.cancel()
        foregroundVideoReadinessFailsafe = nil
    }

    /// Test-only seam : forces the readiness signal as if the background
    /// media had finished loading. Lets unit tests exercise the timer-gating
    /// contract on `StoryReaderTimerController` without staging a real
    /// `URLSession` fetch or `AVPlayer` status transition.
    public func _forceContentReadyForTesting() {
        // Bypasses the foreground-video gate — this seam exists precisely to
        // force the signal without staging a real `AVPlayer` status transition.
        guard !contentReadyFired else { return }
        contentReadyFired = true
        onContentReady?()
    }

    /// Test-only seam : drives the REAL `fireContentReadyIfNeeded()` path with
    /// the background marked settled, so the foreground-video gating decision
    /// (skipped when the background is itself visual media) can be asserted
    /// deterministically without staging a real `AVPlayer` first-frame
    /// transition. Returns whether `onContentReady` fired as a result.
    @discardableResult
    public func _markBackgroundReadyForTesting() -> Bool {
        backgroundContentReady = true
        fireContentReadyIfNeeded()
        return contentReadyFired
    }
}
