import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA FLAMME : GELS ET RALLUMAGE (#9383) — ce qu'on fait de ses Meeshes pour la
/// protéger. Un gel couvre un jour manqué (deux en réserve au plus, 1 Meesh
/// chacun) ; une Flamme éteinte se rallume sous 48 h, une fois par mois, pour 3
/// Meeshes. Les prix et les bornes viennent du bloc `game` : cette vue n'en
/// connaît aucun. Miroir de `apps/web/src/components/game-flame-panel.tsx`.
///
/// Un bouton qui ne peut pas servir se TAIT en disant pourquoi (réserve pleine,
/// pas assez de Meeshes, hors ligne) ; il ne reste pas grisé sans explication. Une
/// Flamme trop longtemps éteinte ne propose rien : elle annonce qu'une nouvelle
/// commence au prochain geste.
struct GameFlamePanelView: View {
    let game: GameBlock
    let online: Bool
    let buyingFreeze: Bool
    let relighting: Bool
    let errors: GameErrors
    let onBuyFreeze: () -> Void
    let onRelight: () -> Void

    private var flame: GameBlock.Flame { game.flame }
    private var held: Int { game.treasury.held }
    private var isOut: Bool { flame.status == .out }
    private var cannotPayRelight: Bool { held < flame.relightPrice }

    var body: some View {
        GameCard(anchor: .flamePanel, title: String(localized: "game.flame_panel.title", defaultValue: "Protéger la Flamme", bundle: .main)) {
            GameNote(text: String(
                localized: "game.flame_panel.bonus",
                defaultValue: "+\(GameCopy.formatCount(GameFlame.bonusPercentPerDay)) % par jour de série sur les récompenses de mission, jusqu’à +\(GameCopy.formatCount(GameFlame.bonusPercentMax)) %.",
                bundle: .main
            ))
            Text(String(
                localized: "game.flame_panel.freezes",
                defaultValue: "Gels en réserve : \(GameCopy.formatCount(flame.freezes)) / \(GameCopy.formatCount(flame.maxFreezes))",
                bundle: .main
            ))
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            .foregroundColor(ThemeManager.shared.textPrimary)
            freezeSection
            GameErrorLine(message: errors.freeze, identifier: "game.flame.freeze.error")
            relightSection
            if !online {
                GameNote(text: String(
                    localized: "game.flame_panel.offline",
                    defaultValue: "Hors ligne : les gels et le rallumage reprendront avec la connexion.",
                    bundle: .main
                ))
            }
        }
    }

    @ViewBuilder
    private var freezeSection: some View {
        if flame.freezes >= flame.maxFreezes {
            GameNote(text: String(
                localized: "game.flame_panel.freeze_full",
                defaultValue: "Réserve pleine : un gel couvre un jour manqué, tu n’en as pas besoin d’un de plus.",
                bundle: .main
            ))
        } else {
            GameActionButton(
                title: String(
                    localized: "game.flame_panel.freeze_buy",
                    defaultValue: "Acheter un gel · \(GameCopy.meeshes(flame.freezePrice))",
                    bundle: .main
                ),
                busy: buyingFreeze, disabled: !online || held < flame.freezePrice, identifier: "game.flame.freeze.buy",
                action: onBuyFreeze
            )
            if held < flame.freezePrice {
                GameNote(text: String(
                    localized: "game.flame_panel.freeze_missing",
                    defaultValue: "Il te faut \(GameCopy.meeshes(flame.freezePrice)) pour un gel.",
                    bundle: .main
                ))
            }
        }
    }

    @ViewBuilder
    private var relightSection: some View {
        if isOut && flame.canRelight {
            GameNote(text: String(
                localized: "game.flame_panel.relight_intro",
                defaultValue: "Ta Flamme s’est éteinte : rallume-la maintenant, elle repart là où elle s’était arrêtée.",
                bundle: .main
            ))
            GameActionButton(
                title: String(
                    localized: "game.flame_panel.relight",
                    defaultValue: "Rallumer la Flamme · \(GameCopy.meeshes(flame.relightPrice))",
                    bundle: .main
                ),
                busy: relighting, disabled: !online || cannotPayRelight, identifier: "game.flame.relight", action: onRelight
            )
            if cannotPayRelight {
                GameNote(text: String(
                    localized: "game.flame_panel.relight_missing",
                    defaultValue: "Il te faut \(GameCopy.meeshes(flame.relightPrice)) pour la rallumer.",
                    bundle: .main
                ))
            }
            GameErrorLine(message: errors.relight, identifier: "game.flame.relight.error")
        } else if isOut && cannotPayRelight {
            GameNote(text: String(
                localized: "game.flame_panel.relight_missing_window",
                defaultValue: "Il te faut \(GameCopy.meeshes(flame.relightPrice)) pour la rallumer, si elle s’est éteinte il y a moins de 48 h.",
                bundle: .main
            ))
        } else if isOut {
            GameNote(
                text: String(
                    localized: "game.flame_panel.relight_closed",
                    defaultValue: "Cette Flamme ne peut plus être rallumée. Une nouvelle Flamme commence dès ton prochain geste.",
                    bundle: .main
                ),
                tone: MeeshyColors.brandPrimary
            )
        }
    }
}
