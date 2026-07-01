import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - StoryComposerViewModel + ZOrder

extension StoryComposerViewModel {
    /// Rebuild `zIndexMap` from the current slide's persisted `zIndex` fields. The map
    /// is the in-memory cache for `bringToFront` ordering during composer edits;
    /// hydrating from the model means an element promoted on slide 0 retains its
    /// front-position when the user comes back from slide 1. `nextZIndex` advances
    /// past the highest persisted value so newly-promoted elements still rise above.
    func rehydrateZIndexMapFromSlide() {
        var map: [String: Int] = [:]
        var maxZ = 0
        let effects = currentEffects
        for obj in effects.textObjects {
            map[obj.id] = obj.zIndex; maxZ = max(maxZ, obj.zIndex)
        }
        for obj in (effects.mediaObjects ?? []) {
            map[obj.id] = obj.zIndex; maxZ = max(maxZ, obj.zIndex)
        }
        for obj in (effects.audioPlayerObjects ?? []) {
            if let z = obj.zIndex { map[obj.id] = z; maxZ = max(maxZ, z) }
        }
        for obj in (effects.stickerObjects ?? []) {
            map[obj.id] = obj.zIndex; maxZ = max(maxZ, obj.zIndex)
        }
        zIndexMap = map
        nextZIndex = maxZ + 1
    }

    func moveMedia(from source: IndexSet, to destination: Int) {
        var effects = currentEffects
        guard var medias = effects.mediaObjects else { return }
        medias.move(fromOffsets: source, toOffset: destination)
        effects.mediaObjects = medias
        currentEffects = effects
    }

    func zIndex(for id: String) -> Int {
        if let mapped = zIndexMap[id] { return mapped }
        // Fall back to the model-stored zIndex for elements that haven't
        // been re-stamped via the in-memory map yet (e.g. media added
        // directly to `currentEffects` from outside the composer, or
        // elements loaded from a persisted slide). Mirrors the lookup
        // used inside `allElementsSortedByZ` so the public accessor and
        // the sort agree on the same value.
        let effects = currentEffects
        if let t = effects.textObjects.first(where: { $0.id == id }) { return t.zIndex }
        if let m = effects.mediaObjects?.first(where: { $0.id == id }) { return m.zIndex }
        if let a = effects.audioPlayerObjects?.first(where: { $0.id == id }) { return a.zIndex ?? 0 }
        if let s = effects.stickerObjects?.first(where: { $0.id == id }) { return s.zIndex }
        return 0
    }

    /// Promote an element to the front. Persists the value into the slide's effects so
    /// the order survives slide-switches AND publish (the reader applies the same
    /// `zIndex` modifier for WYSIWYG playback). Previously the map was in-memory only,
    /// so re-entering slide N showed elements in array-order with no memory of past
    /// `bringToFront` actions.
    func bringToFront(id: String) {
        let z = nextZIndex
        zIndexMap[id] = z
        nextZIndex += 1
        persistZIndex(z, for: id)
    }

    func sendToBack(id: String) {
        zIndexMap[id] = 0
        persistZIndex(0, for: id)
    }

    func bringForward(id: String) {
        let all = allElementsSortedByZ()
        guard let index = all.firstIndex(where: { $0.id == id }) else { return }
        guard index < all.count - 1 else { return }

        let next = all[index + 1]
        let currentZ = zIndexMap[id] ?? zIndex(for: id)
        let nextZ = zIndexMap[next.id] ?? zIndex(for: next.id)
        
        let newCurrentZ = currentZ == nextZ ? nextZ + 1 : nextZ
        let newNextZ = currentZ == nextZ ? currentZ : currentZ
        
        persistZIndex(newCurrentZ, for: id)
        persistZIndex(newNextZ, for: next.id)
        zIndexMap[id] = newCurrentZ
        zIndexMap[next.id] = newNextZ
    }

    func sendBackward(id: String) {
        let all = allElementsSortedByZ()
        guard let index = all.firstIndex(where: { $0.id == id }) else { return }
        let currentZ = zIndex(for: id)

        // Pick the neighbor that needs to end up above us. When `index > 0`
        // that's the predecessor in sort order. When we're already at
        // sort-index 0 BUT tied at the same z with the next element, that
        // next element is the de-facto predecessor — without this branch,
        // a cross-kind tie (e.g. text bumped to the same z as a foreground
        // media) silently no-ops and the ordering never settles.
        let neighbor: AnyCanvasElement?
        if index > 0 {
            neighbor = all[index - 1]
        } else if all.count > 1, zIndex(for: all[1].id) == currentZ {
            neighbor = all[1]
        } else {
            neighbor = nil
        }
        guard let prev = neighbor else { return }

        let prevZ = zIndex(for: prev.id)
        if currentZ > prevZ {
            // Strict above: swap z values (the standard send-backward step).
            persistZIndex(prevZ, for: id)
            persistZIndex(currentZ, for: prev.id)
            zIndexMap[id] = prevZ
            zIndexMap[prev.id] = currentZ
        } else {
            // Tie: leave us where we are and bump the neighbor strictly above.
            persistZIndex(currentZ + 1, for: prev.id)
            zIndexMap[prev.id] = currentZ + 1
        }
    }

    func allElementsSortedByZ() -> [AnyCanvasElement] {
        var elements: [AnyCanvasElement] = []
        let effects = currentEffects
        for t in effects.textObjects {
            elements.append(AnyCanvasElement(id: t.id, elementType: .text, zIndex: zIndexMap[t.id] ?? t.zIndex))
        }
        for m in effects.mediaObjects ?? [] {
            elements.append(AnyCanvasElement(id: m.id, elementType: m.kind == .video ? .video : .image, zIndex: zIndexMap[m.id] ?? m.zIndex))
        }
        for a in effects.audioPlayerObjects ?? [] {
            elements.append(AnyCanvasElement(id: a.id, elementType: .audio, zIndex: zIndexMap[a.id] ?? a.zIndex ?? 0))
        }
        for s in effects.stickerObjects ?? [] {
            elements.append(AnyCanvasElement(id: s.id, elementType: .image, zIndex: zIndexMap[s.id] ?? s.zIndex))
        }
        return elements.sorted { $0.zIndex < $1.zIndex }
    }

    func persistZIndex(_ z: Int, for id: String) {
        var effects = currentEffects
        if let i = effects.textObjects.firstIndex(where: { $0.id == id }) {
            effects.textObjects[i].zIndex = z
        } else if var medias = effects.mediaObjects, let i = medias.firstIndex(where: { $0.id == id }) {
            medias[i].zIndex = z; effects.mediaObjects = medias
        } else if var audios = effects.audioPlayerObjects, let i = audios.firstIndex(where: { $0.id == id }) {
            audios[i].zIndex = z; effects.audioPlayerObjects = audios
        } else if var stickers = effects.stickerObjects, let i = stickers.firstIndex(where: { $0.id == id }) {
            stickers[i].zIndex = z; effects.stickerObjects = stickers
        } else {
            return  // Sticker handled by view-level state — caller patches via onUpdate
        }
        currentEffects = effects
    }
}
