import SwiftUI

struct MeeshyTapActionModifier: ViewModifier {
    let label: String
    let action: () -> Void

    func body(content: Content) -> some View {
        content
            .onTapGesture { action() }
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { action() }
    }
}

struct MeeshyNamedTapActionModifier: ViewModifier {
    let name: String
    let count: Int
    let action: () -> Void

    func body(content: Content) -> some View {
        content
            .onTapGesture(count: count) { action() }
            .accessibilityAction(named: Text(name)) { action() }
    }
}

public extension View {
    func meeshyTapAction(label: String, perform action: @escaping () -> Void) -> some View {
        modifier(MeeshyTapActionModifier(label: label, action: action))
    }

    func meeshyNamedTapAction(_ name: String, count: Int = 1, perform action: @escaping () -> Void) -> some View {
        modifier(MeeshyNamedTapActionModifier(name: name, count: count, action: action))
    }
}
