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
    static func make(text: String?, media: [ShareStagedMedia], mediaRoot: URL?, preparationFailed: Bool) -> ShareIncoming {
        ShareIncoming(
            media: media.map { staged in
                ShareIncomingMedia(
                    id: staged.relPath,
                    mimeType: staged.mime,
                    bytes: staged.bytes,
                    fileURL: mediaRoot?.appendingPathComponent(staged.relPath)
                )
            },
            text: text,
            preparationFailed: preparationFailed
        )
    }
}
