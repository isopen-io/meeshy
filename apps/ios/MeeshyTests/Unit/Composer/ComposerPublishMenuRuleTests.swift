import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Publier propose le format et l'agencement quand la publication porte
/// plusieurs médias** (#6502, directive porteur 2026-09-14).
///
/// > « dès qu'on publie plus d'une image, ou que la publication a une vidéo,
/// > lors de l'appui sur publier, on a un menu liquid glass avec choix,
/// > sous-menu dépliable pour les posts de comment agencer les médias —
/// > supprimer le sélecteur en haut qui permet de choisir ce qu'on publie ! »
///
/// La règle est PURE : ce qui décide du menu, de ses entrées et du canal d'envoi
/// s'éprouve sans monter une vue. Les gardes de source de la fin ne portent que
/// sur ce qu'aucune valeur ne peut dire — l'éventail n'est plus monté, la
/// flèche monte le menu, le brouillon transporte l'agencement choisi.
final class ComposerPublishMenuRuleTests: XCTestCase {

    // MARK: - Fabriques

    private func slide(id: String, objets: [(id: String, kind: StoryMediaKind)] = []) -> StorySlide {
        var s = StorySlide()
        s.id = id
        s.effects.mediaObjects = objets.map {
            StoryMediaObject(id: $0.id, mediaURL: "file:///tmp/\($0.id)", kind: $0.kind, aspectRatio: 1.0)
        }
        return s
    }

    // MARK: - CE QUE le menu offre

    private let candidats: [ComposerFormat] = [.story, .post, .reel]

    func test_seulsLesFormatsDeLaPorte_apparaissent_dansSonOrdre() {
        let entrees = ComposerPublishMenuRule.entries(candidates: candidats, offered: [.story, .post, .reel],
                                                      carriesMoreThanText: true, slideCount: 2,
                                                      layoutsTravel: true)
        XCTAssertEqual(entrees.map(\.format), candidats)
        XCTAssertFalse(entrees.map(\.format).contains(.status),
                       "Un format que la porte ne propose pas n'a rien à faire au menu.")
    }

    func test_leReel_estGrise_avecSaRaison() throws {
        let entrees = ComposerPublishMenuRule.entries(candidates: candidats, offered: [.story, .post],
                                                      carriesMoreThanText: true, slideCount: 2,
                                                      layoutsTravel: true)
        let reel = try XCTUnwrap(entrees.first { $0.format == .reel })
        XCTAssertFalse(reel.isChoosable)
        XCTAssertEqual(reel.reason,
                       ComposerFormatAvailability.reason(for: .reel, carriesMoreThanText: true),
                       "La raison est celle de la règle de disponibilité — jamais une phrase recopiée.")
        XCTAssertFalse(reel.reason?.isEmpty ?? true, "Un refus sans raison n'enseigne rien.")
        XCTAssertTrue(try XCTUnwrap(entrees.first { $0.format == .post }).isChoosable)
    }

    func test_leSousMenuPost_nExistequAvecPlusDUneSlide() throws {
        let une = ComposerPublishMenuRule.entries(candidates: candidats, offered: candidats,
                                                  carriesMoreThanText: true, slideCount: 1,
                                                  layoutsTravel: true)
        XCTAssertEqual(try XCTUnwrap(une.first { $0.format == .post }).layouts, [],
                       "Une slide seule n'a rien à disposer : Post est un bouton simple.")

        let deux = ComposerPublishMenuRule.entries(candidates: candidats, offered: candidats,
                                                   carriesMoreThanText: true, slideCount: 2,
                                                   layoutsTravel: true)
        XCTAssertEqual(try XCTUnwrap(deux.first { $0.format == .post }).layouts, ComposerMosaicChoice.ordered)
        XCTAssertEqual(try XCTUnwrap(deux.first { $0.format == .story }).layouts, [],
                       "Une story ne s'affiche jamais en mosaïque.")
        XCTAssertEqual(try XCTUnwrap(deux.first { $0.format == .reel }).layouts, [],
                       "Le sous-menu est celui du POST, et de lui seul.")
    }

