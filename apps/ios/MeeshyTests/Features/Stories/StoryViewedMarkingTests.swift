import XCTest
import SwiftUI
@testable import MeeshySDK
@testable import Meeshy

/// Une story ne compte comme « vue » qu'une fois réellement montrée.
///
/// L'interlude d'identité inter-groupes est OPAQUE et prend tout l'écran
/// pendant ~500 ms : tant qu'il est là, l'utilisateur ne voit rien de la story.
/// Or `markCurrentViewed()` était appelé au moment du changement d'index —
/// donc AVANT `presentGroupIntroIfNeeded()` pendant le switch de groupe
/// (depuis 2026-08-20 l'ouverture du viewer, elle, n'a plus d'interlude).
/// Conséquences pour l'auteur : son compteur de vues montait
/// pour des stories que personne n'avait regardées, et l'anneau du lecteur
/// passait en « vu » alors qu'il n'avait vu qu'un écran d'identité.
///
/// La règle : le marquage suit la RÉVÉLATION, pas l'indexation.
@MainActor
final class StoryViewedMarkingTests: XCTestCase {

    // MARK: - Fixtures

    private func makeStory(id: String) -> StoryItem {
        StoryItem(id: id, content: id, media: [], storyEffects: nil,
                  createdAt: Date(), expiresAt: nil, isViewed: false)
    }

    /// Un identifiant de story tel que le SERVEUR en sert : un ObjectId
    /// MongoDB, 24 caractères hexadécimaux.
    ///
    /// Les fixtures disaient `"s0"` / `"s1"` — des chaînes qu'aucune story
    /// réelle ne porte. Depuis que l'enfilement refuse ce que le serveur ne
    /// sait pas adresser (#4044), une fixture fictive ne se contente plus
    /// d'être imprécise : elle ferait tomber les contrôles positifs pour la
    /// mauvaise raison, et masquerait la règle qu'ils vérifient.
    private func serverStoryId(_ index: Int) -> String {
        "507f1f77bcf86cd79943901" + String(index)
    }

    /// Collecteur de référence : capturer un `var` local dans le closure de
    /// l'enqueuer ne passe pas la concurrence stricte (le `Task` interne de
    /// `markViewed` exige un closure `Sendable`).
    @MainActor
    private final class Recorder {
        var ids: [String] = []
    }

    private func makeSUT(storyIds: [String]? = nil) -> (sut: StoryViewerView, enqueued: () -> [String]) {
        let recorder = Recorder()
        let vm = StoryViewModel(postService: MockPostService())
        vm.markViewedOutboxEnqueuer = { id in
            await MainActor.run { recorder.ids.append(id) }
        }
        let ids = storyIds ?? [serverStoryId(0), serverStoryId(1)]
        let group = StoryGroup(id: "author-1", username: "alice",
                               avatarColor: "#6366F1", avatarURL: nil,
                               stories: ids.map { makeStory(id: $0) })
        var presented = true
        let binding = Binding(get: { presented }, set: { presented = $0 })
        let view = StoryViewerView(viewModel: vm, groups: [group],
                                   currentGroupIndex: 0, isPresented: binding)
        view.currentStoryIndex = 0
        return (view, { recorder.ids })
    }

