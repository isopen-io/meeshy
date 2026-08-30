import XCTest
@testable import Meeshy

/// Garde de NON-RÉGRESSION de l'attribution de republication — Lot E, Task E5.
///
/// La directive produit du 2026-08-19 (commit `ba67c21eb`) a réduit la ligne
/// d'attribution de la carte de fil à DEUX signes : l'icône de republication,
/// puis `@handle`. La formule précédente — « a republié de @handle » — énonçait
/// en toutes lettres ce que l'icône dit déjà, et poussait le handle en bout de
/// ligne, là où la troncature le mange en premier sur une carte étroite : le
/// seul mot qui portait l'information était le premier sacrifié.
///
/// **Pourquoi une garde, et pourquoi MAINTENANT.** Le lot E réécrit la rangée
/// auteur de `FeedPostCard` (E1 y greffe `BackgroundSoundBadge` juste sous
/// l'attribution, E3 monte une scène dans la même carte). Cette conformité
/// n'était protégée par AUCUNE assertion : elle vivait dans un commentaire et
/// dans la mémoire du diff. Un retour au verbe passait donc le gate en vert.
///
/// **Pourquoi la garde est ancrée sur la FENÊTRE de l'attribution.** La clé
/// `feed.post.reposted_from` reste VIVANTE — elle porte l'étiquette VoiceOver
/// du groupe, sans laquelle le lecteur d'écran annoncerait « @handle » sans
/// dire pourquoi. Une garde qui chercherait « la clé n'apparaît nulle part »
/// interdirait donc la bonne implémentation autant que la mauvaise. Ce qui
/// distingue les deux, c'est l'ENDROIT : la clé doit vivre dans
/// `.accessibilityLabel(...)`, jamais dans un `Text(` rendu. La garde lit donc
/// la fenêtre équilibrée du bloc d'attribution, puis celle de son étiquette
/// d'accessibilité, et compare.
final class RepostAttributionGuardTests: XCTestCase {

    /// #4078 — la rangée AUTEUR, qui porte l'attribution de republication, a
    /// quitté `FeedPostCard.swift` pour son extension. Le bloc n'a pas bougé
    /// d'une ligne ; c'est le fichier qui a changé sous la garde, et elle a
    /// cherché son marqueur là où il n'était plus.
    private static let cardFile = "Meeshy/Features/Main/Views/FeedPostCard+Header.swift"

    /// Ouverture du bloc d'attribution dans `FeedPostCard`.
    private static let attributionMarker = "if post.repostAuthor != nil {"

