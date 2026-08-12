import SwiftUI
import Combine
import UIKit
import os
import MeeshySDK
import PencilKit

// MARK: - StoryComposerViewModel + Timeline

extension StoryComposerViewModel {
    public var timelineViewModel: TimelineViewModel {
        if let existing = _timelineViewModel { return existing }
        let engine = StoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        // Preview vivante : le canvas derrière la sheet suit le playhead
        // (scrub + ticks engine) et l'état du transport. Gaté sur
        // `isTimelineVisible` — un tick tardif après fermeture ne doit pas
        // ré-armer la preview sur un canvas rendu à l'édition.
        vm.onPlayheadChanged = { [weak self] time in
            guard let self, self.isTimelineVisible else { return }
            self.canvasTimelineBridge.scrub(seconds: Double(time))
        }
        vm.onPlaybackStateChanged = { [weak self] playing in
            guard let self, self.isTimelineVisible else { return }
            self.canvasTimelineBridge.setPlaying(playing)
        }
        vm.onPlaybackEnded = { [weak self] in
            guard let self, self.isTimelineVisible else { return }
            // Fin de lecture : le canvas quitte la preview et REVIENT à
            // l'état statique du design — tous les éléments posés, positions
            // et opacités de base (retour user 2026-07-20). Le playhead a
            // déjà été remis à 0 par le VM avant cette notification.
            self.canvasTimelineBridge.end()
        }
        _timelineViewModel = vm
        return vm
    }

    /// Teardown du moteur timeline SI créé — sans forcer la création lazy.
    /// Seul caller production de `StoryTimelineEngine.shutdown()` (contrat
    /// "owner MUST call shutdown()") : sans lui, l'observer périodique
    /// AVPlayer n'était jamais retiré avant libération, l'AVAudioEngine du
    /// mixer jamais stoppé et un preview en cours jamais coupé. L'instance
    /// est nil-ée : le prochain `onAppear` → `loadCurrentSlideIntoTimeline()`
    /// recrée un moteur frais.
    public func shutdownTimelineIfNeeded() {
        stashTimelineHistoryIfLoaded()
        _timelineViewModel?.shutdown()
        _timelineViewModel = nil
    }

    /// E4 — capture l'historique undo/redo du moteur vivant sous l'id de la
    /// slide qui y est chargée. Appelé avant tout teardown ET avant tout
    /// re-bootstrap (changement de slide) — sans forcer la création lazy.
    func stashTimelineHistoryIfLoaded() {
        guard let vm = _timelineViewModel, let loadedId = timelineLoadedSlideId else { return }
        timelineHistoryBySlide[loadedId] = vm.commandHistorySnapshot()
    }

    /// E4 inc.2 — payload persistable de l'historique complet : le dict
    /// stashé + (via `stashTimelineHistoryIfLoaded`, copie non destructive)
    /// le stack LIVE de la timeline ouverte. Toujours non-nil dès qu'un
    /// historique existe ; `{}` si vide — écrit à chaque autosave pour que
    /// le blob reflète toujours le dernier état (jamais un historique
    /// périmé au restore). `.sortedKeys` : ordre de sérialisation stable.
    public func commandHistoryBlobForPersistence() -> Data? {
        stashTimelineHistoryIfLoaded()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        do {
            return try encoder.encode(timelineHistoryBySlide)
        } catch {
            Logger.cache.error("[StoryComposerVM] Erreur encode command history: \(error.localizedDescription)")
            return nil
        }
    }

    /// E4 inc.2 — repeuple le dict au restore du draft, AVANT tout bootstrap
    /// timeline (`loadCurrentSlideIntoTimeline` lit le snapshot de sa slide
    /// via `restoreCommandHistoryWithoutReplay` — le projet restauré est déjà
    /// l'état committé au cursor, aucun replay). Un blob corrompu ne touche
    /// à rien (l'historique en mémoire prime).
    public func applyPersistedCommandHistory(_ data: Data?) {
        guard let data else { return }
        do {
            timelineHistoryBySlide = try JSONDecoder()
                .decode([String: CommandStackSnapshot].self, from: data)
        } catch {
            Logger.cache.error("[StoryComposerVM] Blob command history illisible (ignoré): \(error.localizedDescription)")
        }
    }

    /// Prefix used for clips that the timeline editor surfaces for context but
    /// that are NOT real `slide.effects.mediaObjects`. The flagship example is
    /// the "background image" lane: a slide that only has a static bg image
    /// has nothing in `mediaObjects`, but the user still expects to see that
    /// image represented on the timeline as a locked, full-duration clip.
    /// Synthetic clips are stripped before persisting back to the slide via
    /// `commitTimelineToCurrentSlide()`.
    public nonisolated static let syntheticTimelineClipIdPrefix = "_synthetic_bg_image_"

