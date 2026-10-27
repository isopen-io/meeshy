import SwiftUI

/// Une valeur focalisée est comparée à chaque rendu : sans égalité, SwiftUI y
/// voit un changement, reconstruit la barre de menus et réévalue l'émetteur,
/// qui republie. C'est la boucle qui figeait l'ouverture d'une conversation
/// (#11131, #11238). Une action a donc TOUJOURS un propriétaire, et deux
/// actions du même propriétaire sont égales : aucune ne peut naître neuve à
/// chaque rendu.
struct MeeshySceneAction: Equatable {
    let owner: AnyObject
    let perform: () -> Void

    init(owner: AnyObject, perform: @escaping () -> Void) {
        self.owner = owner
        self.perform = perform
    }

    static func == (lhs: MeeshySceneAction, rhs: MeeshySceneAction) -> Bool {
        lhs.owner === rhs.owner
    }
}

/// Le propriétaire d'une action publiée, un par émetteur (`@State`) : l'action
/// reste la même d'un rendu à l'autre, et exécute la dernière fermeture reçue.
final class SceneActionRelay {
    var perform: () -> Void = {}

    var action: MeeshySceneAction {
        MeeshySceneAction(owner: self) { [weak self] in self?.perform() }
    }

    nonisolated deinit {}
}

enum MeeshySceneRole {
    case main
    case detached
}

struct MeeshySceneNavigation {
    let router: Router
    let role: MeeshySceneRole
}

private struct MeeshySceneNavigationKey: FocusedValueKey {
    typealias Value = MeeshySceneNavigation
}

private struct MeeshyNewConversationKey: FocusedValueKey {
    typealias Value = MeeshySceneAction
}

private struct MeeshySearchKey: FocusedValueKey {
    typealias Value = MeeshySceneAction
}

private struct MeeshyCloseWindowKey: FocusedValueKey {
    typealias Value = MeeshySceneAction
}

private struct MeeshySendMessageKey: FocusedValueKey {
    typealias Value = MeeshySceneAction
}

extension FocusedValues {
    var meeshySceneNavigation: MeeshySceneNavigation? {
        get { self[MeeshySceneNavigationKey.self] }
        set { self[MeeshySceneNavigationKey.self] = newValue }
    }

    var meeshyNewConversation: MeeshySceneAction? {
        get { self[MeeshyNewConversationKey.self] }
        set { self[MeeshyNewConversationKey.self] = newValue }
    }

    var meeshySearch: MeeshySceneAction? {
        get { self[MeeshySearchKey.self] }
        set { self[MeeshySearchKey.self] = newValue }
    }

    var meeshyCloseWindow: MeeshySceneAction? {
        get { self[MeeshyCloseWindowKey.self] }
        set { self[MeeshyCloseWindowKey.self] = newValue }
    }

    var meeshySendMessage: MeeshySceneAction? {
        get { self[MeeshySendMessageKey.self] }
        set { self[MeeshySendMessageKey.self] = newValue }
    }
}

struct PublishesSceneNavigation: ViewModifier {
    let router: Router
    let role: MeeshySceneRole

    func body(content: Content) -> some View {
        content
            .environment(\.routerCommands, router.commands)
            .focusedSceneValue(\.meeshySceneNavigation, MeeshySceneNavigation(router: router, role: role))
    }
}

struct PublishesSceneAction: ViewModifier {
    let keyPath: WritableKeyPath<FocusedValues, MeeshySceneAction?>
    let perform: () -> Void
    @State private var relay = SceneActionRelay()

    func body(content: Content) -> some View {
        relay.perform = perform
        return content.focusedSceneValue(keyPath, relay.action)
    }
}

struct SceneCommandTargets {
    let navigation: MeeshySceneNavigation?
    let newConversation: MeeshySceneAction?
    let search: MeeshySceneAction?
    let closeWindow: MeeshySceneAction?
    let sendMessage: MeeshySceneAction?

    init(
        navigation: MeeshySceneNavigation? = nil,
        newConversation: MeeshySceneAction? = nil,
        search: MeeshySceneAction? = nil,
        closeWindow: MeeshySceneAction? = nil,
        sendMessage: MeeshySceneAction? = nil
    ) {
        self.navigation = navigation
        self.newConversation = newConversation
        self.search = search
        self.closeWindow = closeWindow
        self.sendMessage = sendMessage
    }

    func action(for shortcut: MeeshyShortcut) -> (() -> Void)? {
        switch shortcut {
        case .newConversation: return newConversation?.perform
        case .search: return search?.perform
        case .closeWindow: return closeWindow?.perform
        case .sendMessage: return sendMessage?.perform
        case .back: return backAction()
        case .conversations, .contacts, .notifications, .settings: return sectionAction(shortcut)
        }
    }

    private func backAction() -> (() -> Void)? {
        guard let router = navigation?.router else { return nil }
        return { router.pop() }
    }

    private func sectionAction(_ shortcut: MeeshyShortcut) -> (() -> Void)? {
        guard let navigation, navigation.role == .main else { return nil }
        let router = navigation.router
        guard let route = shortcut.route else { return { router.popToRoot() } }
        return { router.push(route) }
    }
}
