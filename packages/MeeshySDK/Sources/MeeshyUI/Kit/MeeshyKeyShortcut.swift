import SwiftUI
#if canImport(GameController)
import GameController
#endif

/// **La touche portée par sa commande (K55, #19515)** : l'hôte donne le raccourci UNE fois, en touches abstraites ;
/// la même combinaison devient la frappe que la commande reconnaît et la touche que K55 dessine. Aucune touche
/// affichée ne peut donc dire autre chose que ce qui marche.
public nonisolated enum MeeshyKeyShortcutLaw {

    /// La frappe reconnue : exactement une touche qui n'est pas un modificateur, et ses modificateurs. Sinon rien.
    public static func keyboardShortcut(for combo: MeeshyKeyCombo) -> KeyboardShortcut? {
        let keys = combo.compactMap { equivalent(of: $0) }
        guard keys.count == 1, let key = keys.first else { return nil }
        return KeyboardShortcut(key, modifiers: EventModifiers(combo.compactMap { modifier(of: $0) }))
    }

    /// Ce que K55 dessine sous une commande : la combinaison, seulement si la commande répond et que la frappe la
    /// reconnaît. Une commande désactivée ou en attente ne promet aucune touche.
    public static func displayed(_ combo: MeeshyKeyCombo?, isActionable: Bool) -> MeeshyKeyCombo? {
        guard isActionable, let combo, keyboardShortcut(for: combo) != nil else { return nil }
        return combo
    }

    /// Une touche se montre avec un clavier branché, jamais en largeur de téléphone (classe compacte) : la règle
    /// maison lit la place, jamais le modèle d'appareil.
    public static func showsHints(isKeyboardConnected: Bool, isCompactWidth: Bool) -> Bool {
        isKeyboardConnected && !isCompactWidth
    }

    private static func modifier(of key: MeeshyKey) -> EventModifiers? {
        switch key {
        case .primary: return .command
        case .shift: return .shift
        case .option: return .option
        case .control: return .control
        default: return nil
        }
    }

    private static func equivalent(of key: MeeshyKey) -> KeyEquivalent? {
        switch key {
        case .character(let text):
            guard text.count == 1, let character = text.lowercased().first else { return nil }
            return KeyEquivalent(character)
        case .enter: return .return
        case .escape: return .escape
        case .space: return .space
        case .tab: return .tab
        case .delete: return .delete
        case .up: return .upArrow
        case .down: return .downArrow
        case .left: return .leftArrow
        case .right: return .rightArrow
        case .primary, .shift, .option, .control: return nil
        }
    }
}

public extension View {
    /// Pose sur la commande la frappe de la combinaison ; `nil` ou une combinaison non reconnue : aucune frappe.
    func meeshyKeyShortcut(_ combo: MeeshyKeyCombo?) -> some View {
        keyboardShortcut(combo.flatMap { MeeshyKeyShortcutLaw.keyboardShortcut(for: $0) })
    }

    /// Publie dans l'environnement du kit qu'un clavier matériel est branché (`meeshyHasKeyboard`), jamais en largeur
    /// de téléphone, et le suit à chaque branchement.
    func meeshyHardwareKeyboardHost() -> some View {
        modifier(MeeshyHardwareKeyboardHost())
    }
}

private struct MeeshyHardwareKeyboardHost: ViewModifier {
    @State private var isConnected = MeeshyHardwareKeyboard.isConnected
    @Environment(\.horizontalSizeClass) private var sizeClass

    func body(content: Content) -> some View {
        content
            .environment(\.meeshyHasKeyboard, MeeshyKeyShortcutLaw.showsHints(isKeyboardConnected: isConnected,
                                                                             isCompactWidth: sizeClass == .compact))
            #if canImport(GameController)
            .onReceive(NotificationCenter.default.publisher(for: .GCKeyboardDidConnect)) { _ in isConnected = true }
            .onReceive(NotificationCenter.default.publisher(for: .GCKeyboardDidDisconnect)) { _ in
                isConnected = MeeshyHardwareKeyboard.isConnected
            }
            #endif
    }
}

private enum MeeshyHardwareKeyboard {
    static var isConnected: Bool {
        #if canImport(GameController)
        GCKeyboard.coalesced != nil
        #else
        false
        #endif
    }
}
