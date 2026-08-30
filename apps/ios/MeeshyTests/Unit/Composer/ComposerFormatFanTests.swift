import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// C3 — l'ÉVENTAIL, le sélecteur de format du composer unifié.
///
/// `offeredFormats` existait depuis C1, renseigné sur les 8 branches de la
/// table, et n'avait AUCUN lecteur : la table décidait de l'éventail que
/// personne ne peignait. Ces tests éprouvent la règle qui le peint, et elle
/// tient en une phrase — la **loi 4** : *un format non offert est ABSENT,
/// jamais grisé*.
///
/// La politique est PURE (aucune vue, aucun état) : c'est ce qui permet de
/// l'éprouver par comportement plutôt que par garde de source. Les deux gardes
/// de source de la fin ne portent que sur ce qu'aucune valeur ne peut dire —
/// « la vue ne grise pas », « la vue n'énumère pas les formats elle-même ».
@MainActor
final class ComposerFormatFanTests: XCTestCase {

    // MARK: - Loi 4 — un éventail à une entrée n'est pas un éventail

    /// La formulation de C1, mot pour mot : « un éventail à une seule entrée ne
    /// montre donc aucun sélecteur ». Un chip unique, non actionnable, serait
    /// exactement l'UI morte que la loi 4 interdit — il promettrait un choix
    /// qui n'existe pas.
    func test_fan_isAbsent_whenASingleFormatIsOffered() {
        XCTAssertFalse(ComposerFormatFanPolicy.isVisible(offeredFormats: [.post]))
        XCTAssertFalse(ComposerFormatFanPolicy.isVisible(offeredFormats: [.status]))
    }

    func test_fan_isAbsent_whenNoFormatIsOffered() {
        XCTAssertFalse(ComposerFormatFanPolicy.isVisible(offeredFormats: []))
    }

    func test_fan_appears_assoonAsTwoFormatsAreOffered() {
        XCTAssertTrue(ComposerFormatFanPolicy.isVisible(offeredFormats: [.story, .post]))
        XCTAssertTrue(ComposerFormatFanPolicy.isVisible(offeredFormats: [.reel, .post]))
    }

    /// Le pont avec la table de C1 : les portes qui n'offrent qu'un format
    /// n'affichent aucun éventail, celles qui en offrent plusieurs si. On lit
    /// la table plutôt que de recopier ses valeurs — un profil qui changerait
    /// se répercuterait ici sans synchronisation manuelle.
    func test_fan_followsTheDoorTable_notALocalCopy() {
        let mood = ComposerProfile.profile(for: .moodChip)
        XCTAssertFalse(ComposerFormatFanPolicy.isVisible(offeredFormats: mood.offeredFormats),
                       "Le mood n'offre que `.status` — aucun sélecteur")

        let repostOfPost = ComposerProfile.profile(for: .repost(ofPostId: "p1", sourceFormat: .post))
        XCTAssertFalse(ComposerFormatFanPolicy.isVisible(offeredFormats: repostOfPost.offeredFormats),
                       "Reposter un post ne propose pas le post deux fois — aucun sélecteur")

        let tray = ComposerProfile.profile(for: .storyTray)
        XCTAssertTrue(ComposerFormatFanPolicy.isVisible(offeredFormats: tray.offeredFormats),
                      "Le tray offre story ET post — l'éventail existe")
    }

    // MARK: - La sélection ne sort jamais de l'éventail

