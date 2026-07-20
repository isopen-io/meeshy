import Foundation

/// Decides whether the client may EMIT a "read" receipt for the messages it is
/// currently looking at — i.e. tell the server (and therefore the sender) that
/// the current user has actually read up to the latest message.
///
/// ## Why this exists — read PRECISION
/// `DeliveryStatusResolver` governs what the sender SEES. This gate governs what
/// the recipient CLAIMS. They are duals: the indicator can only be exact if the
/// receipts feeding it are themselves truthful.
///
/// The legacy trigger fired `markAsRead` on *every* inbound socket message while
/// the conversation handler was subscribed, on the assumption "handler
/// subscribed ⟹ the user is looking at the screen". That assumption is false in
/// two cases, each producing a FALSE read receipt — the sender's check turns
/// indigo "read" although nobody read anything:
/// 1. **Backgrounded app** — the socket stays connected and the handler stays
///    subscribed while the phone is in a pocket. A message arriving then would
///    be marked read.
/// 2. **Scrolled away** — the user is reading older history near the top; a new
///    message lands at the bottom, off-screen, and would be marked read despite
///    never being seen.
///
/// ## The rule
/// A read receipt may be emitted only when BOTH hold:
/// - the application is in the foreground / active (the screen is actually being
///   looked at), and
/// - the conversation viewport is at the bottom, where a newly arrived message
///   is (or auto-scrolls into) view.
///
/// Stateless and pure — a rule engine. The two signals are produced app-side
/// (`UIApplication.applicationState`, the scroll controller's near-bottom flag);
/// this type only encodes the precision rule so it can be unit-tested in
/// isolation and shared as the single source of truth.
public enum ReadReceiptGate {

    /// Whether an auto read-receipt (triggered by an inbound message arriving in
    /// the open conversation) is truthful and may be emitted.
    ///
    /// - Parameters:
    ///   - isApplicationActive: the app is in the foreground `.active` state.
    ///   - isViewportAtBottom: the message list is scrolled to (or near) the
    ///     bottom, where the newest message is visible.
    /// - Returns: `true` only when both conditions hold. A `false` result means
    ///   the read is deferred — never emitted falsely. Soundness over coverage:
    ///   a deferred read is later re-emitted when the user foregrounds the app
    ///   or scrolls back to the bottom, so the receipt is eventually truthful.
    public static func shouldEmitAutoRead(
        isApplicationActive: Bool,
        isViewportAtBottom: Bool
    ) -> Bool {
        isApplicationActive && isViewportAtBottom
    }
}
