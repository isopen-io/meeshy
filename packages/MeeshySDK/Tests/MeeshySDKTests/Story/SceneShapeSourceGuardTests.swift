import XCTest

/// **Garde de source : la forme d'une scène a UN site, et tout hôte qui monte
/// le player le consulte** (#6904, décision #6896).
///
/// ## Ce qu'elle ferme
///
/// L'audit du 2026-09-17 a compté sur `dev` : onze montages du player,
/// quatorze fichiers de loi, **trois lois de ratio qui ne s'accordent pas**,
/// deux littéraux `9/16` et trois copies de la constante. Le document B avait
/// trois formes selon la surface. Rien ne rougissait — parce qu'une loi
/// dupliquée compile, et qu'un hôte qui n'en consulte aucune compile mieux
/// encore.
///
/// > **Un défaut de CONVERGENCE ne se voit dans aucun fichier.** Il se voit
/// > dans l'inventaire des fichiers, et seul un témoin qui balaie l'arbre le
/// > tient. C'est pourquoi la garde assertionne en ÉGALITÉ, jamais en
/// > inclusion : une inclusion resterait verte au douzième hôte.
///
/// ## Les deux listes, VIDES depuis le 2026-09-17
///
/// La seconde moitié du lot #6904 a réécrit les hôtes de `apps/ios/` : les
/// deux listes d'exceptions ci-dessous sont désormais VIDES, et le sont
/// devenues le cliquet du lot. Un hôte qui y entre après cette date n'est pas
/// une exception, c'est une régression.
///
/// ## Ce que cette garde PROUVE, et ce qu'elle NE PROUVE PAS (revue #6904, tour 2)
///
/// Elle prouve que la **constante 9:16** (règle 1, `SceneShape.aspect`) a un
/// site unique et que tout hôte qui monte le player la projette — en direct,
/// ou par un solveur CONNU (`SceneCarouselLayout`, `MediaStageFraming`,
/// `storyCanvasContainer`, `storyCanvasOrPlaceholder`) dont elle a vérifié
/// qu'il la porte une couche plus bas.
///
/// **Ce qu'elle ne prouve PAS : le CADRE binaire (règle 3, `frame`).** Aucun
/// hôte ne l'appelle, et le dire est la moitié honnête de cette garde.
///
/// **La règle 4 (`layout`), elle, EST câblée depuis le 2026-09-17** — et par
/// un témoin SÉPARÉ, `test_lesSurfacesPleinEcran_montentLaCarteDeScene`, parce
/// que le balayage ci-dessus ne peut pas l'exiger : il accepte une
/// consultation par SOLVEUR (`MediaStageFraming`, `SceneCarouselLayout`), ce
/// qui convient à un aperçu et jamais à un plein écran — ces solveurs rendent
/// un rapport CONTINU, la « quatrième forme » que la règle 3 exclut. Les cinq
/// fichiers des quatre surfaces plein écran (galerie cadré/immersif, lecteur
/// de stories, réel) doivent donc LIRE `SceneShape.layout` ou MONTER
/// `SceneCard`. La carte du FIL et les pages de carrousel restent hors loi
/// **par décision du porteur** : ce sont des aperçus (`SceneFraming.focus`,
/// union, plafond 1,4), pas des plein écrans.
final class SceneShapeSourceGuardTests: XCTestCase {