    /// Le canal document ne téléverse que les fichiers du meuble. Sous l'atelier,
    /// les médias vivent dans des objets qu'il ne voit pas : offrir « Post +
    /// agencement » y publierait un canevas SANS ses fichiers.
    func test_leSousMenuPost_seRetire_quandLeDocumentNePortePasLesFichiers() throws {
        let entrees = ComposerPublishMenuRule.entries(candidates: candidats, offered: candidats,
                                                      carriesMoreThanText: true, slideCount: 3,
                                                      layoutsTravel: false)
        XCTAssertEqual(try XCTUnwrap(entrees.first { $0.format == .post }).layouts, [])
    }

    func test_chaqueEntree_seChoisitEnUnSeulGeste() throws {
        let entrees = ComposerPublishMenuRule.entries(candidates: candidats, offered: candidats,
                                                      carriesMoreThanText: true, slideCount: 2,
                                                      layoutsTravel: true)
        let post = try XCTUnwrap(entrees.first { $0.format == .post })
        XCTAssertEqual(post.choices, ComposerMosaicChoice.ordered.map { ComposerPublishChoice(format: .post, layout: $0) })
        XCTAssertEqual(try XCTUnwrap(entrees.first { $0.format == .story }).choices,
                       [ComposerPublishChoice(format: .story, layout: nil)])
    }

    // MARK: - Le menu entier : absent, ou un vrai choix

    /// #7497 — le chevron ne dépend plus de la matière : un texte seul, ouvert
    /// en story, se publie aussi en post ou en réel par le chevron.
    func test_leChevron_estPresent_memeSansMedia() throws {
        let menu = try XCTUnwrap(ComposerPublishMenuRule.menu(candidates: candidats,
                                                              offered: [.story, .post], carriesMoreThanText: false,
                                                              slideCount: 1, layoutsTravel: true))
        XCTAssertEqual(menu.map(\.format), candidats)
    }

    func test_laPartiePrincipale_nommeLeFormatDeLaPorte() {
        XCTAssertNotNil(ComposerPublishMenuCopy.publishTitle(.story))
        XCTAssertNotNil(ComposerPublishMenuCopy.publishTitle(.post))
        XCTAssertNotNil(ComposerPublishMenuCopy.publishTitle(.reel))
        XCTAssertNil(ComposerPublishMenuCopy.publishTitle(.status), "Le mood garde « Publier ».")
    }

    func test_leMenu_estAbsent_quandIlNOffreQuUnSeulChoix() {
        XCTAssertNil(ComposerPublishMenuRule.menu(candidates: [.post],
                                                  offered: [.post], carriesMoreThanText: true,
                                                  slideCount: 1, layoutsTravel: true),
                     "Une entrée unique sans sous-menu est une affordance sans choix (loi 4).")
    }

    func test_leMenu_offreLesAgencements_memeAUnSeulFormat() throws {
        let menu = try XCTUnwrap(ComposerPublishMenuRule.menu(candidates: [.post],
                                                              offered: [.post], carriesMoreThanText: true,
                                                              slideCount: 2, layoutsTravel: true))
        XCTAssertEqual(menu.first?.layouts, ComposerMosaicChoice.ordered)
    }

    // MARK: - Le chevron CHOISIT, seule la partie principale publie (maquette plein écran, 2026-09-27)

    private func menuTroisFormats(slides: Int = 2) -> [ComposerPublishMenuRule.Entry] {
        ComposerPublishMenuRule.entries(candidates: candidats, offered: candidats,
                                        carriesMoreThanText: true, slideCount: slides,
                                        layoutsTravel: true)
    }

    // MARK: - Le menu COCHE ce qui est armé (#9419)

