import XCTest
// `StoryTextObject` / `StoryTextStyle` sont des modèles du SDK : les nommer
// plutôt que compter sur la visibilité transitive de `@testable import Meeshy`,
// qui casse au premier renommage.
import MeeshySDK
@testable import Meeshy

/// #4064 — **la rangée d'outils cesse d'être permanente, et le socle ne bouge
/// jamais.**
///
/// Ces deux moitiés ne sont pas la même phrase, et la planche insiste pour
/// qu'on l'écrive :
///
///   > « Ce qui devient conditionnel est la RANGÉE D'OUTILS, pas le socle — et
///   > il faut l'écrire ainsi, sinon le premier lot qui "libère le bas"
///   > emportera l'audience avec les outils. »
///
/// D'où la répartition des témoins ci-dessous : ceux de la RÈGLE gardent qu'une
/// bande n'apparaît que servie ; ceux de la SOURCE gardent que le socle, lui,
/// ne dépend d'aucune bande.
final class ComposerSceneBandTests: XCTestCase {

    // MARK: - La règle : au repos, le bas ne porte que le socle

    /// Le cœur de l'issue. Aucune demande ⇒ aucune bande.
    func test_auRepos_leBasNePorteQueLeSocle() {
        XCTAssertNil(ComposerSceneBand.opened(nil, served: [.palette]))
        XCTAssertNil(ComposerSceneBand.opened(nil, served: Set(ComposerSceneBand.allCases)))
    }

    /// Une bande DEMANDÉE mais non servie est absente — loi 4, appliquée à une
    /// bande. Sans ce refus, un contexte demandé avant d'avoir son contenu
    /// peindrait une bande vide sur les ≈ 170 pt que l'encastrement libère,
    /// ce que le critère de fin de l'issue interdit nommément.
    ///
    /// **Le témoin s'écrit sur un jeu servi VIDE depuis le 2026-09-05.** Il
    /// éprouvait `.timeline` et `.textStyles` contre un jeu qui ne portait que
    /// `.palette` ; les deux cas ont quitté le TYPE avec la directive qui vide
    /// la première vue de ses éditions, et il ne reste qu'un cas — donc plus
    /// aucune paire (servie, demandée) qui diffère. La loi, elle, ne dépend
    /// d'aucun cas particulier : c'est l'APPARTENANCE au jeu qui décide.
    func test_uneBandeNonServie_estAbsente() {
        for demandee in ComposerSceneBand.allCases {
            XCTAssertNil(ComposerSceneBand.opened(demandee, served: []),
                         "`\(demandee.rawValue)` n'est pas servie : elle ne doit RIEN peindre.")
        }
    }

    func test_uneBandeServie_ouvre() {
        XCTAssertEqual(ComposerSceneBand.opened(.palette, served: [.palette]), .palette)
    }

    /// **Le jeu SERVI vide est le cas nominal d'une surface sans bande**, pas
    /// un cas dégénéré : trois des quatre vues du meuble n'en ont aucune.
    func test_aucuneBandeServie_ferme_tout() {
        for demandee in ComposerSceneBand.allCases {
            XCTAssertNil(ComposerSceneBand.opened(demandee, served: []))
        }
    }

    /// La liste est FERMÉE, et le CRITÈRE la gouverne — un axe horizontal, ou
    /// une comparaison latérale. Ce témoin rougit dès qu'un contexte s'y glisse
    /// sans que ce critère ait été rediscuté.
    ///
    /// **Elle est passée de trois à UNE le 2026-09-05.** `drawing` en était
    /// déjà ressorti (ses réglages sont le contrôleur FLOTTANT de l'atelier,
    /// pas une bande) ; `timeline` et `textStyles` en sortent parce qu'elles
    /// ÉDITAIENT un objet déjà posé, et que la première vue n'édite plus
    /// (`ComposerFirstView`). Elles vivent dans l'éditeur plein écran, aux
    /// sections `.media(.trim)` et `.tool(.style)`.
    ///
    /// > **Le critère n'a pas changé, l'APPARTENANCE si.** Les deux bandes
    /// > satisfaisaient bien « un axe horizontal / une comparaison latérale » —
    /// > et c'est justement ce qui les rendait défendables sur cet écran. Ce
    /// > qui les en sort est une seconde question, que le critère ne posait
    /// > pas : **sur QUOI ce contrôle agit-il ?** Un critère de FORME ne peut
    /// > pas répondre à une question de PORTÉE.
    func test_lesContextes_sontCeuxDeLaPlanche() {
        XCTAssertEqual(Set(ComposerSceneBand.allCases.map(\.rawValue)), ["palette"])
    }

