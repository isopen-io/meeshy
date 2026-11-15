import Foundation
import Combine

/// **Le maillon qui OBSERVE les frappeurs pour la pastille** (issue #4049).
///
/// `ConnectionBanner` compose ses entrées de frappe depuis
/// `ConversationListViewModel.typingUsers`. Personne, sur le chemin, n'était
/// abonné à ce `@Published` — et pour deux raisons chacune défendable :
///
/// - **l'hôte ne l'observe pas, exprès.** `ConversationListVMOwner`
///   (`RootView`, `iPadRootView`) n'a aucun `@Published` : son
///   `objectWillChange` ne fire jamais, donc le churn du view-model (présence,
///   `reloadFromCache`, compteurs de non-lus) ne ré-évalue pas
///   `RootView.body`. C'est « Zero Unnecessary Re-render », et cela reste.
/// - **la bannière ne l'observe pas non plus.** Elle le reçoit en `let`, et un
///   `let` sur un `ObservableObject` n'abonne rien. L'injection est en `let`
///   parce qu'un `@EnvironmentObject` dans un `.overlay` crash dans ce dépôt
///   (motif documenté 4×).
///
/// Résultat : quand quelqu'un se mettait à écrire, rien ne recalculait
/// `entries`. La pastille n'apparaissait que par coïncidence — quand un autre
/// signal (statut de connexion, file d'attente, tous deux correctement
/// observés via `@StateObject`) faisait re-rendre la bannière. D'où le rapport
/// porteur : « ne s'affiche pas correctement instantanément à partir de
/// n'importe où ».
///
/// Cette source republie les frappeurs pour la bannière SEULE : la re-render
/// reste confinée à la pastille, l'hôte n'observe toujours rien.
///
/// **Elle prend un `AnyPublisher`, jamais le view-model.** Deux raisons : elle
/// se teste alors avec un `CurrentValueSubject` plutôt qu'en montant la moitié
/// de l'application, et le flux invité (aucune liste de conversations) se dit
/// `nil` sans cas particulier — les entrées de frappe disparaissent, le reste
/// de la pastille fonctionne à l'identique.
@MainActor
final class TypingEntriesSource: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// conversationId → `@pseudo` du frappeur retenu pour cette conversation.
    @Published private(set) var typingUsers: [String: String] = [:]

    private var cancellable: AnyCancellable?

    init(publisher: AnyPublisher<[String: String], Never>?) {
        guard let publisher else { return }
        // `receive(on:)` volontairement ABSENT : l'amont est déjà `@MainActor`
        // (`ConversationListViewModel`), et un saut de file retarderait d'un
        // tour de boucle l'apparition d'une pastille dont tout l'intérêt est
        // d'être instantanée. Un `CurrentValueSubject` livre de plus sa valeur
        // courante à la souscription — c'est ce qui affiche la frappe DÉJÀ en
        // cours au moment où la bannière se monte.
        cancellable = publisher.sink { [weak self] users in
            self?.typingUsers = users
        }
    }
}
