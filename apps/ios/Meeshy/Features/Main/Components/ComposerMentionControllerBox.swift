import Combine
import Foundation
import MeeshySDK

/// **Le pont entre un `@State` mutable et une closure figée à l'init (#3904).**
///
/// `MentionComposerController.init(localCandidates:)` capture sa closure UNE
/// fois, à la construction — mais les amis se chargent de façon ASYNCHRONE
/// (`.task`), après que le contrôleur existe déjà. Un `View` étant un
/// STRUCT, ses propriétés stockées ne peuvent pas se référencer entre elles
/// dans leurs valeurs par défaut (`self` n'existe pas encore) : le contrôleur
/// ne peut donc pas capturer directement un `@State` voisin de la vue.
///
/// Cette classe résout le problème en portant les DEUX ensemble : `candidates`
/// est réglable après coup, et `controller` est un `lazy var` — sa closure
/// `[weak self]` ne s'évalue qu'au premier accès, quand `self` est déjà
/// pleinement construit. Même patron que `ConversationViewModel.mentionController`
/// (`localCandidates: { [weak self] in self?.mentionCandidates ?? [] }`), ici
/// simplement remonté d'un cran pour que la vue reste un struct sans état
/// persistant propre.
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

    @Published var candidates: [MentionCandidate] = []

    /// **Cache d'abord, réseau ensuite — et jamais l'inverse** (directive
    /// porteur 2026-09-05 ; principe « Cache-First, Network-Second »).
    ///
    /// Les trois surfaces qui montent cette boîte appelaient
    /// `acceptedFriends()` dans un `.task`, c'est-à-dire un aller-retour
    /// RÉSEAU avant que le `@` nu puisse proposer qui que ce soit. Deux
    /// conséquences, l'une visible et l'autre pas :
    ///
    /// - à l'ouverture du composer, la bande restait vide le temps de la
    ///   requête — soit précisément la fenêtre où l'auteur tape ;
    /// - un ÉCHEC (la route des amis rendait 404 en production le 2026-09-05)
    ///   se traduisait par une liste vide, indiscernable d'un carnet
    ///   d'adresses vide.
    ///
    /// L'ordre ici corrige les deux, et le `guard` corrige un troisième défaut
    /// que le simple ajout du cache aurait introduit : **un rafraîchissement
    /// qui échoue ne doit pas EFFACER ce que le cache a déjà servi.** Deux
    /// écritures sur une même propriété, dont la seconde peut être vide, sont
    /// un remplacement — pas une mise à jour.
    /// Les deux sources sont INJECTÉES, avec leurs défauts de production : sans
    /// cette couture, l'ordre « cache puis réseau » ne serait éprouvable que
    /// derrière un vrai `CacheCoordinator` et un vrai `FriendService` — donc
    /// pas éprouvable du tout.
    func loadCandidates(
        cached: @MainActor () async -> [MentionCandidate]
            = { await ComposerMentionFriendsSource.cachedFriends() },
        fresh: @MainActor () async -> [MentionCandidate]
            = { await ComposerMentionFriendsSource.acceptedFriends() }
    ) async {
        let enCache = await cached()
        if !enCache.isEmpty { candidates = enCache }

        let frais = await fresh()
        guard !frais.isEmpty else { return }
        candidates = frais
    }

    private var forwardCancellable: AnyCancellable?

    lazy var controller: MentionComposerController = {
        let controller = MentionComposerController(
            context: .composerDraft,
            localCandidates: { [weak self] in self?.candidates ?? [] }
        )
        forwardCancellable = controller.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
        return controller
    }()
}
