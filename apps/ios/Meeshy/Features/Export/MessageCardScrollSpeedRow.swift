import SwiftUI
import MeeshySDK
import MeeshyUI

/// **LA VITESSE DU DÉFILEMENT** (#18671) — neuf pastilles, de ×0,5 à ×3, et la
/// durée de la vidéo qu'elles donnent : on voit ce qu'on choisit avant d'enregistrer.
struct MessageCardScrollSpeedRow: View {
    @Binding var speed: MessageCardScrollSpeed
    let duration: Double

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            HStack {
                Label(MessageCardExportText.text("export.card.scroll.title", "Vidéo qui défile"), systemImage: "text.line.first.and.arrowtriangle.forward")
                    .font(.footnote.weight(.semibold))
                Spacer(minLength: 0)
                Text(Self.durationLabel(duration))
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(MessageCardExportText.text("export.card.scroll.duration", "Durée de la vidéo"))
                    .accessibilityValue(MediaFormat.duration(duration, style: .spoken, rounding: .toNearestOrAwayFromZero))
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.xs) {
                    ForEach(MessageCardScrollSpeed.allCases, id: \.self) { item in
                        let selected = item == speed
                        Button {
                            HapticFeedback.light()
                            speed = item
                        } label: {
                            Text(verbatim: item.label())
                                .font(.subheadline.weight(.semibold).monospacedDigit())
                                .padding(.horizontal, MeeshySpacing.md)
                                .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                                .foregroundStyle(selected ? Color(uiColor: .systemBackground) : Color.primary)
                                .background(Capsule().fill(selected ? Color.primary : Color.primary.opacity(0.07)))
                                .contentShape(Capsule())
                        }
                        .buttonStyle(MessageCardPressStyle())
                        .accessibilityAddTraits(selected ? [.isSelected] : [])
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(MessageCardExportText.text("export.card.scroll.speed", "Vitesse du défilement"))
        }
    }

    /// « 1:12 », « 0:38 » — la durée à la seconde près, par l'horloge des médias.
    static func durationLabel(_ seconds: Double) -> String {
        MediaFormat.duration(seconds, style: .clock, rounding: .toNearestOrAwayFromZero)
    }
}
