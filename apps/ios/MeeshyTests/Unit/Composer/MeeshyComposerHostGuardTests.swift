import XCTest
import MeeshySDK
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
            .filter { $0.lastPathComponent != "MeeshyComposerHost.swift" }

        XCTAssertGreaterThan(sources.count, 50, "Trop peu de sources balayées — le chemin de l'arbre app est faux")

        return try sources
            .filter { AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8)).contains("MeeshyComposerHost(") }
            .map { $0.lastPathComponent }
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
    func test_host_previewIsThePlayer_inPreviewMode() throws {
        let code = try hostCode()
        XCTAssertTrue(code.contains("MeeshyScenePlayer("), "L'œil du socle doit être `MeeshyScenePlayer`, jamais un aperçu maison")
        XCTAssertTrue(code.contains(".preview"), "Le lecteur de l'aperçu tourne en mode `.preview`")
    }

    // MARK: - Le socle ne bouge JAMAIS

    /// Loi 5 de la doctrine (P1). Le socle est le point fixe du composer : ses
    /// trois zones sont toujours là, dans le même ordre, quelle que soit
    /// l'origine. Un socle qui se réorganise selon la porte redevient une
    /// barre d'outils contextuelle — exactement ce que ce chantier retire.
    func test_socle_keepsItsThreeZones_inOrder() throws {
        let code = try hostCompact()
        guard let audience = code.range(of: "audienceChip"),
              let preview = code.range(of: "previewEye"),
              let publish = code.range(of: "publishButton") else {
            return XCTFail("Les trois zones du socle doivent être nommées : audienceChip, previewEye, publishButton")
        }
        XCTAssertTrue(audience.lowerBound < preview.lowerBound, "L'audience précède l'œil")
        XCTAssertTrue(preview.lowerBound < publish.lowerBound, "L'œil précède la publication")
    }

    /// Garde NÉGATIVE — la plus fragile, et la plus importante. Le socle ne peut
    /// pas être retiré conditionnellement : `.hidden()` ou un `if` qui l'entoure
    /// le feraient disparaître pour une porte donnée, ce que la loi 5 interdit.
    func test_socle_isNeverHiddenNorConditionallyRemoved() throws {
        guard let socleBody = declarationBody(startingAt: "private var socle", in: try hostCode()) else {
            return XCTFail("Le socle doit être une propriété nommée `socle` — la garde s'ancre dessus")
        }
        let compacte = compact(socleBody)

        XCTAssertTrue(compacte.contains("audienceChip"), "Le bloc lu n'est pas celui du socle — la garde ne mesurerait RIEN")
        XCTAssertFalse(compacte.contains(compact(".hidden()")), "Le socle ne se cache jamais (loi 5 — le socle ne bouge pas)")
        XCTAssertFalse(compacte.contains(compact("if profile")), "Le socle ne se retire pas selon le profil")
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

    // MARK: - Aucune UI morte : les capacités suivent le PROFIL

    /// Spec §D du lot C. Une affordance montée puis désactivée est une promesse
    /// non tenue (loi 4 — « rien à l'écran sans raison »). Le chemin de capture
    /// n'est donc pas monté du tout quand le profil le refuse — pas grisé,
    /// ABSENT.
    func test_host_gatesCaptureOnTheProfile() throws {
        let code = try hostCode()
        XCTAssertTrue(
            code.contains("profile.allowsCapture"),
            "Le chemin capture doit être conditionné à `profile.allowsCapture`, pas monté puis désactivé"
        )
    }

    func test_host_gatesSlidesAndTimelineOnTheProfile() throws {
        let code = try hostCode()
        XCTAssertTrue(code.contains("profile.showsSlides"), "Les diapositives suivent le profil")
        XCTAssertTrue(code.contains("profile.showsTimeline"), "La timeline suit le profil")
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

    /// L'éventail est un outil du PLATEAU, pas du socle — et le plateau ne
    /// coiffe que la scène. Garde ancrée sur le BLOC : `ComposerFormatFan`
    /// apparaît aussi dans les doc-comments de la source, et le socle est
    /// verrouillé par ailleurs sur ses trois zones.
    func test_host_lEventail_vitDansLePlateau_pasDansLeSocle() throws {
        guard let corps = declarationBody(startingAt: "private var plateauTools", in: try hostCode()) else {
            return XCTFail("Le plateau doit être une propriété nommée `plateauTools` — la garde s'ancre dessus")
        }
        let compacte = compact(corps)

        XCTAssertTrue(
            compacte.contains(compact("ComposerFormatFan(")),
            "L'éventail se peint dans le plateau, sur le flanc opposé aux outils de composition."
        )
        for interdit in [".disabled(", ".opacity("] {
            XCTAssertEqual(
                occurrences(of: compact(interdit), in: compacte), 0,
                "Loi 4 : un format non offert est ABSENT du plateau, jamais grisé ni rendu transparent."
            )
        }
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

    /// La surface document ne porte PAS le plateau d'outils : `plateauTools`
    /// outille une scène (diapositives, timeline) et un document n'en a
    /// aucune. Garde ancrée sur le BLOC, pas sur le fichier — le plateau vit
    /// toujours dans la source, sous l'autre surface.
    func test_host_lePlateauDOutils_neCoiffePasLeDocument() throws {
        guard let corps = declarationBody(startingAt: "private var documentSurface", in: try hostCode()) else {
            return XCTFail("La surface document doit être une propriété nommée `documentSurface` — la garde s'ancre dessus")
        }

        XCTAssertTrue(corps.contains("ComposerDocumentSurface("), "Le bloc lu n'est pas celui de la surface document.")
        XCTAssertFalse(
            corps.contains("plateauTools"),
            "Le plateau outille la scène ; le poser sur un document promettrait des pages qu'il n'a pas."
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
}
