import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Chip Drop Resolver

/// Décision du drop de la chip : « Épingles » épingle la conversation si
/// elle ne l'est pas déjà — jamais de dés-épinglage par drop, l'action
/// dédiée Pin/Unpin du menu reste le seul chemin de retrait ; une section
/// la déplace sauf no-op (même section) ; hors cible = annulation. Fonction
/// pure — testée dans `ConversationChipDropResolverTests`.
enum ChipDropAction: Equatable {
    case pin
    case move(sectionId: String)
    case none
}

enum ChipDropResolver {
    /// `isAutoScrolling` : un header qui DÉFILE sous le doigt stationnaire
    /// (auto-scroll de bord en mouvement à l'instant du relâchement) ne doit
    /// pas capter le drop — à 415-900 pt/s la cible attrapée est une loterie
    /// et le relâchement en plein défilement est une intention d'abandon
    /// (épinglage/déplacement accidentels vécus en test 2026-07-05). Au
    /// CLAMP (liste en butée, headers au repos), le flag retombe et les
    /// drops en zone de bord restent légitimes.
    static func action(
        droppedOn sectionId: String?,
        isPinned: Bool,
        currentSectionId: String,
        isAutoScrolling: Bool = false
    ) -> ChipDropAction {
        guard !isAutoScrolling else { return .none }
        guard let sectionId else { return .none }
        if sectionId == "pinned" { return isPinned ? .none : .pin }
        let targetId = sectionId == "other" ? "" : sectionId
        return targetId == currentSectionId ? .none : .move(sectionId: targetId)
    }
}

// MARK: - Chip Auto-Scroll (Phase 3 du morph drag-n-drop)

/// Loi de vitesse de l'auto-scroll pendant le drag de la chip : le doigt qui
/// stationne dans une zone de bord du viewport fait défiler la liste pour
/// rendre atteignables les headers de section hors écran. Rampe linéaire
/// (bord = pleine vitesse, sortie de zone = 0) et clamp de l'offset aux
/// bornes réelles du contenu. Fonctions pures — testées dans
/// `ConversationChipAutoScrollTests`.
enum ChipAutoScroll {
    /// Profondeur (pt) des zones de déclenchement en haut/bas du viewport.
    static let zoneHeight: CGFloat = 130
    /// Vitesse de défilement (pt/s) au bord même du viewport.
    static let maxSpeed: CGFloat = 900

    /// Vitesse signée pour une position de doigt donnée (coordonnées fenêtre) :
    /// négative = défile vers le haut (révèle les sections au-dessus),
    /// positive = vers le bas, 0 hors des zones de bord.
    static func speed(fingerY: CGFloat, viewportMinY: CGFloat, viewportMaxY: CGFloat) -> CGFloat {
        let topDepth = (viewportMinY + zoneHeight - fingerY) / zoneHeight
        if topDepth > 0 { return -min(1, topDepth) * maxSpeed }
        let bottomDepth = (fingerY - (viewportMaxY - zoneHeight)) / zoneHeight
        if bottomDepth > 0 { return min(1, bottomDepth) * maxSpeed }
        return 0
    }

    /// Plus long pas de temps crédité à un tick (s). Après un hoquet de
    /// l'horloge (app suspendue, frame perdue) le temps RÉEL écoulé est grand :
    /// le créditer en entier ferait sauter la liste sous la chip.
    static let maxStep: TimeInterval = 1.0 / 20.0

    /// Déplacement (pt) pour `elapsed` secondes à `speed` pt/s. Le pas suit le
    /// temps RÉEL entre deux images, pas une fraction nominale : à 30, 60 ou
    /// 120 Hz la liste défile à la même vitesse (#9883).
    static func displacement(speed: CGFloat, elapsed: TimeInterval) -> CGFloat {
        speed * CGFloat(min(max(0, elapsed), maxStep))
    }

    /// L'horloge ne tourne que tant que le doigt est dans une zone de bord :
    /// à vitesse nulle il n'y a rien à défiler, ni à hit-tester.
    static func shouldRun(speed: CGFloat) -> Bool {
        speed != 0
    }

    /// Offset proposé, ramené dans [-topInset, fin de contenu] — l'auto-scroll
    /// ne doit jamais produire d'overscroll (qui armerait visuellement le
    /// pull-to-refresh ou ferait rebondir la liste sous la chip).
    static func clampedOffset(
        _ proposed: CGFloat,
        contentHeight: CGFloat,
        viewportHeight: CGFloat,
        topInset: CGFloat,
        bottomInset: CGFloat
    ) -> CGFloat {
        let minOffset = -topInset
        let maxOffset = max(minOffset, contentHeight + bottomInset - viewportHeight)
        return min(max(proposed, minOffset), maxOffset)
    }
}

