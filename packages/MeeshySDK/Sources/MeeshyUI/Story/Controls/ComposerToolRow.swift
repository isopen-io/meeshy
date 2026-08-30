import SwiftUI
import UIKit
import MeeshySDK

/// **La rangée d'outils de l'atelier — à la FORME de la rangée canonique**
/// (#4136, directive porteur 2026-08-28 : « les FABs deviennent similaires à la
/// rangée canonique »).
///
/// Elle fut six pastilles rondes de 48 pt, en `HStack` figé. Ce qu'on fixe ici
/// n'est pas la mise en page d'un écran : c'est le **patron d'édition d'une
/// slide** — en-tête, plateau, rangée canonique, socle — que toute surface
/// éditant une slide reprendra.
///
/// ## Ce que la forme canonique apporte, et ce n'est pas cosmétique
///
/// La rangée du document (`ComposerDocumentSurface.toolRow`) DÉFILE. Le besoin
/// est mesuré, pas supposé : à `accessibility-XXXL` une rangée figée de six
/// outils dépasse la largeur de l'écran et se fait couper des deux côtés — des
/// outils qu'aucun geste n'atteint. Six pastilles de 48 pt + 5 interstices
/// tenaient sur 375 pt à taille NOMINALE ; c'est le raisonnement d'origine, et
/// il ne dit rien des tailles accessibles.
///
/// ## Ce que la forme canonique N'apporte PAS, et qu'on garde
///
/// Deux états que la rangée du document ne porte pas, et les perdre serait une
/// régression sèche :
/// - le **compteur** par outil (« 3 éléments sur cette scène ») — sans lui,
///   l'auteur doit ouvrir chaque outil pour savoir lequel porte du travail ;
/// - l'outil **ACTIF**, teinté de son accent, exactement comme la palette de
///   fond du document se teinte quand elle est dépliée.
///
/// ## Et ce qui DIFFÈRE volontairement de la canonique
///
/// La rangée du document peint ses icônes en `textSecondary(isDark: true)` —
/// un gris clair, juste parce qu'elle vit sur un plateau toujours sombre. Le
/// plateau de l'ATELIER prend la couleur du fond de la scène (#4124) : sur un
/// fond pastel, ce gris disparaît. D'où `glassControlForeground()`, adaptatif,
/// comme les autres commandes de l'atelier depuis #4124.
///
/// ## Ce que la ressemblance ne doit PAS laisser croire
///
/// Les deux rangées ne portent pas la même chose : celle du document ouvre des
/// **portes d'ingestion** (photo, caméra, fichier, lieu, micro), celle-ci
/// outille la **scène** (texte, dessin, fond, timeline). Unifier la forme sans
/// le dire inviterait à recopier une entrée de l'une dans l'autre « par
/// ressemblance de nom » — le défaut que `ComposerOverflowPolicy` documente
/// déjà pour le `⋯`. La garde `ComposerToolRowSetsTests` l'interdit.
///
/// Grammaire gestuelle CONSERVÉE : tap = ouvre/ferme le panneau, swipe-up sur
/// un outil = ouvre, swipe-down = cache les outils (canvas nu + poignée
/// fantôme C3). Le défilement est HORIZONTAL, les deux gestes sont VERTICAUX :
/// ils ne se disputent pas la même direction.
///
/// Inputs primitifs (`Int`, `BandCategory?`) pour rester `Equatable` et sauter
/// la ré-évaluation quand rien n'a changé.
struct ComposerToolRow: View, Equatable {
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

    /// **Le slot de tête, et c'est par lui que l'icône de description entre**
    /// (#4136). Le SDK ne sait pas ce qu'est une description : son texte
    /// appartient au meuble, qui l'injecte par
    /// `storyComposerToolRowLeadingAccessory` — même patron que l'accessoire de
    /// la rangée haute (#4124), et même raison (SDK purity).
    var leadingAccessory: AnyView?

    @Environment(\.theme) private var theme

