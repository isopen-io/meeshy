#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK23 = MeeshyKitCatalogEntry(
        key: "K23",
        name: "MeeshySelectionFeedback",
        states: [
            MeeshyKitCatalogState(id: "choisi-sticker", boardView: "O1", backdrop: .dark),
            MeeshyKitCatalogState(id: "choisi-texte", boardView: "O14", backdrop: .dark),
            MeeshyKitCatalogState(id: "choisi-media", boardView: "O15", backdrop: .dark),
            MeeshyKitCatalogState(id: "glisse-centre", boardView: "O3", backdrop: .dark),
            MeeshyKitCatalogState(id: "glisse-croix", backdrop: .dark),
            MeeshyKitCatalogState(id: "glisse-libre", backdrop: .dark),
            MeeshyKitCatalogState(id: "deux-doigts", boardView: "O11", backdrop: .dark),
            MeeshyKitCatalogState(id: "contour-candidates", backdrop: .dark),
            MeeshyKitCatalogState(id: "scene-claire", backdrop: .light),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK23(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshySelectionFeedbackSample(stateID: state.id)
    }
}

/// Ce que l'hôte passerait au halo et aux repères pour un état du catalogue.
private nonisolated struct MeeshySelectionFeedbackSampleSetting: Sendable, Equatable {
    enum Chosen: Sendable, Equatable { case sticker, text, media, nothing }

    let chosen: Chosen
    let engaged: MeeshySnapLines
    let candidates: MeeshySnapLines
    let showsBounds: Bool
    let isGesturing: Bool
    let objectScale: CGFloat
    let isLightScene: Bool

    private static let targets: [CGFloat] = [0.18, 0.25, 0.5, 0.75, 0.82]

    static func setting(for stateID: String) -> MeeshySelectionFeedbackSampleSetting {
        func make(_ chosen: Chosen, engaged: MeeshySnapLines = .none, candidates: MeeshySnapLines = .none,
                  bounds: Bool = false, gesturing: Bool = false, scale: CGFloat = 1, light: Bool = false) -> Self {
            Self(chosen: chosen, engaged: engaged, candidates: candidates, showsBounds: bounds,
                 isGesturing: gesturing, objectScale: scale, isLightScene: light)
        }
        switch stateID {
        case "choisi-texte": return make(.text)
        case "choisi-media": return make(.media)
        case "glisse-centre": return make(.sticker, engaged: MeeshySnapLines(vertical: [0.5]), gesturing: true)
        case "glisse-croix": return make(.sticker, engaged: MeeshySnapLines(vertical: [0.5], horizontal: [0.25]), gesturing: true)
        case "glisse-libre": return make(.sticker, gesturing: true)
        case "deux-doigts": return make(.sticker, gesturing: true, scale: 1.6)
        case "contour-candidates":
            return make(.sticker, engaged: MeeshySnapLines(vertical: [0.5]),
                        candidates: MeeshySnapLines(vertical: targets, horizontal: targets), bounds: true, gesturing: true)
        case "scene-claire": return make(.sticker, engaged: MeeshySnapLines(vertical: [0.5]), gesturing: true, light: true)
        default: return make(.sticker)
        }
    }
}

/// L'échantillon d'un état : une scène 9:16 portant un sticker, un texte et un
/// média, avec le halo sur l'objet choisi et les repères par-dessus. Le contenu
/// est déterministe — aucune image n'est embarquée. Les doigts de O11 sont une
/// figure du catalogue, jamais une API du kit.
private struct MeeshySelectionFeedbackSample: View {
    let stateID: String

    private static let sceneSize = CGSize(width: 196, height: 348)
    private static let sceneRadius: CGFloat = MeeshyRadius.lg

    var body: some View {
        let setting = MeeshySelectionFeedbackSampleSetting.setting(for: stateID)
        ZStack {
            scene(setting)
            MeeshySnapGuides(
                isActive: setting.isGesturing,
                engaged: setting.engaged,
                candidates: setting.candidates,
                showsBounds: setting.showsBounds,
                cornerRadius: Self.sceneRadius,
                haptic: .none
            )
            if stateID == "deux-doigts" { fingers }
        }
        .frame(width: Self.sceneSize.width, height: Self.sceneSize.height)
        .clipShape(RoundedRectangle(cornerRadius: Self.sceneRadius))
        .meeshyGlassTone(setting.isLightScene ? .onLight : .deep)
    }

    private func scene(_ setting: MeeshySelectionFeedbackSampleSetting) -> some View {
        ZStack {
            (setting.isLightScene ? MeeshyColors.onMedia : MeeshyColors.indigo950)
            MeeshySelectionFeedbackSampleObjects(setting: setting, isLight: setting.isLightScene)
        }
    }

    private var fingers: some View {
        ZStack {
            finger.position(x: 98, y: 170)
            finger.position(x: 150, y: 230)
        }
    }

    private var finger: some View {
        Circle()
            .fill(MeeshyColors.onMedia.opacity(0.28))
            .overlay { Circle().stroke(MeeshyColors.onMedia.opacity(0.8), lineWidth: 2) }
            .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
    }
}

private struct MeeshySelectionFeedbackSampleObjects: View {
    let setting: MeeshySelectionFeedbackSampleSetting
    let isLight: Bool

    var body: some View {
        ZStack {
            text.position(x: 98, y: 70)
            media.position(x: 98, y: 280)
            sticker.position(x: 98, y: 174)
        }
    }

    private var sticker: some View {
        ZStack {
            Circle().fill(MeeshyColors.purple500)
            HStack(spacing: 14) {
                Ellipse().fill(MeeshyColors.onMedia).frame(width: 10, height: 13)
                Ellipse().fill(MeeshyColors.onMedia).frame(width: 10, height: 13)
            }
        }
        .frame(width: 72, height: 72)
        .meeshySelectionHalo(setting.chosen == .sticker, scale: setting.objectScale)
        .scaleEffect(setting.objectScale)
    }

    private var text: some View {
        Text("Mee")
            .font(.system(size: 28, weight: .heavy, design: .rounded))
            .foregroundStyle(isLight ? MeeshyColors.mediaBackdrop : MeeshyColors.onMedia)
            .meeshySelectionHalo(setting.chosen == .text)
    }

    private var media: some View {
        LinearGradient(
            colors: [MeeshyColors.indigo500, MeeshyColors.purple500],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
        .frame(width: 96, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        .meeshySelectionHalo(setting.chosen == .media, shape: .rounded(MeeshyRadius.md))
    }
}
#endif
