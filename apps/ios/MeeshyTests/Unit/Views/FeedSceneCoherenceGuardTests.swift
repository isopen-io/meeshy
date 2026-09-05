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
///    toujours, sans qu'aucun test de coordinateur puisse le voir. Le
///    territoire se BALAIE (#5230) : une liste tenue à la main vérifierait
///    existentiellement ce que la doctrine quantifie universellement, et une
///    troisième surface née dans un fichier neuf ne serait lue par personne ;
/// 2. aucune ne joue INCONDITIONNELLEMENT — la pause d'un embed est dérivée de
///    l'élection, jamais laissée à son défaut ;
/// 3. l'identité d'élection est celle du POST CONTENANT — un même canvas
///    affiché deux fois dans le fil élit exactement une surface ;
/// 4. l'observation du coordinateur vit dans un CONTAINER, jamais dans la
///    feuille : une élection ne doit pas ré-évaluer le `ForEach` entier.
final class FeedSceneCoherenceGuardTests: XCTestCase {

    /// **Le territoire se BALAIE, il ne s'énumère pas** (#5230).
    ///
    /// La première version de cette garde tenait deux chemins à la main pour
    /// une doctrine UNIVERSELLE — « toute surface qui monte une scène 9:16 dans
    /// le fil rapporte sa frame ». Une troisième surface née dans un fichier
    /// NEUF n'aurait été lue par personne, et aurait donc pu inventer la
    /// quatrième politique que #5227 vient de supprimer. Une liste vérifie
    /// EXISTENTIELLEMENT ce que la prose quantifie UNIVERSELLEMENT ; l'écart
    /// n'a aucun site où rougir.
    ///
    /// Le balayage dépouille les commentaires : `FeedPostCard.swift` cite
    /// `MeeshyScenePlayer(` dans un doc-comment depuis l'extraction, et un
    /// `git grep` nu l'aurait rendu en faux positif.
    private static let sceneMountingCalls = ["MeeshyScenePlayer(", "StoryReaderRepresentable("]

    /// **La frontière que le balayage ne sait pas trancher : « est-ce une
    /// LISTE ? »** Une surface seule à l'écran n'a personne à qui disputer
    /// l'élection ; lui demander de rapporter sa frame serait faux. Chaque
    /// exclusion porte donc sa RAISON, et ajouter un fichier au territoire
    /// oblige à passer ici — un silence rouvrirait la porte que le balayage
    /// vient de fermer.
    private static let notAFeedList: [String: String] = [
        "PostDetailView+Canvas.swift": "plein écran de détail — une seule scène, aucune élection à disputer",
        "PostDetailView+RepostEmbed.swift": "idem, l'embed cité d'un détail",
        "StoryViewerView+Canvas.swift": "viewer story plein écran — la lecture y est commandée par le lecteur",
    ]
    // `MeeshyComposerHost+Socle.swift` a figuré ici une heure : je l'avais tiré
    // d'un `git grep` NU, où il apparaît parce qu'un doc-comment RACONTE qu'il
    // montait jadis un player (« Il montait `MeeshyScenePlayer(mode: .preview)`
    // sur… »). Le témoin ci-dessous l'a rendu dès sa première exécution — c'est
    // exactement le faux positif contre lequel le balayage dépouille les
    // commentaires, reproduit dans la table censée le corriger.

