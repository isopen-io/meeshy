import SwiftUI
import MeeshySDK

private struct MeeshyPresenceResolverKey: EnvironmentKey {
    static let defaultValue: ((String) -> PresenceState?)? = nil
}

public extension EnvironmentValues {
    /// La présence SERVIE d'un compte, telle que l'app la tient (#10956) : la carte vivante
    /// que la passerelle n'alimente qu'aux amis acceptés, à soi et aux administrateurs.
    /// MeeshyUI ne lit aucun singleton de l'app — l'app pose ce fournisseur UNE fois à sa
    /// racine, et chaque avatar d'une vue du SDK (membres, frappe, notifications) le consulte
    /// par l'identifiant de COMPTE. `nil` (aucun fournisseur, ou personne de connu) ⇒ aucun point.
    var meeshyPresenceResolver: ((String) -> PresenceState?)? {
        get { self[MeeshyPresenceResolverKey.self] }
        set { self[MeeshyPresenceResolverKey.self] = newValue }
    }
}