/// Pilote l'auto-scroll : boîte de référence VOLONTAIREMENT hors du graphe
/// SwiftUI (même famille que `SectionFrameRegistry`) — le tick écrit
/// `contentOffset` directement sur l'UIScrollView hôte, donc aucune
/// invalidation de la liste ; les GeometryReader des headers republient leurs
/// frames dans le registre inerte à chaque frame défilée, et `onScrollTick`
/// re-hit-teste la cible sous le doigt STATIONNAIRE (le DragGesture ne
/// re-fire pas sans mouvement du doigt).
@MainActor
final class ChipAutoScrollDriver {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    weak var scrollView: UIScrollView?
    /// Rebranché à chaque verrouillage de la chip, relâché par `stop()` (le
    /// closure capture la View : le garder à demeure lierait le cycle
    /// State-box → driver → closure → View → State-box).
    var onScrollTick: ((CGPoint) -> Void)?
    /// true tant que le dernier tick a RÉELLEMENT déplacé l'offset — lu par
    /// `handleChipDrop` pour rendre le drop inerte pendant le défilement
    /// (voir `ChipDropResolver.action(isAutoScrolling:)`). Retombe à false
    /// dès que la liste est en butée ou le doigt hors zone.
    private(set) var isActivelyScrolling = false

    private var link: CADisplayLink?
    private var fingerLocation: CGPoint = .zero

    /// Le doigt a bougé. L'horloge d'affichage naît au premier appel, tourne
    /// tant que le doigt est dans une zone de bord, et dort (`isPaused`) dès
    /// qu'il en sort : `update` est rappelé à chaque mouvement du doigt, donc le
    /// réveil n'attend jamais un tick.
    ///
    /// Le drapeau `isActivelyScrolling` retombe ICI quand le doigt sort de la
    /// zone : l'horloge endormie ne tique plus, et le drop qui suit sur une
    /// section serait sinon rendu inerte par un défilement déjà arrêté.
    func update(fingerLocation location: CGPoint) {
        fingerLocation = location
        let running = ChipAutoScroll.shouldRun(speed: currentSpeed())
        if !running { isActivelyScrolling = false }
        ensureLink().isPaused = !running
    }

    func stop() {
        link?.invalidate()
        link = nil
        onScrollTick = nil
        isActivelyScrolling = false
    }

    private func ensureLink() -> CADisplayLink {
        if let link { return link }
        // Proxy weak (WeakDisplayLinkTarget) : un link `target: self` retiendrait
        // le driver, donc la View par `onScrollTick`. Plage 30…60 Hz : le doigt
        // ne demande pas 120 Hz de défilement.
        let created = WeakDisplayLinkTarget.makeLink(frameRateRange: .clock) { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.tick(link)
        }
        created.add(to: .main, forMode: .common)
        link = created
        return created
    }

    private func currentSpeed() -> CGFloat {
        guard let scrollView else { return 0 }
        let viewport = scrollView.convert(scrollView.bounds, to: nil)
        return ChipAutoScroll.speed(
            fingerY: fingerLocation.y,
            viewportMinY: viewport.minY,
            viewportMaxY: viewport.maxY
        )
    }

    private func tick(_ link: CADisplayLink) {
        link.isPaused = !advance(elapsed: link.targetTimestamp - link.timestamp)
    }

    /// Un pas d'auto-scroll de `elapsed` secondes. Rend `false` quand il n'y a
    /// plus rien à défiler (doigt hors zone, liste absente) : l'horloge peut
    /// alors dormir jusqu'au prochain mouvement du doigt.
    @discardableResult
    func advance(elapsed: TimeInterval) -> Bool {
        let speed = currentSpeed()
        guard let scrollView, ChipAutoScroll.shouldRun(speed: speed) else {
            isActivelyScrolling = false
            return false
        }
        let clamped = ChipAutoScroll.clampedOffset(
            scrollView.contentOffset.y + ChipAutoScroll.displacement(
                speed: speed,
                elapsed: elapsed
            ),
            contentHeight: scrollView.contentSize.height,
            viewportHeight: scrollView.bounds.height,
            topInset: scrollView.adjustedContentInset.top,
            bottomInset: scrollView.adjustedContentInset.bottom
        )
        guard clamped != scrollView.contentOffset.y else {
            isActivelyScrolling = false
            return true
        }
        isActivelyScrolling = true
        scrollView.contentOffset.y = clamped
        onScrollTick?(fingerLocation)
        return true
    }
}

/// UIView invisible plantée dans le contenu du scroll : remonte la hiérarchie
/// jusqu'à l'UIScrollView hôte et le confie au driver. Seul moyen sous
/// iOS 16 de piloter l'offset en continu — `ScrollViewReader.scrollTo` ne
/// sait pas défiler proportionnellement (et rate les ids non instanciés du
/// LazyVStack), `scrollPosition(y:)` est iOS 17+.
struct ChipAutoScrollGrabber: UIViewRepresentable {
    let driver: ChipAutoScrollDriver

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // La chaîne de superviews n'est attachée qu'après le montage — hop
        // asynchrone pour marcher jusqu'au scroll hôte une fois en place.
        DispatchQueue.main.async { [weak driver] in
            var candidate: UIView? = uiView.superview
            while let current = candidate, !(current is UIScrollView) {
                candidate = current.superview
            }
            driver?.scrollView = candidate as? UIScrollView
        }
    }
}
