import XCTest
@testable import Meeshy

/// Gardes de câblage — Lot E, Task E3 (« La scène dans la carte »,
/// `MeeshyScenePlayer(.card)`).
///
/// Sept garanties de SOURCE, ancrées sur `FeedPostCard.swift` (§D lot E) :
/// 1. quand `post.storyEffects?.canvasV3 != nil`, la carte monte
///    `MeeshyScenePlayer(… mode: .card …)` — jamais `.reader` (le mode
///    `.card` verrouille déjà pause/muet/boucle côté SDK, `ScenePlayerConfig`,
///    B4 gelé) ;
/// 2. le Prisme Linguistique est câblé : `.preferredContentLanguages(…)`
///    reçoit les langues préférées du lecteur (`AuthManager.shared.currentUser?
///    .preferredContentLanguages`) — sans quoi `MeeshyScenePlayer` garde
///    `languages: []` et `StoryTextObject.resolvedText` rend inconditionnellement
///    le texte ORIGINAL de l'auteur (correctif rejet DoD rév. 15, constat 1) ;
/// 3. le player dérive sa hauteur du ratio 9:16 appliqué à sa largeur RÉELLE
///    (`.aspectRatio(9.0 / 16.0, contentMode: .fit)`, même patron que le
///    voisin `StoryRepostEmbedCell` qui rend le MÊME hôte dans le MÊME fil)
///    — jamais une hauteur en points figée sur la largeur MAXIMALE, qui
///    déforme la scène à toute largeur de carte réelle (correctif rejet DoD
///    rév. 15, constat 2) — et jamais un `GeometryReader` qui reboucle sa
///    propre mesure sur le layout (piège self-sizing distinct : bottom-up,
///    hôte UIKit *mesurant* sa propre taille — pas le cas ici, `.aspectRatio`
///    est top-down, le parent propose la taille) ;
/// 4. le tap route vers `onTapPost?(post)` — le MÊME callback que le reste
///    de la carte (texte, auteur), donc le plein écran EXISTANT
///    (PostDetailView) — jamais un nouveau `.fullScreenCover`/`.sheet`
///    dédié à la scène (« pas de nouveau viewer ») ;
/// 5. `isPlaying` projette l'ÉLECTION du viewport (`.constant(isActive)`,
///    valeur reçue du container) et la scène RAPPORTE sa frame — jamais un
///    `.constant(false)` figé, et jamais un `@State` de lecture basculable
///    (recherche par MOTIF, pas par nom littéral — un renommage ne doit pas
///    pouvoir contourner la garde). Le gel d'origine (revue Fable n°25) est
///    renversé par la directive porteur du 2026-09-05 : « repartage ou non,
///    les scènes sont comme les vidéos ». La carte ne DÉCIDE toujours pas de
///    sa lecture — le viewport le fait pour tout le fil, et au plus une
///    surface décode à la fois ;
/// 6. l'élément d'accessibilité de la scène est une FEUILLE activable
///    (`.accessibilityElement(children: .ignore)` + `.accessibilityLabel` +
///    `.accessibilityAction`) — jamais un CONTENEUR (`children: .contain`)
///    qui n'expose aucune action au lecteur d'écran malgré le trait bouton
///    promis (correctif rejet DoD rév. 15, constat 4).
final class FeedPostCardScenePlayerGuardTests: XCTestCase {

