import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA PAGE « VITRINE » (#9387, conception II.9) — coupes de ligue, de saison, de Prestige et de Flamme, dans
/// l'ordre que la personne a rangé. Ranger = monter ou descendre d'un cran : deux boutons de 44 pt par coupe,
/// pas un glisser-déposer que ni VoiceOver ni le clavier ne savent faire. Le geste est optimiste (l'ordre
/// change tout de suite) avec retour arrière. Un trophée ne rapporte JAMAIS de points ni de Gloire : c'est un
/// objet reçu à un moment précis. La visibilité se règle ici (« amis » par défaut). Miroir de
/// `apps/web/src/components/game-showcase.tsx`.
struct GameShowcasePage: View {
    var body: some View {
        GamePageShell(title: GameText.showcaseTitle, identifier: "game.showcase.page") {
            GameWave2Host { model, game in
                GameShowcaseScreen(model: model, game: game)
            }
        }
    }
}

struct GameShowcaseScreen: View {
    @ObservedObject var model: GameWave2Model
    let game: GameBlock

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        if let trophies = game.trophies {
            let order = GameShowcaseRules.shelfOrder(trophies).filter { GameTrophyPresentation.of(key: $0) != nil }
            let awarded = Dictionary(trophies.items.map { ($0.key, $0.awardedAt) }, uniquingKeysWith: { first, _ in first })
            GameCard(title: GameText.showcaseTitle + " · " + GameText.doorShowcaseCount(count: order.count)) {
                if order.isEmpty {
                    GameNote(text: GameText.showcaseEmpty)
                } else {
                    GameNote(text: GameText.showcaseOrderHint)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: MeeshySpacing.lg) {
                        ForEach(Array(order.enumerated()), id: \.element) { index, key in
                            if let view = GameTrophyPresentation.of(key: key) {
                                trophyCell(view: view, index: index, count: order.count, awardedAt: awarded[key], order: order)
                            }
                        }
                    }
                }
                GameErrorLine(message: model.errors.order, identifier: "game.showcase.order.error")
                GameOfflineNote(online: model.isOnline)
            }
            .accessibilityIdentifier("game.showcase")

            GameCard(title: GameText.showcaseVisibility) {
                GameVisibilityPickerView(
                    legend: GameText.visibilityFieldShowcase,
                    value: game.visibility?.showcase ?? GameTrophies.defaultVisibility,
                    disabled: !model.isOnline, busy: model.pending.visibility
                ) { level in
                    Task { await model.setVisibility(showcase: level) }
                }
                GameNote(text: GameText.showcaseVisibilityHint)
                GameErrorLine(message: model.errors.visibility, identifier: "game.showcase.visibility.error")
                if model.pending.visibility { GameNote(text: GameText.visibilitySaving) }
            }
            .accessibilityIdentifier("game.showcase.visibility")
        } else {
            GameNote(text: GameText.unavailable)
        }
    }

    private func trophyCell(view: GameTrophyPresentation, index: Int, count: Int, awardedAt: String?, order: [String]) -> some View {
        VStack(spacing: MeeshySpacing.xs) {
            GameTrophyArt(view: view, height: 84)
            Text(view.title)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
            if let awardedAt {
                Text(GameText.showcaseAwarded(date: GameWave2Format.awardedDate(awardedAt)))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
            }
            HStack(spacing: MeeshySpacing.xs) {
                moveButton(symbol: "chevron.up", label: GameText.showcaseMoveUp(name: view.title), disabled: index == 0) {
                    Task { await model.saveOrder(GameShowcaseRules.moved(order, index: index, delta: -1)) }
                }
                moveButton(symbol: "chevron.down", label: GameText.showcaseMoveDown(name: view.title), disabled: index == count - 1) {
                    Task { await model.saveOrder(GameShowcaseRules.moved(order, index: index, delta: 1)) }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }

    /// Pendant qu'un ordre part, ranger est SUSPENDU sans être désactivé : le bouton que VoiceOver vient de
    /// presser garde le focus. Hors ligne, il est désactivé pour de bon.
    private func moveButton(symbol: String, label: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            guard !model.pending.order else { return }
            HapticFeedback.light()
            action()
        } label: {
            Image(systemName: symbol)
                .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous).fill(theme.textMuted.opacity(MeeshyOpacity.subtle)))
        }
        .buttonStyle(.plain)
        .disabled(disabled || !model.isOnline)
        .opacity(disabled || !model.isOnline || model.pending.order ? 0.5 : 1)
        .accessibilityLabel(label)
    }
}

/// Une coupe, dessinée (la brique du SDK) — DÉCORATIVE : son titre, lu à côté, dit ce qu'elle est. Le
/// Prestige y tient Mee et Meo couronnés.
struct GameTrophyArt: View {
    let view: GameTrophyPresentation
    let height: CGFloat

    var body: some View {
        TrophyView(material: view.material, label: view.plate, figures: view.kind == .prestige ? GameFigures.standard : nil)
            .frame(height: height)
            .accessibilityHidden(true)
    }
}
