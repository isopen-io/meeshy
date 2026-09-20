import XCTest
@testable import Meeshy

/// **Le texte de recherche ne vit pas sur le modèle PARTAGÉ** (#7158).
///
/// `ConversationListViewModel` est déclaré en `@EnvironmentObject` par la
/// racine de la liste — et `@EnvironmentObject` s'abonne à `objectWillChange`,
/// pas à un champ. Tant que `searchText` y est `@Published`, chaque caractère
/// frappé ré-exécute le corps de la liste : un `flatMap` sur toutes les
/// conversations, six actions de balayage par rangée, une copie des catégories
/// par rangée — avant même d'entrer dans la comparaison d'égalité.
///
/// L'anti-rebond de 16 ms du pipeline protège le FILTRAGE, jamais
/// l'INVALIDATION : il retarde le calcul, pas la publication qui l'a déclenché.
///
/// Le correctif est écrit dans le dépôt depuis #4105, pour le texte du
/// composeur : `ConversationComposerTextModel` vit hors de l'arbre de
/// dépendances de la racine, qui le tient en `@State` sans jamais le lire, et
/// `ComposerTextHost` en est l'unique observateur. La recherche n'avait jamais
/// reçu ce traitement.
final class ConversationSearchTextIsolationSourceGuardTests: XCTestCase {

    private func mainRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main")
    }

    private func strippedSource(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(
            try String(contentsOf: mainRoot().appendingPathComponent(relativePath), encoding: .utf8)
        )
    }

    func test_theSharedListModelDoesNotPublishTheSearchText() throws {
        let code = try strippedSource("ViewModels/ConversationListViewModel.swift")
        XCTAssertFalse(
            code.contains("@Published var searchText"),
            "`ConversationListViewModel` ne doit pas PUBLIER le texte de recherche : la racine l'observe en `@EnvironmentObject`, donc chaque caractère y ré-exécute ~99 rangées (#7158)."
        )
        XCTAssertTrue(
            code.contains("ConversationSearchTextModel()"),
            "Le texte de recherche doit vivre dans son propre modèle, hors de l'arbre de dépendances de la racine — patron de `ConversationComposerTextModel` (#4105, #7158)."
        )
    }

    /// **Le filtrage garde sa source.** Sortir le texte du modèle partagé ne
    /// vaut que si le pipeline continue de le recevoir : sans cela, la
    /// recherche cesserait de filtrer — un défaut de correction, pire que la
    /// lenteur qu'il corrige.
    func test_theFilteringPipelineStillReceivesTheText() throws {
        let code = try strippedSource("ViewModels/ConversationListViewModel.swift")
        XCTAssertTrue(
            code.contains("searchTextModel.$text"),
            "Le pipeline de filtrage doit s'alimenter au modèle de texte : c'est lui qui porte désormais la valeur (#7158)."
        )
    }

    /// **Le pendant : le champ, lui, observe.** Sans cet abonné, la frappe
    /// n'apparaîtrait plus à l'écran et la croix d'effacement resterait figée.
    func test_theSearchFieldHostObservesTheTextItDraws() throws {
        let code = try strippedSource("Views/ConversationListView+Overlays.swift")
        XCTAssertTrue(
            code.contains("@ObservedObject var searchTextModel: ConversationSearchTextModel"),
            "L'hôte du champ de recherche DOIT observer le modèle de texte : c'est lui qui rend la frappe et la croix d'effacement (#7158)."
        )
        XCTAssertFalse(
            code.contains("text: $conversationViewModel.searchText"),
            "Le champ ne doit plus se lier au modèle partagé : cette liaison est exactement ce qui abonnait la liste entière à la frappe (#7158)."
        )
    }
}
