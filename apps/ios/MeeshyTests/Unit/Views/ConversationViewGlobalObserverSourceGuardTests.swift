import XCTest
@testable import Meeshy

/// **La conversation ouverte ne s'abonne plus à la LISTE** (#7006).
///
/// `@EnvironmentObject` s'abonne à `objectWillChange` dès sa DÉCLARATION. Or
/// `ConversationListViewModel` porte dix-huit `@Published`, dont
/// `typingUsernames` et `typingUsers` — mutés à CHAQUE `typing:start` /
/// `typing:stop` de n'importe quelle conversation. Tant que l'unité
/// `ConversationView*` ou son fil UIKit déclarent cet objet, une frappe dans
/// une AUTRE conversation ré-évalue les 7 333 lignes de celle qui est ouverte
/// et rejoue `updateUIViewController` — pour zéro lecture de `@Published`.
///
/// Cette garde tient l'invariant par la SOURCE parce qu'aucune exécution ne le
/// voit : un abonnement inutile ne change aucun pixel, il coûte des images —
/// c'est la même méthode de preuve que #6226 (`e06dee46d6`), où le vumètre
/// faisait battre toute la conversation.
final class ConversationViewGlobalObserverSourceGuardTests: XCTestCase {

    private func viewsRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func strippedSource(_ fileName: String) throws -> String {
        AppSourceGuard.stripComments(
            try String(contentsOf: viewsRoot().appendingPathComponent(fileName), encoding: .utf8)
        )
    }

    /// Même lecture, depuis `Features/Main` — pour les hôtes qui vivent hors de `Views/`.
    private func strippedMainSource(_ relativeToMain: String) throws -> String {
        AppSourceGuard.stripComments(
            try String(
                contentsOf: viewsRoot().deletingLastPathComponent().appendingPathComponent(relativeToMain),
                encoding: .utf8
            )
        )
    }

    /// Toutes les déclarations `@EnvironmentObject` d'un fichier, aplaties sur
    /// une ligne : la déclaration et son type peuvent être séparés par un
    /// retour à la ligne, et une garde qui lit ligne à ligne les raterait.
    private func environmentObjectDeclarations(in source: String) -> [String] {
        source
            .components(separatedBy: "@EnvironmentObject")
            .dropFirst()
            .map { String($0.prefix(160)).replacingOccurrences(of: "\n", with: " ") }
    }

    // MARK: - L'unité ConversationView

