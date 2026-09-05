import XCTest
@testable import Meeshy

/// **Une seule loi de lecture pour toutes les scènes du fil** (directive
/// porteur 2026-09-05).
///
/// > « Repartage ou non, les scènes sont comme les vidéos : lorsqu'on est face
/// > à elles dans le viewport, il faut maintenir une cohérence générale.
/// > Normalement les Posts, Reels et Story ne manipulent que des scènes. »
///
/// **Ce que ces témoins gardent est une COHÉRENCE, pas une surface.** Chacune
/// des trois politiques qui coexistaient était défendable prise seule — un gel
/// pour économiser le décodage, une lecture continue pour l'embed hérité, une
/// élection pour les réels. Aucun fichier n'était faux ; c'est leur SOMME qui
/// l'était, et une somme n'a aucun site où rougir. D'où des témoins qui
/// interrogent les surfaces ENSEMBLE, jamais une à la fois :
///
/// 1. toute surface qui monte une scène 9:16 dans le fil RAPPORTE sa frame —
///    sans quoi elle ne concourt pas à l'élection et reste éteinte pour
///    toujours, sans qu'aucun test de coordinateur puisse le voir ;
/// 2. aucune ne joue INCONDITIONNELLEMENT — la pause d'un embed est dérivée de
///    l'élection, jamais laissée à son défaut ;
/// 3. l'identité d'élection est celle du POST CONTENANT — un même canvas
///    affiché deux fois dans le fil élit exactement une surface ;
/// 4. l'observation du coordinateur vit dans un CONTAINER, jamais dans la
///    feuille : une élection ne doit pas ré-évaluer le `ForEach` entier.
final class FeedSceneCoherenceGuardTests: XCTestCase {

    /// Les fichiers qui montent une scène dans le FIL. Un fichier absent est
    /// ignoré par le corpus, jamais fatal — la liste anticipe la découpe.
    private static let sceneSurfaces = [
        "Meeshy/Features/Main/Views/FeedSceneAutoplay.swift",
        "Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift",
    ]

