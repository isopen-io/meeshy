import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// V2 — **la surface « document sans scène »**, et la règle qui la choisit.
///
/// Pourquoi cette tâche commande V3 : `.feedComposer` est la porte la plus
/// utilisée de l'app et elle route encore vers sa feuille historique, parce que
/// le meuble n'avait qu'une surface — l'atelier de scène du SDK. La spec v1 le
/// pose : « recâbler la porte la plus utilisée sans elle serait une
/// régression ».
///
/// Cette suite éprouve TROIS choses, et aucune n'a besoin de monter une vue :
/// 1. le ROUTAGE de surface — quelle surface pour quelle ouverture, quel format ;
/// 2. la RANGÉE d'outils comme donnée — l'ordre de la feuille historique, et la
///    loi 4 : un outil non servi est absent, jamais grisé ;
/// 3. le CHEMIN D'ENVOI — la capacité dont l'oubli PERD du contenu.
final class ComposerDocumentSurfaceTests: XCTestCase {

    private static let tousLesFormats: [ComposerFormat] = [.story, .post, .reel, .status]
    private static let toutesLesOuvertures: [ComposerOpening] = [
        .cameraReady, .keyboardOnContent, .videoCameraReady, .moodGrid, .resume
    ]

    private func nom(_ format: ComposerFormat) -> String {
        switch format {
        case .story: return "story"
        case .post: return "post"
        case .reel: return "reel"
        case .status: return "status"
        }
    }

    private func nom(_ opening: ComposerOpening) -> String {
        switch opening {
        case .cameraReady: return "cameraReady"
        case .keyboardOnContent: return "keyboardOnContent"
        case .videoCameraReady: return "videoCameraReady"
        case .moodGrid: return "moodGrid"
        case .resume: return "resume"
        }
    }

    // MARK: - Le routage de surface

