import Foundation

/// Pile d'états générique de l'undo/redo GLOBAL du composer story (C9).
///
/// Choix d'architecture (plan `2026-07-04-composer-global-undo-plan.md`) :
/// SNAPSHOTS plutôt que commandes — toutes les mutations du composer
/// convergent déjà vers trois choke points (sync des panneaux, fin de geste
/// canvas, opérations de slides) ; empiler l'état complet `[StorySlide]`
/// (compact : les bitmaps vivent par CLÉS hors snapshot) couvre tout par
/// construction, là où des commandes inversibles auraient exigé de convertir
/// des dizaines de call sites avec des trous silencieux garantis.
///
/// Sémantique : la pile contient la TRAJECTOIRE complète, état courant inclus
/// (`index` le pointe). `push` déduplique les états consécutifs identiques
/// (un sync no-op ne crée pas d'étape), tronque la branche redo, et évince le
/// plus ancien au-delà du cap — l'évincé est RETOURNÉ à l'appelant (seam de
/// la purge différée des bitmaps orphelins, piège Inc.3 du plan).
///
/// Struct pure `nonisolated` (parité BandStateMachine) : testable hors main
/// actor, aucune dépendance produit.
public nonisolated struct HistoryStore<S: Equatable & Sendable>: Sendable {

    private var entries: [S] = []
    private var index: Int = -1
    private let cap: Int

    public init(cap: Int = 50) {
        self.cap = max(2, cap)
    }

    public var canUndo: Bool { index > 0 }
    public var canRedo: Bool { index >= 0 && index < entries.count - 1 }

    /// Empile le nouvel état courant. Retourne l'état ÉVINCÉ par le cap
    /// (le plus ancien), `nil` sinon — l'appelant peut alors libérer les
    /// ressources que plus aucun snapshot ne référence.
    @discardableResult
    public mutating func push(_ state: S) -> S? {
        if index >= 0, entries[index] == state { return nil }
        if index < entries.count - 1 {
            entries.removeSubrange((index + 1)...)
        }
        entries.append(state)
        index = entries.count - 1
        guard entries.count > cap else { return nil }
        index -= 1
        return entries.removeFirst()
    }

    /// Recule d'un cran et rend l'état précédent (`nil` au plancher).
    public mutating func undo() -> S? {
        guard canUndo else { return nil }
        index -= 1
        return entries[index]
    }

    /// Avance d'un cran et rend l'état suivant (`nil` au sommet).
    public mutating func redo() -> S? {
        guard canRedo else { return nil }
        index += 1
        return entries[index]
    }
}