    /// **La constante 9:16 n'a qu'un site.** Toute autre écriture du rapport
    /// — littéral `9.0 / 16.0`, `9/16`, `0.5625` — est une copie qui dérivera.
    func test_leRapport9sur16_naQuUnSiteDansLeSDK() throws {
        let sources = try Self.swiftSources(under: "packages/MeeshySDK/Sources")
        let porteurs = sources
            .filter { Self.declaresTheRatio($0.code) }
            .map(\.path)

        let deliberes: Set<String> = [
            "MeeshySDK/Story/SceneShape.swift",   // la loi
            // Les deux tables de RECADRAGE proposées à l'auteur : `9:16` y est
            // un choix parmi d'autres (1:1, 4:5, 16:9…), pas le gabarit d'une
            // scène. Les faire projeter la loi ferait dire à la loi qu'elle
            // gouverne un menu de recadrage — elle ne gouverne que la scène.
            "MeeshyUI/Media/MediaTypes.swift",
            "MeeshySDK/Models/MediaCrop.swift",
        ]

        XCTAssertEqual(Set(porteurs), deliberes,
                       "Le rapport 9:16 se lit dans SceneShape.aspect ; toute autre écriture est " +
                       "une copie. Trouvé : \(porteurs.sorted())")
    }

    /// **Le rapport 9:16 écrit à la main dans `apps/ios` — l'inventaire que la
    /// seconde moitié du lot #6904 solde.**
    ///
    /// Il est SÉPARÉ du précédent, et pas par commodité : le SDK est converge,
    /// l'app ne l'est pas encore, et deux verdicts distincts empêchent qu'une
    /// régression du SDK se cache derrière une dette de l'app. La liste est
    /// DATÉE du 2026-09-17 et se vide à la fin du lot ; un site qui y entre
    /// après n'est pas une exception, c'est une copie de plus.
    func test_leRapport9sur16_danssApp_tientDansUnInventaireDate() throws {
        // **L'inventaire est VIDE depuis le 2026-09-17** (seconde moitié du
        // lot #6904) : les neuf sites datés ont tous été convertis en
        // projections de `SceneShape.aspect`. Toute réapparition du littéral
        // dans `apps/ios` est une COPIE, pas une exception.
        let detteDatee: Set<String> = []

        let porteurs = try Self.swiftSources(under: "apps/ios/Meeshy")
            .filter { Self.declaresTheRatio($0.code) }
            .map(\.path)

        XCTAssertEqual(Set(porteurs), detteDatee,
                       "Le rapport 9:16 se lit dans SceneShape.aspect. Nouveaux sites : " +
                       "\(Set(porteurs).subtracting(detteDatee).sorted()) ; dette soldée sans " +
                       "mise à jour de cette liste : \(detteDatee.subtracting(Set(porteurs)).sorted())")
    }

    /// **Tout hôte qui monte le player consulte la loi.** La liste d'exceptions
    /// porte les hôtes de `apps/ios/` que la seconde moitié du lot #6904
    /// réécrit — datée du 2026-09-17, et vide à la fin du lot.
    func test_toutHoteQuiMonteLePlayer_consulteLaLoi() throws {
        // **VIDE depuis le 2026-09-17** : les huit hôtes de la seconde moitié
        // du lot #6904 consultent tous désormais `SceneShape`, en code — soit
        // directement, soit par une délégation VÉRIFIÉE vers un solveur qui
        // porte la loi une couche plus bas (`consultsSceneShape` ci-dessous).
        // Un hôte qui ne ferait que CITER "SceneShape" dans un commentaire, sans
        // appeler ni la loi ni un de ses solveurs connus, n'est plus reconnu :
        // c'était le trou que `test_leDetecteurDeConsultation_ignoreUneCitationEnCommentaireSeul`
        // ferme, trouvé sur `PostDetailView+RepostEmbed.swift` (une citation en
        // commentaire, aucun appel réel dans le fichier).
        let exceptionsDatees: Set<String> = []

        let hotes = try Self.swiftSources(under: "packages/MeeshySDK/Sources")
            .filter { !Self.isThePlayerItself($0.path) }
            .map { (path: "packages/MeeshySDK/Sources/" + $0.path, code: $0.code) }
            + Self.swiftSources(under: "apps/ios/Meeshy")
            .map { (path: "apps/ios/Meeshy/" + $0.path, code: $0.code) }

        let muets = hotes
            .filter { Self.mountsThePlayer($0.code) && !Self.consultsSceneShape($0.code) }
            .map(\.path)

        XCTAssertEqual(Set(muets), exceptionsDatees,
                       "Un hôte monte le player sans consulter SceneShape (ou une exception datée " +
                       "a été réécrite sans vider cette liste). Manquants : " +
                       "\(Set(muets).subtracting(exceptionsDatees).sorted()) ; " +
                       "exceptions périmées : \(exceptionsDatees.subtracting(Set(muets)).sorted())")
    }