    func test_checkedLayout_armedPostWithLayout_checksThatLayout() throws {
        let post = try XCTUnwrap(menuTroisFormats().first { $0.format == .post })
        let arme = ComposerPublishChoice(format: .post, layout: .reel)

        XCTAssertTrue(ComposerPublishMenuRule.isChecked(post, armed: arme))
        XCTAssertEqual(ComposerPublishMenuRule.checkedLayout(in: post, armed: arme), .reel)
    }

    /// Avant tout choix, un post à plusieurs scènes part dans le REPLI : le
    /// menu coche donc le repli — il ne dit pas « rien » quand quelque chose
    /// partira.
    func test_checkedLayout_postWithoutChosenLayout_checksTheFallback() throws {
        let post = try XCTUnwrap(menuTroisFormats().first { $0.format == .post })
        let arme = ComposerPublishChoice(format: .post, layout: nil)

        XCTAssertTrue(ComposerPublishMenuRule.isChecked(post, armed: arme))
        XCTAssertEqual(ComposerPublishMenuRule.checkedLayout(in: post, armed: arme), ComposerMosaicChoice.fallback)
    }

    func test_checkedLayout_armedStory_checksNoPostLayout() throws {
        let entrees = menuTroisFormats()
        let post = try XCTUnwrap(entrees.first { $0.format == .post })
        let story = try XCTUnwrap(entrees.first { $0.format == .story })
        let arme = ComposerPublishChoice(format: .story, layout: nil)

        XCTAssertFalse(ComposerPublishMenuRule.isChecked(post, armed: arme))
        XCTAssertNil(ComposerPublishMenuRule.checkedLayout(in: post, armed: arme))
        XCTAssertTrue(ComposerPublishMenuRule.isChecked(story, armed: arme))
        XCTAssertNil(ComposerPublishMenuRule.checkedLayout(in: story, armed: arme),
                     "Une entrée sans sous-menu n'a aucune disposition à cocher.")
    }

    /// La relance rend le choix armé ; la capsule et le menu le relisent
    /// tels quels.
    func test_armed_restoredChoiceStillOffered_isTheArmedChoice() throws {
        let restaure = ComposerPublishChoice(format: .post, layout: .reel)
        let entrees = menuTroisFormats()

        let arme = ComposerPublishMenuRule.armed(chosen: restaure, defaultFormat: .post, entries: entrees)

        XCTAssertEqual(arme, restaure)
        let post = try XCTUnwrap(entrees.first { $0.format == .post })
        XCTAssertEqual(ComposerPublishMenuRule.checkedLayout(in: post, armed: arme), .reel)
    }

    func test_armed_sansChoix_publieLeFormatDeLaPorte() {
        XCTAssertEqual(ComposerPublishMenuRule.armed(chosen: nil, defaultFormat: .story,
                                                     entries: menuTroisFormats()),
                       ComposerPublishChoice(format: .story, layout: nil))
    }

    func test_armed_retientLeChoixDuChevron_avecSonAgencement() {
        let choix = ComposerPublishChoice(format: .post, layout: ComposerMosaicChoice.ordered[0])
        XCTAssertEqual(ComposerPublishMenuRule.armed(chosen: choix, defaultFormat: .story,
                                                     entries: menuTroisFormats()), choix)
    }

    func test_armed_retombeSurLaPorte_quandLeChoixNestPlusOffert() {
        let choix = ComposerPublishChoice(format: .post, layout: ComposerMosaicChoice.ordered[0])
        XCTAssertEqual(ComposerPublishMenuRule.armed(chosen: choix, defaultFormat: .story,
                                                     entries: menuTroisFormats(slides: 1)),
                       ComposerPublishChoice(format: .story, layout: nil),
                       "Une slide retirée efface l'agencement : on ne publie pas ce que le menu n'offre plus.")
        let grise = ComposerPublishMenuRule.entries(candidates: candidats, offered: [.story, .post],
                                                    carriesMoreThanText: true, slideCount: 1,
                                                    layoutsTravel: true)
        XCTAssertEqual(ComposerPublishMenuRule.armed(chosen: ComposerPublishChoice(format: .reel, layout: nil),
                                                     defaultFormat: .story, entries: grise),
                       ComposerPublishChoice(format: .story, layout: nil))
    }

