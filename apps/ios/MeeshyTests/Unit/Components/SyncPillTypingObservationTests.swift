// apps/ios/MeeshyTests/Unit/Components/SyncPillTypingObservationTests.swift

import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// **La pastille de frappe apparaît instantanément depuis n'importe quel
/// écran, iPad compris** (issue #4049).
///
/// Le défaut n'était ni dans le transport ni dans le modèle : le gateway
/// diffuse `typing:start` dans la room de la conversation, à laquelle chaque
/// socket est joint dès l'authentification, et `ConversationListViewModel`
/// s'y abonne dans son `init`. Le signal ARRIVAIT. Ce qui manquait était
/// l'OBSERVATION, et elle manquait des deux côtés à la fois :
///
/// - l'hôte ne l'observe pas — `ConversationListVMOwner` (`RootView.swift`,
///   `iPadRootView.swift`) n'a délibérément aucun `@Published`, pour que le
///   churn du VM ne ré-évalue pas `RootView.body` (« Zero Unnecessary
///   Re-render ») ; c'est juste et cela reste ;
/// - la bannière ne l'observe pas non plus — elle le reçoit en `let`, et un
///   `let` sur un `ObservableObject` n'abonne rien. L'injection est en `let`
///   pour une bonne raison elle aussi : `@EnvironmentObject` dans un
///   `.overlay` crash dans ce dépôt (motif documenté 4×).
///
/// Deux décisions justes qui, mises bout à bout, laissaient `entries` sans
/// personne pour le recalculer. `TypingEntriesSource` est le maillon qui
/// observe POUR la bannière : il republie les frappeurs sans que l'hôte ait
/// à les regarder. Il prend un PUBLISHER, pas le view-model — c'est ce qui le
/// rend testable sans monter la moitié de l'application.
@MainActor
final class SyncPillTypingObservationTests: XCTestCase {

    func test_source_republishesEveryTypingChange() {
        let upstream = CurrentValueSubject<[String: String], Never>([:])
        let source = TypingEntriesSource(publisher: upstream.eraseToAnyPublisher())

        var observed: [[String: String]] = []
        let cancellable = source.objectWillChange
            .sink { _ in observed.append(source.typingUsers) }
        defer { cancellable.cancel() }

        upstream.send(["conv1": "alice"])
        upstream.send(["conv1": "alice", "conv2": "bob"])
        upstream.send([:])

        XCTAssertEqual(
            source.typingUsers, [:],
            "la source suit l'amont jusqu'à la dernière valeur — c'est elle que la bannière lit."
        )
        XCTAssertEqual(
            observed.count, 3,
            "chaque changement de frappeurs doit produire un `objectWillChange` : c'est le signal qui fait recalculer `entries`, donc apparaître la pastille. Sans lui, la frappe n'atteint jamais le pixel."
        )
    }

    func test_source_adoptsTheCurrentValueImmediately() {
        let upstream = CurrentValueSubject<[String: String], Never>(["conv1": "alice"])
        let source = TypingEntriesSource(publisher: upstream.eraseToAnyPublisher())

        XCTAssertEqual(
            source.typingUsers, ["conv1": "alice"],
            "quelqu'un écrivait DÉJÀ au moment où la bannière se monte : la pastille doit le montrer sans attendre la frappe suivante."
        )
    }

    func test_source_withoutUpstream_staysEmptyAndHarmless() {
        let source = TypingEntriesSource(publisher: nil)

        XCTAssertEqual(
            source.typingUsers, [:],
            "flux invité (aucune liste de conversations) : pas d'entrées de frappe, et surtout aucun crash — le reste de la pastille (statut, file d'attente) doit continuer de fonctionner."
        )
    }

    // MARK: - Le câblage, gardé par forme de source

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Components
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
        return AppSourceGuard.stripComments(
            try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        )
    }

    func test_connectionBanner_readsTheObservedSource_notTheUnobservedViewModel() throws {
        let code = try source("Features/Main/Components/ConnectionBanner.swift")
        XCTAssertTrue(
            code.contains("@StateObject private var typingSource: TypingEntriesSource"),
            "la bannière doit OBSERVER les frappeurs ; sans `@StateObject`/`@ObservedObject`, aucun changement ne la ré-évalue."
        )
        XCTAssertTrue(
            code.contains("typingUsers: typingSource.typingUsers"),
            "les entrées de frappe se composent depuis la source OBSERVÉE — lire `conversationListViewModel.typingUsers` directement rétablirait le défaut #4049 à l'identique."
        )
        XCTAssertFalse(
            code.contains("conversationListViewModel.typingUsers"),
            "un accès direct au view-model non observé est précisément ce qui ne déclenchait aucun rendu."
        )
    }

    func test_hosts_stillOwnTheViewModelWithoutObservingIt() throws {
        for host in ["Features/Main/Views/RootView.swift", "Features/Main/Views/iPadRootView.swift"] {
            let code = try source(host)
            XCTAssertTrue(
                code.contains("ConversationListVMOwner()"),
                "\(host) : l'hôte POSSÈDE le VM sans l'observer — le correctif #4049 confine la re-render à la bannière, il ne la rend pas à `RootView.body` (« Zero Unnecessary Re-render »)."
            )
        }
    }
}
