import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE COFFRE DU JOUR (#9381) — conception, partie V : « le couvercle s'ouvre,
/// les récompenses montent une à une », en 1,4 s, « une tape par récompense ».
///
/// Le coffre dit son contenu AVANT l'ouverture (60 à 200 points, une chance sur
/// six d'un fragment, une sur vingt d'un gel) : la scène ne tire rien, elle MONTRE
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
        var items = [String(localized: "game.chest.reward.points", defaultValue: "+\(GameCopy.points(reward.points))", bundle: .main)]
        if reward.fragment {
            items.append(String(localized: "game.chest.reward.fragment", defaultValue: "Un fragment de Meesh", bundle: .main))
        }
        if reward.freeze {
            items.append(String(localized: "game.chest.reward.freeze", defaultValue: "Un gel de Flamme", bundle: .main))
        }
        return items
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
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Capsule().fill(MeeshyColors.warning.opacity(0.2)))
    }
}