    func test_leChevron_choisitSansPublier_laPartiePrincipalePublieLeChoixArme() throws {
        let fleche = compact(try XCTUnwrap(bloc("var publishButton", dans: try hostCode())))
        XCTAssertTrue(fleche.contains("onChoose:{chooseArmedPublish($0)}"),
                      "Le chevron RETIENT le choix ; il ne publie pas.")
        // #8793 : retenir le choix, c'est l'ARMER et verrouiller la bascule
        // automatique vers le réel — jamais le publier.
        let choix = compact(try XCTUnwrap(bloc("func chooseArmedPublish(", dans: try hostCode())))
        XCTAssertTrue(choix.contains("armedPublishChoice=choice"))
        XCTAssertFalse(choix.contains("Publish(choice)"), "Choisir ne publie pas.")
        XCTAssertFalse(fleche.contains("onPublish:"), "Le chevron ne publie plus.")
        XCTAssertTrue(fleche.contains("requestSoclePublish(armedChoice)"),
                      "Seule la partie principale publie, et elle publie ce qui est armé.")
        // #8603 : la partie principale passe par la question « Publier en
        // réel ? », qui retombe sur l'aiguillage hors de son seul cas.
        let demande = compact(try XCTUnwrap(bloc("func requestSoclePublish(", dans: try hostCode())))
        XCTAssertTrue(demande.contains("performSoclePublish(choice)"),
                      "Hors du post à une seule vidéo, la capsule publie comme avant.")
    }

    // MARK: - OÙ part la publication choisie

    func test_leCanalSuitLeChoix() {
        typealias R = ComposerPublishMenuRule.Route
        let cas: [(ComposerSurfaceKind, ComposerPublishChoice, R)] = [
            (.scene, .init(format: .story, layout: nil), .atelier),
            (.scene, .init(format: .post, layout: nil), .atelier),
            (.scene, .init(format: .post, layout: .wave), .document),
            (.document, .init(format: .story, layout: nil), .storyScene),
            (.document, .init(format: .post, layout: nil), .document),
            (.document, .init(format: .post, layout: .hero), .document),
            (.document, .init(format: .reel, layout: nil), .document),
            (.mood, .init(format: .status, layout: nil), .document)
        ]
        for (surface, choix, attendu) in cas {
            XCTAssertEqual(ComposerPublishMenuRule.route(surface: surface, choice: choix), attendu,
                           "\(surface) · \(choix)")
        }
    }

    // MARK: - Le texte du post armé depuis une scène part avec elle (#8473)

    /// Une scène ouverte en story et armée « Post » au chevron publie par
    /// l'ATELIER, qui lit le contenu de la slide — jamais `documentText`, où la
    /// plaque de verre du socle écrit le texte du post. Sans report, le texte
    /// tapé ne partait nulle part.
    func test_unPostArmeSousLAtelier_emporteLeTexteDuPost() {
        let texte = ComposerPublishMenuRule.atelierCarriedPostText(
            route: .atelier, choice: .init(format: .post, layout: nil), documentText: "Bonjour à tous")
        XCTAssertEqual(texte, "Bonjour à tous")
    }

    func test_uneStorySousLAtelier_nEmporteAucunTexteDePost() {
        XCTAssertNil(ComposerPublishMenuRule.atelierCarriedPostText(
            route: .atelier, choice: .init(format: .story, layout: nil), documentText: "Bonjour"))
    }

    func test_unTexteBlanc_neRemplacePasLeContenuDeLaSlide() {
        XCTAssertNil(ComposerPublishMenuRule.atelierCarriedPostText(
            route: .atelier, choice: .init(format: .post, layout: nil), documentText: "  \n "))
    }

    func test_leCanalDocument_porteDejaLeTexte_rienAReporter() {
        XCTAssertNil(ComposerPublishMenuRule.atelierCarriedPostText(
            route: .document, choice: .init(format: .post, layout: .wave), documentText: "Bonjour"))
    }