    /// La porte la plus utilisée de l'app ouvre un DOCUMENT. C'est toute la
    /// raison d'être de V2 : sans cette ligne, V3 n'a nulle part où atterrir.
    ///
    /// Ce qu'il ne prouve PAS, et c'est pourquoi le lot 3 en écrit un second
    /// juste en dessous : que la porte ATTEINT cette règle. `surface(opening:
    /// format:)` est une fonction pure, et l'interroger sur le profil du fil
    /// reste vert que la porte route vers sa feuille historique ou non. Il dit
    /// « si le meuble sert cette porte, il lui monte un document » ; il ne dit
    /// rien du « si ».
    func test_surface_duFeedComposer_estLeDocument() {
        let profil = ComposerProfile.profile(for: .feedComposer)

        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: profil.opensWith, format: profil.initialFormat),
            .document,
            "Le composer du fil ouvre un texte et des pièces jointes, pas un canvas."
        )
    }

    /// La promesse que V3 attend, et la seconde condition de levée de l'éventail :
    /// choisir « Story » depuis le fil doit changer la surface, pas seulement
    /// un libellé.
    func test_surface_duFeedComposer_devientLaScene_quandLAuteurChoisitLaStory() {
        let profil = ComposerProfile.profile(for: .feedComposer)

        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: profil.opensWith, format: .story),
            .scene,
            "Basculer le document en story doit ouvrir l'atelier — sinon le choix ne change rien."
        )
    }

    /// La règle contre-intuitive, et celle qui protège le travail de l'auteur :
    /// une porte qui a ouvert une CAPTURE garde sa scène même passée en post.
    /// Faire décider le format seul viderait l'écran de quiconque tape « Post »
    /// depuis le tray, alors que la loi 9 autorise à changer de format, jamais
    /// à jeter ce qui est composé.
    func test_surface_duStoryTray_resteLaScene_memeAuFormatPost() {
        let profil = ComposerProfile.profile(for: .storyTray)

        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: profil.opensWith, format: .post),
            .scene,
            "Le canvas déjà composé ne disparaît pas parce que l'auteur publie en post."
        )
    }

    func test_surface_desOuverturesDeCapture_estToujoursLaScene() {
        for opening in [ComposerOpening.cameraReady, .videoCameraReady] {
            for format in Self.tousLesFormats {
                XCTAssertEqual(
                    ComposerSurfaceRouting.surface(opening: opening, format: format), .scene,
                    "\(nom(opening)) a ouvert une capture : il y a une scène, quel que soit \(nom(format))."
                )
            }
        }
    }

    /// Invariant traversant : une story et un réel ne sont JAMAIS un document.
    /// Des pages et une prise continue ont besoin d'un canvas ; les servir sans
    /// scène perdrait tout ce qui les distingue d'un post.
    func test_surface_storyEtReel_neSontJamaisUnDocument() {
        for opening in Self.toutesLesOuvertures {
            for format in [ComposerFormat.story, .reel] {
                XCTAssertEqual(
                    ComposerSurfaceRouting.surface(opening: opening, format: format), .scene,
                    "\(nom(format)) sous \(nom(opening)) doit garder sa scène."
                )
            }
        }
    }

    /// Le miroir du précédent : hors capture ET hors reprise, un POST est
    /// toujours un document.
    ///
    /// **Ce test disait « un post ET un mood » jusqu'au lot 4**, et son nom le
    /// dit encore dans l'historique. Il a été SCINDÉ, jamais amputé : le mood a
    /// gagné sa propre surface, et laisser les deux formats dans une même
    /// boucle aurait obligé à retirer `.status` d'ici — c'est-à-dire à perdre
    /// silencieusement la moitié de la couverture au lieu de la déplacer.
    ///
    /// Les CINQ tests de cette section couvrent la table ENTIÈRE sans trou :
    /// les deux ouvertures de capture (2 × 4 formats) + la reprise (1 × 4) +
    /// les deux ouvertures restantes, séparées par format (2 × 1 pour le post,
    /// 2 × 1 pour le mood, et 2 × 2 pour story/réel déjà couverts plus haut)
    /// = les 20 combinaisons.
    func test_surface_lePost_horsCaptureEtHorsReprise_estToujoursUnDocument() {
        for opening in [ComposerOpening.keyboardOnContent, .moodGrid] {
            XCTAssertEqual(
                ComposerSurfaceRouting.surface(opening: opening, format: .post), .document,
                "Un post sous \(nom(opening)) n'a pas de scène à ouvrir, et son texte est long."
            )
        }
    }

    /// **Lot 4 — le mood a QUITTÉ le document.**
    ///
    /// Il y était rangé faute de troisième cas, pas par mesure : un mood n'a ni
    /// pièce jointe (`allowsCapture: false`), ni rangée d'outils à servir, ni
    /// texte long. Lui monter l'éditeur du document aurait affiché un
    /// `TextEditor` vide là où l'auteur attend dix emojis.
    func test_surface_leMood_horsCaptureEtHorsReprise_estSaPropreSurface() {
        for opening in [ComposerOpening.keyboardOnContent, .moodGrid] {
            XCTAssertEqual(
                ComposerSurfaceRouting.surface(opening: opening, format: .status), .mood,
                "Un mood sous \(nom(opening)) ouvre SA surface — ni scène, ni document."
            )
        }
    }

    /// **Le cas qui prouve que la règle porte sur le FORMAT, pas sur
    /// l'ouverture.** Republier un mood n'ouvre pas `.moodGrid` mais
    /// `.keyboardOnContent` (le profil `.repost` ouvre ainsi, quel que soit le
    /// format de sa source) — et pourtant la surface montée doit être la même
    /// que celle de la création. Sans ce cas, écrire la règle sur l'OUVERTURE
    /// resterait vert ici, et la republication d'un mood (lot 4.7) atterrirait
    /// sur un éditeur de texte.
    func test_surface_republierUnMood_ouvreLaMemeSurface_queLeCreer() {
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: .keyboardOnContent, format: .status),
            ComposerSurfaceRouting.surface(opening: .moodGrid, format: .status),
            "La republication et la création d'un mood doivent monter la MÊME surface."
        )
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: .keyboardOnContent, format: .status), .mood
        )
    }

    /// Garde NÉGATIVE de la surface neuve : **rien d'autre que le format
    /// `.status` ne rend `.mood`**. Sans elle, élargir la branche par mégarde —
    /// à `.post`, ou à l'ouverture `.moodGrid` quel que soit le format —
    /// resterait vert sous les tests positifs, et un post s'ouvrirait sur une
    /// grille d'emojis sans champ de pièces jointes.
    func test_surface_aucunAutreFormat_neRendLeMood() {
        for opening in Self.toutesLesOuvertures {
            for format in Self.tousLesFormats where format != .status {
                XCTAssertNotEqual(
                    ComposerSurfaceRouting.surface(opening: opening, format: format), .mood,
                    "\(nom(format)) sous \(nom(opening)) n'est pas un mood : sa matière n'est pas une grille d'emojis."
                )
            }
        }
    }

    /// **La mine posée pour V3, désamorcée** (revue adversariale du 2026-08-23).
    ///
    /// `.draft` et `.share` sont les deux SEULES portes `routesToLegacy: nil`
    /// qui ouvrent en `.resume`, et leur `initialFormat` est le `.post`
    /// TRANSITOIRE de la rév. 3. Tant que la reprise laissait le format
    /// décider, le jour où le host serait monté, rouvrir un brouillon aurait
    /// affiché un éditeur de texte VIDE — pendant que le brouillon adopté par
    /// `adoptDraft` attendait dans l'atelier, juste derrière.
    ///
    /// La règle est donc : une reprise monte la surface où la composition
    /// reprise vit RÉELLEMENT, et le seul mécanisme de reprise du meuble
    /// repeuple l'atelier. **Condition de levée nommée** : le jour où le meuble
    /// sait adopter un brouillon de DOCUMENT, ce test se retourne.
    func test_surface_uneReprise_monteLAtelier_ouLeBrouillonAdopteVitVraiment() {
        for format in Self.tousLesFormats {
            XCTAssertEqual(
                ComposerSurfaceRouting.surface(opening: .resume, format: format), .scene,
                "Une reprise en \(nom(format)) doit montrer le brouillon qu'`adoptDraft` a repeuplé, pas un éditeur vide."
            )
        }
    }

    /// Le test précédent dit la règle ; celui-ci dit POURQUOI elle mord, en
    /// partant des deux portes réelles plutôt que de l'ouverture abstraite.
    /// Sans lui, remettre `.resume` sous la règle du format resterait vert ici
    /// tant que personne ne relie l'ouverture aux portes qui la produisent.
    func test_surface_desDeuxPortesQuiReprennentSansLegacy_estLAtelier() {
        for origin in [ComposerOrigin.draft(id: "brouillon-42"), .share] {
            let profil = ComposerProfile.profile(for: origin)

            XCTAssertNil(
                profil.routesToLegacy,
                "Cette porte ouvre le MEUBLE : ce qu'elle monte est donc gouverné par le routage de surface."
            )
            XCTAssertEqual(profil.opensWith, .resume)
            XCTAssertEqual(
                ComposerSurfaceRouting.surface(opening: profil.opensWith, format: profil.initialFormat),
                .scene,
                "Reprendre un brouillon doit ouvrir l'atelier qui l'a adopté — le `.post` d'ouverture est TRANSITOIRE, "
                    + "et l'écrivain qui devait rebasculer au format du document n'existe pas."
            )
        }
    }

    /// **Lot 3 — le « si » que le test d'ouverture de cette section ne dit pas.**
    ///
    /// `test_surface_duFeedComposer_estLeDocument` interroge une fonction PURE
    /// sur le profil du fil, et reste vert quoi qu'il arrive au routage. Il
    /// décrit une surface que, jusqu'au lot 3, aucun utilisateur n'atteignait :
    /// la porte présentait `FeedComposerSheet` et le meuble n'était jamais
    /// monté sur ce chemin.
    ///
    /// Ce test-ci ferme la chaîne dans l'ordre où elle se parcourt : la porte
    /// atteint le meuble, PUIS le meuble lui monte un document. Le premier
    /// maillon est celui que le lot 3 pose ; le second est celui que le lot 2
    /// avait écrit d'avance.
    func test_surface_duFeedComposer_estAtteinte_depuisQueLaPorteNeRoutePlus() {
        let profil = ComposerProfile.profile(for: .feedComposer)

        XCTAssertNil(
            profil.routesToLegacy,
            "Lot 3 : tant que la porte du fil route vers sa feuille historique, la surface document décrite "
                + "par cette suite est une pièce dont personne n'a la clé."
        )
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: profil.opensWith, format: profil.initialFormat),
            .document,
            "Et ce qu'elle atteint est bien le DOCUMENT — une porte recâblée vers l'atelier de scène aurait "
                + "quitté sa feuille pour un canvas de story, ce que personne n'a demandé en tapant sur le fil."
        )
    }

    /// Les portes que le meuble sert, et la surface que chacune monte —
    /// écrites en toutes lettres plutôt que comptées.
    ///
    /// Un compte serait resté vert le jour où une porte en remplacerait une
    /// autre. Ce tableau-ci rougit dans les DEUX sens : une porte qui quitterait
    /// le périmètre du meuble, et une porte qui changerait de surface sous les
    /// pieds de son auteur. C'est la vue d'ensemble que le lot 3 modifie —
    /// `feedComposer` y entre, et il est la SEULE ligne à monter un document.
    ///
    /// Ce que ce test n'affirme pas : que chacune de ces portes ait un site de
    /// montage en production. Elles ne l'ont pas toutes (les réels sont hors v1,
    /// le média de conversation attend le lot G), et ce n'est pas ici que cela
    /// se mesure — ce tableau parle des PROFILS.
    ///
    /// La garde qui parle des SITES existe depuis la revue du lot 3 :
    /// `MeeshyComposerHostGuardTests`
    /// `.test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`
    /// balaie l'arbre de l'app et rougit le jour où un site monte une
    /// porte-document pendant que le document n'a ni rangée servie, ni issue
    /// pour sa saisie, ni publieur atteignable. Sans elle, la table du lot 3
    /// aurait dit « le meuble sert cette porte » à un lot suivant qui l'aurait
    /// crue, et l'auteur y aurait trouvé un écran sans issue.
    func test_chaquePorteServieParLeMeuble_monteLaSurfaceQueSonFormatCommande() {
        let portesDuMeuble: [(nom: String, origine: ComposerOrigin, surface: ComposerSurfaceKind)] = [
            (nom: "storyTray", origine: .storyTray, surface: .scene),
            (nom: "feedComposer", origine: .feedComposer, surface: .document),
            (nom: "reelTab", origine: .reelTab, surface: .scene),
            // Lot 4.6 / 4.7 : la porte du mood et la republication d'un mood
            // rejoignent le tableau. La table est ADDITIVE — en retirer une
            // entrée sans la remplacer perd une porte de la mesure, en silence.
            (nom: "moodChip", origine: .moodChip, surface: .mood),
            (nom: "repost(status)",
             origine: .repost(ofPostId: "mood-source", sourceFormat: .status),
             surface: .mood),
            (nom: "draft", origine: .draft(id: "brouillon-42"), surface: .scene),
            (nom: "share", origine: .share, surface: .scene),
            (nom: "conversationMedia",
             origine: .conversationMedia(messageId: "msg-7", attachmentId: "piece-3"),
             surface: .scene)
        ]

        for porte in portesDuMeuble {
            let profil = ComposerProfile.profile(for: porte.origine)

            XCTAssertNil(
                profil.routesToLegacy,
                "\(porte.nom) doit être servie par le MEUBLE : une porte qui route vers un composer "
                    + "historique ne monte aucune de ces deux surfaces."
            )
            XCTAssertEqual(
                ComposerSurfaceRouting.surface(opening: profil.opensWith, format: profil.initialFormat),
                porte.surface,
                "\(porte.nom) doit ouvrir sur \(porte.surface) — changer la surface d'une porte change ce "
                    + "que son auteur voit au premier tap, sans qu'aucun libellé ne l'annonce."
            )
        }
    }

    /// **RETOURNÉE au lot 4.6, à la condition de levée qu'elle nommait
    /// elle-même.** Elle affirmait « la surface du mood existe, et AUCUNE porte
    /// ne l'atteint encore » et disait, en toutes lettres, qu'elle se
    /// retournerait — jamais qu'elle se supprimerait — le jour où `.moodChip`
    /// cesserait de router, et pas avant que le socle publie.
    ///
    /// Les deux conditions sont remplies : le socle peint la flèche sous le mood
    /// depuis le lot 4.5, et la porte a cessé de router au lot 4.6.
    ///
    /// Ce qu'elle affirme désormais est la MOITIÉ CONSERVÉE de l'ancienne, plus
    /// son inverse : exactement les portes de format `.status` atteignent la
    /// surface du mood, et aucune autre. Une porte de story ou de post qui s'y
    /// mettrait ouvrirait une grille d'emojis sur un contenu qui n'en a pas.
    func test_surface_leMood_estAtteintParSesDeuxPortes_etParAucuneAutre() {
        let portesDuMood: [(nom: String, origine: ComposerOrigin)] = [
            (nom: "moodChip", origine: .moodChip),
            (nom: "repost(status)", origine: .repost(ofPostId: "mood-source", sourceFormat: .status))
        ]

        for porte in portesDuMood {
            let profil = ComposerProfile.profile(for: porte.origine)
            XCTAssertNil(
                profil.routesToLegacy,
                "\(porte.nom) doit être servie par le MEUBLE — une porte qui route n'atteint aucune surface."
            )
            XCTAssertEqual(
                ComposerSurfaceRouting.surface(opening: profil.opensWith, format: profil.initialFormat), .mood,
                "\(porte.nom) doit ouvrir sur la surface du mood."
            )
        }

        let portesSansMood: [(nom: String, origine: ComposerOrigin)] = [
            (nom: "storyTray", origine: .storyTray),
            (nom: "feedComposer", origine: .feedComposer),
            (nom: "reelTab", origine: .reelTab),
            (nom: "draft", origine: .draft(id: "brouillon-42")),
            (nom: "share", origine: .share),
            (nom: "conversationMedia",
             origine: .conversationMedia(messageId: "msg-7", attachmentId: "piece-3"))
        ]

        for porte in portesSansMood {
            let profil = ComposerProfile.profile(for: porte.origine)
            XCTAssertNil(profil.routesToLegacy, "\(porte.nom) doit rester servie par le meuble.")

            for format in profil.offeredFormats {
                XCTAssertNotEqual(
                    ComposerSurfaceRouting.surface(opening: profil.opensWith, format: format), .mood,
                    "\(porte.nom) atteint la surface mood en \(nom(format)) : elle ouvrirait une grille d'emojis "
                        + "sur un contenu qui n'en a pas."
                )
            }
        }
    }

    /// **La loi 5 est dans la TABLE, et elle n'atteint aucun écran** — dit ici
    /// plutôt que découvert par un auteur.
    ///
    /// Le lot 4.7 fait miroiter la republication d'un mood : `offeredFormats`
    /// rend `[.status, .post]`, l'ANCRAGE est donc offert. Mais l'éventail
    /// (`ComposerFormatFan`) vit dans `plateauTools`, et `plateauTools` n'est
    /// monté que par `composerSurface` — la SCÈNE. Ni la surface du mood ni la
    /// surface document ne le portent : le chip « Post » n'existe sur aucun
    /// écran, et `currentFormat` reste sur `.status`.
    ///
    /// **Ce n'est pas un oubli, c'est le refus explicite du lot 4.5.** Descendre
    /// l'éventail sous le mood rendrait la surface document ATTEIGNABLE en
    /// production, et le socle y peint encore deux affordances sans objet : un
    /// témoin d'audience INERTE (`audienceChip` est un `Label`, personne n'écrit
    /// l'audience sous le document) et un œil qui ouvrirait une scène VIDE
    /// (`viewModel.currentEffects` n'est rempli par personne sous cette surface,
    /// faute de chemin d'ingestion). Loi 4 : une affordance non offerte est
    /// ABSENTE, jamais inerte.
    ///
    /// **Condition de levée NOMMÉE, et elle est app-side** : que
    /// `ComposerChromeOwnership.socleZones(for: .document)` cesse de promettre
    /// ce que le document ne tient pas — ou que le document gagne un écrivain
    /// d'audience et un canvas. Ce test se RETOURNE alors ; il ne se supprime
    /// pas. Le jour où il rougira, la question à trancher est celle du socle du
    /// document, pas celle de l'éventail.
    func test_leRepostDUnMood_offreLAncrage_maisAucunEcranNeLePeint() throws {
        let profil = ComposerProfile.profile(for: .repost(ofPostId: "mood-source", sourceFormat: .status))

        XCTAssertEqual(
            profil.offeredFormats, [.status, .post],
            "La table MIROITE : l'éphémère reste éphémère, et le post est l'ancrage explicite (loi 5)."
        )
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: profil.opensWith, format: .post), .document,
            "Le chip d'ancrage mènerait à la surface document — c'est là qu'est le blocage."
        )
        XCTAssertTrue(
            ComposerChromeOwnership.socleZones(for: .document).contains(.preview),
            "Le socle du document peint encore un œil, et il n'a pas de canvas à lire. C'est LA raison pour "
                + "laquelle l'éventail ne descend pas : rendre le document atteignable livrerait cette "
                + "affordance sans objet."
        )

        let source = try sourceDuMeuble()
        guard let plateau = corpsDeDeclaration(commencantPar: "private var plateauTools", dans: source),
              let scene = corpsDeDeclaration(commencantPar: "private var composerSurface", dans: source),
              let mood = corpsDeDeclaration(commencantPar: "private var moodSurface", dans: source),
              let document = corpsDeDeclaration(commencantPar: "private var documentSurface", dans: source) else {
            return XCTFail("Les quatre blocs du meuble sont introuvables — la garde ne mesurerait RIEN.")
        }

        XCTAssertTrue(plateau.contains("ComposerFormatFan("), "Le bloc lu n'est pas celui du plateau.")
        XCTAssertTrue(scene.contains("plateauTools"), "Le bloc lu n'est pas celui de la scène.")
        XCTAssertFalse(
            mood.contains("plateauTools") || mood.contains("ComposerFormatFan("),
            "La surface du mood peint l'éventail : le chip « Post » devient atteignable, et il mène au socle "
                + "du document, qui peint encore une audience inerte et un œil sans canvas."
        )
        XCTAssertFalse(
            document.contains("plateauTools") || document.contains("ComposerFormatFan("),
            "La surface document peint l'éventail : basculer vers `.story` y monterait l'atelier, et "
                + "`documentText` n'a aucun chemin pour l'y suivre — la saisie disparaîtrait sans un mot."
        )
    }

    /// La source du meuble, commentaires RETIRÉS : `plateauTools` et
    /// `ComposerFormatFan` sont nommés dans plusieurs doc-comments de ce
    /// fichier, et un `.contains` qui matche un commentaire ne prouve rien.
    private func sourceDuMeuble() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Le corps d'un BLOC par appariement d'accolades. `nil` quand l'ancre a
    /// disparu — l'appelant fait alors rougir, jamais passer.
    private func corpsDeDeclaration(commencantPar ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var corps = ""
        for caractere in code[debut.lowerBound...] {
            corps.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return corps }
            }
        }
        return nil
    }

    // MARK: - Le commentaire de règle, gardé comme le code

    /// **La règle 3 disait « un post et un mood sont des documents ».**
    ///
    /// Le lot 4 rend cette phrase fausse au moment même où il ajoute `case
    /// mood`, et elle vivait à trois lignes de la branche modifiée. Un
    /// commentaire de RÈGLE laissé sous un code qui l'a démenti devient la loi
    /// que lira la session suivante — celle qui rangerait le prochain format
    /// « comme le mood », c'est-à-dire dans le document.
    ///
    /// **Cette garde lit la source AVEC ses commentaires**, à rebours de toutes
    /// les autres de cette suite : c'est le commentaire lui-même qui est
    /// l'objet mesuré. `AppSourceGuard.stripComments` le ferait disparaître, et
    /// la garde passerait au vert sur une phrase intacte.
    func test_leCommentaireDeRegle_naffirmePlus_queLeMoodEstUnDocument() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        // COMPACTÉ : la phrase interdite tient sur deux lignes dans l'historique
        // du fichier, et une recherche brute l'aurait manquée pour un simple
        // retour à la ligne — le contournement que la revue a déjà trouvé sur
        // quatre gardes de ce dépôt.
        let compacte = brut.split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" }).joined(separator: " ")

        XCTAssertTrue(
            brut.contains("nonisolated enum ComposerSurfaceKind"),
            "Source de la règle introuvable — la garde ne mesurerait RIEN."
        )
        XCTAssertFalse(
            compacte.contains("un post et un mood sont des documents"),
            "La règle 3 affirme encore que le mood est un document, sous un code qui lui donne sa propre surface."
        )
        XCTAssertTrue(
            brut.contains("case mood"),
            "L'énumération doit porter le cas `mood` — sans lui, la phrase retirée n'aurait été qu'une coupe."
        )
    }

    // MARK: - Le clavier

    /// Le clavier ne se lève que là où la porte a promis qu'on écrirait
    /// d'emblée. Une reprise de brouillon fait exception à dessein : le clavier
    /// recouvrirait le document qu'on vient de rouvrir pour le relire.
    func test_clavier_seLeveALaSeuleOuvertureQuiLaPromis() {
        XCTAssertTrue(ComposerSurfaceRouting.focusesContentOnAppear(opening: .keyboardOnContent))

        for opening in [ComposerOpening.cameraReady, .videoCameraReady, .moodGrid, .resume] {
            XCTAssertFalse(
                ComposerSurfaceRouting.focusesContentOnAppear(opening: opening),
                "\(nom(opening)) n'a promis aucun champ à remplir : lever le clavier masquerait l'écran."
            )
        }
    }

    // MARK: - La rangée d'outils

    /// L'ordre n'est pas décoratif : c'est la position que les doigts
    /// connaissent depuis des mois sur `FeedComposerSheet`. Le réordonner
    /// déplacerait six affordances d'un coup, sans que personne l'ait demandé.
    func test_rangCanonique_miroiteLaFeuilleHistorique_dansSonOrdre() {
        XCTAssertEqual(
            ComposerDocumentTool.canonicalRow,
            [.photo, .camera, .emoji, .document, .place, .microphone],
            "photo · caméra · emoji · document · lieu · micro — l'ordre de la feuille absorbée."
        )
    }

    /// Un outil ajouté à l'énumération et oublié de la rangée serait invisible
    /// pour toujours, sans le moindre signal.
    func test_rangCanonique_nOublieAucunOutil() {
        XCTAssertEqual(
            Set(ComposerDocumentTool.canonicalRow), Set(ComposerDocumentTool.allCases),
            "Un outil hors de la rangée canonique n'est monté nulle part."
        )
        XCTAssertEqual(
            ComposerDocumentTool.canonicalRow.count, ComposerDocumentTool.allCases.count,
            "La rangée ne répète aucun outil."
        )
    }

    func test_chaqueOutil_aSonSymboleEtSonLibelle_tousDistincts() {
        let symboles = ComposerDocumentTool.allCases.map(\.symbolName)
        let libelles = ComposerDocumentTool.allCases.map { ComposerDocumentCopy.label($0) }

        XCTAssertEqual(Set(symboles).count, symboles.count, "Deux outils qui partagent un glyphe sont indiscernables.")
        XCTAssertEqual(Set(libelles).count, libelles.count, "Deux outils qui partagent un libellé le sont pour VoiceOver.")
        XCTAssertFalse(libelles.contains(where: \.isEmpty), "Un libellé vide laisse un bouton muet.")
    }

    /// Loi 4 — un outil non servi est ABSENT, jamais grisé. La caméra disparaît
    /// de la rangée quand la porte refuse la capture (repost, édition) au lieu
    /// d'y rester inerte.
    func test_outils_laCameraDisparait_quandLaPorteRefuseLaCapture() {
        let visibles = ComposerDocumentToolPolicy.visibleTools(
            served: ComposerDocumentTool.canonicalRow,
            allowsCapture: false
        )

        XCTAssertFalse(visibles.contains(.camera), "Une capture refusée retire l'outil, elle ne le grise pas.")
        XCTAssertEqual(
            visibles, [.photo, .emoji, .document, .place, .microphone],
            "Les cinq autres gardent leur ordre : le retrait ne réorganise pas la rangée."
        )
    }

    func test_outils_laCameraReste_quandLaPorteAutoriseLaCapture() {
        XCTAssertEqual(
            ComposerDocumentToolPolicy.visibleTools(
                served: ComposerDocumentTool.canonicalRow,
                allowsCapture: true
            ),
            ComposerDocumentTool.canonicalRow
        )
    }

    /// Ce que le meuble fait AUJOURD'HUI : il ne sert aucun outil, donc aucune
    /// rangée n'est peinte. C'est ce qui autorise la surface à exister avant
    /// que l'ingestion soit branchée sans devenir une affordance sans effet.
    func test_outils_unSiteQuiNEnSertAucun_nEnMontreAucun() {
        XCTAssertTrue(
            ComposerDocumentToolPolicy.visibleTools(served: [], allowsCapture: true).isEmpty
        )
        XCTAssertTrue(
            ComposerDocumentToolPolicy.visibleTools(served: [], allowsCapture: false).isEmpty
        )
    }

    // MARK: - Le chemin d'envoi — la capacité dont l'oubli PERD du contenu

    /// **La garde qui compte.** Hors ligne, aucune composition ne part par
    /// l'upload tus : il jette dès sa première requête, et le post est perdu
    /// sans que rien ne le rattrape. Inverser l'ordre des questions dans
    /// `path(isQuote:hasLocalMedia:isOffline:)` fait rougir ce test.
    func test_envoi_horsLigne_aucuneCompositionNePartParLUpload() {
        for hasLocalMedia in [true, false] {
            let chemin = ComposerDocumentSendRouting.path(
                isQuote: false, hasLocalMedia: hasLocalMedia, isOffline: true
            )
            XCTAssertNotEqual(chemin, .upload, "L'upload jette hors ligne — le contenu serait perdu.")
            XCTAssertTrue(chemin.isDurable, "Hors ligne, une composition non citée doit survivre au kill de l'app.")
        }
    }

    func test_envoi_horsLigne_avecMedia_prendLaFileDurable() {
        XCTAssertEqual(
            ComposerDocumentSendRouting.path(isQuote: false, hasLocalMedia: true, isOffline: true),
            .durableOutbox
        )
    }

    /// Un texte (ou un lieu) seul est déjà durable des deux côtés du réseau :
    /// `createPost` l'enfile lui-même quand la connexion manque. Le router vers
    /// la file média lui ferait traverser un pipeline d'upload sans fichier.
    func test_envoi_texteSeul_resteSurLeCheminDejaDurable() {
        XCTAssertEqual(
            ComposerDocumentSendRouting.path(isQuote: false, hasLocalMedia: false, isOffline: false),
            .textOnly
        )
        XCTAssertEqual(
            ComposerDocumentSendRouting.path(isQuote: false, hasLocalMedia: false, isOffline: true),
            .textOnly
        )
    }

    func test_envoi_enLigne_avecMedia_passeParLUpload() {
        XCTAssertEqual(
            ComposerDocumentSendRouting.path(isQuote: false, hasLocalMedia: true, isOffline: false),
            .upload
        )
    }

    /// La citation part par `POST /posts/:id/repost`, qui n'a pas de file
    /// durable — mesuré sur `FeedViewModel.repostPost`, un appel réseau direct
    /// dont l'échec ne produit qu'un toast. Le test le GRAVE plutôt que de le
    /// laisser se redécouvrir : c'est la seule sortie non durable de la
    /// surface, et elle prime sur toutes les autres questions.
    func test_envoi_uneCitation_prendLeCheminDuRepost_quoiQuIlArrive() {
        for hasLocalMedia in [true, false] {
            for isOffline in [true, false] {
                XCTAssertEqual(
                    ComposerDocumentSendRouting.path(
                        isQuote: true, hasLocalMedia: hasLocalMedia, isOffline: isOffline
                    ),
                    .quotedRepost
                )
            }
        }
        XCTAssertFalse(
            ComposerDocumentSendPath.quotedRepost.isDurable,
            "La route du repost n'est pas enfilée : une citation composée hors ligne est perdue. "
                + "Constat consigné, non corrigé par V2 — la file du repost n'existe pas."
        )
    }

    /// La durabilité est une propriété du CHEMIN, pas du site d'appel : la
    /// déclarer ici évite qu'un futur chemin s'ajoute sans qu'on ait tranché
    /// s'il survit au hors-ligne.
    func test_durabilite_estDeclareeCheminParChemin() {
        XCTAssertTrue(ComposerDocumentSendPath.textOnly.isDurable)
        XCTAssertTrue(ComposerDocumentSendPath.durableOutbox.isDurable)
        XCTAssertFalse(ComposerDocumentSendPath.upload.isDurable)
        XCTAssertFalse(ComposerDocumentSendPath.quotedRepost.isDurable)
    }

    // MARK: - LA SORTIE

    /// **Le correctif bloquant de V2 bis.** `onDismiss` n'était atteignable que
    /// sous la SCÈNE, où l'atelier du SDK peint la croix. Le document n'a pas
    /// d'atelier : la surface était un écran sans issue, et V3 devait la
    /// brancher sur `.feedComposer` — la porte la plus utilisée de l'app.
    ///
    /// Ce que ce test prouve, exactement : la surface PORTE une sortie, et
    /// cette sortie appelle ce que le site de montage lui a confié. Il ne
    /// prouve pas qu'un bouton la déclenche — c'est
    /// `test_laSurface_peintSaSortie_etLeCorpsLaMonte` qui s'en charge, ni que
    /// le meuble lui passe la sienne — c'est
    /// `MeeshyComposerHostGuardTests.test_host_donneSaSortie_aLaSurfaceDocument`.
    /// Les trois ensemble couvrent la chaîne ; aucune seule ne suffit.
    ///
    /// Le rappel est déclaré NON OPTIONNEL et sans valeur par défaut : c'est le
    /// compilateur, et non ce test, qui interdit au prochain site de montage
    /// d'omettre la sortie.
    @MainActor
    func test_laSortie_estUnRappelQueLaSurfaceSaitDeclencher() {
        var fermetures = 0
        let surface = ComposerDocumentSurface(
            text: .constant(""),
            tools: [],
            focusesOnAppear: false,
            onClose: { fermetures += 1 }
        )

        surface.onClose()

        XCTAssertEqual(
            fermetures, 1,
            "La surface doit relayer la fermeture au site qui la monte — sans quoi le document n'a aucune issue."
        )
    }

    // MARK: - Gardes de SOURCE sur la surface

    private func surfaceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Le corps du BLOC `struct ComposerDocumentSurface`, et non le fichier.
    ///
    /// Le fichier porte DIX autres types (`ComposerSurfaceKind`,
    /// `ComposerSurfaceRouting`, `ComposerChromeOwnership`,
    /// `ComposerDocumentTool`, `ComposerDocumentToolPolicy`,
    /// `ComposerDocumentSendPath`, `ComposerDocumentSendRouting`,
    /// `ComposerDocumentPublishGate`, `ComposerDocumentDraft`, et
    /// `ComposerDocumentCopy`) : une garde
    /// ancrée sur le fichier condamnerait ces voisins en croyant protéger la
    /// vue, et se relâcherait le jour où l'interdit migrerait d'un type à
    /// l'autre. `nil` quand l'ancre a disparu — l'appelant fait alors rougir,
    /// jamais passer. Jumeau assumé de `ComposerSourceGuard.functionBody(named:in:)`,
    /// qui vit dans le bundle de tests du SDK et n'est pas atteignable d'ici.
    private func blockBody(startingAt anchor: String, in code: String) -> String? {
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

    /// Une ancre disparue lève une ERREUR, jamais un `XCTSkip` : un test sauté
    /// est vert au tableau, et une garde négative qui se saute est une garde
    /// qui est morte sans le dire.
    private struct AncreIntrouvable: Error, CustomStringConvertible {
        let description = "Le bloc `struct ComposerDocumentSurface` est introuvable — la garde ne mesurerait RIEN"
    }

    private func surfaceBlock() throws -> String {
        guard let bloc = blockBody(startingAt: "struct ComposerDocumentSurface", in: try surfaceSource()) else {
            throw AncreIntrouvable()
        }
        return bloc
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// Le garde-fou des gardes NÉGATIVES ci-dessous : sans lui, un chemin
    /// devenu faux les ferait toutes passer sur une chaîne vide. Il mesure
    /// aussi le BLOC, pas seulement le fichier — une ancre renommée rendrait
    /// les gardes de bloc vertes sur une chaîne vide exactement de la même
    /// façon.
    func test_laGardeLitUneSourceNonVide() throws {
        let code = try surfaceSource()
        XCTAssertGreaterThan(code.count, 400, "La source de la surface est introuvable ou vide.")
        XCTAssertTrue(code.contains("struct ComposerDocumentSurface"), "Le fichier lu n'est pas celui de la surface.")

        guard let bloc = blockBody(startingAt: "struct ComposerDocumentSurface", in: code) else {
            return XCTFail("Le bloc `struct ComposerDocumentSurface` est introuvable — les gardes de bloc ne mesureraient RIEN")
        }
        XCTAssertGreaterThan(bloc.count, 400, "Le bloc lu est vide : l'appariement d'accolades a échoué.")
        XCTAssertTrue(bloc.contains("var body"), "Le bloc lu n'est pas celui de la vue.")
        XCTAssertFalse(
            bloc.contains("enum ComposerDocumentSendRouting"),
            "Le bloc déborde sur les types voisins — la garde ne serait plus ancrée sur la vue."
        )
    }

    /// La SORTIE est PEINTE, pas seulement portée. Un rappel stocké que rien ne
    /// déclenche laisserait exactement le cul-de-sac qu'on corrige.
    ///
    /// Elle COMPTE un symbole nommé au lieu de chercher un littéral : la revue
    /// a trouvé quatre gardes de ce dépôt qu'un simple retour à la ligne
    /// contournait. `onClose` doit apparaître au moins deux fois dans le bloc —
    /// sa déclaration, et le bouton qui l'appelle — et `exitAffordance` au
    /// moins deux fois aussi : sa déclaration, et son montage dans `body`.
    func test_laSurface_peintSaSortie_etLeCorpsLaMonte() throws {
        let bloc = try surfaceBlock()

        XCTAssertGreaterThanOrEqual(
            occurrences(of: "onClose", in: bloc), 2,
            "`onClose` doit être déclaré ET déclenché : un rappel que rien n'appelle ne fait sortir personne."
        )
        XCTAssertGreaterThanOrEqual(
            occurrences(of: "exitAffordance", in: bloc), 2,
            "L'issue doit être une propriété NOMMÉE et montée dans le corps de la vue."
        )

        guard let corps = blockBody(startingAt: "var body", in: bloc) else {
            return XCTFail("Le corps de la vue doit être une propriété nommée `body` — la garde s'ancre dessus")
        }
        XCTAssertTrue(
            corps.contains("exitAffordance"),
            "L'issue est déclarée mais absente du corps : la surface resterait un écran dont on ne sort pas."
        )
    }

    /// **Le cliquet, protégé par une garde nommée.** Les six libellés d'outils
    /// réutilisent la famille `composer.attach.*`, traduite dans les sept
    /// langues du catalogue et déjà employée par `UniversalComposerBar` — au
    /// lieu des six `composer.document.tool.*` que la rév. précédente avait
    /// écrits, qui répliquaient mot pour mot des libellés existants et que
    /// `FrenchDefaultValueRatchetTests` (tolérance ZÉRO) aurait fait rougir.
    ///
    /// Elle compte les clés attendues plutôt que d'inspecter le rendu : une
    /// clé absente du catalogue ne se voit pas à l'exécution, elle se voit dans
    /// la source.
    func test_lesLibellesDOutils_reutilisentLaFamilleDattacheDejaTraduite() throws {
        let code = try surfaceSource()

        for cle in ["composer.attach.photo", "composer.attach.camera", "composer.attach.emoji",
                    "composer.attach.file", "composer.attach.location", "composer.attach.voice"] {
            XCTAssertTrue(
                code.contains("\"\(cle)\""),
                "L'outil doit parler le vocabulaire d'attache déjà traduit : « \(cle) » manque."
            )
        }
        XCTAssertEqual(
            occurrences(of: "composer.document.tool.", in: code), 0,
            "Une clé neuve par outil doublerait six libellés existants — deux traductions à faire diverger, "
                + "et six crans de plus vers le plafond du cliquet."
        )
        XCTAssertEqual(
            Set(ComposerDocumentTool.allCases.map { ComposerDocumentCopy.label($0) }).count,
            ComposerDocumentTool.allCases.count,
            "La réutilisation ne doit pas rendre deux outils indiscernables pour VoiceOver."
        )
    }

    /// La sortie ne fabrique pas une clé de plus pour un mot déjà traduit sept
    /// fois. Le cliquet de complétude du dépôt est épinglé à un plafond.
    func test_laSortie_reutiliseLaCleDeFermetureDejaTraduite() throws {
        let code = try surfaceSource()
        XCTAssertTrue(
            code.contains("\"common.close\""),
            "La sortie doit réutiliser `common.close` — traduite dans les sept langues du catalogue."
        )
        XCTAssertFalse(
            code.contains("composer.document.close"),
            "Une clé neuve pour « Fermer » rapprocherait le cliquet de son plafond pour rien."
        )
    }

    /// Garde NÉGATIVE — elle rougit à la RÉINTRODUCTION d'un envoi dans la
    /// surface. La surface PRÉSENTE ; le socle du meuble nomme la publication
    /// et le SDK la déclenche. Une surface qui publierait elle-même ouvrirait
    /// le second chemin d'envoi que la doctrine, C2 et V7 interdisent tous les
    /// trois — et l'ouvrirait dans le fichier que personne ne pense à relire.
    ///
    /// **Ancrée sur le BLOC de la vue**, pas sur le fichier : celui-ci porte
    /// aussi `ComposerDocumentSendRouting`, dont la raison d'être est
    /// justement de NOMMER ces chemins. Une garde de fichier aurait interdit
    /// d'en documenter un seul.
    func test_laSurface_nOuvreAucunCheminDePublication() throws {
        let bloc = try surfaceBlock()
        for interdit in ["PostService", "TusUploadManager", "createPost(", "createOfflineMediaPost(",
                         "repostPost(", "OutboxFlusher", "APIClient", "ComposerDocumentSendRouting"] {
            XCTAssertFalse(
                bloc.contains(interdit),
                "La surface appelle « \(interdit) » : c'est un second chemin de publication."
            )
        }
    }

    /// Garde NÉGATIVE — la surface ne possède ni pièces jointes ni sélecteurs.
    /// Le pipeline d'ingestion existe et tourne sur six sites de production
    /// (`ComposerDropResolver` / `ComposerIngestRouter`) ; en écrire un second
    /// ici condamnerait à corriger deux fois chaque cas limite du presse-papier
    /// et du sandbox. Sa condition de levée est nommée : le jour où la surface
    /// devient propriétaire de l'ingestion, ce test se retourne — il ne se
    /// supprime pas. Ancrée sur le BLOC, pour la même raison que la précédente.
    func test_laSurface_neFabriquePasUnSecondPipelineDIngestion() throws {
        let bloc = try surfaceBlock()
        for interdit in ["photosPicker(", "fileImporter(", "PhotosPickerItem", "UIImagePickerController"] {
            XCTAssertFalse(
                bloc.contains(interdit),
                "La surface monte « \(interdit) » : le pipeline d'ingestion du dépôt est ailleurs, et unique."
            )
        }
    }

    // MARK: - Le routage d'envoi : SANS APPELANT, et assumé tel quel

    /// Garde NÉGATIVE — même patron que
    /// `test_host_doesNotMountTheFan_whileTheOfferCannotVary`, et pour la même
    /// raison : `ComposerDocumentSendRouting` n'a AUCUN appelant, ce n'est pas
    /// un oubli de câblage, et un code sans appelant qui ne l'assume pas
    /// finirait par être branché « puisqu'il existe ».
    ///
    /// Ce qu'il vaut en attendant : une MESURE consignée chemin par chemin de
    /// ce que fait réellement `FeedComposerSheet` — la seule chose que V7 ne
    /// pourra pas redécouvrir sans la relire ligne à ligne.
    ///
    /// **Condition de levée nommée** : le jour où le meuble possède son envoi
    /// (V7, file de publication unifiée), ce test se RETOURNE — il ne se
    /// supprime pas.
    ///
    /// La question « rien ne l'appelle » est une quantification UNIVERSELLE :
    /// elle se prouve sur toute l'arborescence de production, pas sur les deux
    /// fichiers qu'on a sous les yeux.
    func test_leRoutageDEnvoi_nEstMonteNullePart() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")

        guard let enumerateur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
            return XCTFail("Arborescence app introuvable à \(racine.path)")
        }

        var declarations = 0
        var appels = 0
        for case let url as URL in enumerateur where url.pathExtension == "swift" {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            declarations += occurrences(of: "enum ComposerDocumentSendRouting", in: source)
            appels += occurrences(of: "ComposerDocumentSendRouting.path(", in: source)
        }

        XCTAssertEqual(
            declarations, 1,
            "La table d'envoi doit exister, et une seule fois — sinon cette garde ne mesurerait rien."
        )
        XCTAssertEqual(
            appels, 0,
            "Un site de production appelle `ComposerDocumentSendRouting.path(` : le meuble s'est mis à publier. "
                + "Ce n'est pas un échec — c'est la condition de levée. Retourner ce test, ne pas le supprimer."
        )
    }
}

