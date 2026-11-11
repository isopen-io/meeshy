#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK15 = MeeshyKitCatalogEntry(
        key: "K15",
        name: "MeeshyAnchoredSheet",
        states: [
            MeeshyKitCatalogState(id: "courte", boardView: "R11", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "mi-hauteur", boardView: "A11", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "haute", boardView: "A16", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "valider", boardView: "A15", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "sans-titre", backdrop: .media),
            MeeshyKitCatalogState(id: "sans-poignee", backdrop: .media),
            MeeshyKitCatalogState(id: "crans", backdrop: .media),
            MeeshyKitCatalogState(id: "theme", backdrop: .light),
            MeeshyKitCatalogState(id: "voile", backdrop: .media),
            MeeshyKitCatalogState(id: "large", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK15(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyAnchoredSheetSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : la feuille sous un bloc d'hôte que sa place publiée réduit,
/// comme la scène de la planche. La fenêtre de démonstration fait 390 × 560 : sa taille fixe
/// l'état (les fractions de la planche tiennent sur 844 pt, la loi est la même).
private struct MeeshyAnchoredSheetSample: View {
    let stateID: String
    let isPressed: Bool

    @State private var isOpen = true
    @State private var footprint: MeeshyAnchoredSheetFootprint?

    private static let windowWidth: CGFloat = 390
    private static let windowHeight: CGFloat = 560
    private static let rowTitles = ["Sondage", "Position", "Lien", "Minuteur"]

    var body: some View {
        ZStack(alignment: .top) {
            hostBlock
            if isOpen {
                sheet
                    .environment(\.meeshyGlassIsPressed, isPressed)
            } else {
                MeeshyGlassButton(systemImage: "chevron.up", label: "Rouvrir", size: .s48) { isOpen = true }
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .padding(.bottom, MeeshySpacing.xxl)
            }
        }
        .frame(width: Self.windowWidth, height: Self.windowHeight)
        .onMeeshyAnchoredSheetFootprint { footprint = $0 }
    }

    private var hostBlock: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
            .fill(MeeshyColors.mediaFill)
            .overlay { Image(systemName: "photo").font(.largeTitle).foregroundStyle(MeeshyColors.onMediaMuted) }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.lg)
            .frame(height: hostHeight, alignment: .top)
    }

    private var hostHeight: CGFloat {
        guard let footprint else { return Self.windowHeight }
        return max(0, Self.windowHeight - footprint.height - MeeshySpacing.lg)
    }

    @ViewBuilder
    private var sheet: some View {
        switch stateID {
        case "courte":
            MeeshyAnchoredSheet(title: "Plus", surface: .dark, onDismiss: close) { rows }
        case "mi-hauteur":
            MeeshyAnchoredSheet(title: "Stickers", height: .regular, surface: .dark, onDismiss: close) { grid }
        case "haute":
            MeeshyAnchoredSheet(title: "Lieu", height: .tall, surface: .dark, onDismiss: close) { list }
        case "valider":
            MeeshyAnchoredSheet(title: "pop-2024.m4a", height: .regular, surface: .dark, onDismiss: close,
                                trailing: { okButton }, content: { grid })
        case "sans-titre":
            MeeshyAnchoredSheet(accessibilityLabel: "Options", surface: .dark, onDismiss: close) { rows }
        case "sans-poignee":
            MeeshyAnchoredSheet(title: "Plus", showsHandle: false, surface: .dark, onDismiss: close) { rows }
        case "crans":
            MeeshyAnchoredSheet(title: "Stickers", height: .detents([0.3, 0.62], initial: 0), surface: .dark,
                                onDismiss: close) { grid }
        case "theme":
            MeeshyAnchoredSheet(title: "Plus", surface: .theme, onDismiss: close) { rows }
        case "voile":
            MeeshyAnchoredSheet(title: "Plus", surface: .dark, scrim: true, onDismiss: close) { rows }
        default:
            MeeshyAnchoredSheet(title: "Plus", surface: .dark, maxWidth: 320, onDismiss: close) { rows }
        }
    }

    private func close() { isOpen = false }

    private var okButton: some View {
        Text("OK")
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            .foregroundStyle(MeeshyColors.indigo950)
            .padding(.horizontal, MeeshySpacing.lg)
            .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.large)
            .background(Capsule().fill(MeeshyColors.onMedia))
            .opacity(isPressed ? MeeshyOpacity.strong : 1)
    }

    private var rows: some View {
        VStack(spacing: 0) {
            ForEach(Self.rowTitles, id: \.self) { title in
                HStack(spacing: MeeshySpacing.md) {
                    Image(systemName: "circle.grid.2x2").frame(width: MeeshyIconSize.xl)
                    Text(title).font(MeeshyFont.relative(MeeshyFont.bodySize))
                    Spacer(minLength: 0)
                }
                .foregroundStyle(.primary)
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(minHeight: MeeshyControlSize.tapTarget)
            }
        }
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: MeeshySpacing.sm), count: 4),
                      spacing: MeeshySpacing.sm) {
                ForEach(0..<16, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .fill(Color.primary.opacity(MeeshyOpacity.light))
                        .aspectRatio(1, contentMode: .fit)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
        }
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(Self.rowTitles + Self.rowTitles.map { $0 + " 2" }, id: \.self) { title in
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize))
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget, alignment: .leading)
                        .padding(.horizontal, MeeshySpacing.lg)
                }
            }
        }
    }
}
#endif