    func test_laFlecheDuSocle_reporteLeTexteDuPost_avantDePresserLAtelier() throws {
        let code = try hostCode()
        let envoi = try XCTUnwrap(bloc("func performSoclePublish(", dans: code),
                                  "L'envoi du socle est introuvable — la garde ne mesurerait RIEN.")
        let compacte = compact(envoi)
        let report = try XCTUnwrap(compacte.range(of: "ComposerPublishMenuRule.atelierCarriedPostText("),
                                   "Le texte du post armé depuis une scène doit partir avec elle (#8473).")
        let presse = try XCTUnwrap(compacte.range(of: "publishTrigger.requestPublish("))
        XCTAssertLessThan(report.lowerBound, presse.lowerBound,
                          "Le report précède la pression de l'atelier, sinon la slide part sans le texte.")
    }

    func test_leDocument_portetousLesFichiers_seulementQuandChaqueObjetEstPasseParLeMeuble() {
        let slides = [slide(id: "s1", objets: [("o1", .image)]), slide(id: "s2", objets: [("o2", .video)])]
        XCTAssertTrue(ComposerPublishMenuRule.documentCarriesEveryMedia(
            slides: slides, slideImageIds: [], bridgedObjectIds: ["o1", "o2"]))
        XCTAssertFalse(ComposerPublishMenuRule.documentCarriesEveryMedia(
            slides: slides, slideImageIds: [], bridgedObjectIds: ["o1"]))
        XCTAssertFalse(ComposerPublishMenuRule.documentCarriesEveryMedia(
            slides: slides, slideImageIds: ["s1"], bridgedObjectIds: ["o1", "o2"]),
                       "Une image de fond de l'atelier n'est pas un fichier du meuble.")
    }

    // MARK: - L'agencement choisi ARRIVE dans le brouillon

    func test_lAgencementChoisi_arriveDansLeCanvasPublie() throws {
        let entrees = ComposerPublishMenuRule.entries(candidates: [.post], offered: [.post],
                                                      carriesMoreThanText: true, slideCount: 2,
                                                      layoutsTravel: true)
        let slides = [slide(id: "s1", objets: [("o1", .image)]), slide(id: "s2", objets: [("o2", .image)])]
        for choix in try XCTUnwrap(entrees.first).choices {
            let porte = try XCTUnwrap(ComposerStoryCanvas.publishedSlide(
                format: choix.format, sceneIsPresent: true, slides: slides, layout: choix.layout))
            XCTAssertEqual(porte.canvasV3?.layout, choix.layout)
        }
    }

    private func hostCode() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ texte: String) -> String {
        texte.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    private func bloc(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var corps = ""
        for c in code[debut.lowerBound...] {
            corps.append(c)
            if c == "{" { profondeur += 1 }
            if c == "}" {
                profondeur -= 1
                if profondeur == 0 { return corps }
            }
        }
        return nil
    }

    func test_leBrouillon_transporteLeChoixDuGeste() throws {
        let code = try hostCode()
        let brouillon = try XCTUnwrap(bloc("func documentDraft(", dans: code),
                                      "Le brouillon est introuvable — la garde ne mesurerait RIEN.")
        let compacte = compact(brouillon)
        XCTAssertTrue(compacte.contains("format:choice.format"), "Le format du GESTE, pas celui d'ouverture.")
        XCTAssertTrue(compacte.contains("forcePlainPost:choice.format==.post"))
        XCTAssertTrue(compacte.contains("layout:choice.layout"),
                      "Sans cette ligne l'agencement choisi au menu partirait dans le repli.")
    }

    // MARK: - Gardes de source retournées : l'éventail est parti, la flèche porte le choix

    func test_lEventail_nEstPlusMonteNullePart() throws {
        let code = compact(try hostCode())
        XCTAssertGreaterThan(code.count, 20_000, "Unité du meuble vide — garde verte par omission.")
        for disparu in ["ComposerFormatFan(", "formatChip", "plateauTools", "mountsFormatFan", "formatFan:"] {
            XCTAssertFalse(code.contains(compact(disparu)), "« \(disparu) » est revenu dans le meuble.")
        }
    }

    func test_laFleche_monteLeMenu() throws {
        let code = try hostCode()
        let fleche = try XCTUnwrap(bloc("var publishButton", dans: code))
        XCTAssertTrue(compact(fleche).contains("ComposerPublishMenu("),
                      "La flèche porte le menu : c'est là que l'auteur sait ce qu'il publie.")
        XCTAssertTrue(compact(fleche).contains("publishCapsule("),
                      "…dans l'habillage partagé, qui porte le gate.")
    }
}

