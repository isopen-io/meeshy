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
    private static let toutesLesSurfaces: [ComposerSurfaceKind] = [.scene, .document, .mood]
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
    /// **Ce n'était pas un oubli, et sa raison a CHANGÉ au lot 4.9.**
    ///
    /// Le refus du lot 4.5 tenait au SOCLE : sous le document il peignait deux
    /// affordances sans objet — un témoin d'audience inerte et un œil sans
    /// canvas. Les deux sont tombées. L'audience est un vrai sélecteur avec sa
    /// mémoire, l'œil est parti par retrait (loi 4), et
    /// `test_leSocleDuDocument_nePeintAucunOeil_fauteDeCanvasALire` est la
    /// condition de levée que ce test nommait mot pour mot.
    ///
    /// **Ce qui retient l'éventail aujourd'hui est d'un autre ordre : l'ENVOI.**
    /// `MoodComposerDoor.publish` refuse tout brouillon qui n'est pas un
    /// `.status` — l'ANCRAGE en post part par `POST /posts/:id/repost`, un
    /// chemin que la porte du mood ne possède pas. Peindre le chip « Post »
    /// aujourd'hui donnerait une flèche ARMÉE (le gate du document ne demande
    /// qu'un texte non vide) qui, pressée, ne ferait RIEN : `publish` rend
    /// `false`, le composer reste ouvert, muet. C'est mot pour mot « le pire des
    /// deux mondes, puisqu'il aurait eu l'air de marcher ».
    ///
    /// **Condition de levée NOMMÉE** : que la porte du mood sache publier un
    /// ancrage — et que le brouillon du document porte `repostOfId`, sans quoi
    /// l'ancrage perdrait sa source. Ce test se RETOURNE alors ; il ne se
    /// supprime pas.
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
        let envoi = try corpsDeDeclaration(
            commencantPar: "private func publish(_ draft: ComposerDocumentDraft)",
            dans: sourceDeLaPorteDuMood()
        )
        guard let envoi else {
            return XCTFail("L'envoi de la porte du mood est introuvable — la garde ne mesurerait RIEN.")
        }
        XCTAssertTrue(
            envoi.contains("draft.format == .status"),
            "La porte du mood refuse encore tout format autre que le status. C'est LA raison pour laquelle "
                + "l'éventail ne descend pas : le chip « Post » armerait une flèche que la publication ignore."
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
            "La surface du mood peint l'éventail : le chip « Post » devient atteignable, et il mène à un "
                + "brouillon de format `.post` que `MoodComposerDoor.publish` REFUSE — une flèche armée qui "
                + "ne publie rien."
        )
        XCTAssertFalse(
            document.contains("plateauTools") || document.contains("ComposerFormatFan("),
            "La surface document peint l'éventail : basculer vers `.story` y monterait l'atelier, et "
                + "`documentText` n'a aucun chemin pour l'y suivre — la saisie disparaîtrait sans un mot."
        )

        // Les trois assertions ci-dessus sont ancrées sur des BLOCS, et c'est
        // leur angle mort : un éventail monté dans le `body` du meuble — entre
        // la surface et le socle, l'endroit le plus naturel pour le poser — ne
        // toucherait aucun des trois et les laisserait toutes vertes. La
        // question n'est pas « quel bloc le peint » mais « combien de fois le
        // meuble le peint », et la réponse doit rester UNE, dans le plateau.
        XCTAssertEqual(
            occurrences(of: "ComposerFormatFan(", in: source), 1,
            "Le meuble monte l'éventail à un second endroit. S'il descend sous une surface sans scène, "
                + "c'est la levée de 4.7 — et elle exige d'abord le plafond d'audience mesuré par "
                + "`test_lAncrageDUnMood_nAAucunPlafondDAudience_etCEstCE_quiRetientLeventail`."
        )
    }

    /// **Le blocage RÉELLEMENT contraignant de 4.7 — et ce n'est pas celui que
    /// la garde ci-dessus nomme.**
    ///
    /// Le refus de format de `MoodComposerDoor.publish` est vrai, mesurable, et
    /// se lève en une vingtaine de lignes : `PostService.repost(postId:
    /// targetType:content:isQuote:visibility:)` est `public`, porte
    /// `targetType`, et tourne déjà sur deux sites de production. Une session
    /// qui ne lirait que la garde précédente conclurait donc « il ne reste que
    /// ça », lèverait le refus, ferait descendre l'éventail — et livrerait le
    /// défaut ci-dessous, qu'aucune des deux n'aurait vu.
    ///
    /// Ce défaut est la **loi 10 d'audience de la republication** : même
    /// audience, ou plus restreinte, JAMAIS plus large. Elle est appliquée
    /// SERVEUR sur les deux portes — `POST /posts/:id/repost` ET `POST /posts`
    /// portant `repostOfId` — par `isRepostVisibilityAllowed`, avec un 403
    /// `REPOST_AUDIENCE_WIDENING`. Son miroir client, `StoryRepostAudience`,
    /// existe pour PLAFONNER le sélecteur d'audience « pour que l'utilisateur
    /// ne se voie jamais proposer un choix que le serveur refusera ».
    ///
    /// Le meuble n'a pas de quoi l'appliquer : plafonner exige la visibilité de
    /// l'ORIGINAL, et rien ne la lui donne. `ComposerIntent.repost` ne porte
    /// qu'un identifiant ; le canal existe bien sur la graine
    /// (`ComposerMoodSeed.visibility`) et AUCUN site de republication ne
    /// l'alimente. Sans cette entrée, le seul plafond que la loi autorise est
    /// `[.private]` — la réponse documentée du SDK à « je ne sais pas » — et un
    /// éventail dont l'unique ancrage possible serait PRIVÉ n'est pas un
    /// sélecteur (loi 4).
    ///
    /// **Condition de levée, en TROIS parties et dans cet ordre** :
    /// 1. les deux sites de republication sèment `visibility:` (et
    ///    `visibilityUserIds:`) dans leur `ComposerMoodSeed` — hors du dossier
    ///    Composer, dans les racines de fenêtre ;
    /// 2. le sélecteur d'audience du socle se plafonne par
    ///    `StoryRepostAudience.allowed(from:)` dès que l'intention est un
    ///    repost, et n'offre plus `composerSelectableCases` en bloc ;
    /// 3. `MoodComposerDoor.publish` gagne sa branche d'ancrage.
    ///
    /// Ce test se RETOURNE ce jour-là ; il ne se supprime pas.
    ///
    /// **AVERTISSEMENT, payé une fois.** Cette garde a conclu « on ne descend
    /// pas l'éventail parce que l'ancrage n'a aucun plafond » en laissant
    /// intact, sur un écran RÉEL, le sélecteur d'audience que la republication
    /// peint DÉJÀ — dix lignes plus loin, avec le même défaut. Un plafond
    /// raisonné pour un contrôle FUTUR ne dispense pas de regarder le contrôle
    /// PRÉSENT.
    ///
    /// La moitié qui pouvait se fermer sans connaître la source l'a été :
    /// `ComposerAudienceOffer` retire d'une republication les deux audiences
    /// dont la portée appartient à la source (`ONLY`/`EXCEPT`). Ce qui reste
    /// mesuré ici est l'ÉLARGISSEMENT seul, et la première partie de sa levée
    /// n'est PAS le semis mais la ligne qui le rend utile — voir
    /// `test_lOffre_dUneRepublication_nePlafonnePasLElargissement_fauteDeConnaitreLaSource`,
    /// qui mesure `toStatusEntry()`. Les deux gardes se lisent ensemble : semer
    /// `visibility:` sans cette ligne ne sème qu'un `nil`.
    func test_lAncrageDUnMood_nAAucunPlafondDAudience_etCEstCE_quiRetientLeventail() throws {
        XCTAssertEqual(
            StoryRepostAudience.allowed(fromRawValue: nil), [.private],
            "Sans la visibilité de l'original, la loi 10 ne concède que PRIVÉ. Si cette réponse changeait, "
                + "le raisonnement de cette garde changerait avec elle."
        )
        XCTAssertTrue(
            PostVisibility.composerSelectableCases.count > StoryRepostAudience.allowed(fromRawValue: nil).count,
            "Le sélecteur du socle offre plus que ce que la loi 10 concède à un ancrage sans plafond : "
                + "c'est exactement l'élargissement que le gateway refuse par un 403."
        )

        let seedSource = try sourceDeLaPorteDuMood()
        XCTAssertTrue(
            seedSource.contains("let visibility: PostVisibility?"),
            "`ComposerMoodSeed` n'a plus de canal de visibilité : la condition de levée n'est plus lisible."
        )

        var republicationsMesurees = 0
        for url in try sourcesDeProductionDeLApp() {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            for appel in montagesDeLaPorteDuMood(dans: source) {
                guard appel.contains(".repost(") else { continue }
                republicationsMesurees += 1
                XCTAssertFalse(
                    appel.contains("visibility:"),
                    "\(url.lastPathComponent) sème enfin l'audience de l'original dans sa graine de "
                        + "republication. C'est la PREMIÈRE des trois parties de la levée : le plafond "
                        + "`StoryRepostAudience.allowed(from:)` devient applicable, et cette garde doit être "
                        + "retournée — pas supprimée."
                )
            }
        }
        XCTAssertGreaterThanOrEqual(
            republicationsMesurees, 2,
            "Moins de deux montages de republication trouvés — la garde ne mesurerait presque RIEN."
        )
    }

    /// Les montages de `MoodComposerDoor(` d'une source, découpés sur
    /// l'appariement des parenthèses. Le découpage n'est pas décoratif : les
    /// quatre sites se ressemblent, et un `.contains` posé sur le FICHIER
    /// confondrait la graine d'une création avec celle d'une republication.
    private func montagesDeLaPorteDuMood(dans source: String) -> [String] {
        var trouves: [String] = []
        var reste = Substring(source)
        while let debut = reste.range(of: "MoodComposerDoor(") {
            var profondeur = 0
            var fin: String.Index?
            for index in reste[debut.upperBound...].indices {
                let caractere = reste[index]
                if caractere == "(" { profondeur += 1 }
                if caractere == ")" {
                    if profondeur == 0 { fin = index; break }
                    profondeur -= 1
                }
            }
            guard let fin else { break }
            trouves.append(String(reste[debut.upperBound..<fin]))
            reste = reste[reste.index(after: fin)...]
        }
        return trouves
    }

    /// L'arborescence de production de l'app. « Aucun site ne fait X » est une
    /// quantification UNIVERSELLE : elle se prouve sur tout l'arbre, jamais sur
    /// les deux fichiers qu'on a sous les yeux.
    private func sourcesDeProductionDeLApp() throws -> [URL] {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        guard let enumerateur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
            XCTFail("Arborescence app introuvable à \(racine.path)")
            return []
        }
        var urls: [URL] = []
        for case let url as URL in enumerateur where url.pathExtension == "swift" {
            urls.append(url)
        }
        return urls
    }

    /// La source de la porte du mood, commentaires RETIRÉS — même précaution que
    /// pour le meuble : `draft.format == .status` est cité dans les
    /// doc-comments de ce fichier comme dans ceux de la porte, et un `.contains`
    /// qui matche un commentaire ne prouve rien.
    private func sourceDeLaPorteDuMood() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerMoodSurface.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertTrue(
            code.contains("struct MoodComposerDoor"),
            "La source lue n'est pas celle de la porte du mood — la garde ne mesurerait RIEN."
        )
        return code
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

    // MARK: - Lot 4.9 — le socle VIVANT sous le document

    /// **L'œil DISPARAÎT sous le document — il ne se répare pas.**
    ///
    /// Ce que la rév. précédente consignait comme dette, et qui était exact :
    /// l'œil du socle montait `MeeshyScenePlayer` sur
    /// `CanvasV3(migrating: viewModel.currentEffects)`, que rien ne remplit sous
    /// cette surface — même cause que `servedDocumentTools == []`, l'absence de
    /// chemin d'ingestion. Il ouvrait donc une scène VIDE.
    ///
    /// **La loi 4 ne connaît pas la dette consignée** : une affordance sans
    /// objet est ABSENTE, jamais montée puis vide. Et la loi 6 ferme la seconde
    /// issue — fabriquer un aperçu maison du texte serait un quatrième chemin de
    /// rendu, ce que « le lecteur EST l'aperçu » interdit. Restait donc le
    /// retrait, et il est réversible : l'œil revient le jour où le document a
    /// des médias à montrer.
    ///
    /// **Ce test EST la condition de levée que le 4.7 nommait mot pour mot** :
    /// « que `ComposerChromeOwnership.socleZones(for: .document)` cesse de
    /// promettre ce que le document ne tient pas ».
    func test_leSocleDuDocument_nePeintAucunOeil_fauteDeCanvasALire() {
        XCTAssertEqual(
            ComposerChromeOwnership.socleZones(for: .document),
            [.audience, .publish],
            "Le socle du document ne promet plus que ce qu'il tient : une audience qu'on choisit et une "
                + "flèche qui publie. L'œil n'avait rien à lire."
        )
    }

    /// **AUCUNE des trois surfaces n'a de canvas que le SOCLE puisse lire.**
    ///
    /// La garde jumelle de celle du dessus, et la seule qui rougirait si l'œil
    /// revenait par une autre porte : `.scene` ne peint pas le socle du tout
    /// (l'atelier peint le sien), `.mood` n'a pas de canvas (loi 6),
    /// `.document` n'a pas de chemin d'ingestion.
    ///
    /// Tant que cette phrase tient, `MeeshyScenePlayer` n'a plus rien à faire
    /// dans le meuble — c'est ce que vérifie, côté source,
    /// `MeeshyComposerHostGuardTests.test_lOeilEtSonLecteur_vivent_etMeurent_ensemble`.
    func test_aucuneSurfaceDuMeuble_nePeintDOeil_fauteDeCanvasALire() {
        for surface in Self.toutesLesSurfaces {
            XCTAssertFalse(
                ComposerChromeOwnership.socleZones(for: surface).contains(.preview),
                "\(surface) : le socle y peint un œil, et aucune des trois surfaces ne lui donne de canvas à "
                    + "lire. Un aperçu vide ment sur ce qui sera publié (loi 6)."
            )
        }
    }

    // MARK: - Lot 4.9 — la mémoire d'audience, une par FORMAT

    /// **Loi 10 — une mémoire par FORMAT, jamais une seule pour tous.**
    ///
    /// Le cas qui commande : un auteur restreint son mood à trois personnes.
    /// Sous une mémoire partagée, le post qu'il écrit ensuite s'ouvrirait en
    /// `ONLY` sur ces trois personnes — un rétrécissement d'audience que rien à
    /// l'écran n'aurait annoncé, et le sens même de la loi 10.
    func test_laMemoireDAudience_estUneParFormat_jamaisUneSeulePourTous() {
        XCTAssertEqual(
            ComposerAudienceMemory.key(for: .status), "lastStatusVisibility",
            "La mémoire du status est celle de l'écran historique, à l'octet près : une clé neuve en ferait "
                + "une seconde à faire diverger."
        )
        XCTAssertEqual(
            ComposerAudienceMemory.key(for: .post), "lastPostVisibility",
            "Le format post a la SIENNE."
        )
        XCTAssertNotEqual(
            ComposerAudienceMemory.key(for: .status),
            ComposerAudienceMemory.key(for: .post),
            "Deux formats, deux mémoires : les confondre transporterait un ONLY d'un format à l'autre."
        )
    }

    /// `nil` sous la scène, et c'est une RÉPONSE, pas un oubli : l'atelier reçoit
    /// sa graine par `initialVisibility`, que le tray alimente depuis
    /// `lastComposerVisibility`. Lui inventer une mémoire ici en ferait une
    /// seconde, à faire diverger de celle du tray.
    func test_laScene_nAPasDeMemoireDansLeMeuble_carSaGraineVientDeLaPorte() {
        for format in [ComposerFormat.story, .reel] {
            XCTAssertNil(
                ComposerAudienceMemory.key(for: format),
                "\(nom(format)) : le socle n'y peint aucune audience — lui donner une mémoire ici en ferait "
                    + "une seconde à côté de celle du tray."
            )
            XCTAssertTrue(
                ComposerChromeOwnership.socleZones(
                    for: ComposerSurfaceRouting.surface(opening: .keyboardOnContent, format: format)
                ).isEmpty,
                "\(nom(format)) : la prémisse du `nil` ci-dessus est que le socle n'y peint RIEN. Si elle "
                    + "tombait, l'audience de ce format n'aurait plus de mémoire du tout."
            )
        }
    }

    /// **Les deux replis comptent autant l'un que l'autre.**
    ///
    /// Une valeur INCONNUE (mémoire d'une version antérieure, réglage effacé) se
    /// voit tout de suite. Une valeur connue mais HORS OFFRE est la plus
    /// coûteuse : aucun chip ne la montre, et l'auteur publierait sous un
    /// réglage qu'aucun écran ne lui a dit.
    func test_uneMemoireVideOuHorsOffre_retombeSurPublic() {
        XCTAssertEqual(ComposerAudienceMemory.remembered(nil), .public, "Aucune mémoire — première ouverture.")
        XCTAssertEqual(ComposerAudienceMemory.remembered(""), .public, "Mémoire vide.")
        XCTAssertEqual(
            ComposerAudienceMemory.remembered("MOON"), .public,
            "Une valeur inconnue ne se laisse pas deviner."
        )

        let horsOffre = PostVisibility.allCases.first { !PostVisibility.composerSelectableCases.contains($0) }
        guard let horsOffre else {
            return XCTAssertEqual(
                Set(PostVisibility.allCases), Set(PostVisibility.composerSelectableCases),
                "Prémisse changée : toutes les audiences sont désormais offertes, ce repli n'a plus d'objet."
            )
        }
        XCTAssertEqual(
            ComposerAudienceMemory.remembered(horsOffre.rawValue), .public,
            "« \(horsOffre.rawValue) » n'a aucun chip pour se montrer : la relire telle quelle publierait "
                + "sous un réglage invisible."
        )
    }

    /// Le cas nominal, sans lequel les deux replis ci-dessus seraient une
    /// fonction constante que personne ne remarquerait.
    ///
    /// **Il ne porte plus QUE sur les audiences relisibles** — le troisième
    /// repli, ajouté avec le témoin ci-dessous, écarte celles dont la portée est
    /// une LISTE que rien ne persiste.
    func test_uneMemoireOfferte_estRelueTelleQuelle() {
        for offerte in PostVisibility.composerSelectableCases where !offerte.requiresUserSelection {
            XCTAssertEqual(
                ComposerAudienceMemory.remembered(offerte.rawValue), offerte,
                "« \(offerte.rawValue) » est offerte et se relit seule : elle revient telle quelle."
            )
        }
    }

    /// **Le TROISIÈME repli — une mémoire qui exige une liste que rien ne
    /// porte.**
    ///
    /// Les deux premiers replis répondaient à « cette valeur est-elle
    /// LISIBLE ? ». Celui-ci répond à « une fois relue, est-elle
    /// EXPLOITABLE ? », et c'est une question distincte : `ONLY` et `EXCEPT`
    /// sont parfaitement lisibles, parfaitement offertes — et leur portée EST la
    /// liste d'utilisateurs qui les accompagne, que la mémoire ne porte pas
    /// (`ComposerAudienceMemory` ne persiste qu'un `rawValue`).
    ///
    /// Sans lui, la chaîne complète tenait : le socle restaure `.only`,
    /// `composerVisibilityUserIds` naît `[]`, `audienceTitle` rend « Seulement… »
    /// SANS compteur — indiscernable d'un `ONLY` valide —, le gate de matière
    /// n'exige qu'un texte, et `CreatePostSchema` refuse la requête
    /// (`services/gateway/src/routes/posts/types.ts`, « EXCEPT and ONLY
    /// visibility require at least one userId »). Comme rien ne réécrit la
    /// mémoire sur un échec, la publication échouait à CHAQUE ouverture
    /// suivante.
    ///
    /// C'est le même raisonnement que le repli « hors offre » écrit juste à
    /// côté, appliqué à l'AUTRE façon dont une mémoire peut être inexploitable.
    func test_uneMemoireNominativeSansSaListe_retombeSurPublic() {
        for nominative in PostVisibility.composerSelectableCases where nominative.requiresUserSelection {
            XCTAssertEqual(
                ComposerAudienceMemory.remembered(nominative.rawValue), .public,
                "« \(nominative.rawValue) » exige une liste nominative, et la mémoire n'en porte AUCUNE : "
                    + "la relire telle quelle arme une flèche que le gateway refuse, à chaque ouverture."
            )
        }
        XCTAssertFalse(
            PostVisibility.composerSelectableCases.filter(\.requiresUserSelection).isEmpty,
            "Prémisse changée : plus aucune audience offerte n'exige de liste, ce repli n'a plus d'objet."
        )
    }

    // MARK: - L'OFFRE d'audience — ce qu'un écran a le droit de proposer

    /// Hors republication, l'offre est celle du SDK, en entier et dans son
    /// ordre. Sans ce témoin, la règle pourrait rétrécir l'offre de la CRÉATION
    /// sans que rien ne rougisse — la loi 4 mord dans les deux sens.
    func test_lOffre_dUneCreation_estLesSixNiveauxDuSDK() {
        for origine in [ComposerOrigin.moodChip, .feedComposer, .storyTray, .reelTab] {
            XCTAssertEqual(
                ComposerAudienceOffer.offered(for: origine),
                PostVisibility.composerSelectableCases,
                "Une porte de création n'a aucun plafond : l'offre est celle du SDK, dans son ordre."
            )
        }
    }

    /// **Loi 4 sur l'audience d'une REPUBLICATION.**
    ///
    /// `EXCEPT`/`ONLY` ne se lisent pas seules : leur portée EST la liste qui les
    /// accompagne, et sur une republication cette liste vient de la SOURCE —
    /// `StoryRepostAudience.inheritsAudienceList`, miroir de
    /// `repostVisibilityInheritsAudienceList` que `PostService.createPost`
    /// applique en remplaçant `data.visibilityUserIds` par ceux de l'original.
    ///
    /// Le sélecteur nominatif était donc peint, ouvrable, renseignable — et son
    /// résultat n'avait strictement AUCUN effet. Pire : republier un mood PUBLIC
    /// en `ONLY` produisait un post `ONLY` avec la liste vide de la source,
    /// c'est-à-dire visible de PERSONNE, sur une feuille qui s'était refermée
    /// sur un succès.
    func test_lOffre_dUneRepublication_retireLesAudiencesDontLaPorteeAppartientALaSource() {
        let offre = ComposerAudienceOffer.offered(for: .repost(ofPostId: "mood-source", sourceFormat: .status))

        for nominative in PostVisibility.composerSelectableCases where nominative.requiresUserSelection {
            XCTAssertFalse(
                offre.contains(nominative),
                "« \(nominative.rawValue) » reste offert sur une republication : le serveur y écrase la "
                    + "liste par celle de la source, donc le sélecteur nominatif ne gouverne RIEN."
            )
            XCTAssertTrue(
                StoryRepostAudience.inheritsAudienceList(nominative),
                "La prémisse du retrait est la loi du SDK, pas une liste recopiée ici."
            )
        }
        XCTAssertEqual(
            offre, PostVisibility.composerSelectableCases.filter { !StoryRepostAudience.inheritsAudienceList($0) },
            "L'offre d'une republication est une PROJECTION de la loi du SDK, dans l'ordre du SDK."
        )
    }

    /// Un éventail à une entrée n'est pas un sélecteur (loi 4) : le retrait
    /// ci-dessus ne doit jamais refermer l'offre au point de n'y laisser qu'un
    /// chip. C'est la garde de l'AUTRE sens — celui qu'un plafond mal alimenté
    /// produirait (`StoryRepostAudience.allowed(fromRawValue: nil)` ne concède
    /// que `[.private]`).
    func test_lOffre_dUneRepublication_neSeReduitJamaisAUnSeulChip() {
        let offre = ComposerAudienceOffer.offered(for: .repost(ofPostId: "mood-source", sourceFormat: .status))
        XCTAssertGreaterThan(
            offre.count, 1,
            "L'offre d'une republication est tombée à \(offre.count) entrée(s) : ce n'est plus un sélecteur, "
                + "et la loi 4 l'interdit dans ce sens-là aussi."
        )
        XCTAssertTrue(
            offre.contains(.public),
            "Republier une humeur PUBLIQUE en public est le cas nominal : le retirer casserait le geste le "
                + "plus fréquent pour fermer un trou qui ne le concerne pas."
        )
    }

    /// **L'invariant qui rend tout clamp inutile** : quelle que soit la mémoire
    /// écrite, ce qu'elle REND appartient à l'offre — des DEUX côtés de la
    /// republication.
    ///
    /// Sans lui, le socle et le ruban pourraient s'ouvrir sur un chip sans
    /// marque, et l'auteur publierait sous une audience qu'aucun écran ne lui a
    /// dite. Il tient parce que le troisième repli ci-dessus écarte exactement
    /// les deux audiences que la republication retire.
    func test_touteMemoireRelue_appartientALOffre_desDeuxCotesDeLaRepublication() {
        let origines: [ComposerOrigin] = [
            .moodChip,
            .feedComposer,
            .repost(ofPostId: "mood-source", sourceFormat: .status),
        ]
        let memoires = PostVisibility.allCases.map(\.rawValue) + ["", "MOON"]

        for origine in origines {
            let offre = ComposerAudienceOffer.offered(for: origine)
            for memoire in memoires {
                XCTAssertTrue(
                    offre.contains(ComposerAudienceMemory.remembered(memoire)),
                    "La mémoire « \(memoire) » rend une audience absente de l'offre : le chip s'ouvrirait "
                        + "sans marque, et la publication partirait sous un réglage invisible."
                )
            }
        }
    }

    /// **Ce que ce lot ne ferme PAS, et pourquoi il ne peut pas le fermer.**
    ///
    /// Le retrait ci-dessus traite les deux audiences dont la portée appartient
    /// à la source. Il ne traite pas l'ÉLARGISSEMENT — republier en `PUBLIC` une
    /// humeur `FRIENDS` —, que le serveur refuse par un 403
    /// `REPOST_AUDIENCE_WIDENING` et que `StoryRepostAudience.allowed(from:)`
    /// saurait plafonner… si le client connaissait l'audience de l'original.
    ///
    /// Il ne la connaît pas, et le canal est mort UNE COUCHE plus bas que là où
    /// on le cherche : `StatusEntry` porte bien un `visibility`, mais
    /// `APIPost.toStatusEntry()` ne le lui passe pas — il vaut `nil` pour TOUTE
    /// humeur que l'app affiche. Semer `visibility: entry.visibility` dans les
    /// graines de republication donnerait donc `allowed(fromRawValue: nil)`,
    /// c'est-à-dire `[.private]` : un ruban à UN chip sur chaque republication,
    /// la loi 4 défaite dans l'autre sens.
    ///
    /// **Condition de levée, en deux parties et dans cet ordre** : (1)
    /// `toStatusEntry()` transmet `visibility` (une ligne, `StoryModels.swift`,
    /// hors du dossier Composer) ; (2) l'offre ci-dessus prend l'audience de
    /// l'original et la passe à `StoryRepostAudience.allowed(from:)`. Ce test se
    /// RETOURNE ce jour-là ; il ne se supprime pas.
    func test_lOffre_dUneRepublication_nePlafonnePasLElargissement_fauteDeConnaitreLaSource() throws {
        let converti = try sourceDuConvertisseurDeStatut()
        guard let corps = corpsDeDeclaration(commencantPar: "public func toStatusEntry()", dans: converti) else {
            return XCTFail("`toStatusEntry()` est introuvable — la garde ne mesurerait RIEN.")
        }
        XCTAssertTrue(
            corps.contains("StatusEntry("),
            "Le bloc lu n'est pas celui du convertisseur."
        )
        XCTAssertFalse(
            corps.contains("visibility:"),
            "`toStatusEntry()` transmet enfin l'audience de l'original. C'est la PREMIÈRE des deux parties "
                + "de la levée : `ComposerAudienceOffer` peut désormais plafonner par "
                + "`StoryRepostAudience.allowed(from:)`, et cette garde doit être retournée — pas supprimée."
        )

        XCTAssertEqual(
            StoryRepostAudience.allowed(fromRawValue: nil), [.private],
            "Sans la visibilité de l'original, la loi 10 ne concède que PRIVÉ — c'est ce qui interdit de "
                + "brancher le plafond sur une donnée absente."
        )
    }

    /// La source du convertisseur `APIPost` → `StatusEntry` du SDK. Lue plutôt
    /// que supposée : c'est cette ligne, et elle seule, qui décide si le meuble
    /// peut connaître l'audience d'une humeur republiée.
    private func sourceDuConvertisseurDeStatut() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - Lot 4.9 — le brouillon du document porte son audience

    /// **La liste nominative voyage AVEC l'audience, ou le gateway rejette.**
    ///
    /// C'est la moitié sans laquelle un sélecteur d'audience serait à demi mort :
    /// choisir `ONLY` ouvrirait bien le sélecteur de personnes, et le brouillon
    /// partirait sans elles. La fabrique du mood tenait déjà cette loi ; celle du
    /// document ne portait pas le champ du tout.
    func test_leBrouillonDuDocument_porteSaListeNominative_quandLAudienceLExige() {
        let brouillon = ComposerDocumentDraft.document(
            format: .post, text: "bonjour", visibility: .only, visibilityUserIds: ["u1", "u2"]
        )
        XCTAssertEqual(
            brouillon.visibilityUserIds, ["u1", "u2"],
            "Un ONLY sans personne est rejeté par le gateway : la liste voyage avec l'audience."
        )
    }

    /// Loi 3, la même que dans la fabrique du mood, et à la MÊME place : dans la
    /// fabrique, jamais chez l'appelant. Porter une liste sous une audience qui
    /// n'en veut pas la ferait persister pour rien.
    func test_leBrouillonDuDocument_ecarteLaListe_quandLAudienceNeLExigePas() {
        let brouillon = ComposerDocumentDraft.document(
            format: .post, text: "bonjour", visibility: .public, visibilityUserIds: ["u1"]
        )
        XCTAssertNil(
            brouillon.visibilityUserIds,
            "L'audience n'exige aucune liste : la porter la ferait persister pour rien."
        )
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

    // MARK: - Ce qu'un outil SERVI doit être : un outil qui AGIT

    /// **La loi 4, structurellement plutôt que par discipline.**
    ///
    /// Jusqu'ici, deux choses distinctes disaient ce que la rangée montre : la
    /// liste servie par le meuble (`servedDocumentTools`) et le geste que son
    /// `onTool` déclenchait. Deux écritures d'une même règle sont deux
    /// occasions de la corriger à moitié — un outil ajouté à la liste sans
    /// geste devient une icône inerte, un geste écrit pour un outil hors liste
    /// n'est jamais atteint, et aucune des deux dérives ne se voit.
    ///
    /// `effect` referme les deux : un outil est SERVI si et seulement s'il a un
    /// effet. La liste n'est plus une décision, c'est une PROJECTION.
    func test_unOutil_estServiSiEtSeulementSil_aUnEffet() {
        for outil in ComposerDocumentTool.allCases {
            XCTAssertEqual(
                ComposerDocumentTool.servedRow.contains(outil), outil.effect != nil,
                "« \(outil.rawValue) » est servi sans effet (icône inerte, loi 4) ou porte un effet que "
                    + "la rangée ne montre pas (geste inatteignable)."
            )
        }
    }

    /// L'état MESURÉ du 2026-08-24, écrit en toutes lettres pour qu'un outil qui
    /// gagne ou perd son chemin se lise dans un diff.
    ///
    /// L'emoji est le seul dont la destination existe de bout en bout : il
    /// n'INGÈRE rien, il écrit dans le texte que le meuble possède déjà
    /// (`documentText`) et que le brouillon emporte. Le précédent est mesuré,
    /// pas supposé — `FeedView.swift` monte `EmojiPickerSheet` et fait
    /// exactement `composerText += emoji`.
    ///
    /// Les cinq autres n'ont pas de destination : `ComposerDocumentDraft` ne
    /// porte ni `mediaIds`, ni fichier, ni lieu, et son unique publieur de
    /// production (`StatusViewModel.setStatus`) n'en accepte aucun. Les peindre
    /// ouvrirait des sélecteurs dont le résultat n'aurait nulle part où aller.
    func test_seulLEmoji_aUnCheminDeBoutEnBout_lesCinqAutresSontUneDette() {
        XCTAssertEqual(ComposerDocumentTool.servedRow, [.emoji])
        XCTAssertEqual(ComposerDocumentTool.emoji.effect, .insertsEmojiIntoText)

        for orpheline in [ComposerDocumentTool.photo, .camera, .document, .place, .microphone] {
            XCTAssertNil(
                orpheline.effect,
                "« \(orpheline.rawValue) » déclare un effet : sa destination doit exister sur "
                    + "`ComposerDocumentDraft` ET chez le publieur, sans quoi la rangée promet ce que "
                    + "l'envoi jette."
            )
        }
    }

    /// La rangée servie est une PROJECTION de la rangée canonique — jamais une
    /// seconde liste. Une liste écrite à part reprendrait l'ordre à son compte,
    /// et c'est l'ordre que les doigts connaissent.
    func test_laRangeeServie_projetteLaRangeeCanonique_dansSonOrdre() {
        let canonique = ComposerDocumentTool.canonicalRow
        let servie = ComposerDocumentTool.servedRow

        XCTAssertEqual(
            servie, canonique.filter { servie.contains($0) },
            "La rangée servie a réordonné la rangée canonique."
        )
        for outil in servie {
            XCTAssertTrue(canonique.contains(outil), "« \(outil.rawValue) » est servi hors de la rangée canonique.")
        }
    }

    /// La politique de capture s'applique à ce qui est SERVI, et pas seulement à
    /// la rangée canonique. Le cas qui commande : une porte de republication
    /// (`allowsCapture: false`) ne doit pas voir la caméra revenir par la
    /// projection. Aujourd'hui la question ne se pose pas — la caméra n'a pas
    /// d'effet — et c'est justement pourquoi le témoin est écrit maintenant :
    /// il rougira le jour où elle en gagnera un.
    func test_laCapture_filtreLaRangeeSERVIE_pasSeulementLaCanonique() {
        let sansCapture = ComposerDocumentToolPolicy.visibleTools(
            served: ComposerDocumentTool.servedRow, allowsCapture: false
        )
        XCTAssertFalse(sansCapture.contains(.camera), "Une porte qui refuse la capture ne peint jamais la caméra.")
        XCTAssertEqual(
            ComposerDocumentToolPolicy.visibleTools(served: ComposerDocumentTool.servedRow, allowsCapture: true),
            ComposerDocumentTool.servedRow,
            "Hors caméra, la politique ne retire rien de ce que le meuble sert."
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

    // MARK: - Le PLAN d'envoi — ce que le meuble a le droit d'envoyer, et par où

    /// **La garde de format SORTANT du document**, jumelle exacte de celle de
    /// `MoodComposerDoor`.
    ///
    /// Le mood refuse tout ce qui n'est pas `.status` ; le document refuse tout
    /// ce qui n'est pas `.post`. Sans elle, un brouillon de mood partirait par
    /// `createPost` en type POST — c'est-à-dire un mood qui n'expire jamais, et
    /// que rien à l'écran n'aurait annoncé. Refuser plutôt que supposer : un
    /// format sans publieur sur ce chemin n'a pas de traduction raisonnable.
    func test_lePlan_refuseUnBrouillonQuiNestPasUnPost() {
        for format in [ComposerFormat.status, .story, .reel] {
            let brouillon = ComposerDocumentDraft.document(
                format: format, text: "bonjour", visibility: .public, visibilityUserIds: []
            )
            XCTAssertEqual(
                ComposerDocumentSendPlan.plan(for: brouillon, isOffline: false),
                .refuse(.wrongFormat(format)),
                "Le format \(nom(format)) n'a pas de publieur sur ce chemin — le laisser passer fabriquerait "
                    + "un contenu d'un AUTRE type que celui que l'auteur a composé."
            )
        }
    }

    /// Un brouillon sans matière ne part pas — et ce n'est PAS une redite du
    /// gate du socle.
    ///
    /// `ComposerDocumentPublishGate` garde la FLÈCHE ; celui-ci garde l'ENVOI,
    /// et les deux existent parce que le publieur, lui, ne garde rien : un
    /// `content` vide ou blanc traverse `createPost` sans entrer dans la file
    /// durable — sa branche texte exige un texte non blanc — et retombe sur
    /// l'appel réseau DIRECT. Un envoi volatil obtenu en n'écrivant rien.
    func test_lePlan_refuseUnBrouillonSansMatiere() {
        for texte in ["", "   ", "\n"] {
            let brouillon = ComposerDocumentDraft.document(
                format: .post, text: texte, visibility: .public, visibilityUserIds: []
            )
            XCTAssertEqual(
                ComposerDocumentSendPlan.plan(for: brouillon, isOffline: false),
                .refuse(.emptyDraft),
                "Un brouillon vide ou blanc retomberait sur l'appel réseau direct du publieur, en contournant "
                    + "sa file durable."
            )
        }
    }

    /// **La SIXIÈME raison de ne pas partir : une audience nominative sans
    /// personne.**
    ///
    /// Elle manquait aux cinq, et c'est le seul refus de la liste que le
    /// GATEWAY émet déjà — `CreatePostSchema` rejette `EXCEPT`/`ONLY` avec une
    /// liste vide (400 `VALIDATION_ERROR`). Le plan ne l'attrapait pas : son
    /// unique question sur l'audience était… aucune. Un brouillon `ONLY` vide
    /// partait donc, et l'auteur recevait un refus générique.
    ///
    /// Le gate de la flèche le retient déjà ; ce plan est la SECONDE ligne, pour
    /// le chemin qui ne passe pas par la flèche — la porte lit le brouillon,
    /// jamais le gate.
    func test_lePlan_refuseUneAudienceNominativeSansPersonne() {
        for nominative in PostVisibility.composerSelectableCases where nominative.requiresUserSelection {
            let brouillon = ComposerDocumentDraft.document(
                format: .post, text: "bonjour", visibility: nominative, visibilityUserIds: []
            )
            XCTAssertEqual(
                ComposerDocumentSendPlan.plan(for: brouillon, isOffline: false),
                .refuse(.incompleteAudience(nominative)),
                "Un « \(nominative.rawValue) » sans personne part quand même : le gateway le refuse, et le "
                    + "refus générique n'apprend rien à l'auteur."
            )

            let complet = ComposerDocumentDraft.document(
                format: .post, text: "bonjour", visibility: nominative, visibilityUserIds: ["u1"]
            )
            XCTAssertEqual(
                ComposerDocumentSendPlan.plan(for: complet, isOffline: false),
                .send(.textOnly),
                "… et une personne suffit — sans quoi la garde ci-dessus serait verte sur un plan toujours "
                    + "fermé."
            )
        }
    }

    /// **Le cas NOMINAL, et la promesse « offline compris » en une ligne.**
    ///
    /// Le chemin ne dépend pas de la connectivité tant qu'aucun fichier ne
    /// voyage : `FeedViewModel.createPost` enfile lui-même la ligne texte, SANS
    /// consulter le réseau (mesuré — il n'a pas même de `isOffline`), et
    /// l'`OutboxFlusher` la dépêche à la reconnexion. C'est ce qui distingue ce
    /// publieur de celui du mood, dont la file n'est atteinte que si
    /// `isOffline()` répond oui.
    func test_lePlan_dUnPostTexte_prendLeCheminDejaDurable_desDeuxCotesDuReseau() {
        let brouillon = ComposerDocumentDraft.document(
            format: .post, text: "bonjour", visibility: .public, visibilityUserIds: []
        )
        for horsLigne in [true, false] {
            XCTAssertEqual(
                ComposerDocumentSendPlan.plan(for: brouillon, isOffline: horsLigne),
                .send(.textOnly),
                "Un post texte est durable des DEUX côtés du réseau : le router autrement selon la "
                    + "connectivité inventerait une différence que le publieur ne fait pas."
            )
        }
    }

    /// **Le refus qui protège l'ANCRAGE — et il est déjà atteignable.**
    ///
    /// La fabrique du document pose `repostOfId` à `nil` aujourd'hui ; le champ,
    /// lui, EXISTE sur le type, et la tâche 4.7 le remplira. Le jour où elle le
    /// fera, le plan doit REFUSER : une citation part par
    /// `POST /posts/:id/repost`, qui n'a aucune file durable, et la laisser
    /// filer par le chemin texte publierait un post ORDINAIRE à la place d'un
    /// ancrage — sans source, sans octets instanciés, sans que rien ne le dise.
    ///
    /// Écrit sur l'initialiseur mémberwise plutôt que sur la fabrique, et c'est
    /// délibéré : un témoin de refus qui attendrait la tâche 4.7 pour devenir
    /// exécutable serait un témoin que la tâche 4.7 écrirait elle-même.
    func test_lePlan_refuseUneCitation_carSonCheminNestPasDurable() {
        let citation = ComposerDocumentDraft(
            format: .post,
            text: "ancrage",
            emoji: nil,
            visibility: .public,
            visibilityUserIds: nil,
            mentions: nil,
            repostOfId: "post-source",
            audioUrl: nil
        )
        XCTAssertEqual(
            ComposerDocumentSendPlan.plan(for: citation, isOffline: false),
            .refuse(.nonDurablePath(.quotedRepost)),
            "Une citation n'a pas de file durable : la laisser passer par le chemin texte la publierait "
                + "comme un post ordinaire, et l'ancrage serait perdu sans erreur."
        )
    }

    /// Le plan DÉLÈGUE à la table ; il ne réordonne pas ses trois questions pour
    /// son compte. Deux écritures d'une même règle sont deux occasions de la
    /// corriger à moitié — et celle-ci perd du contenu quand on la corrige à
    /// moitié : tester le hors-ligne après avoir choisi l'upload enverrait une
    /// composition média dans un tus qui jette à la première requête.
    func test_lePlan_delegueALaTable_ilNeLaRecopiePas() throws {
        let bloc = try planBlock()

        XCTAssertTrue(
            bloc.contains("ComposerDocumentSendRouting.path("),
            "Le plan doit interroger la table — c'est elle qui sait ordonner les trois questions."
        )
        for recopie in [".quotedRepost", ".durableOutbox", ".upload"] {
            XCTAssertFalse(
                bloc.contains(recopie),
                "Le plan nomme « \(recopie) » : il a commencé à réécrire la table qu'il devait interroger."
            )
        }
    }

    /// **Le brouillon n'a AUCUN canal média — et c'est ce qui rend honnête le
    /// littéral `hasLocalMedia: false` du plan.**
    ///
    /// Garde NÉGATIVE dont toute la valeur est dans le jour où elle rougira :
    /// dès que `ComposerDocumentDraft` gagnera un champ de média — la première
    /// capacité manquante du DoD du lot 2 —, ce littéral deviendra un MENSONGE.
    /// Une composition avec photo prendrait le chemin texte, et le fichier
    /// resterait sur place sans qu'aucune erreur ne le dise.
    ///
    /// Le littéral ne peut pas se garder lui-même : il est vrai par ABSENCE, et
    /// une absence ne se voit nulle part.
    func test_leBrouillon_nAAucunCanalMedia_ceQuiTientLeLitteralDuPlan() throws {
        let source = try surfaceSource()
        guard let brouillon = blockBody(startingAt: "struct ComposerDocumentDraft", in: source) else {
            return XCTFail("`ComposerDocumentDraft` est introuvable — la garde ne mesurerait RIEN")
        }
        for canal in ["mediaIds", "attachmentIds", "attachments", "fileURL", "localMedia", "imageIds"] {
            XCTAssertFalse(
                brouillon.contains(canal),
                "Le brouillon porte « \(canal) » : le littéral `hasLocalMedia: false` du plan est devenu faux, "
                    + "et une composition média partirait par le chemin TEXTE en laissant son fichier sur place."
            )
        }

        XCTAssertTrue(
            try planBlock().contains("hasLocalMedia: false"),
            "Le plan n'écrit plus le littéral que cette garde protège — elle ne mesurerait plus rien."
        )
    }

    // MARK: - L'ISSUE de l'envoi — ce que le publieur a rendu

    /// **Un publieur qui REFUSE n'est pas une acceptation.**
    ///
    /// C'est le fait que le `Bool` de `onPublishDocument` documente depuis le
    /// lot 4.5 et que personne n'émettait : `MoodComposerDoor` rend `true`
    /// inconditionnellement, faute que `StatusViewModel.setStatus` rende quoi
    /// que ce soit. Un commentaire qui annonce un refus que rien n'émet devient
    /// la loi que lira la session suivante.
    func test_lIssue_unPublieurQuiRefuse_nEstPasUneAcceptation() {
        let issue = ComposerDocumentSendOutcome.reported(succeeded: false, error: "outbox pleine")

        XCTAssertEqual(issue, .refused(.publisherRejected("outbox pleine")))
        XCTAssertFalse(
            issue.isAccepted,
            "Un refus ne referme pas le composer : ce que l'auteur vient d'écrire serait perdu."
        )
    }

    /// **Le SILENCE refuse.**
    ///
    /// Un publieur qui n'a ni confirmé ni refusé est un publieur dont on ne sait
    /// rien, et le doute ne ferme pas un composer : fermer coûte le texte de
    /// l'auteur, ne pas fermer ne coûte qu'un geste. Des deux erreurs possibles,
    /// une seule est réparable par celui qui la subit.
    func test_lIssue_unPublieurMuet_refuse_carLeDouteNeFermePasLeComposer() {
        XCTAssertEqual(
            ComposerDocumentSendOutcome.reported(succeeded: false, error: nil),
            .refused(.publisherSilent),
            "Ni succès ni erreur : la seule réponse sûre est de laisser l'écran ouvert."
        )
    }

    /// **L'ORDRE des deux questions est load-bearing** : l'erreur prime sur le
    /// drapeau de succès.
    ///
    /// `publishSuccess` est un `@Published` qui SURVIT d'un envoi à l'autre. Le
    /// lire en premier ferait accepter un échec sur la foi d'un succès
    /// précédent — et la règle ne doit rien supposer de l'hygiène du publieur,
    /// pas même qu'il remette ses drapeaux à zéro en entrant.
    func test_lIssue_uneErreurPrimeSurUnDrapeauDeSuccesSurvivant() {
        XCTAssertEqual(
            ComposerDocumentSendOutcome.reported(succeeded: true, error: "500"),
            .refused(.publisherRejected("500")),
            "Une erreur posée à côté d'un succès resté vrai depuis l'envoi précédent doit REFUSER."
        )
    }

    func test_lIssue_unPublieurQuiConfirme_accepte() {
        let issue = ComposerDocumentSendOutcome.reported(succeeded: true, error: nil)

        XCTAssertEqual(issue, .accepted)
        XCTAssertTrue(issue.isAccepted)
    }

    /// Une erreur VIDE n'est pas une erreur. `publishError` est une CHAÎNE
    /// (`error.localizedDescription`), pas un `Error` : un publieur qui la
    /// remettrait à `""` plutôt qu'à `nil` ferait refuser un envoi réussi, et
    /// l'auteur republierait — en double.
    func test_lIssue_uneErreurVide_nEstPasUneErreur() {
        XCTAssertEqual(
            ComposerDocumentSendOutcome.reported(succeeded: true, error: ""),
            .accepted,
            "Une chaîne vide dit « pas d'erreur » : la traiter en refus produirait un doublon à la republication."
        )
    }

    // MARK: - La PORTE du document — l'envoi durable, vu de la SOURCE

    private struct AncreDePorteIntrouvable: Error, CustomStringConvertible {
        let quoi: String
        var description: String { "Le bloc `\(quoi)` est introuvable — la garde ne mesurerait RIEN" }
    }

    private func doorBlock() throws -> String {
        guard let bloc = blockBody(startingAt: "struct DocumentComposerDoor", in: try surfaceSource()) else {
            throw AncreDePorteIntrouvable(quoi: "struct DocumentComposerDoor")
        }
        return bloc
    }

    private func doorSendBlock() throws -> String {
        guard let bloc = blockBody(startingAt: "private func publish(", in: try doorBlock()) else {
            throw AncreDePorteIntrouvable(quoi: "DocumentComposerDoor.publish")
        }
        return bloc
    }

    private func planBlock() throws -> String {
        guard let bloc = blockBody(startingAt: "enum ComposerDocumentSendPlan", in: try surfaceSource()) else {
            throw AncreDePorteIntrouvable(quoi: "enum ComposerDocumentSendPlan")
        }
        return bloc
    }

    /// Le fusible des gardes de porte — une ancre renommée les rendrait TOUTES
    /// vertes sur une chaîne vide, et une garde négative qui meurt ne le dit
    /// jamais.
    func test_lesGardesDeLaPorteDuDocument_lisentUnBlocNonVide() throws {
        let bloc = try doorBlock()

        XCTAssertGreaterThan(bloc.count, 600, "Le bloc de la porte est vide : l'appariement d'accolades a échoué.")
        XCTAssertTrue(bloc.contains("var body"), "Le bloc lu n'est pas celui de la porte.")
        XCTAssertFalse(
            bloc.contains("struct ComposerDocumentSurface"),
            "Le bloc déborde sur la surface — les gardes ne seraient plus ancrées sur la porte."
        )
    }

    /// La porte monte le MEUBLE et lui donne son canal. Elle ne monte pas la
    /// surface elle-même : c'est le meuble qui choisit ce qu'il montre, par une
    /// règle éprouvée, et court-circuiter le routage rendrait la surface
    /// indépendante du format.
    func test_laPorteDuDocument_monteLeMeuble_etLuiDonneSonCanal() throws {
        let bloc = try doorBlock()

        XCTAssertTrue(bloc.contains("MeeshyComposerHost("), "La porte monte le meuble — sans lui elle ne présente rien.")
        XCTAssertTrue(bloc.contains("onPublishDocument:"), "Et elle lui dit où le brouillon doit partir.")
        XCTAssertFalse(
            bloc.contains("ComposerDocumentSurface("),
            "La porte ne monte PAS la surface : le meuble choisit ce qu'il montre."
        )
    }

    /// **L'ENVOI DURABLE, et par où il passe.**
    ///
    /// Le modèle du fil possède l'outbox, et sa branche texte enfile la ligne
    /// SANS consulter la connectivité — c'est exactement la promesse « offline
    /// compris ». Un appel direct au service la contournerait, et un post
    /// composé hors ligne serait perdu au premier kill de l'app.
    func test_laPorteDuDocument_envoieParLaFileDurableDuModele() throws {
        let envoi = try doorSendBlock()

        XCTAssertTrue(
            envoi.contains("createPost("),
            "L'envoi doit passer par `FeedViewModel.createPost` — la seule entrée du dépôt dont la branche "
                + "texte enfile la ligne durablement, en ligne comme hors ligne."
        )
        XCTAssertTrue(
            envoi.contains("ComposerDocumentSendPlan.plan("),
            "… et il doit consulter le PLAN avant d'envoyer : c'est lui qui refuse un chemin non durable, "
                + "et qui interdit qu'un fichier parte par le chemin texte."
        )
    }

    /// Garde NÉGATIVE — la porte ne publie pas par un chemin à elle. L'envoi
    /// passe par le modèle, qui possède la file durable, le cache et la
    /// réconciliation optimiste ; un appel direct au service les perdrait tous
    /// les trois d'un coup.
    func test_laPorteDuDocument_neTouchePasLesServicesDirectement() throws {
        let bloc = try doorBlock()

        for interdit in ["PostService", "StatusService", "APIClient", "OfflineQueue",
                         "TusUploadManager", "OutboxFlusher", "StoryPublishService"] {
            XCTAssertFalse(
                bloc.contains(interdit),
                "La porte touche « \(interdit) » : c'est le SECOND chemin de publication que la doctrine, C2 "
                    + "et le lot 7 interdisent tous les trois."
            )
        }
    }

    /// **La porte ne ferme QUE sur une acceptation, et elle DIT l'échec.**
    ///
    /// Deux moitiés, et livrer l'une sans l'autre serait pire que rien : rendre
    /// `false` sans rien dire laisserait l'auteur devant une flèche qui semble
    /// ne « rien faire » et qu'il presserait encore ; dire l'échec en refermant
    /// quand même perdrait le texte en s'en excusant.
    ///
    /// La troisième assertion est celle qu'on oublie : l'envoi ne referme pas la
    /// porte lui-même. La sortie appartient au MEUBLE, qui la conditionne à
    /// l'acceptation — un `dismiss()` posé ici court-circuiterait ce gate.
    func test_laPorteDuDocument_neFermeQueSurUneAcceptation_etDitLEchec() throws {
        let bloc = try doorBlock()
        let envoi = try doorSendBlock()

        XCTAssertTrue(
            bloc.contains("return false"),
            "Aucun refus n'est émis : le `Bool` que `onPublishDocument` documente comme une ACCEPTATION "
                + "mentirait, et le meuble refermerait sur un envoi perdu."
        )
        XCTAssertTrue(
            bloc.contains("showError("),
            "Un refus MUET laisserait l'auteur devant une flèche sans effet apparent — il la presserait encore."
        )
        XCTAssertEqual(
            occurrences(of: "refuse()", in: envoi), 2,
            "L'envoi a DEUX chemins de refus — le plan qui refuse, le publieur qui refuse — et ils doivent "
                + "passer par le même écrivain. Deux refus écrits à la main diraient l'échec deux fois, ou "
                + "une seule : et c'est la moitié muette qu'on découvrirait en production."
        )
        XCTAssertFalse(
            envoi.contains("dismiss()"),
            "L'envoi referme la porte lui-même : il court-circuiterait le gate du meuble, qui ne ferme que "
                + "sur une acceptation."
        )
    }

    /// **Garde NÉGATIVE, à condition de levée nommée.**
    ///
    /// Aucun site de production ne monte encore cette porte, et ce n'est pas un
    /// oubli de câblage :
    /// `test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`
    /// retient la porte du fil tant que la RANGÉE d'outils du document ne couvre
    /// pas celle de la feuille qu'elle remplace. L'ENVOI, lui, est tenu depuis
    /// le lot 4.10 — c'était la troisième des trois capacités du DoD du lot 2.
    ///
    /// Elle existe pour que la porte ne soit pas montée « puisqu'elle existe »
    /// avant que la première capacité tombe. Ses déclencheurs sont ses deux
    /// dernières assertions : le jour où elles tombent TOUTES LES DEUX, plus
    /// rien ne retient la porte, et ce test se RETOURNE — il ne se supprime pas.
    ///
    /// **ÉLARGIE : la rangée n'était pas tout ce que la feuille absorbée
    /// porte.** La mesure ne comparait que `servedRow` à `canonicalRow`, et
    /// `canonicalRow` ne modélise QUE les six boutons d'attache. La feuille
    /// historique (`FeedComposerSheet`) porte un SEPTIÈME contrôle dans la même
    /// barre : la capsule de LANGUE, avec son sélecteur — un état ÉCRIVABLE
    /// (`composerLanguage`) que le meuble n'a ni en champ, ni en contrôle, ni en
    /// canal sur `ComposerDocumentDraft`. La porte poste
    /// `DefaultComposerLanguage.resolve()`, une CONSTANTE qui rend « fr ».
    ///
    /// Sans cet élargissement, la garde serait passée au vert le jour où la
    /// rangée se remplit, et aurait laissé monter la porte avec la régression
    /// intacte : un auteur anglophone publiant « Hello everyone » verrait son
    /// post étiqueté français, traduit FR→EN par le Prisme, sans aucun moyen de
    /// corriger — le sélecteur qu'il utilisait la veille n'existe plus sur cet
    /// écran. C'est le mode d'échec PROXY : la mesure remplaçante était plus
    /// étroite que la capacité qu'elle prétendait couvrir.
    /// `@MainActor` : le bundle de tests est compilé en isolation `nonisolated`,
    /// et `DefaultComposerLanguage.resolve()` — dont cette garde mesure la
    /// constance — est épinglée au main actor.
    @MainActor
    func test_laPorteDuDocument_nEstMonteeParAucunSiteDeProduction_etCEstLaRangeeQuiLaRetient() throws {
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
        var montages = 0
        for case let url as URL in enumerateur where url.pathExtension == "swift" {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            declarations += occurrences(of: "struct DocumentComposerDoor", in: source)
            montages += occurrences(of: "DocumentComposerDoor(", in: source)
        }

        XCTAssertEqual(declarations, 1, "La porte doit exister, et une seule fois — sinon la garde ne mesure rien.")
        XCTAssertEqual(
            montages, 0,
            "Un site de production monte `DocumentComposerDoor` alors que la rangée d'outils du document ne "
                + "couvre pas encore celle de la feuille historique : l'auteur y perdrait "
                + "photo·caméra·fichier·lieu·micro d'un coup. Ce n'est pas un échec — c'est la condition de "
                + "levée. Retourner ce test, ne pas le supprimer."
        )
        XCTAssertNotEqual(
            ComposerDocumentTool.servedRow, ComposerDocumentTool.canonicalRow,
            "La rangée du document couvre désormais la rangée canonique. C'est la PREMIÈRE des deux "
                + "conditions ; lire l'autre ci-dessous avant de monter quoi que ce soit."
        )

        // SECOND déclencheur — la LANGUE. Elle n'est dans aucune rangée : c'est
        // un contrôle de la même barre, absent du meuble, et son absence ne se
        // voit pas en comparant deux listes d'outils d'attache.
        let porte = try surfaceSource()
        guard let envoi = corpsDeDeclaration(
            commencantPar: "private func publish(_ draft: ComposerDocumentDraft)",
            dans: porte
        ) else {
            return XCTFail("L'envoi de la porte du document est introuvable — la garde ne mesurerait RIEN.")
        }
        XCTAssertTrue(
            envoi.contains("originalLanguage: DefaultComposerLanguage.resolve()"),
            "La porte ne poste plus la CONSTANTE de langue. Si elle poste désormais un état du meuble, la "
                + "seconde condition est remplie — retourner cette assertion, pas la supprimer."
        )
        XCTAssertEqual(
            DefaultComposerLanguage.resolve(), "fr",
            "La prémisse de l'assertion ci-dessus est que `resolve()` est une CONSTANTE. Si elle se met à "
                + "lire quelque chose, le raisonnement de cette garde change avec elle."
        )
        XCTAssertFalse(
            porte.contains("originalLanguage") && porte.contains("ComposerLanguageFlag"),
            "Le meuble a gagné une capsule de langue : l'auteur peut de nouveau déclarer la langue de son "
                + "post. C'est la SECONDE condition de levée — monter `DocumentComposerDoor` là où "
                + "`FeedComposerSheet` est présentée, puis RETOURNER ce test."
        )
    }

    // MARK: - Le routage d'envoi : UN SEUL APPELANT, et c'est le meuble

    /// **Garde RETOURNÉE (lot 4.10), à la condition de levée qu'elle nommait.**
    ///
    /// Elle exigeait ZÉRO appelant, et le disait sans détour : « le meuble ne
    /// publie pas, la table n'est qu'une MESURE ». Le meuble possède désormais
    /// son envoi — `ComposerDocumentSendPlan` route le brouillon du document
    /// vers la file durable du modèle du fil —, et la question a changé de sens
    /// sans changer de nature.
    ///
    /// Ce qu'elle retient maintenant : **un seul appelant, et il vit dans le
    /// dossier Composer.** Un second site interrogeant la table serait le second
    /// chemin d'envoi que la doctrine, C2 et le lot 7 interdisent tous les
    /// trois — et il naîtrait là où personne ne le cherche, puisque la table,
    /// elle, est désormais légitime.
    ///
    /// La question « qui l'appelle » reste une quantification UNIVERSELLE : elle
    /// se prouve sur toute l'arborescence de production, jamais sur les deux
    /// fichiers qu'on a sous les yeux.
    func test_leRoutageDEnvoi_nAQuUnSeulAppelant_etCEstLeMeuble() throws {
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
        var fichiersAppelants: [String] = []
        for case let url as URL in enumerateur where url.pathExtension == "swift" {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            declarations += occurrences(of: "enum ComposerDocumentSendRouting", in: source)
            let ici = occurrences(of: "ComposerDocumentSendRouting.path(", in: source)
            appels += ici
            if ici > 0 { fichiersAppelants.append(url.lastPathComponent) }
        }

        XCTAssertEqual(
            declarations, 1,
            "La table d'envoi doit exister, et une seule fois — sinon cette garde ne mesurerait rien."
        )
        XCTAssertEqual(
            appels, 1,
            "La table doit avoir UN appelant, et un seul. Zéro : le meuble a cessé de publier, et il faut "
                + "retourner cette garde dans l'autre sens. Deux : un second chemin d'envoi est né. "
                + "Appelants trouvés — \(fichiersAppelants)."
        )
        XCTAssertEqual(
            fichiersAppelants, ["ComposerDocumentSurface.swift"],
            "L'unique appelant doit être le PLAN du meuble. Une porte de présentation, un modèle ou une vue "
                + "qui interrogerait la table pour son compte serait un second chemin d'envoi."
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
