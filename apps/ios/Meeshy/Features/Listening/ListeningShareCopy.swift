import Foundation
import MeeshyUI

/// Les phrases du partage de MON écoute (#16803), dites sur la fiche d'un lien.
nonisolated enum ListeningShareCopy {
    static var title: String {
        String(localized: "circles.settings.listening", defaultValue: "Ce que j'écoute", bundle: .main)
    }

    static var detail: String {
        String(
            localized: "circles.settings.shareListening.detail",
            defaultValue: "Cette personne voit que vous écoutez de la musique ; le titre, seulement si vous le lui avez accordé au rituel du Sang.",
            bundle: .main
        )
    }

    /// Le cas limite, derrière un (i) : le nom est la question à laquelle la note répond.
    static var note: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "circles.settings.shareListening.question", defaultValue: "Quand cette personne voit-elle ce que j'écoute ?", bundle: .main),
            text: String(
                localized: "circles.settings.shareListening.note",
                defaultValue: "Apple Music joué sur cet iPhone, Meeshy ouvert. Messages vocaux jamais partagés.",
                bundle: .main
            )
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