    /// L'écart canonique de la rangée du document. Il remplace les 10 pt des
    /// pastilles : sans cercle autour de l'icône, un interstice serré collait
    /// les glyphes.
    private static let spacing: CGFloat = 16

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Self.spacing) {
                if let leadingAccessory {
                    leadingAccessory
                }
                // Ordre canonique unique (`StoryToolMode.composerOrder`) : cette
                // rangée en EST la référence, la grille d'état vide et les chips
                // de switch la suivent. Six appels manuels laissaient trois
                // ordres diverger.
                ForEach(StoryToolMode.composerOrder, id: \.rawValue) { tool in
                    entry(tool: tool)
                }
            }
            // Le padding vertical vit ICI, dans le contenu défilant : posé sur
            // le `ScrollView`, il rognerait la zone tactile des icônes au lieu
            // de les aérer. C'est le raisonnement de la rangée canonique, repris
            // au mot.
            .padding(.vertical, 2)
            .padding(.horizontal, Self.spacing)
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func entry(tool: StoryToolMode) -> some View {
        let category = tool.bandCategory
        let badge = badge(for: tool)
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
                glyph(tool: tool, accent: accent, isActive: isActive, badge: badge)
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
        .frame(width: Self.hitSide, height: Self.hitSide)
    }

    /// **La cible tactile ne suit PAS l'icône.** Le glyphe canonique fait
    /// ~22 pt ; le laisser porter la cible descendrait sous les 44 pt du HIG,
    /// que les pastilles de 48 pt tenaient sans y penser. Le débord est INVISIBLE
    /// (`contentShape`), la forme rendue reste l'icône nue.
    private static let hitSide: CGFloat = 44

    @ViewBuilder
    private func glyph(tool: StoryToolMode, accent: Color, isActive: Bool, badge: Int) -> some View {
        Image(systemName: tool.symbolName)
            .font(.title3)
            .symbolRenderingMode(.hierarchical)
            .modifier(ToolRowForeground(accent: isActive ? accent : nil))
            .accessibilityHidden(true)
            .frame(width: Self.hitSide, height: Self.hitSide)
            .contentShape(Rectangle())
            .overlay(alignment: .topTrailing) {
                if badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 15, minHeight: 15)
                        .background(accent)
                        .clipShape(Capsule())
                        .accessibilityHidden(true)
                }
            }
    }

    /// Compteur d'éléments de l'outil. Les six pastilles arrivent en primitives
    /// (`Int`) pour que la vue reste `Equatable` ; ce switch les re-associe à
    /// l'outil pour que l'ordre soit consommé, pas récrit.
    private func badge(for tool: StoryToolMode) -> Int {
        switch tool {
        case .media:    return mediaBadge
        case .audio:    return sonBadge
        case .text:     return textBadge
        case .drawing:  return drawingBadge
        case .texture:  return textureBadge
        case .timeline: return timelineBadge
        case .filters:  return 0   // hors `composerOrder` — jamais rendu
        }
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

    static func == (lhs: ComposerToolRow, rhs: ComposerToolRow) -> Bool {
        lhs.mediaBadge == rhs.mediaBadge
            && lhs.sonBadge == rhs.sonBadge
            && lhs.textBadge == rhs.textBadge
            && lhs.drawingBadge == rhs.drawingBadge
            && lhs.textureBadge == rhs.textureBadge
            && lhs.timelineBadge == rhs.timelineBadge
            && lhs.activeCategory == rhs.activeCategory
    }
}

/// Le premier plan d'une icône de la rangée : l'accent quand l'outil est ACTIF,
/// le verre adaptatif sinon. Extrait en modifier parce que
/// `glassControlForeground()` n'est pas un `Color` et ne peut pas entrer dans un
/// ternaire avec l'accent — écrire les deux branches en ligne aurait dupliqué
/// tout le glyphe.
private struct ToolRowForeground: ViewModifier {
    let accent: Color?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let accent {
            content.foregroundStyle(accent)
        } else {
            content.glassControlForeground()
        }
    }
}

// MARK: - UIPanGestureRecognizer wrapper for swipe ↑/↓ detection

// Coordinator is intentionally non-nested and non-generic: nesting it inside
// `FABPanGestureWrapper<Content>` made it implicitly parameterized by `Content`,
// which triggered a swift-frontend SIGSEGV in the `EarlyPerfInliner` pass
// (`isCallerAndCalleeLayoutConstraintsCompatible`) when compiling its deinit
// under `-O`. See Xcode Cloud build #389.
final class FABPanGestureCoordinator: NSObject, UIGestureRecognizerDelegate {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
        // L'environnement SwiftUI ne traverse pas un UIHostingController : le
        // `\.colorScheme` épinglé par le parent (chrome canvas) serait perdu et
        // le contenu suivrait le thème de l'app. On forwarde via les traits.
        host.overrideUserInterfaceStyle = context.environment.colorScheme == .dark ? .dark : .light
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
        context.coordinator.hostingController?.overrideUserInterfaceStyle =
            context.environment.colorScheme == .dark ? .dark : .light
        (context.coordinator.hostingController as? UIHostingController<Content>)?.rootView = content()
    }

    func makeCoordinator() -> FABPanGestureCoordinator {
        FABPanGestureCoordinator(onSwipeUp: onSwipeUp, onSwipeDown: onSwipeDown)
    }
}
