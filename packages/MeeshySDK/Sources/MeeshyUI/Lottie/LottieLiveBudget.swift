import Combine
import Foundation

// MARK: - Le plafond des films vivants (#10815)

/// **Combien de couches Lottie jouent à la fois** — miroir de `createLottieBudget`
/// (`apps/web/src/lib/lottie/budget.ts`).
///
/// Une liste longue (conversations, fil, participants) porte un contour animé par
/// rangée ; sans borne, chaque rangée passée à l'écran laisserait un film qui joue.
/// Le budget accorde au plus `max` places :
/// - une couche qui ENTRE à l'écran demande une place ; libre, elle l'obtient ;
/// - une couche qui SORT de l'écran garde sa place (elle reprendra là où elle était)
///   tant que personne n'en a besoin ;
/// - sous pression, la place la plus anciennement sortie est reprise (`evict`) : la
///   couche revient à son image fixe ;
/// - si toutes les places sont à l'écran, la nouvelle venue montre son image fixe et
///   attend son tour, qu'elle perd si elle ressort avant.
public final class LottieLiveBudget {
    // iOS 26 : deinit synthétisée ISOLÉE au MainActor → double-free au démontage hors d'une tâche (#9694).
    nonisolated deinit {}


    /// Le budget de la session : huit films vivants, toutes surfaces confondues.
    public static let maxLiveLayers = 8

    public static let shared = LottieLiveBudget(max: maxLiveLayers)

    public typealias Ticket = Int

    private struct Entry {
        let grant: @MainActor () -> Void
        let evict: @MainActor () -> Void
        var visible = false
        var held = false
        var asleepSince = 0
    }

    public let max: Int
    private var entries: [Ticket: Entry] = [:]
    private var waiting: [Ticket] = []
    private var nextTicket: Ticket = 0
    private var clock = 0

    public init(max: Int) {
        self.max = max
    }

    /// Le nombre de couches qui tiennent une place.
    public var holders: Int {
        entries.values.filter(\.held).count
    }

    /// Inscrit une couche, sans place tant qu'elle n'est pas à l'écran.
    public func claim(grant: @escaping @MainActor () -> Void, evict: @escaping @MainActor () -> Void) -> Ticket {
        nextTicket += 1
        entries[nextTicket] = Entry(grant: grant, evict: evict)
        return nextTicket
    }

    public func setVisible(_ ticket: Ticket, _ visible: Bool) {
        guard var entry = entries[ticket], entry.visible != visible else { return }
        entry.visible = visible
        if visible {
            if !entry.held { waiting.append(ticket) }
        } else {
            waiting.removeAll { $0 == ticket }
            clock += 1
            entry.asleepSince = clock
        }
        entries[ticket] = entry
        pump()
    }

    /// La couche quitte la hiérarchie : sa place se libère pour la suivante.
    public func release(_ ticket: Ticket) {
        guard entries.removeValue(forKey: ticket) != nil else { return }
        waiting.removeAll { $0 == ticket }
        pump()
    }

    private func pump() {
        while let next = waiting.first {
            if holders >= max {
                guard let victim = oldestAsleep() else { return }
                entries[victim]?.held = false
                entries[victim]?.evict()
            }
            waiting.removeFirst()
            entries[next]?.held = true
            entries[next]?.grant()
        }
    }

    private func oldestAsleep() -> Ticket? {
        entries
            .filter { $0.value.held && !$0.value.visible }
            .min { $0.value.asleepSince < $1.value.asleepSince }?
            .key
    }
}

/// **La place d'UNE couche dans le budget**, observable par sa vue : `live` dit si
/// la couche peut jouer. La place se rend quand la vue quitte la hiérarchie.
final class LottieLiveSlot: ObservableObject {
    @Published private(set) var live = false

    private let budget: LottieLiveBudget
    private var ticket: LottieLiveBudget.Ticket?

    init(budget: LottieLiveBudget = .shared) {
        self.budget = budget
    }

    /// `true` quand la couche est à l'écran ET veut jouer.
    func wantsToPlay(_ wants: Bool) {
        if wants, ticket == nil {
            ticket = budget.claim(
                grant: { [weak self] in self?.live = true },
                evict: { [weak self] in self?.live = false }
            )
        }
        guard let ticket else { return }
        budget.setVisible(ticket, wants)
    }

    // iOS 26 : une deinit écrite sans `nonisolated` est isolée au MainActor → double-free au démontage
    // hors d'une tâche (#9694). Le corps ne lit que des valeurs Sendable et poste la libération.
    nonisolated deinit {
        guard let ticket else { return }
        let budget = self.budget
        Task { @MainActor in budget.release(ticket) }
    }
}