    /// **Les surfaces PLEIN ÉCRAN d'une scène montent LA carte — nommées une
    /// par une** (directive porteur du 2026-09-17, lot #6904).
    ///
    /// Le témoin précédent est un balayage : il attrape tout hôte qui monte le
    /// player sans consulter la loi, mais il accepte une consultation par
    /// SOLVEUR (`MediaStageFraming`, `SceneCarouselLayout`…) — ce qui est juste
    /// pour une carte de fil ou une page de carrousel, et FAUX pour un plein
    /// écran : ces solveurs rendent un rapport CONTINU, la « quatrième forme »
    /// que la règle 3 exclut.
    ///
    /// > **Une énumération de sites porte deux affirmations, et la seconde ne
    /// > se vérifie presque jamais** (leçon 261) : « ces sites appliquent la
    /// > règle » ET « ce sont les sites où la règle s'applique ». La liste
    /// > ci-dessous est la SECONDE, écrite à la main, et c'est pourquoi elle
    /// > est courte et datée : quatre surfaces montrent une scène en grand.
    ///
    /// Ce qui n'y est PAS, et par DÉCISION du porteur (2026-09-17) : la CARTE
    /// DU FIL et les pages de carrousel gardent leur cadrage d'aperçu
    /// (`SceneFraming.focus`, union, plafond 1,4) — ce sont des aperçus, pas
    /// des plein écrans, et les y faire entrer romprait des surfaces mesurées.
    func test_lesSurfacesPleinEcran_montentLaCarteDeScene() throws {
        let pleinEcran = [
            // le plein écran cadré ET immersif d'un post
            "apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift",
            "apps/ios/Meeshy/Features/Main/Views/GallerySceneStage.swift",
            // le lecteur de stories — la surface de RÉFÉRENCE
            "apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift",
            "apps/ios/Meeshy/Features/Main/Views/StoryViewerView+ReaderCard.swift",
            // le réel composé
            "apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView+Scene.swift",
        ]

        var muettes: [String] = []
        for chemin in pleinEcran {
            let code = Self.stripComments(
                try String(contentsOf: Self.repoRoot.appendingPathComponent(chemin), encoding: .utf8))
            guard code.contains("SceneShape.layout") || code.contains("SceneCard(")
                    || code.contains("readerCard(layout:") else {
                muettes.append(chemin)
                continue
            }
        }

        XCTAssertEqual(muettes, [],
                       "un plein écran de scène doit LIRE SceneShape.layout ou MONTER SceneCard — " +
                       "une consultation par solveur de rapport continu n'y suffit pas : \(muettes)")
    }

    // MARK: - Méta-tests de la garde

    /// Contrôle positif : sans lui, un détecteur cassé resterait vert pour
    /// toujours et ne protégerait rien.
    func test_laGardeReconnaitUnMontageEtUneCopieDeLaConstante() {
        XCTAssertTrue(Self.mountsThePlayer("MeeshyScenePlayer(document: d, mode: .card)"))
        XCTAssertTrue(Self.mountsThePlayer("StoryReaderRepresentable(story: s, mute: false)"))
        XCTAssertTrue(Self.declaresTheRatio("let r: CGFloat = 9.0 / 16.0"))
        XCTAssertTrue(Self.declaresTheRatio("static let portraitRatio: CGFloat = 0.5625"))
    }