    /// **Deux sources, nommées par RESPONSABILITÉ — jamais par fichier seul.**
    ///
    /// La surface de scène a quitté `FeedPostCard.swift` le 2026-09-05
    /// (`FeedSceneAutoplay.swift`) : ce fichier est en dette de taille, et la
    /// directive interdit d'y ajouter avant d'en avoir extrait. Une garde
    /// ancrée sur un chemin en dur vire au rouge à chaque découpe sans qu'aucun
    /// COMPORTEMENT n'ait changé — d'où deux accesseurs qui disent ce qu'ils
    /// cherchent : l'HÔTE (le site d'appel et son accessibilité) et la SURFACE
    /// (le player lui-même).
    private func hostSource() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/FeedPostCard.swift")
    }

    private func sceneSource() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/FeedSceneAutoplay.swift")
    }

    /// Le corpus des deux — pour les gardes qui interdisent quelque chose
    /// PARTOUT, quel que soit le fichier où la scène a fini par vivre.
    private func source() throws -> String {
        try hostSource() + "\n" + sceneSource()
    }

    /// Le bloc de code entre deux marqueurs (le second exclu). `end == nil`
    /// borne jusqu'à la fin du fichier. Même convention que
    /// `MuteButtonExistenceGuardTests`.
    private func block(from start: String, to end: String?, in text: String) -> String {
        guard let startRange = text.range(of: start) else { return "" }
        let tail = text[startRange.upperBound...]
        guard let end, let endRange = tail.range(of: end) else { return String(tail) }
        return String(tail[..<endRange.lowerBound])
    }

    /// Le corps de la SURFACE de scène — `PostSceneCard.body`, borné par la
    /// conformance `Equatable` qui la suit.
    private func cardScenePlayerBlock(in text: String) throws -> String {
        let block = block(from: "struct PostSceneCard: View {", to: "extension PostSceneCard: Equatable", in: text)
        if block.isEmpty {
            XCTFail("PostSceneCard introuvable dans FeedSceneAutoplay.swift")
        }
        return block
    }

    /// Le bloc du SITE D'APPEL de `cardScenePlayer(document:)` dans `body`
    /// (les modificateurs d'accessibilité chaînés vivent LÀ, pas dans la
    /// fonction elle-même).
    private func cardSceneCallSiteBlock(in text: String) throws -> String {
        let block = block(
            from: "if let cardSceneDocument {",
            to: "} else if isStoryRepost",
            in: text
        )
        if block.isEmpty {
            XCTFail("Site d'appel de cardScenePlayer(document:) introuvable dans FeedPostCard.swift")
        }
        return block
    }

    // MARK: - 1. Mode .card, jamais .reader

    func test_mountsMeeshyScenePlayer_inCardMode() throws {
        let text = try source()
        XCTAssertTrue(
            text.contains("MeeshyScenePlayer("),
            "La carte doit monter MeeshyScenePlayer quand le post porte un canvas v3 propre."
        )
        XCTAssertTrue(
            text.contains("mode: .card"),
            "Le mode passé DOIT être .card — jamais .reader (réservé au viewer story, E4)."
        )
    }

    func test_neverMountsReaderMode() throws {
        let text = try source()
        XCTAssertFalse(
            text.contains("mode: .reader"),
            "FeedPostCard ne doit JAMAIS monter le mode .reader — c'est le mode du viewer " +
            "story (E4), pas de la carte de post."
        )
    }

    func test_gatedOnOwnCanvasV3_notRepostCanvas() throws {
        let text = try hostSource()
        XCTAssertTrue(
            text.contains("post.storyEffects?.canvasV3"),
            "La porte doit lire le storyEffects PROPRE du post — jamais celui d'un repost " +
            "(StoryRepostEmbedCell reste le chemin des reposts de story, hors périmètre E3)."
        )
    }

    // MARK: - 2. Prisme Linguistique câblé (correctif rejet DoD rév. 15, constat 1)

    func test_scenePlayer_appliesPreferredContentLanguages() throws {
        let text = try sceneSource()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains(".preferredContentLanguages("),
            "La scène de carte DOIT appeler .preferredContentLanguages(...) — sans quoi " +
            "MeeshyScenePlayer garde languages: [] et StoryTextObject.resolvedText rend " +
            "inconditionnellement le texte ORIGINAL de l'auteur, quelle que soit la langue du " +
            "lecteur (violation du Prisme Linguistique, « le prisme s'applique à TOUT le contenu »)."
        )
        // La SOURCE des langues vit chez le CONTAINER, pas dans la feuille : une
        // feuille de liste ne lit jamais un singleton global, elle reçoit des
        // valeurs (« Zero Unnecessary Re-render »). Le témoin interroge donc le
        // fichier, pas le bloc — mais toujours la MÊME source que le voisin.
        XCTAssertTrue(
            text.contains("AuthManager.shared.currentUser?.preferredContentLanguages"),
            "La source des langues préférées doit être la MÊME que celle du voisin " +
            "StoryRepostEmbedCell — AuthManager.shared.currentUser?.preferredContentLanguages " +
            "— jamais une resolution locale divergente ni une liste vide en dur."
        )
    }

    // MARK: - 3. Hauteur dérivée du ratio 9:16 sur la largeur RÉELLE (correctif rejet DoD rév. 15, constat 2)

    func test_scenePlayer_usesAspectRatioNineBySixteen() throws {
        let text = try sceneSource()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains(".aspectRatio(9.0 / 16.0, contentMode: .fit)"),
            "La scène de carte doit dériver sa hauteur du ratio 9:16 appliqué à la largeur " +
            "RÉELLEMENT proposée par le parent — même patron que le voisin StoryRepostEmbedCell " +
            "(même hôte StoryReaderRepresentable, même fil) — jamais une hauteur en points figée " +
            "sur la largeur MAXIMALE (420pt × 16/9 = 747pt), qui déforme la scène dès que la " +
            "largeur réelle de la carte (≈329pt sur iPhone 16 Pro, après le double padding " +
            "horizontal de 16pt) est inférieure au plafond."
        )
    }

    func test_scenePlayer_doesNotDeriveHeightFromMeasuredLayout() throws {
        let text = try sceneSource()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertFalse(
            block.contains("GeometryReader"),
            "cardScenePlayer ne doit pas mesurer sa propre taille via GeometryReader — " +
            ".aspectRatio est un modificateur TOP-DOWN (le parent propose la taille au enfant), " +
            "distinct du piège self-sizing BOTTOM-UP (un hôte qui mesure sa propre taille et la " +
            "reboucle sur le layout, famille du crash SIGTRAP _updateVisibleCellsNow documenté " +
            "par l'incident MessageListLayout.swift — SwiftUI-dans-cellule-UIKit, l'inverse du " +
            "cas présent, UIKit-dans-SwiftUI)."
        )
    }

    // MARK: - 4. Tap → plein écran EXISTANT, pas de nouveau viewer

    func test_tap_routesThroughExistingOnTapPost() throws {
        let text = try sceneSource()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains(".onTapGesture { onTapPost?(post) }"),
            "Le tap doit router vers onTapPost?(post) — le MÊME callback que le reste de la " +
            "carte (texte, auteur), donc le plein écran EXISTANT (PostDetailView), jamais un " +
            "nouveau viewer dédié."
        )
    }

    func test_noNewFullscreenCoverIntroducedForScene() throws {
        let text = try hostSource()
        let fullscreenCoverCount = text.components(separatedBy: ".fullScreenCover(").count - 1
        XCTAssertEqual(
            fullscreenCoverCount, 2,
            "E3 ne doit introduire AUCUN nouveau `.fullScreenCover` — seuls les deux déjà " +
            "existants (position, galerie média) doivent rester : la scène route par " +
            "onTapPost?(post), pas par une présentation neuve."
        )
    }

    // MARK: - 5. La lecture appartient au VIEWPORT, jamais à la carte

    /// **`isPlaying` est une valeur REÇUE, jamais une décision locale.**
    ///
    /// Ce témoin exigeait `.constant(false)` jusqu'au 2026-09-05 : la carte
    /// naissait en pause et le RESTAIT (revue Fable n°25, « zéro AVPlayer actif
    /// ici »). La directive porteur — « repartage ou non, les scènes sont comme
    /// les vidéos : face à elles dans le viewport, il faut maintenir une
    /// cohérence générale » — le renverse, et pour une raison plus forte que sa
    /// date : **le gel ne tenait son objectif de performance que sur la surface
    /// qu'il gelait.** La story repartagée d'à côté jouait sans élection ni
    /// call-awareness — donc autant de décodages simultanés que de cellules
    /// visibles. L'élection unique tient l'objectif MIEUX : au plus une surface
    /// active dans tout le fil, scènes et réels confondus.
    ///
    /// Ce qui NE change pas, et que le témoin suivant garde : la carte ne
    /// FABRIQUE pas cet état. `.constant(…)` sur une valeur reçue le dit dans la
    /// syntaxe même — aucun chemin ne fait jouer une carte toute seule.
    func test_isPlaying_isDrivenByTheViewportElection_neverFrozen() throws {
        let text = try sceneSource()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains("isPlaying: .constant(isActive)"),
            "isPlaying doit projeter l'élection du viewport (`isActive`), reçue en VALEUR " +
            "du container — jamais un état fabriqué par la carte."
        )
        XCTAssertFalse(
            block.contains("isPlaying: .constant(false)"),
            "Une scène FIGÉE rompt la cohérence imposée le 2026-09-05 : dans le même fil, " +
            "une story repartagée et un réel jouent quand le viewport les élit. Le même " +
            "canvas ne peut pas bouger ou non selon la façon dont il est arrivé au fil."
        )
    }

    /// **La scène RAPPORTE sa frame, sinon elle ne peut pas être élue.**
    ///
    /// C'est la moitié qu'on oublie : `mostCenteredReel` n'a jamais regardé
    /// `kind`, donc rien n'interdisait à une scène de gagner l'élection — elle
    /// n'y CONCOURAIT simplement pas, faute de publier sa frame. Une surface
    /// pilotée par une élection à laquelle elle ne participe pas reste éteinte
    /// pour toujours, et aucun test de coordinateur ne peut le voir.
    func test_scene_reportsItsFrameToTheElection() throws {
        let text = try sceneSource()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains(".reportReelFrame(id: post.id, kind: .scene)"),
            "Sans `reportReelFrame`, la scène n'entre jamais dans l'élection et reste en " +
            "pause quoi qu'il arrive. L'identité est celle du POST contenant — jamais " +
            "celle de la story citée : un même canvas affiché deux fois dans le fil doit " +
            "élire exactement une surface."
        )
    }

    /// **L'étiquette « scène · muette, en pause » a disparu avec l'état qu'elle
    /// décrivait.** Elle reposait sur un raisonnement juste — « un état gardé
    /// mais muet se lit comme une panne » — mais elle décrivait l'état de la
    /// MACHINE, pas l'option du lecteur, et c'est ce que le porteur a signalé
    /// (« je ne comprends pas les scènes muettes en pause dans le feed »). Une
    /// surface qui joue quand on la regarde n'a plus rien à excuser.
    func test_noMutedPausedBadgeSurvives() throws {
        let text = try source()
        XCTAssertFalse(
            text.contains("feed.post.scene.muted_paused"),
            "Le badge d'annonce du gel ne doit plus exister — la scène joue quand le " +
            "viewport l'élit, et une étiquette qui décrit un état révolu se lit comme " +
            "une panne à son tour."
        )
    }

    /// Garde par MOTIF (pas par nom littéral) : aucun `@State` dont le nom mêle
    /// « scene »/« Scene » et « play »/« Play » ne doit exister dans le fichier —
    /// renommer `cardSceneIsPlaying` en `isCardScenePlaying`, `cardScenePlaying`,
    /// ou toute autre variante ne doit PAS pouvoir passer sous cette garde
    /// (correctif rejet DoD rév. 15, constat 5a).
    func test_noLocalPlaybackStateIntroducedForCardScene() throws {
        let text = try source()
        let regex = try NSRegularExpression(pattern: "@State[^\\n]*scene[^\\n]*play", options: [.caseInsensitive])
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let matches = regex.matches(in: text, options: [], range: range)
            .map { (text as NSString).substring(with: $0.range) }
        XCTAssertTrue(
            matches.isEmpty,
            "Aucun état local de lecture ne doit exister pour la scène de carte — isPlaying " +
            "reste un .constant(false) figé, jamais un @State basculable qu'un futur commit " +
            "pourrait faire dériver (recherché par MOTIF « scene…play », insensible à la casse " +
            "et au nom exact, pas par égalité littérale) : \(matches)."
        )
    }

    func test_noDirectAVPlayerConstructionInCard() throws {
        let text = try source()
        XCTAssertFalse(
            text.contains("AVPlayer("),
            "La carte ne doit jamais construire son propre AVPlayer — MeeshyScenePlayer(.card) " +
            "est le SEUL chemin de lecture, et il naît en pause/muet par construction (SDK)."
        )
    }

    // MARK: - 6. Accessibilité : feuille activable, pas un conteneur muet (correctif rejet DoD rév. 15, constat 4)

    func test_callSite_usesLeafAccessibilityElement_notContainer() throws {
        let text = try hostSource()
        let block = try cardSceneCallSiteBlock(in: text)
        XCTAssertTrue(
            block.contains(".accessibilityElement(children: .ignore)"),
            "La scène doit être un ÉLÉMENT d'accessibilité FEUILLE (children: .ignore) — même " +
            "patron que le voisin StoryRepostEmbedCell — pas un CONTENEUR (children: .contain) " +
            "qui n'expose lui-même aucune action au lecteur d'écran."
        )
        XCTAssertFalse(
            block.contains(".accessibilityElement(children: .contain)"),
            "La scène ne doit plus utiliser children: .contain : combiné à " +
            ".accessibilityAddTraits(.isButton) sans .accessibilityAction, l'élément s'annonce " +
            "bouton mais n'expose aucune action de lecteur d'écran déclenchable."
        )
    }

    func test_callSite_hasAccessibilityLabel() throws {
        let text = try hostSource()
        let block = try cardSceneCallSiteBlock(in: text)
        XCTAssertTrue(
            block.contains(".accessibilityLabel("),
            "La scène doit porter un accessibilityLabel qui l'identifie — un conteneur .ignore " +
            "sans label n'annonce rien au lecteur d'écran."
        )
    }

    func test_callSite_hasAccessibilityAction_matchingOnTapPost() throws {
        let text = try hostSource()
        let block = try cardSceneCallSiteBlock(in: text)
        XCTAssertTrue(
            block.contains(".accessibilityAction { onTapPost?(post) }"),
            "L'activation VoiceOver doit atteindre onTapPost?(post) — le MÊME patron déjà " +
            "utilisé ailleurs dans ce fichier (.accessibilityHint + .accessibilityAction, lignes " +
            "385-386 et 402-403) pour exactement ce besoin, jamais un .onTapGesture seul que " +
            "VoiceOver ne peut pas déclencher."
        )
    }

    // MARK: - Non-régression E1/E2 : l'accent de chrome reste l'accent du post

    func test_scenePlayer_usesPostAccentColor_notBadgeAccent() throws {
        let text = try sceneSource()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains("accentColorHex: accentColor"),
            "Le player doit recevoir l'accent déterministe du post (revue totale C8), pas " +
            "l'accent AA du badge son (backgroundSoundAccentHex, réservé à BackgroundSoundBadge)."
        )
    }
}
