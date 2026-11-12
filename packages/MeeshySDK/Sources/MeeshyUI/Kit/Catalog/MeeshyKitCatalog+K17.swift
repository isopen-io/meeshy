#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK17 = MeeshyKitCatalogEntry(
        key: "K17",
        name: "MeeshyKeyboardDock",
        states: [
            MeeshyKitCatalogState(id: "barre", boardView: "A1", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "outil-ouvert", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "panneau", boardView: "A2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "bande", boardView: "A5", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "deux-actions", boardView: "S7", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "sans-outil", backdrop: .media),
            MeeshyKitCatalogState(id: "coche", backdrop: .media),
            MeeshyKitCatalogState(id: "desactive", backdrop: .media),
            MeeshyKitCatalogState(id: "clair", backdrop: .light),
            MeeshyKitCatalogState(id: "sans-clavier", backdrop: .media),
            MeeshyKitCatalogState(id: "large", boardView: "O11", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK17(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyKeyboardDockSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : un bloc d'hôte, la bande, la barre et, dessous, un bloc neutre de la hauteur du
/// clavier retenu (ou le panneau qui le remplace). Les outils basculent au toucher, par la loi du dock.
private struct MeeshyKeyboardDockSample: View {
    let stateID: String
    let isPressed: Bool

    @State private var input: MeeshyKeyboardDockInput

    private static let windowHeight: CGFloat = 560

    init(stateID: String, isPressed: Bool) {
        self.stateID = stateID
        self.isPressed = isPressed
        _input = State(initialValue: Self.initialInput(stateID))
    }

    var body: some View {
        VStack(spacing: 0) {
            host
            if stateID == "bande" { band }
            MeeshyKeyboardBar(
                label: "Barre du texte", items: items, openItem: input.panelID, confirm: confirm,
                tone: stateID == "clair" ? .onLight : .deep,
                maxWidth: MeeshyKeyboardDockRecipe.maxBarWidth, onItem: tapped
            )
            .equatable()
            .padding(.bottom, MeeshyKeyboardDockRecipe.keyboardGap)
            bottom
        }
        .frame(width: width, height: Self.windowHeight)
        .environment(\.meeshyModeFixedPress, isPressed ? true : nil)
    }

    // MARK: Le décor

    private var host: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
            .fill(stateID == "clair" ? MeeshyColors.backgroundPrimary(isDark: false) : MeeshyColors.mediaFill)
            .overlay { Image(systemName: "textformat").font(.largeTitle).foregroundStyle(MeeshyColors.onMediaMuted) }
            .padding(MeeshyKeyboardDockRecipe.edge)
    }

    @ViewBuilder
    private var bottom: some View {
        if stateID == "sans-clavier" {
            Color.clear.frame(height: MeeshyKeyboardDockRecipe.bottomWithoutKeyboard(safeBottom: 0))
        } else if stateID != "outil-ouvert", let id = input.panelID, let item = items.first(where: { $0.id == id }) {
            MeeshyKeyboardPanel(label: item.label) { panelRows(item) }
                .frame(height: MeeshyKeyboardDockRecipe.fallbackKeyboardHeight)
        } else {
            MeeshyColors.mediaBackdrop.opacity(0.6)
                .frame(height: MeeshyKeyboardDockRecipe.fallbackKeyboardHeight)
        }
    }

    private var band: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(["Alice", "Bastien", "Chloé"], id: \.self) { name in
                Text(name)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(MeeshyColors.onMedia)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .frame(height: MeeshyControlSize.tapTarget)
                    .meeshyGlass(in: Capsule(), tone: .deep)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, MeeshyKeyboardDockRecipe.edge)
        .padding(.bottom, MeeshyKeyboardDockRecipe.aboveGap)
    }

    private func panelRows(_ item: MeeshyKeyboardDockItem) -> some View {
        ForEach(0..<3, id: \.self) { row in
            Text("\(item.label) \(row + 1)")
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(MeeshyColors.onMedia)
        }
    }

    // MARK: Les valeurs

    private var width: CGFloat {
        switch stateID {
        case "coche": return 280
        case "large": return 820
        default: return 390
        }
    }

    private var items: [MeeshyKeyboardDockItem] {
        switch stateID {
        case "deux-actions":
            return [
                MeeshyKeyboardDockItem(id: "mention", label: "Mentionner", systemImage: "at", opensPanel: false),
                MeeshyKeyboardDockItem(id: "tag", label: "Ajouter un mot-clé", systemImage: "number", opensPanel: false),
            ]
        case "sans-outil":
            return []
        case "coche":
            return Self.tools + [MeeshyKeyboardDockItem(id: "language", label: "Langue", systemImage: "globe")]
        case "desactive":
            return [MeeshyKeyboardDockItem(id: "font", label: "Police et effet", systemImage: "textformat", isEnabled: false)]
                + Self.tools.dropFirst()
        default:
            return Self.tools
        }
    }

    private var confirm: MeeshyKeyboardDockConfirm {
        MeeshyKeyboardDockConfirm(
            title: "OK", label: "Valider le texte", hint: "Termine l'écriture et rend la scène",
            isEnabled: stateID != "desactive", action: {}
        )
    }

    private func tapped(_ id: String) {
        guard let item = items.first(where: { $0.id == id }) else { return }
        input = MeeshyKeyboardDockRule.tapped(item, in: input)
    }

    private static let tools = [
        MeeshyKeyboardDockItem(id: "font", label: "Police et effet", systemImage: "textformat"),
        MeeshyKeyboardDockItem(id: "color", label: "Couleur et contour", systemImage: "circle.fill"),
        MeeshyKeyboardDockItem(id: "align", label: "Alignement", systemImage: "text.alignleft"),
        MeeshyKeyboardDockItem(id: "surface", label: "Fond et cadre", systemImage: "square.fill"),
    ]

    private static func initialInput(_ stateID: String) -> MeeshyKeyboardDockInput {
        switch stateID {
        case "outil-ouvert": return .panel("color")
        case "panneau": return .panel("font")
        default: return .keyboard
        }
    }
}
#endif
