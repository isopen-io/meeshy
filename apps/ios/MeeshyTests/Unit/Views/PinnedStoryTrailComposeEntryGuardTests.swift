import XCTest
@testable import Meeshy

/// Directive user 2026-08-13 : « on enlève le (+) avant la liste des avatars
/// qui devient surcharge puisque l'ajout de story se fait aussi à partir de la
/// liste des story quand on touche l'avatar de l'utilisateur connecté ! On
/// préserve le (+) en haut à gauche sur le grand avatar de la grande trail à
/// l'ouverture. »
///
/// Deux moitiés indissociables, et c'est leur COUPLAGE que cette suite épingle :
/// retirer le « + » du band replié sans garantir qu'une cellule « Moi » y figure
/// TOUJOURS supprimerait purement et simplement la composition depuis un header
/// scrollé — exactement le genre de trou qu'un simple « le bouton a disparu »
/// laisserait passer.
final class PinnedStoryTrailComposeEntryGuardTests: XCTestCase {

    /// Fichier de `Meeshy/`, COMMENTAIRES RETIRÉS : les commentaires de ce
    /// fichier NOMMENT le bouton supprimé pour justifier son retrait — sans ce
    /// strip, la garde échouerait sur sa propre documentation.
    private func source(_ relativePath: String) throws -> String {
        let projectRoot = #filePath.components(separatedBy: "/MeeshyTests/").first ?? ""
        let raw = try String(
            contentsOfFile: "\(projectRoot)/Meeshy/\(relativePath)", encoding: .utf8)
        return raw
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> Substring in
                guard let comment = line.range(of: "//") else { return line }
                return line[line.startIndex..<comment.lowerBound]
            }
            .joined(separator: "\n")
    }

    private func traySource() throws -> String {
        try source("Features/Main/Views/StoryTrayView.swift")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// Bloc délimité par accolades équilibrées à partir de la première `{` qui
    /// suit `anchor`. Une garde qui compterait sur le FICHIER entier ne pourrait
    /// pas distinguer le band replié de la grande trail — or les deux règles
    /// sont OPPOSÉES sur le « + ».
    private func block(after anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor),
              let open = code[start.upperBound...].firstIndex(of: "{") else { return nil }
        var depth = 0
        var index = open
        while index < code.endIndex {
            if code[index] == "{" { depth += 1 }
            if code[index] == "}" {
                depth -= 1
                if depth == 0 { return String(code[code.index(after: open)..<index]) }
            }
            index = code.index(after: index)
        }
        return nil
    }

    private func pinnedTrailBandSource() throws -> String {
        try XCTUnwrap(
            block(after: "struct PinnedStoryTrailBand: View", in: try traySource()),
            "`PinnedStoryTrailBand` a disparu : la trail du header n'existe plus."
        )
    }

    private func myStoryButtonSource() throws -> String {
        try XCTUnwrap(
            block(after: "private struct MyStoryButton: View", in: try traySource()),
            "`MyStoryButton` a disparu : le grand avatar de la trail dépliée n'existe plus."
        )
    }

    // MARK: - Le « + » quitte le band replié…

    func test_thePinnedBandNoLongerLeadsWithAPlusButton() throws {
        let band = try pinnedTrailBandSource()
        XCTAssertEqual(
            occurrences(of: "addStoryButton", in: band), 0,
            """
            Le bouton « + » de tête est retiré du band : c'est une surcharge dès \
            lors que toucher son propre avatar mène à la composition.
            """
        )
        XCTAssertEqual(
            occurrences(of: "Image(systemName: \"plus\")", in: band), 0,
            "Aucun glyphe « + » ne doit réapparaître en tête de la trail repliée."
        )
    }

    // MARK: - …mais l'entrée de composition, jamais

    /// La contrepartie obligatoire : sans groupe de stories, une cellule « Moi »
    /// prend quand même la tête du band. C'est elle qui porte l'affordance que
    /// le « + » portait.
    func test_theBandAlwaysLeadsWithTheConnectedUsersAvatar() throws {
        let band = try pinnedTrailBandSource()
        XCTAssertEqual(
            occurrences(of: "selfAvatarCell", in: band), 2,
            """
            Une cellule « Moi » de repli (déclaration + call site) : sans elle, \
            un utilisateur sans story n'aurait AUCUN chemin vers le composer \
            depuis un header scrollé.
            """
        )

        let fallback = try XCTUnwrap(
            block(after: "private var selfAvatarCell: some View", in: band),
            "…ou elle n'est plus déclarée."
        )
        XCTAssertGreaterThan(
            occurrences(of: "StoryTrayActionResolver.avatarTap(", in: fallback), 0,
            "Sa destination vient du MÊME résolveur que la grande trail, jamais d'un test en ligne."
        )
        XCTAssertGreaterThan(
            occurrences(of: "viewModel.showStoryComposer = true", in: fallback), 0,
            "Sans aucune story, le tap mène droit au composer."
        )
        XCTAssertGreaterThan(
            occurrences(of: "StoryTrayActionResolver.avatarAccessibilityLabel(", in: fallback), 0,
            "L'annonce VoiceOver vient de la même règle que le routage — les deux ne peuvent pas diverger."
        )
    }

    /// Le band monte dès que la bascule commence, SANS condition sur le contenu :
    /// sa première cellule est l'entrée de composition, la conditionner à
    /// l'existence d'une story la ferait disparaître pile quand elle est utile.
    func test_theBandIsNotGatedOnHavingAnyStory() throws {
        let band = try pinnedTrailBandSource()
        XCTAssertEqual(
            occurrences(of: "!groups.isEmpty || own != nil", in: band), 0,
            "Le montage du band ne se conditionne plus à l'existence d'une story."
        )
        XCTAssertGreaterThan(
            occurrences(of: "if reveal > 0.001", in: band), 0,
            "Le seuil restant est une garde de PERFORMANCE : au repos, aucun anneau n'est matérialisé."
        )
    }

    // MARK: - Le « + » survit là où la directive le garde

    func test_theFullSizeTrailKeepsThePlusBadgeOnTheBigAvatar() throws {
        let button = try myStoryButtonSource()
        let badge = try XCTUnwrap(
            block(after: "overlay(alignment: .topLeading)", in: button),
            "Le badge « + » en haut à gauche du grand avatar a disparu de la trail dépliée."
        )
        XCTAssertGreaterThan(
            occurrences(of: "Image(systemName: \"plus\")", in: badge),
            0,
            "Le « + » reste le glyphe de ce badge — c'est l'affordance « composer TOUJOURS »."
        )
        XCTAssertGreaterThan(
            occurrences(of: "viewModel.showStoryComposer = true", in: badge), 0,
            "…et il ouvre le composer directement, sans écran interposé."
        )
    }

    // MARK: - La trail habite la fente du titre

    /// Le band est monté dans le slot `accessory` des DEUX headers concernés.
    /// C'est ce slot que le SDK rend désormais à la place du titre (garde
    /// jumelle : `CollapsibleHeaderInlineAccessoryGuardTests`).
    func test_bothScrolledHeadersHandTheirTitleSlotToTheTrail() throws {
        for file in [
            "Features/Main/Views/RootViewComponents.swift",   // iPhone — « Meeshy Feed »
            "Features/Main/Views/FeedView.swift",             // iPad — « Meeshy Feed »
            "Features/Main/Views/ConversationListView.swift", // « Meeshy Chats »
        ] {
            let code = try source(file)
            XCTAssertGreaterThan(
                occurrences(of: "PinnedStoryTrailBand(", in: code), 0,
                "\(file) : le header scrollé doit montrer la trail à la place de son titre."
            )
        }
    }

    /// Sans caption sous les anneaux : la fente du titre héberge UNE rangée, pas
    /// une rangée plus une ligne de texte.
    func test_theInlineRingsDropTheirUsernameCaption() throws {
        let band = try pinnedTrailBandSource()
        XCTAssertEqual(
            occurrences(of: "showsUsername: false", in: band), 2,
            "Les deux anneaux du band (le sien, les pairs) tiennent sur une seule rangée."
        )
        XCTAssertEqual(
            occurrences(of: "showsUsername: true", in: band), 0,
            "Aucun anneau du band ne réintroduit sa légende."
        )
    }

    /// Le rythme de la bascule appartient au catalogue partagé : le header fait
    /// disparaître le titre sur la courbe qui fait apparaître la trail.
    func test_theBandReadsItsRevealCurveFromTheSharedCatalog() throws {
        let band = try pinnedTrailBandSource()
        XCTAssertGreaterThan(
            occurrences(of: "CollapsibleHeaderMetrics.inlineAccessoryReveal(", in: band), 0,
            "Une courbe recopiée sur place finirait par diverger de celle du titre."
        )
        XCTAssertEqual(
            occurrences(of: "revealStart: CGFloat = ", in: band), 0,
            "Plus aucune borne locale : la fente est partagée, la courbe aussi."
        )
    }
}
