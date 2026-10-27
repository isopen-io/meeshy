import CoreGraphics

/// #8410 — une rangée du bloc de commandes : la famille qu'elle titre, ou
/// `nil` quand les familles se replient en une seule ligne.
struct CallPillRowContent: Equatable, Identifiable, Sendable {
    let family: CallActionFamily?
    let actions: [CallAction]

    var id: String { family?.rawValue ?? "folded" }
}

/// #8410 — en hauteur compacte (iPhone en paysage, iPad ou Mac en fenêtre
/// basse), la pilule d'un groupe ne recouvre plus la grille : ses rangées
/// légendées se replient en UNE ligne sans titres qui défile à l'horizontale,
/// et la grille garde une hauteur minimale.
enum CallGroupStageSizing {
    static let compactHeightThreshold: CGFloat = 500
    static let minimumGridHeight: CGFloat = 140

    static func isCompactHeight(_ stageHeight: CGFloat) -> Bool {
        stageHeight > 0 && stageHeight < compactHeightThreshold
    }

    static func rows(_ families: [CallActionFamilyRow], isCompactHeight: Bool) -> [CallPillRowContent] {
        guard isCompactHeight else {
            return families.map { CallPillRowContent(family: $0.family, actions: $0.actions) }
        }
        let actions = families.flatMap(\.actions)
        return actions.isEmpty ? [] : [CallPillRowContent(family: nil, actions: actions)]
    }
}
