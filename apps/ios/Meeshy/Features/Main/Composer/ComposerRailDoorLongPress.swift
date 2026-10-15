import Foundation

/// **L'appui long sur la photothèque propose deux sources** (#10357, retour de
/// recette porteur 2026-10-12, qui remplace « l'appui long arme la caméra » de
/// #10306).
///
/// Le toucher bref ouvre toujours la photothèque (#8680). L'appui long offre
/// « Prendre une photo » — le viseur de la scène, seulement si le format sert
/// la caméra et que le viseur n'est pas déjà armé — et « Depuis les fichiers »
/// — l'importateur du meuble, filtre média. VoiceOver reçoit les mêmes sources
/// en actions nommées.
nonisolated extension ComposerMediaSourcePolicy {

    /// La porte a-t-elle un appui long ? Seule la photothèque en a un.
    static func offersLongPress(_ door: ComposerRailDoor) -> Bool {
        door == .media
    }

    /// Les sources que l'appui long PROPOSE, dans l'ordre du choix ; vide ⇒
    /// la porte n'en a pas. La caméra n'est proposée que si elle est servie.
    static func longPressSources(for door: ComposerRailDoor, cameraServed: Bool) -> [ComposerMediaIntake] {
        guard offersLongPress(door) else { return [] }
        return cameraServed ? [.camera, .files] : [.files]
    }

    /// Le libellé d'une source, dans le choix comme dans l'action VoiceOver.
    static func longPressLabel(_ source: ComposerMediaIntake) -> String {
        switch source {
        case .camera:
            return String(localized: "composer.rail.media.takePhoto",
                          defaultValue: "Prendre une photo", bundle: .main)
        case .files:
            return String(localized: "composer.rail.media.fromFiles",
                          defaultValue: "Depuis les fichiers", bundle: .main)
        case .photoLibrary:
            return ComposerRailCopy.label(.media)
        }
    }
}

/// **Ce que l'hôte remet au rail pour l'appui long** (#10357) : les sources
/// servies, le geste qui PRÉSENTE le choix, et le choix direct d'une source
/// — celui que VoiceOver emprunte par ses actions nommées.
struct ComposerRailDoorLongPressHandler {
    let sources: [ComposerMediaIntake]
    let offer: (ComposerRailDoor) -> Void
    let choose: (ComposerMediaIntake) -> Void
}

/// Une action nommée d'une entrée du rail, offerte à VoiceOver.
struct ComposerRailNamedAction: Identifiable {
    let id: String
    let label: String
    let perform: () -> Void
}

/// L'appui long d'UNE entrée du rail : le geste, et ses actions nommées.
struct ComposerRailEntryLongPress {
    let begin: () -> Void
    let actions: [ComposerRailNamedAction]
}

/// **Un appui long n'est pas suivi d'un toucher** (#10306). Le bouton de la
/// porte rappelle son action à la levée du doigt, appui long compris : sans
/// cette mémoire, le choix des sources et la photothèque s'ouvriraient l'un
/// sur l'autre. La levée qui suit l'appui long est avalée ; un toucher
/// ultérieur passe.
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