    private func source(of relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    // MARK: - 1. Toute scène du fil concourt à l'élection

    /// **Une surface pilotée par une élection à laquelle elle ne participe pas
    /// reste éteinte pour toujours.** `mostCenteredReel` n'a jamais lu `kind` :
    /// rien n'interdisait à une scène de gagner l'élection — elle n'y
    /// CONCOURAIT simplement pas. Le défaut ne se voit ni dans le coordinateur
    /// (qui élit correctement ce qu'on lui donne), ni dans la surface (qui
    /// obéit correctement à ce qu'elle reçoit) : il vit dans ce qui n'est écrit
    /// nulle part.
    func test_everySceneSurface_reportsItsFrame() throws {
        for path in Self.sceneSurfaces {
            let text = try source(of: path)
            guard text.contains("MeeshyScenePlayer(") || text.contains("StoryReaderRepresentable(") else { continue }
            XCTAssertTrue(
                text.contains(".reportReelFrame("),
                "\(path) monte une scène sans rapporter sa frame : elle ne concourt donc " +
                "jamais à l'élection du viewport et reste éteinte quoi qu'il arrive."
            )
        }
    }

    /// L'élection est keyée sur le POST CONTENANT — jamais sur l'id de la story
    /// ou du réel cité. Même règle que `ReelRepostEmbedCell.reelCellId` : une
    /// story affichée nativement ET repostée doit élire une seule surface.
    func test_electionIdentity_isTheContainingPost() throws {
        for path in Self.sceneSurfaces {
            let text = try source(of: path)
            guard text.contains(".reportReelFrame(") else { continue }
            XCTAssertTrue(
                text.contains(".reportReelFrame(id: post.id"),
                "\(path) doit s'élire sous l'id du POST contenant — un id de story ou de " +
                "réel cité ferait binder DEUX surfaces au moteur partagé quand le même " +
                "contenu apparaît deux fois dans le fil."
            )
            XCTAssertTrue(
                text.contains("kind: .scene"),
                "\(path) doit se déclarer `.scene` : c'est ce que la surface PORTE, et ce " +
                "qui rend l'inventaire des scènes du fil lisible d'un `grep`."
            )
        }
    }

    // MARK: - 2. Aucune scène ne joue inconditionnellement

    /// **La story repartagée était la seule surface du fil à jouer sans rien
    /// demander à personne** — `isPaused` laissé à son défaut `false`, donc
    /// autant de décodages simultanés que de cellules visibles, pendant qu'une
    /// scène COMPOSÉE à côté restait gelée. C'est l'incohérence exacte que la
    /// directive nomme.
    func test_storyRepostEmbed_derivesItsPauseFromTheElection() throws {
        let text = try source(of: "Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift")
        XCTAssertTrue(
            text.contains("isPaused: !isActive"),
            "La pause de l'embed doit être DÉRIVÉE de l'élection du viewport. Laissée à " +
            "son défaut, la surface joue en permanence — sans élection, sans " +
            "call-awareness, et sans que rien ne le dise."
        )
        XCTAssertFalse(
            text.contains("isPaused: false"),
            "Un `isPaused: false` en dur rétablit la lecture inconditionnelle que ce lot " +
            "corrige."
        )
    }

    // MARK: - 3. L'observation vit dans un container, jamais dans la feuille

    /// « Zero Unnecessary Re-render » : la feuille reçoit `isActive` en VALEUR,
    /// seul le container observe. Sans ce découpage, une élection ré-évalue le
    /// `ForEach` entier du fil — le coût que l'élection existe pour éviter.
    func test_onlyContainersObserveTheCoordinator() throws {
        let text = try source(of: "Meeshy/Features/Main/Views/FeedSceneAutoplay.swift")

        for container in ["PostSceneCardContainer", "StoryRepostEmbedContainer"] {
            XCTAssertTrue(
                text.contains("struct \(container): View {"),
                "\(container) doit exister : c'est lui qui observe le coordinateur pour " +
                "que la feuille n'ait pas à le faire."
            )
        }

        let leafBlock = block(from: "struct PostSceneCard: View {",
                              to: "extension PostSceneCard: Equatable",
                              in: text)
        XCTAssertFalse(leafBlock.isEmpty, "PostSceneCard introuvable")
        XCTAssertFalse(
            leafBlock.contains("@ObservedObject"),
            "La feuille de scène ne doit JAMAIS observer le coordinateur — elle reçoit " +
            "`isActive` en valeur. Un `@ObservedObject` ici ferait re-rendre toutes les " +
            "cartes du fil à chaque changement d'élection."
        )
        XCTAssertTrue(
            leafBlock.contains("let isActive: Bool"),
            "La feuille reçoit son élection en VALEUR primitive."
        )
    }

    /// Les deux feuilles sont `Equatable` et montées `.equatable()` — sans quoi
    /// le court-circuit promis par le container n'existe pas, et l'observation
    /// se paie sur toutes les cellules.
    func test_bothLeaves_areEquatableAndMountedAsSuch() throws {
        let autoplay = try source(of: "Meeshy/Features/Main/Views/FeedSceneAutoplay.swift")
        let embed = try source(of: "Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift")

        XCTAssertTrue(autoplay.contains("extension PostSceneCard: Equatable"),
                      "PostSceneCard doit être Equatable.")
        XCTAssertTrue(embed.contains("extension StoryRepostEmbedCell: Equatable"),
                      "StoryRepostEmbedCell doit être Equatable — elle est montée .equatable().")
        // **Un COMPTE se périme à chaque montage neuf ; une PROPRIÉTÉ non.** Le
        // témoin a d'abord épinglé « exactement 2 `.equatable()` », et il est
        // devenu faux dès que le choix container/feuille est descendu dans ce
        // fichier — sans qu'aucune règle ait bougé. Ce qui compte est que TOUT
        // montage d'une feuille de scène court-circuite : un container qui
        // observe sans court-circuiter coûte plus qu'il ne rapporte.
        for leaf in ["PostSceneCard(", "StoryRepostEmbedCell("] {
            var searchStart = autoplay.startIndex
            var mounts = 0
            while let call = autoplay.range(of: leaf, range: searchStart..<autoplay.endIndex) {
                let tail = autoplay[call.upperBound...]
                // La fenêtre couvre l'appel et ses modificateurs chaînés, bornée
                // par la fermeture du `body` ou le montage suivant.
                let window = String(tail.prefix(600))
                XCTAssertTrue(
                    window.contains(".equatable()"),
                    "Un montage de \(leaf) sans .equatable() : le container observe le " +
                    "coordinateur, donc CE montage se ré-évalue à chaque élection du fil " +
                    "— y compris celles qui ne le concernent pas."
                )
                mounts += 1
                searchStart = call.upperBound
            }
            XCTAssertGreaterThan(mounts, 0, "\(leaf) doit être monté au moins une fois")
        }
    }

    // MARK: - Helper

    private func block(from start: String, to end: String, in text: String) -> String {
        guard let startRange = text.range(of: start) else { return "" }
        let tail = text[startRange.upperBound...]
        guard let endRange = tail.range(of: end) else { return String(tail) }
        return String(tail[..<endRange.lowerBound])
    }
}
