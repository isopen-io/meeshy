import SwiftUI

/// Sous-vue qui OBSERVE un `ScrollOffsetRelay` à la place de l'écran.
///
/// Montage P1-1 (mirror de `ConversationListView`) : la racine détient le
/// relais dans un `@State` (référence stable, jamais observée) et écrit
/// `relay.offset` depuis son callback de scroll ; SEUL le contenu de ce
/// reader se re-rend à la cadence du défilement (~120 Hz). L'anti-pattern
/// remplacé — un `@State CGFloat` sur la racine — ré-exécutait le body
/// COMPLET de l'écran à chaque tick (cf. doc de `ScrollOffsetRelay`).
///
/// ```swift
/// @State private var scrollRelay = ScrollOffsetRelay()
/// ...
/// ScrollOffsetReader(relay: scrollRelay) { offset in
///     CollapsibleHeader(..., scrollOffset: offset, ...)
/// }
/// ...
/// .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }
/// ```
public struct ScrollOffsetReader<Content: View>: View {
    @ObservedObject private var relay: ScrollOffsetRelay
    private let content: (CGFloat) -> Content

    public init(relay: ScrollOffsetRelay, @ViewBuilder content: @escaping (CGFloat) -> Content) {
        self.relay = relay
        self.content = content
    }

    public var body: some View {
        content(relay.offset)
    }
}
