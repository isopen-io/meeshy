import SwiftUI

struct MeeshySceneAction {
    let perform: () -> Void
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
}

struct PublishesSceneNavigation: ViewModifier {
    let router: Router
    let role: MeeshySceneRole

    func body(content: Content) -> some View {
        content.focusedSceneValue(\.meeshySceneNavigation, MeeshySceneNavigation(router: router, role: role))
    }
}

struct PublishesSceneAction: ViewModifier {
    let keyPath: WritableKeyPath<FocusedValues, MeeshySceneAction?>
    let perform: () -> Void

    func body(content: Content) -> some View {
        content.focusedSceneValue(keyPath, MeeshySceneAction(perform: perform))
    }
}

struct SceneCommandTargets {
    let navigation: MeeshySceneNavigation?
    let newConversation: MeeshySceneAction?
    let search: MeeshySceneAction?
    let closeWindow: MeeshySceneAction?

    init(
        navigation: MeeshySceneNavigation? = nil,
        newConversation: MeeshySceneAction? = nil,
        search: MeeshySceneAction? = nil,
        closeWindow: MeeshySceneAction? = nil
    ) {
        self.navigation = navigation
        self.newConversation = newConversation
        self.search = search
        self.closeWindow = closeWindow
    }

    func action(for shortcut: MeeshyShortcut) -> (() -> Void)? {
        switch shortcut {
        case .newConversation: return newConversation?.perform
        case .search: return search?.perform
        case .closeWindow: return closeWindow?.perform
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
