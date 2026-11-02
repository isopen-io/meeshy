import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE COFFRE DU JOUR (#9381) — conception, partie V : « le couvercle s'ouvre,
/// les récompenses montent une à une », en 1,4 s, « une tape par récompense ».
///
/// Le coffre dit son contenu AVANT l'ouverture (#10011 : 500 à 10 000 points selon
/// les missions du jour, leur Gloire, une prime en points au cours de la Meesh, une
/// chance sur six d'un fragment d'étoile, une sur vingt d'un gel) : la scène ne tire rien, elle MONTRE
/// ce que la passerelle a tiré. Ouvert au repos (écran rouvert), il montre son
/// contenu sans rejouer. Sous « réduire les animations » : le contenu apparaît en fondu.
struct ChestStage: View {
    /// Le contenu servi ; `nil` tant que la passerelle n'a pas répondu (ouverture en cours).
    let reward: DailyChest?
    /// Le coffre est ouvert (ou en train de l'être, retour instantané).
    let isOpen: Bool
    let play: Int

    private static let size = CGSize(width: 110, height: 88)

    var body: some View {
        ChoreographyClock(play: play, duration: GameTimeline.chestDuration) { seconds, reduceMotion in
            stage(seconds: seconds, reduceMotion: reduceMotion)
        }
    }

    private var lines: [String] {
        guard let reward else { return [] }
        return GameChestLines.of(reward)
    }

    @ViewBuilder
    private func stage(seconds: Double?, reduceMotion: Bool) -> some View {
        let items = lines
        VStack(spacing: 6) {
            VStack(spacing: 4) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, text in
                    chip(text)
                        .opacity(rewardOpacity(index: index, seconds: seconds, reduceMotion: reduceMotion))
                        .offset(y: rewardOffset(index: index, seconds: seconds, reduceMotion: reduceMotion))
                }
            }
            ChestView(openProgress: lid(seconds: seconds, reduceMotion: reduceMotion))
                .frame(width: Self.size.width, height: Self.size.height)
        }
        .accessibilityElement(children: .ignore)
    }

    private func lid(seconds: Double?, reduceMotion: Bool) -> Double {
        guard let seconds else { return isOpen ? 1 : 0 }
        return reduceMotion ? min(1, seconds / GameTimeline.reducedDuration) : GameTimeline.chestLid(at: seconds)
    }

    private func rewardProgress(index: Int, seconds: Double?, reduceMotion: Bool) -> Double {
        guard let seconds else { return reward == nil ? 0 : 1 }
        if reduceMotion { return min(1, seconds / GameTimeline.reducedDuration) }
        return GameTimeline.reward(index, at: seconds)
    }

    private func rewardOpacity(index: Int, seconds: Double?, reduceMotion: Bool) -> Double {
        rewardProgress(index: index, seconds: seconds, reduceMotion: reduceMotion)
    }

    private func rewardOffset(index: Int, seconds: Double?, reduceMotion: Bool) -> Double {
        reduceMotion ? 0 : (1 - rewardProgress(index: index, seconds: seconds, reduceMotion: reduceMotion)) * 22
    }

    private func chip(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
            .foregroundColor(ThemeManager.shared.textPrimary)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xs)
            .background(Capsule().fill(MeeshyColors.warning.opacity(0.2)))
    }
}

/// Ce que le coffre ouvert montre, une ligne par récompense, dans l'ordre où elles montent : les points de
/// l'effort, la Gloire, la prime en points, le fragment d'étoile, le gel. `points` est le total crédité : la ligne
/// des points montre ce qui revient à l'effort, la prime a la sienne. Un coffre ouvert avant #10011 n'a ni Gloire
/// ni prime ; son `fragment: true` est un fragment d'étoile.
enum GameChestLines {
    static func of(_ reward: DailyChest) -> [String] {
        let base = max(0, reward.points - reward.bonusPoints)
        let points = String(localized: "game.chest.reward.points", defaultValue: "+\(GameCopy.points(base))", bundle: .main)
        let glory = reward.glory > 0 ? GameCopy.chestGlory(reward.glory) : nil
        let bonus = GameCopy.chestBonus(reward)
        let fragment = reward.fragment
            ? String(localized: "game.chest.reward.fragment", defaultValue: "Un fragment d’étoile", bundle: .main) : nil
        let freeze = reward.freeze ? String(localized: "game.chest.reward.freeze", defaultValue: "Une Veilleuse pour ta Flamme", bundle: .main) : nil
        return [points, glory, bonus, fragment, freeze].compactMap { $0 }
    }
}

extension GameCopy {
    /// « 3 fragments d’étoile » — le total collecté, toutes sources confondues (#10011).
    static func starFragments(_ count: Int) -> String {
        let number = formatCount(count)
        return isSingular(count)
            ? String(localized: "game.starFragments.one", defaultValue: "\(number) fragment d’étoile", bundle: .main)
            : String(localized: "game.starFragments.other", defaultValue: "\(number) fragments d’étoile", bundle: .main)
    }

    /// « +175 Gloire » — la Gloire du coffre.
    static func chestGlory(_ glory: Int) -> String {
        String(localized: "game.chest.reward.glory", defaultValue: "+\(formatCount(glory)) de gloire", bundle: .main)
    }

    /// « Prime : +1 221 points, le prix d’une Meesh » — la prime tombée, `nil` sans prime.
    static func chestBonus(_ reward: DailyChest) -> String? {
        guard reward.bonusPoints > 0, let bonus = reward.bonus else { return nil }
        let amount = points(reward.bonusPoints)
        switch bonus {
        case .whole:
            return String(localized: "game.chest.reward.bonus.whole", defaultValue: "Prime : +\(amount), le prix d’une Meesh", bundle: .main)
        case .fifth:
            return String(localized: "game.chest.reward.bonus.fifth", defaultValue: "Prime : +\(amount), un cinquième de Meesh", bundle: .main)
        case .noBonus:
            return nil
        }
    }
}