/// **Une story part AUSSI en réel d'un seul geste, et le format armé est celui
/// qui part** (#9476).
///
/// Le porteur a publié une story (photo, texte, son emprunté de 238 s) qu'il
/// voulait aussi en réel : le menu n'armait qu'UN format, et un seul
/// `POST /posts` `type: STORY` est parti. Ces témoins tiennent les trois
/// moitiés : le menu coche les DEUX formats, la flèche presse ce qui est coché
/// (menu → `requestPublish` → type publié), et rien n'annonce un réel qui ne
/// partirait pas.
@MainActor
final class ComposerPublishAlsoAsReelTests: XCTestCase {

    private let candidats: [ComposerFormat] = [.story, .post, .reel]

    /// Le menu d'une story qui QUALIFIE pour un réel (`ComposerReelGate` : un
    /// son de 238 s) — le réel est choisissable.
    private func menuQualifiant() -> [ComposerPublishMenuRule.Entry] {
        ComposerPublishMenuRule.entries(candidates: candidats, offered: candidats,
                                        carriesMoreThanText: true, slideCount: 1, layoutsTravel: true)
    }

    /// Le menu d'une story qui NE qualifie pas — le réel est grisé, avec sa raison.
    private func menuNonQualifiant() -> [ComposerPublishMenuRule.Entry] {
        ComposerPublishMenuRule.entries(candidates: candidats, offered: [.story, .post],
                                        carriesMoreThanText: true, slideCount: 1, layoutsTravel: true)
    }

    private let story = ComposerPublishChoice(format: .story, layout: nil)
    private let reel = ComposerPublishChoice(format: .reel, layout: nil)
    private let storyEtReel = ComposerPublishChoice(format: .story, layout: nil, alsoAsReel: true)

    // MARK: - Quand l'offre existe

    func test_companionReelOffered_storyQuiQualifie_uneScene_offreLesDeux() {
        XCTAssertTrue(ComposerPublishMenuRule.companionReelOffered(entries: menuQualifiant(), slideCount: 1))
    }

    func test_companionReelOffered_reelGrise_nOffreRien() {
        XCTAssertFalse(ComposerPublishMenuRule.companionReelOffered(entries: menuNonQualifiant(), slideCount: 1),
                       "Un réel que la composition ne qualifie pas ne peut pas partir avec la story.")
    }

    func test_companionReelOffered_plusieursScenes_nOffreRien() {
        XCTAssertFalse(ComposerPublishMenuRule.companionReelOffered(entries: menuQualifiant(), slideCount: 2),
                       "Une story de deux slides partirait en deux réels.")
    }

    func test_companionReelOffered_republication_nOffreRien() {
        XCTAssertFalse(ComposerPublishMenuRule.companionReelOffered(entries: menuQualifiant(), slideCount: 1,
                                                                    isRepost: true))
    }

    func test_companionReelOffered_sansMenu_nOffreRien() {
        XCTAssertFalse(ComposerPublishMenuRule.companionReelOffered(entries: nil, slideCount: 1))
    }

    // MARK: - Le menu coche les DEUX formats

    func test_toucherReel_surUneStory_ajouteLeReel() {
        XCTAssertEqual(ComposerPublishMenuRule.toggled(.reel, armed: story, companionReelOffered: true), storyEtReel)
    }