    // MARK: - Le `⋯` rouvre la palette là où la rangée d'outils a disparu

    /// Le défaut que #4064 corrige, dit par la règle : sans rangée d'outils, la
    /// palette n'avait PLUS de chemin — on pouvait retirer le fond, jamais en
    /// changer.
    func test_sansRangeeDOutils_leMenuOffreLaPalette() {
        let servies = ComposerOverflowPolicy.entries(
            hasBackground: true, hasMedia: false, hasText: false, hasLocation: false,
            backgroundPickerIsReachable: false)
        XCTAssertEqual(servies.first, .pickBackground)
        XCTAssertTrue(servies.contains(.removeBackground),
                      "Poser et retirer le même attribut se lisent au même endroit.")
    }

    /// Et l'inverse, qui compte autant : là où la rangée d'outils porte déjà
    /// l'icône de fond, le menu ne DOUBLE pas le contrôle.
    func test_avecRangeeDOutils_leMenuNeDoublePasLaPalette() {
        let servies = ComposerOverflowPolicy.entries(
            hasBackground: true, hasMedia: false, hasText: false, hasLocation: false,
            backgroundPickerIsReachable: true)
        XCTAssertFalse(servies.contains(.pickBackground))
    }

    /// **Le défaut du paramètre est le défaut SÛR.** Un appelant qui l'ignore
    /// n'obtient jamais deux contrôles pour un attribut — au pire une entrée
    /// manquante, que l'écran offre ailleurs.
    func test_leDefautDuParametre_neDoublonneJamais() {
        let servies = ComposerOverflowPolicy.entries(
            hasBackground: true, hasMedia: true, hasText: true, hasLocation: true)
        XCTAssertFalse(servies.contains(.pickBackground))
    }

    /// La palette s'offre même sans fond POSÉ : c'est elle qui en pose un. La
    /// lier à `hasBackground` aurait rendu la scène issue d'un MÉDIA
    /// définitivement sans palette.
    func test_laPalette_neDependPasDUnFondDejaPose() {
        let servies = ComposerOverflowPolicy.entries(
            hasBackground: false, hasMedia: true, hasText: false, hasLocation: false,
            backgroundPickerIsReachable: false)
        XCTAssertTrue(servies.contains(.pickBackground))
        XCTAssertFalse(servies.contains(.removeBackground),
                       "Rien à retirer tant que rien n'est posé.")
    }

    // MARK: - Les sources

