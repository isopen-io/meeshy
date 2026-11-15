import Foundation

/// #11375 — ce qu'une charge dit de l'AUTEUR d'une modification.
///
/// `untouched` : la charge ne porte pas la clé `editedById` (passerelle
/// antérieure, projection qui ne la sélectionne pas — recherche, épinglés,
/// fils, étoilés —, chemin local) ; la colonne GRDB garde la sienne.
/// `served` : la passerelle l'a servie — l'identité du modérateur (ADMIN,
/// BIGBOSS, lui-même), la marque sans identité (`"moderator"`) pour tout autre
/// lecteur, ou `nil` quand l'auteur a réécrit, ce qui efface la mention.
///
/// Un `String?` seul ne distingue pas « absent » de « null » : c'est cette
/// confusion qui laissait une revalidation REST effacer la colonne qu'un
/// `message:edited` venait d'écrire.
public enum EditAuthorship: Sendable, Equatable {
    case untouched
    case served(editedById: String?)

    public var servesEditor: Bool { self != .untouched }

    public var servedEditorId: String? {
        guard case let .served(editedById) = self else { return nil }
        return editedById
    }
}