    /// Contrôle négatif : la forme corrigée ne déclenche rien, et un
    /// commentaire qui CITE le littéral non plus — une garde qui compte dans
    /// un fichier commenté valide la documentation, pas le code.
    func test_laGardeIgnoreLaProjectionEtLesCommentaires() {
        XCTAssertFalse(Self.declaresTheRatio("static let portraitRatio = SceneShape.aspect"))
        XCTAssertFalse(Self.mountsThePlayer("// il montait MeeshyScenePlayer(mode: .preview) ici"))
        XCTAssertFalse(Self.declaresTheRatio("/// le gabarit 9.0 / 16.0 de la composition"))
    }

    /// `declaresTheRatio` couvre aussi l'orthographe la plus COURTE, sans
    /// espaces — celle que le lot vient lui-même de retirer de
    /// `StoryComposerView+SlideStrip.swift`. Sans cette forme, une copie
    /// réintroduite ainsi ne ferait rougir aucune des deux listes.
    func test_laGardeReconnaitLOrthographeCourteSansEspaces() {
        XCTAssertTrue(Self.declaresTheRatio("let r: CGFloat = 9/16"))
    }

    /// **Le trou que `consultsSceneShape` ferme.** Avant ce correctif, le
    /// troisième témoin comptait `$0.code.contains("SceneShape")` SANS retirer
    /// les commentaires — un hôte qui ne fait que CITER le nom dans une
    /// doc-comment passait la garde sans consulter la loi ni aucun de ses
    /// solveurs. Mesuré sur `PostDetailView+RepostEmbed.swift` : une seule
    /// mention, à la ligne d'un commentaire, zéro appel réel — et la garde le
    /// laissait passer.
    func test_leDetecteurDeConsultation_ignoreUneCitationEnCommentaireSeul() {
        XCTAssertFalse(Self.consultsSceneShape("""
            // qui le pose à `SceneShape.aspect` — TOUJOURS 9:16, lu ailleurs.
            struct HoteMuet {}
            """))
    }

    /// Contrôle positif jumeau : la consultation RÉELLE, directe ou par un
    /// solveur CONNU, est reconnue — sinon le correctif ci-dessus ferait
    /// rougir les trois hôtes qui délèguent légitimement une couche plus bas
    /// (`PostSceneMosaic`, `ConversationMediaGalleryView+ScenePage`,
    /// `PostDetailView+RepostEmbed`).
    func test_leDetecteurDeConsultation_reconnaitLaLoiEtSesSolveursConnus() {
        XCTAssertTrue(Self.consultsSceneShape("let ratio = SceneShape.aspect"))
        XCTAssertTrue(Self.consultsSceneShape("SceneCarouselLayout.cardAspect(document: d)"))
        XCTAssertTrue(Self.consultsSceneShape("let stage: MediaStageFraming.Result"))
        XCTAssertTrue(Self.consultsSceneShape("storyCanvasContainer(reader, renderedItem: i)"))
        XCTAssertTrue(Self.consultsSceneShape("storyCanvasOrPlaceholder(renderedItem: i) { r }"))
    }

    // MARK: - Détecteurs

    /// **Le player lui-même n'est pas un hôte.** Ses deux répertoires
    /// d'implémentation se montent entre eux — `StoryReaderRepresentable`
    /// construit `StoryCanvasUIView`, le préchargeur le construit hors écran —
    /// et leur demander de consulter la loi reviendrait à demander au moteur de
    /// décider la forme : exactement ce que cette loi retire.
    static func isThePlayerItself(_ relativePath: String) -> Bool {
        relativePath.hasPrefix("MeeshyUI/Story/Canvas/")
            || relativePath.hasPrefix("MeeshyUI/Story/ScenePlayer/")
    }

    /// Un montage, et non une mention : le nom SUIVI d'une parenthèse
    /// ouvrante, commentaires retirés.
    static func mountsThePlayer(_ rawCode: String) -> Bool {
        let code = stripComments(rawCode)
        return ["MeeshyScenePlayer(", "StoryReaderRepresentable(", "StoryCanvasUIView("]
            .contains { code.contains($0) }
    }

