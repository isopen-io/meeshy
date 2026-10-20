import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

nonisolated enum ConversationKeyboardCursor {

    enum Move {
        case up
        case down
    }

    static func moved(_ cursor: String?, _ move: Move, in ids: [String]) -> String? {
        guard let first = ids.first else { return nil }
        guard let cursor, let index = ids.firstIndex(of: cursor) else { return first }
        switch move {
        case .down: return ids[min(index + 1, ids.count - 1)]
        case .up: return ids[max(index - 1, 0)]
        }
    }

    static func reconciled(_ cursor: String?, in ids: [String]) -> String? {
        guard let cursor, ids.contains(cursor) else { return nil }
        return cursor
    }
}

struct ConversationListKeyboardNavigation: ViewModifier {
    let visibleIds: [String]
    @Binding var cursor: String?
    let onOpen: (String) -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content
                .focusable(interactions: .edit)
                .focusEffectDisabled()
                .onKeyPress(.downArrow) { step(.down) }
                .onKeyPress(.upArrow) { step(.up) }
                .onKeyPress(.return) { open() }
                .onKeyPress(.escape) { release() }
                .onChange(of: visibleIds) { _, ids in
                    cursor = ConversationKeyboardCursor.reconciled(cursor, in: ids)
                }
        } else {
            content
        }
    }

    private func step(_ move: ConversationKeyboardCursor.Move) -> KeyPress.Result {
        guard !visibleIds.isEmpty else { return .ignored }
        cursor = ConversationKeyboardCursor.moved(cursor, move, in: visibleIds)
        return .handled
    }

    private func open() -> KeyPress.Result {
        guard let cursor else { return .ignored }
        onOpen(cursor)
        return .handled
    }

    private func release() -> KeyPress.Result {
        guard cursor != nil else { return .ignored }
        cursor = nil
        return .handled
    }
}

struct KeyboardCursorRing: View {
    let isActive: Bool
    let accentColor: String

    @ViewBuilder
    var body: some View {
        if isActive {
            RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                .strokeBorder(Color(hex: accentColor), lineWidth: MeeshyBorder.strong)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .background(CursorRevealAnchor())
        }
    }
}

struct CursorRevealAnchor: UIViewRepresentable {

    func makeUIView(context: Context) -> RevealView {
        let view = RevealView()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: RevealView, context: Context) {}

    final class RevealView: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil else { return }
            DispatchQueue.main.async { [weak self] in self?.reveal() }
        }

        private func reveal() {
            guard let scrollView = enclosingScrollView else { return }
            let rect = convert(bounds, to: scrollView).insetBy(dx: 0, dy: -12)
            scrollView.scrollRectToVisible(rect, animated: true)
        }

        private var enclosingScrollView: UIScrollView? {
            var node = superview
            while let current = node {
                if let scroll = current as? UIScrollView { return scroll }
                node = current.superview
            }
            return nil
        }
    }
}