    /// Les vues de l'app qui montent réellement une scène, commentaires
    /// dépouillés, moins les non-listes NOMMÉES ci-dessus.
    private func feedSceneSurfaces(file: StaticString = #filePath) throws -> [(name: String, text: String)] {
        let root = MyStoriesSourceCorpus.appRoot(file: file).appendingPathComponent("Meeshy")
        let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        var found: [(String, String)] = []
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            let name = url.lastPathComponent
            guard Self.notAFeedList[name] == nil else { continue }
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let text = MyStoriesSourceCorpus.strippingComments(raw)
            guard Self.sceneMountingCalls.contains(where: text.contains) else { continue }
            found.append((name, text))
        }
        return found.sorted { $0.0 < $1.0 }
    }

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
        let surfaces = try feedSceneSurfaces()
        XCTAssertFalse(surfaces.isEmpty,
                       "Le balayage ne voit plus aucune surface de scène — il a perdu son " +
                       "terrain, et une garde qui ne regarde rien passe au vert pour rien.")
        for (name, text) in surfaces {
            XCTAssertTrue(
                text.contains(".reportReelFrame("),
                "\(name) monte une scène dans le fil sans rapporter sa frame : elle ne " +
                "concourt donc jamais à l'élection du viewport et reste éteinte quoi qu'il " +
                "arrive. Si cette vue n'est PAS une liste, l'inscrire dans `notAFeedList` " +
                "avec sa raison — jamais la laisser en silence."
            )
        }
    }

    /// **Le balayage doit VOIR ce qu'un `git grep` nu rendrait en faux
    /// positif — et l'inverse.** Témoin de mutation sur la fonction de
    /// détection elle-même : sans lui, un balayage qui aurait cessé de
    /// reconnaître les montages passerait au vert en ne trouvant rien.
    func test_theSweepReadsCodeNotComments() throws {
        let commentOnly = MyStoriesSourceCorpus.strippingComments("""
        /// Cette vue documentait MeeshyScenePlayer( sans le monter.
        struct Innocent: View { var body: some View { EmptyView() } }
        """)
        XCTAssertFalse(
            Self.sceneMountingCalls.contains(where: commentOnly.contains),
            "Un montage cité en COMMENTAIRE ne doit pas entrer dans le territoire — " +
            "c'est le cas de FeedPostCard.swift depuis l'extraction de #5227."
        )

        let realMount = MyStoriesSourceCorpus.strippingComments("""
        struct Coupable: View {
            var body: some View { MeeshyScenePlayer(document: d, mode: .card) }
        }
        """)
        XCTAssertTrue(
            Self.sceneMountingCalls.contains(where: realMount.contains),
            "Un montage RÉEL doit entrer dans le territoire, sans quoi la garde ne peut " +
            "plus rougir sur personne."
        )
    }

    /// Une exclusion NOMMÉE doit désigner un fichier qui existe et qui monte
    /// vraiment une scène — sinon la table devient un cimetière de noms qui
    /// dispense en silence des fichiers qu'elle ne décrit plus.
    /// **Un paramètre, même à valeur par défaut, rend un test INVISIBLE à
    /// XCTest.** Ce témoin est né avec `(file: StaticString = #filePath)` et
    /// n'a pas été exécuté une seule fois — 6 cas rapportés au lieu de 7, ce
    /// que seul le COMPTE révèle : aucun échec, aucun avertissement. Un test
    /// qui ne s'exécute pas est vert par omission.
    func test_everyExclusionStillDescribesARealSceneMounter() throws {
        let root = MyStoriesSourceCorpus.appRoot().appendingPathComponent("Meeshy")
        let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        var mounters: Set<String> = []
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift",
                  let raw = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let text = MyStoriesSourceCorpus.strippingComments(raw)
            if Self.sceneMountingCalls.contains(where: text.contains) {
                mounters.insert(url.lastPathComponent)
            }
        }
        for (name, reason) in Self.notAFeedList {
            XCTAssertTrue(
                mounters.contains(name),
                "`notAFeedList` dispense \(name) (« \(reason) ») mais ce fichier ne monte " +
                "plus aucune scène : le retirer de la table. Une exclusion périmée dispense " +
                "en silence, et c'est ainsi qu'un territoire se vide sans que rien ne le dise."
            )
        }
    }

    /// L'élection est keyée sur le POST CONTENANT — jamais sur l'id de la story
    /// ou du réel cité. Même règle que `ReelRepostEmbedCell.reelCellId` : une
    /// story affichée nativement ET repostée doit élire une seule surface.
    func test_electionIdentity_isTheContainingPost() throws {
        for (path, text) in try feedSceneSurfaces() {
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
