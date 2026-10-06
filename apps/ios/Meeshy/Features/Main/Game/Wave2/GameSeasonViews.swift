import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA PAGE « SAISON » (#9386, conception II.7) — huit semaines, un thème (une langue), quarante étapes
/// GRATUITES, une rangée Sceau cosmétique. Les étoiles viennent des missions du jour et du duo ; quatre
/// étoiles ouvrent une étape. Miroir de `apps/web/src/components/game-season.tsx`.
///
/// RIEN N'Y RAPPORTE DE L'ARGENT (conformité C-1) : le Sceau se prend en Meeshes (10) et reste décoratif ; il
/// ne change rien au jeu. Chaque étape dit son état par le TEXTE (réclamée, à réclamer, à venir), pas
/// seulement par la couleur. Toucher une étape à réclamer la réclame ; le bouton nomme la prochaine.
///
/// Aucune saison ouverte (`season` absente) est une VALEUR, pas une panne : la prochaine commence bientôt.
struct GameSeasonPage: View {
    var body: some View {
        GamePageShell(title: GameText.seasonTitle, identifier: "game.season.page") {
            GameWave2Host { model, game in
                GameSeasonScreen(model: model, game: game)
            }
        }
    }
}

struct GameSeasonScreen: View {
    @ObservedObject var model: GameWave2Model
    let game: GameBlock

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            if let season = game.season {
                GameSeasonHeader(season: season)
                GameSeasonPath(model: model, season: season)
                GameSeasonSeal(model: model, season: season, held: game.treasury.held)
            } else {
                GameCard(title: GameText.seasonTitle) {
                    GameNote(text: GameText.seasonNone)
                }
                .accessibilityIdentifier("game.season.none")
            }
        }
    }
}

// MARK: - L'en-tête : où j'en suis

private struct GameSeasonHeader: View {
    let season: GameSeasonBlock

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        let stepsLine = GameText.seasonStepsLine(steps: GameCopy.formatCount(season.steps), total: GameCopy.formatCount(season.stepsTotal))
        GameCard(tint: MeeshyColors.brandPrimary, title: GameText.seasonHeading(
            number: GameCopy.formatCount(season.number), week: GameCopy.formatCount(season.week),
            total: GameCopy.formatCount(GameSeason.weeks))) {
            if let theme = GameWave2Format.seasonTheme(season.themeKey) {
                Text(GameText.seasonTheme(theme: theme))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
            }
            Text(GameText.seasonStars(count: season.stars) + " · " + stepsLine)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(self.theme.textPrimary)
            GameProgressBar(value: Double(season.steps) / Double(max(1, season.stepsTotal)), tint: MeeshyColors.brandPrimary, label: stepsLine)
            if season.completed {
                GameNote(text: GameText.seasonCompleted, tone: MeeshyColors.success)
            } else {
                GameNote(text: GameText.seasonToNext(stars: GameText.seasonStars(count: season.starsToNext)))
            }
            GameNote(text: GameText.seasonHow(per: GameCopy.formatCount(GameSeason.starsPerStep)))
        }
        .accessibilityIdentifier("game.season.header")
    }
}

// MARK: - Le parcours : quarante étapes

private struct GameSeasonPath: View {
    @ObservedObject var model: GameWave2Model
    let season: GameSeasonBlock

    private let columns = Array(repeating: GridItem(.flexible(), spacing: MeeshySpacing.xsPlus), count: 5)

    var body: some View {
        GameCard(title: GameText.seasonPath) {
            if let next = season.nextReward {
                GameActionButton(
                    title: GameText.seasonClaim(step: GameCopy.formatCount(next.step)) + " · "
                        + GameText.seasonRewardLabel(SeasonReward(kind: next.reward.kind, amount: next.reward.amount)),
                    busy: model.pending.claimingStep != nil, disabled: !model.isOnline,
                    tint: MeeshyColors.brandPrimary, identifier: "game.season.claim"
                ) {
                    Task { await model.claim(step: next.step) }
                }
            }
            GameErrorLine(message: model.errors.claim, identifier: "game.season.claim.error")
            LazyVGrid(columns: columns, spacing: MeeshySpacing.xsPlus) {
                ForEach(1...GameSeason.steps, id: \.self) { step in
                    GameSeasonStepButton(
                        step: step, state: GameSeasonStepState.of(step: step, in: season), online: model.isOnline,
                        busy: model.pending.claimingStep == step
                    ) {
                        Task { await model.claim(step: step) }
                    }
                }
            }
            GameOfflineNote(online: model.isOnline)
        }
        .accessibilityIdentifier("game.season.path")
    }
}

