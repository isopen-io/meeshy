import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'APERÇU DE LA FRAPPE (#9383) — conception, partie VII : « la frappe garde son
/// aperçu », enrichi. Tout ce que le geste coûte et rapporte est dit AVANT (prix,
/// niveau avant → après, trésor, Gloire et rang, numéro et édition, Vent arrière) :
/// la frappe fait redescendre, c'est la règle, et une règle qu'on découvre après
/// coup est un piège. Miroir de `apps/web/src/components/game-mint-preview.tsx`.
///
/// Quand la frappe n'est pas possible : aucun bouton grisé (directive du porteur,
/// `EngagementMeeshProgress.canMint`), seulement ce qui manque et le prix de la
/// prochaine. Un aperçu qui promettrait un « avant → après » pour un geste
/// impossible mentirait.
///
/// La scène (`MintStrikeScene`) montre la pièce au repos, face avers ; la frappe
/// confirmée par la passerelle la joue (1,2 s) et la laisse sur son revers
/// numéroté. La ligne « Badges qui redescendent » n'apparaît pas encore : le plan
/// de débit par axe n'est pas porté sur iOS, et « inconnu » ne se dit pas « aucun ».
struct GameMintPreviewView: View {
    let game: GameBlock
    let online: Bool
    let minting: Bool
    let error: String?
    let celebration: MintCelebration?
    let onMint: () -> Void
    var haptics: GameHapticsProviding = GameHaptics.shared

    private var theme: ThemeManager { ThemeManager.shared }
    private var mint: GameMintPreview { game.mint }

    private var afterStanding: GloryStanding {
        GameGlory.standing(glory: game.glory.glory + mint.gloryGained, mythic: game.glory.rank == .mythe)
    }

    private var rankChanges: Bool {
        afterStanding.rank != game.glory.rank || afterStanding.division != game.glory.division
    }

    private var tailwind: Bool { mint.canMint && mint.levelAfter < game.level.record }

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
                rows
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
            }
            if !minting {
                GameErrorLine(message: error, identifier: "game.mint.error")
            }
        }
        .adaptiveOnChange(of: celebration?.key) { _, key in
            if key != nil { haptics.play(GameHapticPattern.strike) }
        }
    }

    private var header: some View {
        HStack(spacing: MeeshySpacing.md) {
            MintStrikeScene(
                edition: celebration?.edition ?? mint.edition,
                number: celebration?.number ?? mint.number,
                year: Calendar.current.component(.year, from: Date()),
                play: celebration?.key ?? 0
            )
            .gamePrismTilt(active: (celebration?.edition ?? mint.edition) == .prism)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(String(
                    localized: "game.mint.next_title",
                    defaultValue: "Prochaine Meesh · n° \(GameCopy.formatCount(mint.number))",
                    bundle: .main
                ))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                GameNote(text: String(
                    localized: "game.mint.next_subtitle",
                    defaultValue: "Édition \(GameCopy.editionName(mint.edition)) · \(GameCopy.points(mint.price))",
                    bundle: .main
                ))
            }
        }
    }

    private var rows: some View {
        VStack(spacing: MeeshySpacing.xs) {
            row(String(localized: "game.mint.row.price", defaultValue: "Prix", bundle: .main), GameCopy.points(mint.price))
            row(String(localized: "game.mint.row.level", defaultValue: "Niveau", bundle: .main), levelValue)
            row(String(localized: "game.mint.row.treasury", defaultValue: "Trésor", bundle: .main),
                "\(GameCopy.formatCount(game.treasury.held)) → \(GameCopy.meeshes(game.treasury.held + 1))")
            row(String(localized: "game.mint.row.glory", defaultValue: "Gloire", bundle: .main), gloryValue, tone: GameColors.goodText)
            if tailwind {
                row(String(localized: "game.mint.row.tailwind", defaultValue: "Vent arrière", bundle: .main),
                    String(localized: "game.mint.tailwind_value",
                           defaultValue: "+25 % sur tes points jusqu’au niveau \(GameCopy.formatCount(game.level.record))",
                           bundle: .main))
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var levelValue: String {
        let base = "\(GameCopy.formatCount(mint.levelBefore)) → \(GameCopy.formatCount(mint.levelAfter))"
        return mint.levelsLost > 0 ? base + " (−\(GameCopy.formatCount(mint.levelsLost)))" : base
    }

    private var gloryValue: String {
        let gain = "+" + GameCopy.formatCount(mint.gloryGained)
        guard rankChanges else { return gain }
        return "\(gain) · \(GameCopy.rankLabel(game.glory.rank, division: game.glory.division)) → \(GameCopy.rankLabel(afterStanding.rank, division: afterStanding.division))"
    }

    private func row(_ label: String, _ value: String, tone: Color? = nil) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.md) {
            Text(label)
                .foregroundColor(theme.textMuted)
            Spacer(minLength: MeeshySpacing.sm)
            Text(value)
                .fontWeight(.semibold)
                .foregroundColor(tone ?? theme.textPrimary)
                .multilineTextAlignment(.trailing)
        }
        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
        .accessibilityElement(children: .combine)
    }
}
