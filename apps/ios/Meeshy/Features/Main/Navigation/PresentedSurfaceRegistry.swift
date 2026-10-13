import Foundation

/// Une famille de surface présentée par-dessus la navigation.
nonisolated enum PresentedSurfaceKind: String, Sendable, CaseIterable {
    case storyViewer
    case reels
    case conversationCover
    case mediaGallery
    case composer
}

/// Ce qu'une surface répond à l'ouverture d'une conversation.
nonisolated enum PresentedSurfaceYield: Sendable {
    /// Elle se referme : rien de ce qu'elle porte ne se perd.
    case closes
    /// Elle tient un travail qu'une fermeture perdrait : elle reste, et la
    /// conversation s'ouvre quand elle part.
    case retains
}

nonisolated struct PresentedSurfaceToken: Hashable, Sendable {
    let id = UUID()
}

/// **Ce qui est présenté par-dessus la navigation, et qui s'efface devant une
/// conversation** (#10539).
///
/// Une notification de message touchée pendant une story, un réel ou une
/// galerie ouvrait la conversation DESSOUS : la pile changeait, la surface
/// restait. Un écran recouvert ne sait pas qu'il l'est (#9052) ; c'est donc le
/// contenu présenté qui se DÉCLARE ici, avec sa façon de se refermer, et le
/// routeur — seul — qui demande le passage.
@MainActor
protocol PresentedSurfaceRegistryProviding: AnyObject {
    /// `answer` est relu à chaque demande : un composer change de réponse selon
    /// ce qu'il tient.
    func declare(_ kind: PresentedSurfaceKind,
                 answer: @escaping @MainActor () -> PresentedSurfaceYield,
                 close: @escaping @MainActor () -> Void) -> PresentedSurfaceToken

    func retire(_ token: PresentedSurfaceToken)

    /// Referme ce qui se referme, puis appelle `open`. `closedSurfaces` dit si
    /// une surface est en train de partir : la conversation se pose alors
    /// dessous sans animation, et c'est la fermeture qui la révèle.
    ///
    /// Une surface qui RETIENT garde aussi tout ce qui est sous elle (le
    /// refermer la démonterait) ; `open` attend alors son départ.
    func clearForConversation(_ open: @escaping @MainActor (_ closedSurfaces: Bool) -> Void)
}

@MainActor
final class PresentedSurfaceRegistry: PresentedSurfaceRegistryProviding {
    nonisolated deinit {}

    static let shared = PresentedSurfaceRegistry()

    private struct Declared {
        let token: PresentedSurfaceToken
        let kind: PresentedSurfaceKind
        let answer: @MainActor () -> PresentedSurfaceYield
        let close: @MainActor () -> Void
    }

    private struct AwaitingOpening {
        let open: @MainActor (Bool) -> Void
        let since: Date
    }

    private var declared: [Declared] = []
    private var awaiting: AwaitingOpening?
    private let now: () -> Date
    private let awaitingValidity: TimeInterval

    /// `awaitingValidity` : au-delà, une ouverture retenue est oubliée — on ne
    /// propulse pas dans une conversation quelqu'un qui a fini de composer dix
    /// minutes après avoir touché la notification.
    init(now: @escaping () -> Date = { Date() }, awaitingValidity: TimeInterval = 120) {
        self.now = now
        self.awaitingValidity = awaitingValidity
    }

    /// Du dessous vers le dessus : l'ordre de déclaration est celui de
    /// présentation.
    var declaredKinds: [PresentedSurfaceKind] { declared.map(\.kind) }

    func declare(_ kind: PresentedSurfaceKind,
                 answer: @escaping @MainActor () -> PresentedSurfaceYield,
                 close: @escaping @MainActor () -> Void) -> PresentedSurfaceToken {
        let token = PresentedSurfaceToken()
        declared.append(Declared(token: token, kind: kind, answer: answer, close: close))
        return token
    }

    func retire(_ token: PresentedSurfaceToken) {
        guard let index = declared.firstIndex(where: { $0.token == token }) else { return }
        declared.remove(at: index)
        resumeAwaitingOpening()
    }

    func clearForConversation(_ open: @escaping @MainActor (_ closedSurfaces: Bool) -> Void) {
        let topRetainer = declared.lastIndex { $0.answer() == .retains }
        let closing = Array(declared[(topRetainer.map { $0 + 1 } ?? 0)...])
        // Retirées AVANT d'être refermées : une fermeture peut rappeler
        // `retire`, et ne doit ni rejouer ni relancer une ouverture en attente.
        declared.removeLast(closing.count)
        closing.forEach { $0.close() }
        guard topRetainer == nil else {
            awaiting = AwaitingOpening(open: open, since: now())
            return
        }
        awaiting = nil
        open(!closing.isEmpty)
    }

    private func resumeAwaitingOpening() {
        guard let pending = awaiting, !declared.contains(where: { $0.answer() == .retains }) else { return }
        awaiting = nil
        guard now().timeIntervalSince(pending.since) <= awaitingValidity else { return }
        clearForConversation(pending.open)
    }
}
