import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - StoryComposerViewModel + Slides

extension StoryComposerViewModel {
    var currentSlide: StorySlide {
        get {
            // The composer holds the invariant `slides` is never empty
            // (init seeds [StorySlide()], removeSlide refuses to drop the
            // last one). If a future regression breaks that invariant we
            // must NOT crash with "Index out of range" — fall through to a
            // freshly-built empty slide instead so the composer keeps
            // rendering and the bug surfaces visibly rather than as a
            // hard crash on background queues.
            if let s = slides[safe: currentSlideIndex] { return s }
            if let first = slides.first { return first }
            return StorySlide()
        }
        set {
            guard slides.indices.contains(currentSlideIndex) else { return }
            slides[currentSlideIndex] = newValue
        }
    }

    var canAddSlide: Bool { slides.count < 10 }

    var currentSlideDuration: Float {
        // Source de vérité = `effects.timelineDuration` (autoritaire, lu par
        // `computedTotalDuration`). Régler explicitement la durée du slide via ce
        // contrôle POSE donc un pin timeline — sinon le réglage serait ignoré au
        // playback (la centralisation 28/05 ignore `slide.duration`). Le getter
        // retombe sur la durée auto du contenu tant qu'aucun pin n'est posé.
        get { Float(currentSlide.effects.timelineDuration ?? currentSlide.computedTotalDuration()) }
        set {
            let clamped = max(2, min(600, newValue))
            var slide = currentSlide
            slide.duration = TimeInterval(clamped)            // miroir legacy
            slide.effects.timelineDuration = Double(clamped)  // autoritaire
            currentSlide = slide
        }
    }