    func test_conversationViewUnit_declaresNoConversationListViewModelObserver() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        for declaration in environmentObjectDeclarations(in: code) {
            XCTAssertFalse(
                declaration.contains("ConversationListViewModel"),
                """
                `ConversationView*` ne doit déclarer AUCUN `@EnvironmentObject` \
                de type `ConversationListViewModel` (#7006) : la déclaration \
                seule abonne l'écran à dix-huit `@Published`, dont le roster de \
                frappe de TOUTES les conversations. La référence se lit par \
                `@Environment(\\.meeshyConversationList)` — aucun abonnement. \
                Déclaration fautive : \(declaration)
                """
            )
        }
    }

    func test_conversationViewUnit_readsTheListThroughTheEnvironmentValue() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        XCTAssertTrue(
            code.contains("@Environment(\\.meeshyConversationList)"),
            "`ConversationView` doit LIRE le modèle de liste par la valeur d'environnement — sans elle, le DM déjà ouvert et la bannière de connexion perdraient leur source en silence (#7006)."
        )
    }

    // MARK: - Le fil UIKit, hébergé par la conversation

    /// `MessageListView` est un `UIViewControllerRepresentable` : sa
    /// ré-évaluation rejoue `updateUIViewController` sur toute la liste. Il ne
    /// lit le modèle de liste QUE dans `makeUIViewController` — un abonnement
    /// pour une seule construction. Le corriger dans `ConversationView` sans le
    /// corriger ici n'aurait déplacé aucune image : l'enfant se serait
    /// ré-évalué seul, à la même fréquence.
    func test_messageListView_declaresNoConversationListViewModelObserver() throws {
        let code = try strippedSource("MessageListView.swift")
        for declaration in environmentObjectDeclarations(in: code) {
            XCTAssertFalse(
                declaration.contains("ConversationListViewModel"),
                "`MessageListView` ne doit pas s'abonner au modèle de liste : il ne le lit qu'à la construction du contrôleur (#7006). Déclaration fautive : \(declaration)"
            )
        }
        XCTAssertTrue(
            code.contains("@Environment(\\.meeshyConversationList)"),
            "`MessageListView` doit recevoir le modèle de liste par la valeur d'environnement pour le remettre au contrôleur (#7006)."
        )
    }

    // MARK: - La racine POSE les deux canaux

    /// Un hôte qui monte une `ConversationView` doit poser la VALEUR en même
    /// temps que l'OBJET. Les séparer laisse un site en oublier un, et l'oubli
    /// de la valeur est SILENCIEUX : la conversation dégrade sans rougir.
    func test_rootHosts_postBothChannelsWhereTheyMountAConversation() throws {
        for fichier in ["RootLayers/RootViewLayers.swift", "RootLayers/iPadRootViewLayers.swift"] {
            let code = try strippedSource(fichier)
            XCTAssertFalse(
                code.contains(".environmentObject(conversationViewModel)"),
                "\(fichier) doit poser le modèle de liste par `.meeshyConversationList(...)` — l'objet SEUL prive la conversation de sa référence non observée (#7006)."
            )
            XCTAssertTrue(
                code.contains(".meeshyConversationList(conversationViewModel)"),
                "\(fichier) doit poser les deux canaux du modèle de liste (#7006)."
            )
        }
    }

    // MARK: - Les hôtes qui ne font que RETRANSMETTRE le modèle

    /// Neuf vues déclaraient `@EnvironmentObject ConversationListViewModel` pour
    /// une seule raison : le remettre à une feuille ou à un cover
    /// (`SharePickerView`, les portes de composition) — ou, pour la recherche,
    /// retrouver un DM hors `body`. Aucune ne lit un `@Published` de la liste ;
    /// chacune payait pourtant, comme la conversation (#7006), chaque
    /// `typing:start` de n'importe quelle conversation — `StoryViewerView` en
    /// plein visionnage. La valeur d'environnement porte la référence ;
    /// `.conversationListObject(_:)` repose l'OBJET une couche plus bas, `nil`
    /// compris (#7714, point 4).
    func test_forwardingHosts_readTheListThroughTheEnvironmentValue() throws {
        let hosts = [
            "Views/StoryViewerView.swift", "Views/MyStoriesView.swift", "Views/BookmarksView.swift",
            "Views/LinksHubView.swift", "Views/ShareLinksView.swift", "Views/GlobalSearchView.swift",
            "Views/RootViewComponents.swift",
            "Composer/StoryEditComposer.swift", "Composer/StoryRepublishComposer.swift",
        ]
        for host in hosts {
            let code = try strippedMainSource(host)
            for declaration in environmentObjectDeclarations(in: code) {
                XCTAssertFalse(
                    declaration.contains("ConversationListViewModel"),
                    "\(host) ne lit le modèle de liste que pour le retransmettre : la valeur d'environnement suffit, l'abonnement coûte des images (#7714). Déclaration fautive : \(declaration)"
                )
            }
            XCTAssertTrue(
                code.contains("@Environment(\\.meeshyConversationList)"),
                "\(host) doit recevoir le modèle de liste par la valeur d'environnement (#7714)."
            )
            XCTAssertFalse(
                code.contains(".environmentObject(conversationListViewModel)"),
                "\(host) repose l'objet par `.conversationListObject(...)`, qui accepte l'optionnel — jamais `.environmentObject` sur une valeur d'environnement (#7714)."
            )
        }
    }
}

/// **Aucun décodage d'image PLEIN sur le fil principal dans la conversation**
/// (#7006).
///
/// `UIImage(contentsOfFile:)` décode l'image entière, là où il est appelé. Dans
/// l'`onAppear` d'un écran, c'est la PREMIÈRE FRAME qu'il retient — et la
/// restauration d'un brouillon en appelait un PAR pièce jointe.
final class ConversationDraftThumbnailSourceGuardTests: XCTestCase {

    func test_conversationViewUnit_decodesNoFullImageOnTheMainActor() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        XCTAssertFalse(
            code.contains("UIImage(contentsOfFile"),
            "L'unité `ConversationView*` ne doit décoder aucune image en plein sur le MainActor : le décodage passe par `SOTAImageThumbnail.thumbnailAsync` (ImageIO, tâche détachée), comme le chemin nominal d'ajout de photo (#7006)."
        )
        XCTAssertTrue(
            code.contains("SOTAImageThumbnail.thumbnailAsync"),
            "Les vignettes du brouillon restauré doivent être décodées par `SOTAImageThumbnail.thumbnailAsync` (#7006)."
        )
    }

    /// La borne de sous-échantillonnage doit rester CELLE du chemin nominal :
    /// `pendingThumbnails` alimente aussi l'éditeur d'image, dont la sortie est
    /// RÉENREGISTRÉE sur le fichier de la pièce jointe. Deux bornes différentes
    /// feraient qu'un brouillon repris s'éditerait moins bien qu'un brouillon
    /// frais — et rien ne le dirait.
    @MainActor
    func test_draftThumbnailBound_matchesTheNominalAttachmentPreview() throws {
        XCTAssertEqual(
            ConversationView.draftThumbnailMaxPixelSize, 1024,
            "La borne des vignettes de brouillon doit rester alignée sur `AttachmentPreparationService.downsampledPreview` (1 024 px) — cf. #7006."
        )
    }
}