    private func source(_ fichier: String) throws -> String {
        // **Le meuble est DÉCOUPÉ (#4102) : son adresse est l'UNITÉ.** Lire le
        // seul fichier principal rendrait vertes, en silence, toutes les gardes
        // négatives dont l'interdit a suivi une extension.
        if fichier == "MeeshyComposerHost.swift" {
            return AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        }
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(fichier)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

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

    /// **Le fusible.** Sans lui, les gardes NÉGATIVES qui suivent passeraient au
    /// vert sur une chaîne vide le jour où un chemin change.
    func test_lesSources_sontLisiblesEtNonVides() throws {
        XCTAssertGreaterThan(try source("MeeshyComposerHost.swift").count, 20_000)
        XCTAssertGreaterThan(try source("ComposerSceneSurface.swift").count, 1_500)
        XCTAssertTrue(try source("ComposerSceneBand.swift").contains("enum ComposerSceneBand"))
    }

    /// **LA garde de la seconde moitié de #4064.** Le socle cède à l'atelier —
    /// jamais à une bande, un outil ou un contexte. La formulation de l'issue
    /// est là pour ça : « le premier lot qui libère le bas emportera l'audience
    /// avec les outils », et l'audience est la seule erreur IRRÉVERSIBLE d'une
    /// publication.
    ///
    /// **Repointée le 2026-09-05, et elle était ROUGE depuis le 2026-09-04.**
    /// Elle lisait `var body: some View` ; `68c6f98bec` a extrait la pile —
    /// plateau, surface, socle — dans `composerStack` pour que le viseur puisse
    /// l'ENVELOPPER, et le `body` ne monte plus que cette propriété. La garde
    /// cherchait donc le socle dans un bloc qui ne le contient plus, et son
    /// premier `XCTAssertTrue` — le fusible censé dire « le bloc lu n'est pas
    /// le bon » — tombait à chaque passe.
    ///
    /// > Le fusible a fait EXACTEMENT son travail : il a dit que la garde ne
    /// > mesurait plus rien. Ce qui a manqué est en aval — un rouge permanent
    /// > cesse d'être un signal, et celui-ci a survécu à un jour de lots sur ce
    /// > fichier. C'est le mode d'extinction propre aux gardes qui suivent une
    /// > déclaration par son NOM : l'extraction est le geste le plus courant de
    /// > ce dépôt (budget de 1200 lignes), et le nom change à chaque fois.
    func test_leSocle_neCedeJamaisAUneBande() throws {
        let code = try source("MeeshyComposerHost.swift")
        guard let corps = declarationBody(startingAt: "var composerStack: some View", in: code) else {
            return XCTFail("`composerStack` est introuvable — la garde doit être re-pointée, "
                             + "comme elle l'a été le 2026-09-05 quand la pile a quitté le `body`")
        }
        let compacte = compact(corps)

        XCTAssertTrue(compacte.contains("socle"),
                      "Le bloc lu n'est pas celui de la pile — la garde ne mesurerait RIEN")
        // Complétée au 2026-08-28 (`&& !paintedSocleZones.isEmpty`, elle aussi
        // une RÈGLE lue — `ComposerChromeOwnership.socleZones` — jamais un `if`
        // sur une bande, un outil ou un contexte) : le mood a cédé sa flèche à
        // son propre en-tête, et sans cette clause le socle peindrait une
        // `HStack` vide en dessous. Toujours PAS une bande — la garde négative
        // ci-dessous continue de le vérifier.
        XCTAssertTrue(
            compacte.contains(compact("if !chromeOwner.assembles(.publish) && !paintedSocleZones.isEmpty { socle }")),
            "Le socle est monté par la seule PROPRIÉTÉ DU CHROME (et ses zones), sur une seule ligne lisible."
        )
        // Et la bande n'apparaît PAS dans cette pile : elle est passée à la
        // surface de scène, dans une propriété à part. Un identifiant de bande
        // ici voudrait dire qu'une condition de bande a été écrite au niveau
        // où vit le socle — le geste exact que l'issue interdit.
        for interdit in ["ComposerSceneBand", "requestedSceneBand", "toolRow"] {
            XCTAssertFalse(compacte.contains(interdit),
                           "`\(interdit)` est écrit au niveau du socle : la loi 5 est rouverte.")
        }
    }

    /// **La bande vit DANS la surface, et c'est la garantie STRUCTURELLE.** Le
    /// socle est un frère de la surface au meuble : une bande montée à
    /// l'intérieur rétrécit le canvas et ne peut pas déplacer le socle. La loi 5
    /// n'a donc pas besoin d'être promise par une animation — elle tombe de
    /// l'assemblage, et ce témoin garde l'assemblage.
    func test_laBande_estMonteeDansLaSurface_jamaisSousElle() throws {
        XCTAssertTrue(compact(try source("ComposerSceneSurface.swift"))
            .contains("ComposerSceneBandView("),
                      "La bande se monte dans la surface de scène.")
        XCTAssertFalse(compact(try source("MeeshyComposerHost.swift"))
            .contains("ComposerSceneBandView("),
                      "Montée au meuble, la bande deviendrait un frère du socle — et le socle bougerait.")
    }

    /// Aucune animation sur l'insertion : `StoryCanvasUIView` reconstruit ses
    /// layers à chaque `layoutSubviews`, donc animer la hauteur ferait varier la
    /// frame du canvas sur chaque image du ressort — la tempête perf que la
    /// zone d'inspecteur du document documente déjà.
    func test_laBande_neSInsereParAucuneAnimation() throws {
        let code = try source("ComposerSceneSurface.swift")
        guard let corps = declarationBody(startingAt: "var body: some View", in: code) else {
            return XCTFail("Le `body` de la surface de scène est introuvable")
        }
        let compacte = compact(corps)
        XCTAssertTrue(compacte.contains("ComposerSceneBandView("),
                      "Le bloc lu n'est pas celui du body — la garde ne mesurerait RIEN")
        for interdit in [".transition(", "withAnimation", ".animation("] {
            XCTAssertFalse(compacte.contains(compact(interdit)),
                           "`\(interdit)` dans le body de la scène ferait varier la frame du canvas.")
        }
    }
}

/// **La bande de fond porte les DEUX rangées du panneau « Fond »** (#4403).
///
/// Le panneau de l'atelier fait 236 pt et son commentaire dit ce qu'il
/// contient : « couleurs + rangée Ouverture ». La bande du plateau ne portait
/// que les couleurs — l'effet d'ouverture d'une scène y était inatteignable.
///
/// **Le manque ne se voyait pas en composant**, et c'est ce qui l'a laissé
/// passer : un effet d'ouverture ne se joue qu'à la LECTURE. Une absence dont
/// le symptôme n'apparaît pas sur l'écran qui la contient est la plus difficile
/// à remarquer — d'où une garde de source plutôt qu'un œil.
final class ComposerSceneBandOpeningRowGuardTests: XCTestCase {