/// V2 — le CONTRASTE de la surface document, sur les trois teintes du plateau.
///
/// Jumelle de `ComposerPlateauTests`, et pour la même raison : le plateau se
/// CHOISIT (O6), donc ce qu'on écrit dessus doit se lire sur les trois teintes,
/// pas seulement sur la teinte par défaut. La surface document est la première
/// à porter du texte long ; mesurer le socle sans la mesurer, elle, aurait
/// laissé le contenu du post hors de toute garde.
///
/// `@MainActor` : le bundle de tests est compilé en isolation `nonisolated`, et
/// `WCAGContrast` est épinglé au main actor pour reproduire le contexte d'appel
/// des ponts `UIColor(_: Color)`.
@MainActor
final class ComposerDocumentSurfaceContrastTests: XCTestCase {

    /// Les jetons que la surface peint RÉELLEMENT — arrimés à la source par
    /// `test_laListeMesuree_couvreToutCeQueLaSurfacePeint`. Une liste qui
    /// dériverait de la vue mesurerait des premiers plans que rien ne pose,
    /// exactement le défaut que D-18 a corrigé dans l'autre sens.
    private let peints: [(String, Color)] = [
        ("textPrimary(isDark: true)", MeeshyColors.textPrimary(isDark: true)),
        ("textSecondary(isDark: true)", MeeshyColors.textSecondary(isDark: true))
    ]

