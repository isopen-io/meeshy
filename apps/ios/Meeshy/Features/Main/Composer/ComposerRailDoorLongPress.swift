import Foundation

/// **L'appui long sur la photothèque ouvre la caméra** (#10306, directive
/// porteur 2026-10-12).
///
/// La caméra de la scène s'arme d'un toucher sur une scène VIDE (#8711). Dès
/// que la scène porte quelque chose, ce geste-là sélectionne ou déplace : la
/// caméra n'avait plus d'entrée. La porte média en devient la seconde — le
/// toucher bref ouvre toujours la photothèque (#8680), l'appui long arme le
/// viseur, et VoiceOver reçoit la même chose en action nommée.
nonisolated extension ComposerMediaSourcePolicy {

    /// Ce que l'appui long d'une porte ouvre ; `nil` ⇒ elle n'en a pas.
    static func longPressIntake(for door: ComposerRailDoor) -> ComposerMediaIntake? {
        door == .media ? .camera : nil
    }

    static var openCameraAction: String {
        String(localized: "composer.rail.media.openCamera", defaultValue: "Ouvrir la caméra", bundle: .main)
    }
}

/// **Un appui long n'est pas suivi d'un toucher** (#10306). Le bouton de la
/// porte rappelle son action à la levée du doigt, appui long compris : sans
/// cette mémoire, la caméra et la photothèque s'ouvriraient l'une sur l'autre.
/// La levée qui suit l'appui long est avalée ; un toucher ultérieur passe.
nonisolated struct ComposerRailDoorPress: Equatable, Sendable {

    /// La tenue qui distingue l'appui long du toucher.
    static let minimumDuration: TimeInterval = 0.45

    /// Au-delà, une levée n'appartient plus à l'appui long : le doigt a quitté
    /// la porte et le toucher suivant est un nouveau geste.
    static let releaseWindow: TimeInterval = 10

    private(set) var longPressedId: String?
    private(set) var longPressedAt: Date?

    mutating func noteLongPress(id: String, at instant: Date) {
        longPressedId = id
        longPressedAt = instant
    }

    /// Le toucher de `id` part-il ? La marque de l'appui long se consomme.
    mutating func admitsTap(id: String, at instant: Date) -> Bool {
        defer {
            longPressedId = nil
            longPressedAt = nil
        }
        guard longPressedId == id, let depuis = longPressedAt else { return true }
        return instant.timeIntervalSince(depuis) > Self.releaseWindow
    }
}
