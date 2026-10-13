import Foundation

/// Une famille de surface présentée par-dessus la navigation.
nonisolated enum PresentedSurfaceKind: String, Sendable, CaseIterable {
    case storyViewer
    case reels
    case conversationCover
    case mediaGallery
    case composer
    /// Une feuille présentée seule : commentaires, infos de conversation,
    /// aperçu d'un toast, sélecteur de partage, nouvelle conversation (#10543).
    case sheet
    case place
    case search
    case profilePhoto
    case contactCard
    /// Un écran du jeu : il RETIENT, une partie en cours ne se perd pas.
    case game
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

/// La fenêtre (scène) d'une surface ou d'une demande (#10543) : un routeur par
/// fenêtre, une portée par routeur. Une ouverture ne referme que les surfaces
/// de SA fenêtre — et celles qui n'ont pas su dire la leur (`nil` : contenu
/// hébergé par UIKit, lecteur de réels partagé), refermées comme avant.
nonisolated struct PresentedSurfaceScope: Hashable, Sendable {
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
                 scope: PresentedSurfaceScope?,
                 answer: @escaping @MainActor () -> PresentedSurfaceYield,
                 close: @escaping @MainActor () -> Void) -> PresentedSurfaceToken

    func retire(_ token: PresentedSurfaceToken)

    /// Referme ce qui se referme dans la fenêtre `scope`, puis appelle `open`.
    /// `closedSurfaces` dit si une surface est en train de partir : la cible se
    /// pose alors dessous sans animation, et c'est la fermeture qui la révèle.
    ///
    /// Une surface qui RETIENT garde aussi tout ce qui est sous elle (le
    /// refermer la démonterait) ; `open` attend alors son départ.
    func clearForConversation(in scope: PresentedSurfaceScope?,
                              _ open: @escaping @MainActor (_ closedSurfaces: Bool) -> Void)
}

extension PresentedSurfaceRegistryProviding {
    /// Sans portée : la surface se referme pour toute fenêtre.
    func declare(_ kind: PresentedSurfaceKind,
                 answer: @escaping @MainActor () -> PresentedSurfaceYield,
                 close: @escaping @MainActor () -> Void) -> PresentedSurfaceToken {
        declare(kind, scope: nil, answer: answer, close: close)
    }

    /// Sans portée : la demande vaut pour toutes les fenêtres.
    func clearForConversation(_ open: @escaping @MainActor (_ closedSurfaces: Bool) -> Void) {
        clearForConversation(in: nil, open)
    }
}

@MainActor
final class PresentedSurfaceRegistry: PresentedSurfaceRegistryProviding {
    nonisolated deinit {}

    static let shared = PresentedSurfaceRegistry()

    private struct Declared {
        let token: PresentedSurfaceToken
        let kind: PresentedSurfaceKind
        let scope: PresentedSurfaceScope?
        let answer: @MainActor () -> PresentedSurfaceYield
        let close: @MainActor () -> Void

        func isReached(from requester: PresentedSurfaceScope?) -> Bool {
            guard let scope, let requester else { return true }
            return scope == requester
        }
    }

    private struct AwaitingOpening {
        let scope: PresentedSurfaceScope?
        let open: @MainActor (Bool) -> Void
        let since: Date
    }

    private var declared: [Declared] = []
    /// Une ouverture retenue par fenêtre : la dernière demandée.
    private var awaiting: [AwaitingOpening] = []
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
                 scope: PresentedSurfaceScope?,
                 answer: @escaping @MainActor () -> PresentedSurfaceYield,
                 close: @escaping @MainActor () -> Void) -> PresentedSurfaceToken {
        let token = PresentedSurfaceToken()
        declared.append(Declared(token: token, kind: kind, scope: scope, answer: answer, close: close))
        return token
    }

    func retire(_ token: PresentedSurfaceToken) {
        guard let index = declared.firstIndex(where: { $0.token == token }) else { return }
        declared.remove(at: index)
        resumeAwaitingOpenings()
    }

    func clearForConversation(in scope: PresentedSurfaceScope?,
                              _ open: @escaping @MainActor (_ closedSurfaces: Bool) -> Void) {
        awaiting.removeAll { $0.scope == scope }
        let reached = declared.filter { $0.isReached(from: scope) }
        let topRetainer = reached.lastIndex { $0.answer() == .retains }
        let closing = Array(reached[(topRetainer.map { $0 + 1 } ?? 0)...])
        // Retirées AVANT d'être refermées : une fermeture peut rappeler
        // `retire`, et ne doit ni rejouer ni relancer une ouverture en attente.
        let leaving = Set(closing.map(\.token))
        declared.removeAll { leaving.contains($0.token) }
        closing.forEach { $0.close() }
        guard topRetainer == nil else {
            awaiting.append(AwaitingOpening(scope: scope, open: open, since: now()))
            return
        }
        open(!closing.isEmpty)
    }

    private func resumeAwaitingOpenings() {
        let released = awaiting.filter { pending in
            !declared.contains { $0.isReached(from: pending.scope) && $0.answer() == .retains }
        }
        for pending in released {
            // Une ouverture relancée peut en avoir servi une autre entre-temps.
            guard let index = awaiting.firstIndex(where: { $0.scope == pending.scope && $0.since == pending.since }) else { continue }
            awaiting.remove(at: index)
            guard now().timeIntervalSince(pending.since) <= awaitingValidity else { continue }
            clearForConversation(in: pending.scope, pending.open)
        }
    }
}
