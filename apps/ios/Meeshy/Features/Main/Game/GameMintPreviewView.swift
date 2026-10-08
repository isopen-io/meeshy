import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE HÉRO DE FRAPPE (#9383, #9537) — le SEUL de l'écran : un titre, un chiffre fort, une action. Il remplace
/// l'aperçu bavard ET le bloc « Comment frapper » du héro de niveau, qui disaient deux fois la même chose.
///
/// Conception, partie VII : « la frappe garde son aperçu » — mais court. Le prix est LE chiffre ; les deux
/// conséquences qu'on ne peut pas ignorer tiennent en pastilles (le niveau avant → après, la Gloire gagnée et le rang
/// qui change), plus les badges qui redescendent QUAND il y en a. La frappe fait redescendre, c'est la règle, et une règle
/// qu'on découvre après coup est un piège. Le reste — le trésor, le Vent arrière, les chances — est au carnet des
/// règles (la porte « ? »). Miroir de `apps/web/src/components/game-mint-preview.tsx`.
///
/// Quand la frappe n'est pas possible : aucun bouton grisé (directive du porteur,
/// `EngagementMeeshProgress.canMint`), seulement ce qui manque et le prix de la
/// prochaine. Un aperçu qui promettrait un « avant → après » pour un geste
/// impossible mentirait.
///
/// La scène (`MintStrikeScene`) montre la pièce au repos, face avers ; la frappe
/// confirmée par la passerelle la joue (1,2 s) et la laisse sur son revers
/// numéroté. `badgesLost` est ABSENT quand le serveur ne sert pas de quoi le
/// calculer (`GameMintBadgeImpact`) : « inconnu » ne se dit pas « aucun ».
struct GameMintPreviewView: View {
    let game: GameBlock
    /// Les badges que la frappe éteindrait ; `nil` quand le serveur ne sert pas de quoi le calculer.
    var badgesLost: Int?
    let online: Bool
    let minting: Bool
    let error: String?
    let celebration: MintCelebration?
    let onMint: () -> Void
    /// Ouvre la règle de la frappe au carnet (« ? ») ; `nil` : pas de porte.
    var onOpenRule: (() -> Void)?
    var haptics: GameHapticsProviding = GameHaptics.shared

    private var theme: ThemeManager { ThemeManager.shared }
    private var mint: GameMintPreview { game.mint }

    private var afterStanding: GloryStanding {
        GameGlory.standing(glory: game.glory.glory + mint.gloryGained, mythic: game.glory.rank == .mythe)
    }

    private var rankChanges: Bool {
        afterStanding.rank != game.glory.rank || afterStanding.division5 != game.glory.shownDivision
    }

    var body: some View {
        GameCard(tint: MeeshyColors.warning, anchor: .mint) {
            header
            if let celebration {
                Text(String(
                    localized: "game.mint.minted_line",
                    defaultValue: "Meesh n° \(GameCopy.formatCount(celebration.number)) frappée, \(GameCopy.editionName(celebration.edition)).",
                    bundle: .main
                ))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundColor(MeeshyColors.brandPrimary)
                .accessibilityAddTraits(.updatesFrequently)
                .accessibilityIdentifier("game.mint.celebration")
            }
            if mint.canMint {
                consequences
                GameActionButton(
                    title: String(localized: "game.mint.action", defaultValue: "Frapper avec Mee et Meo", bundle: .main),
                    busyTitle: String(localized: "game.mint.minting", defaultValue: "Frappe en cours…", bundle: .main),
                    busy: minting, disabled: !online, identifier: minting ? "game.mint.minting" : "game.mint.action",
                    action: onMint
                )
                if !online {
                    GameNote(text: String(localized: "game.mint.offline", defaultValue: "Hors ligne : la frappe reprendra avec la connexion.", bundle: .main))
                }
            } else {
                GameNote(text: String(
                    localized: "game.mint.missing",
                    defaultValue: "Encore \(GameCopy.convertiblePoints(mint.missingPoints)) avant la prochaine Meesh : elle coûte \(GameCopy.points(mint.price)).",
                    bundle: .main
                ))
                .accessibilityIdentifier("game.mint.missing")
            }
            if !minting {
                GameErrorLine(message: error, identifier: "game.mint.error")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.mint.hero")
        .adaptiveOnChange(of: celebration?.key) { _, key in
            if key != nil { haptics.play(GameHapticPattern.strike) }
        }
    }

    // MARK: - Le titre, le chiffre fort, la porte du carnet

    private var header: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            MintStrikeScene(
                edition: celebration?.edition ?? mint.edition,
                number: celebration?.number ?? mint.number,
                year: Calendar.current.component(.year, from: Date()),
                play: celebration?.key ?? 0,
                coinSide: 56,
                restsReversed: celebration != nil
            )
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(String(
                    localized: "game.mint.next_title",
                    defaultValue: "Prochaine Meesh · n° \(GameCopy.formatCount(mint.number))",
                    bundle: .main
                ))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                Text(GameCopy.points(mint.price))
                    .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .accessibilityIdentifier("game.mint.price")
            }
            Spacer(minLength: 0)
            if let onOpenRule {
                Button {
                    HapticFeedback.light()
                    onOpenRule()
                } label: {
                    Image(systemName: "questionmark.circle")
                        .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "game.hero.mint.info", defaultValue: "Lire la règle de la frappe", bundle: .main))
                .accessibilityIdentifier("game.mint.info")
            }
        }
    }

    // MARK: - Ce que le geste coûte, en pastilles

    /// Le niveau avant → après, la Gloire gagnée (et le rang qui change), les badges qui redescendent — jamais un tableau.
    private var consequences: some View {
        FlowLayout(spacing: MeeshySpacing.xs) {
            GameChip(
                text: String(localized: "game.mint.chip.level", defaultValue: "Niveau \(levelValue)", bundle: .main),
                tint: MeeshyColors.brandPrimary
            )
            GameChip(
                text: String(localized: "game.mint.chip.glory", defaultValue: "+\(GameCopy.formatCount(mint.gloryGained)) Gloire", bundle: .main),
                tint: MeeshyColors.success
            )
            if rankChanges {
                GameChip(
                    text: "\(GameCopy.rankLabel(game.glory)) → \(GameCopy.rankLabel(afterStanding.rank, division5: afterStanding.division5))",
                    tint: MeeshyColors.success
                )
            }
            if let badgesLost, badgesLost > 0 {
                GameChip(text: badgesLine(badgesLost), tint: MeeshyColors.warning)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.mint.consequences")
    }

    private func badgesLine(_ lost: Int) -> String {
        let number = GameCopy.formatCount(lost)
        return GameCopy.isSingular(lost)
            ? String(localized: "game.mint.badges.one", defaultValue: "\(number) badge redescend", bundle: .main)
            : String(localized: "game.mint.badges.other", defaultValue: "\(number) badges redescendent", bundle: .main)
    }

    /// Les niveaux de la frappe lus sur la VÉRITÉ (`shownLevels`, #9688) : au-delà de 100, les champs d'hier mentiraient.
    private var levelValue: String {
        let levels = mint.shownLevels
        let base = "\(GameCopy.formatCount(levels.levelBefore)) → \(GameCopy.formatCount(levels.levelAfter))"
        return levels.levelsLost > 0 ? base + " (−\(GameCopy.formatCount(levels.levelsLost)))" : base
    }
}