    func test_retoucherReel_retireLeReel_laStoryReste() {
        XCTAssertEqual(ComposerPublishMenuRule.toggled(.reel, armed: storyEtReel, companionReelOffered: true), story)
    }

    func test_toucherStory_quandLesDeuxSontCoches_neGardeQueLeReel() {
        XCTAssertEqual(ComposerPublishMenuRule.toggled(.story, armed: storyEtReel, companionReelOffered: true), reel,
                       "Décocher la story ne doit jamais laisser le menu sans rien de coché.")
    }

    func test_toucherStory_surUnReel_cocheLesDeux() {
        XCTAssertEqual(ComposerPublishMenuRule.toggled(.story, armed: reel, companionReelOffered: true), storyEtReel)
    }

    func test_toucherPost_armeLePostSeul() {
        XCTAssertEqual(ComposerPublishMenuRule.toggled(.post, armed: storyEtReel, companionReelOffered: true),
                       ComposerPublishChoice(format: .post, layout: nil))
    }

    func test_sansOffre_toucherReel_armeLeReelSeul_commeAvant() {
        XCTAssertEqual(ComposerPublishMenuRule.toggled(.reel, armed: story, companionReelOffered: false), reel)
    }

    func test_storyEtReel_cocheLesDeuxEntrees_etPasLePost() throws {
        let entrees = menuQualifiant()
        let storyEntree = try XCTUnwrap(entrees.first { $0.format == .story })
        let reelEntree = try XCTUnwrap(entrees.first { $0.format == .reel })
        let postEntree = try XCTUnwrap(entrees.first { $0.format == .post })
        XCTAssertTrue(ComposerPublishMenuRule.isChecked(storyEntree, armed: storyEtReel))
        XCTAssertTrue(ComposerPublishMenuRule.isChecked(reelEntree, armed: storyEtReel))
        XCTAssertFalse(ComposerPublishMenuRule.isChecked(postEntree, armed: storyEtReel))
    }

    // MARK: - Ce qui est armé est ce qui part (le doute de l'issue)

    /// « Si Réel a été touché, `armed()` a pu revenir au format de la porte » :
    /// non, tant que le réel est OFFERT — il ne retombe sur la porte que grisé,
    /// et la capsule dit alors « Publier la story ».
    func test_armed_reelChoisiEtOffert_resteLeReel() {
        XCTAssertEqual(ComposerPublishMenuRule.armed(chosen: reel, defaultFormat: .story,
                                                     entries: menuQualifiant()), reel)
    }

    func test_armed_reelChoisiPuisGrise_retombeSurLaStory_queLaCapsuleNomme() {
        let arme = ComposerPublishMenuRule.armed(chosen: reel, defaultFormat: .story, entries: menuNonQualifiant())
        XCTAssertEqual(arme, story)
        XCTAssertEqual(ComposerPublishMenuCopy.publishTitle(for: arme), ComposerPublishMenuCopy.publishTitle(.story))
    }

    func test_armed_storyEtReel_offert_partEnsemble() {
        XCTAssertEqual(ComposerPublishMenuRule.armed(chosen: storyEtReel, defaultFormat: .story,
                                                     entries: menuQualifiant(), companionReelOffered: true),
                       storyEtReel)
    }

    func test_armed_storyEtReel_plusOffert_laStoryPartSeule() {
        XCTAssertEqual(ComposerPublishMenuRule.armed(chosen: storyEtReel, defaultFormat: .story,
                                                     entries: menuQualifiant(), companionReelOffered: false),
                       story, "Un réel qui ne partira pas n'est jamais annoncé.")
    }

    func test_laCapsule_nommeLesDeuxFormats() throws {
        let titre = try XCTUnwrap(ComposerPublishMenuCopy.publishTitle(for: storyEtReel))
        XCTAssertNotEqual(titre, ComposerPublishMenuCopy.publishTitle(.story))
        XCTAssertNotEqual(titre, ComposerPublishMenuCopy.publishTitle(.reel))
    }