    private func bandSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSceneBand.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.**
    func test_laSourceDeLaBande_estLisible() throws {
        let s = try bandSource()
        XCTAssertGreaterThan(s.count, 800)
        XCTAssertTrue(s.contains("struct ComposerSceneBandView"))
    }

    /// **La rangée est EMPRUNTÉE au SDK, jamais recopiée.** Un corps, deux
    /// montages — règle du #4035. Une seconde rangée écrite ici aurait divergé
    /// du panneau de l'atelier au premier effet ajouté.
    func test_laRangee_estCelleDuSDK() throws {
        let source = compact(try bandSource())
        // **La signature n'est PAS épinglée au mot près.** Elle l'était, et le
        // correctif de contraste (`onDarkSurface:`) l'a fait rougir — une garde
        // qui pin une liste d'arguments rougit à chaque paramètre ajouté, y
        // compris quand l'ajout est le correctif. On garde ce qui compte : la
        // vue vient du SDK, et elle reçoit la sélection et le rappel de l'hôte.
        XCTAssertTrue(source.contains("OpeningEffectChips(selection:openingEffect,"))
        XCTAssertTrue(source.contains("onSelect:onPickOpening)"))
        XCTAssertFalse(source.contains("StoryTransitionEffect.allCases"),
                       "Énumérer les effets ICI ferait une seconde liste à faire diverger.")
    }

    /// **Loi 4 — la rangée n'est montée que si l'hôte la SERT.** Sans le
    /// rappel, choisir un effet ne mènerait nulle part.
    func test_laRangee_nExistePasSansSonRappel() throws {
        let source = compact(try bandSource())
        XCTAssertTrue(source.contains("ifletonPickOpening{"))
    }

