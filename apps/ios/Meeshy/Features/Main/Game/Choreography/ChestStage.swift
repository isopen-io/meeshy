import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE COFFRE DU JOUR (#9381) — conception, partie V : « le couvercle s'ouvre,
/// les récompenses montent une à une », en 1,4 s, « une tape par récompense ».
///
/// Le coffre dit son contenu AVANT l'ouverture (#10011 : 100 à 10 000 points selon
/// les missions du jour, leur Gloire, des fragments de Meesh, une chance sur six d'un
/// fragment en prime, une sur vingt d'un gel) : la scène ne tire rien, elle MONTRE
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

/// Ce que le coffre ouvert montre, une ligne par récompense, dans l'ordre où elles montent : les points, la
/// Gloire, les fragments de Meesh, le gel. Un coffre ouvert avant #10011 n'a ni Gloire ni fragments comptés :
/// il garde sa ligne d'hier (« Un fragment de Meesh ») quand son fragment est sorti.
enum GameChestLines {
    static func of(_ reward: DailyChest) -> [String] {
        let points = String(localized: "game.chest.reward.points", defaultValue: "+\(GameCopy.points(reward.points))", bundle: .main)
        let glory = reward.glory > 0 ? GameCopy.chestGlory(reward.glory) : nil
        let fragments: String? = reward.meeshFragments > 0
            ? GameCopy.meeshFragments(reward.meeshFragments)
            : reward.fragment ? String(localized: "game.chest.reward.fragment", defaultValue: "Un fragment de Meesh", bundle: .main) : nil
        let freeze = reward.freeze ? String(localized: "game.chest.reward.freeze", defaultValue: "Un gel de Flamme", bundle: .main) : nil
        return [points, glory, fragments, freeze].compactMap { $0 }
    }
}

extension GameCopy {
    /// « 3 fragments de Meesh » — cinq paient une frappe gratuite (#10011).
    static func meeshFragments(_ count: Int) -> String {
        let number = formatCount(count)
        return isSingular(count)
            ? String(localized: "game.meeshFragments.one", defaultValue: "\(number) fragment de Meesh", bundle: .main)
            : String(localized: "game.meeshFragments.other", defaultValue: "\(number) fragments de Meesh", bundle: .main)
    }

    /// « +175 Gloire » — la Gloire du coffre.
    static func chestGlory(_ glory: Int) -> String {
        String(localized: "game.chest.reward.glory", defaultValue: "+\(formatCount(glory)) Gloire", bundle: .main)
    }

    /// « Ce coffre : 1 750 points · +175 Gloire · 1 fragment de Meesh » — le contenu certain, avant l'ouverture.
    static func chestToday(_ content: ChestContent) -> String {
        let points = GameCopy.points(content.points)
        let glory = chestGlory(content.glory)
        let fragments = meeshFragments(content.meeshFragments)
        return String(localized: "game.chest.today", defaultValue: "Ce coffre : \(points) · \(glory) · \(fragments)", bundle: .main)
    }

    /// « 3 / 5 fragments pour une frappe gratuite » — plus de cinq se lisent tels quels (« 7 / 5 »).
    static func chestFragmentsProgress(_ progress: MeeshFragmentProgress) -> String {
        let held = formatCount(progress.held)
        let perMeesh = formatCount(progress.perMeesh)
        return String(localized: "game.chest.fragmentsProgress", defaultValue: "\(held) / \(perMeesh) fragments pour une frappe gratuite", bundle: .main)
    }
}
