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
/// pas assez de Meeshes, hors ligne) ; il ne reste pas grisé sans explication.
/// Avant chaque achat, la rangée de dépense (#9705) dit les Meeshes en poche, le
/// prix et ce qui restera — ou combien il en manque. Une
/// Flamme trop longtemps éteinte ne propose rien : elle annonce qu'une nouvelle
/// commence au prochain geste.
///
/// Deux rêves complets la rallument aussi, sans payer (#20455) : tant que le bloc sert `effortRelight`, le panneau
/// dit combien en manquent et jusqu'à quand (#20473) — même quand une nouvelle Flamme a repris, puisque c'est en
/// jouant qu'on les réalise — et ne dit plus qu'elle ne peut plus être rallumée.
struct GameFlamePanelView: View {
    let game: GameBlock
    let online: Bool
    let buyingFreeze: Bool
    let relighting: Bool
    let errors: GameErrors
    let onBuyFreeze: () -> Void
    let onRelight: () -> Void
    @State private var openNoteID: String?

    private var flame: GameBlock.Flame { game.flame }
    private var held: Int { game.treasury.held }
    private var isOut: Bool { flame.status == .out }
    var freezeSpend: SpendPreview { GameSpend.preview(held: held, cost: flame.freezePrice) }
    var relightSpend: SpendPreview { GameSpend.preview(held: held, cost: flame.relightPrice) }
    private var cannotPayRelight: Bool { !relightSpend.affordable }

    /// La phrase du rallumage par l'effort, `nil` quand le bloc ne le sert pas (#20473).
    static func effortRelightLine(_ flame: GameBlock.Flame) -> String? {
        flame.effortRelight.map { GameCopy.effortRelight($0) }
    }

    /// « Ne peut plus être rallumée » se tait tant que l'effort la rallume encore (#20473).
    static func saysRelightClosed(_ flame: GameBlock.Flame, cannotPayRelight: Bool) -> Bool {
        flame.status == .out && !flame.canRelight && !cannotPayRelight && flame.effortRelight == nil
    }

    /// `missing` : ce qu'il manque, dit avec le geste qu'il vise — acheter un gel, rallumer la Flamme (#10540).
    private func spendRow(_ spend: SpendPreview, identifier: String, missing: @MainActor (String) -> String) -> some View {
        GameFactChipRow(concept: .flame, items: GameSpendRows.spend(spend, format: GameCopy.meeshes, missing: missing), identifier: identifier)
    }

    /// La valeur est au repos, nommée par ce qu'elle augmente (« +10 % d'étincelles »), la règle qui la produit derrière un (i) : « Que rapporte ma Flamme ? ».
    private var bonusNote: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "game.flame_panel.bonus.question", defaultValue: "Que rapporte ma Flamme ?", bundle: .main),
            text: String(
                localized: "game.flame_panel.bonus",
                defaultValue: "Chaque jour de Flamme nourrit tes rêves : +\(GameCopy.formatCount(GameFlame.bonusPercentPerDay)) % d’étincelles par acte, jusqu’à +\(GameCopy.formatCount(GameFlame.bonusPercentMax)) %.",
                bundle: .main
            )
        )
    }

    var body: some View {
        GameCard(anchor: .flamePanel, title: String(localized: "game.flame_panel.title", defaultValue: "Veiller sur ta Flamme", bundle: .main)) {
            MeeshyInfoNoted(note: bonusNote, openNoteID: $openNoteID, tint: ThemeManager.shared.textMuted) {
                Text(String(
                    localized: "game.flame_panel.bonus_chip",
                    defaultValue: "+\(GameCopy.formatCount(min(100, max(0, flame.bonusPercent)))) % d’étincelles",
                    bundle: .main
                ))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(ThemeManager.shared.textPrimary)
                .accessibilityIdentifier("game.flame.bonus")
            }
            Text(String(
                localized: "game.flame_panel.freezes",
                defaultValue: "Veilleuses : \(GameCopy.formatCount(flame.freezes)) / \(GameCopy.formatCount(flame.maxFreezes))",
                bundle: .main
            ))
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            .foregroundColor(ThemeManager.shared.textPrimary)
            freezeSection
            GameErrorLine(message: errors.freeze, identifier: "game.flame.freeze.error")
            if let effortLine = Self.effortRelightLine(flame) {
                Text(effortLine)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundStyle(ThemeManager.shared.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("game.flame.effortRelight")
            }
            relightSection
            if !online {
                GameNote(text: String(
                    localized: "game.flame_panel.offline",
                    defaultValue: "Hors ligne : les Veilleuses et le rallumage reprendront avec la connexion.",
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
                defaultValue: "Tes Veilleuses sont au complet.",
                bundle: .main
            ))
        } else {
            spendRow(freezeSpend, identifier: "game.flame.freeze.spend", missing: { ConceptText.spendMissingFreeze(missing: $0) })
            GameActionButton(
                title: String(
                    localized: "game.flame_panel.freeze_buy",
                    defaultValue: "Prendre une Veilleuse · \(GameCopy.meeshes(flame.freezePrice))",
                    bundle: .main
                ),
                busy: buyingFreeze, disabled: !online || !freezeSpend.affordable, identifier: "game.flame.freeze.buy",
                action: onBuyFreeze
            )
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
            spendRow(relightSpend, identifier: "game.flame.relight.spend", missing: { ConceptText.spendMissingRelight(missing: $0) })
            GameActionButton(
                title: String(
                    localized: "game.flame_panel.relight",
                    defaultValue: "Rallumer la Flamme · \(GameCopy.meeshes(flame.relightPrice))",
                    bundle: .main
                ),
                busy: relighting, disabled: !online || cannotPayRelight, identifier: "game.flame.relight", action: onRelight
            )
            GameErrorLine(message: errors.relight, identifier: "game.flame.relight.error")
        } else if isOut && cannotPayRelight {
            GameNote(text: String(
                localized: "game.flame_panel.relight_missing_window",
                defaultValue: "Rallumage possible dans les 48 h qui suivent l’extinction.",
                bundle: .main
            ))
            spendRow(relightSpend, identifier: "game.flame.relight.spend", missing: { ConceptText.spendMissingRelight(missing: $0) })
        } else if Self.saysRelightClosed(flame, cannotPayRelight: cannotPayRelight) {
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
