import Testing
@testable import MeeshyUI

@Suite("HistoryStore — pile d'états de l'undo global composer (C9 Inc.1)")
struct HistoryStoreTests {

    @Test("vierge : rien à annuler ni rétablir")
    func emptyStore() {
        var store = HistoryStore<String>(cap: 10)
        #expect(!store.canUndo)
        #expect(!store.canRedo)
        #expect(store.undo() == nil)
        #expect(store.redo() == nil)
    }

    @Test("undo rend l'état précédent, redo le re-avance")
    func undoRedoRoundTrip() {
        var store = HistoryStore<String>(cap: 10)
        store.push("seed")
        store.push("A")
        #expect(store.canUndo)
        #expect(!store.canRedo)
        #expect(store.undo() == "seed")
        #expect(store.canRedo)
        #expect(store.redo() == "A")
        #expect(!store.canRedo)
    }

    @Test("les états consécutifs identiques sont dédupliqués")
    func consecutiveDedup() {
        var store = HistoryStore<String>(cap: 10)
        store.push("seed")
        store.push("seed")
        store.push("seed")
        #expect(!store.canUndo, "un sync no-op ne doit pas créer d'étape d'annulation")
    }

    @Test("pousser après un undo tronque la branche redo")
    func pushTruncatesRedoTail() {
        var store = HistoryStore<String>(cap: 10)
        store.push("seed")
        store.push("A")
        store.push("B")
        #expect(store.undo() == "A")
        store.push("C")
        #expect(!store.canRedo, "B est abandonné — pas de branches parallèles")
        #expect(store.undo() == "A")
        #expect(store.redo() == "C")
    }

    @Test("le cap évince le plus ancien et le RETOURNE (seam purge bitmaps)")
    func capEvictsOldest() {
        var store = HistoryStore<Int>(cap: 3)
        #expect(store.push(1) == nil)
        #expect(store.push(2) == nil)
        #expect(store.push(3) == nil)
        #expect(store.push(4) == 1, "l'évincé remonte à l'appelant (purge différée)")
        #expect(store.undo() == 3)
        #expect(store.undo() == 2)
        #expect(store.undo() == nil, "1 est hors pile")
    }

    @Test("descente au plancher puis remontée au sommet — trajectoire exacte")
    func fullDescentAndClimb() {
        var store = HistoryStore<Int>(cap: 10)
        for i in 0...3 { store.push(i) }
        #expect(store.undo() == 2)
        #expect(store.undo() == 1)
        #expect(store.undo() == 0)
        #expect(store.undo() == nil)
        #expect(store.redo() == 1)
        #expect(store.redo() == 2)
        #expect(store.redo() == 3)
        #expect(store.redo() == nil)
    }
}
