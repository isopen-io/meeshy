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

    /// Garde NÉGATIVE — loi 4. Griser est la pente naturelle : c'est une ligne
    /// de moins que retirer, et ça « montre à l'utilisateur ce qu'il pourrait
    /// avoir ». C'est précisément ce que la doctrine refuse — une affordance
    /// montée puis désactivée est une promesse non tenue.
    func test_fan_neverGreysAFormat_itRemovesIt() throws {
        let code = try fanSource()
        XCTAssertFalse(code.contains(".disabled("), "L'éventail ne grise aucun format (loi 4) — il ne le monte pas")
        XCTAssertFalse(code.contains(".grayscale("), "Idem : pas de format éteint visuellement")
        XCTAssertFalse(code.contains("allowsHitTesting(false)"), "Idem : pas de chip mort au toucher")
    }

    /// Garde NÉGATIVE — l'éventail LIT la table, il ne la double pas. Une liste
    /// de formats écrite dans la vue deviendrait une seconde source de vérité,
    /// muette le jour où une porte changerait son offre.
    func test_fan_iteratesTheOfferedFormats_ratherThanEnumeratingThemItself() throws {
        let code = try fanSource()
        XCTAssertTrue(code.contains("ForEach(Array(offeredFormats.enumerated())"),
                      "L'éventail itère `offeredFormats` — la table reste la seule source")
        XCTAssertFalse(code.contains("[.story, .post, .reel, .status]"),
                       "Une liste de formats écrite dans la vue double la table de C1")
    }
}
