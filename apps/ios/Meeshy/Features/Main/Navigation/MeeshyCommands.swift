import SwiftUI
import MeeshySDK

struct MeeshyCommands: Commands {
    @FocusedValue(\.meeshySceneNavigation) private var navigation
    @FocusedValue(\.meeshyNewConversation) private var newConversation
    @FocusedValue(\.meeshySearch) private var search
    @FocusedValue(\.meeshyCloseWindow) private var closeWindow
    @FocusedValue(\.meeshySendMessage) private var sendMessage
    @ObservedObject private var preferences = UserPreferencesManager.shared

    private var targets: SceneCommandTargets {
        SceneCommandTargets(
            navigation: navigation,
            newConversation: newConversation,
            search: search,
            closeWindow: closeWindow,
            sendMessage: sendMessage
        )
    }

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            item(.newConversation)
            item(.closeWindow)
        }
        CommandMenu(String(localized: "commands.menu.go", defaultValue: "Aller", bundle: .main)) {
            ForEach(MeeshyShortcut.sections, id: \.self) { item($0) }
            Divider()
            item(.back)
            item(.search)
        }
        CommandMenu(String(localized: "commands.menu.message", defaultValue: "Message", bundle: .main)) {
            item(.sendMessage)
        }
    }

    private func item(_ shortcut: MeeshyShortcut) -> some View {
        let action = targets.action(for: shortcut)
        return Button {
            action?()
        } label: {
            Label(shortcut.title, systemImage: shortcut.systemImage)
        }
        .keyboardShortcut(shortcut.keyboardShortcut(enabled: preferences.application.keyboardShortcutsEnabled))
        .disabled(action == nil)
    }
}