    func test_lesPremiersPlans_passentAA_surLesTroisTeintesDuPlateau() {
        for tint in PlateauTint.allCases {
            for (nom, premierPlan) in peints {
                let ratio = WCAGContrast.ratioOfTranslucentForeground(premierPlan, on: tint.color)
                XCTAssertGreaterThanOrEqual(
                    ratio, 4.5,
                    "\(nom) sur le plateau \(tint.rawValue) mesure \(WCAGContrast.fmt(ratio)):1 — sous AA texte normal"
                )
            }
        }
    }

    /// L'arrimage. Sans lui, la liste ci-dessus et la vue divergeraient dès
    /// qu'un jeton serait ajouté : le test resterait vert en ne mesurant plus
    /// tout ce qui est peint. Il rougit notamment à la réintroduction de
    /// `textMuted`, mesuré à 4,41:1 sur le violet profond.
    func test_laListeMesuree_couvreToutCeQueLaSurfacePeint() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertTrue(code.contains("struct ComposerDocumentSurface"), "Source de la surface introuvable — la garde ne mesurerait rien")

        let mesures = peints.map { $0.0 }
        for ligne in code.split(separator: "\n") where ligne.contains("MeeshyColors.") {
            XCTAssertTrue(
                mesures.contains(where: { ligne.contains($0) }),
                "La surface peint un jeton non mesuré : « \(ligne.trimmingCharacters(in: .whitespaces)) »"
            )
        }
    }
}