    /// **Un hôte consulte-t-il la loi — en CODE, jamais en commentaire ?**
    ///
    /// Directement (`SceneShape.`), en MONTANT la carte (`SceneCard(`, dont le
    /// premier paramètre EST un `SceneShape.Layout` — un hôte ne peut pas la
    /// monter sans avoir demandé sa forme à la loi), ou par une délégation
    /// VÉRIFIÉE vers un solveur qui la porte une couche plus bas : `SceneCarouselLayout`
    /// (`SceneFraming.swift`, projette `SceneFraming.sceneAspect ==
    /// SceneShape.aspect`), `MediaStageFraming` (le type que
    /// `MediaGalleryStage.mediaRatio` interroge, lui-même nourri par
    /// `GallerySceneItem.surface(inFullFrame:)` → `SceneShape.aspect`), et les
    /// deux portes partagées du détail (`storyCanvasContainer`,
    /// `storyCanvasOrPlaceholder`, qui posent `let ratio = SceneShape.aspect`).
    /// Une mention hors de ces cinq formes — fût-elle dans une doc-comment
    /// « substantielle » — ne prouve aucun appel : elle a laissé passer
    /// `PostDetailView+RepostEmbed.swift`, dont l'unique occurrence de
    /// « SceneShape » vivait dans un commentaire, sans qu'aucun des cinq
    /// marqueurs n'apparaisse en code.
    static func consultsSceneShape(_ rawCode: String) -> Bool {
        let code = stripComments(rawCode)
        return ["SceneShape.", "SceneCard(", "SceneCarouselLayout.", "MediaStageFraming.",
                "storyCanvasContainer(", "storyCanvasOrPlaceholder("]
            .contains { code.contains($0) }
    }

    /// Le rapport ÉCRIT, sous ses trois orthographes. `designWidth /
    /// designHeight` n'en est pas une : c'est une définition d'espace de
    /// design, pas du gabarit de scène — elle devient une projection sans
    /// cesser d'être une division.
    static func declaresTheRatio(_ rawCode: String) -> Bool {
        let code = stripComments(rawCode)
        for forme in ["9.0 / 16.0", "9.0/16.0", "9 / 16", "9/16", "0.5625"] where code.contains(forme) {
            return true
        }
        return false
    }

    // MARK: - Helpers

    static let repoRoot: URL = {
        var url = URL(fileURLWithPath: #filePath)
        // Tests/MeeshySDKTests/Story/<fichier> → packages/MeeshySDK → packages → racine
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }()

    static func swiftSources(under relative: String) throws -> [(path: String, code: String)] {
        let root = repoRoot.appendingPathComponent(relative)
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        else { return [] }
        var out: [(path: String, code: String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let chemin = url.path.replacingOccurrences(of: root.path + "/", with: "")
            out.append((chemin, try String(contentsOf: url, encoding: .utf8)))
        }
        return out.sorted { $0.path < $1.path }
    }

    /// Retire les commentaires — ligne et bloc. Miroir local de
    /// `ComposerSourceGuard.stripComments`, que `MeeshySDKTests` ne voit pas
    /// (il vit dans la cible `MeeshyUITests`).
    static func stripComments(_ source: String) -> String {
        var sortie = ""
        var index = source.startIndex
        var dansLigne = false
        var dansBloc = false
        while index < source.endIndex {
            let reste = source[index...]
            if dansLigne {
                if source[index] == "\n" { dansLigne = false; sortie.append("\n") }
                index = source.index(after: index)
                continue
            }
            if dansBloc {
                if reste.hasPrefix("*/") {
                    dansBloc = false
                    index = source.index(index, offsetBy: 2)
                } else {
                    index = source.index(after: index)
                }
                continue
            }
            if reste.hasPrefix("//") { dansLigne = true; index = source.index(index, offsetBy: 2); continue }
            if reste.hasPrefix("/*") { dansBloc = true; index = source.index(index, offsetBy: 2); continue }
            sortie.append(source[index])
            index = source.index(after: index)
        }
        return sortie
    }
}