    // MARK: - Le chemin menu → requestPublish → type publié

    func test_dispatch_reelArme_sousLAtelier_presseLeReel() {
        XCTAssertEqual(ComposerPublishMenuRule.dispatch(surface: .scene, choice: reel),
                       .atelier(.reel, alsoAsReel: false))
    }

    func test_dispatch_storyEtReel_sousLAtelier_presseLaStory_avecLeReel() {
        XCTAssertEqual(ComposerPublishMenuRule.dispatch(surface: .scene, choice: storyEtReel),
                       .atelier(.story, alsoAsReel: true))
    }

    func test_dispatch_storyEtReel_sousLeDocument_publieLaScene_avecLeReel() {
        XCTAssertEqual(ComposerPublishMenuRule.dispatch(surface: .document, choice: storyEtReel),
                       .storyScene(.story, alsoAsReel: true))
    }

    func test_dispatch_reelArme_sousLeDocument_partParLeDocument() {
        XCTAssertEqual(ComposerPublishMenuRule.dispatch(surface: .document, choice: reel), .document(reel))
    }

    func test_laTelecommande_retientLeTypeEtLeReel_duGeste() {
        let telecommande = ComposerPublishTrigger()
        telecommande.requestPublish(as: .reel)
        XCTAssertEqual(telecommande.requestedTargetType, .reel, "Le réel armé part en REEL.")
        XCTAssertFalse(telecommande.requestedAlsoAsReel)

        telecommande.requestPublish(as: .story, alsoAsReel: true)
        XCTAssertEqual(telecommande.requestedTargetType, .story)
        XCTAssertTrue(telecommande.requestedAlsoAsReel)

        telecommande.disarm()
        XCTAssertFalse(telecommande.requestedAlsoAsReel, "Une télécommande désarmée ne garde rien du geste.")
    }

    func test_leReel_nAccompagneQuUneStory() {
        XCTAssertTrue(ComposerPublishTrigger.publishedAlsoAsReel(requested: true, served: .story))
        XCTAssertFalse(ComposerPublishTrigger.publishedAlsoAsReel(requested: true, served: .post))
        XCTAssertFalse(ComposerPublishTrigger.publishedAlsoAsReel(requested: false, served: .story))
    }

    func test_laChargeDeHandOff_porteLeReel_sansPerdreLeReste() {
        let base = ComposerMediaAccessibility(mediaAlt: ["m": "alt"], mediaCaption: ["m": "légende"],
                                              allowSoundExtraction: true)
        let portee = base.carryingAlsoAsReel(true)
        XCTAssertTrue(portee.alsoAsReel)
        XCTAssertEqual(portee.mediaAlt, base.mediaAlt)
        XCTAssertEqual(portee.mediaCaption, base.mediaCaption)
        XCTAssertEqual(portee.allowSoundExtraction, true)
        XCTAssertFalse(ComposerMediaAccessibility.empty.alsoAsReel, "Un appelant historique publie la story seule.")
    }

    // MARK: - Ce qui part sur le fil

    func test_leFil_nePorteLeReel_queSurUneStoryOriginaleDUneScene() {
        XCTAssertEqual(StoryAlsoAsReelWire.flag(requested: true, type: .story, slideCount: 1, isRepost: false), true)
        XCTAssertNil(StoryAlsoAsReelWire.flag(requested: true, type: .story, slideCount: 2, isRepost: false))
        XCTAssertNil(StoryAlsoAsReelWire.flag(requested: true, type: .reel, slideCount: 1, isRepost: false))
        XCTAssertNil(StoryAlsoAsReelWire.flag(requested: true, type: .story, slideCount: 1, isRepost: true))
        XCTAssertNil(StoryAlsoAsReelWire.flag(requested: false, type: .story, slideCount: 1, isRepost: false),
                     "Sans la demande, la clé reste absente — le corps d'un ancien client.")
    }
}
