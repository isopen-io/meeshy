#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK20 = MeeshyKitCatalogEntry(
        key: "K20",
        name: "MeeshyThumbnailRow",
        states: [
            MeeshyKitCatalogState(id: "repos", boardView: "R5", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "milieu", boardView: "R6", backdrop: .media),
            MeeshyKitCatalogState(id: "serree", boardView: "R10", backdrop: .media),
            MeeshyKitCatalogState(id: "defilante", backdrop: .media),
            MeeshyKitCatalogState(id: "armee", boardView: "R6", backdrop: .media),
            MeeshyKitCatalogState(id: "soulevee", boardView: "R6", backdrop: .media),
            MeeshyKitCatalogState(id: "envoi", boardView: "A7", backdrop: .media),
            MeeshyKitCatalogState(id: "attente", boardView: "A7", backdrop: .media),
            MeeshyKitCatalogState(id: "preparation", backdrop: .media),
            MeeshyKitCatalogState(id: "echec", backdrop: .media),
            MeeshyKitCatalogState(id: "sans-plus", backdrop: .media),
            MeeshyKitCatalogState(id: "desactivee", backdrop: .media),
            MeeshyKitCatalogState(id: "scene-claire", backdrop: .light),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK20(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyThumbnailRowSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : la vraie rangée, vivante (la courante se change au
/// toucher, « + » ajoute, l'ordre se réécrit au glisser), figée « pressée »,
/// « armée » ou « soulevée » pour les tuiles du même nom. Les contenus sont des
/// dégradés de la palette, aucune image n'est embarquée.
private struct MeeshyThumbnailRowSample: View {
    let stateID: String
    let isPressed: Bool

    @State private var order: [String]
    @State private var current: String?

    init(stateID: String, isPressed: Bool) {
        self.stateID = stateID
        self.isPressed = isPressed
        _order = State(initialValue: Self.initialOrder(stateID))
        _current = State(initialValue: Self.initialCurrent(stateID))
    }

    var body: some View {
        row
            .frame(width: Self.width(stateID))
            .disabled(stateID == "desactivee")
    }

    private var row: some View {
        MeeshyThumbnailRow(
            thumbnails,
            current: current,
            label: "Scènes",
            words: Self.words,
            tone: stateID == "scene-claire" ? .onLight : .deep,
            onSelect: { current = $0 },
            onAdd: stateID == "serree" || stateID == "sans-plus" ? nil : { add() },
            onDuplicate: { duplicate($0) },
            onMove: { move($0, to: $1) },
            onRemove: { remove($0) },
            content: { thumbnail, _ in gradient(thumbnail.id) }
        )
        .previewing(
            pressed: isPressed ? order.first { $0 != current } : nil,
            armed: stateID == "armee" ? "s3" : (stateID == "soulevee" ? "s2" : nil),
            lifted: stateID == "soulevee" ? (id: "s2", translation: Self.liftedTranslation) : nil
        )
    }

    // MARK: - Les vignettes

    private var thumbnails: [MeeshyThumbnail<String>] {
        order.enumerated().map { index, id in
            MeeshyThumbnail(
                id: id,
                accessibilityLabel: "Scène \(index + 1) sur \(order.count)",
                accessibilityValue: Self.value(stateID: stateID, index: index),
                status: Self.status(stateID: stateID, index: index),
                removeLabel: "Supprimer la scène \(index + 1)"
            )
        }
    }

    private func gradient(_ id: String) -> some View {
        let colors = Self.palette[Self.number(of: id) % Self.palette.count]
        return LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    // MARK: - Les gestes de l'hôte, appliqués tout de suite

    private func add() {
        let id = "s\(order.count + 1)"
        order.append(id)
        current = id
    }

    private func duplicate(_ id: String) {
        guard let index = order.firstIndex(of: id) else { return }
        let copy = "s\(Self.number(of: order.last ?? id) + 1)"
        order.insert(copy, at: index + 1)
        current = copy
    }

    private func move(_ id: String, to rank: Int) {
        guard let index = order.firstIndex(of: id) else { return }
        order.remove(at: index)
        order.insert(id, at: min(max(rank, 0), order.count))
    }

    private func remove(_ id: String) {
        order.removeAll { $0 == id }
        if current == id { current = order.first }
    }

    // MARK: - Données

    private static let words = MeeshyThumbnailRowWords(
        add: "Nouvelle scène", duplicate: "Dupliquer la scène", moveEarlier: "Déplacer avant", moveLater: "Déplacer après"
    )

    private static let liftedTranslation: CGFloat = 33

    private static let palette: [[Color]] = [
        [MeeshyColors.amber500, MeeshyColors.indigo700],
        [MeeshyColors.indigo300, MeeshyColors.indigo600],
        [MeeshyColors.indigo950, MeeshyColors.indigo700],
        [MeeshyColors.indigo100, MeeshyColors.indigo400],
        [MeeshyColors.indigo400, MeeshyColors.indigo900],
    ]

    private static func number(of id: String) -> Int {
        Int(id.dropFirst()) ?? 0
    }

    private static func width(_ stateID: String) -> CGFloat {
        switch stateID {
        case "serree": return 240
        case "defilante": return 200
        default: return 320
        }
    }

    private static func initialOrder(_ stateID: String) -> [String] {
        let count: Int
        switch stateID {
        case "serree", "defilante": count = 10
        case "milieu": count = 5
        default: count = 4
        }
        return (1...count).map { "s\($0)" }
    }

    private static func initialCurrent(_ stateID: String) -> String? {
        switch stateID {
        case "milieu": return "s3"
        case "serree": return "s10"
        case "armee", "soulevee": return "s2"
        default: return "s1"
        }
    }

    private static func status(stateID: String, index: Int) -> MeeshyThumbnailStatus {
        switch (stateID, index) {
        case ("envoi", 2): return .sending(0.6)
        case ("attente", 3): return .waiting
        case ("preparation", 2): return .preparing
        case ("echec", 2): return .failed
        default: return .ready
        }
    }

    private static func value(stateID: String, index: Int) -> String? {
        switch (stateID, index) {
        case ("envoi", 2): return "Envoi 60 %"
        case ("attente", 3): return "En attente"
        case ("preparation", 2): return "Préparation"
        case ("echec", 2): return "Échec de l'envoi"
        default: return nil
        }
    }
}
#endif
