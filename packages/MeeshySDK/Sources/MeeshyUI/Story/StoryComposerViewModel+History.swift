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
    func seedHistory() {
        history = HistoryStore<Data>(cap: 50)
        pushHistorySnapshot()
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
