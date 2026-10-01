import SwiftUI
import MeeshySDK
import MeeshyUI

/// **LE PASSAGE À EXPORTER** (#8979) — l'onde du son entier (une règle pour
/// une vidéo), et la fenêtre de la durée choisie qu'on fait glisser au doigt.
///
/// Le geste est PROGRESSIF et ANNULABLE (directive porteur 2026-08-30) : la
/// fenêtre suit le doigt image par image, revenir en arrière la ramène, et ce
/// n'est qu'au lever du doigt que la carte se repeint sur le nouveau passage.
/// Un simple toucher centre la fenêtre là où il tombe. VoiceOver la déplace de
/// cinq secondes en cinq secondes.
///
/// Le temps s'y lit de gauche à droite dans toutes les langues, comme l'onde
/// peinte sur la carte : une bande retournée en arabe placerait le début du
/// son à l'opposé de celui de la carte qu'elle découpe.
struct MessageCardExcerptStrip: View {
    let excerpt: MessageCardExcerpt
    let onMove: (Double) -> Void

    @State private var live: Double?
    @State private var origin: Double?

    private static let bars = 56
    private static let height: CGFloat = 44
    private static let voiceOverStep: Double = 5

    private var start: Double { live ?? excerpt.window.start }
    private var latest: Double { max(0, excerpt.total - excerpt.window.duration) }

    private var span: String {
        "\(MessageCardMedia.clock(start)) – \(MessageCardMedia.clock(start + excerpt.window.duration))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            HStack {
                Text(MessageCardExportText.text("export.card.excerpt.label", "Passage exporté"))
                    .foregroundStyle(.secondary)
                Spacer(minLength: MeeshySpacing.sm)
                Text(verbatim: span)
                    .monospacedDigit()
                    .fontWeight(.semibold)
            }
            .font(.caption)
            GeometryReader { proxy in
                strip(width: proxy.size.width)
            }
            .frame(height: Self.height)
            .environment(\.layoutDirection, .leftToRight)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MessageCardExportText.text("export.card.excerpt.label", "Passage exporté"))
        .accessibilityValue(Text(verbatim: span))
        .accessibilityHint(MessageCardExportText.text("export.card.excerpt.hint", "Faites glisser pour choisir le passage"))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: commit(excerpt.window.start + Self.voiceOverStep)
            case .decrement: commit(excerpt.window.start - Self.voiceOverStep)
            @unknown default: break
            }
        }
    }

    private func strip(width: CGFloat) -> some View {
        let total = max(excerpt.total, 0.001)
        let windowX = CGFloat(start / total) * width
        let windowWidth = max(MeeshyControlSize.small, CGFloat(excerpt.window.duration / total) * width)
        let levels = excerpt.levels(Self.bars)
        let step = width / CGFloat(Self.bars)
        return ZStack(alignment: .leading) {
            HStack(alignment: .center, spacing: 0) {
                ForEach(Array(levels.enumerated()), id: \.offset) { index, level in
                    let center = (CGFloat(index) + 0.5) * step
                    Capsule()
                        .fill(center >= windowX && center <= windowX + windowWidth ? AnyShapeStyle(.tint) : AnyShapeStyle(Color.primary.opacity(0.22)))
                        .frame(width: max(MeeshyBorder.strong, step * 0.5), height: max(MeeshySpacing.xs, CGFloat(level) * (Self.height - MeeshySpacing.md)))
                        .frame(width: step)
                }
            }
            RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous)
                .fill(Color.primary.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous)
                        .strokeBorder(.tint, lineWidth: MeeshyBorder.strong)
                )
                .frame(width: windowWidth, height: Self.height)
                .offset(x: windowX)
                .allowsHitTesting(false)
        }
        .frame(width: width, height: Self.height, alignment: .leading)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    let from = origin ?? excerpt.window.start
                    origin = from
                    live = clamped(from + Double(value.translation.width / max(width, 1)) * excerpt.total)
                }
                .onEnded { value in
                    let tapped = abs(value.translation.width) < MeeshySpacing.xs
                    let target = tapped
                        ? Double(value.location.x / max(width, 1)) * excerpt.total - excerpt.window.duration / 2
                        : (live ?? excerpt.window.start)
                    commit(target)
                }
        )
    }

    private func clamped(_ value: Double) -> Double {
        min(latest, max(0, value))
    }

    private func commit(_ value: Double) {
        let next = clamped(value)
        live = nil
        origin = nil
        guard abs(next - excerpt.window.start) > 0.05 else { return }
        HapticFeedback.light()
        onMove(next)
    }
}
