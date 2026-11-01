import Foundation
import Combine
import MeeshySDK

// MARK: - StoryComposerViewModel + History (C9 — undo/redo global, capture)

extension StoryComposerViewModel {

    /// Capture une étape d'annulation depuis l'état courant de `slides`.
    /// Appelée par le `historyTrigger` débouncé (View) — la dédup du store
    /// fait qu'un cycle sans changement réel des slides est un no-op.
    /// HORS périmètre pendant le dessin actif (UX undo dédiée — un snapshot
    /// unique à la sortie capture le résultat, cf. plan C9).
    public func pushHistorySnapshot() {
        guard !drawingEditingMode.isActive, !historyPace.captureHeld else { return }
        guard let data = Self.encodeHistorySnapshot(slides) else { return }
        _ = history.push(data)
        purgeUnreachableRetiredResources()
        refreshHistoryFlags()
    }

    /// Les bitmaps et octets animés qu'aucun pas ne peut plus ressusciter quittent la mémoire
    /// (`StoryComposerHistoryPace.retained`) ; les URL de fichiers restent.
    func purgeUnreachableRetiredResources() {
        guard !retiredImages.isEmpty || !retiredSlideImages.isEmpty || !retiredStickerAnimations.isEmpty else { return }
        let pas = history.states
        retiredImages = StoryComposerHistoryPace.retained(retiredImages, reachableFrom: pas)
        retiredSlideImages = StoryComposerHistoryPace.retained(retiredSlideImages, reachableFrom: pas)
        retiredStickerAnimations = StoryComposerHistoryPace.retained(retiredStickerAnimations, reachableFrom: pas)
    }

    /// (Re)démarre la trajectoire : à l'entrée du composer ET après la
    /// restauration d'un brouillon (l'undo ne traverse pas la frontière de
    /// reprise — revenir « avant » un brouillon restauré n'a pas de sens).
    /// Le staging de purge paresseuse repart aussi de zéro (plus aucun
    /// snapshot ne peut référencer ces ressources).
    public func seedHistory() {
        history = HistoryStore<Data>(cap: 50)
        retiredImages = [:]
        retiredVideoURLs = [:]
        retiredStickerAnimations = [:]
        retiredAudioURLs = [:]
        retiredSlideImages = [:]
        historyPace.observe(document: $slides,
                            changed: { [weak self] in self?.noteDocumentChanged($0) },
                            released: { [weak self] in if let self { self.noteDocumentChanged(self.slides) } })
        pushHistorySnapshot()
    }

    private func noteDocumentChanged(_ nouvelles: [StorySlide]) {
        guard !historyPace.isApplying, !historyPace.captureHeld, !drawingEditingMode.isActive,
              let courant = history.current else { return }
        let boutons = StoryComposerHistoryPace.buttons(for: nouvelles, captured: courant,
                                                       canUndo: history.canUndo, canRedo: history.canRedo)
        if canUndoGlobal != boutons.canUndo { canUndoGlobal = boutons.canUndo }
        if canRedoGlobal != boutons.canRedo { canRedoGlobal = boutons.canRedo }
    }

    /// Applique un cran d'annulation. `true` si un état a été appliqué —
    /// l'appelant (View) fait alors suivre les side-effects de présentation
    /// (restoreCanvas, rechargement timeline).
    @discardableResult
    public func undoGlobal() -> Bool { stepHistory { $0.undo() } }

    @discardableResult
    public func redoGlobal() -> Bool { stepHistory { $0.redo() } }

    /// La dernière action, si sa capture débouncée n'est pas encore partie,
    /// devient d'abord un pas : annuler défait CETTE action, jamais la précédente.
    private func stepHistory(_ move: (inout HistoryStore<Data>) -> Data?) -> Bool {
        pushHistorySnapshot()
        guard let data = move(&history) else { refreshHistoryFlags(); return false }
        return applyHistorySnapshot(data)
    }

    private func applyHistorySnapshot(_ data: Data) -> Bool {
        guard let decoded = StoryComposerHistoryPace.decode(data) else { refreshHistoryFlags(); return false }
        let editedSlideId = slides.indices.contains(currentSlideIndex) ? slides[currentSlideIndex].id : nil
        historyPace.isApplying = true
        defer { historyPace.isApplying = false }
        slides = decoded
        currentSlideIndex = StoryComposerHistoryPace.index(of: editedSlideId, in: decoded, previous: currentSlideIndex)
        // Sélection/format panel réinitialisés — simple et sûr (plan §Risques) ;
        // le View reset le band via ses hooks existants au changement d'état.
        selectedElementId = nil
        restoreRetiredResources(for: decoded)
        refreshStaleCropPreviews(in: decoded)
        // Le z-order VM se réhydrate depuis les champs persistés des objets
        // restaurés (mécanisme existant du changement de slide).
        rehydrateZIndexMapFromSlide()
        // Les miroirs des transitions suivent la slide restaurée : le carrousel
        // et l'atelier les relisent.
        openingEffect = currentEffects.opening
        closingEffect = currentEffects.closing
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
            // **Les stickers IMAGE aussi** (#3956). `deleteElement` mettait déjà
            // leur bitmap de côté, mais cette boucle ne parcourait que les
            // médias : un undo ressuscitait le sticker SANS son image, qui
            // retombait sur son emoji de repli — un défaut muet, puisqu'un
            // glyphe s'affichait. Les octets animés suivent le même chemin.
            for sticker in slide.effects.stickerObjects ?? [] {
                if let img = retiredImages.removeValue(forKey: sticker.id) {
                    registerLoadedImage(img, for: sticker.id)
                }
                if let bytes = retiredStickerAnimations.removeValue(forKey: sticker.id) {
                    registerLoadedStickerAnimation(bytes, for: sticker.id)
                }
            }
        }
    }

    private func refreshHistoryFlags() {
        if canUndoGlobal != history.canUndo { canUndoGlobal = history.canUndo }
        if canRedoGlobal != history.canRedo { canRedoGlobal = history.canRedo }
    }

    static func encodeHistorySnapshot(_ slides: [StorySlide]) -> Data? { StoryComposerHistoryPace.encode(slides) }
}