    /// Le meuble lit ET écrit le réglage — un choix qui n'atteint pas le modèle
    /// est un contrôle inerte.
    func test_leMeuble_litEtEcritLeReglage() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("bandOpeningEffect:viewModel.openingEffect"))
        XCTAssertTrue(source.contains("viewModel.openingEffect=effect"))
    }

    /// **La bande NE se referme PAS sur un effet d'ouverture**, à la différence
    /// de la couleur : une couleur se voit sur la scène dès qu'elle est posée,
    /// un effet ne se joue qu'à la lecture. Refermer laisserait l'auteur sans
    /// aucun retour sur ce qu'il vient de choisir.
    func test_choisirUnEffet_neRefermePasLaBande() throws {
        let source = compact(try hostSource())
        XCTAssertTrue(source.contains("onPickBandOpening:{effectinviewModel.openingEffect=effect"),
                      "Le rappel d'ouverture doit poser le réglage…")
        XCTAssertFalse(source.contains("viewModel.openingEffect=effectrequestedSceneBand=nil"),
                       "…et NE PAS refermer la bande, contrairement à la couleur.")
    }
}

/// **Les puces d'ouverture suivent la SURFACE, pas le thème de l'appareil**
/// (#4403, correctif du 2026-08-30).
///
/// Mesuré au simulateur : les puces non sélectionnées existaient dans l'arbre
/// d'accessibilité — libellé et cadre corrects — et n'étaient PAS VISIBLES.
/// `OpeningEffectChips` lisait `colorScheme`, le thème de l'APPAREIL ; sur un
/// appareil en clair, elle peignait de l'`indigo950` sur le plateau, qui est
/// sombre en permanence.
///
/// **Un contrôle présent à l'accessibilité et absent à l'œil est le pire des
/// deux mondes** : les tests le trouvent, l'utilisateur non.
final class ComposerSceneBandOpeningContrastGuardTests: XCTestCase {

    private func bandSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSceneBand.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_laSource_estLisible() throws {
        XCTAssertTrue(try bandSource().contains("OpeningEffectChips"))
    }

    /// La bande DÉCLARE que sa surface est sombre. Sans ce drapeau, les puces
    /// retombent sur le thème de l'appareil — et disparaissent en thème clair.
    func test_lesPuces_saventQueLePlateauEstSombre() throws {
        XCTAssertTrue(compact(try bandSource()).contains("onDarkSurface:true"),
                      "Le plateau est sombre EN PERMANENCE : une couleur adaptative y peint "
                        + "du sombre sur du sombre dès que l'appareil quitte la nuit.")
    }
}

/// **La zone basse porte UN seul contenu, et l'exclusion se lit sur le rail.**
///
/// La surface écrivait `if let toolOptions { … } else if let band { … }` pendant
/// que le meuble passait le panneau d'options **inconditionnellement**. La
/// branche `band` n'a donc jamais été atteinte : la palette de fond (`1b`), la
/// bande de rognage (`2d`) et **tout jeton d'objet dont la destination est une
/// bande** (`1c`) étaient inertes depuis leur livraison.
///
/// > Le commentaire qui décrit ce mécanisme existait déjà, douze lignes plus
/// > bas, sur la rangée de jetons — écrit dans le lot qui l'y avait corrigé.
/// > **Un diagnostic posé au-dessus d'une ligne qui a encore le défaut ne le
/// > signale pas : il prouve qu'on le savait.**
final class ComposerLowZoneTests: XCTestCase {

    // MARK: - La règle

    /// Le témoin qui était IMPOSSIBLE à écrire avant la règle : sans outil
    /// ouvert, une bande servie prend le bas.
    func test_sansOutilOuvert_laBandeServiePrendLeBas() {
        XCTAssertEqual(ComposerLowZone.resolve(toolIsOpen: false, band: .palette),
                       .band(.palette))
    }

    /// Un outil ouvert prend la place, quelle que soit la bande demandée — les
    /// deux ne coexistent jamais.
    func test_unOutilOuvert_prendLaPlaceDeLaBande() {
        XCTAssertEqual(ComposerLowZone.resolve(toolIsOpen: true, band: .palette),
                       .toolOptions)
        XCTAssertEqual(ComposerLowZone.resolve(toolIsOpen: true, band: nil),
                       .toolOptions)
    }

    /// Ni outil ni bande ⇒ le bas ne porte que le socle (loi 4).
    func test_niOutilNiBande_leBasNePorteQueLeSocle() {
        XCTAssertEqual(ComposerLowZone.resolve(toolIsOpen: false, band: nil), .nothing)
    }