    func test_selection_staysPut_whenItIsStillOffered() {
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .post, offeredFormats: [.story, .post]),
            .post
        )
    }

    /// V1 fait RESPIRER l'éventail : le réel n'est offert que tant que la
    /// composition qualifie. Une composition qui cesse de qualifier retire le
    /// réel de l'éventail — et une sélection restée sur `.reel` peindrait alors
    /// un éventail SANS SÉLECTION, où aucun chip n'est marqué. La sélection
    /// retombe donc sur le premier format offert, qui est toujours le format
    /// propre de la porte (invariant de C1 : l'éventail contient toujours
    /// `initialFormat`).
    func test_selection_fallsBackToTheFirstOfferedFormat_whenItIsWithdrawn() {
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .reel, offeredFormats: [.story, .post]),
            .story
        )
    }

    /// Cas dégénéré : rien d'offert. La politique ne fabrique pas un format —
    /// elle rend celui qu'on lui donne, et l'éventail reste invisible (règle du
    /// haut). Inventer `.post` ici ferait publier un format que la porte n'a
    /// jamais offert.
    func test_selection_isNeverInvented_whenNothingIsOffered() {
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .story, offeredFormats: []),
            .story
        )
    }

    // MARK: - V3-3 — la règle de repli, dans la situation que le HOST fabrique

    /// Le repli n'avait jamais été exercé hors de son propre test : on lui
    /// passait un `offeredFormats` écrit à la main. Ici l'offre vient de la
    /// TABLE, avec le gate du réel dans les deux positions — c'est exactement
    /// la paire que le meuble recompose à chaque rendu (`profile` +
    /// `selectedFormat`), et rien d'autre ne produit le cas.
    ///
    /// Scénario : le tray, deux images posées (le réel qualifie), l'auteur
    /// choisit « Réel ». Il retire une image. L'offre se referme sur
    /// `[.story, .post]` — et la sélection doit revenir au format de la porte,
    /// sans quoi le meuble monterait une surface et publierait un type que la
    /// porte n'offre plus.
    func test_theHostFallback_bringsTheChoiceBack_whenTheReelGateCloses() {
        let qualifying = ComposerProfile.profile(for: .storyTray, compositionQualifiesAsReel: true)
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .reel,
                                                      offeredFormats: qualifying.offeredFormats),
            .reel,
            "Tant que la composition qualifie, le choix de l'auteur tient."
        )

        let withdrawn = ComposerProfile.profile(for: .storyTray, compositionQualifiesAsReel: false)
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .reel,
                                                      offeredFormats: withdrawn.offeredFormats),
            .story,
            "L'offre s'est refermée : la sélection revient au format propre de la porte."
        )
    }

    /// L'invariant qui rend le repli sûr, éprouvé sur les NEUF portes plutôt
    /// que supposé : le premier format offert est toujours celui de la porte.
    /// Si une porte le violait un jour, le repli renverrait l'auteur sur un
    /// format que sa porte n'ouvre pas — et rien d'autre ne le dirait.
    func test_theFallbackTarget_isAlwaysTheDoorOwnFormat() {
        let doors: [ComposerOrigin] = [
            .storyTray, .feedComposer, .reelTab, .moodChip,
            .repost(ofPostId: "p1", sourceFormat: .story),
            .edit(postId: "p2", documentFormat: .reel),
            .draft(id: "d1"), .share,
            .conversationMedia(messageId: "m1", attachmentId: "a1")
        ]

        for door in doors {
            for gate in [true, false] {
                let profile = ComposerProfile.profile(for: door, compositionQualifiesAsReel: gate)
                XCTAssertEqual(
                    ComposerFormatFanPolicy.resolvedSelection(current: .status,
                                                              offeredFormats: profile.offeredFormats),
                    profile.initialFormat,
                    "Un format hors offre doit retomber sur le format propre de la porte \(door)."
                )
            }
        }
    }

    /// Le pont que le meuble emprunte pour publier : le format résolu devient
    /// un `PostType`, et c'est CE pont-là (`ComposerFormat.postType`, C1) qu'il
    /// utilise. En écrire un second app-side ferait diverger deux traductions
    /// du même fait.
    func test_theResolvedFormat_translatesToTheWireType() {
        XCTAssertEqual(ComposerFormat.story.postType, .story)
        XCTAssertEqual(ComposerFormat.post.postType, .post)
        XCTAssertEqual(ComposerFormat.reel.postType, .reel)
        XCTAssertEqual(ComposerFormat.status.postType, .status)
    }

    // MARK: - Les libellés sont localisés, pas des identifiants nus

    func test_everyFormatCarriesADistinctNonRawLabel() {
        let formats: [ComposerFormat] = [.story, .post, .reel, .status]
        let labels = formats.map(ComposerFormatCopy.label)

        for (format, label) in zip(formats, labels) {
            XCTAssertFalse(label.isEmpty, "\(format) n'a aucun libellé")
            XCTAssertFalse(
                label.hasPrefix("composer.format."),
                "\(format) rend sa CLÉ (\(label)) — la clé n'est pas résolue, l'éventail afficherait un identifiant nu"
            )
        }
        XCTAssertEqual(Set(labels).count, formats.count,
                       "Deux formats partagent le même libellé — l'éventail devient illisible")
    }

    // MARK: - Les chips se lisent sur les TROIS teintes du plateau

    /// L'éventail vit SUR le plateau, dont la teinte est un réglage de l'auteur
    /// (O6). Mesurer sur la seule teinte par défaut laisserait deux fonds sur
    /// trois non vérifiés. Les deux fonds mesurés sont ceux que la vue peint
    /// vraiment — le voile du chip sélectionné est lu depuis
    /// `ComposerFormatFanPalette`, jamais recopié ici.
    func test_fanChips_meetAA_onEveryPlateauTint() {
        for tint in PlateauTint.allCases {
            let unselected = WCAGContrast.ratioOfTranslucentForeground(
                MeeshyColors.textSecondary(isDark: true), on: tint.color
            )
            XCTAssertGreaterThanOrEqual(
                unselected, 4.5,
                "Chip non sélectionné sur \(tint.rawValue) : \(WCAGContrast.fmt(unselected)):1 — sous AA texte normal"
            )

            let selectedBackground = WCAGContrast.composite(
                ComposerFormatFanPalette.selectedFill, over: tint.color
            )
            let selected = WCAGContrast.ratioOfTranslucentForeground(
                MeeshyColors.textPrimary(isDark: true), on: selectedBackground
            )
            XCTAssertGreaterThanOrEqual(
                selected, 4.5,
                "Chip sélectionné sur \(tint.rawValue) : \(WCAGContrast.fmt(selected)):1 — sous AA texte normal"
            )
        }
    }

    // MARK: - Gardes de SOURCE

    private func fanSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerFormatFan.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Le garde-fou des gardes NÉGATIVES ci-dessous : sans lui, un chemin devenu
    /// faux les ferait toutes passer sur une chaîne vide (« vert par omission »).
    func test_theGuardsReadANonEmptySource() throws {
        let code = try fanSource()
        XCTAssertGreaterThan(code.count, 400, "La source de l'éventail est introuvable ou vide — les gardes ci-dessous ne mesureraient RIEN")
        XCTAssertTrue(code.contains("struct ComposerFormatFan"), "Le fichier lu n'est pas celui de l'éventail")
    }

    /// **RETOURNÉE au #4071 — un FORMAT impossible est GRISÉ AVEC SA RAISON.**
    ///
    /// Elle interdisait le grisage au nom de la loi 4, et c'était la bonne
    /// lecture pour un CONTRÔLE. L'arbitrage produit #4030 nomme l'exception, et
    /// il nomme aussi les vues qu'elle gouverne — `1a` `2a` `2k` `3a` `4f` : un
    /// profil impossible est montré désactivé avec sa raison, jamais masqué.
    ///
    /// La frontière tient en une phrase : **un contrôle sans effet est absent ;
    /// un format qu'on ne peut pas encore prendre est une règle du produit qu'il
    /// faut apprendre à l'auteur.** Le premier n'a rien à dire, le second a tout
    /// à dire — la doctrine de `2a` l'écrit ainsi : « l'utilisateur apprend la
    /// règle au lieu de la deviner ».
    ///
    /// Mesuré avant le retournement : depuis l'entrée Post, l'éventail n'offrait
    /// que Post et Story. « Réel » et « Mood » n'y figuraient pas du tout, et
    /// rien ne disait pourquoi — la bascule semblait ne pas exister.
    ///
    /// **Ce que la garde protège désormais** : qu'un refus ne soit jamais MUET.
    /// Un item éteint sans raison ne vaut pas mieux qu'un item absent — il dit
    /// « non » sans dire quoi faire.
    func test_fan_greysAnImpossibleFormat_andAlwaysSaysWhy() throws {
        let code = try fanSource()
        XCTAssertTrue(code.contains(".disabled(!verdict.isChoosable)"),
                      "un format non offert reste au menu, éteint (#4030)")
        XCTAssertTrue(code.contains("verdict.reason"),
                      "et son extinction porte SA raison — sinon elle n'enseigne rien")
        XCTAssertFalse(code.contains(".grayscale("),
                       "l'extinction passe par `.disabled`, pas par un filtre visuel : "
                       + "un item grisé au pixel reste tapable")
    }

    /// Garde NÉGATIVE — l'éventail LIT la table, il ne la double pas. Une liste
    /// de formats écrite dans la vue deviendrait une seconde source de vérité,
    /// muette le jour où une porte changerait son offre.
    func test_fan_iteratesTheOfferedFormats_ratherThanEnumeratingThemItself() throws {
        let code = try fanSource()
        // L'itération porte désormais sur les VERDICTS, qui se calculent à
        // partir de `offeredFormats` — la table reste donc la seule source, mais
        // elle passe par la règle qui décide ce que chaque format VAUT (#4030).
        XCTAssertTrue(code.contains("ComposerFormatAvailability.verdicts("),
                      "L'éventail lit les verdicts, calculés depuis `offeredFormats`")
        XCTAssertTrue(code.contains("offered: offeredFormats"),
                      "et `offeredFormats` en est bien l'entrée — la table reste la seule source")
        XCTAssertFalse(code.contains("[.story, .post, .reel, .status]"),
                       "Une liste de formats écrite dans la vue double la table de C1")
    }
}
