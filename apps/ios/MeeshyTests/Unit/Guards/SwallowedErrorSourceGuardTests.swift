import XCTest

/// **Une erreur avalée est indiscernable d'un vide légitime** (#7007).
///
/// `catch { return [] }` et `catch { Logger.…error(…) }` compilent, ne rougissent
/// nulle part, et rendent exactement le même écran qu'une requête sans résultat :
/// « Aucun résultat », « Aucun réel pour le moment », un rail de stories vide. Le
/// journal, lui, ne quitte pas la machine du développeur — **seul un état PUBLIÉ
/// atteint un lecteur**.
///
/// Cette garde tient la promesse du lot sur les QUATRE ViewModels que l'audit du
/// 2026-09-18 a nommés. Elle interroge trois choses distinctes, parce que trois
/// régressions distinctes sont possibles :
///
/// 1. **le retour muet** — un `catch` dont le corps entier est `return []` ;
/// 2. **la déclaration** — l'état d'échec existe et est publié ;
/// 3. **l'assignation** — un `catch` du chemin de chargement le POSE réellement.
///
/// La troisième est celle qui compte : une propriété déclarée et jamais écrite
/// est le motif « une loi qui calcule une valeur que personne ne lit », en pire —
/// elle a en plus l'air d'un correctif.
///
/// **Portée volontairement limitée aux quatre unités.** Cinq `catch { return [] }`
/// subsistent ailleurs dans `apps/ios/Meeshy` (mesuré le 2026-09-18) ; les
/// balayer ici rendrait la garde rouge à la naissance, donc inutile. Les étendre
/// est un lot à part, avec sa propre issue.
final class SwallowedErrorSourceGuardTests: XCTestCase {

    // MARK: - Les unités balayées

    private static let globalSearchPath =
        "Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift"
    private static let reelsPath =
        "Meeshy/Features/Main/ViewModels/ReelsViewModel.swift"
    private static let userProfilePath =
        "Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift"

    /// `StoryViewModel` est DÉCOUPÉ (`StoryViewModel+*.swift` + `StoryViewModelRules`)
    /// : `AppSourceGuard.storyViewModelSource()` recolle l'unité. Lire le seul
    /// fichier principal ferait passer la garde au vert en lisant la moitié qui ne
    /// contient pas l'interdit.
    private func storySource() throws -> String {
        try AppSourceGuard.storyViewModelSource()
    }

    private func source(_ relativePath: String) throws -> String {
        try AppSourceGuard.unit(relativePath)
    }

    // MARK: - Extraction des blocs `catch`

    /// Rend le CORPS de chaque bloc `catch` de la source, commentaires retirés.
    /// L'appariement se fait sur les accolades, pas sur l'indentation : un
    /// `catch` dont le corps tient sur une ligne, ou qui imbrique un `do`, doit
    /// être lu entièrement ou la garde mesure autre chose que ce qu'elle nomme.
    private func catchBodies(in rawSource: String) -> [String] {
        let stripped = AppSourceGuard.stripComments(rawSource)
        let chars = Array(stripped)
        let keyword = Array("catch")
        var bodies: [String] = []
        var index = 0

        func prolonge(_ caractere: Character) -> Bool {
            caractere.isLetter || caractere.isNumber || caractere == "_"
        }

        while index + keyword.count <= chars.count {
            guard Array(chars[index..<(index + keyword.count)]) == keyword else {
                index += 1
                continue
            }
            let avant = index == 0 ? nil : chars[index - 1]
            let apres = index + keyword.count < chars.count ? chars[index + keyword.count] : nil
            guard !(avant.map(prolonge) ?? false), !(apres.map(prolonge) ?? false) else {
                index += 1
                continue
            }

            // Avance jusqu'à l'accolade ouvrante du bloc (`catch {`,
            // `catch MeeshyError.forbidden {`, `catch let e as X {`…).
            var open = index + keyword.count
            while open < chars.count, chars[open] != "{" { open += 1 }
            guard open < chars.count else { break }

            var depth = 0
            var cursor = open
            var body = ""
            while cursor < chars.count {
                let character = chars[cursor]
                if character == "{" { depth += 1 }
                if character == "}" {
                    depth -= 1
                    if depth == 0 { break }
                }
                if depth >= 1, cursor != open { body.append(character) }
                cursor += 1
            }
            bodies.append(body)
            index = cursor + 1
        }
        return bodies
    }

    private func compacted(_ text: String) -> String {
        text.filter { !$0.isWhitespace }
    }

    // MARK: - 1. Aucun retour muet

