import SwiftUI
import MeeshySDK

public enum DelayedUI {
    public enum Outcome: Equatable, Sendable {
        case performed
        case settled
        case skipped
        case cancelled
    }

    @MainActor
    @discardableResult
    public static func perform(
        after delay: Duration,
        sleep: @Sendable (Duration) async -> Bool = cancellableSleep(for:),
        _ action: () -> Void
    ) async -> Outcome {
        guard await sleep(delay), !Task.isCancelled else { return .cancelled }
        action()
        return .performed
    }

    @MainActor
    @discardableResult
    public static func settle<Value: Equatable>(
        _ current: Value,
        to resting: Value,
        after delay: Duration,
        when isTransient: (Value) -> Bool = { _ in true },
        sleep: @Sendable (Duration) async -> Bool = cancellableSleep(for:),
        apply: () -> Void
    ) async -> Outcome {
        guard current != resting, isTransient(current) else { return .skipped }
        let outcome = await perform(after: delay, sleep: sleep, apply)
        return outcome == .performed ? .settled : outcome
    }
}

public extension View {
    func onAppear(
        after delay: Duration,
        perform action: @escaping @MainActor () -> Void
    ) -> some View {
        task { await DelayedUI.perform(after: delay) { action() } }
    }

    func settling<Value: Equatable & Sendable>(
        _ value: Binding<Value>,
        to resting: Value,
        after delay: Duration,
        animation: Animation?,
        when isTransient: @escaping @Sendable (Value) -> Bool = { _ in true }
    ) -> some View {
        modifier(DelayedSettleModifier(
            value: value, resting: resting, delay: delay,
            animation: animation, isTransient: isTransient
        ))
    }
}

@MainActor
struct DelayedSettleModifier<Value: Equatable & Sendable>: ViewModifier {
    let value: Binding<Value>
    let resting: Value
    let delay: Duration
    let animation: Animation?
    let isTransient: @Sendable (Value) -> Bool

    func body(content: Content) -> some View {
        content.task(id: value.wrappedValue) {
            await DelayedUI.settle(
                value.wrappedValue, to: resting, after: delay, when: isTransient
            ) {
                withAnimation(animation) { value.wrappedValue = resting }
            }
        }
    }
}
