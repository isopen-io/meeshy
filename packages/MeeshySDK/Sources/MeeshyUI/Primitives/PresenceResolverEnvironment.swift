import SwiftUI
import Combine
import MeeshySDK

private struct MeeshyPresenceResolverKey: EnvironmentKey {
    static let defaultValue: ((String) -> PresenceState?)? = nil
}

private struct MeeshyPresenceRefreshKey: EnvironmentKey {
    static let defaultValue: AnyPublisher<Int, Never>? = nil
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

    /// Le battement de la présence (#11412) : chaque fois qu'une pastille PEUT avoir changé
    /// (`user:status`, instantané, coupure du socket, seuil 1/3/5 franchi), l'app émet une
    /// nouvelle valeur. Paramètre opaque — le SDK n'encode aucune règle : il relit seulement
    /// ce que `meeshyPresenceResolver` (ou le fournisseur d'une vue) répond. `nil` ⇒ jamais
    /// de repeinte, le rendu historique.
    var meeshyPresenceRefresh: AnyPublisher<Int, Never>? {
        get { self[MeeshyPresenceRefreshKey.self] }
        set { self[MeeshyPresenceRefreshKey.self] = newValue }
    }
}

public extension View {
    /// Pose ensemble le fournisseur de présence et son battement — l'un sans l'autre
    /// peint un point juste au montage puis le fige.
    func meeshyPresence(
        resolver: @escaping (String) -> PresenceState?,
        refresh: AnyPublisher<Int, Never>
    ) -> some View {
        environment(\.meeshyPresenceResolver, resolver)
            .environment(\.meeshyPresenceRefresh, refresh)
    }
}

/// Repeint ce qu'il enveloppe — et lui seul — à chaque battement de
/// `meeshyPresenceRefresh` (#11412). Une pastille se résout pendant le `body` de son
/// hôte : sans `body` réévalué, elle reste figée à l'état de son dernier rendu.
/// Envelopper l'avatar déplace sa résolution dans le `body` de CETTE vue, pas dans
/// celui de la feuille ou de la rangée qui le porte.
public struct MeeshyLivePresence<Content: View>: View {
    @Environment(\.meeshyPresenceRefresh) private var refresh
    @State private var revision = 0
    private let content: () -> Content

    public init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    public var body: some View {
        let _ = revision
        content()
            .onReceive(refresh ?? MeeshyPresenceRefreshSilence.publisher) { revision = $0 }
    }
}

private enum MeeshyPresenceRefreshSilence {
    static let publisher: AnyPublisher<Int, Never> = Empty<Int, Never>(completeImmediately: false).eraseToAnyPublisher()
}