    func test_aucunCatchDeCesQuatreViewModelsNeRendUnTableauVideEnSilence() throws {
        let unites: [(nom: String, source: String)] = [
            ("GlobalSearchViewModel", try source(Self.globalSearchPath)),
            ("ReelsViewModel", try source(Self.reelsPath)),
            ("UserProfileViewModel", try source(Self.userProfilePath)),
            ("StoryViewModel", try storySource()),
        ]

        for unite in unites {
            for body in catchBodies(in: unite.source) {
                XCTAssertNotEqual(
                    compacted(body),
                    "return[]",
                    """
                    `\(unite.nom)` porte un `catch { return [] }` : une panne réseau y \
                    devient un « aucun résultat » que rien ne distingue d'un vide \
                    légitime. Rendre le motif avec le vide (cf. `GlobalSearchLeg`), ou \
                    publier un état d'échec que la vue consomme.
                    """
                )
            }
        }
    }

    // MARK: - 2. L'état d'échec est DÉCLARÉ

    func test_chaqueViewModelPublieSonEtatDEchec() throws {
        let attendus: [(nom: String, source: String, declaration: String)] = [
            ("GlobalSearchViewModel", try source(Self.globalSearchPath),
             "@Published private(set) var remoteFailure"),
            ("ReelsViewModel", try source(Self.reelsPath),
             "@Published private(set) var loadFailure"),
            ("UserProfileViewModel", try source(Self.userProfilePath),
             "@Published private(set) var profileError"),
            ("StoryViewModel", try storySource(),
             "@Published private(set) var loadFailure"),
        ]

        for attendu in attendus {
            XCTAssertTrue(
                AppSourceGuard.stripComments(attendu.source).contains(attendu.declaration),
                "`\(attendu.nom)` doit publier son état d'échec (`\(attendu.declaration)`)"
            )
        }
    }

    // MARK: - 3. L'état d'échec est POSÉ depuis un `catch`

    /// La question qui compte : **le `catch` du chemin de chargement écrit-il
    /// l'état, ou la propriété n'est-elle qu'un décor ?** Une déclaration sans
    /// assignation est une correction qui n'atteint personne.
    func test_unCatchDuCheminDeChargementPoseReellementLeMotif() throws {
        let attendus: [(nom: String, source: String, assignation: String)] = [
            ("ReelsViewModel", try source(Self.reelsPath), "loadFailure ="),
            ("UserProfileViewModel", try source(Self.userProfilePath), "profileError ="),
            ("StoryViewModel", try storySource(), "loadFailure ="),
        ]

        for attendu in attendus {
            let pose = catchBodies(in: attendu.source).contains { $0.contains(attendu.assignation) }
            XCTAssertTrue(
                pose,
                """
                `\(attendu.nom)` déclare son état d'échec mais aucun `catch` ne l'écrit : \
                la panne reste invisible, et la propriété n'est qu'un décor.
                """
            )
        }

        // `GlobalSearchViewModel` ne pose pas l'état depuis le `catch` : ses
        // volets RENDENT leur motif (`GlobalSearchLeg.failed`) et c'est
        // `performSearch` qui l'agrège — un volet est une fonction PURE, elle
        // n'écrit aucun `@Published`. Chacun de ses `catch` doit donc rendre un
        // volet EN ÉCHEC, jamais un volet servi.
        let volets = catchBodies(in: try source(Self.globalSearchPath))
            .filter { $0.contains("return") }
        XCTAssertFalse(volets.isEmpty, "aucun `catch` rendant un volet n'a été trouvé — garde inopérante")
        for volet in volets {
            XCTAssertTrue(
                volet.contains(".failed("),
                """
                Un `catch` de `GlobalSearchViewModel` rend un volet sans motif : \
                employer `.failed(Self.remoteFailureMessage)`, jamais `.served([])`.
                """
            )
        }
    }

    // MARK: - 4. La garde lit bien quelque chose

    func test_lesSourcesBalayeesNeSontPasVides() throws {
        for (nom, contenu) in [
            ("GlobalSearchViewModel", try source(Self.globalSearchPath)),
            ("ReelsViewModel", try source(Self.reelsPath)),
            ("UserProfileViewModel", try source(Self.userProfilePath)),
            ("StoryViewModel", try storySource()),
        ] {
            XCTAssertFalse(contenu.isEmpty, "source vide pour `\(nom)` — chemin faux, la garde ne mesurerait rien")
            XCTAssertFalse(
                catchBodies(in: contenu).isEmpty,
                "aucun bloc `catch` trouvé dans `\(nom)` — l'extracteur ne lit rien"
            )
        }
    }
}
