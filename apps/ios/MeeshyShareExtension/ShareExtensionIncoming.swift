import Foundation
import MeeshySDK
#if !MEESHY_SHARE_EXTENSION
@testable import Meeshy
#endif

/// Ce que la feuille système a remis, dans la forme que lit l'écran unique.
///
/// L'identifiant d'une pièce est son chemin relatif dans l'App Group : c'est
/// lui que la fiche d'envoi (`SharePendingShare.media`) et la fiche de studio
/// (`ShareComposeHandoff.media`) portent déjà.
nonisolated enum ShareExtensionIncoming {
    static func make(text: String?, media: [ShareStagedMedia], mediaRoot: URL?, failures: [ShareMediaStagingError]) -> ShareIncoming {
        ShareIncoming(
            media: media.map { staged in
                ShareIncomingMedia(
                    id: staged.relPath,
                    mimeType: staged.mime,
                    bytes: staged.bytes,
                    fileURL: mediaRoot?.appendingPathComponent(staged.relPath),
                    originalName: staged.originalName
                )
            },
            text: text,
            shortfalls: shortfalls(from: failures)
        )
    }

    /// Une raison par sorte d'échec, jamais une par fichier : l'écran dit
    /// combien de pièces le plafond a laissées, et qu'il en manque d'autres.
    static func shortfalls(from failures: [ShareMediaStagingError]) -> [ShareShortfall] {
        let overBudget = failures.filter(\.isOverBudget).count
        let refused = failures.contains(.refusedSource)
        let others = failures.count - overBudget - failures.filter { $0 == .refusedSource }.count
        return [
            refused ? ShareShortfall.refusedSource : nil,
            overBudget > 0 ? ShareShortfall.overBudget(uncopied: overBudget) : nil,
            others > 0 ? ShareShortfall.unprepared : nil,
        ].compactMap { $0 }
    }
}

nonisolated extension ShareMediaStagingError {
    var isOverBudget: Bool {
        guard case .byteBudgetExceeded = self else { return false }
        return true
    }
}
