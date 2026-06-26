import SwiftUI
import UIKit
import MeeshySDK

/// Column of 2 floating action buttons (Contenu + Effets) pinned to the
/// bottom-leading corner. Pure presentation — owns no state.
///
/// Inputs are primitives (`Int`, optional `BandCategory`) so the view is
/// `Equatable` and skips re-evaluation when its inputs haven't changed.
struct ComposerFABColumn: View, Equatable {
    let mediaBadge: Int
    let sonBadge: Int
    let textBadge: Int
    let drawingBadge: Int
    let filtersBadge: Int
    let timelineBadge: Int
    let activeCategory: BandCategory?

    let onTap: (BandCategory) -> Void
    let onSwipeUp: (BandCategory) -> Void
    let onSwipeDownAny: () -> Void

    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 12) {
            fab(category: .timeline, icon: "clock", badge: timelineBadge)
            fab(category: .filters, icon: "camera.filters", badge: filtersBadge)
            fab(category: .drawing, icon: "pencil.tip", badge: drawingBadge)
            fab(category: .text, icon: "textformat", badge: textBadge)
            fab(category: .son, icon: "music.note", badge: sonBadge)
            fab(category: .media, icon: "play.rectangle.fill", badge: mediaBadge)
        }
        .padding(.leading, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    }

    @ViewBuilder
    private func fab(
        category: BandCategory,
        icon: String,
        badge: Int
    ) -> some View {
        let isActive = activeCategory == category
        let accent: Color = {
            switch category {
            case .media: return MeeshyColors.error
            case .son: return MeeshyColors.indigo400
            case .text: return MeeshyColors.indigo400
            case .drawing: return MeeshyColors.success
            case .filters: return MeeshyColors.info
            case .timeline: return MeeshyColors.indigo300
            }
        }()

        FABPanGestureWrapper(onSwipeUp: { onSwipeUp(category) }, onSwipeDown: onSwipeDownAny) {
            Button(action: {
                let gen = UIImpactFeedbackGenerator(style: .medium)
                gen.impactOccurred()
                onTap(category)
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
                            .background(accent)
                            .clipShape(Capsule())
                            .offset(x: 6, y: -6)
                            .accessibilityHidden(true)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Ouvrir l'outil \(String(describing: category))")
            .accessibilityValue(badge > 0 ? "\(badge) éléments actifs" : "Aucun élément")
            .accessibilityHint(isActive ? "Touchez deux fois pour fermer." : "Touchez deux fois pour ouvrir.")
        }
        .frame(width: 56, height: 56)
    }

    static func == (lhs: ComposerFABColumn, rhs: ComposerFABColumn) -> Bool {
        lhs.mediaBadge == rhs.mediaBadge
            && lhs.sonBadge == rhs.sonBadge
            && lhs.textBadge == rhs.textBadge
            && lhs.drawingBadge == rhs.drawingBadge
            && lhs.filtersBadge == rhs.filtersBadge
            && lhs.timelineBadge == rhs.timelineBadge
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
