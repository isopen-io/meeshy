import Foundation
import MeeshySDK

/// **L'UNIQUE état de format du compositeur** (#13864, règle R1).
///
/// Il y avait deux formats : celui de la PORTE (`currentFormat`, jamais réécrit
/// après l'ouverture), que lisaient la vue montée, les rails et la garde de
/// publication, et celui que le chevron ARMAIT (`armedPublishChoice`), que lisait
/// le seul libellé de « Publier ». Choisir « Story » au chevron d'un post ouvert
/// depuis le fil ne changeait donc ni la vue, ni les outils, ni ce que la flèche
/// acceptait — seulement le mot écrit sur elle.
///
/// Le chevron ÉCRIT désormais le format, et la disposition des scènes et le réel
/// d'accompagnement voyagent avec lui : ce sont des réglages DU format, jamais un
/// second format.
nonisolated struct ComposerFormatState: Equatable, Sendable {

    let format: ComposerFormat
    let layout: MosaicLayoutMode?
    let alsoAsReel: Bool

    static func opening(_ format: ComposerFormat) -> ComposerFormatState {
        ComposerFormatState(format: format, layout: nil, alsoAsReel: false)
    }

    func choosing(_ choice: ComposerPublishChoice) -> ComposerFormatState {
        ComposerFormatState(format: choice.format, layout: choice.layout, alsoAsReel: choice.alsoAsReel)
    }

    var choice: ComposerPublishChoice {
        ComposerPublishChoice(format: format, layout: layout, alsoAsReel: alsoAsReel)
    }

    /// Le format qui GOUVERNE — la vue, les rails, la garde de publication — une
    /// fois l'offre de la porte appliquée : retirer la vidéo d'un réel ramène au
    /// premier format offert.
    func selectedFormat(offered: [ComposerFormat]) -> ComposerFormat {
        ComposerFormatFanPolicy.resolvedSelection(current: format, offeredFormats: offered)
    }

    /// Ce que « Publier » publie : le format qui gouverne, avec sa disposition et
    /// son réel d'accompagnement tant que le menu les sert encore.
    func armedChoice(offered: [ComposerFormat],
                     entries: [ComposerPublishMenuRule.Entry]?,
                     companionReelOffered: Bool) -> ComposerPublishChoice {
        ComposerPublishMenuRule.armed(chosen: choice,
                                      defaultFormat: selectedFormat(offered: offered),
                                      entries: entries,
                                      companionReelOffered: companionReelOffered)
    }
}
