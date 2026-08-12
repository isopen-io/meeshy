import Foundation
import MeeshySDK

// MARK: - StoryComposerViewModel + History (C9 — undo/redo global, capture)

extension StoryComposerViewModel {

    /// Capture une étape d'annulation depuis l'état courant de `slides`.
    /// Appelée par le `historyTrigger` débouncé (View) — la dédup du store
    /// fait qu'un cycle sans changement réel des slides est un no-op.
    /// HORS périmètre pendant le dessin actif (UX undo dédiée — un snapshot
    /// unique à la sortie capture le résultat, cf. plan C9).
    func pushHistorySnapshot() {
        guard !drawingEditingMode.isActive else { return }
        guard let data = Self.encodeHistorySnapshot(slides) else { return }
        // L'évincé (cap) sera consommé par la purge différée des bitmaps
        // orphelins à l'Inc.3 — pour l'instant on le laisse tomber.
        _ = history.push(data)
        refreshHistoryFlags()
    }

    /// (Re)démarre la trajectoire : à l'entrée du composer ET après la
    /// restauration d'un brouillon (l'undo ne traverse pas la frontière de
    /// reprise — revenir « avant » un brouillon restauré n'a pas de sens).
    /// Le staging de purge paresseuse repart aussi de zéro (plus aucun
    /// snapshot ne peut référencer ces ressources).
    func seedHistory() {
        history = HistoryStore<Data>(cap: 50)
        retiredImages = [:]
        retiredVideoURLs = [:]
        retiredAudioURLs = [:]
        retiredSlideImages = [:]
        pushHistorySnapshot()
    }

    /// Applique un cran d'annulation. `true` si un état a été appliqué —
    /// l'appelant (View) fait alors suivre les side-effects de présentation
    /// (restoreCanvas, rechargement timeline).
    @discardableResult
    func undoGlobal() -> Bool {
        guard let data = history.undo() else { refreshHistoryFlags(); return false }
        return applyHistorySnapshot(data)
    }

    @discardableResult
    func redoGlobal() -> Bool {
        guard let data = history.redo() else { refreshHistoryFlags(); return false }
        return applyHistorySnapshot(data)
    }

    private func applyHistorySnapshot(_ data: Data) -> Bool {
        guard let decoded = try? JSONDecoder().decode([StorySlide].self, from: data),
              !decoded.isEmpty else {
            refreshHistoryFlags()
            return false
        }
        slides = decoded
        if currentSlideIndex >= slides.count { currentSlideIndex = slides.count - 1 }
        // Sélection/format panel réinitialisés — simple et sûr (plan §Risques) ;
        // le View reset le band via ses hooks existants au changement d'état.
        selectedElementId = nil
        restoreRetiredResources(for: decoded)
        // Le z-order VM se réhydrate depuis les champs persistés des objets
        // restaurés (mécanisme existant du changement de slide).
        rehydrateZIndexMapFromSlide()
        refreshHistoryFlags()
        // NOTE dédup : l'état appliqué DEVIENT entries[index] — le prochain
        // cycle du historyTrigger encode le même JSON et la dédup l'absorbe.
        return true
    }

    /// Re-merge les ressources mises de côté (purge paresseuse) pour chaque
    /// référence que l'état restauré fait revivre.
    private func restoreRetiredResources(for slides: [StorySlide]) {
        for slide in slides {
            if let bg = retiredSlideImages.removeValue(forKey: slide.id) {
                slideImages[slide.id] = bg
            }
            for media in slide.effects.mediaObjects ?? [] {
                if let img = retiredImages.removeValue(forKey: media.id) {
                    // Passe par `registerLoadedImage` pour bumper `loadedImagesVersion` :
                    // un undo/redo qui ressuscite un média doit rafraîchir le canvas
                    // reader, sinon le média restauré reste noir (même cause 2026-07-20).
                    registerLoadedImage(img, for: media.id)
                }
                if let url = retiredVideoURLs.removeValue(forKey: media.id) {
                    loadedVideoURLs[media.id] = url
                }
            }
            for audio in slide.effects.audioPlayerObjects ?? [] {
                if let url = retiredAudioURLs.removeValue(forKey: audio.id) {
                    loadedAudioURLs[audio.id] = url
                }
            }
        }
    }

    private func refreshHistoryFlags() {
        if canUndoGlobal != history.canUndo { canUndoGlobal = history.canUndo }
        if canRedoGlobal != history.canRedo { canRedoGlobal = history.canRedo }
    }

    /// Encodage déterministe (`.sortedKeys` — l'ordre des clés JSONEncoder
    /// est instable sur iOS 26, la dédup du store exige des octets stables).
    static func encodeHistorySnapshot(_ slides: [StorySlide]) -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try? encoder.encode(slides)
    }
}
