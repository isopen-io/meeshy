#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK10 = MeeshyKitCatalogEntry(
        key: "K10",
        name: "MeeshyGlassPill",
        states: [
            MeeshyKitCatalogState(id: "repos-vide", boardView: "R1", backdrop: .dark),
            MeeshyKitCatalogState(id: "repos", boardView: "R2", backdrop: .media),
            MeeshyKitCatalogState(id: "ouvert", boardView: "R3", backdrop: .media),
            MeeshyKitCatalogState(id: "clair", boardView: "R13", backdrop: .light),
            MeeshyKitCatalogState(id: "en-cours", boardView: "P1", backdrop: .media),
            MeeshyKitCatalogState(id: "objet", boardView: "O1", backdrop: .media),
            MeeshyKitCatalogState(id: "texte", boardView: "O14", backdrop: .media),
            MeeshyKitCatalogState(id: "retouche-video", boardView: "C2", backdrop: .media),
            MeeshyKitCatalogState(id: "agrandie", boardView: "S5", backdrop: .media),
            MeeshyKitCatalogState(id: "sans-rangee", boardView: "R12", backdrop: .media),
            MeeshyKitCatalogState(id: "repartie", backdrop: .media),
            MeeshyKitCatalogState(id: "defilement", backdrop: .media),
            MeeshyKitCatalogState(id: "retrait", boardView: "R4", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK10(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyGlassPillSample(stateID: state.id)
    }
}

/// Un outil de la rangée d'un échantillon : le catalogue ne porte que des
/// valeurs, la pilule les remet aux vrais boutons K02.
private struct MeeshyGlassPillTool {
    let symbol: String
    let label: String
    var kind: MeeshyGlassButtonKind?
    var activation: MeeshyGlassButtonActivation = .none

    init(_ symbol: String, _ label: String, kind: MeeshyGlassButtonKind? = nil,
         activation: MeeshyGlassButtonActivation = .none) {
        self.symbol = symbol
        self.label = label
        self.kind = kind
        self.activation = activation
    }
}

/// L'échantillon d'un état : la vraie pilule, dans la place d'un téléphone de 390
/// (366 une fois les bords de 12 retirés, 296 pour le débordement), aux outils
/// des vues de la planche.
private struct MeeshyGlassPillSample: View {
    let stateID: String

    private static let phonePlace: CGFloat = 366
    private static let narrowPlace: CGFloat = 296

    var body: some View {
        Group {
            switch stateID {
            case "repos-vide": rest(tone: .plain, tools: [Self.tools[0], Self.tools[1], Self.tools[4]], primary: nil)
            case "repos": rest(tone: nil, tools: Array(Self.tools.prefix(4)), primary: "Publier")
            case "ouvert": rest(tone: nil, tools: Array(Self.tools.prefix(3)) + [Self.openMore], primary: "Publier")
            case "clair": rest(tone: .onLight, tools: Array(Self.tools.prefix(4)), primary: "Publier")
            case "en-cours": rest(tone: nil, tools: Array(Self.tools.prefix(3)), primary: "Envoi 62 %")
            case "objet": rest(tone: nil, tools: Self.objectTools, primary: nil)
            case "texte": rest(tone: nil, tools: Self.textTools, primary: nil)
            case "retouche-video": rest(tone: nil, tools: Self.videoTools, primary: nil)
            case "agrandie": expanded(presence: .shown)
            case "sans-rangee": expanded(presence: .withoutRow)
            case "repartie": spread
            case "defilement": rest(tone: nil, tools: Self.videoTools, primary: nil)
            default: MeeshyGlassPillStowDemo(tools: Self.videoTools)
            }
        }
        .frame(width: stateID == "defilement" ? Self.narrowPlace : Self.phonePlace)
    }

    // MARK: Outils

    private static let tools = [
        MeeshyGlassPillTool("photo", "Ajouter une photo"),
        MeeshyGlassPillTool("textformat", "Ajouter du texte"),
        MeeshyGlassPillTool("music.note", "Ajouter un son"),
        MeeshyGlassPillTool("face.smiling", "Ajouter un sticker"),
        MeeshyGlassPillTool("ellipsis", "Afficher les actions"),
    ]

    private static let openMore = MeeshyGlassPillTool("ellipsis", "Ranger les actions", activation: .expanded(true))

    private static let objectTools = [
        MeeshyGlassPillTool("chevron.backward", "Retour", kind: .soft),
        MeeshyGlassPillTool("arrow.left.arrow.right", "Remplacer"),
        MeeshyGlassPillTool("flip.horizontal", "Miroir"),
        MeeshyGlassPillTool("timer", "Temps"),
        MeeshyGlassPillTool("ellipsis", "Plus d'actions"),
    ]

    private static let textTools = [
        MeeshyGlassPillTool("chevron.backward", "Retour", kind: .soft),
        MeeshyGlassPillTool("textformat", "Style du texte"),
        MeeshyGlassPillTool("paintpalette", "Couleur"),
        MeeshyGlassPillTool("text.alignleft", "Alignement"),
        MeeshyGlassPillTool("rectangle.fill", "Fond"),
        MeeshyGlassPillTool("ellipsis", "Plus d'actions"),
    ]

    private static let videoTools = [
        MeeshyGlassPillTool("chevron.backward", "Retour", kind: .soft),
        MeeshyGlassPillTool("camera.filters", "Looks"),
        MeeshyGlassPillTool("crop", "Recadrer"),
        MeeshyGlassPillTool("scissors", "Couper", activation: .selected(true)),
        MeeshyGlassPillTool("speaker.wave.2", "Son"),
        MeeshyGlassPillTool("timer", "Vitesse"),
        MeeshyGlassPillTool("ellipsis", "Plus d'actions"),
    ]

    // MARK: États

    @ViewBuilder
    private func rest(tone: MeeshyGlassTone?, tools: [MeeshyGlassPillTool], primary: String?) -> some View {
        if let primary {
            MeeshyGlassPill(label: "Pilule du composer", tone: tone) { size in
                Self.row(tools, size: size)
            } primary: {
                Self.primaryAction(primary)
            }
        } else {
            MeeshyGlassPill(label: "Pilule du composer", tone: tone) { size in
                Self.row(tools, size: size)
            }
        }
    }

    private func expanded(presence: MeeshyGlassPillPresence) -> some View {
        MeeshyGlassPill(label: "Options du texte", presence: presence, showsDivider: true) { size in
            Self.row(Self.textTools, size: size)
        } above: {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(verbatim: "Couleur du texte").font(.subheadline.weight(.semibold))
                HStack(spacing: MeeshySpacing.md) {
                    ForEach(Self.swatches.indices, id: \.self) { index in
                        Circle().fill(Self.swatches[index]).frame(width: MeeshySpacing.xxl, height: MeeshySpacing.xxl)
                    }
                }
            }
            .foregroundStyle(MeeshyColors.onMedia)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MeeshySpacing.lg)
        }
    }

    private static let swatches = [MeeshyColors.brandPrimary, MeeshyColors.success, MeeshyColors.error, MeeshyColors.onMedia]

    private var spread: some View {
        MeeshyGlassPill(label: "Commandes de l'appel", layout: .spread()) { size in
            Self.row([
                MeeshyGlassPillTool("ellipsis", "Afficher les actions"),
                MeeshyGlassPillTool("mic.fill", "Couper le micro"),
                MeeshyGlassPillTool("speaker.wave.2.fill", "Sortie audio"),
                MeeshyGlassPillTool("phone.down.fill", "Raccrocher", kind: .destructive),
            ], size: size)
        }
    }

    // MARK: Pièces

    @ViewBuilder
    fileprivate static func row(_ tools: [MeeshyGlassPillTool], size: MeeshyGlassButtonSize) -> some View {
        ForEach(tools, id: \.label) { tool in
            MeeshyGlassButton(
                systemImage: tool.symbol, label: tool.label, kind: tool.kind, size: size, activation: tool.activation,
                action: {}
            )
        }
    }

    fileprivate static func primaryAction(_ title: String) -> some View {
        Text(verbatim: title)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(MeeshyColors.indigo950)
            .padding(.horizontal, MeeshySpacing.xl)
            .frame(height: CGFloat(MeeshyGlassButtonSize.s48.diameter))
            .background(Capsule().fill(MeeshyColors.onMedia))
    }
}

/// La bascule « ranger » : la pilule sort par son bord et revient ; un toucher
/// reçu pendant le retrait la rappelle.
private struct MeeshyGlassPillStowDemo: View {
    let tools: [MeeshyGlassPillTool]
    @State private var presence: MeeshyGlassPillPresence = .shown

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            MeeshyGlassPill(label: "Pilule du composer", presence: presence, onRevive: { presence = .shown }) { size in
                MeeshyGlassPillSample.row(tools, size: size)
            }
            Button {
                presence = presence.isStowed ? .shown : .stowed
            } label: {
                Text(verbatim: presence.isStowed ? "Rappeler" : "Ranger")
                    .foregroundStyle(MeeshyColors.onMedia)
            }
        }
    }
}
#endif
