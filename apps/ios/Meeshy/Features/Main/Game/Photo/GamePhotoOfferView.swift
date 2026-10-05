import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA PROPOSITION APRÈS LA CÉLÉBRATION (#9382) — conception, partie VI : « après
/// la célébration, Mee propose : On immortalise ? ». Une carte du jeu, sans bulle
/// de conversation : Mee à côté du texte, deux gestes. « Photographier » ouvre le
/// déroulé (selfie, carte seule, plus tard) ; « Plus tard » laisse le moment en
/// attente sept jours dans le carnet — la proposition ne revient pas, elle ne
/// s'impose jamais. Miroir de `apps/web/src/components/game-photo-offer.tsx`.
struct GamePhotoOfferView: View {
    let moment: PhotoMoment
    let onStart: (PhotoMoment) -> Void
    let onLater: (PhotoMoment) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ProgressionCard(tint: MeeshyColors.brandPrimary) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                HStack(alignment: .bottom, spacing: MeeshySpacing.sm) {
                    MeeStickerFilmView(filmID: "mee-coucou", animated: true, side: 64, animates: !reduceMotion, pixelCap: 240)
                        .frame(width: 64, height: 64)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(String(localized: "game.photo.offer.title", defaultValue: "On immortalise ?", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                            .foregroundColor(theme.textPrimary)
                            .accessibilityAddTraits(.isHeader)
                        Text(moment.title)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                    Spacer(minLength: 0)
                }
                HStack(spacing: MeeshySpacing.sm) {
                    Button {
                        HapticFeedback.light()
                        onStart(moment)
                    } label: {
                        Text(String(localized: "game.photo.offer.start", defaultValue: "Photographier", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.lg)
                            .frame(minHeight: 44)
                            .background(Capsule().fill(MeeshyColors.brandPrimary))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("game.photo.offer.start")
                    Button {
                        HapticFeedback.light()
                        onLater(moment)
                    } label: {
                        Text(String(localized: "game.photo.later", defaultValue: "Plus tard", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                            .foregroundColor(theme.textMuted)
                            .padding(.horizontal, MeeshySpacing.sm)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("game.photo.offer.later")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.photo.offer")
    }
}
