import Foundation

/// **L'ACQUISITION d'une piste — ce que « Rogner » a le droit de montrer**
/// (#4667).
///
/// > Directive porteur 2026-09-01 : « Le son de bibliothèque ne peut pas être
/// > rogné correctement ! Il faut charger le son et appliquer le rognage ! »
///
/// ## Ce que la zone de rognage disait, et ce qu'elle taisait
///
/// Elle se montait sur `recordedURL != nil && recordedDuration > 0`, deux
/// conditions qui décrivent l'ARRIVÉE d'un fichier et rien d'autre. Un son de la
/// bibliothèque n'en a pas : il faut d'abord le rapatrier. La zone était donc
/// absente pendant le téléchargement, absente si l'URL ne se résolvait pas,
/// absente si le réseau échouait — et absente, dans les trois cas, de la même
/// façon.
///
/// > Une erreur avalée en VIDE se lit exactement comme un vide légitime.
///
/// L'auteur voyait une note de musique et concluait, raisonnablement, qu'un son
/// emprunté ne se rogne pas. Les deux sorties muettes tenaient en deux mots :
/// `guard … else { return }` sur la résolution d'URL, `try?` sur le
/// téléchargement.
///
/// ## Pourquoi un type, et pas deux booléens
///
/// « en cours » et « échoué » écrits en drapeaux séparés rendent représentable
/// un état qui n'existe pas (chargement ET échec), et obligent chaque lecteur à
/// se souvenir de l'ordre dans lequel les interroger. Les quatre cas ci-dessous
/// sont exclusifs par construction, et `section(…)` est la seule fonction qui
/// traduit un état en ce que l'écran rend.
nonisolated enum AudioTrackAcquisition: Equatable {

    /// Rien à rapatrier — la piste est déjà locale, ou il n'y en a pas.
    case direct

    /// On rapatrie. Le rognage se règle à l'oreille : sans fichier, il n'y a
    /// rien à écouter, donc rien à viser.
    case loading

    /// La piste n'a pas pu être rapatriée. **L'échec se DIT et se réessaie** —
    /// c'est ce qui distingue « ce son n'arrive pas » de « ce son n'est pas
    /// rognable », deux phrases que le silence rendait identiques.
    case failed
}

/// **Ce que la zone « Rogner » rend** — une décision, pas un empilement de
/// conditions dans un `@ViewBuilder`.
nonisolated enum AudioTrimSection: Equatable {

    /// Aucune piste : la zone n'existe pas. Ce n'est pas un état d'attente —
    /// il n'y a rien à attendre.
    case hidden

    /// Le rapatriement est en cours.
    case loading

    /// Le rapatriement a échoué ; l'écran propose de réessayer.
    case failed

    /// Le fichier est là et dure : les poignées se montent dessus.
    case trimmer

    /// - Parameters:
    ///   - acquisition: où en est le rapatriement de la piste.
    ///   - hasLocalTrack: un fichier local existe-t-il ?
    ///   - duration: sa durée. Zéro ⇒ rien à découper, et deux poignées
    ///     superposées sur une bande de largeur nulle ne se manipulent pas.
    static func resolve(acquisition: AudioTrackAcquisition,
                        hasLocalTrack: Bool,
                        duration: TimeInterval) -> AudioTrimSection {
        switch acquisition {
        case .loading: return .loading
        case .failed:  return .failed
        case .direct:
            // **L'attente prime, l'échec prime — le fichier ne prime pas.** Une
            // piste locale PÉRIMÉE peut coexister avec un rapatriement en
            // cours (l'auteur change de son dans la bibliothèque sans fermer la
            // feuille) : rendre les poignées de l'ancienne pendant que la
            // nouvelle arrive ferait viser un son qui ne partira pas. C'est
            // pourquoi les deux cas ci-dessus se décident AVANT de regarder le
            // fichier.
            return hasLocalTrack && duration > 0 ? .trimmer : .hidden
        }
    }
}
