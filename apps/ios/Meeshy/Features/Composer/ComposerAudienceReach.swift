import Foundation
import MeeshySDK
import MeeshyUI

/// **Une mention est-elle SERVIE par l'audience choisie ?** (#4636)
///
/// ## Pourquoi cette règle existe
///
/// Mentionner quelqu'un hors de l'audience produit un silence parfait : la
/// personne n'est pas notifiée, la mention n'apparaît nulle part, et l'auteur
/// croit avoir prévenu quelqu'un. C'est le seul écran où les deux faits — qui
/// verra, et qui est nommé — se rencontrent, donc le seul où on puisse le dire
/// à temps.
///
/// ## Ce qu'elle refuse de prétendre
///
/// **Elle ne répond que là où le client SAIT.** `ONLY` et `EXCEPT` portent leur
/// liste d'identifiants, donc la réponse est certaine ; `PRIVATE` ne sert
/// personne, donc elle l'est aussi. Pour `FRIENDS`, `COMMUNITY` et `PUBLIC`, le
/// client ignore si la personne mentionnée est amie, membre, ou simplement
/// atteignable — et un avertissement FAUX est pire que pas d'avertissement : il
/// apprend à l'auteur à ignorer l'écran.
///
/// > Une garde qui parle quand elle ne sait pas ne se fait pas corriger : elle
/// > se fait ignorer, et emporte avec elle les fois où elle avait raison.
nonisolated enum ComposerAudienceReach: Equatable {

    /// L'audience sert cette personne — certain.
    case reaches
    /// L'audience ne sert PAS cette personne — certain, et il faut le dire.
    case excluded
    /// Le client ne peut pas trancher ; on se tait.
    case unknown

    static func resolve(mentionUserId: String?,
                        visibility: PostVisibility,
                        audienceUserIds: [String]) -> ComposerAudienceReach {
        switch visibility {
        case .private:
            // Une publication privée ne sert personne d'autre que l'auteur : la
            // réponse ne dépend même pas de l'identifiant.
            return .excluded
        case .only:
            guard let id = mentionUserId else { return .unknown }
            return audienceUserIds.contains(id) ? .reaches : .excluded
        case .except:
            guard let id = mentionUserId else { return .unknown }
            return audienceUserIds.contains(id) ? .excluded : .reaches
        case .public, .community, .friends:
            // Le client ne connaît ni le graphe d'amitié ni l'appartenance aux
            // communautés de la personne mentionnée. Se taire est la seule
            // réponse honnête.
            return .unknown
        }
    }

    /// **Ce qui se PEINT.** La loi 4 en une ligne : on ne peint un avertissement
    /// que sur une exclusion CERTAINE.
    var warns: Bool { self == .excluded }
}

/// Ce que la ligne d'une audience DIT sous son nom, dans la feuille `2l`.
///
/// La planche montre un compteur (« 418 personnes », « 12 personnes · liste
/// modifiable ») ; le client ne tient ces effectifs que pour les audiences
/// NOMMÉES, celles dont il porte la liste. Ailleurs il décrit la règle plutôt
/// que d'inventer un nombre — « Public (0) » n'est pas une audience, c'est une
/// erreur apparente (le motif que `audienceTitle` documente déjà).
nonisolated enum ComposerAudienceSubtitle {

    static func subtitle(for visibility: PostVisibility, selectedCount: Int) -> String {
        switch visibility {
        case .public:
            return String(localized: "composer.audience.sub.public",
                          defaultValue: "Tout le monde, y compris hors abonnés", bundle: .main)
        case .community:
            return String(localized: "composer.audience.sub.community",
                          defaultValue: "Les membres de vos communautés", bundle: .main)
        case .friends:
            return String(localized: "composer.audience.sub.friends",
                          defaultValue: "Vos contacts acceptés", bundle: .main)
        case .private:
            return String(localized: "composer.audience.sub.private",
                          defaultValue: "Vous seul — rien n'est publié", bundle: .main)
        case .only, .except:
            guard selectedCount > 0 else {
                return String(localized: "composer.audience.sub.pick",
                              defaultValue: "Choisir des personnes", bundle: .main)
            }
            return String(localized: "composer.audience.sub.count",
                          defaultValue: "\(selectedCount) sélectionnées", bundle: .main)
        }
    }
}
