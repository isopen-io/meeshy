import UIKit

/// **Le décodage d'une image de story quitte le fil principal** (#7010).
///
/// `Data(contentsOf:)` puis `UIImage(data:)` lisaient ET décodaient l'image
/// ENTIÈRE sur le MainActor — à chaque transition de slide, pour le fond d'une
/// scène qui occupe tout l'écran. Une photo d'appareil moderne, c'est une
/// douzaine de mégapixels : la lecture disque et la préparation du bitmap
/// tombaient dans la même image que l'animation de transition.
///
/// **`preparingForDisplay()`, et pas seulement `Task.detached`.**
/// `UIImage(data:)` ne décode RIEN : il retient les octets et laisse le
/// décodage au premier dessin — c'est-à-dire sur le fil du rendu, une fois
/// l'image revenue sur le MainActor. Déplacer la seule construction aurait donc
/// déplacé la lecture disque et laissé le décodage exactement où il était.
/// `preparingForDisplay()` force la préparation ICI, dans la tâche détachée.
///
/// **Aucun sous-échantillonnage, à dessein.** Ces layers servent la scène
/// AFFICHÉE comme le rendu hors écran (`StoryRendererCache`), et un plafond en
/// pixels d'écran dégraderait en silence ce qui est composé pour être exporté.
/// Le gain visé est le fil, pas la mémoire : les pixels rendus sont identiques
/// à ceux d'avant, à l'octet près.
enum StoryLayerImageDecoding {

    /// Lit puis décode un fichier local, entièrement hors du MainActor.
    nonisolated static func decodedImage(fileAt url: URL) async -> UIImage? {
        await Task.detached(priority: .userInitiated) {
            guard let data = try? Data(contentsOf: url) else { return nil }
            return decoded(data)
        }.value
    }

    /// Décode des octets déjà en mémoire (chemin cache / réseau), hors du
    /// MainActor. Le cache rend des OCTETS : sans ce saut, l'appelant décodait
    /// sur le fil principal une image qu'il venait pourtant d'attendre.
    nonisolated static func decodedImage(from data: Data) async -> UIImage? {
        await Task.detached(priority: .userInitiated) { decoded(data) }.value
    }

    /// `preparingForDisplay()` peut rendre `nil` (format non décodable par le
    /// chemin rapide) : on sert alors l'image non préparée plutôt que rien —
    /// une image qui décode tard vaut mieux qu'un fond absent.
    nonisolated private static func decoded(_ data: Data) -> UIImage? {
        guard let image = UIImage(data: data) else { return nil }
        return image.preparingForDisplay() ?? image
    }
}
