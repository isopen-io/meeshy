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
    func test_host_injectsTheFourAppSideProviders() throws {
        let code = try hostCompact()
        for provider in [".storyLocationPickerProvided()",
                         ".storyCameraCaptureProvided()",
                         ".storyRecentCameraRollProvided()",
                         ".storyPasteProvided()"] {
            XCTAssertTrue(
                code.contains(compact(provider)),
                "Le host doit injecter \(provider) sur l'atelier qu'il monte"
            )
        }
    }

    // MARK: - L'éventail (loi 4)

    /// Garde NÉGATIVE, et son sens est l'inverse de ce qu'on attendrait.
    ///
    /// `ComposerFormatFan` est écrit et testé, mais le host ne le monte PAS,
    /// et ce n'est pas un oubli : un sélecteur sans conséquence est l'UI morte
    /// que ce chantier retire partout ailleurs.
    ///
    /// **État de ses deux conditions de levée, mesuré au 2026-08-23.** V1 a levé
    /// la première : l'offre VARIE désormais, `ComposerReelGate` lisant la
    /// composition réelle. V2 a levé la MOITIÉ de la seconde : changer de
    /// format change la surface montée (`ComposerSurfaceRouting`). L'autre
    /// moitié manque encore — changer de format ne change pas ce qui est
    /// PUBLIÉ, le socle nommant la publication sans la piloter et le seul
    /// publieur restant la barre du SDK. Monter l'éventail maintenant offrirait
    /// donc un choix que l'envoi ignore : pire que rien, puisqu'il aurait l'air
    /// de marcher.
    ///
    /// Elle rougit à la RÉINTRODUCTION du montage. Quand la moitié restante
    /// tiendra, ce test se RETOURNE — il ne se supprime pas.
    func test_host_doesNotMountTheFan_whileTheOfferCannotVary() throws {
        let code = try hostCode()
        XCTAssertFalse(
            code.contains("ComposerFormatFan("),
            "L'éventail ne se monte pas tant qu'il n'a aucune conséquence — cf. V1 + V2/V3"
        )
        XCTAssertFalse(
            code.contains("ComposerFormatFanPolicy."),
            "… et sa politique de sélection n'a pas de lecteur non plus tant qu'il n'est pas monté"
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

    /// Garde NÉGATIVE — **l'écrivain que le commentaire promettait n'existe
    /// pas**, et tant qu'il n'existe pas, personne ne doit pouvoir écrire qu'il
    /// existe.
    ///
    /// `ComposerIntent` a promis pendant deux révisions que « le host rebascule
    /// au format du document une fois celui-ci chargé » : c'est ce qui rendait
    /// sûr, en apparence, le `.post` TRANSITOIRE de `.draft`/`.share`. Rien ne
    /// réaffecte `currentFormat` après la construction du host — un commentaire
    /// qui énonce un invariant que le code ne tient pas devient la loi que lira
    /// la session suivante, celle qui aurait monté `.draft` en confiance.
    ///
    /// La conséquence est désormais tenue ailleurs, par `ComposerSurfaceRouting`
    /// (une reprise monte l'atelier, quel que soit le format). **Condition de
    /// levée nommée** : le jour où le host sait réaffecter `currentFormat` — par
    /// l'éventail, ou par le chargement d'un brouillon — ce test se RETOURNE, et
    /// la rév. 5 de `ComposerIntent` redevient écrivable au présent.
    func test_host_neReaffectePasLeFormatCourant_tantQueLEcrivainNExistePas() throws {
        let code = try hostCompact()

        let affectations = occurrences(of: "currentFormat=", in: code)
            - occurrences(of: "_currentFormat=", in: code)

        XCTAssertTrue(
            code.contains("_currentFormat=State(initialValue:"),
            "Le format courant doit être initialisé une fois, à la construction — la garde ne mesurerait rien sinon."
        )
        XCTAssertEqual(
            affectations, 0,
            "Le host réaffecte `currentFormat` : l'écrivain existe enfin. Retourner ce test et réécrire la rév. 5 "
                + "de `ComposerIntent` au présent — ne pas le supprimer."
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
