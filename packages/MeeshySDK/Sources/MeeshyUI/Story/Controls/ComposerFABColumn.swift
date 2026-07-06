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
    let textureBadge: Int
    let timelineBadge: Int
    let activeCategory: BandCategory?

    let onTap: (BandCategory) -> Void
    let onSwipeUp: (BandCategory) -> Void
    let onSwipeDownAny: () -> Void

    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 12) {
            fab(category: .timeline, icon: "clock", badge: timelineBadge)
            fab(category: .texture, icon: "paintpalette.fill", badge: textureBadge)
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
            case .texture: return MeeshyColors.warning
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
            // Audit a11y it.88 : `String(describing: category)` annonçait les
            // noms d'enum INTERNES (« texture », « son ») — jamais localisés
            // et incohérents avec les libellés affichés (« Fond »). VoiceOver
            // parle désormais la langue de l'UI, via les clés story.tool.*.
            .accessibilityLabel(String(
                localized: "story.composer.fab.open",
                defaultValue: "Ouvrir l'outil \(toolDisplayName(category))",
                bundle: .module
            ))
            .accessibilityValue(badge > 0
                ? String(localized: "story.composer.fab.badge",
                         defaultValue: "\(badge) élément(s) actif(s)", bundle: .module)
                : String(localized: "story.composer.fab.badge.none",
                         defaultValue: "Aucun élément", bundle: .module))
            .accessibilityHint(isActive
                ? String(localized: "story.composer.fab.hint.close",
                         defaultValue: "Touchez deux fois pour fermer.", bundle: .module)
                : String(localized: "story.composer.fab.hint.open",
                         defaultValue: "Touchez deux fois pour ouvrir.", bundle: .module))
        }
        .frame(width: 56, height: 56)
    }

    /// Nom AFFICHÉ de l'outil (mêmes clés que les tuiles/chips — story.tool.*),
    /// pour que VoiceOver annonce ce que l'écran montre.
    private func toolDisplayName(_ category: BandCategory) -> String {
        switch category {
        case .media:
            return String(localized: "story.tool.media", defaultValue: "Médias", bundle: .module)
        case .son:
            return String(localized: "story.tool.audio", defaultValue: "Son", bundle: .module)
        case .text:
            return String(localized: "story.tool.text", defaultValue: "Texte", bundle: .module)
        case .drawing:
            return String(localized: "story.tool.drawing", defaultValue: "Dessin", bundle: .module)
        case .filters:
            return String(localized: "story.tool.filters", defaultValue: "Effets", bundle: .module)
        case .timeline:
            return String(localized: "story.tool.timeline", defaultValue: "Timeline", bundle: .module)
        case .texture:
            return String(localized: "story.tool.texture", defaultValue: "Fond", bundle: .module)
        }
    }

    static func == (lhs: ComposerFABColumn, rhs: ComposerFABColumn) -> Bool {
        lhs.mediaBadge == rhs.mediaBadge
            && lhs.sonBadge == rhs.sonBadge
            && lhs.textBadge == rhs.textBadge
            && lhs.drawingBadge == rhs.drawingBadge
            && lhs.textureBadge == rhs.textureBadge
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