    /// **Les deux règles du bas répondent à la MÊME question.** La rangée de
    /// jetons et la zone basse consultent toutes deux « un outil est-il
    /// ouvert ? » ; si elles divergeaient, un jeton pourrait paraître au-dessus
    /// des options de l'outil qui vient de le remplacer.
    func test_lesJetonsEtLaZoneBasse_neSeContredisentJamais() {
        // La destination d'un jeton est une SECTION de l'éditeur depuis le
        // 2026-09-05, plus une bande : ce que le jeton ouvre a changé de place,
        // pas la question que ce témoin pose — « les deux règles du bas
        // répondent-elles pareil ? ».
        let jeton = ComposerObjectChips.Chip(id: "c", label: "L", destination: .timing)
        for outilOuvert in [true, false] {
            let jetonsServis = ComposerObjectChips.isServed(toolIsOpen: outilOuvert,
                                                            chips: [jeton])
            let zone = ComposerLowZone.resolve(toolIsOpen: outilOuvert, band: .palette)
            XCTAssertEqual(jetonsServis, zone != .toolOptions,
                           "Les jetons paraissent exactement quand la zone basse n'est pas "
                             + "prise par un outil — une seule question, une seule réponse.")
        }
    }

    // MARK: - La source : la branche morte ne peut pas revenir

    private func surfaceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSceneSurface.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// Le fusible. Sans lui, un chemin devenu faux rendrait les deux gardes
    /// ci-dessous vertes sur une chaîne vide.
    func test_laSource_estLisible() throws {
        XCTAssertTrue(try surfaceSource().contains("ComposerSceneBandView"),
                      "Chemin de source faux — les gardes suivantes ne mesureraient rien.")
    }

    /// POSITIVE : la surface consulte la règle.
    func test_laSurface_consulteLaRegleDeZoneBasse() throws {
        XCTAssertTrue(compact(try surfaceSource()).contains("ComposerLowZone.resolve(toolIsOpen:"),
                      "La zone basse doit se résoudre par la règle, pas par la présence d'une vue.")
    }

    /// NÉGATIVE : la présence du panneau ne peut plus gouverner la bande.
    func test_laBande_neDependPlusDeLaPresenceDuPanneau() throws {
        XCTAssertFalse(compact(try surfaceSource()).contains("iflettoolOptions{toolOptions}elseiflet"),
                       "L'hôte passe le panneau d'options inconditionnellement : le gater sur sa "
                         + "présence rend la branche `band` inatteignable, et avec elle la palette "
                         + "de fond, la bande de rognage et tout jeton qui ouvre une bande.")
    }
}

/// **#4083 est CLOS par retrait** (directive porteur 2026-09-05).
///
/// Cette suite éprouvait `ComposerSceneCapabilities.bands(canTrimSelection:
/// canStyleSelection:)` : deux capacités qui faisaient entrer `.timeline` et
/// `.textStyles` au jeu servi selon l'objet sélectionné. Les deux bandes
/// ÉDITAIENT un objet déjà posé ; la première vue n'édite plus, elles ont
/// quitté le type, et la fonction avec elles.
///
/// > Une suite qui n'a plus de sujet se SUPPRIME, elle ne se neutralise pas.
/// > La garder en la réécrivant sur `bands` seul aurait laissé cinq témoins
/// > verts qui n'éprouvent plus rien — la forme la plus douce du vert par
/// > omission, parce qu'elle continue de COMPTER dans le total.
///
/// Ce que les deux capacités garantissaient est repris ailleurs, et par des
/// questions qui ont encore un objet :
/// - `ComposerObjectChipsTests.test_chaqueDestination_estUneSectionServieParSaFamille`
///   — aucun jeton ne pointe sur une section que l'éditeur ne rend pas ;
/// - `ComposerAudioChipInspectorTests.test_uneFamilleAudio_serviParLeRognageDeLEditeur`
///   — le rognage d'une puce de son n'est pas perdu avec la bande ;
/// - `ComposerFirstViewTests` — la ligne de partage elle-même.
