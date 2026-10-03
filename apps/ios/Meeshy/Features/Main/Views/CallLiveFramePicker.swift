import SwiftUI
import MeeshyUI

/// Les mots du cadre en direct (#9214). Les noms des cadres sont des noms propres
/// (`CallFrameDesign.name`) et les ambiances viennent de `CallFrameCopy`.
enum CallLiveFrameCopy {
    static var label: String {
        String(localized: "call.liveFrame.label", defaultValue: "Cadre en direct", bundle: .main)
    }

    static var caption: String {
        String(localized: "call.liveFrame.caption", defaultValue: "Cadre", bundle: .main)
    }

    static var hint: String {
        String(localized: "call.liveFrame.hint", defaultValue: "Entoure les deux vidéos d'un même cadre, chez vous et chez votre correspondant", bundle: .main)
    }

    static var none: String {
        String(localized: "call.liveFrame.none", defaultValue: "Aucun cadre", bundle: .main)
    }

    static var close: String {
        String(localized: "call.liveFrame.close", defaultValue: "Fermer", bundle: .main)
    }

    static var refused: String {
        String(localized: "call.liveFrame.refused", defaultValue: "Le cadre n'a pas pu être partagé", bundle: .main)
    }

    static func surface(_ name: String) -> String {
        String(format: String(localized: "call.liveFrame.surface", defaultValue: "Cadre %@ autour des deux vidéos", bundle: .main), name)
    }

    static func suspended(_ reason: CallLiveFrameSuspension) -> String {
        switch reason {
        case .deviceConstrained:
            return String(localized: "call.liveFrame.suspended.device", defaultValue: "Cadre en pause : l'appareil se protège (chaleur ou économie d'énergie)", bundle: .main)
        case .reduceMotion:
            return String(localized: "call.liveFrame.suspended.motion", defaultValue: "Ce cadre est animé : il reste masqué tant que « Réduire les animations » est activé", bundle: .main)
        }
    }
}

/// **LE CHOIX DU CADRE EN DIRECT** (#9214) — une feuille basse : les ambiances (les puces du
/// Montage, `CallFrameMoodChips`), puis « Aucun cadre » et les cadres du duo en vignettes.
/// Toucher une vignette pose le cadre chez les deux, tout de suite ; la feuille reste ouverte
/// pour comparer.
struct CallLiveFramePicker: View {
    let selectedId: String?
    let suspension: CallLiveFrameSuspension?
    let people: [CallFramePerson]
    let texts: CallFrameTexts
    let onSelect: (String?) -> Void

    @State private var mood: CallFrameMood?
    @Environment(\.dismiss) private var dismiss

    static let thumbnailSize = CGSize(width: 90, height: 160)

    private var moods: [CallFrameMood] { CallLiveFrameRule.moods() }

    private var currentMood: CallFrameMood? {
        mood ?? selectedId.flatMap { CallFrameCatalogue.frame(id: $0)?.mood } ?? moods.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            header
            if let suspension {
                Text(CallLiveFrameCopy.suspended(suspension))
                    .font(.footnote)
                    .foregroundColor(MeeshyColors.warning)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let currentMood {
                CallFrameMoodChips(chips: moods.map { .mood($0) }, selected: .mood(currentMood)) { chip in
                    guard case .mood(let picked) = chip else { return }
                    mood = picked
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    noneCard
                    ForEach(CallLiveFrameRule.frames(mood: currentMood)) { design in
                        frameCard(design)
                    }
                }
                .padding(.horizontal, MeeshySpacing.lg)
            }
        }
        .padding(.vertical, MeeshySpacing.md)
        .presentationDetents([.height(340)])
        .presentationDragIndicator(.visible)
    }

    private var header: some View {
        HStack {
            Text(CallLiveFrameCopy.label)
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Button(CallLiveFrameCopy.close) { dismiss() }
                .frame(minWidth: 44, minHeight: 44)
        }
        .padding(.horizontal, MeeshySpacing.lg)
    }

    private var noneCard: some View {
        card(isSelected: selectedId == nil, title: CallLiveFrameCopy.none) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.primary.opacity(0.06))
                .overlay(Image(systemName: "square.dashed").font(.title2).foregroundColor(.secondary))
        } action: {
            onSelect(nil)
        }
    }

    private func frameCard(_ design: CallFrameDesign) -> some View {
        card(isSelected: selectedId == design.id, title: design.name) {
            CallLiveFrameThumbnail(design: design, people: people, texts: texts, size: Self.thumbnailSize)
        } action: {
            onSelect(design.id)
        }
    }

    private func card<Thumb: View>(isSelected: Bool, title: String, @ViewBuilder thumbnail: () -> Thumb, action: @escaping () -> Void) -> some View {
        Button {
            guard !isSelected else { return }
            HapticFeedback.light()
            action()
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                thumbnail()
                    .frame(width: Self.thumbnailSize.width, height: Self.thumbnailSize.height)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(isSelected ? MeeshyColors.indigo500 : Color.clear, lineWidth: 3)
                    )
                Text(title)
                    .font(.caption)
                    .lineLimit(1)
                    .frame(width: Self.thumbnailSize.width)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}

/// La vignette d'un cadre pour le duo, peinte HORS du fil principal avec les initiales
/// (jamais les visages), gardée dans un cache borné ; en attendant, le glyphe de l'ambiance.
struct CallLiveFrameThumbnail: View {
    let design: CallFrameDesign
    let people: [CallFramePerson]
    let texts: CallFrameTexts
    let size: CGSize

    @State private var image: CGImage?
    @Environment(\.displayScale) private var displayScale

    nonisolated static let cache = CallFrameThumbnailCache()

    var body: some View {
        ZStack {
            if let image {
                Image(decorative: image, scale: displayScale)
                    .resizable()
                    .scaledToFill()
            } else {
                Color.primary.opacity(0.06)
                Image(systemName: CallFrameCopy.moodSymbol(design.mood))
                    .foregroundColor(.secondary)
            }
        }
        .accessibilityHidden(true)
        .task(id: design.id) {
            let canvas = CGSize(width: size.width * displayScale, height: size.height * displayScale)
            image = await Self.render(design: design, people: people, texts: texts, canvas: canvas)
        }
    }

    @concurrent
    nonisolated static func render(design: CallFrameDesign, people: [CallFramePerson], texts: CallFrameTexts, canvas: CGSize) async -> CGImage? {
        let key = ([design.id] + people.map(\.name)).joined(separator: "\u{1F}")
        if let hit = cache.image(frameId: key, people: people.count, size: canvas) { return hit }
        let portraits = people.map { CallFramePortrait(id: $0.id, name: $0.name, handle: $0.handle, isSelf: $0.isSelf, image: nil) }
        guard let painted = CallFrameRenderer.render(frame: design, portraits: portraits, texts: texts, size: canvas) else { return nil }
        cache.store(painted, frameId: key, people: people.count, size: canvas)
        return painted
    }
}