    /// Laisse le `Task` fire-and-forget de `markViewed` atteindre l'enqueuer.
    private func settle() async {
        for _ in 0..<3 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 120_000_000)
    }

    // MARK: - Le défaut corrigé

    /// L'état d'interlude est injecté par `isIntroVisible:` : écrire dans le
    /// `@State showGroupIntro` d'une `View` hors graphe SwiftUI est un no-op
    /// silencieux, et le test mesurerait alors l'absence d'interlude au lieu
    /// de la garde.
    func test_markCurrentViewed_whileGroupIntroVisible_doesNotCount() async {
        let (sut, enqueued) = makeSUT()

        sut.markCurrentViewed(isIntroVisible: true)
        await settle()

        XCTAssertTrue(
            enqueued().isEmpty,
            "L'interlude est opaque : rien n'a encore été montré, donc rien n'est vu"
        )
    }

    // MARK: - Contrôle positif

    func test_markCurrentViewed_withoutIntro_counts() async {
        let (sut, enqueued) = makeSUT()

        sut.markCurrentViewed(isIntroVisible: false)
        await settle()

        XCTAssertEqual(
            enqueued(), [serverStoryId(0)],
            "Sans interlude, la story est visible : elle doit compter — sinon le test ci-dessus ne prouve rien"
        )
    }

    /// La révélation est le déclencheur : une fois l'interlude retiré, la story
    /// visible doit être marquée sans attendre le changement d'index suivant.
    func test_revealingAfterIntro_countsTheStoryNowVisible() async {
        let (sut, enqueued) = makeSUT()
        sut.markCurrentViewed(isIntroVisible: true)
        await settle()
        XCTAssertTrue(enqueued().isEmpty, "précondition : rien marqué sous l'interlude")

        sut.skipGroupIntro()
        await settle()

        XCTAssertEqual(enqueued(), [serverStoryId(0)],
                       "Retirer l'interlude révèle la story : c'est là qu'elle devient vue")
    }

    /// Tap gauche sur l'interlude = « annule ce switch de groupe ». La story
    /// du groupe qu'on quitte n'a jamais été montrée : elle ne doit pas compter.
    func test_cancellingGroupSwitchFromIntro_doesNotCount() async {
        let (sut, enqueued) = makeSUT()

        sut.goBackToPreviousGroupFromIntro()
        await settle()

        XCTAssertTrue(
            enqueued().isEmpty,
            "Annuler le switch ne révèle rien — marquer ici gonflerait les vues de l'auteur"
        )
    }

    // MARK: - #4044 — une story que le serveur ne sait pas encore adresser

    /// **Le défaut du terrain.** Une story encore en file de publication porte
    /// l'identifiant LOCAL que `StoryPublishQueue` lui a donné
    /// (`pending_<uuid>`). L'ouvrir enfilait un `.markStoryViewed` vers
    /// `POST /posts/pending_<uuid>/view` — où `recordView` avale l'erreur mais
    /// `getPostById` fait lever Prisma (`P2023`, ObjectId malformé). Résultat :
    /// 500 à chaque tentative, cinq tentatives, ligne `.exhausted` pour
    /// toujours. Dix-neuf de ces lignes ont été relevées sur un appareil réel,
    /// sur cinq stories distinctes et plusieurs jours.
    ///
    /// Une mutation que le serveur ne peut pas adresser ne doit jamais entrer
    /// dans la file DURABLE : elle n'y attend pas un réseau, elle y pourrit.
    func test_pendingStoryId_isNeverEnqueued() async {
        let (sut, enqueued) = makeSUT(storyIds: ["pending_\(UUID().uuidString)"])

        sut.markCurrentViewed(isIntroVisible: false)
        await settle()

        XCTAssertTrue(
            enqueued().isEmpty,
            "Un identifiant local ne sera JAMAIS accepté : l'enfiler condamne la ligne d'outbox"
        )
    }

    /// L'état « vu » LOCAL n'est pas gouverné par la même question. On refuse
    /// d'ENVOYER ce que le serveur ne sait pas lire ; on n'efface pas pour
    /// autant ce que l'utilisateur vient de voir à l'écran — sinon l'anneau de
    /// sa propre story resterait « non vu » sous ses yeux.
    func test_pendingStoryId_isStillMarkedViewedLocally() async {
        let pending = "pending_\(UUID().uuidString)"
        let vm = StoryViewModel(postService: MockPostService())
        vm.markViewedOutboxEnqueuer = { _ in }
        vm.storyGroups = [StoryGroup(id: "author-1", username: "alice",
                                     avatarColor: "#6366F1", avatarURL: nil,
                                     stories: [makeStory(id: pending)])]

        vm.markViewed(storyId: pending)
        await settle()

        XCTAssertEqual(vm.storyGroups.first?.stories.first?.isViewed, true,
                       "Le refus d'enfiler ne doit pas priver l'utilisateur de l'état vu local")
    }

    /// **Ce qui part À CÔTÉ du geste qu'on vient de corriger.**
    ///
    /// `recordStoryImpression` vit douze lignes au-dessus de `markViewed`,
    /// envoie le MÊME identifiant au MÊME serveur, et `POST /posts/:id/impression`
    /// y fait lever Prisma exactement pareil (`mayConsumePost` interroge sans
    /// garde de forme). L'appel étant fire-and-forget, rien ne s'accumule — et
    /// c'est précisément ce qui le rendait invisible : corriger la file seule
    /// aurait traité le symptôme en gardant la cause vivante sur le site jumeau.
    func test_pendingStoryId_sendsNoImpressionEither() async {
        let postService = MockPostService()
        let vm = StoryViewModel(postService: postService)

        vm.recordStoryImpression(storyId: "pending_\(UUID().uuidString)")
        await settle()

        XCTAssertEqual(postService.recordImpressionCallCount, 0,
                       "Un identifiant local ne doit atteindre AUCUNE route /posts/:id/*")
    }

    /// Contrôle positif du garde ci-dessus — sans lui, un `recordImpressionCallCount`
    /// resté à zéro pour une tout autre raison passerait pour une preuve.
    func test_serverStoryId_stillSendsItsImpression() async {
        let postService = MockPostService()
        let vm = StoryViewModel(postService: postService)

        vm.recordStoryImpression(storyId: serverStoryId(0))
        await settle()

        XCTAssertEqual(postService.recordImpressionCallCount, 1,
                       "Une story servie par le serveur doit toujours compter son impression")
        XCTAssertEqual(postService.lastRecordImpressionPostId, serverStoryId(0))
    }
}
