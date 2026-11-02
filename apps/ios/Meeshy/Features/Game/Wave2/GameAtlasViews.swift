import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'ATLAS DES LANGUES (#9388, conception II.8) — le passeport. Chaque langue avec laquelle on a VRAIMENT
/// échangé (un message envoyé ET un reçu avec quelqu'un qui l'écrit) pose un tampon ; les échanges à moitié
/// faits se disent à part (un sens manque), et le reste est « à découvrir ». Miroir de
/// `apps/web/src/components/game-atlas.tsx`.
///
/// PRIVÉ PAR DÉFAUT (conformité E-1, E-2) : une langue minoritaire, diasporique ou liturgique peut révéler une
/// origine ou une conviction. L'écran le dit en toutes lettres et porte le choix de qui le voit ; l'Atlas
/// n'entre dans AUCUNE liste ni aucun tri servi à autrui. Ni l'interlocuteur ni la conversation ne sont
/// gardés : seulement la langue, les deux sens et la date. Les noms de langues viennent de la locale de
/// l'appareil — jamais un catalogue de deux cents noms écrit à la main.
struct GameAtlasPage: View {
    var body: some View {
        GamePageShell(title: GameText.atlasTitle, identifier: "game.atlas.page") {
            GameWave2Host { model, game in
                GameAtlasScreen(model: model, game: game)
            }
        }
    }
}

struct GameAtlasScreen: View {
    @ObservedObject var model: GameWave2Model
    let game: GameBlock

    private var theme: ThemeManager { ThemeManager.shared }

    /// Au plus trois pastilles « à découvrir » : le reste se COMPTE, il ne se dessine pas.
    private static let placeholders = 3

    var body: some View {
        if let atlas = game.atlas {
            let remaining = max(0, atlas.total - atlas.stamped)
            header(atlas)
            stamps(atlas, remaining: remaining)
            if !atlas.pending.isEmpty { pending(atlas) }
            privacy
        } else {
            GameNote(text: GameText.unavailable)
        }
    }

    private func tint(_ code: String) -> Color {
        LanguageData.info(for: code).map { Color(hex: $0.colorHex) } ?? MeeshyColors.brandPrimary
    }

    // MARK: Le passeport

    private func header(_ atlas: GameAtlasBlock) -> some View {
        let count = GameText.atlasCount(stamped: GameCopy.formatCount(atlas.stamped), total: GameCopy.formatCount(atlas.total))
        return GameCard(tint: MeeshyColors.brandPrimary, title: GameText.atlasTitle) {
            Text(count)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
            GameProgressBar(value: Double(atlas.stamped) / Double(max(1, atlas.total)), tint: MeeshyColors.brandPrimary, label: count)
            GameNote(text: GameText.atlasIntro)
        }
        .accessibilityIdentifier("game.atlas.header")
    }

    // MARK: Les tampons

    private func stamps(_ atlas: GameAtlasBlock, remaining: Int) -> some View {
        GameCard(title: GameText.atlasStamps) {
            if atlas.stamps.isEmpty { GameNote(text: GameText.atlasEmpty) }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: MeeshySpacing.lg) {
                ForEach(Array(atlas.stamps.enumerated()), id: \.element.language) { index, stamp in
                    VStack(spacing: MeeshySpacing.xxs) {
                        AtlasStampView(code: stamp.language, tint: tint(stamp.language), state: .stamped,
                                       tilt: index % 2 == 0 ? -6 : 8, muted: theme.textMuted)
                            .frame(width: 64, height: 64)
                            .accessibilityHidden(true)
                        Text(GameWave2Format.languageName(stamp.language))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .multilineTextAlignment(.center)
                        Text(GameText.atlasStampedOn(date: GameWave2Format.day(stamp.stampedOn)))
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                            .foregroundColor(theme.textMuted)
                            .multilineTextAlignment(.center)
                    }
                    .accessibilityElement(children: .combine)
                    // Un tampon SE TOUCHE (#9564) : il rebondit et ouvre ses précisions.
                    .gameElement(GameElementDetails.stamp(stamp))
                }
                ForEach(0..<min(Self.placeholders, remaining), id: \.self) { _ in
                    AtlasStampView(code: "", tint: theme.textMuted, state: .undiscovered, muted: theme.textMuted)
                        .frame(width: 64, height: 64)
                        .accessibilityHidden(true)
                }
            }
            if remaining > 0 {
                GameNote(text: GameText.atlasRemaining(remaining: GameCopy.formatCount(remaining)))
            }
        }
        .accessibilityIdentifier("game.atlas.stamps")
    }

    // MARK: Les échanges à moitié faits

    private func pending(_ atlas: GameAtlasBlock) -> some View {
        GameCard(title: GameText.atlasPending) {
            VStack(spacing: MeeshySpacing.xs) {
                ForEach(atlas.pending, id: \.language) { entry in
                    HStack(spacing: MeeshySpacing.md) {
                        AtlasStampView(code: entry.language, tint: tint(entry.language), state: .pending, muted: theme.textMuted)
                            .frame(width: 36, height: 36)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                            Text(GameWave2Format.languageName(entry.language))
                                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                                .foregroundColor(theme.textPrimary)
                            Text(entry.sent ? GameText.atlasPendingSent : GameText.atlasPendingReceived)
                                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                                .foregroundColor(theme.textMuted)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .accessibilityElement(children: .combine)
                    .gameElement(GameElementDetails.pendingStamp(entry))
                }
            }
        }
        .accessibilityIdentifier("game.atlas.pending")
    }

    // MARK: Qui voit

    private var privacy: some View {
        GameCard(title: GameText.atlasVisibility) {
            GameVisibilityPickerView(
                legend: GameText.visibilityFieldAtlas,
                value: game.visibility?.atlas ?? GameTrophies.atlasDefaultVisibility,
                disabled: !model.isOnline, busy: model.pending.visibility
            ) { level in
                Task { await model.setVisibility(atlas: level) }
            }
            GameNote(text: GameText.atlasPrivacy)
            GameErrorLine(message: model.errors.visibility, identifier: "game.atlas.visibility.error")
            GameOfflineNote(online: model.isOnline)
        }
        .accessibilityIdentifier("game.atlas.privacy")
    }
}
