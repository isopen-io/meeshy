#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK07 = MeeshyKitCatalogEntry(
        key: "K07",
        name: "MeeshyColorDots",
        states: [
            MeeshyKitCatalogState(id: "texte", boardView: "A3", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "dessin", boardView: "A13", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "fond", boardView: "S1", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "sans-courante", backdrop: .media),
            MeeshyKitCatalogState(id: "degrade", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "theme", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "desactive", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK07(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyColorDotsSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état, aux largeurs des vues de la planche : A3 (358 pt,
/// 14 teintes de 32), A13 (338 pt, 9 teintes de 28 sur une ligne qui défile),
/// S1 (342 pt, 17 teintes de 28 et « Aléatoire » en fin de flux). La tuile
/// « pressé » fige le pré-cercle sur la deuxième pastille. Les palettes sont
/// faites de jetons du design system, jamais de codes.
private struct MeeshyColorDotsSample: View {
    let stateID: String
    let isPressed: Bool

    @State private var selection: String?

    var body: some View {
        switch stateID {
        case "texte": group(MeeshyColorDotsSamplePalette.text, label: "Couleur du texte", size: .s32, width: 358)
        case "dessin": group(MeeshyColorDotsSamplePalette.drawing, label: "Couleur du trait", layout: .row, width: 338)
        case "fond": background
        case "sans-courante": group(MeeshyColorDotsSamplePalette.drawing, label: "Couleur du trait", ringless: true)
        case "degrade": group(MeeshyColorDotsSamplePalette.special, label: "Arrière-plan")
        case "theme": group(MeeshyColorDotsSamplePalette.drawing, label: "Couleur d'accent", tone: .theme)
        default: group(MeeshyColorDotsSamplePalette.drawing, label: "Couleur du trait").disabled(true)
        }
    }

    private var background: some View {
        let dots = MeeshyColorDotsSamplePalette.background
        return MeeshyColorDots(dots, selection: selection ?? dots[0].id, label: "Arrière-plan",
                               onSelect: { selection = $0 }) {
            MeeshyGlassButton(systemImage: "shuffle", label: "Aléatoire", size: .s36) {
                selection = dots.randomElement()?.id
            }
        }
        .previewPressed(isPressed ? dots[1].id : nil)
        .frame(width: 342, alignment: .leading)
    }

    private func group(_ dots: [MeeshyColorDot],
                       label: String,
                       size: MeeshyColorDotSize = .s28,
                       layout: MeeshyColorDotsLayout = .wrap,
                       tone: MeeshyGlassTone? = nil,
                       ringless: Bool = false,
                       width: CGFloat = 342) -> some View {
        let initial = ringless ? nil : dots[0].id
        return MeeshyColorDots(dots, selection: selection ?? initial, label: label, size: size, layout: layout,
                               tone: tone, onSelect: { selection = $0 })
            .previewPressed(isPressed ? dots[1].id : nil)
            .frame(width: width, alignment: .leading)
    }
}

/// Les palettes de démonstration, en jetons nommés.
private enum MeeshyColorDotsSamplePalette {
    static let drawing: [MeeshyColorDot] = [
        dot("blanc", MeeshyColors.onMedia, "Blanc"),
        dot("indigo", MeeshyColors.brandPrimary, "Indigo"),
        dot("corail", MeeshyColors.tileCoral, "Corail"),
        dot("safran", MeeshyColors.tileSaffron, "Safran"),
        dot("emeraude", MeeshyColors.tileEmerald, "Émeraude"),
        dot("ciel", MeeshyColors.tileSky, "Ciel"),
        dot("amethyste", MeeshyColors.tileAmethyst, "Améthyste"),
        dot("rose", MeeshyColors.tileRose, "Rose"),
        dot("nuit", MeeshyColors.indigo950, "Nuit"),
    ]

    static let text: [MeeshyColorDot] = drawing + [
        dot("bleu", MeeshyColors.tileBlue, "Bleu"),
        dot("sarcelle", MeeshyColors.tileTeal, "Sarcelle"),
        dot("cyan", MeeshyColors.tileCyan, "Cyan"),
        dot("ambre", MeeshyColors.amber500, "Ambre"),
        dot("orange", MeeshyColors.orange500, "Orange"),
    ]

    static let background: [MeeshyColorDot] = text + [
        MeeshyColorDot(id: "violet", fill: .solid(MeeshyColors.purple600)),
        MeeshyColorDot(id: "gris", fill: .solid(MeeshyColors.neutral500)),
        MeeshyColorDot(id: "succes", fill: .solid(MeeshyColors.success)),
    ]

    static let special: [MeeshyColorDot] = [
        MeeshyColorDot(id: "aucun", fill: .hollow, name: "Aucun"),
        MeeshyColorDot(id: "auto", fill: .solid(MeeshyColors.onMedia), name: "Automatique", systemImage: "wand.and.stars"),
        MeeshyColorDot(id: "marque", fill: .gradient([MeeshyColors.brandPrimary, MeeshyColors.purple500]), name: "Dégradé Meeshy"),
        MeeshyColorDot(id: "aube", fill: .gradient([MeeshyColors.tileCoral, MeeshyColors.tileSaffron]), name: "Aube"),
    ]

    private static func dot(_ id: String, _ color: Color, _ name: String) -> MeeshyColorDot {
        MeeshyColorDot(id: id, fill: .solid(color), name: name)
    }
}
#endif