/// UNE ÉTAPE (44 pt) : son état est dit par un mot, jamais par la seule couleur. Réclamée ✓, à réclamer
/// (bouton), à venir (éteinte) ; les récompenses spéciales — fragment, gel, coupe — portent leur marque.
private struct GameSeasonStepButton: View {
    let step: Int
    let state: GameSeasonStepState
    let online: Bool
    let busy: Bool
    let onClaim: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    private var tint: Color {
        switch state {
        case .claimed: MeeshyColors.success
        case .ready: MeeshyColors.brandPrimary
        case .locked: theme.textMuted
        }
    }

    private var reward: SeasonReward? { GameSeason.stepReward(step) }

    private var mark: String {
        if state == .claimed { return "✓" }
        switch reward?.kind {
        case .fragment?: return "◆"
        case .freeze?: return "✦"
        case .seasonCup?: return "★"
        default: return " "
        }
    }

    private var spoken: String {
        let rewardText = reward.map { GameText.seasonRewardLabel($0) } ?? ""
        return GameText.seasonStep(step: GameCopy.formatCount(step)) + ", " + GameText.seasonStepState(state) + ", " + rewardText
    }

    var body: some View {
        Button {
            guard state == .ready, online, !busy else { return }
            HapticFeedback.light()
            onClaim()
        } label: {
            VStack(spacing: 0) {
                Text(GameCopy.formatCount(step))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                Text(mark)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
            }
            .foregroundColor(tint)
            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .fill(state == .locked ? Color.clear : tint.opacity(state == .ready ? MeeshyOpacity.light : MeeshyOpacity.subtle))
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .stroke(tint.opacity(state == .locked ? MeeshyOpacity.medium : MeeshyOpacity.strong), lineWidth: MeeshyBorder.regular)
            )
        }
        .buttonStyle(.plain)
        .disabled(state != .ready || !online || busy)
        .opacity(busy ? 0.6 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
        .accessibilityAddTraits(state == .ready ? .isButton : [])
        .accessibilityIdentifier("game.season.step.\(step)")
    }
}

// MARK: - La rangée Sceau

/// La rangée SCEAU (10 Meeshes) : un cosmétique toutes les quatre étapes, SANS AUCUN avantage de jeu. Elle se
/// prend en Meeshes — jamais en argent — et dit ce qui manque quand le solde ne suffit pas.
private struct GameSeasonSeal: View {
    @ObservedObject var model: GameWave2Model
    let season: GameSeasonBlock
    let held: Int

    private var theme: ThemeManager { ThemeManager.shared }

    private var sealSteps: [Int] {
        Array(stride(from: GameSeason.sealEvery, through: GameSeason.steps, by: GameSeason.sealEvery))
    }

    var body: some View {
        GameCard(title: GameText.seasonSealTitle) {
            GameNote(text: GameText.seasonSealBody(every: GameCopy.formatCount(GameSeason.sealEvery)))
            // Dix pastilles ne tiennent pas sur une ligne d'iPhone : deux rangées de cinq, comme le parcours.
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: MeeshySpacing.xsPlus), count: 5), spacing: MeeshySpacing.sm) {
                ForEach(sealSteps, id: \.self) { step in
                    sealMark(step)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(GameText.seasonSealCosmetic)
            if season.sealOwned {
                GameNote(text: GameText.seasonSealOwned, tone: MeeshyColors.success)
            } else {
                let cannotPay = held < season.sealPrice
                GameActionButton(
                    title: GameText.seasonSealBuy(price: GameCopy.meeshes(season.sealPrice)), busy: model.pending.seal,
                    disabled: !model.isOnline || cannotPay, tint: MeeshyColors.warning, identifier: "game.season.seal.buy"
                ) {
                    Task { await model.buySeal() }
                }
                if cannotPay { GameNote(text: GameText.seasonSealMissing) }
            }
            GameErrorLine(message: model.errors.seal, identifier: "game.season.seal.error")
        }
        .accessibilityIdentifier("game.season.seal")
    }

    /// Une pastille de la rangée : allumée quand le Sceau est possédé ET l'étape atteinte.
    private func sealMark(_ step: Int) -> some View {
        let lit = season.sealOwned && step <= season.steps
        return VStack(spacing: MeeshySpacing.xxs) {
            SignatureMark(style: lit ? .engraved : .flat, color: lit ? GameMaterial.gold.ink : theme.textMuted)
                .frame(width: 30, height: 30)
                .padding(MeeshySpacing.xs)
                .background(Circle().fill(lit ? AnyShapeStyle(GameMaterial.gold.gradient) : AnyShapeStyle(theme.textMuted.opacity(MeeshyOpacity.subtle))))
            Text(GameCopy.formatCount(step))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }
}
