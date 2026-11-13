#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK18 = MeeshyKitCatalogEntry(
        key: "K18",
        name: "MeeshyObjectMenu",
        states: [
            MeeshyKitCatalogState(id: "objet", boardView: "O2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "media", backdrop: .media),
            MeeshyKitCatalogState(id: "verrouille", backdrop: .media),
            MeeshyKitCatalogState(id: "en-tete", backdrop: .media),
            MeeshyKitCatalogState(id: "dessous", backdrop: .media),
            MeeshyKitCatalogState(id: "defile", backdrop: .media),
            MeeshyKitCatalogState(id: "clair", backdrop: .light),
            MeeshyKitCatalogState(id: "point", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK18(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyObjectMenuSample(stateID: state.id, isPressed: isPressed)
    }
}

/// Ce qu'un état montre : l'objet sélectionné dans sa scène (assombrie à 75 % par
/// l'hôte, pas par le kit), sa pilule avec le (…) allumé, et le menu ouvert au-dessus.
/// Le (…) bascule le menu : le catalogue le joue comme l'écran le jouera.
private struct MeeshyObjectMenuSample: View {
    let stateID: String
    let isPressed: Bool

    @State private var isOpen = true

    private static let windowWidth: CGFloat = 390
    private static let pillWidth: CGFloat = 280
    private static let pillHeight: CGFloat = 64
    private static let sceneOpacityOpen = 0.75

    var body: some View {
        ZStack(alignment: stateID == "dessous" ? .top : .bottom) {
            scene
            if stateID != "point" { pill }
        }
        .frame(width: Self.windowWidth, height: windowHeight)
        .meeshyObjectMenu(
            isPresented: $isOpen,
            label: "Options du sticker",
            items: items,
            header: stateID == "en-tete" ? "Fond" : nil,
            preferredEdge: stateID == "dessous" ? .below : .above,
            alignment: stateID == "point" ? .center : .end,
            tone: stateID == "clair" ? MeeshyGlassTone.onLight : nil,
            pressedItemID: isPressed ? "lock" : nil,
            anchor: stateID == "point" ? MeeshyObjectMenuAnchor(point: CGPoint(x: Self.windowWidth / 2, y: 120)) : nil,
            onSelect: { _ in }
        )
    }

    private var windowHeight: CGFloat {
        switch stateID {
        case "media": return 560
        case "defile": return 300
        case "verrouille": return 300
        case "point": return 400
        default: return 440
        }
    }

    private var scene: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
            .fill(MeeshyColors.mediaFill)
            .overlay { Image(systemName: "photo").font(.largeTitle).foregroundStyle(MeeshyColors.onMediaMuted) }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.lg)
            .opacity(isOpen ? Self.sceneOpacityOpen : 1)
    }

    private var pill: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            ForEach(pillGlyphs, id: \.self) { glyph in
                MeeshyGlassButtonFace(systemImage: glyph, kind: .soft, size: .s48)
            }
            Button { isOpen.toggle() } label: {
                MeeshyGlassButtonFace(systemImage: "ellipsis", kind: isOpen ? .active : .soft, size: .s48)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Plus d'options")
            .meeshyObjectMenuAnchor()
        }
        .padding(.horizontal, MeeshySpacing.sm)
        .frame(width: stateID == "verrouille" ? 120 : Self.pillWidth, height: Self.pillHeight)
        .meeshyGlass(in: Capsule(), tone: stateID == "clair" ? MeeshyGlassTone.onLight : nil)
        .meeshyObjectMenuAnchor(.surface)
        .padding(.vertical, MeeshySpacing.xxl)
    }

    private var pillGlyphs: [String] {
        stateID == "verrouille"
            ? ["chevron.backward"]
            : ["chevron.backward", "textformat", "paintpalette", "timer"]
    }

    private var items: [MeeshyObjectMenuItem] {
        switch stateID {
        case "verrouille":
            return [MeeshyObjectMenuItem(id: "lock", title: "Déverrouiller", systemImage: "lock.open")]
        case "media":
            return Self.mediaItems
        case "defile":
            return Self.mediaItems + Self.mediaItems.map {
                MeeshyObjectMenuItem(id: $0.id + "-2", title: $0.title + " 2", systemImage: $0.systemImage, role: $0.role)
            }
        default:
            return Self.objectItems
        }
    }

    private static let objectItems: [MeeshyObjectMenuItem] = [
        MeeshyObjectMenuItem(id: "remove", title: "Retirer", systemImage: "trash", role: .destructive),
        MeeshyObjectMenuItem(id: "front", title: "Mettre devant", systemImage: "arrow.up.to.line"),
        MeeshyObjectMenuItem(id: "back", title: "Mettre en fond", systemImage: "arrow.down.to.line"),
        MeeshyObjectMenuItem(id: "lock", title: "Verrouiller", systemImage: "lock"),
        MeeshyObjectMenuItem(id: "description", title: "Description", systemImage: "text.alignleft"),
    ]

    private static let mediaItems: [MeeshyObjectMenuItem] = [
        MeeshyObjectMenuItem(id: "time", title: "Temps", systemImage: "clock"),
        MeeshyObjectMenuItem(id: "sticker", title: "Faire un sticker", systemImage: "face.smiling"),
        MeeshyObjectMenuItem(id: "duplicate", title: "Dupliquer", systemImage: "plus.square.on.square"),
    ] + objectItems
}
#endif
