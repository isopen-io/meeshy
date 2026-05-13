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
                    }
                }
            }
            .buttonStyle(.plain)
        }
        .frame(width: 56, height: 56)
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

struct FABPanGestureWrapper<Content: View>: UIViewRepresentable {
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
                                         action: #selector(Coordinator.handlePan(_:)))
        pan.maximumNumberOfTouches = 1
        pan.delegate = context.coordinator
        container.addGestureRecognizer(pan)
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onSwipeUp = onSwipeUp
        context.coordinator.onSwipeDown = onSwipeDown
        context.coordinator.hostingController?.rootView = content()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onSwipeUp: onSwipeUp, onSwipeDown: onSwipeDown)
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onSwipeUp: () -> Void
        var onSwipeDown: () -> Void
        var hostingController: UIHostingController<Content>?

        init(onSwipeUp: @escaping () -> Void, onSwipeDown: @escaping () -> Void) {
            self.onSwipeUp = onSwipeUp
            self.onSwipeDown = onSwipeDown
        }

        @objc func handlePan(_ recognizer: UIPanGestureRecognizer) {
            guard recognizer.state == .ended else { return }
            let translation = recognizer.translation(in: recognizer.view)
            let velocity = recognizer.velocity(in: recognizer.view)
            // Only react if predominantly vertical
            guard abs(translation.y) > abs(translation.x), abs(translation.y) > 20 else { return }
            if translation.y < 0 {
                onSwipeUp()
            } else {
                onSwipeDown()
            }
            _ = velocity
        }

        // Don't recognize simultaneously with the canvas pinch/pan beneath.
        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            return false
        }
    }
}