    public nonisolated static func isSyntheticTimelineClipId(_ id: String) -> Bool {
        id.hasPrefix(syntheticTimelineClipIdPrefix)
    }

    /// Builds the synthetic background-image clip for a slide that has a static
    /// `slideImages[id]` image but no real background media object. Returns
    /// `nil` when the slide either has no bg image, or already has a real
    /// background media object (in which case the real one wins).
    ///
    /// `bgImageSize` est la taille naturelle de l'image bg (typiquement via
    /// `slideImages[slide.id]?.size`) — utilisée pour calculer l'aspectRatio
    /// réel au lieu de forcer 1.0 (qui rendait l'image en carré 540×540).
    public static func makeSyntheticBgImageClip(for slide: StorySlide,
                                                hasBgImage: Bool,
                                                existingMediaObjects: [StoryMediaObject],
                                                bgImageSize: CGSize? = nil) -> StoryMediaObject? {
        guard hasBgImage else { return nil }
        guard !existingMediaObjects.contains(where: { $0.isBackground == true }) else { return nil }
        let aspect: Double = {
            guard let size = bgImageSize, size.width > 0, size.height > 0 else { return 1.0 }
            return Double(size.width / size.height)
        }()
        return StoryMediaObject(
            id: "\(syntheticTimelineClipIdPrefix)\(slide.id)",
            postMediaId: "_bg_image_\(slide.id)",
            mediaType: StoryMediaKind.image.rawValue,
            placement: "media",
            aspectRatio: aspect,
            x: 0.5, y: 0.5,
            scale: 1.0,
            rotation: 0,
            volume: 0,
            isBackground: true,
            startTime: 0,
            duration: Double(slide.effects.slideDuration ?? Float(slide.duration))
        )
    }

    /// Bridges the composer's `currentSlide` into the timeline editor. Call
    /// this from `onAppear`, whenever the user switches slides, AND whenever
    /// the timeline sheet becomes visible (so any media added between mount
    /// and sheet-open is immediately visible).
    public func loadCurrentSlideIntoTimeline() {
        let slide = currentSlide
        var project = TimelineProject(from: slide)

        // The opening/closing transition-effect chips write ONLY to this VM's
        // own `openingEffect`/`closingEffect` (same source the live canvas
        // preview reads) — NOT synchronously through to `slide.effects.opening`/
        // `.closing` (that only happens via the decoupled granularCanvasSync).
        // `TimelineProject(from: slide)` above therefore just read the stale/
        // unsynced slide side of that split. Override with the live VM values
        // so the chrome lane reflects what the user actually just picked.
        project.openingEffect = openingEffect
        project.closingEffect = closingEffect

        // Surface a static background image (stored separately in slideImages)
        // as a locked synthetic clip on the timeline so the user can see what
        // is playing under their composition. Stripped on commit so the actual
        // slide effects stay clean.
        if let synthetic = Self.makeSyntheticBgImageClip(
            for: slide,
            hasBgImage: slideImages[slide.id] != nil,
            existingMediaObjects: project.mediaObjects,
            bgImageSize: slideImages[slide.id]?.size
        ) {
            var medias = project.mediaObjects
            medias.insert(synthetic, at: 0)
            project.mediaObjects = medias
        }

        let mediaURLs = collectMediaURLs(for: slide)
        // Bootstrap dict is keyed by media.id (the foreground clip identifier).
        // `slideImages` is keyed by slideId, so we re-key the slide-level
        // background bitmap under the synthetic clip id so the timeline track
        // can render its thumbnail. User-added foreground media bitmaps live in
        // `loadedImages` which is already keyed correctly.
        var clipImages = loadedImages
        if let bgImage = slideImages[slide.id],
           let synthetic = project.mediaObjects.first(where: { Self.isSyntheticTimelineClipId($0.id) }) {
            clipImages[synthetic.id] = bgImage
        }
        // E4 — stash de l'historique de la slide PRÉCÉDEMMENT chargée avant
        // que bootstrap n'écrase le projet (le stack, lui, n'est pas reset par
        // bootstrap — sans stash+restore il fuyait d'une slide à l'autre).
        stashTimelineHistoryIfLoaded()
        timelineViewModel.bootstrap(
            project: project,
            mediaURLs: mediaURLs,
            images: clipImages
        )
        timelineLoadedSlideId = slide.id
        // Restore de l'historique PROPRE à cette slide (snapshot vide sinon —
        // corrige la contamination cross-slide préexistante). Sans replay :
        // le projet bootstrappé est DÉJÀ l'état committé au cursor.
        timelineViewModel.restoreCommandHistoryWithoutReplay(
            timelineHistoryBySlide[slide.id] ?? CommandStackSnapshot(commands: [], cursor: 0)
        )
        // Clear any selection that no longer exists in the new slide.
        if let id = timelineViewModel.selection.selectedClipId,
           !projectContains(clipId: id, in: project) {
            timelineViewModel.selectClip(id: nil)
        }
    }

