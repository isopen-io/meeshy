import SwiftUI
import MeeshySDK
import MeeshyUI

nonisolated enum ComposerSceneFriseCopy {
    static var panel: String { String(localized: "composer.frise.panel", defaultValue: "Plan temps", bundle: .main) }
    static var play: String { String(localized: "composer.frise.play", defaultValue: "Lire", bundle: .main) }
    static var pause: String { String(localized: "composer.frise.pause", defaultValue: "Pause", bundle: .main) }
    static var entry: String { String(localized: "composer.frise.entry", defaultValue: "Entre ici", bundle: .main) }
    static var exit: String { String(localized: "composer.frise.exit", defaultValue: "Sort ici", bundle: .main) }
    static var ruler: String {
        String(localized: "composer.frise.ruler", defaultValue: "Déplacer la tête de lecture", bundle: .main)
    }
    static var empty: String {
        String(localized: "composer.frise.empty",
               defaultValue: "Posez un texte ou un sticker : chaque objet devient une piste.", bundle: .main)
    }
    static var media: String { String(localized: "composer.frise.media", defaultValue: "Média", bundle: .main) }
    static var video: String { String(localized: "composer.frise.video", defaultValue: "Vidéo", bundle: .main) }
    static var sound: String { String(localized: "composer.frise.sound", defaultValue: "Son", bundle: .main) }
    static var place: String { String(localized: "composer.frise.place", defaultValue: "Lieu", bundle: .main) }
    static var earlier: String { String(localized: "composer.frise.earlier", defaultValue: "Plus tôt", bundle: .main) }
    static var later: String { String(localized: "composer.frise.later", defaultValue: "Plus tard", bundle: .main) }
    static var entryEarlier: String {
        String(localized: "composer.frise.entryEarlier", defaultValue: "Entrer plus tôt", bundle: .main)
    }
    static var entryLater: String {
        String(localized: "composer.frise.entryLater", defaultValue: "Entrer plus tard", bundle: .main)
    }
    static var exitEarlier: String {
        String(localized: "composer.frise.exitEarlier", defaultValue: "Sortir plus tôt", bundle: .main)
    }
    static var exitLater: String {
        String(localized: "composer.frise.exitLater", defaultValue: "Sortir plus tard", bundle: .main)
    }
    static var split: String {
        String(localized: "composer.object.editor.split", defaultValue: "Couper", bundle: .main)
    }
    static var timeButton: String { String(localized: "composer.frise.time", defaultValue: "Temps", bundle: .main) }

    static func label(for piste: SceneFriseTrack) -> String {
        let nom = piste.label.trimmingCharacters(in: .whitespacesAndNewlines)
        if !nom.isEmpty { return nom }
        switch piste.kind {
        case .image, .text, .sticker: return media
        case .video: return video
        case .audio: return sound
        case .place: return place
        }
    }
}

/// Les mots de la frise premium (#17110), dans leur table `ComposerTime`.
nonisolated enum ComposerTimeCopy {
    static var pinchHint: String {
        String(localized: "composer.time.pinchHint", defaultValue: "Pincer pour zoomer", table: "ComposerTime", bundle: .main)
    }
    static var quit: String {
        String(localized: "composer.time.quit", defaultValue: "Quitter", table: "ComposerTime", bundle: .main)
    }
    static var validate: String {
        String(localized: "composer.time.validate", defaultValue: "Valider", table: "ComposerTime", bundle: .main)
    }
    static var expand: String {
        String(localized: "composer.time.expand", defaultValue: "Agrandir la frise", table: "ComposerTime", bundle: .main)
    }
    static func snapped(_ instant: String) -> String {
        String(format: String(localized: "composer.time.snapped", defaultValue: "aimanté · %@",
                              table: "ComposerTime", bundle: .main), instant)
    }
}
