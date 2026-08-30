import XCTest

/// Garde de câblage pour #4474 — la légende posée sur le canvas du lecteur.
///
/// Le bloc de description existait déjà, et il était INERTE : `Text` brut dans
/// un cartouche noir opaque, `lineLimit(4)`, et `allowsHitTesting(false)` sur
/// tout le bloc — donc indépliable par construction. Ces témoins gardent les
/// trois choses qui le rendent vivant, et la quatrième qui l'empêche de geler
/// la lecture.
final class StoryCaptionOverlayWiringGuardTests: XCTestCase {

    private static let canvasPath = "Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"
    private static let viewerPath = "Meeshy/Features/Main/Views/StoryViewerView.swift"
    private static let contentPath = "Meeshy/Features/Main/Views/StoryViewerView+Content.swift"

    // MARK: - La couche partagée remplace le cartouche

    func test_leLecteurMonteLaCouchePartagee() throws {
        let source = try Self.strippedSource(at: Self.canvasPath)
        XCTAssertTrue(
            source.contains("MediaCaptionOverlay("),
            "le lecteur de story doit monter `MediaCaptionOverlay` — le composant partagé qui tient la règle des dix mots (#4474)"
        )
    }

    /// **Témoin NÉGATIF, et il porte le défaut d'origine.** Le cartouche noir
    /// opaque masquait la composition qu'il commente ; le porteur a demandé de
    /// l'OMBRE à la place. Réintroduire un fond plein sous la légende doit faire
    /// rougir.
    func test_laLegendeNaPlusDeCartoucheOpaque() throws {
        let source = try Self.strippedSource(at: Self.canvasPath)
        guard let bloc = Self.captionBlock(in: source) else {
            throw GuardIsBlind(description: "Bloc de la légende introuvable : la garde ne garde plus rien")
        }
        XCTAssertFalse(
            bloc.contains("RoundedRectangle(cornerRadius: 10)"),
            "la légende ne doit plus poser de cartouche plein — l'ombre porte la lisibilité (#4474)"
        )
        XCTAssertFalse(
            bloc.contains("lineLimit(4)"),
            "la troncature se compte en MOTS dans le composant partagé, pas en lignes chez l'hôte"
        )
    }

    /// **Le défaut EXACT qui la rendait indépliable.** `allowsHitTesting(false)`
    /// posé sur le conteneur éteint le bouton « voir plus » avec le reste.
    func test_leBlocDeLegendeNestPlusRenduIntouchable() throws {
        let source = try Self.strippedSource(at: Self.canvasPath)
        guard let bloc = Self.captionBlock(in: source) else {
            throw GuardIsBlind(description: "Bloc de la légende introuvable")
        }
        XCTAssertFalse(
            bloc.contains("allowsHitTesting(false)"),
            "le bloc de la légende ne doit plus être rendu intouchable — c'est ce qui la rendait indépliable (#4474)"
        )
    }

    // MARK: - Déplier suspend la lecture

    func test_laLegendeDepliaeeEstUneCauseDePauseAPartEntiere() throws {
        let source = try Self.strippedSource(at: Self.contentPath)
        guard let range = source.range(of: "var shouldPauseTimer: Bool {") else {
            throw GuardIsBlind(description: "`shouldPauseTimer` introuvable")
        }
        let bloc = Self.braceBlock(in: source, from: range.lowerBound)
        XCTAssertTrue(
            bloc.contains("isCaptionExpanded"),
            "une légende dépliée doit suspendre la lecture — sinon la slide avance sous le texte qu'on lit"
        )
    }

    /// La pause passe par l'AGRÉGAT, jamais par `isPaused` : ce drapeau
    /// appartient déjà à l'appui long et aux feuilles, et le relâcher au repli
    /// relâcherait la leur.
    func test_laBasculeNecritJamaisIsPaused() throws {
        let source = try Self.strippedSource(at: Self.viewerPath)
        guard let range = source.range(of: "func toggleCaptionExpansion() {") else {
            throw GuardIsBlind(description: "`toggleCaptionExpansion()` introuvable")
        }
        let bloc = Self.braceBlock(in: source, from: range.lowerBound)
        XCTAssertFalse(
            bloc.contains("isPaused"),
            "la bascule ne doit pas écrire `isPaused` — l'agrégat `shouldPauseTimer` porte déjà la cause (#4474)"
        )
    }

    // MARK: - Une pause dont la cause a quitté l'écran est un GEL

    /// Le cas le plus grave : la légende laissée dépliée garde
    /// `shouldPauseTimer` vrai sur la story SUIVANTE, qui ne repart alors
    /// jamais. Le repli doit être posé sur les DEUX axes de navigation.
    func test_laLegendeSeReplieSurLesDeuxAxesDeNavigation() throws {
        let source = try Self.strippedSource(at: Self.viewerPath)
        for axe in ["currentStoryIndex", "currentGroupIndex"] {
            guard let range = source.range(of: ".adaptiveOnChange(of: \(axe)) {") else {
                throw GuardIsBlind(description: "Gestionnaire de `\(axe)` introuvable")
            }
            let bloc = Self.braceBlock(in: source, from: range.lowerBound)
            XCTAssertTrue(
                bloc.contains("isCaptionExpanded = false"),
                "changer de \(axe) doit replier la légende — sans quoi la lecture gèle sur la story suivante (#4474)"
            )
        }
    }

    // MARK: - Extraction

    private struct GuardIsBlind: Error, CustomStringConvertible {
        let description: String
    }

    private static func strippedSource(at relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relativePath))
    }

    /// Le bloc de la légende, borné par sa condition de montage. On le cerne
    /// plutôt que de chercher dans tout le fichier : `allowsHitTesting(false)`
    /// est juste et NÉCESSAIRE quelques lignes plus haut, sur la transcription
    /// vocale — une garde qui ne bornerait pas rougirait sur un voisin innocent.
    private static func captionBlock(in source: String) -> String? {
        guard let start = source.range(of: "if currentVoiceCaption == nil, let description = currentStoryDescription {") else {
            return nil
        }
        return braceBlock(in: source, from: start.lowerBound)
    }

    private static func braceBlock(in source: String, from start: String.Index) -> String {
        var depth = 0
        var index = start
        while index < source.endIndex {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" {
                depth -= 1
                if depth == 0 { return String(source[start...index]) }
            }
            index = source.index(after: index)
        }
        return String(source[start...])
    }
}
