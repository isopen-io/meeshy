import Foundation
import UIKit

/// Comptage des médias de la fenêtre non lue, porté par l'étage `fallback`
/// du pont. Chaque compteur est ABSENT — pas zéro — quand la catégorie n'a
/// rien à annoncer.
///
/// Miroir Swift de `mediaCounts` dans
/// `packages/shared/types/conversation-bridge.ts`.
public struct ConversationBridgeMediaCounts: Codable, Equatable, Sendable {
    public let images: Int?
    public let audio: Int?
    public let files: Int?

    public init(images: Int? = nil, audio: Int? = nil, files: Int? = nil) {
        self.images = images
        self.audio = audio
        self.files = files
    }

    private enum CodingKeys: String, CodingKey {
        case images, audio, files
    }
}