    func autoExtendDuration(forElementEnd end: Float, slideId: String? = nil) {
        // Target the slide that owns the element, NOT the currently-visible one.
        // Without this, a video added to slide 0 while the user is on slide 1
        // (PhotosPicker async race) would extend slide 1's duration.
        let targetIndex: Int = {
            if let id = slideId, let idx = slides.firstIndex(where: { $0.id == id }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        // Miroir legacy : `slide.duration` n'est plus la source de vérité (ignoré par
        // `computedTotalDuration`). Le contenu foreground est désormais couvert par
        // `contentDerivedDuration()` (qui inclut les vidéos non-bg), et le timeline pose
        // un pin `timelineDuration` quand l'auteur surcharge explicitement la durée — donc
        // on n'écrit PAS de pin ici (éviterait un pin obsolète après suppression du média).
        let current = Float(slides[targetIndex].duration)
        if end > current {
            slides[targetIndex].duration = TimeInterval(min(600, end + 0.5))
        }
    }

    func addSlide() {
        guard canAddSlide else { return }
        let slide = StorySlide(order: slides.count)
        slides.append(slide)
        currentSlideIndex = slides.count - 1
    }

    func removeSlide(at index: Int) {
        guard slides.count > 1, slides.indices.contains(index) else { return }
        let slide = slides[index]
        let slideId = slide.id
        let mediaIds = (slide.effects.mediaObjects ?? []).map(\.id)
        let audioIds = (slide.effects.audioPlayerObjects ?? []).map(\.id)
        slides.remove(at: index)
        slideImages.removeValue(forKey: slideId)
        backgroundTransformCache.removeValue(forKey: slideId)
        for id in mediaIds {
            loadedImages.removeValue(forKey: id)
            loadedVideoURLs.removeValue(forKey: id)
            mediaAspectRatios.removeValue(forKey: id)
            zIndexMap.removeValue(forKey: id)
        }
        for id in audioIds {
            loadedAudioURLs.removeValue(forKey: id)
            zIndexMap.removeValue(forKey: id)
        }
        // Supprimer un slide AVANT le slide courant décale tout le contenu d'un
        // cran vers la gauche : il faut décrémenter `currentSlideIndex` pour
        // rester sur le MÊME slide que l'on éditait. Sans ça (l'ancien code ne
        // faisait que clamper `>= count`), supprimer un slide antérieur via le
        // menu contextuel d'une vignette faisait sauter l'édition au slide
        // suivant (bug 2026-06-01). Le clamp couvre ensuite le cas « on a
        // supprimé le dernier slide qui était le courant ».
        if index < currentSlideIndex {
            currentSlideIndex -= 1
        }
        if currentSlideIndex >= slides.count {
            currentSlideIndex = slides.count - 1
        }
        reorderSlides()
    }

    /// Duplicate slide at `index`. The visual identity of the duplicated slide
    /// MUST match the original at duplication time — same background image,
    /// same media bitmaps, same video/audio URLs, same drawing, same filter.
    ///
    /// `StorySlide` itself is a value type, so the struct-level state (effects,
    /// duration, content) clones via `var copy = slides[index]`. But the
    /// composer holds side caches keyed by element/slide id (`loadedImages`,
    /// `loadedVideoURLs`, `loadedAudioURLs`, `mediaAspectRatios`, `slideImages`,
    /// `backgroundTransformCache`); these MUST be re-keyed under the freshly-
    /// generated ids so the new slide renders with its own bitmaps instead of
    /// landing on empty placeholders. Without this, the original slide's media
    /// stayed visible while the duplicate showed placeholders — and any later
    /// deletion of the original would orphan the bitmaps the duplicate was
    /// silently still pointing at via the shared old key.
    ///
    /// Mirrors the per-element id reassignment performed by `duplicateElement`.
    func duplicateSlide(at index: Int) {
        guard canAddSlide, slides.indices.contains(index) else { return }
        let originalSlideId = slides[index].id
        var copy = slides[index]
        let newSlideId = UUID().uuidString
        copy.id = newSlideId
        copy.order = slides.count

        // Re-key per-element side caches by generating a new id for every child
        // object and copying its bitmap / URL / aspect-ratio entry under the new
        // key. The mutations happen on `copy.effects` (a value type) before the
        // copy is inserted into `slides`, so the original slide is untouched.
        var effects = copy.effects

        // Text objects: ids are referenced by zIndex bookkeeping but carry no
        // side-cache. New id keeps future selection / persistZIndex from
        // clobbering the original text object's z value.
        effects.textObjects = effects.textObjects.map { text in
            var clone = text
            clone.id = UUID().uuidString
            return clone
        }

        // Media objects (image / video on canvas): the id keys
        // `loadedImages` (UIImage), `loadedVideoURLs` (URL) and
        // `mediaAspectRatios` (CGFloat). Walk the array, mint a new id for each
        // entry, and copy the side-cache rows over to the new key.
        if let medias = effects.mediaObjects {
            effects.mediaObjects = medias.map { media in
                var clone = media
                let newId = UUID().uuidString
                clone.id = newId
                if let img = loadedImages[media.id] { loadedImages[newId] = img }
                if let url = loadedVideoURLs[media.id] { loadedVideoURLs[newId] = url }
                if let ratio = mediaAspectRatios[media.id] { mediaAspectRatios[newId] = ratio }
                return clone
            }
        }

        // Audio player objects: the id keys `loadedAudioURLs`.
        if let audios = effects.audioPlayerObjects {
            effects.audioPlayerObjects = audios.map { audio in
                var clone = audio
                let newId = UUID().uuidString
                clone.id = newId
                if let url = loadedAudioURLs[audio.id] { loadedAudioURLs[newId] = url }
                return clone
            }
        }

        // Stickers: no side cache, but their ids are still referenced by the
        // composer's z-order bookkeeping (`zIndexMap`, `persistZIndex`). New
        // id avoids accidental id collisions on subsequent edits.
        if let stickers = effects.stickerObjects {
            effects.stickerObjects = stickers.map { sticker in
                var clone = sticker
                clone.id = UUID().uuidString
                return clone
            }
        }

        copy.effects = effects

        // Slide-level side caches keyed by slideId.
        if let bgImage = slideImages[originalSlideId] {
            slideImages[newSlideId] = bgImage
        }
        if let transform = backgroundTransformCache[originalSlideId] {
            backgroundTransformCache[newSlideId] = transform
        }

        slides.insert(copy, at: index + 1)
        currentSlideIndex = index + 1
        reorderSlides()
    }

    func selectSlide(at index: Int) {
        guard slides.indices.contains(index) else { return }
        saveBackgroundTransform()
        selectedElementId = nil
        activeTool = nil
        currentSlideIndex = index
        rehydrateZIndexMapFromSlide()
        restoreBackgroundTransform()
    }

    /// Reorder slides. `destination` follows the SwiftUI `.onMove` / `.dropDestination`
    /// convention (offset in the PRE-move array, so it may equal `slides.count` for
    /// move-to-end) — identical to `moveMedia`, so the slide-strip drag wiring is
    /// mutualized with the media-list reorder. `currentSlideIndex` tracks the slide the
    /// user was EDITING by id (not the dropped slot), mirroring `removeSlide`'s
    /// preserve-the-edited-slide philosophy. Side caches are keyed by slide/element id,
    /// so a move needs no cache surgery — only `order` is reindexed. (it.37: was a
    /// remove+insert with a `destination < count` guard that rejected move-to-end and
    /// produced an off-by-one vs the drop offset; that path was also entirely unwired.)
    func moveSlide(from source: Int, to destination: Int) {
        guard slides.indices.contains(source),
              destination >= 0, destination <= slides.count,
              source != destination, source != destination - 1 else { return }
        let editedSlideId = slides[safe: currentSlideIndex]?.id
        slides.move(fromOffsets: IndexSet(integer: source), toOffset: destination)
        reorderSlides()
        if let editedSlideId, let newIndex = slides.firstIndex(where: { $0.id == editedSlideId }) {
            currentSlideIndex = newIndex
        }
    }

    func reorderSlides() {
        for i in slides.indices {
            slides[i].order = i
        }
    }

    func setImage(_ image: UIImage?, for slideId: String) {
        if let image {
            slideImages[slideId] = image
        } else {
            slideImages.removeValue(forKey: slideId)
        }
    }

    func imageForCurrentSlide() -> UIImage? {
        slideImages[currentSlide.id]
    }
}
