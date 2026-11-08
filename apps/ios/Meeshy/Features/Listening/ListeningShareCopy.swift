import Foundation

/// Les phrases du partage de MON écoute (#16803), dites sur la fiche d'un lien.
nonisolated enum ListeningShareCopy {
    static var title: String {
        String(localized: "circles.settings.listening", defaultValue: "Ce que j'écoute", bundle: .main)
    }

    static var detail: String {
        String(
            localized: "circles.settings.shareListening.detail",
            defaultValue: "Quand Apple Music joue sur cet iPhone et que Meeshy est ouvert, cette personne voit que vous écoutez de la musique ; le titre, seulement si vous le lui avez accordé au rituel du Sang. Vos messages vocaux ne sont jamais partagés.",
            bundle: .main
        )
    }

    static var accessDenied: String {
        String(
            localized: "listening.share.accessDenied",
            defaultValue: "Autorisez l’accès à Apple Music dans Réglages pour partager ce que vous écoutez.",
            bundle: .main
        )
    }
}
