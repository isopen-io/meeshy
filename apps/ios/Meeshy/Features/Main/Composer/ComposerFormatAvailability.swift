import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce qu'un format VAUT pour la composition du moment** — choisissable, ou
/// refusé avec sa raison.
///
/// Elle servait l'éventail du haut ; depuis #6502 elle sert le menu de la
/// flèche Publier (`ComposerPublishMenuRule`). La règle n'a pas bougé :
/// **un profil impossible est GRISÉ AVEC SA RAISON, jamais absent** (#4030) —
/// l'auteur apprend la règle au lieu de la deviner.
///
/// La frontière avec la loi 4 tient en une phrase : **un CONTRÔLE sans effet
/// est absent ; un FORMAT qu'on ne peut pas encore prendre est une règle du
/// produit qu'il faut apprendre à l'auteur.**
nonisolated enum ComposerFormatAvailability {

    struct Verdict: Equatable {
        let format: ComposerFormat
        let isChoosable: Bool
        /// `nil` quand le format est choisissable — une raison n'a de sens que
        /// pour un refus.
        let reason: String?
    }

    /// L'ordre rendu est celui des CANDIDATS, jamais celui de l'offre : un
    /// format qui devient choisissable ne doit pas sauter de place sous le
    /// doigt de quelqu'un qui vient d'ajouter une vidéo.
    /// - Parameter carriesMoreThanText: le composer porte-t-il autre chose que
    ///   du texte — un média, une scène ? Sans valeur par défaut : un défaut
    ///   laisserait un appelant obtenir silencieusement la mauvaise moitié du
    ///   diagnostic (#4858).
    static func verdicts(candidates: [ComposerFormat],
                         offered: [ComposerFormat],
                         carriesMoreThanText: Bool) -> [Verdict] {
        candidates.map { format in
            offered.contains(format)
                ? Verdict(format: format, isChoosable: true, reason: nil)
                : Verdict(format: format, isChoosable: false,
                          reason: reason(for: format, carriesMoreThanText: carriesMoreThanText))
        }
    }

    /// **Chaque refus a sa propre phrase, et une phrase VRAIE** (#4858).
    ///
    /// Le MOOD refuse pour deux causes OPPOSÉES — « vous portez plus que du
    /// texte » et « vous n'avez rien écrit » —, d'où deux phrases. Le RÉEL
    /// accepte trois formes (`qualifiesAsReel` : une vidéo ≥ 3 s, un SON ≥ 3 s,
    /// ou au moins DEUX images) : sa phrase les nomme toutes.
    static func reason(for format: ComposerFormat, carriesMoreThanText: Bool) -> String {
        switch format {
        case .reel:
            return String(localized: "composer.format.denied.reel",
                          defaultValue: "Demande une vidéo, un son ou deux photos", bundle: .main)
        case .status:
            return carriesMoreThanText
                ? String(localized: "composer.format.denied.mood",
                         defaultValue: "Ne porte que du texte", bundle: .main)
                : String(localized: "composer.format.denied.mood.empty",
                         defaultValue: "Écrivez d'abord quelque chose", bundle: .main)
        case .story:
            return String(localized: "composer.format.denied.story",
                          defaultValue: "Indisponible depuis cette porte", bundle: .main)
        case .post:
            return String(localized: "composer.format.denied.post",
                          defaultValue: "Indisponible pour ce contenu", bundle: .main)
        }
    }
}

nonisolated enum ComposerFormatFanPolicy {

    /// **Le format d'ouverture ne sort JAMAIS de l'offre.**
    ///
    /// L'offre respire (le réel n'est offert que tant que la composition
    /// qualifie). Un format d'ouverture retiré retombe sur le premier format
    /// offert — toujours le format propre de la porte, par l'invariant de C1
    /// « l'offre contient toujours `initialFormat` ».
    ///
    /// Rien d'offert : on rend ce qu'on a reçu. Inventer un format ici ferait
    /// publier ce que la porte n'a jamais proposé.
    static func resolvedSelection(
        current: ComposerFormat,
        offeredFormats: [ComposerFormat]
    ) -> ComposerFormat {
        guard !offeredFormats.contains(current) else { return current }
        return offeredFormats.first ?? current
    }
}

/// Libellés des formats, résolus par le catalogue `.main` — même idiome que
/// `StoryTrayCopy`. Écrits ici plutôt qu'en littéraux dans la vue : un libellé
/// posé en ligne échappe au cliquet de complétude et n'est jamais traduit.
nonisolated enum ComposerFormatCopy {
    static func label(_ format: ComposerFormat) -> String {
        switch format {
        case .story:
            return String(localized: "composer.format.story", defaultValue: "Story", bundle: .main)
        case .post:
            return String(localized: "composer.format.post", defaultValue: "Post", bundle: .main)
        case .reel:
            return String(localized: "composer.format.reel", defaultValue: "Réel", bundle: .main)
        case .status:
            return String(localized: "composer.format.status", defaultValue: "Mood", bundle: .main)
        }
    }
}
