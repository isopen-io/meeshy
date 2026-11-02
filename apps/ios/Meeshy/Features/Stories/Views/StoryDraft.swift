import Foundation
import MeeshySDK
import MeeshyUI

/// Draft state for a single story's composer
struct StoryDraft {
    var text: String = ""
    var attachments: [ComposerAttachment] = []
    /// Posé quand la file a REFUSÉ ce commentaire (#9743, M1) : le composeur
    /// rouvert reprend alors ses pièces.
    var refusedAt: Date? = nil
}
