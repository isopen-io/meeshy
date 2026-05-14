import SwiftUI
import UIKit
import MeeshySDK

/// Column of 2 floating action buttons (Contenu + Effets) pinned to the
/// bottom-leading corner. Pure presentation — owns no state.
///
/// Inputs are primitives (`Int`, optional `BandCategory`) so the view is
/// `Equatable` and skips re-evaluation when its inputs haven't changed.
struct ComposerFABColumn: View, Equatable {
    let contenuBadge: Int
    let effetsBadge: Int
    let activeCategory: BandCategory?

    let onTapContenu: () -> Void
    let onTapEffets: () -> Void
    let onSwipeUpContenu: () -> Void
    let onSwipeUpEffets: () -> Void
    let onSwipeDownAny: () -> Void

    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 12) {
            fab(category: .effets, icon: "wand.and.stars", badge: effetsBadge,
                onTap: onTapEffets, onSwipeUp: onSwipeUpEffets, onSwipeDown: onSwipeDownAny)
            fab(category: .contenu, icon: "square.grid.2x2.fill", badge: contenuBadge,
                onTap: onTapContenu, onSwipeUp: onSwipeUpContenu, onSwipeDown: onSwipeDownAny)
        }
        .padding(.leading, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    }

    @ViewBuilder
    private func fab(
        category: BandCategory,
        icon: String,
        badge: Int,
        onTap: @escaping () -> Void,
        onSwipeUp: @escaping () -> Void,
        onSwipeDown: @escaping () -> Void
    ) -> some View {
        let isActive = activeCategory == category
        let accent: Color = category == .contenu ? MeeshyColors.indigo400 : MeeshyColors.indigo300

        FABPanGestureWrapper(onSwipeUp: onSwipeUp, onSwipeDown: onSwipeDown) {
            Button(action: {
                let gen = UIImpactFeedbackGenerator(style: .medium)
                gen.impactOccurred()
                onTap()
            }) {
                ZStack {
                    if isActive {
                        Circle().fill(MeeshyColors.brandGradient)
                    } else {
                        Circle().fill(.ultraThinMaterial)
                        Circle().stroke(accent.opacity(0.4), lineWidth: 1)
                    }
                    Image(systemName: icon)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(isActive ? .white : accent)
                        .accessibilityHidden(true)
                }
                .frame(width: 56, height: 56)
                .overlay(alignment: .topTrailing) {
                    if badge > 0 {
                        Text("\(badge)")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(MeeshyColors.indigo400)
                            .clipShape(Capsule())
                            .offset(x: 6, y: -6)
                            .accessibilityHidden(true)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(category == .contenu ? "Ouvrir les outils de contenu" : "Ouvrir les outils d'effets")
            .accessibilityValue(badge > 0 ? "\(badge) éléments actifs" : "Aucun élément")
            .accessibilityHint(isActive ? "Touchez deux fois pour fermer. Faites glisser vers le bas pour masquer la barre." : "Touchez deux fois pour ouvrir les outils. Faites glisser vers le haut pour forcer l'ouverture.")
        }
        .frame(width: 56, height: 56)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(category == .contenu ? "Ouvrir les outils de contenu" : "Ouvrir les outils d'effets")
        .accessibilityValue(badge > 0 ? "\(badge) éléments actifs" : "Aucun élément")
        .accessibilityHint(isActive ? "Touchez deux fois pour fermer. Faites glisser vers le bas pour masquer la barre." : "Touchez deux fois pour ouvrir les outils. Faites glisser vers le haut pour forcer l'ouverture.")
    }

    static func == (lhs: ComposerFABColumn, rhs: ComposerFABColumn) -> Bool {
        lhs.contenuBadge == rhs.contenuBadge
            && lhs.effetsBadge == rhs.effetsBadge
            && lhs.activeCategory == rhs.activeCategory
    }
}

// MARK: - UIPanGestureRecognizer wrapper for swipe ↑/↓ detection

// Coordinator is intentionally non-nested and non-generic: nesting it inside
// `FABPanGestureWrapper<Content>` made it implicitly parameterized by `Content`,
// which triggered a swift-frontend SIGSEGV in the `EarlyPerfInliner` pass
// (`isCallerAndCalleeLayoutConstraintsCompatible`) when compiling its deinit
// under `-O`. See Xcode Cloud build #389.
final class FABPanGestureCoordinator: NSObject, UIGestureRecognizerDelegate {
    var onSwipeUp: () -> Void
    var onSwipeDown: () -> Void
    var hostingController: UIViewController?

    init(onSwipeUp: @escaping () -> Void, onSwipeDown: @escaping () -> Void) {
        self.onSwipeUp = onSwipeUp
        self.onSwipeDown = onSwipeDown
    }

    @objc func handlePan(_ recognizer: UIPanGestureRecognizer) {
        guard recognizer.state == .ended else { return }
        let translation = recognizer.translation(in: recognizer.view)
        guard abs(translation.y) > abs(translation.x), abs(translation.y) > 20 else { return }
        if translation.y < 0 {
            onSwipeUp()
        } else {
            onSwipeDown()
        }
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool {
        return false
    }
}

struct FABPanGestureWrapper<Content: View>: UIViewRepresentable {
    typealias Coordinator = FABPanGestureCoordinator

    let onSwipeUp: () -> Void
    let onSwipeDown: () -> Void
    let content: () -> Content

    init(
        onSwipeUp: @escaping () -> Void,
        onSwipeDown: @escaping () -> Void,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.onSwipeUp = onSwipeUp
        self.onSwipeDown = onSwipeDown
        self.content = content
    }

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.isUserInteractionEnabled = true
        container.backgroundColor = .clear

        let host = UIHostingController(rootView: content())
        host.view.translatesAutoresizingMaskIntoConstraints = false
        host.view.backgroundColor = .clear
        container.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: container.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        context.coordinator.hostingController = host

        let pan = UIPanGestureRecognizer(target: context.coordinator,
                                         action: #selector(FABPanGestureCoordinator.handlePan(_:)))
        pan.maximumNumberOfTouches = 1
        pan.delegate = context.coordinator
        container.addGestureRecognizer(pan)
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onSwipeUp = onSwipeUp
        context.coordinator.onSwipeDown = onSwipeDown
        (context.coordinator.hostingController as? UIHostingController<Content>)?.rootView = content()
    }

    func makeCoordinator() -> FABPanGestureCoordinator {
        FABPanGestureCoordinator(onSwipeUp: onSwipeUp, onSwipeDown: onSwipeDown)
    }
}
