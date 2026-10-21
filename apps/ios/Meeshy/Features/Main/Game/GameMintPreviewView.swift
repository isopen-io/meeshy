import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE HÉRO DE FRAPPE (#9383, #9537) — le SEUL de l'écran : un titre, un chiffre fort, une action. Il remplace
/// l'aperçu bavard ET le bloc « Comment frapper » du héro de niveau, qui disaient deux fois la même chose.
///
/// Conception, partie VII : « la frappe garde son aperçu » — mais court. Le prix est LE chiffre ; les deux
/// conséquences qu'on ne peut pas ignorer tiennent en pastilles (le niveau avant → après QUAND la frappe en coûte — la
/// poche fait le niveau, #10892 —, la Gloire gagnée et le rang qui change). La frappe fait baisser le niveau, c'est la
/// règle, et une règle qu'on découvre après coup est un piège. Le reste — le trésor, le Vent arrière, les chances — est
/// au carnet des règles (la porte « ? »). Miroir de `apps/web/src/components/game-mint-preview.tsx`.
///
/// Quand la frappe n'est pas possible : aucun bouton grisé (directive du porteur,
/// `EngagementMeeshProgress.canMint`), seulement ce qui manque et le prix de la
/// prochaine. Un aperçu qui promettrait un « avant → après » pour un geste
/// impossible mentirait.
///
/// La scène (`MintStrikeScene`) montre la pièce au repos, face avers ; la frappe
/// confirmée par la passerelle la joue (1,2 s) et la laisse sur son revers
/// numéroté. Depuis les étincelles (#10845), la frappe n'éteint plus aucun badge : aucune pastille ne le prédit.
///
/// AVANT le geste, la rangée de dépense (#9705) dit les points en poche, les points À CONVERTIR, le prix et ce qui
/// restera — ou, frappe impossible, les points à convertir qui manquent, dits avec leur cible (« pour la Meesh
/// n° 79 », #10540) : la frappe se retranche du score, mais seuls les points à convertir la paient, et le verdict
/// reste celui du serveur (`mint.canMint`).
struct GameMintPreviewView: View {
    let game: GameBlock
    /// Les points À CONVERTIR servis par le porte-monnaie (#10540). Absents : une frappe impossible les dit (le prix
    /// moins le manque) ; possible, ils restent tus plutôt que devinés depuis le score.
    var convertible: Int?
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

    /// Ce que la frappe dépense, lu sur la loi (`GameSpend`) : la part qui paie est celle que le serveur a jugée.
    var spend: SpendPreview {
        GameSpend.preview(
            held: game.level.sparkFacts.pocket, cost: mint.price,
            spendable: mint.canMint ? mint.price : mint.price - mint.missingPoints
        )
    }

    /// La rangée de dépense : En poche · À convertir · Coûte · Restera — ou la phrase du manque, qui nomme la pièce.
    var spendItems: [GameFactChipItem] {
        let toConvert: Int? = convertible ?? (mint.canMint ? nil : max(0, mint.price - mint.missingPoints))
        let number = GameCopy.formatCount(mint.number)
        return GameSpendRows.spend(
            spend, format: GameCopy.points, formatMissing: GameCopy.convertiblePoints, heldFact: .score, missingFact: .mintMissing,
            between: toConvert.map { GameFactChipItem(label: ConceptText.factToConvert, value: GameCopy.points($0), detail: .convertible) },
            missing: { ConceptText.spendMissingMint(missing: $0, number: number) }
        )
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
            GameFactChipRow(concept: .meesh, items: spendItems, identifier: "game.mint.spend")
            // La dette, puis la réserve fermée par le rang (#10848) : la frappe ne se tente pas, l'écran dit pourquoi.
            if let blocker = GameMintCostCopy.blockerMessage(mint) {
                GameNote(text: blocker)
                    .accessibilityIdentifier("game.mint.blocked")
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
                    defaultValue: "La Meesh n° \(GameCopy.formatCount(mint.number))",
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
                // Le coût EFFECTIF (#10847) : d'où vient le prix quand le niveau l'a réduit.
                if let costLine = GameMintCostCopy.costLine(mint) {
                    Text(costLine)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("game.mint.cost")
                }
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

    /// Le niveau que la frappe fait perdre (la poche fait le niveau, #10892), la Gloire gagnée et le rang qui change —
    /// jamais un tableau.
    private var consequences: some View {
        FlowLayout(spacing: MeeshySpacing.xs) {
            if let passage = GameMintCostCopy.levelPassage(mint) {
                GameChip(text: passage.text, tint: MeeshyColors.brandPrimary)
                    .accessibilityLabel(passage.accessibilityLabel)
                    .accessibilityIdentifier("game.mint.level")
            }
            GameChip(
                text: String(localized: "game.mint.chip.glory", defaultValue: "+\(GameCopy.formatCount(mint.gloryGained)) de gloire", bundle: .main),
                tint: MeeshyColors.success
            )
            if rankChanges {
                GameChip(
                    text: "\(GameCopy.rankLabel(game.glory)) → \(GameCopy.rankLabel(afterStanding.rank, division5: afterStanding.division5))",
                    tint: MeeshyColors.success
                )
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.mint.consequences")
    }
}