    /// La clé localisée qui porte la phrase complète. Préfixe commun aux deux
    /// formes (`feed.post.reposted_from` avec handle, `feed.post.reposted`
    /// sans) — c'est ce préfixe que la garde localise.
    private static let verbKeyPrefix = "feed.post.reposted"

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: Self.cardFile)
    }

    /// Fenêtre ÉQUILIBRÉE ouverte par `marker` : du marqueur jusqu'au
    /// délimiteur fermant qui lui correspond, sous-appels et closures compris.
    /// Le marqueur doit se terminer par son propre délimiteur ouvrant.
    private func balancedWindow(from marker: String, in text: String) -> [String] {
        var windows: [String] = []
        var searchStart = text.startIndex

        while let opening = text.range(of: marker, range: searchStart..<text.endIndex) {
            var depth = 1
            var insideString = false
            var previous: Character?
            var cursor = opening.upperBound

            while cursor < text.endIndex, depth > 0 {
                let character = text[cursor]
                if character == "\"" && previous != "\\" { insideString.toggle() }
                if !insideString {
                    if character == "(" || character == "[" || character == "{" { depth += 1 }
                    if character == ")" || character == "]" || character == "}" { depth -= 1 }
                }
                previous = character
                cursor = text.index(after: cursor)
            }

            if depth == 0 { windows.append(String(text[opening.lowerBound..<cursor])) }
            searchStart = opening.upperBound
        }
        return windows
    }

    private func attributionBlock() throws -> String {
        let windows = balancedWindow(from: Self.attributionMarker, in: try source())
        XCTAssertEqual(
            windows.count, 1,
            "L'attribution de republication se monte EXACTEMENT une fois dans \(Self.cardFile) " +
            "(marqueur « \(Self.attributionMarker) »). En trouver un autre nombre veut dire que " +
            "le bloc a été déplacé ou dupliqué : les assertions ci-dessous ne sauraient plus " +
            "lequel interroger."
        )
        guard let block = windows.first else {
            throw XCTSkip("Bloc d'attribution introuvable — voir l'assertion ci-dessus.")
        }
        return block
    }

    // MARK: - Le visible : l'icône, puis @handle. Rien d'autre.

    func test_attributionBlock_isAnchoredOnABalancedBrace() throws {
        let block = try attributionBlock()
        XCTAssertTrue(
            block.hasSuffix("}"),
            "La fenêtre de l'attribution doit se refermer sur son accolade équilibrée — sinon " +
            "les assertions de contenu lisent une fenêtre tronquée et deviennent vacuously vraies."
        )

        // Prise FALSIFIABLE (revue DoD E5, constat 3) : sur du Swift compilable,
        // `hasSuffix("}")` est vrai par construction — balancedWindow ne rend une
        // fenêtre QUE lorsque la profondeur revient à zéro, donc ce test ne pouvait
        // pas rougir et gonflait le compte d'une assertion qui ne défendait rien.
        // Ce qui se perd RÉELLEMENT, c'est une fenêtre trop COURTE : amputée, elle
        // rendrait vacuously vraies les assertions d'absence qui suivent. L'étiquette
        // d'accessibilité est le dernier élément du bloc — l'exiger prouve que la
        // fenêtre va jusqu'au bout.
        XCTAssertTrue(
            block.contains(".accessibilityLabel("),
            "La fenêtre doit atteindre l'étiquette d'accessibilité, dernier élément de " +
            "l'attribution. Sans elle, la fenêtre est tronquée et tout ce que les autres " +
            "assertions ne trouvent pas est « absent » par accident.\n\(block)"
        )
    }

    func test_attributionKeepsTheRepostGlyph() throws {
        XCTAssertTrue(
            try attributionBlock().contains("arrow.2.squarepath"),
            "L'attribution doit garder son icône de republication : c'est ELLE qui porte le verbe " +
            "désormais absent du texte. Sans icône, « @handle » seul ne dit plus rien."
        )
    }

    func test_attributionVisibleText_isTheHandleAlone_withoutAnyVerb() throws {
        let block = try attributionBlock()
        XCTAssertTrue(
            block.contains("Text(\"@\\(handle)\")"),
            "Le texte VISIBLE de l'attribution est le handle seul (« @handle »), directive " +
            "produit du 2026-08-19. Trouvé à la place :\n\(block)"
        )

        // Le « SEUL » du nom de ce test, enfin asserté (revue DoD E5, constat 1).
        // La présence du handle ne dit RIEN de son voisinage : un futur commit
        // qui rajoute « · republié » sous une clé NEUVE — donc invisible à la
        // garde de clé ci-dessous, qui ne compte que le préfixe existant —
        // passerait vert. Compter les Text( rendus est ce qui ferme ce chemin :
        // l'attribution en porte EXACTEMENT un, celui du handle. Le verbe de
        // l'étiquette VoiceOver n'en est pas un (c'est un String(format:)).
        let renderedTexts = block.components(separatedBy: "Text(").count - 1
        XCTAssertEqual(
            renderedTexts, 1,
            "L'attribution ne rend qu'UN texte : « @handle ». \(renderedTexts) trouvé(s) — " +
            "un voisin a été ajouté, et l'icône a cessé d'être le verbe (B3.2).\n\(block)"
        )
    }

    /// Le cœur de la garde : la clé localisée du verbe ne doit apparaître QUE
    /// dans l'étiquette d'accessibilité. Chaque occurrence dans la fenêtre de
    /// l'attribution doit être couverte par la fenêtre de
    /// `.accessibilityLabel(` — une occurrence de plus, c'est un verbe rendu.
    func test_attributionVerbLivesOnlyInTheAccessibilityLabel() throws {
        let block = try attributionBlock()
        let labelWindows = balancedWindow(from: ".accessibilityLabel(", in: block)

        let occurrencesInBlock = block.components(separatedBy: Self.verbKeyPrefix).count - 1
        let occurrencesInLabels = labelWindows
            .map { $0.components(separatedBy: Self.verbKeyPrefix).count - 1 }
            .reduce(0, +)

        XCTAssertGreaterThan(
            occurrencesInBlock, 0,
            "La clé \(Self.verbKeyPrefix) doit rester VIVANTE dans l'attribution : elle porte " +
            "l'étiquette VoiceOver du groupe. La supprimer ferait annoncer « @handle » sans dire " +
            "pourquoi."
        )
        XCTAssertEqual(
            occurrencesInLabels, occurrencesInBlock,
            "Toute occurrence de \(Self.verbKeyPrefix) doit vivre dans .accessibilityLabel( — " +
            "jamais dans un Text( rendu. \(occurrencesInBlock) occurrence(s) dans le bloc, " +
            "\(occurrencesInLabels) sous une étiquette : le verbe est revenu à l'écran.\n\(block)"
        )
    }

    // MARK: - VoiceOver : la phrase complète, elle, ne se perd pas

    func test_attributionCollapsesIntoOneAccessibilityElement() throws {
        let block = try attributionBlock()
        XCTAssertTrue(
            block.contains("accessibilityElement(children: .ignore)"),
            "L'attribution doit se réduire à UN élément d'accessibilité : sans quoi VoiceOver lit " +
            "l'icône et le handle séparément, et l'étiquette de groupe ne s'applique jamais."
        )
    }

    func test_accessibilityLabelKeepsBothPhrases_withAndWithoutHandle() throws {
        let labels = balancedWindow(from: ".accessibilityLabel(", in: try attributionBlock())
        let joined = labels.joined(separator: "\n")
        XCTAssertTrue(
            joined.contains("\"feed.post.reposted_from\""),
            "L'étiquette VoiceOver doit garder la phrase avec handle (feed.post.reposted_from)."
        )
        XCTAssertTrue(
            joined.contains("\"feed.post.reposted\""),
            "L'étiquette VoiceOver doit garder son repli sans handle (feed.post.reposted) — un " +
            "repost dont l'auteur d'origine est inconnu reste annonçable."
        )
    }
}
