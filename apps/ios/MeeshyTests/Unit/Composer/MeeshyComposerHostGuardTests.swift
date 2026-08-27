import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// C2 — gardes de SOURCE sur `MeeshyComposerHost`, le meuble du composer unifié.
///
/// Pourquoi des gardes de source et pas des tests de rendu : ce que ces règles
/// protègent n'est pas une valeur calculée mais une STRUCTURE de vue — « le
/// socle ne bouge jamais », « l'œil du socle EST le lecteur », « le host
/// enveloppe l'atelier au lieu de le réécrire ». Aucune de ces trois n'a de
/// sortie observable qu'un test unitaire pourrait lire ; toutes se cassent en
/// silence à la première refonte de la vue.
///
/// Ces gardes sont NÉGATIVES pour deux d'entre elles, et une garde négative meurt
/// en silence : elle passe au vert le jour où le symbole qu'elle cherche est
/// simplement renommé. La question à se poser à chaque relecture n'est pas
/// « passe-t-elle ? » mais « **rougirait-elle si on réintroduisait l'interdit ?** ».
/// D'où `test_theGuardsReadANonEmptySource`, qui échoue si le fichier lu est vide
/// ou introuvable — sans lui, une faute de chemin rendrait TOUTE cette suite
/// verte par omission.
final class MeeshyComposerHostGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func hostCode() throws -> String {
        AppSourceGuard.stripComments(try hostSource())
    }

    /// La source COMPACTÉE — tout blanc retiré.
    ///
    /// Les gardes de ce fichier cherchent des littéraux MULTI-TOKENS
    /// (`initialVisibility: initialVisibility`, `adoptDraft(id:`,
    /// `compositionQualifiesAsReel: false`, …). La revue du 2026-08-23 en a
    /// relevé quatre qu'un simple retour à la ligne contournait : reformater
    /// l'appel sur deux lignes les faisait passer au VERT en perdant leur
    /// protection — le mode d'extinction silencieuse propre aux gardes
    /// négatives. Comparer sur une source compactée supprime la classe entière
    /// de contournements d'un coup, sans avoir à deviner quel reformatage
    /// arrivera.
    private func hostCompact() throws -> String {
        compact(try hostCode())
    }

    private func compact(_ text: String) -> String {
        text.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// Le garde-fou des gardes. Sans lui, un chemin devenu faux ferait passer
    /// toutes les assertions négatives ci-dessous sur une chaîne vide.
    func test_theGuardsReadANonEmptySource() throws {
        let code = try hostCode()
        XCTAssertGreaterThan(code.count, 400, "La source du host est introuvable ou vide — les gardes ci-dessous ne mesureraient RIEN")
        XCTAssertTrue(code.contains("struct MeeshyComposerHost"), "Le fichier lu n'est pas celui du host")
    }

    private func rootViewComponentsCompact() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/RootViewComponents.swift")
        return compact(AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8)))
    }

    /// **T3.1 — garde de source, sur le COMPTE, jamais sur l'absence.**
    ///
    /// Depuis T3.1 le PLEIN composer du fil passe par `DocumentComposerDoor` ;
    /// `RootViewComponents` ne monte donc plus `FeedComposerSheet(` qu'UNE fois
    /// — la CITATION (`.fullScreenCover(item: $quoteOriginalPost)`), que T3.2
    /// retient tant que 7.5 (un écrivain durable du repost) n'a pas d'appelant.
    /// Assérer `0` serait un rouge injustifié ET la tentation de recâbler la
    /// citation sur une porte qui la REFUSE ; assérer `>= 1` cesserait de
    /// compter — un second montage du plein composer repasserait sans un mot.
    func test_rootViewComponents_neMonteFeedComposerSheet_quePourLaCitation() throws {
        let code = try rootViewComponentsCompact()
        XCTAssertTrue(code.contains("structThemedFeedOverlay"), "Le fichier lu n'est pas RootViewComponents")
        let montages = code.components(separatedBy: "FeedComposerSheet(").count - 1
        XCTAssertEqual(
            montages, 1,
            "RootViewComponents doit monter `FeedComposerSheet(` EXACTEMENT une fois — la citation "
                + "(`.fullScreenCover(item: $quoteOriginalPost)`). Le plein composer du fil est passé au "
                + "meuble à T3.1 ; zéro dirait que la citation a été recâblée sur une porte qui la refuse "
                + "(levée 7.5), deux ou plus qu'un second montage du plein composer est revenu."
        )
    }

    // MARK: - V3-2 : le meuble a un APPELANT

    /// **LA garde qui empêche ce chantier de retomber inerte.**
    ///
    /// Trois lots ont écrit le meuble, sa table de portes, ses deux surfaces et
    /// son gate du réel — et pendant tout ce temps `MeeshyComposerHost(` n'avait
    /// AUCUN site d'appel de production : zéro utilisateur n'en voyait une
    /// ligne. Rien ne le disait, parce que toutes les autres gardes de cette
    /// suite lisent la source du host lui-même, et un type que personne ne
    /// monte reste parfaitement conforme à toutes.
    ///
    /// L'invariant qu'elle nomme : **le meuble est monté quelque part dans
    /// l'app.** Elle balaie l'arbre `Meeshy/` entier plutôt qu'une liste de
    /// chemins — une liste aurait dû être tenue à jour par celui-là même qui
    /// débranche la dernière porte.
    func test_theHost_hasAtLeastOneProductionCaller() throws {
        let callers = try productionCallersOfTheHost()

        XCTAssertFalse(
            callers.isEmpty,
            "`MeeshyComposerHost` n'a plus AUCUN appelant de production : le meuble est redevenu du code "
                + "que personne ne voit. Toutes les autres gardes de cette suite resteraient vertes."
        )
    }

    /// Les fichiers de l'app — hors celui du host — qui montent le meuble.
    /// La source est décommentée : le host est NOMMÉ dans les doc-comments de
    /// plusieurs vues, et un `.contains` qui matche un commentaire ne prouve
    /// rien.
    private func productionCallersOfTheHost() throws -> [String] {
        try sourcesDeLApp(excluant: ["MeeshyComposerHost.swift"])
            .filter { AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8)).contains("MeeshyComposerHost(") }
            .map { $0.lastPathComponent }
    }

    /// L'arbre source de l'app — le balayage que toutes les gardes cherchant un
    /// site de PRODUCTION partagent.
    ///
    /// Il se garde lui-même : un chemin devenu faux rendrait une liste vide, et
    /// toute garde bâtie dessus passerait au vert en ayant perdu son objet.
    /// Une liste de chemins nommés aurait eu le même défaut en pire — elle
    /// aurait dû être tenue à jour par celui-là même qui débranche une porte.
    private func sourcesDeLApp(excluant fichiersExclus: Set<String> = []) -> [URL] {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")

        guard let walker = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil) else {
            XCTFail("L'arbre source de l'app est introuvable — la garde ne mesurerait RIEN")
            return []
        }
        let sources = walker
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .filter { !fichiersExclus.contains($0.lastPathComponent) }

        XCTAssertGreaterThan(sources.count, 50, "Trop peu de sources balayées — le chemin de l'arbre app est faux")

        return sources
    }

    // MARK: - Le host ENVELOPPE l'atelier, il ne le réécrit pas

    /// L'atelier de composition vit dans le SDK (`StoryComposerView`, des
    /// milliers de lignes éprouvées). Le host est un MEUBLE autour de lui.
    /// Réécrire l'atelier côté app serait la faute la plus coûteuse de ce lot :
    /// deux surfaces divergeraient sans qu'aucun test ne le dise.
    func test_host_wrapsTheSDKWorkshop_ratherThanRewritingIt() throws {
        XCTAssertTrue(
            try hostCode().contains("StoryComposerView("),
            "Le host doit MONTER `StoryComposerView` du SDK — anti-réécriture"
        )
    }

    /// Loi 6 de la doctrine — « le lecteur EST l'aperçu ». Composer et viewers
    /// partagent un seul registre de rendu ; un quatrième chemin d'aperçu
    /// casserait le WYSIWYG par construction.
    ///
    /// **Elle a changé d'OBJET deux fois, jamais de sens.** Elle exigeait
    /// `MeeshyScenePlayer(` dans le meuble ; le lot 4.9 a retiré l'œil et elle
    /// est devenue une ÉQUIVALENCE. Le 2026-08-27 l'œil REVIENT — la condition
    /// que `socleZones` avait posée comme prix de son retour (« le jour où le
    /// document a des médias à montrer ») étant tenue depuis #4038 — et il
    /// revient sur un AUTRE lecteur : plus `MeeshyScenePlayer` (qui ne rend
    /// qu'une scène), mais le rappel `onPreview`, que la porte branche sur
    /// `StoryViewerView` — le lecteur qui rendra vraiment la publication.
    ///
    /// L'équivalence tient donc, mot pour mot :
    ///
    /// - un œil peint SANS remise au lecteur ⇒ quelqu'un a écrit un aperçu
    ///   maison, ce qu'interdit la loi 6 ;
    /// - un bouton d'aperçu SANS aucun œil peint ⇒ du code d'aperçu survit à
    ///   l'affordance qui l'ouvrait, et la prochaine session le rebranchera en
    ///   croyant réparer.
    ///
    /// **Épinglé sur `previewButton`, jamais sur `onPreview(`.** Le meuble
    /// TRANSMET déjà `onPreview` à l'atelier (`onPreview: onPreview`) : y
    /// épingler la garde la rendrait vraie quoi qu'il arrive, donc vacante.
    /// C'est le bouton du SOCLE qui est le sujet.
    func test_lOeilEtSonLecteur_vivent_etMeurent_ensemble() throws {
        let code = try hostCode()
        let unOeilEstPeint = [ComposerSurfaceKind.scene, .document, .mood]
            .contains {
                ComposerChromeOwnership.socleZones(for: $0, documentHasScene: true)
                    .contains(.preview)
            }

        XCTAssertEqual(
            unOeilEstPeint, code.contains("private var previewButton"),
            unOeilEstPeint
                ? "Le socle peint un œil que le meuble n'assemble pas : la règle promet une commande "
                    + "qui n'existe pas."
                : "Le meuble porte encore `previewButton` alors qu'aucune surface ne peint d'œil : du code "
                    + "d'aperçu survit à l'affordance qui l'ouvrait, et la prochaine session le rebranchera en "
                    + "croyant réparer."
        )

        guard unOeilEstPeint else { return }
        let compacted = code.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(
            compacted.contains("privatevarpreviewButton:someView{Button{onPreview("),
            "L'œil doit REMETTRE les slides au rappel `onPreview` sans rien rendre lui-même. Tout autre "
                + "corps est un quatrième chemin d'aperçu, et il mentira sur ce qui est publié (loi 6)."
        )
    }

    /// **Un œil qui ouvre un no-op n'est pas un aperçu — c'est le défaut du lot
    /// 3A rejoué.** Ce lot-là avait livré un contrôle dont le type était juste
    /// et que RIEN ne pouvait atteindre ; dix-neuf tests le vérifiaient sans
    /// jamais le montrer. La garde qui l'aurait attrapé ne demande ni le type ni
    /// le câblage, mais l'EFFET : au bout de `onPreview`, y a-t-il un lecteur ?
    ///
    /// `DocumentComposerDoor` posait `onPreview: { _, _, _, _, _ in }` — un
    /// no-op parfaitement légitime tant qu'aucun œil n'était peint, et un
    /// mensonge à la seconde où l'un l'est.
    func test_laPorteDuDocument_rendVraimentLApercu_pasUnNoOp() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
        let raw = try String(contentsOf: url, encoding: .utf8)
        let code = AppSourceGuard.stripComments(raw)
        let compacted = code.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertTrue(code.contains("struct DocumentComposerDoor"),
                      "La source de la porte est introuvable — la garde ci-dessous ne mesurerait RIEN.")

        let oeilPeint = ComposerChromeOwnership
            .socleZones(for: .document, documentHasScene: true)
            .contains(.preview)
        guard oeilPeint else { return }

        XCTAssertFalse(
            compacted.contains("onPreview:{_,_,_,_,_in}"),
            "La porte du document avale l'aperçu dans un no-op alors que le socle peint un œil : "
                + "le contrôle EXISTE et ne fait RIEN (loi 4)."
        )
        XCTAssertTrue(
            compacted.contains("previewAssets=StoryPreviewAssets("),
            "L'aperçu doit être RETENU par la porte — sans état, le cover n'a rien à présenter."
        )
        XCTAssertTrue(
            compacted.contains("StoryViewerView(") && compacted.contains("isPreviewMode:true"),
            "L'aperçu doit être rendu par le LECTEUR en mode aperçu, jamais par un composant maison "
                + "(loi 6 — un troisième chemin de rendu mentirait tôt ou tard)."
        )
    }

    // MARK: - Le socle ne bouge JAMAIS

    /// Loi 5 de la doctrine (P1). Le socle est le point fixe du composer : ses
    /// trois zones gardent le même ORDRE partout où elles sont peintes. Un socle
    /// qui se réorganise redevient une barre d'outils contextuelle — exactement
    /// ce que ce chantier retire.
    ///
    /// **Ce que cette garde disait, et qui a cessé d'être vrai au lot 4.5** :
    /// « ses trois zones sont toujours là … quelle que soit l'origine ». Le socle
    /// est conditionnel depuis V3-2 — il s'efface devant l'atelier — et depuis le
    /// lot 4.5 ses ZONES suivent la surface montée : l'audience n'est pas peinte
    /// là où la surface porte son propre sélecteur (le mood), l'œil n'est pas
    /// peint là où il n'y a pas de canvas à lire. Laisser la phrase d'origine
    /// au-dessus du code l'aurait rendue loi pour la session suivante.
    ///
    /// Ce qui n'a PAS changé, et que cette garde retient : l'ORDRE, et le fait
    /// qu'aucune de ces variations ne dépende de la PORTE. Le second point est
    /// tenu par `test_socle_isNeverHiddenNorConditionallyRemoved`, le premier ici.
    /// **Elle nommait les trois zones en dur. Le lot 4.9 en a retiré une**, et
    /// une garde d'ORDRE qui énumère ses membres meurt à chaque retrait — en
    /// rougissant pour la mauvaise raison, jamais pour la sienne.
    ///
    /// Elle lit donc l'ordre CANONIQUE dans la règle, et vérifie que le corps du
    /// socle présente en sous-suite croissante les zones que la règle peint.
    /// Elle rougirait toujours à l'interdit qu'elle garde — l'audience posée
    /// après la flèche — et elle rougira EN PLUS le jour où l'œil reviendra
    /// ailleurs qu'entre les deux.
    func test_socle_peintSesZones_dansLOrdreCanonique() throws {
        let code = try hostCompact()
        let peintes = Self.ordreCanoniqueDuSocle.filter { rang in
            [ComposerSurfaceKind.document, .mood].contains {
                ComposerChromeOwnership.socleZones(for: $0).contains(rang.0)
            }
        }
        XCTAssertGreaterThanOrEqual(
            peintes.count, 2,
            "Moins de deux zones peintes sur l'ensemble des surfaces : la garde d'ordre ne mesurerait presque RIEN."
        )

        var precedent: String.Index?
        for (zone, declaration) in peintes {
            guard let position = code.range(of: declaration)?.lowerBound else {
                return XCTFail(
                    "La règle peint \(zone), mais le socle ne nomme aucun `\(declaration)` — la garde ne "
                        + "mesurerait RIEN sur cette zone."
                )
            }
            if let precedent {
                XCTAssertTrue(
                    precedent < position,
                    "`\(declaration)` est écrit hors de son rang. Le socle est le point fixe du composer "
                        + "(loi 5) : un socle qui se réorganise redevient une barre d'outils contextuelle."
                )
            }
            precedent = position
        }
    }

    /// L'ordre de lecture du socle, écrit UNE fois : audience, œil, flèche.
    /// C'est celui de la rangée haute de l'atelier (`ComposerTopBarControl`),
    /// et le socle en est le remplaçant sous les surfaces sans atelier.
    private static let ordreCanoniqueDuSocle: [(ComposerTopBarControl, String)] = [
        (.audience, "audienceChip"),
        (.preview, "previewEye"),
        (.publish, "publishButton")
    ]

    /// Garde NÉGATIVE — la plus fragile, et la plus importante.
    ///
    /// **Elle interdisait toute condition dans le socle. Le lot 4.5 en introduit
    /// deux, et la garde change donc d'objet plutôt que de disparaître** : ce que
    /// la loi 5 interdit n'est pas qu'une zone manque, c'est qu'elle manque SELON
    /// LA PORTE. Les zones peintes suivent la SURFACE montée, par une règle pure
    /// (`ComposerChromeOwnership.socleZones`) — jamais par un `if` sur le profil,
    /// l'origine ou l'intention, et jamais par un `.hidden()` qui laisserait
    /// l'espace occupé par une commande que personne ne peut atteindre.
    ///
    /// Elle rougirait donc toujours à la réintroduction de l'interdit : un
    /// `if profile`, un `if origin`, un `.hidden()`. Et elle rougirait EN PLUS si
    /// les zones cessaient d'être gouvernées par la règle — le cas où une
    /// condition ad hoc redeviendrait invisible aux tests.
    func test_socle_isNeverHiddenNorConditionallyRemoved() throws {
        guard let socleBody = declarationBody(startingAt: "private var socle", in: try hostCode()) else {
            return XCTFail("Le socle doit être une propriété nommée `socle` — la garde s'ancre dessus")
        }
        let compacte = compact(socleBody)

        XCTAssertTrue(compacte.contains("audienceChip"), "Le bloc lu n'est pas celui du socle — la garde ne mesurerait RIEN")
        XCTAssertFalse(compacte.contains(compact(".hidden()")), "Le socle ne se cache jamais (loi 5 — le socle ne bouge pas)")
        XCTAssertFalse(compacte.contains(compact("if profile")), "Le socle ne se retire pas selon le profil")
        XCTAssertFalse(compacte.contains(compact("if origin")), "Le socle ne se retire pas selon l'origine (loi 5)")
        XCTAssertFalse(compacte.contains(compact("if intent")), "Le socle ne se retire pas selon l'intention (loi 5)")
        XCTAssertTrue(
            compacte.contains(compact("paintedSocleZones.contains(")),
            "Les zones peintes doivent venir de la RÈGLE (`ComposerChromeOwnership.socleZones`). Une condition "
                + "écrite à la main ici serait invisible aux tests — c'est ainsi qu'une règle produit se met à "
                + "exister en deux exemplaires."
        )
    }

    /// Complément de la garde ci-dessus, et sans lui elle serait devenue VERTE
    /// EN AYANT PERDU SON OBJET : le socle est désormais monté sous condition
    /// dans `body`, donc lire le seul bloc `socle` ne prouve plus rien.
    ///
    /// La loi 5 interdit qu'il varie selon la PORTE. Elle n'interdit pas qu'il
    /// s'efface devant l'atelier quand c'est l'atelier qui peint les mêmes
    /// trois zones : peindre les deux donnerait à l'auteur deux audiences, deux
    /// yeux et deux flèches, dont une inerte, sur la surface de création la
    /// plus utilisée. La condition doit donc porter sur la PROPRIÉTÉ DU CHROME,
    /// et sur rien d'autre.
    func test_theSocleYieldsToTheAtelier_andNeverToTheDoor() throws {
        let code = try hostCode()
        guard let bodyBlock = declarationBody(startingAt: "var body: some View", in: code) else {
            return XCTFail("Le `body` du host est introuvable — la garde doit être re-pointée")
        }
        let compacte = compact(bodyBlock)

        XCTAssertTrue(compacte.contains("socle"), "Le bloc lu n'est pas celui du body — la garde ne mesurerait RIEN")
        XCTAssertTrue(
            compacte.contains(compact("if !chromeOwner.assembles(.publish)")),
            "Le socle doit céder à l'atelier par la PROPRIÉTÉ DU CHROME — sans quoi deux barres de publication coexistent"
        )
        XCTAssertFalse(compacte.contains(compact("if profile")), "Le socle ne se retire jamais selon la porte (loi 5)")
        XCTAssertFalse(compacte.contains(compact("if origin")), "Le socle ne se retire jamais selon l'origine (loi 5)")

        XCTAssertTrue(
            compact(code).contains(compact("chromeOwner: chromeOwner")),
            "L'atelier doit recevoir LA MÊME valeur que celle qui gouverne le socle : deux avis sur qui publie remettraient les deux barres"
        )
    }

    // MARK: - Lot 4.5 — QUI peint le chrome, et sous quelle surface

    /// La règle qui a remplacé la constante `.atelier`.
    ///
    /// Les deux blocages qui imposaient cette constante sont des blocages de la
    /// SCÈNE — `visibilityMenu` est l'unique écrivain de `visibility` DE
    /// L'ATELIER (un `@State` privé, que le sélecteur du socle ne peut pas
    /// atteindre), et un œil peint ici rendrait un aperçu amputé des médias
    /// préchargés DE L'ATELIER. Sous le document et sous le mood, il n'y a pas
    /// d'atelier : aucune des deux raisons n'a d'objet. Une constante qui les
    /// faisait valoir pour les trois surfaces était une constante mal placée.
    func test_leChrome_cedeALAtelier_sousLaScene_etRevientAuMeuble_ailleurs() {
        XCTAssertEqual(
            ComposerChromeOwnership.owner(for: .scene), .atelier,
            "L'atelier du SDK peint sa propre rangée haute : lui reprendre le chrome retirerait à l'auteur "
                + "le seul écrivain d'audience qu'il ait sous la scène."
        )
        XCTAssertEqual(
            ComposerChromeOwnership.owner(for: .document), .host,
            "Sous le document, aucun atelier n'est monté : personne d'autre que le socle ne peut publier."
        )
        XCTAssertEqual(
            ComposerChromeOwnership.owner(for: .mood), .host,
            "Sous le mood non plus — et sans cette ligne, la surface du lot 4.4 serait un écran sans issue."
        )
    }

    /// **L'invariant qui empêche les deux règles de diverger.** Le socle ne peint
    /// des zones QUE là où l'atelier n'assemble pas la publication, et il en peint
    /// au moins une partout où l'atelier ne l'assemble pas. Deux règles qui
    /// répondent à la même question doivent répondre la même chose : sans cette
    /// garde, l'une pourrait céder le chrome au meuble pendant que l'autre ne lui
    /// donnerait rien à peindre — un socle vide, c'est-à-dire un écran sans issue.
    func test_lesZonesDuSocle_sontVides_exactementLaOuLAtelierPublie() {
        for surface in [ComposerSurfaceKind.scene, .document, .mood] {
            let zones = ComposerChromeOwnership.socleZones(for: surface)
            let atelierPublie = ComposerChromeOwnership.owner(for: surface).assembles(.publish)
            XCTAssertEqual(
                zones.isEmpty, atelierPublie,
                "\(surface) : le socle peint des zones si et seulement si l'atelier ne les assemble pas. "
                    + "Les deux règles ont divergé."
            )
        }
    }

    /// La flèche est la seule zone que le socle peint TOUJOURS quand il est
    /// peint. Sans elle, une surface sans atelier n'aurait aucun moyen de partir.
    func test_leSocle_porteToujoursSaFleche_quandIlEstPeint() {
        for surface in [ComposerSurfaceKind.document, .mood] {
            XCTAssertTrue(
                ComposerChromeOwnership.socleZones(for: surface).contains(.publish),
                "\(surface) : un socle peint sans flèche est un écran sans issue."
            )
        }
    }

    /// **Le mood ne voit PAS deux fois son audience.**
    ///
    /// `ComposerMoodSurface` porte son propre sélecteur six niveaux, dans le
    /// RUBAN de son bloc 3, avec la mémoire du format status (loi 10).
    ///
    /// **La raison a changé au lot 4.9, et la nuance compte** : `audienceChip`
    /// n'est plus un témoin inerte, c'est un vrai sélecteur. Ce qui l'exclut ici
    /// n'est donc plus son inertie mais la PLACE — deux contrôles pour un même
    /// réglage sur un même écran. Les deux formes existent à dessein : un ruban
    /// de six chips tient dans un bloc, jamais dans une rangée qui porte aussi
    /// la flèche.
    ///
    /// **Divergence assumée avec le plan du lot 4**, qui écrivait « sous `.mood`
    /// … audience + flèche ». La mesure a tranché contre lui.
    func test_leSocle_neDoublePasLAudience_sousLeMood() {
        XCTAssertFalse(
            ComposerChromeOwnership.socleZones(for: .mood).contains(.audience),
            "La surface du mood porte son propre sélecteur : un témoin inerte au-dessus ferait deux "
                + "affichages pour un seul réglage."
        )
    }

    /// **Loi 6 — le lecteur EST l'aperçu, et un mood n'a rien à lire.**
    ///
    /// Un mood n'a pas de canvas : dix emojis et 122 caractères. Monter l'œil ici
    /// aurait ouvert `MeeshyScenePlayer` sur une composition vide, c'est-à-dire un
    /// aperçu qui ment sur ce qui sera publié.
    func test_leSocle_nOffreAucunOeil_sousLeMood_fauteDeCanvas() {
        XCTAssertFalse(
            ComposerChromeOwnership.socleZones(for: .mood).contains(.preview),
            "Un mood n'a pas de canvas : l'œil y rendrait une scène vide, ce qu'interdit la loi 6."
        )
    }

    /// **Le document en garde DEUX depuis le lot 4.9, et la dette est refermée
    /// par RETRAIT.**
    ///
    /// Son œil rendait une scène VIDE — `viewModel.currentEffects` n'est rempli
    /// par personne sous cette surface, même cause que `servedDocumentTools ==
    /// []`. Une dette consignée reste de l'UI morte tant qu'elle est peinte, et
    /// la loi 4 ne fait pas d'exception pour ce qui est écrit dans un
    /// doc-comment : une affordance sans objet est ABSENTE.
    ///
    /// Les deux qui restent, elles, TIENNENT : l'audience est un vrai sélecteur
    /// avec sa mémoire, la flèche un vrai bouton avec son gate de matière.
    func test_leSocle_nePeintQueCeQuIlTient_sousLeDocument() {
        XCTAssertEqual(
            ComposerChromeOwnership.socleZones(for: .document),
            [.audience, .publish],
            "Sous le document, personne d'autre ne peint ces deux zones — et l'œil n'avait rien à lire."
        )
    }

    // MARK: - Lot 4.9 — l'audience du socle CHOISIT

    /// **Un témoin qui nomme un réglage sans l'écrire est de l'UI morte.**
    ///
    /// `audienceChip` fut un `Label` : un pictogramme et un mot. Sous le
    /// document, personne n'écrivait l'audience, et le brouillon partait sur la
    /// visibilité que la PORTE avait semée. La loi 4 ne tolère pas cette forme —
    /// une affordance qui ne fait rien est ABSENTE, pas décorative.
    ///
    /// Quatre moitiés seraient chacune pire que l'ancien témoin, et la garde les
    /// nomme une par une : un menu sans écrivain n'aurait pas d'effet ; un
    /// écrivain sans mémoire oublierait le choix à la fermeture (loi 10) ; une
    /// liste de niveaux recopiée divergerait de celle du SDK ; un `ONLY` sans
    /// sélecteur nominatif partirait vide, et le gateway le rejetterait.
    func test_lAudienceDuSocle_estUnVraiSelecteur_etEcritSaMemoire() throws {
        guard let bloc = declarationBody(startingAt: "private var audienceChip", in: try hostCode()) else {
            return XCTFail("L'audience du socle doit être une propriété nommée `audienceChip` — la garde s'ancre dessus")
        }
        let corps = compact(bloc)

        XCTAssertTrue(
            corps.contains("Menu{"),
            "L'audience du socle est un MENU qui se replie en capsule — la forme de la rangée haute de "
                + "l'atelier. Le ruban de six chips du mood mangerait la largeur du socle et repousserait la "
                + "flèche hors de l'écran."
        )
        XCTAssertTrue(
            corps.contains("offeredAudiences"),
            "Les niveaux viennent de l'OFFRE (`ComposerAudienceOffer`), jamais de `composerSelectableCases` "
                + "en bloc : sous une republication, deux des six niveaux sont des contrôles sans effet — le "
                + "serveur y remplace la liste nominative par celle de la source."
        )
        XCTAssertFalse(
            corps.contains("PostVisibility.composerSelectableCases"),
            "Le socle offre les six niveaux du SDK sans passer par l'offre : il repeint les audiences que "
                + "la republication retire, et la loi 4 les veut ABSENTES, pas grisées."
        )
        XCTAssertTrue(
            corps.contains("AudienceUserPickerView("),
            "ONLY/EXCEPT ouvrent le sélecteur nominatif — sans lui, le gateway rejette la publication."
        )

        guard let choix = declarationBody(startingAt: "private func chooseAudience", in: try hostCode()) else {
            return XCTFail("Le geste de choix doit être une fonction nommée `chooseAudience` — la garde s'ancre dessus")
        }
        let geste = compact(choix)
        XCTAssertTrue(
            geste.contains("composerVisibility="),
            "Choisir doit ÉCRIRE l'audience du meuble : un menu sans écrivain est un témoin de plus."
        )
        XCTAssertTrue(
            geste.contains("lastDocumentVisibility="),
            "Choisir doit écrire la MÉMOIRE dans le même geste (loi 10). Séparer les deux écritures, c'est "
                + "l'occasion d'oublier la seconde — et l'audience repartirait à zéro à chaque ouverture."
        )
        XCTAssertTrue(
            geste.contains("requiresUserSelection"),
            "C'est le MODE qui décide d'ouvrir le sélecteur nominatif, jamais deux cas écrits à la main. "
                + "Sans lui, un ONLY partirait sans personne et le gateway le rejetterait."
        )

        let meuble = compact(try hostCode())
        XCTAssertTrue(
            meuble.contains("@AppStorage(ComposerAudienceMemory.postKey)"),
            "La mémoire du socle est celle du format POST, nommée par sa constante partagée."
        )
        XCTAssertFalse(
            meuble.contains("\"lastPostVisibility\"") || meuble.contains("\"lastStatusVisibility\""),
            "Une clé de mémoire est écrite en littéral dans le meuble : `ComposerAudienceMemory` en est "
                + "l'unique orthographe, et deux orthographes d'une clé sont deux mémoires."
        )
    }

    /// **Le socle et le RUBAN offrent la même chose, par la même règle.**
    ///
    /// Les deux formes existent à dessein — un menu qui se replie dans une
    /// rangée, un ruban de chips dans un bloc — et elles ne sont jamais peintes
    /// ensemble. Mais deux OFFRES pour un même réglage, c'est un plafond posé
    /// d'un côté et pas de l'autre : exactement le défaut que ce lot referme,
    /// où `ComposerIntent` raisonnait sur le plafond d'une republication pendant
    /// que le sélecteur déjà peint, dix lignes plus loin, n'en avait aucun.
    ///
    /// Le meuble calcule donc l'offre UNE fois et la remet à la surface. Une
    /// surface qui la recalculerait serait une seconde écriture de la règle.
    func test_leSocle_etLeRuban_offrentLaMemeChose_parLaMemeRegle() throws {
        let meuble = compact(try hostCode())
        XCTAssertTrue(
            meuble.contains(compact("ComposerAudienceOffer.offered(for: intent.origin)")),
            "Le meuble doit lire l'offre depuis la PORTE : c'est elle qui sait si l'on republie."
        )
        XCTAssertEqual(
            occurrences(of: compact("ComposerAudienceOffer.offered("), in: meuble), 1,
            "L'offre est calculée à DEUX endroits dans le meuble : deux lectures d'une règle sont deux "
                + "occasions de la corriger à moitié."
        )

        guard let mood = declarationBody(startingAt: "private var moodSurface", in: try hostCode()) else {
            return XCTFail("`moodSurface` est introuvable — la garde ne mesurerait RIEN")
        }
        XCTAssertTrue(
            compact(mood).contains(compact("allowedAudiences: offeredAudiences")),
            "Le ruban du mood reçoit l'offre du meuble. Sans elle, il repeint les six niveaux du SDK — le "
                + "seul chemin du meuble vivant en production, et celui d'où partent les republications."
        )

        let surface = AppSourceGuard.stripComments(try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerMoodSurface.swift"),
            encoding: .utf8
        ))
        // L'ancre porte son TYPE, et ce n'est pas du zèle : `audiencePickerMode`
        // est déclaré plus haut dans le même fichier et contient le nom du
        // ruban en préfixe. Ancrée sur le nom nu, la garde partait de ce `@State`
        // — dont la déclaration n'ouvre aucune accolade — et l'appariement
        // filait jusqu'au corps de `body`, où `ForEach(allowedAudiences` ne
        // figure pas. Elle aurait rougi pour la mauvaise raison, celle qu'on
        // « corrige » en retirant l'assertion.
        guard let ruban = declarationBody(startingAt: "private var audiencePicker: some View", in: surface) else {
            return XCTFail("`audiencePicker` est introuvable dans la surface — la garde ne mesurerait RIEN")
        }
        XCTAssertTrue(
            compact(ruban).contains("ForEach(allowedAudiences"),
            "Le ruban peint l'offre qu'il REÇOIT — sinon le plafond d'une republication vaudrait pour le "
                + "socle et pas pour lui, sur le seul écran où l'on republie."
        )
        XCTAssertFalse(
            compact(ruban).contains("composerSelectableCases"),
            "Le ruban décide encore de son offre : deux offres pour un même réglage, c'est un plafond posé "
                + "d'un côté seulement."
        )
    }

    /// **Ce que la flèche remet doit porter l'audience que l'auteur a CHOISIE.**
    ///
    /// Le défaut que cette garde retient est silencieux par construction : le
    /// brouillon lisait `initialVisibility`, la graine de la PORTE. Un auteur
    /// pouvait donc changer d'audience et publier sous l'ancienne, sans qu'aucun
    /// écran ne le dise. C'est la moitié qui manquait au sélecteur ci-dessus —
    /// un contrôle existe s'il a un EFFET (loi 4).
    func test_leBrouillonDuDocument_litLAudienceCourante_jamaisCelleDeLaPorte() throws {
        guard let bloc = declarationBody(startingAt: "private var documentDraft", in: try hostCode()) else {
            return XCTFail("Le brouillon doit être une propriété nommée `documentDraft` — la garde s'ancre dessus")
        }
        let corps = compact(bloc)

        XCTAssertTrue(
            corps.contains("ComposerDocumentDraft.document("),
            "Le bloc lu n'est pas celui du brouillon — la garde ne mesurerait RIEN."
        )
        XCTAssertFalse(
            corps.contains("initialVisibility"),
            "Le brouillon lit encore la graine de la PORTE : l'audience choisie au socle serait perdue en "
                + "silence, et l'auteur publierait sous un réglage qu'il vient de changer."
        )
        XCTAssertTrue(
            corps.contains("visibility:composerVisibility"),
            "Les DEUX brouillons — mood et document — lisent la même audience : le meuble n'en a qu'une."
        )
    }

    /// **UNE audience pour les deux surfaces sans atelier.**
    ///
    /// Même raison que `documentText`, et elle est écrite au-dessus de lui : la
    /// loi 9 autorise à changer de format, jamais à jeter ce qui est composé.
    /// Deux champs jumeaux (`moodVisibility` d'un côté, une audience de document
    /// de l'autre) auraient perdu le réglage au premier tap de l'éventail, sans
    /// qu'aucun test ne le dise.
    func test_leMeuble_nAQuUneSeuleAudience_pourSesDeuxSurfacesSansAtelier() throws {
        let code = compact(try hostCode())
        XCTAssertFalse(
            code.contains("moodVisibility"),
            "Le meuble porte encore une audience nommée pour le MOOD : elle ne suivra pas une bascule de "
                + "format, et le réglage se perdra sans un mot."
        )
        XCTAssertTrue(
            code.contains("varcomposerVisibility:PostVisibility"),
            "L'audience du meuble s'appelle `composerVisibility` — un nom qui dit qu'elle n'appartient à "
                + "aucune des deux surfaces."
        )
        XCTAssertTrue(
            code.contains("visibility:$composerVisibility"),
            "La surface du mood se lie à l'audience du MEUBLE, pas à une audience qui lui serait propre."
        )
    }

    // MARK: - Lot 4.5 — le gate de MATIÈRE de la flèche

    /// **Un mood SANS emoji ne part pas** — la seule règle de publication du
    /// format. Le gate ne la réécrit pas : il DÉLÈGUE à `ComposerMoodPolicy`, qui
    /// la tient depuis le lot 4.4. Deux gates pour un même format divergeraient au
    /// premier assouplissement.
    func test_leGate_refuseUnMoodSansEmoji_etAccepteAvec() {
        XCTAssertFalse(
            ComposerDocumentPublishGate.canPublish(surface: .mood, emoji: nil, text: "ça va", visibility: .public, visibilityUserIds: [], isPublishing: false, repostOfId: nil),
            "Sans emoji, rien ne part — c'était déjà le gate de l'écran historique."
        )
        XCTAssertTrue(
            ComposerDocumentPublishGate.canPublish(surface: .mood, emoji: "🔥", text: "", visibility: .public, visibilityUserIds: [], isPublishing: false, repostOfId: nil),
            "Un mood SANS texte part très bien : c'est l'emoji qui fait la matière, pas la phrase."
        )
    }

    /// Le document, lui, se juge sur son TEXTE — et un texte de blancs n'est pas
    /// une matière. L'écran n'existe pas encore en production ; la règle, si.
    func test_leGate_refuseUnDocumentVideOuBlanc() {
        XCTAssertFalse(
            ComposerDocumentPublishGate.canPublish(surface: .document, emoji: nil, text: "", visibility: .public, visibilityUserIds: [], isPublishing: false, repostOfId: nil),
            "Une page blanche ne part pas."
        )
        XCTAssertFalse(
            ComposerDocumentPublishGate.canPublish(surface: .document, emoji: nil, text: "   \n ", visibility: .public, visibilityUserIds: [], isPublishing: false, repostOfId: nil),
            "Trois espaces et un retour à la ligne ne sont pas un post."
        )
        XCTAssertTrue(
            ComposerDocumentPublishGate.canPublish(surface: .document, emoji: nil, text: "bonjour", visibility: .public, visibilityUserIds: [], isPublishing: false, repostOfId: nil),
            "… et une phrase, oui — sans quoi la garde précédente serait verte sur un gate toujours fermé."
        )
    }

    /// **Un ancrage a sa matière : c'est sa SOURCE** — le gate ne lui demande
    /// donc aucun texte (lot 4.7).
    ///
    /// Le cas NOMINAL d'une republication de mood est le mood SANS phrase :
    /// `StatusEntry.content` est optionnel, et republier sans un mot est un
    /// repost SIMPLE, exactement ce que `FeedViewModel.repostPost` envoie déjà
    /// (`content: nil, isQuote: false`). Exiger un texte y aurait laissé la
    /// flèche grise **sans un mot d'explication** :
    /// `ComposerSocleCopy.publishBlockedHint(surface: .document)` rend `nil`,
    /// faute d'une phrase juste déjà traduite. C'eût été la loi 4 défaite à
    /// l'endroit même que ce lot livre.
    ///
    /// **Le quatrième cas mesure l'ORDRE, pas seulement la règle.** La source ne
    /// dispense de rien : un `ONLY` sans personne retient AUSSI un ancrage (400
    /// `VALIDATION_ERROR` de `CreatePostSchema`). Remonter `repostOfId != nil`
    /// au-dessus d'`audienceIsComplete` armerait la flèche sur ce refus certain.
    func test_leGate_armeLAncrage_memeSansUnMot_carSaMatiereEstSaSource() {
        XCTAssertTrue(
            ComposerDocumentPublishGate.canPublish(
                surface: .document, emoji: nil, text: "",
                visibility: .public, visibilityUserIds: [], isPublishing: false, repostOfId: "mood-source"
            ),
            "Une republication SANS commentaire est le cas nominal : sa matière est la source, pas la phrase."
        )
        XCTAssertFalse(
            ComposerDocumentPublishGate.canPublish(
                surface: .document, emoji: nil, text: "",
                visibility: .public, visibilityUserIds: [], isPublishing: false, repostOfId: nil
            ),
            "Une page blanche SANS source ne part toujours pas — sans quoi la garde ci-dessus serait verte "
                + "sur un gate devenu toujours ouvert."
        )
        XCTAssertTrue(
            ComposerDocumentPublishGate.canPublish(
                surface: .document, emoji: nil, text: "bonjour",
                visibility: .public, visibilityUserIds: [], isPublishing: false, repostOfId: nil
            ),
            "… et un post ordinaire se juge toujours sur son texte (non-régression)."
        )
        XCTAssertFalse(
            ComposerDocumentPublishGate.canPublish(
                surface: .document, emoji: nil, text: "",
                visibility: .only, visibilityUserIds: [], isPublishing: false, repostOfId: "mood-source"
            ),
            "Un `ONLY` sans personne retient AUSSI un ancrage : la source ne dispense pas de l'audience, et "
                + "la garde d'audience se lit AVANT le `switch` — pas après."
        )
    }

    /// Le drapeau d'envoi ferme le gate à lui seul : sans lui, un double tap sur
    /// la flèche produirait deux publications. L'écran historique du mood tenait
    /// la même règle par le même drapeau.
    func test_leGate_refuseTantQuUnEnvoiEstEnVol() {
        XCTAssertFalse(
            ComposerDocumentPublishGate.canPublish(surface: .mood, emoji: "🔥", text: "ça va", visibility: .public, visibilityUserIds: [], isPublishing: true, repostOfId: nil),
            "Un envoi en vol ferme le gate — deux taps ne font pas deux moods."
        )
        XCTAssertFalse(
            ComposerDocumentPublishGate.canPublish(surface: .document, emoji: nil, text: "bonjour", visibility: .public, visibilityUserIds: [], isPublishing: true, repostOfId: nil),
            "… et le document ne fait pas exception."
        )
    }

    /// **Sous la scène, le gate REFUSE toujours** — et ce n'est pas une
    /// précaution gratuite. Le jour où le socle publiera sous la scène, il devra
    /// passer par le gate de l'atelier (`canPublish`, `internal` à `MeeshyUI`),
    /// qui voit les diapositives et la timeline. Celui-ci ne les voit pas : il
    /// refuse au lieu d'inventer une réponse qu'il n'a pas.
    func test_leGate_neDeclencheJamaisSousLaScene() {
        XCTAssertFalse(
            ComposerDocumentPublishGate.canPublish(surface: .scene, emoji: "🔥", text: "une phrase", visibility: .public, visibilityUserIds: [], isPublishing: false, repostOfId: nil),
            "Le gate du document ne sait rien d'une composition de scène : il ne prétend pas la juger."
        )
    }

    /// **Une audience NOMINATIVE sans personne n'est pas une audience.**
    ///
    /// `EXCEPT`/`ONLY` ne se lisent pas seules : leur portée EST la liste qui les
    /// accompagne. `CreatePostSchema` le refuse en toutes lettres
    /// (`services/gateway/src/routes/posts/types.ts` — « EXCEPT and ONLY
    /// visibility require at least one userId in visibilityUserIds »), et la
    /// feuille historique du fil retenait déjà l'envoi pour cette raison
    /// (`FeedComposerSheet.postAudienceIncomplete`). Le meuble ne le faisait
    /// pas : sa flèche s'armait à la première lettre et l'auteur recevait un
    /// refus que rien à l'écran n'avait annoncé.
    ///
    /// Deux chemins l'atteignaient, et le second survit à toute mémoire :
    /// toucher « Annuler » dans `AudienceUserPickerView` — son en-tête n'appelle
    /// `onDone` que sur « OK » — laisse l'audience nominative debout avec une
    /// liste vide.
    func test_leGate_refuseUneAudienceNominativeSansPersonne_surLesDeuxSurfaces() {
        for nominative in PostVisibility.composerSelectableCases where nominative.requiresUserSelection {
            XCTAssertFalse(
                ComposerDocumentPublishGate.canPublish(
                    surface: .mood, emoji: "🔥", text: "ça va",
                    visibility: nominative, visibilityUserIds: [], isPublishing: false, repostOfId: nil
                ),
                "Un mood « \(nominative.rawValue) » sans personne arme la flèche : le gateway le refuse, et "
                    + "l'auteur perd sa composition sur un refus que rien n'annonçait."
            )
            XCTAssertFalse(
                ComposerDocumentPublishGate.canPublish(
                    surface: .document, emoji: nil, text: "bonjour",
                    visibility: nominative, visibilityUserIds: [], isPublishing: false, repostOfId: nil
                ),
                "… et le document ne fait pas exception : son socle sait choisir « \(nominative.rawValue) »."
            )
            XCTAssertTrue(
                ComposerDocumentPublishGate.canPublish(
                    surface: .mood, emoji: "🔥", text: "ça va",
                    visibility: nominative, visibilityUserIds: ["u1"], isPublishing: false, repostOfId: nil
                ),
                "… et une seule personne suffit — sans quoi la garde ci-dessus serait verte sur un gate "
                    + "toujours fermé."
            )
        }
    }

    /// La complétude de l'audience est une règle NOMMÉE, pas une condition
    /// enfouie dans le gate : la flèche la lit pour s'armer, et l'indice
    /// d'accessibilité la lit pour ne pas MENTIR. Deux lectures, une écriture.
    func test_laCompletudeDeLAudience_estUneRegleLisibleAPart() {
        XCTAssertTrue(
            ComposerDocumentPublishGate.audienceIsComplete(.public, userIds: []),
            "Une audience qui n'exige aucune liste est complète sans liste."
        )
        XCTAssertFalse(
            ComposerDocumentPublishGate.audienceIsComplete(.only, userIds: []),
            "Un ONLY sans personne est incomplet — c'est ce que le gateway refuse."
        )
        XCTAssertTrue(
            ComposerDocumentPublishGate.audienceIsComplete(.except, userIds: ["u1"]),
            "Une personne suffit à donner sa portée à un EXCEPT."
        )
    }

    /// **L'indice d'accessibilité ne doit pas MENTIR.** La seule phrase déjà
    /// traduite dit « choisissez un emoji », ce qui est FAUX d'un mood qui en a
    /// un et que seule son audience retient. Le lot n'ajoute aucune clé au
    /// catalogue (sept locales, cliquet français à zéro tolérance) : mieux vaut
    /// MUET que faux, et la condition est lue par la règle ci-dessus plutôt que
    /// réécrite dans la vue.
    func test_lIndiceDeLaFleche_seTait_quandLeBlocageNestPasLaMatiere() throws {
        guard let bloc = declarationBody(startingAt: "private var publishBlockedHint", in: try hostCode()) else {
            return XCTFail("`publishBlockedHint` est introuvable — la garde ne mesurerait RIEN")
        }
        let compacte = compact(bloc)
        XCTAssertTrue(
            compacte.contains(compact("ComposerSocleCopy.publishBlockedHint(")),
            "Le bloc lu n'est pas celui de l'indice."
        )
        XCTAssertTrue(
            compacte.contains(compact("ComposerDocumentPublishGate.audienceIsComplete(")),
            "L'indice annonce « choisissez un emoji » même quand c'est l'AUDIENCE qui retient la flèche : "
                + "VoiceOver dicterait un geste qui ne débloque rien."
        )
    }

    // MARK: - Lot 4.5 — ce que le socle REMET au site de montage

    /// **Loi 3 — `nil` et JAMAIS `[]`.** Un tableau vide est entendu par le
    /// serveur comme un EFFACEMENT des mentions ; l'absence de clé le laisse
    /// relire les `@handle` du texte. La normalisation vit dans la FABRIQUE et
    /// non chez l'appelant : la laisser aux quatre sites de montage du lot 4.6,
    /// ce serait écrire la loi 3 quatre fois.
    func test_leBrouillonDuMood_neDeclareAucuneMention_quandRienNestDeclarable() {
        let brouillon = ComposerDocumentDraft.mood(
            emoji: "🔥", text: "salut", visibility: .public, visibilityUserIds: [],
            references: [ComposerReference(username: "alice", display: .inline)]
        )
        XCTAssertNil(
            brouillon.mentions,
            "Une mention INLINE se relit du texte : la déclarer ouvrirait un second chemin vers le même fait, "
                + "et un `[]` effacerait celles que le serveur y trouve."
        )
    }

    /// Et une référence DÉCLARABLE passe — sans quoi la garde précédente resterait
    /// verte sur une fabrique qui rendrait toujours `nil`.
    func test_leBrouillonDuMood_porteLesMentionsDeclarables() {
        let brouillon = ComposerDocumentDraft.mood(
            emoji: "🔥", text: "salut", visibility: .public, visibilityUserIds: [],
            references: [ComposerReference(username: "alice", userId: "u-1", display: .pinned)]
        )
        XCTAssertEqual(brouillon.mentions?.count, 1)
        XCTAssertEqual(brouillon.mentions?.first?.userId, "u-1")
    }

    /// La liste nominative voyage avec l'audience qui l'exige, et avec elle seule.
    /// La porter sous un `PUBLIC` la ferait persister pour rien ; l'oublier sous
    /// un `ONLY` ferait rejeter le mood par le gateway — c'est le champ que la
    /// reprise hors-ligne de l'écran historique prenait soin de restaurer.
    func test_leBrouillonDuMood_nePorteLaListeNominative_queLaOuElleEstExigee() {
        let ouvert = ComposerDocumentDraft.mood(
            emoji: "🔥", text: "", visibility: .public, visibilityUserIds: ["u-1"], references: []
        )
        XCTAssertNil(ouvert.visibilityUserIds, "Une audience ouverte n'a pas de liste à porter.")

        let restreint = ComposerDocumentDraft.mood(
            emoji: "🔥", text: "", visibility: .only, visibilityUserIds: ["u-1"], references: []
        )
        XCTAssertEqual(
            restreint.visibilityUserIds, ["u-1"],
            "Un `ONLY` sans sa liste est rejeté par le gateway."
        )
    }

    /// `nil` plutôt que la chaîne vide — la forme exacte que `setStatus` attend,
    /// et qui distingue « pas de texte » de « texte effacé ».
    func test_leBrouillonDuMood_rendLeTexteNil_quandRienNaEteTape() {
        let muet = ComposerDocumentDraft.mood(
            emoji: "🔥", text: "", visibility: .public, visibilityUserIds: [], references: []
        )
        XCTAssertNil(muet.text)
        XCTAssertEqual(muet.emoji, "🔥", "… et l'emoji, lui, part toujours : c'est la matière du mood.")
        XCTAssertEqual(muet.format, .status, "Un brouillon de mood porte son format, il ne le laisse pas deviner.")
    }

    /// **Le PLAFOND du mood est tenu par la FABRIQUE, et pas seulement par la
    /// frappe** (lot 4.7).
    ///
    /// Il vivait dans le seul `adaptiveOnChange` de `ComposerMoodSurface`, ce
    /// qui suffisait tant que la frappe était l'unique entrée de `documentText`.
    /// Depuis que l'éventail descend, le texte est AUSSI écrit par le
    /// `TextEditor` de la surface document — qui n'a aucun plafond, un post n'en
    /// ayant pas — puis rapporté sous le mood par une bascule : cinq gestes
    /// (republier → « Post » → coller 300 caractères → « Mood » → flèche) et le
    /// `STATUS` partait avec 300 caractères. Rien en aval ne rattrapait :
    /// `ComposerMoodPolicy.canPublish` ne regarde que l'emoji, et
    /// `CreatePostSchema` plafonne à 5000.
    ///
    /// La fabrique est le SEUL site que tous les chemins d'envoi traversent. La
    /// surface tronque toujours, elle — pour que l'auteur le VOIE, doctrine du
    /// mood : troncature, jamais refus de frappe.
    func test_leBrouillonDuMood_plafonneLeTexte_dOuQuIlVienne() {
        let colle = String(repeating: "a", count: 300)
        let brouillon = ComposerDocumentDraft.mood(
            emoji: "🔥", text: colle, visibility: .public, visibilityUserIds: [], references: []
        )

        XCTAssertEqual(
            brouillon.text?.count, ComposerMoodPolicy.contentLimit,
            "Un texte composé sous la surface document, puis rapporté sous le mood par l'éventail, partirait "
                + "sinon en `STATUS` sans plafond — le compteur affichant son alerte à côté d'une flèche armée."
        )
        XCTAssertEqual(
            brouillon.text, ComposerMoodPolicy.truncate(colle),
            "Le plafond passe par la RÈGLE : réécrit ici, il divergerait de celui que la surface applique."
        )
    }

    /// … et le brouillon du DOCUMENT ne plafonne pas : un post n'a pas de
    /// plafond, et en poser un ici rognerait la saisie de `.feedComposer` le
    /// jour de son recâblage. Sans ce témoin, la garde ci-dessus resterait verte
    /// sur une fabrique qui tronquerait les deux.
    func test_leBrouillonDuDocument_nePlafonnePasLeTexte_carUnPostNaPasDePlafond() {
        let long = String(repeating: "a", count: 300)
        let brouillon = ComposerDocumentDraft.document(
            format: .post, forcePlainPost: false, text: long, visibility: .public, visibilityUserIds: [], repostOfId: nil, localMedia: [], location: nil, discoverabilityPrecision: nil, originalLanguage: nil, mobileTranscription: nil
        )

        XCTAssertEqual(brouillon.text?.count, 300)
    }

    /// Le brouillon du document ne fabrique NI emoji NI mention : sa surface n'a
    /// ni grille d'emojis ni barre de références. Lui inventer des champs
    /// qu'aucune vue ne remplit aurait fabriqué une capacité que le premier
    /// lecteur aurait crue tenue.
    func test_leBrouillonDuDocument_neFabriqueNiEmojiNiMention() {
        let brouillon = ComposerDocumentDraft.document(
            format: .post, forcePlainPost: false, text: "bonjour", visibility: .friends, visibilityUserIds: [], repostOfId: nil, localMedia: [], location: nil, discoverabilityPrecision: nil, originalLanguage: nil, mobileTranscription: nil
        )
        XCTAssertNil(brouillon.emoji)
        XCTAssertNil(brouillon.mentions)
        XCTAssertNil(brouillon.repostOfId)
        XCTAssertEqual(brouillon.format, .post)
        XCTAssertEqual(brouillon.text, "bonjour")
    }

    // MARK: - Lot 4.5 — le canal de publication, vu de la SOURCE

    /// **La flèche du socle est un BOUTON, gaté et branché.**
    ///
    /// Elle fut un `Label` — un témoin qui nommait la publication sans la
    /// piloter. Trois moitiés seraient pires que l'ancien témoin : un bouton sans
    /// gate publierait des pages blanches, un bouton sans branchement serait une
    /// affordance sans effet, un gate écrit à la main serait une seconde règle à
    /// faire diverger.
    func test_laFlecheDuSocle_estUnBouton_gateEtBranche() throws {
        guard let bloc = declarationBody(startingAt: "private var publishButton", in: try hostCode()) else {
            return XCTFail("La zone de publication du socle est introuvable — la garde ne mesurerait RIEN")
        }
        let compacte = compact(bloc)

        XCTAssertTrue(
            compacte.contains("Button{") || compacte.contains("Button("),
            "La flèche doit être une EXPRESSION `Button` : la propriété s'appelle `publishButton`, et chercher "
                + "le mot aurait rendu vrai sur le `Label` témoin — une garde verte affirmant le contraire de "
                + "ce qu'elle mesure."
        )
        XCTAssertTrue(
            compacte.contains(compact(".disabled(!canPublishDocument)")),
            "Un bouton sans gate de matière publierait une page blanche depuis le socle."
        )
        XCTAssertTrue(
            compacte.contains("publishDocument()"),
            "… et un bouton qui ne déclenche rien est l'affordance sans effet que ce chantier retire partout."
        )
    }

    /// Le gate de la flèche n'est pas écrit à la main : il passe par la règle
    /// pure. L'écran historique du mood écrivait la même règle DEUX fois — le
    /// `guard let emoji` de l'action et le `.disabled(…)` du bouton — et deux
    /// écritures d'une règle sont deux occasions de la corriger à moitié.
    func test_leGateDeLaFleche_passeParLaReglePure() throws {
        let compacte = try hostCompact()
        XCTAssertTrue(
            compacte.contains(compact("ComposerDocumentPublishGate.canPublish(")),
            "Le meuble doit lire le gate partagé — le réécrire ici en ferait un second à faire diverger."
        )
        XCTAssertFalse(
            compacte.contains(compact("moodEmoji == nil")),
            "La règle « un mood sans emoji ne part pas » ne se réécrit pas dans le meuble."
        )
    }

    /// **Le meuble TRANSMET, il ne publie pas.** `test_host_opensNoSecondPublicationPath`
    /// couvre le fichier ; celle-ci nomme le bloc, parce que c'est là que la
    /// tentation naîtra — la flèche est branchée, appeler le service depuis son
    /// action est le raccourci évident.
    func test_lEnvoiDuSocle_neTouchAucunService() throws {
        guard let bloc = declarationBody(startingAt: "private func publishDocument", in: try hostCode()) else {
            return XCTFail("`publishDocument` est introuvable dans le meuble — la garde ne mesurerait RIEN")
        }
        let compacte = compact(bloc)

        XCTAssertTrue(compacte.contains("onPublishDocument("), "Le bloc lu n'est pas celui de l'envoi du socle.")
        for interdit in ["StatusService", "PostService", "StoryPublishService", "APIClient",
                         "OutboxFlusher", "TusUploadManager", "ComposerDocumentSendRouting"] {
            XCTAssertFalse(
                compacte.contains(compact(interdit)),
                "L'envoi du socle touche « \(interdit) » : c'est le SECOND chemin de publication que la "
                    + "doctrine, C2 et le lot 7 interdisent tous les trois."
            )
        }
    }

    /// **Un envoi qui ÉCHOUE ne ferme pas le composer.**
    ///
    /// C'est le seul geste de `publishDocument` qu'aucune garde de source ne
    /// rattraperait après coup : une fermeture INCONDITIONNELLE jetterait le
    /// texte, l'audience et l'emoji que l'auteur vient de composer, et le
    /// produit resterait plausible — l'écran se ferme, exactement comme quand
    /// tout va bien. C'est ce qui rend cette perte-là silencieuse.
    ///
    /// Elle n'était pas gardée avant le lot 4.10, et elle ne pouvait pas
    /// l'être utilement : aucun site de montage n'émettait jamais `false`, donc
    /// la branche du refus était morte. `DocumentComposerDoor` en émet un — un
    /// publieur qui refuse la ligne, un publieur muet, un chemin non durable —
    /// et la branche devient atteignable le jour où la porte est montée.
    ///
    /// Trois faits, et le troisième est celui qu'on oublie : le meuble ne doit
    /// pas non plus VIDER sa saisie sur le chemin du refus. Fermer et effacer
    /// perdent la même chose par deux portes différentes.
    func test_lEnvoiDuSocle_neFermeQueSurUneAcceptation_etNeJettePasLaSaisie() throws {
        guard let bloc = declarationBody(startingAt: "private func publishDocument", in: try hostCode()) else {
            return XCTFail("`publishDocument` est introuvable dans le meuble — la garde ne mesurerait RIEN")
        }
        let compacte = compact(bloc)

        XCTAssertTrue(compacte.contains("onPublishDocument("), "Le bloc lu n'est pas celui de l'envoi du socle.")
        XCTAssertTrue(
            compacte.contains(compact("if accepted { onDismiss() }")),
            "La sortie doit être CONDITIONNÉE par l'acceptation du site de montage. Un `onDismiss()` "
                + "inconditionnel jetterait ce que l'auteur vient d'écrire sur un envoi que le publieur a "
                + "refusé — et l'écran se refermerait comme si tout allait bien."
        )
        for jet in ["documentText = \"\"", "moodEmoji = nil", "moodReferences = []"] {
            XCTAssertFalse(
                compacte.contains(compact(jet)),
                "L'envoi du socle exécute « \(jet) » : sur un refus, la saisie serait perdue sans même que "
                    + "l'écran se ferme — la même perte par une autre porte."
            )
        }
    }

    /// **Le canal n'a AUCUNE valeur par défaut**, et c'est le fond de l'affaire :
    /// un défaut l'aurait fait disparaître en silence d'un site de montage — le
    /// mode d'échec exact que `ComposerDocumentSurface.onClose` consigne, et que
    /// `initialVisibility` a déjà coûté un cran plus haut avec le défaut
    /// `PostVisibility.friends` du SDK.
    func test_leCanalDePublicationDuDocument_nAAucuneValeurParDefaut() throws {
        let compacte = try hostCompact()
        XCTAssertTrue(
            compacte.contains(compact("onPublishDocument: @escaping @MainActor (ComposerDocumentDraft) async -> Bool,")),
            "Le paramètre doit rester OBLIGATOIRE dans l'`init` : un défaut le ferait disparaître d'un site "
                + "de montage sans casser la moindre compilation."
        )
    }

    /// **La GRAINE du mood n'a AUCUNE valeur par défaut non plus**, et pour la
    /// même raison, mesurée sur un échec différent : un défaut la ferait
    /// disparaître d'un site de REPUBLICATION sans casser la moindre
    /// compilation. Le composer s'ouvrirait alors vide — sans emoji repris, sans
    /// bandeau « Status de @X », sans `repostOfId` — et la republication
    /// deviendrait une création. Le produit resterait plausible ; c'est
    /// exactement ce qui rend l'échec silencieux.
    func test_laGraineDuMood_nAAucuneValeurParDefaut() throws {
        let compacte = try hostCompact()
        XCTAssertTrue(
            compacte.contains(compact("moodSeed: ComposerMoodSeed?,")),
            "Le paramètre doit rester OBLIGATOIRE dans l'`init` : un défaut le ferait disparaître d'un site "
                + "de republication, qui publierait alors un mood neuf au lieu d'un repartage."
        )
    }

    /// **La GRAINE DU MÉDIA non plus** — troisième fois que la même discipline
    /// se pose dans ce fichier, sur un troisième échec silencieux.
    ///
    /// Un défaut la ferait disparaître de `ConversationMediaComposerDoor` sans
    /// casser la moindre compilation : la porte du média reçu ouvrirait alors un
    /// atelier VIDE, sous une entrée de menu qui vient de promettre une photo
    /// déjà posée. Le produit resterait plausible — l'auteur croirait avoir mal
    /// visé — et c'est exactement ce qui rend l'échec coûteux.
    func test_laGraineDuMedia_nAAucuneValeurParDefaut() throws {
        let compacte = try hostCompact()
        XCTAssertTrue(
            compacte.contains(compact("mediaSeed: StoryComposerSeed?,")),
            "Le paramètre doit rester OBLIGATOIRE dans l'`init` : un défaut ferait ouvrir un composer VIDE "
                + "à la porte du média reçu, sans casser la moindre compilation."
        )
    }

    /// **Le meuble construit UN ViewModel, semé ou non.**
    ///
    /// Deux constructions hors de la branche laisseraient le composer
    /// s'autosauvegarder sous un id neuf pendant que le brouillon adopté
    /// resterait intact à côté — le doublon exact que `adoptDraft` existe pour
    /// éviter. Et l'ADOPTION doit venir APRÈS la graine : un brouillon que
    /// l'auteur vient de désigner l'emporte sur ce qu'une porte sème.
    func test_leMeuble_construitUnSeulAtelier_etAdopteApresAvoirSeme() throws {
        let compacte = try hostCompact()

        XCTAssertTrue(
            compacte.contains(compact("StoryComposerViewModel(seeding: mediaSeed)")),
            "Sans cette construction, `mediaSeed` est un paramètre TRANSPORTÉ que personne ne consomme — "
                + "la porte sèmerait dans le vide."
        )
        let graine = compacte.range(of: compact("StoryComposerViewModel(seeding: mediaSeed)"))
        let adoption = compacte.range(of: compact("composer.adoptDraft(id: draftId)"))
        XCTAssertNotNil(adoption, "L'adoption d'un brouillon a disparu du meuble.")
        if let graine, let adoption {
            XCTAssertTrue(
                graine.lowerBound < adoption.lowerBound,
                "L'adoption doit venir APRÈS la graine : inversée, elle laisserait une graine écraser "
                    + "l'identité d'autosave d'un brouillon repris — perte silencieuse d'un travail en cours."
            )
        }
    }

    /// Tout site qui monte le meuble lui donne son canal ET sa graine — celui
    /// qui n'en a pas doit l'ÉCRIRE. Cette garde a été posée au lot 4.5 pour le
    /// lot 4.6, et le lot 4.6 lui a donné son second site : sans elle, un montage
    /// pourrait naître avec un canal qui refuse, et le mood s'y composerait sans
    /// jamais partir.
    ///
    /// Le compte est écrit en dur — QUATRE sites depuis le lot 5, et ce que
    /// la liste affirme n'est pas « ces quatre fichiers-là » mais **« seules des
    /// PORTES montent le meuble, jamais une feuille de présentation »** : la
    /// porte de création de story (`StoryTrayActions`), la porte du mood
    /// (`MoodComposerDoor`), la porte du document (`DocumentComposerDoor`) —
    /// ces deux dernières vivant dans le fichier de leur surface — et la porte
    /// du média reçu (`ConversationMediaComposerDoor`).
    ///
    /// **Ce quatrième nom a une histoire qu'il faut garder.** Le plan du lot 5
    /// dirigeait le montage vers `ConversationView`, une feuille de
    /// PRÉSENTATION. Cette garde l'a refusé, et elle avait raison : le montage
    /// porte l'envoi, la reprise et la sortie, et posé dans une feuille il
    /// aurait été recopié au premier second site — la feuille de forward, qui
    /// est justement le SECOND déclencheur du même chemin.
    ///
    /// Les quatre feuilles du mood ne montent PAS le meuble elles-mêmes : elles
    /// montent la porte, qui porte la reprise hors-ligne et l'envoi. Quatre
    /// copies de ce geste auraient été quatre contrats à faire diverger — et
    /// c'est exactement pour cela que la porte du document naît AVANT ses sites
    /// de présentation, et non l'inverse.
    ///
    /// **Une liste comme celle-ci porte DEUX affirmations**, et la seconde ne se
    /// vérifie jamais toute seule : « ces sites donnent bien canal et graine »
    /// (mesuré ci-dessous) et « ce sont les seuls sites où le meuble se monte »
    /// (l'égalité finale). Y ajouter un nom sans se demander lequel des deux on
    /// vient d'affaiblir est la façon dont ce genre de garde meurt.
    func test_chaqueSiteQuiMonteLeMeuble_luiDonneSonCanalDePublication_etSaGraine() throws {
        var sitesVus: [String] = []
        for url in sourcesDeLApp(excluant: ["MeeshyComposerHost.swift"]) {
            let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            guard code.contains("MeeshyComposerHost(") else { continue }
            sitesVus.append(url.lastPathComponent)
            XCTAssertTrue(
                code.contains("onPublishDocument:"),
                "\(url.lastPathComponent) monte le meuble sans lui donner de canal de publication de document."
            )
            XCTAssertTrue(
                code.contains("moodSeed:"),
                "\(url.lastPathComponent) monte le meuble sans lui dire ce qu'il sème — un site qui n'a rien à "
                    + "semer doit écrire `moodSeed: nil`, et écrire pourquoi."
            )
            XCTAssertTrue(
                code.contains("mediaSeed:"),
                "\(url.lastPathComponent) monte le meuble sans lui dire quel MÉDIA il sème — un site qui n'en "
                    + "sème aucun doit écrire `mediaSeed: nil`, et écrire pourquoi."
            )
        }
        XCTAssertFalse(sitesVus.isEmpty, "Aucun site ne monte le meuble — la garde ne mesurerait RIEN.")
        XCTAssertEqual(
            Set(sitesVus),
            ["StoryTrayActions.swift", "ComposerMoodSurface.swift", "ComposerDocumentSurface.swift",
             "ConversationMediaComposerDoor.swift"],
            "Les sites qui montent le MEUBLE lui-même sont écrits en toutes lettres, et ce sont des PORTES : "
                + "un montage de plus, posé directement dans une feuille de présentation, recopierait l'envoi "
                + "et la reprise hors-ligne que `MoodComposerDoor` et `DocumentComposerDoor` tiennent une "
                + "fois pour toutes leurs présentations."
        )
    }

    /// **L'ORDRE des arguments, et pas seulement leur présence.**
    ///
    /// Swift n'autorise AUCUN réordonnancement d'arguments : un libellé posé
    /// avant son rang est une erreur DURE, jamais un avertissement. La porte du
    /// mood a été livrée avec `moodSeed:` en 3e position quand l'`init` le
    /// déclare en 6e. La cible `Meeshy` ne compilait donc pas, `MeeshyTests` ne
    /// se liait pas, et AUCUNE garde de ce fichier ne s'exécutait — le gate
    /// rouge en bloc, sans qu'une seule assertion nomme la cause.
    ///
    /// Aucune garde existante ne pouvait l'attraper : elles cherchent toutes la
    /// PRÉSENCE d'un libellé (`moodSeed:`, `onPublishDocument:`), et une garde
    /// de source ne compile pas ce qu'elle lit. Celle-ci lit la liste des
    /// libellés de l'`init` À LA SOURCE et exige que chaque site de montage
    /// présente les siens en SOUS-SUITE CROISSANTE — exactement la règle du
    /// compilateur, omission d'un paramètre à défaut comprise.
    ///
    /// Elle est posée pour la suite : le lot 5.5 doit greffer `seed:` sur ce
    /// même `init` (collision déclarée). Sans elle, l'insertion d'un paramètre
    /// au milieu reproduirait le même rouge, et de nouveau sans qu'aucun test
    /// ne le nomme.
    func test_chaqueSiteDeMontage_presenteSesLibellesDansLOrdreDeLInit() throws {
        let attendus = try libellesDeLInitDuMeuble()
        XCTAssertEqual(
            attendus,
            ["intent", "initialVisibility", "draftId", "onPublishAllInBackground",
             "onPublishDocument", "moodSeed", "mediaSeed", "onPreview", "onDismiss"],
            "La liste des paramètres du meuble a changé. Ce n'est pas un échec en soi — elle est écrite en "
                + "toutes lettres ici pour qu'un changement d'ordre se lise dans un diff au lieu de se "
                + "découvrir à la compilation, et pour que la sous-suite ci-dessous ait une référence stable."
        )

        var sitesVus = 0
        for url in sourcesDeLApp(excluant: ["MeeshyComposerHost.swift"]) {
            let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            for appel in appels(de: "MeeshyComposerHost(", dans: code) {
                sitesVus += 1
                let poses = libellesDePremierNiveau(appel)
                XCTAssertFalse(
                    poses.isEmpty,
                    "\(url.lastPathComponent) monte le meuble sans qu'un seul libellé soit lisible : "
                        + "l'extraction a échoué, et la garde ne mesurerait RIEN sur ce site."
                )
                XCTAssertTrue(
                    estSousSuite(poses, de: attendus),
                    "\(url.lastPathComponent) passe ses arguments dans l'ordre \(poses), alors que l'`init` les "
                        + "déclare dans l'ordre \(attendus). Swift refuse le réordonnancement : c'est une erreur "
                        + "de compilation, donc un gate rouge EN BLOC où aucune de ces gardes ne s'exécute."
                )
            }
        }
        XCTAssertGreaterThanOrEqual(
            sitesVus, 2,
            "Moins de deux montages du meuble trouvés — la garde d'ordre ne mesurerait presque RIEN."
        )
    }

    /// La liste ORDONNÉE des libellés de l'`init` du meuble, lue à la SOURCE.
    /// L'écrire en dur des deux côtés n'aurait rien mesuré : c'est justement
    /// l'écart entre la déclaration et l'appel qui casse la compilation.
    private func libellesDeLInitDuMeuble() throws -> [String] {
        guard let listeDeParametres = appels(de: "init(", dans: try hostCode()).first else {
            XCTFail("L'`init` du meuble est introuvable — la garde ne mesurerait RIEN.")
            return []
        }
        return libellesDePremierNiveau(listeDeParametres)
    }

    /// Le texte de chaque appel commençant par `ancre`, de sa `(` ouvrante à la
    /// `)` appariée. Pour une DÉCLARATION, cela rend exactement sa liste de
    /// paramètres — le corps commence après.
    private func appels(de ancre: String, dans code: String) -> [String] {
        var resultats: [String] = []
        var curseur = code.startIndex
        while let debut = code.range(of: ancre, options: [], range: curseur ..< code.endIndex) {
            var profondeur = 0
            var texte = ""
            var equilibre = false
            for caractere in code[debut.lowerBound...] {
                texte.append(caractere)
                if caractere == "(" { profondeur += 1 }
                if caractere == ")" {
                    profondeur -= 1
                    if profondeur == 0 {
                        equilibre = true
                        break
                    }
                }
            }
            if equilibre { resultats.append(texte) }
            curseur = debut.upperBound
        }
        return resultats
    }

    /// Les libellés de PREMIER NIVEAU — ceux que le compilateur apparie à la
    /// déclaration. Les deux-points des appels imbriqués, des types de
    /// dictionnaire et des corps de fermeture sont écartés par les trois
    /// compteurs de profondeur ; sans eux, `[String: UIImage]` du canal de
    /// scène passerait pour un libellé.
    private func libellesDePremierNiveau(_ appel: String) -> [String] {
        var libelles: [String] = []
        var parentheses = 0
        var accolades = 0
        var crochets = 0
        var jeton = ""

        for caractere in appel {
            switch caractere {
            case "(": parentheses += 1; jeton = ""; continue
            case ")": parentheses -= 1; jeton = ""; continue
            case "{": accolades += 1; jeton = ""; continue
            case "}": accolades -= 1; jeton = ""; continue
            case "[": crochets += 1; jeton = ""; continue
            case "]": crochets -= 1; jeton = ""; continue
            default: break
            }

            if caractere == ":" {
                if parentheses == 1, accolades == 0, crochets == 0, !jeton.isEmpty { libelles.append(jeton) }
                jeton = ""
            } else if caractere.isLetter || caractere.isNumber || caractere == "_" {
                jeton.append(caractere)
            } else {
                jeton = ""
            }
        }
        return libelles
    }

    /// La règle du compilateur, écrite une fois : les arguments POSÉS doivent
    /// apparaître dans l'ordre des paramètres DÉCLARÉS, en pouvant en sauter
    /// (un paramètre à défaut s'omet), jamais en les croisant.
    private func estSousSuite(_ poses: [String], de declares: [String]) -> Bool {
        var curseur = declares.startIndex
        for libelle in poses {
            guard curseur < declares.endIndex,
                  let trouve = declares[curseur...].firstIndex(of: libelle) else { return false }
            curseur = declares.index(after: trouve)
        }
        return true
    }

    /// **L'affordance de publication RÉELLE porte son état accessible.**
    ///
    /// Les quatre tests de `StatusComposerAccessibilityTests` mesuraient le
    /// bouton de `StatusComposerView`, que plus aucun site ne montait depuis le
    /// lot 4.6 : ils restaient verts sur un écran sans public. Le bouton que
    /// VoiceOver rencontre est celui-ci, et rien ne l'assérait — retirer
    /// `.accessibilityValue` et `.accessibilityHint` de `publishButton` n'aurait
    /// fait rougir aucune suite, pendant que le tableau restait vert.
    ///
    /// C'était le motif d'extinction silencieuse RETOURNÉ : la garde n'avait pas
    /// perdu sa cible, sa cible avait perdu son public. Le lot 4.8 a retiré
    /// l'écran et RE-VISÉ cette suite-là sur ce même bouton, où elle mesure
    /// désormais ce que celle-ci ne mesure pas : le NOM que la flèche garde
    /// pendant l'envoi.
    func test_laFlecheDuSocle_porteSonEtatAccessible() throws {
        guard let bloc = declarationBody(startingAt: "private var publishButton", in: try hostCode()) else {
            return XCTFail("La zone de publication du socle est introuvable — la garde ne mesurerait RIEN")
        }
        let compacte = compact(bloc)

        XCTAssertTrue(
            compacte.contains(compact(".accessibilityValue(")),
            "La flèche doit exposer son état EN VOL par `accessibilityValue` : son libellé ne change pas "
                + "pendant l'envoi, et sans valeur l'occupation n'est portée que par la teinte."
        )
        XCTAssertTrue(
            compacte.contains(compact("ComposerSocleCopy.publishInProgress")),
            "… et cette valeur passe par le catalogue (`a11y.status.publish.in-progress`) : un littéral posé "
                + "ici échapperait au cliquet de complétude et ne serait jamais traduit."
        )
        XCTAssertTrue(
            compacte.contains(compact(".accessibilityHint(publishBlockedHint)")),
            "La flèche doit dire POURQUOI elle refuse : sans indice, un mood sans emoji laisse un bouton grisé "
                + "sans raison énoncée — le défaut que l'écran historique avait corrigé."
        )
    }

    /// **La porte du tray n'atteint AUCUNE surface qui publie par le socle**, et
    /// c'est ce qui rend son `onPublishDocument: { _ in false }` honnête plutôt
    /// que dangereux.
    ///
    /// `.storyTray` ouvre sur `.cameraReady`, que `ComposerSurfaceRouting` route
    /// TOUJOURS vers la scène, quel que soit le format ensuite choisi. Le socle
    /// n'y est donc jamais peint. Le jour où cette ouverture changerait, ce refus
    /// deviendrait une flèche qui ne publie rien — en silence. Cette garde est le
    /// bruit qui manquerait alors.
    func test_laPorteDuTray_nAtteintAucuneSurfaceQuiPublieParLeSocle() {
        let profil = ComposerProfile.profile(for: .storyTray, compositionQualifiesAsReel: true)
        XCTAssertFalse(profil.offeredFormats.isEmpty, "Le tray offre au moins un format — sinon la boucle ne mesure rien.")

        for format in profil.offeredFormats {
            let surface = ComposerSurfaceRouting.surface(opening: profil.opensWith, format: format)
            XCTAssertEqual(
                surface, .scene,
                "Le tray atteint la surface \(surface) en \(format) : son `onPublishDocument` REFUSE, et cette "
                    + "flèche ne publierait donc rien. Lui donner un vrai publieur, ou re-router la porte."
            )
            XCTAssertTrue(
                ComposerChromeOwnership.socleZones(for: surface).isEmpty,
                "… et le socle y serait peint, ce qui ferait deux barres de publication sous l'atelier."
            )
        }
    }

    // MARK: - Aucune UI morte : rien à l'écran sans raison (loi 4)

    /// Spec §D du lot C. Une affordance montée puis désactivée est une promesse
    /// non tenue. La capture suit donc le profil : une porte qui la refuse ne
    /// voit pas l'outil grisé, elle ne le voit pas du tout.
    ///
    /// **Garde RE-VISÉE le 2026-08-24.** Elle cherchait `profile.allowsCapture`
    /// dans le FICHIER, du temps où le plateau peignait un pictogramme de
    /// caméra. Ce pictogramme n'était pas un `Button` — le tap ne faisait rien —
    /// et il est parti. Laissée telle quelle, la garde serait restée VERTE sur
    /// le seul lecteur survivant sans plus rien dire de la capture : le mode
    /// d'extinction silencieuse que ce fichier se donne pour mission de fuir.
    /// Elle nomme donc le bloc qui gouverne réellement la capture aujourd'hui,
    /// la rangée d'outils de la surface document.
    func test_host_gatesCaptureOnTheProfile() throws {
        guard let corps = declarationBody(startingAt: "private var documentSurface", in: try hostCode()) else {
            return XCTFail("La surface document doit être une propriété nommée `documentSurface` — la garde s'ancre dessus")
        }
        let compacte = compact(corps)

        XCTAssertTrue(compacte.contains(compact("ComposerDocumentSurface(")), "Le bloc lu n'est pas celui de la surface document.")
        XCTAssertTrue(
            compacte.contains(compact("allowsCapture: profile.allowsCapture")),
            "La rangée d'outils doit tenir sa capacité de capture DU PROFIL — sinon la politique la déciderait seule, et la table de C1 ne gouvernerait plus la capture."
        )
    }

    /// **Loi 4 sur le plateau.** Remplace `test_host_gatesSlidesAndTimelineOnTheProfile`,
    /// dont l'objet a disparu le 2026-08-24.
    ///
    /// Le plateau peignait trois `Image(systemName:)` — caméra, diapositives,
    /// timeline — gardées par `allowsCapture` / `showsSlides` / `showsTimeline`.
    /// Aucune n'était un `Button` : le tap ne faisait rien. L'ancienne garde
    /// vérifiait que ces trois pictogrammes suivaient le profil ; elle ne
    /// pouvait pas dire qu'ils MENAIENT quelque part, et elle est restée verte
    /// pendant que la porte de création montait le meuble en production.
    ///
    /// Les brancher aurait demandé une API neuve : `addSlide()`,
    /// `isTimelineVisible` et l'écriture de `currentEffects` sont `internal` à
    /// `MeeshyUI`, hors d'atteinte du meuble — et l'atelier offre déjà les
    /// trois (bande de diapositives, menu ⋯ → Timeline, fournisseur de
    /// capture). Elles sont donc ABSENTES, pas grisées.
    ///
    /// Ce que la garde mesure, et rien de plus : le plateau ne peint pas plus
    /// d'icônes ni de libellés d'accessibilité qu'il n'a de boutons pour les
    /// actionner. Elle rougirait si l'on recollait l'un des trois pictogrammes.
    func test_host_lePlateau_neMonteAucuneAffordanceInerte() throws {
        guard let corps = declarationBody(startingAt: "private var plateauTools", in: try hostCode()) else {
            return XCTFail("Le plateau doit être une propriété nommée `plateauTools` — la garde s'ancre dessus")
        }
        let compacte = compact(corps)

        // `formatChip`, pas `ComposerFormatFan(` : la CONSTRUCTION de l'éventail
        // a été extraite au 2026-08-27 (#4047) pour qu'UNE seule serve ses deux
        // places — la rangée du plateau et la barre haute du document. Le
        // plateau monte donc le chip, il ne le construit plus.
        XCTAssertTrue(compacte.contains(compact("formatChip")), "Le bloc lu n'est pas celui du plateau.")

        let boutons = occurrences(of: "Button", in: compacte)
        XCTAssertLessThanOrEqual(
            occurrences(of: compact("Image("), in: compacte), boutons,
            "Une icône du plateau sans bouton pour l'actionner est une affordance INERTE : loi 4 la veut absente, jamais peinte à vide."
        )
        XCTAssertLessThanOrEqual(
            occurrences(of: compact(".accessibilityLabel("), in: compacte), boutons,
            "Un libellé d'accessibilité hors bouton annonce à VoiceOver une commande que personne ne peut déclencher."
        )
    }

    /// C1 a posé `routesToLegacy` : une porte qui route vers un composer
    /// historique n'ouvre PAS le host. Le host doit honorer ce routage, sinon
    /// C1 devient une donnée que personne ne lit.
    func test_host_honoursTheLegacyRouting() throws {
        XCTAssertTrue(
            try hostCode().contains("routesToLegacy"),
            "Le host doit lire `routesToLegacy` — sans quoi la table de C1 ne gouverne rien"
        )
    }

    // MARK: - Lot 3 — la porte du fil passe par le meuble

    /// **Le LECTEUR, pas la table.** `ComposerIntent.routesToLegacy` vit dans ce
    /// fichier-ci (extension en bas de `MeeshyComposerHost.swift`), et c'est LUI
    /// que les portes de présentation interrogent pour décider si elles montent
    /// le meuble ou la feuille historique. Il ne se contente pas de relire la
    /// table : il lui passe `ComposerReelGate.withoutComposition`, une valeur
    /// qu'il choisit seul. Le jumeau côté table est
    /// `ComposerIntentTests.test_profile_feedComposer_estServiParLeMeuble_surSaSurfaceDocument`
    /// — et les deux sont nécessaires, parce qu'une table qui cesserait de
    /// router pendant que son lecteur, lui, continuerait de rendre une valeur
    /// laisserait la porte présenter la feuille en toute conformité.
    func test_lIntentionDuFil_ouvreLeMeuble_etNonSaFeuilleHistorique() {
        XCTAssertNil(
            ComposerIntent(origin: .feedComposer).routesToLegacy,
            "Lot 3 : la porte la plus utilisée de l'app cesse de router vers `FeedComposerSheet`. Tant que "
                + "ce lecteur rend une valeur, la porte présente la feuille et le meuble reste du code que "
                + "personne ne voit sur cette porte-là."
        )
    }

    /// La CHAÎNE complète, du point d'entrée à la surface, sans monter la
    /// moindre vue : la porte du fil atteint le meuble (`routesToLegacy == nil`),
    /// le meuble lui monte un DOCUMENT, et le clavier s'y lève d'emblée.
    ///
    /// Les trois maillons sont éprouvés ENSEMBLE parce qu'ils se protègent l'un
    /// l'autre. Le premier seul autoriserait un recâblage vers l'atelier de
    /// scène — un canvas de story là où l'auteur attend un champ de texte. Le
    /// deuxième seul est déjà vrai aujourd'hui et le restera quoi qu'il arrive,
    /// puisque `ComposerSurfaceRouting` est une fonction pure que personne
    /// n'appelle sur cette porte tant qu'elle route. Le troisième est la
    /// première des trois capacités que la spec v2 exige de cette surface
    /// (§E lot 2 : « clavier sur `content` ») — la seule que le meuble tienne de
    /// bout en bout.
    ///
    /// Ce qu'il ne dit PAS, et qui reste une dette CONSIGNÉE plutôt qu'un
    /// acquis : la surface ainsi montée ne sert qu'UN outil sur six, et ne porte
    /// pas l'éventail des formats. La rangée
    /// photo·caméra·emoji·document·lieu·micro n'est pas tenue par ce test.
    ///
    /// L'ENVOI DURABLE, lui, l'est depuis le lot 4.10 — `DocumentComposerDoor`,
    /// `ComposerDocumentSendPlan`, et la table qui a désormais un appelant,
    /// exactement un. Ce test ne le mesure pas davantage :
    /// `test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`
    /// est le seul à lier les trois capacités au câblage d'une porte.
    func test_leMeuble_monteLeDocument_pourLaPorteDuFil() {
        let intention = ComposerIntent(origin: .feedComposer)
        let profil = ComposerProfile.profile(
            for: intention.origin,
            compositionQualifiesAsReel: ComposerReelGate.withoutComposition
        )

        XCTAssertNil(
            intention.routesToLegacy,
            "Premier maillon : sans lui, les deux suivants décrivent une surface que personne n'atteint."
        )
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: profil.opensWith, format: profil.initialFormat),
            .document,
            "Le fil ouvre un texte et des pièces jointes, pas un canvas : le meuble doit lui monter la "
                + "surface DOCUMENT que le lot 2 a écrite."
        )
        XCTAssertTrue(
            ComposerSurfaceRouting.focusesContentOnAppear(opening: profil.opensWith),
            "Et le clavier s'y lève d'emblée — c'est la promesse que `keyboardOnContent` porte, et la "
                + "première des trois capacités que la spec v2 exige de cette surface."
        )
    }

    // MARK: - Lot 3 — la table désigne le meuble, la garde retient la PORTE

    /// Les portes que le meuble monte en DOCUMENT, et le littéral par lequel un
    /// site de production les construirait.
    ///
    /// Un tableau plutôt qu'une garde écrite sur `.feedComposer` : le jour où une
    /// seconde porte monte un document, elle entre ici et hérite de la même
    /// retenue sans qu'on réécrive quoi que ce soit.
    ///
    /// Le littéral porte `ComposerIntent(origin:` en entier, et ce n'est pas de
    /// la prudence gratuite : chercher le seul `.feedComposer` ferrerait TROIS
    /// sites de production qui n'ont rien à voir — `context: .feedComposer` est
    /// un cas de `PasteContext`, écrit tel quel dans `FeedView`,
    /// `FeedView+Attachments` et `RootViewComponents`. Le témoin
    /// `test_leDetecteurDePorteDocument_ferreLIntention_etPasLeContexteDeCollage`
    /// tient ce départage.
    private static let portesDocumentDuMeuble: [(nom: String, origine: ComposerOrigin, litteral: String)] = [
        (nom: "feedComposer", origine: .feedComposer, litteral: "ComposerIntent(origin: .feedComposer")
    ]

    /// **La garde que la bascule du lot 3 ARME.** Sans elle, la table de C1
    /// serait un piège tendu au lot suivant.
    ///
    /// Depuis ce lot, `ComposerIntent(origin: .feedComposer).routesToLegacy`
    /// rend `nil`, et le contrat gravé en bas de `MeeshyComposerHost.swift` dit
    /// ce que `nil` VEUT DIRE : « la porte ouvre `MeeshyComposerHost` ».
    /// Appliquer ce contrat est la seule chose que la table existe pour
    /// gouverner — un agent remplacera le booléen d'une porte de présentation
    /// par sa lecture, et montera le meuble.
    ///
    /// Ce qu'il obtenait au lot 3, mesuré sur la source : une croix, un
    /// `TextEditor`, AUCUNE rangée d'outils (`servedDocumentTools` rend `[]`),
    /// aucune issue pour le texte tapé, AUCUN bouton publier. La seule sortie
    /// était la croix, qui jette. C'est mot pour mot « la régression sèche » que
    /// la spec v2 §E interdit en conditionnant le lot 3 au lot 2, et aucune suite
    /// ne la voyait : les huit tests du lot certifient « le fil est servi par le
    /// meuble », les gardes négatives certifient « le meuble ne publie pas » —
    /// deux suites vertes, un produit impossible.
    ///
    /// **Le lot 4.5 en a levé DEUX des trois, et il faut le lire au mot près.**
    /// Le socle est peint sous le document (`ComposerChromeOwnership.owner(for:
    /// .document)` rend `.host`), sa flèche est un vrai `Button` gaté sur la
    /// matière, et le texte a une issue — `onPublishDocument`. Reste la première :
    /// la rangée d'outils. La garde n'a donc PAS perdu son objet ; elle en a
    /// perdu deux tiers, et c'est le tiers restant qui retient encore la porte.
    ///
    /// **Ce tiers a failli s'évaporer le 2026-08-24, et la façon dont il a failli
    /// vaut d'être écrite.** La rangée s'est mise à peindre — UN outil, l'emoji,
    /// le seul dont le résultat ait une destination. La condition mesurée ici
    /// était « `servedDocumentTools` ne rend pas `[]` » : un PROXY, choisi le jour
    /// où la seule question possible était « la rangée existe-t-elle ? ». Servir
    /// un outil l'aurait satisfaite EN ENTIER, et la garde aurait laissé passer
    /// le câblage de `.feedComposer` sur une surface qui perd encore
    /// photo·caméra·fichier·lieu·micro d'un coup, par rapport à la feuille
    /// qu'elle remplace.
    ///
    /// Le proxy est donc remplacé par la question qu'il représentait : la rangée
    /// SERVIE couvre-t-elle la rangée CANONIQUE — celle de la feuille historique,
    /// outil pour outil ? C'est cela, « ne pas régresser », et c'est ce qu'un
    /// booléen « au moins un » ne pouvait pas dire.
    ///
    /// Ce qu'elle retenait, donc : **la table peut désigner le meuble ; une
    /// porte de PRÉSENTATION ne peut pas le monter tant que le document est
    /// une impasse.** Elle était muette par construction — aucun site ne
    /// construisait cette intention — et c'était le jour du câblage qu'elle
    /// devait parler.
    ///
    /// **Ce jour est T3.1.** RootViewComponents construit désormais
    /// `ComposerIntent(origin: .feedComposer)` sur le PLEIN composer du fil,
    /// et `sitesDeProductionOuvrantUnePorteDocument()` n'est plus vide : la
    /// garde ARME les trois assertions qu'elle portait en silence, plutôt
    /// que de sortir tôt sur `guard !sites.isEmpty else { return }`. Ce
    /// qu'elle disait PAS avant : que les trois capacités soient tenues. Elle
    /// n'exigeait rien tant que personne ne montait la porte — et depuis
    /// T3.1 quelqu'un la monte, donc elle exige désormais les trois : la
    /// dette du lot 2 est SOLDÉE (les trois capacités sont vraies depuis le
    /// lot 4.10 / T2.6 / T2.2), et cette garde le certifie enfin plutôt que
    /// de se taire dessus.
    ///
    /// **Et elle ne couvre PAS le chemin de l'ÉVENTAIL — à savoir, à ne pas
    /// redécouvrir.** Elle filtre sur `portesDocumentDuMeuble`, c'est-à-dire sur
    /// des portes dont le `initialFormat` OUVRE un document. Depuis le lot 4.7,
    /// la republication d'un mood atteint la surface document par une BASCULE de
    /// format, sans jamais passer par ce filtre : un écran de production y monte
    /// donc une rangée incomplète, et cette garde ne bronche pas. Ce n'est pas
    /// un trou à combler ici — le préjudice y est nul, on ancre une humeur, pas
    /// une composition média — mais une phrase à garder : le fait de l'ancrage
    /// est tenu par
    /// `ComposerDocumentSurfaceTests.test_leRepostDUnMood_offreLAncrage_ET_unEcranLePeint`,
    /// et par lui SEUL. Croire cette garde-ci universelle est l'erreur qu'elle
    /// invite, et elle l'a déjà invitée une fois : la phrase avait été écrite,
    /// puis perdue dans une réécriture du doc-comment voisin.
    func test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse() throws {
        let portesDocument = portesDocumentServiesParLeMeuble()
        XCTAssertFalse(
            portesDocument.isEmpty,
            "Aucune des portes du tableau n'est plus un document servi par le meuble : la garde ne retient "
                + "plus RIEN. Si une porte a été délibérément reroutée vers un composer historique, c'est ce "
                + "tableau qu'il faut corriger — pas cette assertion qu'il faut retirer."
        )

        let sertLaRangee = try leMeubleSertLaRangeeDuDocument()
        let saisieAUneIssue = try laSaisieDuDocumentAUneIssue()
        let publieurAtteignable = try leDocumentAUnPublieurAtteignable()

        let sites = try sitesDeProductionOuvrantUnePorteDocument()
        XCTAssertTrue(
            sites.contains { $0.fichier == "RootViewComponents.swift" && $0.porte == "feedComposer" },
            "Depuis T3.1, RootViewComponents doit construire `ComposerIntent(origin: .feedComposer)` sur le "
                + "PLEIN composer du fil (`.fullScreenCover(isPresented: $showFullComposer)`) — c'est le "
                + "câblage qui arme les trois assertions suivantes. Sans ce site, cette garde restait MUETTE "
                + "(`guard !sites.isEmpty else { return }`) : elle ne certifiait plus rien sur la rangée, "
                + "l'issue du texte, ou le publieur — verte pour toujours, y compris le jour où le câblage "
                + "aurait régressé."
        )

        let ou = sites.map { "\($0.porte) dans \($0.fichier)" }.joined(separator: ", ")

        XCTAssertTrue(
            sertLaRangee,
            "\(ou) monte le meuble sur une surface document dont la rangée d'outils est INCOMPLÈTE : elle "
                + "sert \(ComposerDocumentTool.servedRow.map(\.rawValue)) là où la feuille absorbée en "
                + "offrait \(ComposerDocumentTool.canonicalRow.map(\.rawValue)). Ce qui manque, l'auteur le "
                + "perd d'un coup sur la porte la plus utilisée de l'app : c'est la deuxième capacité du DoD "
                + "du lot 2 (spec v2 §E). Un outil n'entre dans la rangée qu'en gagnant un "
                + "`ComposerDocumentTool.effect`, donc une destination réelle — jamais en étant peint inerte."
        )
        XCTAssertTrue(
            saisieAUneIssue,
            "\(ou) monte le meuble sur une surface document dont le texte n'a AUCUNE issue : `documentText` "
                + "n'est lu que par la liaison de la surface. Ce que l'auteur tape n'a nulle part où partir, et "
                + "la croix le jette. La troisième capacité du DoD du lot 2 — l'envoi durable offline — est "
                + "tenue depuis le lot 4.10 par `DocumentComposerDoor` ; cette assertion garde ce qui la "
                + "précède, l'issue même du texte."
        )
        XCTAssertTrue(
            publieurAtteignable,
            "\(ou) monte le meuble sur une surface document sans aucun publieur ATTEIGNABLE. Attention au "
                + "faux ami : `ComposerChromeOwner.atelier.hasPublisher(triggerIsArmed:)` rend `true` parce que "
                + "« la flèche de la rangée existe toujours » — cette phrase ne vaut que là où l'atelier est "
                + "MONTÉ, et il ne l'est pas sous le document. La seule flèche possible y est celle du socle, qui "
                + "n'est peint que si le chrome cède la publication, et qui doit alors être un BOUTON — le `Label` "
                + "témoin d'avant le lot 4.5 nommait la publication sans la déclencher."
        )
    }

    /// Le témoin du détecteur — sans lui, la garde ci-dessus serait une garde
    /// CONDITIONNELLE qui ne s'exécute jamais : verte pour toujours, y compris
    /// le jour où son littéral cesserait de ferrer quoi que ce soit.
    ///
    /// Il éprouve les deux sens. Ce qui DOIT être ferré : la construction de
    /// l'intention, y compris reformatée sur plusieurs lignes — le contournement
    /// par retour à la ligne que la revue du 2026-08-23 a relevé quatre fois
    /// dans ce fichier. Ce qui ne doit PAS l'être : `context: .feedComposer`, le
    /// cas homonyme de `PasteContext` que trois vues de production écrivent
    /// déjà, et une construction en COMMENTAIRE, qui ne monte rien.
    func test_leDetecteurDePorteDocument_ferreLIntention_etPasLeContexteDeCollage() {
        XCTAssertEqual(
            monteUnePorteDocument("let intention = ComposerIntent(origin: .feedComposer)"), ["feedComposer"],
            "Le détecteur ne ferre plus la construction qu'il cherche : la garde du lot 3 ne mesure RIEN."
        )
        XCTAssertEqual(
            monteUnePorteDocument("ComposerIntent(\n    origin: .feedComposer\n)"), ["feedComposer"],
            "Un retour à la ligne suffirait à contourner la garde — le mode d'extinction silencieuse propre "
                + "aux gardes négatives."
        )
        XCTAssertTrue(
            monteUnePorteDocument("PasteIntoComposer(context: .feedComposer)").isEmpty,
            "`context: .feedComposer` est un cas de `PasteContext` : le ferrer condamnerait trois vues de "
                + "production qui ne montent aucun composer."
        )
        XCTAssertTrue(
            monteUnePorteDocument("// ComposerIntent(origin: .feedComposer)").isEmpty,
            "Un commentaire ne monte aucune porte — et la source du meuble en NOMME une."
        )
        XCTAssertTrue(
            monteUnePorteDocument("ComposerIntent(origin: .storyTray)").isEmpty,
            "Le tray ouvre une SCÈNE : l'atelier du SDK y peint sa rangée, cette garde ne le concerne pas."
        )
    }

    /// Les portes du tableau que la table sert RÉELLEMENT en document. Calculé,
    /// jamais supposé : une porte reroutée vers un composer historique sort du
    /// périmètre de cette garde, et l'assertion d'ouverture le fait dire à voix
    /// haute au lieu de laisser la suite se vider en silence.
    private func portesDocumentServiesParLeMeuble() -> [String] {
        Self.portesDocumentDuMeuble
            .filter { porte in
                let profil = ComposerProfile.profile(for: porte.origine)
                guard profil.routesToLegacy == nil else { return false }
                return ComposerSurfaceRouting.surface(
                    opening: profil.opensWith,
                    format: profil.initialFormat
                ) == .document
            }
            .map { $0.nom }
    }

    /// Les portes-document qu'une source construit — commentaires retirés,
    /// blancs écrasés.
    private func monteUnePorteDocument(_ source: String) -> [String] {
        let compacte = compact(AppSourceGuard.stripComments(source))
        return Self.portesDocumentDuMeuble
            .filter { compacte.contains(compact($0.litteral)) }
            .map { $0.nom }
    }

    private func sitesDeProductionOuvrantUnePorteDocument() throws -> [(fichier: String, porte: String)] {
        try sourcesDeLApp().flatMap { url -> [(fichier: String, porte: String)] in
            let contenu = try String(contentsOf: url, encoding: .utf8)
            return monteUnePorteDocument(contenu).map { (fichier: url.lastPathComponent, porte: $0) }
        }
    }

    /// Ce que le meuble SERT au document, lu sur la forme littérale du vide.
    ///
    /// Ce qu'elle mesure exactement : `servedDocumentTools` rend un tableau vide
    /// ÉCRIT COMME TEL. Une rangée servie sous condition compterait pour servie,
    /// et c'est assumé — le jour où le meuble a une matière à servir, la
    /// question devient celle du câblage, pas celle de cette garde.
    private func leMeubleSertLaRangeeDuDocument() throws -> Bool {
        guard declarationBody(startingAt: "private var servedDocumentTools", in: try hostCode()) != nil else {
            XCTFail("`servedDocumentTools` est introuvable dans le meuble — la garde ne mesurerait RIEN")
            return true
        }
        return ComposerDocumentTool.servedRow == ComposerDocumentTool.canonicalRow
    }

    /// Le texte du document a-t-il une ISSUE ? Il en a une dès que quelqu'un le
    /// LIT ailleurs que la liaison qui le remplit.
    ///
    /// Deux occurrences aujourd'hui, commentaires retirés : la déclaration de
    /// l'état et le `text: $documentText` passé à la surface. Une troisième est
    /// forcément un lecteur — un envoi, un brouillon, un transfert vers
    /// l'atelier. Le compte est préféré à la recherche d'un symbole d'envoi
    /// nommé : la garde n'a pas à deviner PAR OÙ le texte partira.
    private func laSaisieDuDocumentAUneIssue() throws -> Bool {
        let code = try hostCode()
        guard compact(code).contains(compact("@State private var documentText")) else {
            XCTFail("L'état `documentText` est introuvable dans le meuble — la garde ne mesurerait RIEN")
            return true
        }
        return occurrences(of: "documentText", in: code) > 2
    }

    /// Y a-t-il quelqu'un pour publier SOUS LE DOCUMENT ?
    ///
    /// Deux conditions, et la première est un faux ami qu'il faut nommer :
    /// `hasPublisher(triggerIsArmed:)` rend `true` pour `.atelier` « parce que
    /// la flèche de la rangée existe toujours » — vrai là où l'atelier est
    /// monté, faux sous le document, que `MeeshyComposerHost.surface` monte
    /// SEUL. La seule flèche possible y est celle du socle, et le socle n'est
    /// peint que si le chrome lui cède la publication. Seconde condition : que
    /// cette zone DÉCLENCHE, au lieu de nommer la publication comme le fait le
    /// `Label` témoin d'aujourd'hui.
    ///
    /// Elle cherche une EXPRESSION `Button` (`Button{` ou `Button(`), jamais le
    /// mot : la propriété s'appelle `publishButton`, et compter le mot aurait
    /// rendu `true` sur le témoin inerte — une garde verte affirmant l'exact
    /// contraire de ce qu'elle mesure. Le piège a été pris à la simulation, pas
    /// au hasard, et il est consigné ici pour la prochaine ancre nommée d'après
    /// ce qu'elle cherche.
    private func leDocumentAUnPublieurAtteignable() throws -> Bool {
        let chrome = try chromeOwnerDeclareParLeMeuble()
        guard !chrome.assembles(.publish) else { return false }
        guard let bloc = declarationBody(startingAt: "private var publishButton", in: try hostCode()) else {
            XCTFail("La zone de publication du socle est introuvable — la garde ne mesurerait RIEN")
            return false
        }
        let corps = compact(bloc)
        return corps.contains("Button{") || corps.contains("Button(")
    }

    /// QUI peint le chrome SOUS LE DOCUMENT — la seule surface qui intéresse
    /// cette garde, puisque la porte qu'elle retient est une porte-document.
    ///
    /// **Elle lisait un LITTÉRAL, et le lot 4.5 le lui a retiré sous les pieds.**
    /// `chromeOwner` était `private let chromeOwner: ComposerChromeOwner = .atelier` ;
    /// il dérive désormais de la surface montée. Laissée en l'état, cette fonction
    /// aurait fait `XCTFail` — et elle est appelée AVANT le court-circuit
    /// `guard !sites.isEmpty` de sa garde : le test entier serait passé au ROUGE
    /// alors même qu'aucun site ne monte de porte-document. Un rouge pour la
    /// mauvaise raison est le pire des rouges, celui qu'on « corrige » en retirant
    /// l'assertion.
    ///
    /// Ce qu'elle mesure maintenant, et c'est PLUS fort qu'un littéral : d'abord
    /// que le meuble lise réellement la règle — sans quoi celle-ci serait une
    /// fiction que la garde interrogerait à vide —, puis ce que la règle rend pour
    /// le document. Le prédicat, lui, n'est toujours pas recopié : c'est celui du
    /// SDK qui tranche.
    private func chromeOwnerDeclareParLeMeuble() throws -> ComposerChromeOwner {
        let compacte = try hostCompact()
        guard compacte.contains(compact("ComposerChromeOwnership.owner(for: mountedSurface)")) else {
            XCTFail(
                "Le meuble ne dérive plus son chrome de la surface montée : `ComposerChromeOwnership` existe "
                    + "peut-être encore, mais plus personne ne la lit, et cette garde interrogerait une règle "
                    + "que le produit n'applique pas."
            )
            return .atelier
        }
        return ComposerChromeOwnership.owner(for: .document)
    }

    // MARK: - C3 — le host rend au cover ce que le cover donne

    /// **Le piège le plus cher de ce lot.** `StoryComposerView.init` donne à
    /// `initialVisibility` une valeur PAR DÉFAUT (`PostVisibility.friends`) :
    /// monter l'atelier sans le paramètre ne produit AUCUNE erreur de
    /// compilation, et la mémoire d'audience — la loi 10 — disparaît en
    /// silence. Le host la reçoit donc de sa porte et la transmet.
    ///
    /// Le jumeau de cette garde vit dans `AppInitWireupTests` : il vérifie que
    /// TOUT site de création passe le paramètre, ici comme dans le cover.
    func test_host_handsTheMemorisedAudienceToTheWorkshop() throws {
        let code = try hostCompact()
        XCTAssertTrue(
            code.contains(compact("initialVisibility: initialVisibility")),
            "Le host doit passer `initialVisibility` à l'atelier — le défaut du SDK avalerait la mémoire d'audience sans un mot"
        )
        XCTAssertTrue(
            code.contains(compact("let initialVisibility: String")),
            "L'audience d'ouverture est un paramètre OBLIGATOIRE du host : un défaut ici recréerait le même silence un cran plus haut"
        )
    }

    /// Sans adoption, le composer s'autosauvegarde sous un id NEUF et le
    /// brouillon repris reste intact à côté, en double. L'adoption doit se
    /// faire à la construction du ViewModel : l'atelier décide dès son premier
    /// passage s'il propose une reprise.
    func test_host_adoptsThePendingDraft_atViewModelConstruction() throws {
        let code = try hostCompact()
        XCTAssertTrue(
            code.contains(compact("adoptDraft(id:")),
            "Le host doit adopter le brouillon désigné par la porte — sinon la reprise se dédouble"
        )
        guard let adoption = code.range(of: compact("adoptDraft(id:")),
              let stateObject = code.range(of: compact("StateObject(wrappedValue:")) else {
            return XCTFail("L'adoption et la construction du @StateObject doivent être nommées dans le host")
        }
        XCTAssertTrue(
            adoption.lowerBound < stateObject.lowerBound,
            "L'adoption précède la construction du @StateObject — adopter après coup arrive trop tard pour l'offre de reprise"
        )
    }

    /// Les trois fournisseurs d'environnement restent app-side (MapKit,
    /// AVCaptureSession, PhotoKit). Un site de présentation qui les oublie fait
    /// disparaître la pastille « Lieu » et les amorces de page blanche — sans
    /// le moindre signal. `AppInitWireupTests` compte l'égalité
    /// injections == présentations fichier par fichier ; cette garde-ci nomme
    /// les trois pour que l'échec soit lisible depuis la suite du composer.
    ///
    /// Ils sont QUATRE depuis la vague 2 bis : `storyPasteProvided` est la
    /// quatrième, et son absence est exactement le défaut que la revue
    /// adversariale a nommé — `storyPasteProvided()` n'avait AUCUN appelant,
    /// donc `\.storyPaste` valait `nil` partout, donc la capsule « Coller » de
    /// l'atelier ne se peignait sur aucun écran. Tout ce qui pend dessous
    /// (`PasteIntoComposer`) était juste, testé, et inatteignable.
    ///
    /// Ils sont CINQ depuis V3-2, et le cinquième
    /// (`storyStickerLibraryProvided`) n'est pas un ajout : c'est celui que la
    /// porte de création posait elle-même jusqu'ici. Le jour où le cover a
    /// délégué au meuble, il est devenu la seule chose que le meuble pouvait
    /// perdre en route — et sa perte est muette (la bibliothèque de stickers
    /// disparaît de la sheet, le reste du composer fonctionne).
    func test_host_injectsTheFiveAppSideProviders() throws {
        let code = try hostCompact()
        for provider in [".storyLocationPickerProvided()",
                         ".storyCameraCaptureProvided()",
                         ".storyRecentCameraRollProvided()",
                         ".storyPasteProvided()",
                         ".storyStickerLibraryProvided()"] {
            XCTAssertTrue(
                code.contains(compact(provider)),
                "Le host doit injecter \(provider) sur l'atelier qu'il monte"
            )
        }
    }

    // MARK: - L'éventail (loi 4)

    /// **Garde RETOURNÉE le 2026-08-24 (V3-3).** Elle était négative — « le host
    /// ne monte PAS l'éventail » — et nommait deux conditions de levée. V1 a
    /// levé la première (l'offre VARIE, `ComposerReelGate` lisant la composition
    /// réelle), V2 la moitié de la seconde (changer de format change la surface
    /// montée), V3-3 l'autre moitié : le format commande désormais le `type`
    /// envoyé à `POST /posts`. L'ordre n'était pas négociable — monter
    /// l'éventail avant que l'envoi ne suive aurait offert un choix que la
    /// publication ignore, le pire des deux mondes puisqu'il aurait eu l'air de
    /// marcher.
    ///
    /// Elle n'a pas été supprimée : une garde retirée ne protège plus rien. Elle
    /// affirme maintenant l'invariant NEUF — le sélecteur est monté, et il est
    /// monté SOUS la règle de repli, la seule chose qui l'empêche de peindre un
    /// éventail dont aucun chip n'est marqué quand l'offre se referme.
    func test_host_mountsTheFan_underTheSelectionPolicy() throws {
        let code = try hostCompact()

        XCTAssertEqual(
            occurrences(of: compact("ComposerFormatFan("), in: code), 1,
            "Le host doit monter l'éventail, une fois — sans lui `offeredFormats` n'a toujours aucun lecteur."
        )
        XCTAssertEqual(
            occurrences(of: compact("ComposerFormatFanPolicy.resolvedSelection("), in: code), 1,
            "…et lire la règle de repli : une sélection restée sur un format retiré ne marquerait plus aucun chip."
        )
    }

    /// L'éventail est un outil du PLATEAU, pas du socle — et le plateau coiffe
    /// les TROIS surfaces depuis le lot 4.7, sous
    /// `ComposerFormatFanPlacement.mounts`. La phrase précédente disait « le
    /// plateau ne coiffe que la scène » : c'était l'état d'avant la descente de
    /// l'éventail, et la laisser aurait fait de ce fichier la source qui nie le
    /// produit qu'il garde.
    ///
    /// Garde ancrée sur le BLOC : `ComposerFormatFan` apparaît aussi dans les
    /// doc-comments de la source, et le socle est verrouillé par ailleurs sur
    /// ses trois zones.
    func test_host_lEventail_vitDansLePlateau_pasDansLeSocle() throws {
        guard let corps = declarationBody(startingAt: "private var plateauTools", in: try hostCode()) else {
            return XCTFail("Le plateau doit être une propriété nommée `plateauTools` — la garde s'ancre dessus")
        }
        let compacte = compact(corps)

        // Même raison qu'au-dessus (#4047) : le plateau MONTE le chip
        // (`formatChip`, site unique de construction), il ne le construit plus.
        // Ce que la garde protège — « l'éventail vit dans le plateau, pas dans
        // le socle » — est inchangé : le socle reste verrouillé sur ses zones.
        XCTAssertTrue(
            compacte.contains(compact("formatChip")),
            "L'éventail se peint dans le plateau, sur le flanc opposé aux outils de composition."
        )
        for interdit in [".disabled(", ".opacity("] {
            XCTAssertEqual(
                occurrences(of: compact(interdit), in: compacte), 0,
                "Loi 4 : un format non offert est ABSENT du plateau, jamais grisé ni rendu transparent."
            )
        }
    }

    // MARK: - B3 (#3926) — un seul sélecteur de mode : l'éventail

    /// **Le choix de mode RESPIRE avec la composition, via l'ÉVENTAIL (B3).**
    /// Le sélecteur de destination contextuel (F1) est RETIRÉ : c'est le gate du
    /// réel de l'éventail qui lit `documentComposesReel`, si bien que RÉEL est
    /// offert dès que le média du document qualifie — un seul contrôle, jamais
    /// deux surfaces de choix. La garde vérifie que l'ancien sélecteur a bien
    /// disparu ET que le gate respire sur la composition du document.
    func test_host_leChoixDeMode_respireViaLEventail_pasUnSelecteurSepare() throws {
        let code = try hostCompact()
        XCTAssertFalse(
            code.contains(compact("documentDestinationSelector")),
            "Le sélecteur de destination contextuel est retiré (B3) — l'éventail est le seul sélecteur de mode."
        )
        guard let corps = declarationBody(startingAt: "private var reelGate", in: try hostCode()) else {
            return XCTFail("`reelGate` doit être une propriété calculée — la garde s'ancre sur son bloc.")
        }
        XCTAssertTrue(
            compact(corps).contains(compact("documentComposesReel")),
            "Le gate du réel respire sur la composition du DOCUMENT : l'éventail offre RÉEL à temps pour basculer."
        )
    }

    /// **La qualification du meuble APPELLE la règle SDK, jamais un seuil
    /// recopié (T2.4, test 2).** Recopier « ≥ 3 s » ou « ≥ 2 images » ici
    /// ferait deux règles à faire diverger, dont l'une côté serveur
    /// (`ReelComposition.defaultType` juge l'envoi). La garde lit le BLOC du
    /// prédicat : il appelle `qualifiesAsReel` et ne contient aucune
    /// comparaison numérique recopiée.
    func test_host_laQualification_appelleLaRegleSDK_neRecopiePasLeSeuil() throws {
        guard let corps = declarationBody(startingAt: "private var documentComposesReel", in: try hostCode()) else {
            return XCTFail("`documentComposesReel` doit être une propriété calculée — la garde s'ancre sur son bloc.")
        }
        let compacte = compact(corps)
        XCTAssertTrue(
            compacte.contains(compact("ReelComposition.qualifiesAsReel(")),
            "Le gate doit APPELER la règle SDK, jamais la recopier."
        )
        for recopie in [">=", ">", "count", "3000", "3_000"] {
            XCTAssertFalse(
                compacte.contains(compact(recopie)),
                "Le bloc contient `\(recopie)` — un seuil recopié qui divergerait du juge serveur."
            )
        }
    }

    /// **L'offre RÉEL est SANS ÉTAT — donc rien à réarmer quand le média
    /// dé-qualifie (B3).** F1 portait un `documentDestination` STOCKÉ qu'il
    /// fallait remettre à `.reel` dès qu'une composition changeait, sans quoi un
    /// choix survivait, invisible, à la publication suivante. L'éventail n'a pas
    /// cet écueil : `reelGate` est une FONCTION PURE de la composition du moment,
    /// et `resolvedSelection` ramène toute sélection retirée au premier format
    /// offert. Il n'y a donc plus ni état de destination, ni reset à garder — et
    /// la garde le VÉRIFIE (l'état retiré ne doit pas revenir en silence).
    func test_host_lOffreReel_estSansEtat_rienARearmer() throws {
        let code = try hostCompact()
        XCTAssertFalse(
            code.contains(compact("documentDestination")),
            "Plus aucun état `documentDestination` (B3) : l'offre RÉEL est une fonction pure de la composition."
        )
        XCTAssertFalse(
            code.contains(compact("documentDestination = .reel")),
            "Plus de reset de destination : sans état stocké, il n'y a rien à réarmer."
        )
    }

    /// **UN seul sélecteur de mode, et c'est l'éventail (B3).** Le plateau porte
    /// l'éventail de FORMAT (`ComposerFormatFan`, gardé une fois ailleurs) ; il
    /// est désormais le SEUL contrôle de choix de mode — le sélecteur de
    /// destination contextuel a disparu de tout le meuble. Garde NÉGATIVE sur
    /// tout le fichier : deux surfaces de choix ne doivent pas renaître.
    func test_host_unSeulSelecteurDeMode_lEventail() throws {
        let code = try hostCompact()
        XCTAssertFalse(
            code.contains(compact("documentDestinationSelector")),
            "Le sélecteur de destination est retiré partout : l'éventail est le seul sélecteur de mode (B3)."
        )
        XCTAssertEqual(
            occurrences(of: compact("ComposerFormatFan("), in: code), 1,
            "L'éventail est monté à UN seul endroit — deux montages seraient deux sélecteurs pour un même format."
        )
    }

    /// **Resserrer l'audience hors PUBLIC réarme l'opt-in de découvrabilité
    /// (T2.5, parité VIE PRIVÉE).** Le consentement de trouvabilité porte sur
    /// UNE publication ET UNE audience. Sans ce reset, un opt-in armé en PUBLIC
    /// survivrait à un resserrement (`friends`) puis à un ré-élargissement vers
    /// PUBLIC : le contrôle réapparaîtrait DÉJÀ ON et publierait sur un
    /// consentement PÉRIMÉ que personne n'a réexaminé. Le composer inline de
    /// référence (`FeedView+Attachments`) fait ce reset pour cette raison ; le
    /// même fichier l'applique déjà à `forcePlainPost` (T2.4). Constat de revue
    /// Opus T2.5. Garde ancrée sur le bloc de `chooseAudience`.
    func test_host_resserrerLAudienceHorsPublic_reArmeLaDecouvrabilite() throws {
        guard let corps = declarationBody(startingAt: "private func chooseAudience", in: try hostCode()) else {
            return XCTFail("`chooseAudience` doit être une fonction — la garde s'ancre sur son bloc.")
        }
        XCTAssertTrue(
            compact(corps).contains(compact("if candidate != .public { documentDiscoverability.reset() }")),
            "Quitter PUBLIC doit réarmer l'opt-in — un consentement de trouvabilité périmé ne survit pas au resserrement."
        )
    }

    /// Ce que l'éventail RÉSOUT doit gouverner l'envoi, pas seulement le chip
    /// marqué. Sans cette ligne, choisir « Post » repeignait l'éventail et
    /// publiait une story — exactement le défaut que le retournement ci-dessus
    /// aurait autorisé.
    func test_host_donneLeFormatResolu_aLAtelierQuiPublie() throws {
        let code = try hostCompact()

        XCTAssertTrue(
            code.contains(compact("publishTargetType: selectedFormat.postType")),
            "L'atelier doit publier sous le format RÉSOLU — et par le pont existant `ComposerFormat.postType`."
        )
        XCTAssertTrue(
            code.contains(compact("format: selectedFormat")),
            "…et la surface montée doit suivre le même format résolu, pas le champ brut."
        )
    }

    // MARK: - Gardes NÉGATIVES : un seul chemin de publication, un seul gate réel

    /// Le host ne publie pas. `publishAllSlides()` du SDK flush la timeline
    /// ouverte, rabat les effets du canvas courant sur la diapositive
    /// (`handoffSlides`) et lit la visibilité tenue par l'atelier — tout cela
    /// dans l'état privé de `StoryComposerView`. Reconstituer ce paquet
    /// app-side enverrait un document que personne n'a rabattu, et doublerait
    /// une file que V7 doit unifier.
    ///
    /// Garde NÉGATIVE : elle rougit à la RÉINTRODUCTION de l'un de ces appels
    /// dans le host, pas à la disparition d'un fichier —
    /// `test_theGuardsReadANonEmptySource` en répond.
    func test_host_opensNoSecondPublicationPath() throws {
        let code = try hostCode()
        for forbidden in ["onPublishAllInBackground(",
                         "publishStoryInBackground(",
                         "updateStoryInBackground(",
                         "PostService",
                         "StoryPublishService"] {
            XCTAssertFalse(
                code.contains(forbidden),
                "Le host appelle « \(forbidden) » : c'est un SECOND chemin de publication. Le seul publieur est la barre du SDK."
            )
        }
    }

    /// Le gate du réel était écrit DEUX fois en dur (`compositionQualifiesAsReel: false`,
    /// aux deux seuls sites de production qui construisent un profil). V1 doit
    /// avoir UN endroit à brancher : deux littéraux jumeaux se corrigent à
    /// moitié, et le plateau offrirait alors un réel que le routage ignore.
    func test_host_hasASingleReelGate_notTwinHardcodedLiterals() throws {
        let code = try hostCompact()
        XCTAssertEqual(
            occurrences(of: compact("compositionQualifiesAsReel: false"), in: code), 0,
            "Le gate du réel ne se réécrit pas en dur : il passe par `ComposerReelGate`, le seul point que V1 aura à brancher"
        )
        XCTAssertGreaterThanOrEqual(
            occurrences(of: "ComposerReelGate.compositionQualifiesAsReel", in: code), 2,
            "Les deux constructions de profil du host lisent le MÊME gate"
        )
    }

    /// Garde NÉGATIVE de V1 — le gate ne redevient pas une CONSTANTE.
    ///
    /// Il en fut une (`static let compositionQualifiesAsReel = false`), et
    /// c'est ce qui rendait l'éventail muet : la table de C1 était gatée dans
    /// ses deux exemplaires, et le gate ne disait jamais oui. La reprise la
    /// plus probable est de le refiger « le temps de » — d'où cette garde, qui
    /// rougit à la réintroduction du `static let`.
    func test_host_reelGate_nEstPlusUneConstante() throws {
        let code = try hostCompact()
        XCTAssertFalse(
            code.contains(compact("static let compositionQualifiesAsReel")),
            "Le gate du réel est redevenu une constante : l'éventail ne respire plus."
        )
        XCTAssertTrue(
            code.contains(compact("ReelComposition.qualifiesAsReel(")),
            "Le gate doit passer par `ReelComposition` — écrire la règle une seconde fois côté app "
                + "la ferait diverger du gateway et du web sans qu'aucun test ne le dise."
        )
    }

    /// Le gate lit la COMPOSITION, pas une valeur posée à la construction.
    /// Un gate figé à l'ouverture n'offrirait jamais le réel : la caméra du
    /// tray s'ouvre sur une page blanche, et la composition arrive après.
    func test_host_reelGate_litLaCompositionCourante() throws {
        let code = try hostCompact()
        XCTAssertTrue(
            code.contains(compact("ComposerReelGate.compositionQualifiesAsReel(viewModel.currentEffects)")),
            "Le profil du host doit être recalculé sur la composition du moment."
        )
    }

    // MARK: - V2 — le meuble a DEUX surfaces

    /// Le host doit savoir CHOISIR sa surface, et par la règle partagée : une
    /// condition écrite dans le `body` serait invisible aux tests, et c'est
    /// exactement comme cela qu'une règle produit se met à exister en deux
    /// exemplaires.
    func test_host_choisitSaSurface_parLaRegleEprouvable() throws {
        let code = try hostCode()
        XCTAssertTrue(
            code.contains("ComposerSurfaceRouting.surface("),
            "Le choix de surface passe par `ComposerSurfaceRouting` — la règle est éprouvée là, une seule fois."
        )
        XCTAssertTrue(
            code.contains("ComposerDocumentSurface("),
            "Le meuble monte la surface document — sans elle, recâbler `.feedComposer` serait une régression."
        )
        XCTAssertTrue(
            code.contains("StoryComposerView("),
            "… et il garde l'atelier du SDK pour la scène."
        )
    }

    /// La surface document ne monte pas le plateau **ELLE-MÊME** — un seul site
    /// de montage, et il est dans le `body`.
    ///
    /// **Le NOM et la raison de cette garde ont changé le 2026-08-25, son
    /// assertion non.** Elle s'appelait `…_neCoiffePasLeDocument` et disait « le
    /// plateau outille la scène » : depuis que l'éventail descend (lot 4.7), le
    /// plateau COIFFE les trois surfaces, document compris, sous
    /// `ComposerFormatFanPlacement.mounts`. Le test restait vert parce qu'il est
    /// ancré sur le BLOC `documentSurface`, qui n'a jamais monté le plateau —
    /// c'est-à-dire qu'il gardait toujours son objet en ayant perdu sa phrase.
    /// Une garde dont le nom affirme l'inverse du produit est la loi que lira la
    /// session suivante, et celle-ci lui aurait fait croire que le chip « Post »
    /// n'atteint aucun écran.
    ///
    /// Ce qu'elle mesure, et qui vaut toujours : le montage du plateau reste
    /// UNIQUE. Un second, posé dans une surface, échapperait à la règle de
    /// placement et peindrait deux sélecteurs sur le même écran. Le compte
    /// d'occurrences (`plateauTools == 2`, dans `ComposerDocumentSurfaceTests`)
    /// en est le verrou ; celle-ci nomme le site interdit le plus tentant.
    func test_host_laSurfaceDocument_neMontePasELLE_MEME_lePlateau() throws {
        guard let corps = declarationBody(startingAt: "private var documentSurface", in: try hostCode()) else {
            return XCTFail("La surface document doit être une propriété nommée `documentSurface` — la garde s'ancre dessus")
        }

        XCTAssertTrue(corps.contains("ComposerDocumentSurface("), "Le bloc lu n'est pas celui de la surface document.")
        XCTAssertFalse(
            corps.contains("plateauTools"),
            "La surface document monte le plateau elle-même : un SECOND site de montage, qui échapperait à "
                + "`ComposerFormatFanPlacement` et peindrait deux sélecteurs sur le même écran."
        )
    }

    /// **LA SORTIE** — le correctif bloquant de la vague 2 bis.
    ///
    /// `onDismiss` n'était atteignable que sous la SCÈNE, où l'atelier du SDK
    /// le reçoit et peint la croix. Le document n'a pas d'atelier : la surface
    /// était un écran SANS ISSUE, et V3 devait la brancher sur `.feedComposer`,
    /// la porte la plus utilisée de l'app. On aurait livré le cul-de-sac à
    /// l'endroit le plus fréquenté.
    ///
    /// Garde ancrée sur le BLOC `documentSurface` — `onDismiss` apparaît aussi
    /// dans la propriété du host, dans son `init` et sous la scène : une garde
    /// de FICHIER aurait été verte sans que le document reçoive quoi que ce
    /// soit. Elle compte un symbole nommé plutôt que le littéral
    /// `onClose: onDismiss`, qu'un retour à la ligne suffirait à contourner.
    func test_host_donneSaSortie_aLaSurfaceDocument() throws {
        guard let corps = declarationBody(startingAt: "private var documentSurface", in: try hostCode()) else {
            return XCTFail("La surface document doit être une propriété nommée `documentSurface` — la garde s'ancre dessus")
        }
        let compacte = compact(corps)

        XCTAssertTrue(compacte.contains(compact("ComposerDocumentSurface(")), "Le bloc lu n'est pas celui de la surface document.")
        XCTAssertTrue(
            compacte.contains("onClose"),
            "La surface document doit recevoir une fermeture — sans elle, c'est un écran dont on ne sort pas."
        )
        XCTAssertTrue(
            compacte.contains("onDismiss"),
            "Et cette fermeture est celle du MEUBLE (`onDismiss`), pas une seconde sortie fabriquée sur place."
        )
    }

    /// Garde NÉGATIVE — l'interdit de publication, ÉTENDU au bloc de la surface
    /// document.
    ///
    /// `test_host_opensNoSecondPublicationPath` couvre le fichier entier ;
    /// celle-ci nomme le bloc, parce que c'est là que la tentation naîtra :
    /// une surface de texte avec un bouton « Publier » est le raccourci évident
    /// pour recâbler `.feedComposer`, et c'est exactement le second chemin
    /// d'envoi que la doctrine, C2 et V7 interdisent tous les trois. Elle
    /// rougirait sur des symboles que la garde de fichier ne connaît pas
    /// (`documentText`, le rappel de publication du host).
    func test_host_laSurfaceDocument_nOuvreAucunCheminDePublication() throws {
        guard let corps = declarationBody(startingAt: "private var documentSurface", in: try hostCode()) else {
            return XCTFail("La surface document doit être une propriété nommée `documentSurface` — la garde s'ancre dessus")
        }
        let compacte = compact(corps)

        for interdit in ["onPublishAllInBackground", "ComposerDocumentSendRouting", "PostService",
                         "StoryPublishService", "TusUploadManager", "OutboxFlusher", "APIClient"] {
            XCTAssertFalse(
                compacte.contains(compact(interdit)),
                "La surface document touche « \(interdit) » : c'est le SECOND chemin de publication."
            )
        }
    }

    /// Ancre une garde sur un BLOC et non sur le fichier : `plateauTools` vit
    /// toujours dans cette source, sous l'AUTRE surface, et une garde de
    /// fichier condamnerait la scène en croyant protéger le document. Coupe à
    /// l'accolade fermante appariée du premier bloc rencontré. `nil` quand
    /// l'ancre a disparu — l'appelant fait alors rougir, jamais passer.
    private func declarationBody(startingAt anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var body = ""
        for character in code[start.lowerBound...] {
            body.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return body }
            }
        }
        return nil
    }

    /// Elle fut une garde NÉGATIVE : « rien ne réaffecte `currentFormat` », née
    /// de ce que `ComposerIntent` avait promis pendant deux révisions — « le
    /// host rebascule au format du document une fois celui-ci chargé » — sans
    /// qu'aucun écrivain n'existe. Un commentaire qui énonce un invariant que le
    /// code ne tient pas devient la loi que lira la session suivante, celle qui
    /// aurait monté `.draft` en confiance.
    ///
    /// **Garde RETOURNÉE le 2026-08-24 (V3-3)**, à la condition de levée qu'elle
    /// nommait elle-même : « le jour où le host sait réaffecter `currentFormat`
    /// — par l'éventail ». Cet écrivain est l'éventail, et lui seul.
    ///
    /// Elle affirme désormais qu'il y a EXACTEMENT UN écrivain. Deux seraient
    /// deux sources pour le même champ ; zéro ramènerait l'éventail à un décor.
    ///
    /// Ce qu'elle ne dit TOUJOURS PAS : le host ne rebascule pas au format d'un
    /// brouillon chargé. Cet écrivain-là n'existe pas davantage qu'hier, et la
    /// rév. 5 de `ComposerIntent` reste écrite au futur — la conséquence est
    /// tenue par `ComposerSurfaceRouting`, qui fait de `.resume` une SCÈNE quel
    /// que soit le format.
    func test_host_neReaffecteLeFormatCourant_queParLEventail() throws {
        let code = try hostCompact()

        let affectations = occurrences(of: "currentFormat=", in: code)
            - occurrences(of: "_currentFormat=", in: code)

        XCTAssertTrue(
            code.contains("_currentFormat=State(initialValue:"),
            "Le format courant doit être initialisé une fois, à la construction — la garde ne mesurerait rien sinon."
        )
        XCTAssertEqual(
            affectations, 1,
            "Le champ doit avoir EXACTEMENT un écrivain : la liaison que le host donne à l'éventail. "
                + "Zéro le rendrait décoratif, deux en feraient deux sources."
        )
        XCTAssertTrue(
            code.contains(compact("Binding(get: { self.selectedFormat }, set: { self.currentFormat = $0 })")),
            "L'écriture va au champ brut, la LECTURE passe par la règle de repli — l'inverse peindrait "
                + "un éventail sans chip marqué dès que l'offre se referme."
        )
    }

    // MARK: - V1 — ce que le gate lit vraiment de la composition

    private func effets(
        media: [StoryMediaObject] = [],
        audio: [StoryAudioPlayerObject] = []
    ) -> StoryEffects {
        StoryEffects(mediaObjects: media, audioPlayerObjects: audio)
    }

    private func image() -> StoryMediaObject {
        StoryMediaObject(kind: .image, aspectRatio: 1)
    }

    private func video(nativeSeconds: Double?, timelineSeconds: Double? = nil) -> StoryMediaObject {
        StoryMediaObject(kind: .video, aspectRatio: 1,
                         intrinsicDuration: nativeSeconds, duration: timelineSeconds)
    }

    func test_gate_uneCompositionVide_neQualifiePas() {
        XCTAssertFalse(ComposerReelGate.compositionQualifiesAsReel(StoryEffects()))
        XCTAssertFalse(
            ComposerReelGate.withoutComposition,
            "La lecture neutre du gate EST celle de la composition vide, pas un `false` recopié."
        )
    }

    func test_gate_uneImageSeule_neQualifiePas() {
        XCTAssertFalse(
            ComposerReelGate.compositionQualifiesAsReel(effets(media: [image()])),
            "Règle produit : une image seule reste un post de base."
        )
    }

    func test_gate_deuxImages_qualifient() {
        XCTAssertTrue(ComposerReelGate.compositionQualifiesAsReel(effets(media: [image(), image()])))
    }

    func test_gate_uneVideoAssezLongue_qualifie() {
        XCTAssertTrue(ComposerReelGate.compositionQualifiesAsReel(effets(media: [video(nativeSeconds: 3)])))
    }

    func test_gate_uneVideoTropCourte_neQualifiePas() {
        XCTAssertFalse(ComposerReelGate.compositionQualifiesAsReel(effets(media: [video(nativeSeconds: 2.9)])))
    }

    /// Une durée inconnue n'est pas une durée courte, mais elle ne qualifie
    /// pas non plus : le prédicat partagé refuse de deviner, et le gate ne
    /// devine pas à sa place.
    func test_gate_uneVideoSansDuree_neQualifiePas() {
        XCTAssertFalse(ComposerReelGate.compositionQualifiesAsReel(effets(media: [video(nativeSeconds: nil)])))
    }

    /// La durée qui compte est celle du FICHIER, pas celle du clip sur la
    /// timeline : c'est le média téléversé que le serveur jugera. Un clip de
    /// 10 s ramené à 1 s reste une vidéo de 10 s à ses yeux — lire la durée de
    /// lecture aurait fait diverger le client du gateway sur la même
    /// composition.
    func test_gate_prefereLaDureeNative_aLaDureeDeLecture() {
        XCTAssertTrue(
            ComposerReelGate.compositionQualifiesAsReel(
                effets(media: [video(nativeSeconds: 10, timelineSeconds: 1)])
            )
        )
    }

    func test_gate_uneVideoSansDureeNative_retombeSurSaDureeDeLecture() {
        XCTAssertTrue(
            ComposerReelGate.compositionQualifiesAsReel(
                effets(media: [video(nativeSeconds: nil, timelineSeconds: 4)])
            )
        )
    }

    func test_gate_unAudioAssezLong_qualifie() {
        XCTAssertTrue(
            ComposerReelGate.compositionQualifiesAsReel(effets(audio: [StoryAudioPlayerObject(duration: 5)]))
        )
    }

    func test_gate_unAudioTropCourt_neQualifiePas() {
        XCTAssertFalse(
            ComposerReelGate.compositionQualifiesAsReel(effets(audio: [StoryAudioPlayerObject(duration: 1)]))
        )
    }

    /// Un type de média que le SDK ne connaît pas (`kind` nil — compat avant
    /// d'un futur type d'API) est IGNORÉ, jamais compté comme image. Le
    /// compter aurait fabriqué des réels que le gateway aurait refusés.
    func test_gate_unMediaDeTypeInconnu_estIgnore() {
        var inconnu = image()
        inconnu.mediaType = "hologramme"

        XCTAssertFalse(
            ComposerReelGate.compositionQualifiesAsReel(effets(media: [inconnu, image()])),
            "Un objet de type inconnu ne complète pas la paire d'images."
        )
    }

    /// La projection ne juge rien elle-même : elle ne fait que traduire les
    /// objets d'une diapositive dans le vocabulaire du prédicat partagé. Ce
    /// test la lit directement pour que sa forme reste vérifiable même si le
    /// prédicat, lui, évolue.
    func test_projection_traduitLesObjetsDansLeVocabulaireDuPredicat() {
        let kinds = ComposerReelGate.mediaKinds(of: effets(
            media: [image(), video(nativeSeconds: 2)],
            audio: [StoryAudioPlayerObject(duration: 3)]
        ))

        XCTAssertEqual(kinds.map { $0.kind }, [.image, .video, .audio])
        XCTAssertEqual(kinds.map { $0.durationMs }, [nil, 2000, 3000])
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    // MARK: - Aucun commentaire n'aveugle les gardes de source

    /// Les fichiers de l'app qui portaient DÉJÀ le défaut avant que cette garde
    /// existe. Ils sont nommés plutôt que masqués : la garde interdit d'en
    /// AJOUTER un, elle ne prétend pas que la dette est réglée.
    ///
    /// Les décoincer un par un est un chantier à part, et il n'est pas anodin —
    /// des gardes qui lisent ces fichiers peuvent passer au vert AUJOURD'HUI
    /// parce qu'elles sont aveugles, et redeviendraient rouges en recouvrant la
    /// vue. C'est précisément pour cela que le retrait ne se fait pas ici, en
    /// passant.
    private static let cecitePreexistante: Set<String> = [
        "StoryViewModel.swift",
        "MessageAccessibilityLabelComposer.swift",
        "ComposerDropResolver.swift",
        "LentilleFocusCard.swift",
    ]

    /// Un commentaire ne doit JAMAIS pouvoir rendre un fichier invisible aux
    /// gardes de source.
    ///
    /// Le dépouilleur de `MyStoriesSourceCorpus` traite la séquence
    /// barre-oblique-astérisque comme l'ouverture d'un commentaire de bloc, où
    /// qu'elle se trouve — y compris à l'intérieur d'un `///`. Or les
    /// commentaires de ce dépôt citent volontiers des globs de chemins et des
    /// types MIME. Une telle citation ouvre un bloc que rien ne referme, et
    /// **tout le reste du fichier disparaît** pour toute garde qui le lit.
    ///
    /// Ce n'est pas une hypothèse : le 2026-08-24, un doc-comment du meuble
    /// citant le glob du dossier `Composer` a fait tomber
    /// `MeeshyComposerHost.swift` de 959 lignes lues à 221. Les gardes bâties
    /// dessus ont cessé de mesurer quoi que ce soit, et **une seule a rougi** —
    /// `StoryTrayWiringGuardTests`, parce qu'elle cherchait une ligne située
    /// après la coupure. Les autres sont passées au vert en ayant perdu leur
    /// objet : le mode d'extinction silencieuse que ce dépôt paie ailleurs.
    ///
    /// La garde ne COMPTE pas les séquences — le comptage brut ment dans les
    /// deux sens, mesuré sur cet arbre : `NowPlayingArtwork` porte une fermeture
    /// orpheline (dans « accessQueue ») qui n'aveugle rien, et
    /// `LentilleModeLabels` ouvre sur un glob puis referme par accident sur un
    /// autre, sept lignes plus bas. Elle REJOUE la machine à états du
    /// dépouilleur et ne retient qu'une chose : a-t-il atteint la fin du fichier
    /// en étant resté DANS un bloc ? C'est le cas catastrophique — celui qui
    /// aveugle tout le reste du fichier.
    func test_aucuneSourceDeLApp_nOuvreUnCommentaireDeBlocQueRienNeReferme() throws {
        // Composées à l'exécution : les écrire en littéral ici poserait
        // exactement le piège que cette garde interdit ailleurs.
        let ouvrante = "/" + "*"
        let fermante = "*" + "/"

        func resteDansUnBloc(_ code: String) -> Bool {
            var dansUnBloc = false
            for brute in code.components(separatedBy: .newlines) {
                var ligne = brute
                if dansUnBloc {
                    guard let fin = ligne.range(of: fermante) else { continue }
                    ligne = String(ligne[fin.upperBound...])
                    dansUnBloc = false
                }
                while let debut = ligne.range(of: ouvrante) {
                    if let fin = ligne.range(of: fermante, range: debut.upperBound..<ligne.endIndex) {
                        ligne = String(ligne[..<debut.lowerBound]) + String(ligne[fin.upperBound...])
                    } else {
                        dansUnBloc = true
                        break
                    }
                }
            }
            return dansUnBloc
        }

        let coupables: [String] = sourcesDeLApp()
            .filter { !Self.cecitePreexistante.contains($0.lastPathComponent) }
            .compactMap { url in
                guard let code = try? String(contentsOf: url, encoding: .utf8) else { return nil }
                guard resteDansUnBloc(code) else { return nil }
                return url.lastPathComponent
            }

        XCTAssertEqual(
            coupables, [],
            """
            Un commentaire y ouvre un bloc que rien ne referme : tout le fichier \
            après ce point devient INVISIBLE aux gardes de source, qui passeront \
            au vert sans plus rien mesurer. Écris le chemin en toutes lettres \
            (« le dossier Composer ») plutôt que sous sa forme abrégée avec un \
            astérisque, ou coupe la séquence.
            """
        )
    }

    // MARK: - La rangée d'outils : servie, câblée, et d'un seul geste

    /// **Loi 4, côté MONTAGE.** La règle pure dit qu'un outil servi a un effet
    /// (`ComposerDocumentTool.effect`, éprouvée dans
    /// `ComposerDocumentSurfaceTests`). Elle ne dit rien de ce que le meuble en
    /// fait : il pouvait servir la rangée et ne pas brancher `onTool`, ce qui
    /// aurait peint une icône dont le tap ne déclenche RIEN — l'affordance sans
    /// effet, arrivée par l'autre bout.
    ///
    /// Deux faits, donc, qu'aucune valeur ne peut dire : la surface reçoit un
    /// `onTool`, et ce que ce rappel déclenche existe.
    func test_leMeuble_cableLaRangeeQuIlSert_sansQuoiLIconeSeraitInerte() throws {
        guard let surface = declarationBody(startingAt: "private var documentSurface", in: try hostCode()) else {
            return XCTFail("`documentSurface` est introuvable dans le meuble — la garde ne mesurerait RIEN.")
        }
        XCTAssertTrue(
            compact(surface).contains("onTool:"),
            "Le meuble sert une rangée d'outils sans brancher `onTool` : chaque icône peinte serait un "
                + "bouton dont le tap ne fait rien (loi 4)."
        )
        XCTAssertNotNil(
            declarationBody(startingAt: "private func handleDocumentTool", in: try hostCode()),
            "Le rappel `onTool` ne mène à aucun geste nommé dans le meuble."
        )
    }

    /// La liste servie est une PROJECTION de la règle, jamais une seconde
    /// liste écrite ici. Le jour où un outil gagnera son chemin, il suffira de
    /// lui donner un `effect` ; une énumération recopiée dans le meuble aurait
    /// exigé de penser aux DEUX endroits, et le second est celui qu'on oublie.
    func test_laListeServie_projetteLaRegle_elleNeLaRecopiePas() throws {
        guard let bloc = declarationBody(startingAt: "private var servedDocumentTools", in: try hostCode()) else {
            return XCTFail("`servedDocumentTools` est introuvable — la garde ne mesurerait RIEN.")
        }
        let corps = compact(bloc)
        XCTAssertTrue(
            corps.contains("ComposerDocumentTool.servedRow"),
            "Le meuble n'énumère pas les outils : il sert ce que la règle déclare servi."
        )
        for outilEcritEnDur in [".photo", ".camera", ".emoji", ".document", ".place", ".microphone"] {
            XCTAssertFalse(
                corps.contains(outilEcritEnDur),
                "Un outil (« \(outilEcritEnDur) ») est écrit en dur dans le meuble : c'est une seconde liste, "
                    + "et elle divergera de `ComposerDocumentTool.effect` sans que rien ne le dise."
            )
        }
    }

    /// **Ce que l'emoji ÉCRIT, et où.** Le seul effet servi aujourd'hui insère
    /// dans `documentText` — l'état que le brouillon emporte — et surtout PAS
    /// dans `moodEmoji`, qui est la matière DÉFINISSANTE d'un mood
    /// (`ComposerMoodPolicy.canPublish`). Les deux sont des emojis, ils vivent
    /// à trois lignes l'un de l'autre dans ce fichier, et les confondre
    /// changerait l'emoji du mood chaque fois que l'auteur en glisse un dans sa
    /// phrase.
    func test_lEmojiInsere_ecritDansLeTexte_jamaisDansLEmojiDuMood() throws {
        let code = try hostCode()
        guard let bloc = declarationBody(startingAt: "private var emojiPickerSheet", in: code) else {
            return XCTFail("Le sélecteur d'emoji du meuble est introuvable — la garde ne mesurerait RIEN.")
        }
        let corps = compact(bloc)
        XCTAssertTrue(
            corps.contains("documentText+="),
            "Le sélecteur d'emoji n'écrit pas dans le texte composé : son résultat n'a nulle part où aller."
        )
        XCTAssertFalse(
            corps.contains("moodEmoji"),
            "Le sélecteur d'emoji touche `moodEmoji` : insérer un emoji dans une phrase changerait l'emoji "
                + "DÉFINISSANT du mood, et donc ce que le gate de matière autorise à publier."
        )
    }

    /// Garde NÉGATIVE — le meuble réutilise le sélecteur d'emoji du dépôt, il
    /// n'en fabrique pas un second. `EmojiPickerSheet` tourne déjà en
    /// production (le fil le monte, `composerText += emoji`) : une seconde
    /// grille ici serait deux listes d'emojis, deux mémoires de récents et deux
    /// jeux de catégories à faire diverger — le motif exact que la surface du
    /// mood a refusé pour `StatusViewModel.moodOptions`.
    func test_leMeuble_neFabriquePasUneSecondeGrilleDEmojis() throws {
        let code = try hostCode()
        XCTAssertTrue(
            code.contains("EmojiPickerSheet("),
            "Le meuble doit monter le sélecteur du dépôt — sinon cette garde ne mesurerait rien."
        )
        for interdit in ["EmojiGridCategory", "LazyVGrid", "emojiOptions", "\"😀\", \"😃\""] {
            XCTAssertFalse(
                code.contains(interdit),
                "Le meuble fabrique sa propre grille d'emojis (« \(interdit) ») : la seconde liste est le "
                    + "défaut, pas le composant."
            )
        }
    }

    // MARK: - La langue déclarée (T2.2)

    /// Garde NÉGATIVE — même raison que le sélecteur d'emoji juste au-dessus :
    /// `AudioLanguagePickerView` tourne déjà en production sous la feuille
    /// historique (`FeedComposerSheet`), avec ses catégories, sa recherche et
    /// son bouton « afficher toutes les langues ». Un second sélecteur ici
    /// serait deux listes de langues et deux mémoires à faire diverger — et le
    /// meuble n'a besoin d'aucune liste propre : `AudioLanguagePickerView` lit
    /// `EdgeTranscriptionService.shared` lui-même.
    func test_leMeuble_neFabriquePasUnSecondSelecteurDeLangue() throws {
        let code = try hostCode()
        XCTAssertEqual(
            occurrences(of: "AudioLanguagePickerView(", in: code), 1,
            "Le meuble doit monter le sélecteur du dépôt UNE fois — sinon cette garde ne mesurerait rien, "
                + "ou il en fabrique un second."
        )
        for interdit in ["LanguageOption(", "supportedLocales:", "availableLocales:", "[\"fr\", \"en\""] {
            XCTAssertFalse(
                code.contains(interdit),
                "Le meuble déclare sa propre liste de langues (« \(interdit) ») : deux listes de langues "
                    + "sont deux mémoires à faire diverger — le motif que la porte interdit."
            )
        }
    }

    /// **Le canal, pas seulement le contrôle.** La capsule et le sélecteur
    /// prouvent que l'auteur PEUT écrire une langue ; cette garde prouve que ce
    /// qu'il écrit ATTEINT le brouillon envoyé à la porte. Sans elle, `code`
    /// contenait déjà le mot `originalLanguage` (le littéral `nil` qu'il
    /// remplace le porte aussi) : une garde qui ne chercherait que la présence
    /// du mot serait passée au vert avant comme après ce lot.
    func test_leBrouillonDuDocument_porteLaLangueDeclareeParLaCapsule_pasUnLitteral() throws {
        guard let bloc = declarationBody(startingAt: "private var documentDraft", in: try hostCode()) else {
            return XCTFail("`documentDraft` est introuvable dans le meuble — la garde ne mesurerait RIEN.")
        }
        let corps = compact(bloc)
        XCTAssertTrue(
            corps.contains(compact("originalLanguage: documentLanguage")),
            "Le cas `.document` de `documentDraft` doit poser `originalLanguage: documentLanguage` — l'état "
                + "que la capsule écrit, pas un littéral qui l'ignorerait."
        )
        XCTAssertFalse(
            corps.contains(compact("originalLanguage: nil")),
            "Le cas `.document` pose encore `originalLanguage: nil` : la langue déclarée par l'auteur "
                + "n'atteint jamais le brouillon envoyé à la porte."
        )
    }
}
