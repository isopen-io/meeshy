#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK01 = MeeshyKitCatalogEntry(
        key: "K01",
        name: "MeeshyGlassTone",
        states: [
            MeeshyKitCatalogState(id: "plain", boardView: "R1", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "deep", boardView: "R2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "deep-dense", boardView: "R7", backdrop: .media),
            MeeshyKitCatalogState(id: "onlight", boardView: "R13", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "theme", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "teinte", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "opaque", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK01(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyGlassToneSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : une pilule de verre portant un glyphe et l'`id` de
/// l'état, à l'encre blanche du chrome sur média (ou du thème pour `theme`).
private struct MeeshyGlassToneSample: View {
    let stateID: String
    let isPressed: Bool

    var body: some View {
        sample
            .environment(\.meeshyGlassForcesOpaque, stateID == "opaque")
    }

    @ViewBuilder
    private var sample: some View {
        if stateID == "theme" {
            pill(ink: MeeshyColors.textPrimary(isDark: false), tone: .theme, density: .regular, tint: nil)
                .environment(\.colorScheme, .light)
        } else {
            pill(ink: MeeshyColors.onMedia, tone: tone, density: density, tint: stateID == "teinte" ? MeeshyColors.brandPrimary : nil)
        }
    }

    private var tone: MeeshyGlassTone {
        switch stateID {
        case "plain": return .plain
        case "onlight": return .onLight
        default: return .deep
        }
    }

    private var density: MeeshyGlassDensity {
        stateID == "deep-dense" ? .dense : .regular
    }

    private func pill(ink: Color, tone: MeeshyGlassTone, density: MeeshyGlassDensity, tint: Color?) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "sparkles")
            Text(stateID)
                .font(.footnote)
        }
        .foregroundStyle(ink)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .meeshyGlass(
            in: Capsule(),
            tone: tone,
            density: density,
            tint: tint,
            isInteractive: isTouchable,
            isPressed: isTouchable && isPressed ? true : nil
        )
    }

    private var isTouchable: Bool {
        stateID != "deep-dense" && stateID != "opaque"
    }
}
#endif
