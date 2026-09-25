import Combine
import Foundation
import MeeshySDK

/// **Le contrôleur de mention d'un brouillon composer, et son relais (#3904).**
///
/// Les contacts ne vivent plus ici (#7847) : `MentionComposerController` les
/// lit lui-même dans `MentionContactsStore` — le cache d'abord, le réseau au
/// `@` seulement si le cache est vide ou périmé. Un brouillon n'a pas de
/// participants (rien n'est encore publié), donc sa liste `@` est : contacts,
/// puis l'annuaire dès la deuxième lettre.
///
/// **Le relais `objectWillChange` est OBLIGATOIRE, pas cosmétique** (revue
/// Opus, 2026-08-27) : `@StateObject private var mentionBox` n'abonne la vue
/// hôte qu'au publisher de LA BOÎTE — `MentionComposerController` est un
/// `ObservableObject` imbriqué, Combine ne le traverse jamais tout seul. Sans
/// ce relais, lire `mentionBox.controller.activeQuery` dans un `body` ne
/// déclenche AUCUNE ré-évaluation quand `handleQuery` publie une nouvelle
/// requête : la bande de mentions n'apparaît qu'à la frappe SUIVANTE.
@MainActor
final class ComposerMentionControllerBox: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Même patron que `MentionComposerController.deinit`.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    private let contacts: MentionContactsProviding

    init(contacts: MentionContactsProviding = MentionContactsStore.shared) {
        self.contacts = contacts
    }

    /// **Le cache, sans un octet de réseau**, lu au montage de la surface :
    /// le `@` sert ensuite les contacts à l'image près. Le réchauffement
    /// réseau, lui, part à la frappe du `@` (`MentionComposerController`).
    func loadCandidates() async {
        await controller.primeContacts()
    }

    private var forwardCancellable: AnyCancellable?

    lazy var controller: MentionComposerController = {
        let controller = MentionComposerController(context: .composerDraft, contacts: contacts)
        forwardCancellable = controller.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
        return controller
    }()
}
