import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA CARTE DE MEE ET MEO (#9379) — conception, partie III : sans bulle de
/// conversation, un guide à côté d'un texte à quatre temps (ce qui vient d'arriver,
/// ce que ça veut dire, l'étape d'après, un bouton qui y mène). Miroir de
/// `apps/web/src/components/game-guide-card.tsx`.
///
///  - complète la première fois, UNE ligne les fois suivantes ; le bouton « ? »
///    rouvre toujours la version complète ;
///  - le vrai dessin de Mee et de Meo : les films du pack de stickers, jamais
///    recopiés, en image fixe quand l'utilisateur limite les animations ;
///  - un grand moment les montre ensemble ;
///  - lecteur d'écran : la carte est lue en entier, le dessin est décoratif ;
///  - pendant l'intégration : « Étape 3 sur 7 » et « Passer l'intégration ».
struct GameGuideCardView: View {
    let card: GuideCard
    let onAction: () -> Void
    let onDismiss: () -> Void
    var onSkipAll: (() -> Void)?
    var onPhoto: (() -> Void)?

    @State private var expanded = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var theme: ThemeManager { ThemeManager.shared }
    private var isShort: Bool { card.presentation == .short && !expanded }
    private var speakerName: String {
        switch card.speaker {
        case .mee: String(localized: "game.guide.speaker.mee", defaultValue: "Mee", bundle: .main)
        case .meo: String(localized: "game.guide.speaker.meo", defaultValue: "Meo", bundle: .main)
        case .duo: String(localized: "game.guide.speaker.duo", defaultValue: "Mee et Meo", bundle: .main)
        }
    }

    var body: some View {
        ProgressionCard(tint: MeeshyColors.brandPrimary) {
            HStack(alignment: .top, spacing: MeeshySpacing.md) {
                figures
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    header
                    if isShort {
                        Text(card.copy.short)
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        full
                    }
                    actions
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.guide.card")
    }

    // MARK: - Les figures

    private var figures: some View {
        let films = GameGuideCard.figures(speaker: card.speaker, mood: card.mood)
        return HStack(spacing: -10) {
            if let mee = films.meeFilmID { figure(mee, mirrored: false) }
            if let meo = films.meoFilmID { figure(meo, mirrored: true) }
        }
        .frame(width: films.meeFilmID != nil && films.meoFilmID != nil ? 96 : 64, alignment: .leading)
        .accessibilityHidden(true)
    }

    private func figure(_ id: String, mirrored: Bool) -> some View {
        let side: CGFloat = card.speaker == .duo ? 56 : 64
        return MeeStickerFilmView(filmID: id, animated: true, side: side, animates: !reduceMotion, pixelCap: 240)
            .scaleEffect(x: mirrored ? -1 : 1, y: 1)
            .frame(width: side, height: side)
    }

    // MARK: - Le texte

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xs) {
            Text(speakerName)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold))
                .textCase(.uppercase)
                .foregroundColor(MeeshyColors.brandPrimary)
            if let step = card.step {
                Text(String(
                    localized: "game.guide.step_of",
                    defaultValue: "Étape \(GameCopy.formatCount(step.index)) sur \(GameCopy.formatCount(step.total))",
                    bundle: .main
                ))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)
            }
            Spacer(minLength: 0)
            if card.presentation == .short && step == nil {
                Button {
                    HapticFeedback.light()
                    expanded.toggle()
                } label: {
                    Image(systemName: expanded ? "chevron.up.circle" : "questionmark.circle")
                        .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel(String(localized: "game.guide.more", defaultValue: "Voir l’explication complète", bundle: .main))
                .accessibilityIdentifier("game.guide.more")
            }
        }
    }

    private var step: GuideCard.Step? { card.step }

    @ViewBuilder
    private var full: some View {
        Text(card.copy.what)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
            .foregroundColor(theme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
        labeled(String(localized: "game.guide.means_label", defaultValue: "Ça veut dire", bundle: .main), card.copy.means)
        labeled(String(localized: "game.guide.next_label", defaultValue: "Ensuite", bundle: .main), card.copy.next)
    }

    private func labeled(_ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .semibold))
                .textCase(.uppercase)
                .foregroundColor(theme.textMuted)
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Les gestes

    private var actions: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            HStack(spacing: MeeshySpacing.sm) {
                Button {
                    HapticFeedback.light()
                    onAction()
                } label: {
                    Text(card.copy.action)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .frame(minHeight: 44)
                        .background(Capsule().fill(MeeshyColors.brandPrimary))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("game.guide.action")
                Button {
                    HapticFeedback.light()
                    onDismiss()
                } label: {
                    Text(card.step == nil
                        ? String(localized: "game.guide.dismiss", defaultValue: "Plus tard", bundle: .main)
                        : String(localized: "game.guide.skip", defaultValue: "Passer", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.sm)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("game.guide.dismiss")
            }
            if card.photo, let onPhoto {
                Button {
                    HapticFeedback.light()
                    onPhoto()
                } label: {
                    Label(String(localized: "game.guide.photo", defaultValue: "Immortaliser ce moment", bundle: .main), systemImage: "camera.fill")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(MeeshyColors.brandPrimary)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("game.guide.photo")
            }
            if card.step != nil, let onSkipAll {
                Button {
                    onSkipAll()
                } label: {
                    Text(String(localized: "game.guide.skip_all", defaultValue: "Passer l’intégration", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("game.guide.skip_all")
            }
        }
    }
}
