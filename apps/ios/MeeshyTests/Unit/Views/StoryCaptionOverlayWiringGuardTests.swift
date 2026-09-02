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
    private static let captionLayerPath = "Meeshy/Features/Main/Views/StoryViewerView+CanvasCaption.swift"

    // MARK: - La couche partagée remplace le cartouche

    func test_leLecteurMonteLaCouchePartagee() throws {
        let source = try Self.strippedSource(at: Self.captionLayerPath)
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
        let source = try Self.strippedSource(at: Self.captionLayerPath)
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
        let source = try Self.strippedSource(at: Self.captionLayerPath)
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

    /// **La story REFUSE le voile du composant** (directive porteur 2026-09-02).
    ///
    /// Elle a mieux : sa scène s'efface à 0,28 et laisse remonter le fond
    /// naturel de la slide. Le dégradé du composant s'y AJOUTAIT — deux
    /// mécanismes pour un seul effet, dont l'un venait remplacer l'autre, et
    /// aucun témoin ne pouvait rougir puisque chacun faisait son travail.
    ///
    /// > Un mécanisme REMPLACÉ ne disparaît pas de lui-même. Quand une directive
    /// > change la MANIÈRE d'obtenir un effet, quelqu'un doit retirer l'ancienne.
    func test_laStoryRefuseLeVoileDuComposant() throws {
        let source = try Self.strippedSource(at: Self.captionLayerPath)
        guard let bloc = Self.captionBlock(in: source) else {
            throw GuardIsBlind(description: "Bloc de la légende introuvable")
        }
        XCTAssertTrue(
            bloc.contains("dimsBackgroundWhenExpanded: false"),
            "la story doit refuser le voile de la couche partagée — sa scène s'efface déjà (#4831)"
        )
    }

    // MARK: - Une légende, pas l'index de recherche

    /// **Le `content` d'une story a deux natures pour un seul nom** (#4502).
    ///
    /// La passerelle écrit dans `content` soit la légende de l'auteur, soit
    /// l'index de recherche qu'elle fabrique en concaténant les objets texte
    /// d'une story qui n'a pas de légende. Rendu tel quel, cet index affichait
    /// le texte du canvas une SECONDE fois, juste dessous.
    ///
    /// > Une valeur qui a deux natures et un seul nom oblige chaque
    /// > consommateur à redéduire sa provenance — et le premier qui oublie
    /// > l'affiche deux fois. Le serveur produit l'index ET le moyen de le
    /// > reconnaître ; seul le second ne traversait pas.
    func test_laLegendeNestJamaisLIndexDeRecherche() throws {
        let source = try Self.strippedSource(at: Self.canvasPath)
        guard let range = source.range(of: "var currentStoryDescription: String? {") else {
            throw GuardIsBlind(description: "`currentStoryDescription` introuvable")
        }
        let bloc = Self.braceBlock(in: source, from: range.lowerBound)
        XCTAssertTrue(
            bloc.contains("StoryDerivedContent.caption("),
            "la description doit passer par la règle qui distingue légende et index dérivé (#4502)"
        )
        XCTAssertTrue(
            bloc.contains("original: story.content"),
            "la décision se prend sur l'ORIGINAL : la prendre sur le résolu ramènerait le doublon "
                + "pour les seuls lecteurs d'une autre langue, la passerelle composant l'index dans "
                + "chaque langue (#4502)"
        )
        XCTAssertTrue(
            bloc.contains("textObjects.map(\\.text)"),
            "les textes comparés viennent de `\\.text` — le décodeur SDK y normalise l'alias legacy "
                + "`content`, et lire l'autre clé viderait la comparaison sans rien faire rougir"
        )
    }

    // MARK: - Lire ne doit pas faire tourner la story

    /// **Le corpus déplié est une `ScrollView` montée sous le drag du lecteur**
    /// (directive porteur 2026-09-02 : « permettre le defilement sans agir sur
    /// les swipe up et down de la story »).
    ///
    /// `unifiedDragGesture` est monté sur un ANCÊTRE de tout le contenu du
    /// lecteur. Le mécanisme qui lui fait rendre la main existe depuis les
    /// commentaires — `hasScrollableReaderSurface` + le bord publié par
    /// `StoryReaderScrollableSurfaceTopKey` — mais il énumère ses surfaces une
    /// par une, et la légende n'y a jamais été inscrite.
    ///
    /// > Un mécanisme de cession qui énumère ses ayants droit ne protège que ce
    /// > qu'on a pensé à y écrire. Chaque nouvelle surface défilante naît HORS
    /// > de sa protection, sans que rien ne rougisse.
    func test_laLegendeDeplieeCedeLeGesteAuDefilement() throws {
        let source = try Self.strippedSource(at: Self.viewerPath)
        guard let range = source.range(of: "var hasScrollableReaderSurface: Bool {") else {
            throw GuardIsBlind(description: "`hasScrollableReaderSurface` introuvable")
        }
        let bloc = Self.braceBlock(in: source, from: range.lowerBound)
        XCTAssertTrue(
            bloc.contains("isCaptionExpanded"),
            "une légende dépliée embarque sa propre `ScrollView` : le drag du lecteur doit lui rendre les gestes qui y naissent (#4831)"
        )
    }

    /// Le bord supérieur RÉEL de la zone défilante — sans lui, la garde de point
    /// de départ retombe sur son fail-safe (« tout le geste revient à la
    /// surface ») et le lecteur perd ses swipes sur toute la hauteur de l'écran
    /// dès qu'une légende est dépliée.
    func test_leLecteurPublieLeBordDeLaZoneDefilanteDeLaLegende() throws {
        let source = try Self.strippedSource(at: Self.captionLayerPath)
        guard let bloc = Self.captionBlock(in: source) else {
            throw GuardIsBlind(description: "Bloc de la légende introuvable")
        }
        // DEUX assertions, parce que la mesure vit dans une vue à part : le bloc
        // MONTE la sonde, la sonde PUBLIE la clé. Ne chercher la clé que dans le
        // bloc rougirait sur une extraction parfaitement correcte ; ne la
        // chercher que dans le fichier laisserait passer une sonde que plus
        // personne ne monte — le défaut de la couche morte, une échelle plus bas.
        XCTAssertTrue(
            bloc.contains("captionScrollableSurfaceProbe"),
            "le bloc de la légende doit monter la sonde qui publie le bord de sa zone défilante (#4831)"
        )
        XCTAssertTrue(
            source.contains("StoryReaderScrollableSurfaceTopKey"),
            "et cette sonde doit publier la clé — sinon la cession du geste est aveugle et le drag parent avale tout l'écran (#4831)"
        )
    }

    /// **Le haut du viewport ramène le corpus en tête** (directive porteur
    /// 2026-09-02). L'atome ne connaît que sa fenêtre ; c'est l'hôte qui sait ce
    /// qu'est « le haut du viewport », et qui doit donc armer le token.
    func test_leHautDuViewportRamèneLeCorpusEnTête() throws {
        let source = try Self.strippedSource(at: Self.captionLayerPath)
        guard let bloc = Self.captionBlock(in: source) else {
            throw GuardIsBlind(description: "Bloc de la légende introuvable")
        }
        XCTAssertTrue(
            bloc.contains("scrollToTopToken:"),
            "l'hôte doit passer le token de retour en tête à la couche partagée (#4831)"
        )
        let couche = try Self.strippedSource(at: Self.captionLayerPath)
        XCTAssertTrue(
            couche.contains("captionScrollToTopToken += 1"),
            "et l'armer depuis la zone tactile posée au-dessus du corpus (#4831)"
        )
        XCTAssertTrue(
            couche.contains("storyTopChromeReserve"),
            "cette zone est montée AU-DESSUS du chrome (zIndex 60) : sans réserve, elle avale le bouton de fermeture (#4831)"
        )
    }

    /// **Une couche extraite qui n'est plus montée est une couche MORTE.**
    ///
    /// Toutes les gardes ci-dessus lisent maintenant le fichier de la légende ;
    /// aucune ne dirait que le canvas a cessé de l'appeler. Le fichier resterait
    /// parfait, ses témoins verts, et l'écran n'aurait plus de légende.
    ///
    /// > Déplacer du code déplace aussi ce que les gardes MESURENT. Celle qui
    /// > garde le nouveau site ne garde pas le lien vers lui — et c'est le lien
    /// > que l'extraction vient de créer.
    func test_leCanvasMonteToujoursLaCoucheExtraite() throws {
        let source = try Self.strippedSource(at: Self.canvasPath)
        XCTAssertTrue(
            source.contains("captionLayer(geometry: geometry)"),
            "le canvas doit monter `captionLayer` — extraite du canvas en #4831, elle n'est rendue par personne d'autre"
        )
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