    /// Writes the current `TimelineViewModel.project` back into `currentSlide.effects`
    /// so the publish pipeline ships V2 edits (transitions, keyframes, splits, trims).
    /// Call BEFORE invoking the publish queue.
    public func commitTimelineToCurrentSlide() {
        var project = timelineViewModel.project
        // Synthetic clips never persist — they only exist to make the editor
        // legible. Strip them before the project lands back on the slide.
        project.mediaObjects.removeAll { Self.isSyntheticTimelineClipId($0.id) }
        var slide = currentSlide
        project.apply(to: &slide)
        currentSlide = slide
    }

    /// Builds the `mediaURLs` dict passed to the timeline engine for a given slide.
    ///
    /// Resolution order per element:
    /// 1. `loadedVideoURLs` / `loadedAudioURLs` — URLs the composer recorded when the
    ///    user picked a file from the library during this session (always highest fidelity).
    /// 2. `CacheCoordinator.videoLocalFileURL` / `audioLocalFileURL` — synchronous disk-
    ///    cache lookup by the element's `postMediaId`. Used when the composer is
    ///    initialised from a repost or when the user re-enters the composer after the
    ///    media was previously downloaded.
    ///
    /// Elements whose URL cannot be resolved are omitted — the engine handles missing
    /// URLs gracefully (logs "skipping … no URL") without crashing.
    func collectMediaURLs(for slide: StorySlide) -> [String: URL] {
        var result: [String: URL] = [:]

        for media in slide.effects.mediaObjects ?? [] {
            if let url = resolveMediaURL(elementId: media.id, postMediaId: media.postMediaId, kind: .video) {
                result[media.id] = url
            }
        }
        for audio in slide.effects.audioPlayerObjects ?? [] {
            if let url = resolveMediaURL(elementId: audio.id, postMediaId: audio.postMediaId, kind: .audio) {
                result[audio.id] = url
            }
        }

        return result
    }

    func resolveMediaURL(elementId: String, postMediaId: String, kind: MediaKind) -> URL? {
        // Composer-session in-memory cache (highest priority).
        switch kind {
        case .video:
            if let url = loadedVideoURLs[elementId] { return url }
        case .audio:
            if let url = loadedAudioURLs[elementId] { return url }
        }
        // Disk cache — synchronous, nonisolated lookup by postMediaId.
        // `postMediaId` is the remote identifier used as the cache key when the
        // gateway delivers the media URL.  Falls back to nil when not yet cached.
        guard !postMediaId.isEmpty else { return nil }
        switch kind {
        case .video: return CacheCoordinator.videoLocalFileURL(for: postMediaId)
        case .audio: return CacheCoordinator.audioLocalFileURL(for: postMediaId)
        }
    }

    func projectContains(clipId: String, in project: TimelineProject) -> Bool {
        project.mediaObjects.contains(where: { $0.id == clipId })
        || project.audioPlayerObjects.contains(where: { $0.id == clipId })
        || project.textObjects.contains(where: { $0.id == clipId })
    }

    /// Returns true if the timeline has been customized away from defaults.
    public var timelineHasCustomizations: Bool {
        let p = timelineViewModel.project
        let hasKeyframes = p.mediaObjects.contains(where: { !($0.keyframes?.isEmpty ?? true) }) ||
                           p.textObjects.contains(where: { !($0.keyframes?.isEmpty ?? true) })
        let hasTransitions = !p.clipTransitions.isEmpty
        // `TimelineViewModel.init` seeds `slideDuration = 0` until
        // `bootstrap(project:)` runs, so a fresh composer would otherwise
        // report `hasNonDefaultDuration == true` (|0 - 6| > 0.01) before
        // any actual user customization. Treat the un-bootstrapped 0 as
        // the default value, not as a customization.
        let hasNonDefaultDuration = p.slideDuration > 0 && abs(p.slideDuration - 6.0) > 0.01
        return hasKeyframes || hasTransitions || hasNonDefaultDuration
    }
}
