import SwiftUI

// MARK: - Contenu que le rendu asynchrone d'iOS 26 peut appeler (#9135, #9456)
//
// `ViewThatFits` mesure ses candidats sur `com.apple.SwiftUI.AsyncRenderer`.
// C'est pendant cette mesure que SwiftUI appelle les fermetures de contenu
// évaluées à la MISE EN PAGE : celle d'un `ForEach` (il matérialise ses
// éléments à la demande) et celle d'un `GeometryReader` (il ne connaît sa
// taille qu'à ce moment). Écrite dans une vue d'une cible dont l'isolation par
// défaut est le main actor (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` pour
// l'app, `.defaultIsolation(MainActor.self)` pour MeeshyUI), une telle
// fermeture hérite de cette isolation ; Swift 6 pose à son entrée un contrôle
// d'exécuteur qui trappe hors du fil principal (`_dispatch_assert_queue_fail`,
// SIGTRAP) avant sa première ligne.
//
// Les deux formes ci-dessous ne passent à SwiftUI que des fonctions
// `nonisolated` : la fermeture qu'il appelle n'a plus de contrôle à faire.
// `.ips` à l'appui : `ConversationCardStatsRow` (2026-09-29), rails du composer
// (2026-10-05).

/// Une entrée de `ForEach` CONSTRUITE par le `body` — sur le fil principal —
/// et seulement RELUE par le `ForEach` :
///
/// ```swift
/// ForEach(items.map { AsyncRenderRow(id: $0.id, content: tile($0)) },
///         content: asyncRenderRowContent)
/// ```
///
/// La fermeture de `map` est appelée tout de suite, par le `body` ; le
/// `ForEach` ne reçoit que `asyncRenderRowContent`, appelable de n'importe
/// quel fil.
public nonisolated struct AsyncRenderRow<ID: Hashable, Content>: Identifiable {
    public let id: ID
    public let content: Content

    public init(id: ID, content: Content) {
        self.id = id
        self.content = content
    }
}

/// Le seul contenu qu'un `ForEach` atteignable par le rendu asynchrone reçoit.
public nonisolated func asyncRenderRowContent<ID: Hashable, Content>(_ row: AsyncRenderRow<ID, Content>) -> Content {
    row.content
}

/// Le contenu d'un `GeometryReader` qui publie le cadre de sa vue sous une
/// préférence — sans fermeture isolée :
///
/// ```swift
/// .background(GeometryReader(content: FramePreferenceProbe(MyKey.self, in: .named(space)) { [index: $0] }.content))
/// ```
///
/// `value` est `@Sendable`, donc non isolée : elle ne peut lire que ce qu'elle
/// capture par valeur.
public nonisolated struct FramePreferenceProbe<Key: PreferenceKey> {
    private let space: CoordinateSpace
    private let value: @Sendable (CGRect) -> Key.Value

    public init(_ key: Key.Type, in space: CoordinateSpace, value: @escaping @Sendable (CGRect) -> Key.Value) {
        self.space = space
        self.value = value
    }

    public func content(_ proxy: GeometryProxy) -> some View {
        Color.clear.preference(key: Key.self, value: value(proxy.frame(in: space)))
    }
}
