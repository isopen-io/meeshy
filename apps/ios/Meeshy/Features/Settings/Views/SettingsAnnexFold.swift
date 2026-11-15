import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le pli « Annexes »** (#18589) : ce qu'on ouvre une fois par an se range
/// sous UNE rangée, dépliée d'un toucher. Le pli replié dit ce qu'il contient,
/// pour que la recherche visuelle reste possible sans l'ouvrir. L'écran tient
/// l'état : replié à chaque montage, déplié par un toucher ou par un réglage
/// désigné qui vit dessous.
struct SettingsAnnexFold<Content: View>: View {
    @Binding var isUnfolded: Bool
    let summary: String
    @ViewBuilder let content: () -> Content

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: MeeshySpacing.xl) {
            toggle
            if isUnfolded {
                VStack(spacing: MeeshySpacing.xl) { content() }
                    .transition(MeeshyMotion.transition(.move(edge: .top).combined(with: .opacity), reduce: reduceMotion))
            }
        }
    }

    private var title: String {
        String(localized: "settings.annex.title", defaultValue: "Annexes", bundle: .main)
    }

    private var toggle: some View {
        Button {
            HapticFeedback.light()
            meeshyWithAnimation(MeeshyAnimation.springDefault, reduced: MeeshyMotion.reducedFade, reduceMotion: reduceMotion) {
                isUnfolded.toggle()
            }
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                VStack(alignment: .leading, spacing: MeeshySpacing.xs - 1) {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                        .foregroundStyle(theme.textPrimary)
                    Text(summary)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize))
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Image(systemName: "chevron.down")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
                    .rotationEffect(.degrees(isUnfolded ? 180 : 0))
                    .accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget, alignment: .leading)
            .padding(.horizontal, MeeshySpacing.md + 2)
            .padding(.vertical, MeeshySpacing.sm + 2)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.lg).fill(theme.inputBackground))
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(isUnfolded
            ? String(localized: "settings.annex.unfolded", defaultValue: "Dépliées", bundle: .main)
            : String(localized: "settings.annex.folded", defaultValue: "Repliées", bundle: .main))
        .accessibilityHint(summary)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("settings.annex.fold")
    }
}
