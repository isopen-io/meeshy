import XCTest
import MeeshySDK
@testable import Meeshy

/// C1 — l'intention est un modèle PUR (plan
/// `docs/superpowers/plans/2026-08-20-meeshy-composer-lot-c.md`, tâche C1 ;
/// planche `docs/superpowers/specs/2026-08-19-meeshy-composer-design.md` §3).
///
/// « Le composer ne s'ouvre jamais nu : il s'ouvre déjà déterminé par son point
/// d'entrée. » `ComposerProfile.profile(for:)` est la table qui grave cette
/// préconfiguration, et C2/C3 la consommeront comme une interface GELÉE.
///
/// Cette suite éprouve DEUX choses, jamais la même deux fois :
/// 1. les neuf portes, une par une — ce que CHAQUE origine décide (les neuf
///    `test_profile_*`, imposés par le plan) ;
/// 2. les RÈGLES qui traversent la table — les invariants dont chaque ligne est
///    une conséquence. Une table recopiée ne se démontre pas elle-même : ce sont
///    ces règles qui disent POURQUOI une case vaut ce qu'elle vaut, et elles
///    rougissent à la mutation d'une seule case.
///
/// Le corpus des origines est verrouillé par des `switch` EXHAUSTIFS
/// (`nom(de:)`, `reprendUnContenuPublie(_:)`, `reprendUnDocumentExistant(_:)`,
/// `origine(routantVers:)`) : une dixième porte ajoutée à `ComposerOrigin` — ou
/// un cinquième composer historique — casse la COMPILATION de cette suite avant
/// de pouvoir passer sans profil éprouvé.
final class ComposerIntentTests: XCTestCase {

    // MARK: - Corpus

    /// Les valeurs associées sont arbitraires : le profil ne les lit jamais
    /// (rév. 3 du plan — `profile(for:)` est une fonction de l'ORIGINE seule).
    private static let toutesLesOrigines: [ComposerOrigin] = [
        .storyTray,
        .feedComposer,
        .reelTab,
        .moodChip,
        .repost(ofPostId: "post-source", sourceFormat: .story),
        .edit(postId: "story-a-moi", documentFormat: .post),
        .draft(id: "brouillon-42"),
        .share,
        .conversationMedia(messageId: "msg-7", attachmentId: "piece-3")
    ]

    private func nom(de origin: ComposerOrigin) -> String {
        switch origin {
        case .storyTray: return "storyTray"
        case .feedComposer: return "feedComposer"
        case .reelTab: return "reelTab"
        case .moodChip: return "moodChip"
        case .repost: return "repost"
        case .edit: return "edit"
        case .draft: return "draft"
        case .share: return "share"
        case .conversationMedia: return "conversationMedia"
        }
    }

    private func profil(_ origin: ComposerOrigin) -> ComposerProfile {
        ComposerProfile.profile(for: origin)
    }

    // MARK: - Les neuf portes

    func test_profile_storyTray_ouvreUneStoryCameraPrete() {
        let profil = profil(.storyTray)

        XCTAssertEqual(profil.initialFormat, .story, "Le tray EST la porte des stories.")
        XCTAssertEqual(profil.opensWith, .cameraReady, "On tape sur le tray pour capturer, pas pour écrire.")
        XCTAssertTrue(profil.showsSlides, "Une story se raconte en diapositives.")
        XCTAssertNil(profil.routesToLegacy, "La porte du tray est celle que le nouveau meuble sert.")
    }

    /// **Lot 3 — la porte la plus utilisée cesse de router** (spec v2 §E).
    ///
    /// La rév. 4 justifiait le routage par un manque : « le meuble n'a pas de
    /// surface *document sans scène* ». Ce motif est TOMBÉ avec le lot 2 — la
    /// surface existe (`ComposerDocumentSurface`), le meuble la monte
    /// (`MeeshyComposerHost.documentSurface`), et `ComposerSurfaceRouting` fait
    /// atterrir cette porte dessus. Une porte ne reste pas sur sa feuille
    /// historique par habitude : elle y reste tant qu'une raison la retient, et
    /// celle-là n'existe plus.
    ///
    /// Les trois assertions sont CHAÎNÉES à dessein. Éprouver le seul `nil`
    /// laisserait passer un recâblage qui enverrait le fil sur l'atelier de
    /// SCÈNE — un canvas de story à la place d'un champ de texte, exactement la
    /// régression sèche que `routesToLegacy` retenait. Ce qui compte n'est pas
    /// que la porte quitte la feuille : c'est qu'elle atterrisse sur un
    /// document.
    func test_profile_feedComposer_estServiParLeMeuble_surSaSurfaceDocument() {
        let profil = profil(.feedComposer)

        XCTAssertNil(
            profil.routesToLegacy,
            "Lot 3 : `.feedComposer` cesse de router. Tant que cette table rend `.feedComposer`, la porte "
            + "présente sa feuille historique et le meuble ne voit jamais l'ombre d'un utilisateur sur la "
            + "surface de création la plus fréquentée de l'app."
        )
        XCTAssertEqual(
            profil.initialFormat, .post,
            "Le composer du fil écrit un post : le lot 3 change son ROUTAGE, jamais ce qu'il produit."
        )
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: profil.opensWith, format: profil.initialFormat),
            .document,
            "Et ce que le meuble lui monte est la surface DOCUMENT. Une porte recâblée qui atterrirait sur "
            + "l'atelier de scène aurait quitté sa feuille pour pire qu'elle."
        )
    }

    func test_profile_reelTab_ouvreLaCameraVideoSansDiapositives() {
        let profil = profil(.reelTab)

        XCTAssertEqual(profil.initialFormat, .reel)
        XCTAssertEqual(profil.opensWith, .videoCameraReady, "Un réel naît d'une prise vidéo.")
        XCTAssertFalse(profil.showsSlides, "Un réel est une prise continue, pas une suite de pages.")
    }

    func test_profile_moodChip_resteSurLeComposerDeStatut() {
        let profil = profil(.moodChip)

        XCTAssertEqual(
            profil.routesToLegacy, .statusComposer,
            "S3 : rien ne change pour le mood — ce lot route, il ne migre pas ce chemin."
        )
        XCTAssertEqual(profil.initialFormat, .status)
    }

    func test_profile_repost_nAutorisePasLaCaptureEtResteSurSonComposer() {
        let profil = profil(.repost(ofPostId: "post-source", sourceFormat: .story))

        XCTAssertFalse(
            profil.allowsCapture,
            "Un repost cite un contenu déjà publié : la caméra n'a rien à y ajouter."
        )
        XCTAssertEqual(profil.routesToLegacy, .repostComposer)
    }

    /// L'édition ouvre au format du DOCUMENT, pas à un format fixe — le
    /// document est connu de l'appelant, qui tape « modifier » sur une carte
    /// rendue. Le routage legacy, lui, ne bouge pas dans ce périmètre.
    func test_profile_edit_ouvreAuFormatDuDocument_etGardeSonComposerActuel() {
        let profil = profil(.edit(postId: "story-a-moi", documentFormat: .post))

        XCTAssertEqual(
            profil.routesToLegacy, .storyEdit,
            "Périmètre v1 : l'édition garde son composer actuel."
        )
        XCTAssertEqual(profil.initialFormat, .post)
    }

    /// Rév. 5 (revue adversariale du 2026-08-23) : la rév. 3 justifiait ce
    /// `.post` transitoire par « c'est le host qui rebascule au format du
    /// brouillon une fois le document chargé ». **Cet écrivain n'existe pas** —
    /// `MeeshyComposerHostGuardTests.test_host_neReaffectePasLeFormatCourant_…`
    /// le grave, avec sa condition de levée.
    ///
    /// Ce qui rend le transitoire INOFFENSIF est ailleurs, et vérifié ailleurs :
    /// `ComposerSurfaceRouting` fait d'une `.resume` une SCÈNE quel que soit le
    /// format, donc reprendre un brouillon montre l'atelier qui l'a adopté et
    /// non un éditeur de texte vide
    /// (`ComposerDocumentSurfaceTests.test_surface_desDeuxPortesQuiReprennentSansLegacy_estLAtelier`).
    func test_profile_draft_reprendUnDocumentAuFormatPost() {
        let profil = profil(.draft(id: "brouillon-42"))

        XCTAssertEqual(
            profil.initialFormat, .post,
            "Rév. 3 : `.draft` ouvre en état TRANSITOIRE `.post` — la table reste une fonction de l'origine et "
            + "n'ouvre pas le document pour le deviner. Ce que ce format d'ouverture NE décide pas, c'est la "
            + "surface montée : la reprise monte l'atelier."
        )
        XCTAssertEqual(profil.opensWith, .resume)
        XCTAssertNil(profil.routesToLegacy)
    }

    func test_profile_share_reprendUnDocumentAuFormatPost() {
        let profil = profil(.share)

        XCTAssertEqual(profil.initialFormat, .post)
        XCTAssertEqual(profil.opensWith, .resume, "Le partage entrant reprend un document déjà constitué.")
        XCTAssertNil(profil.routesToLegacy)
    }

    /// Le format d'ouverture est une STORY (directive du 2026-08-23, doctrine
    /// alignée en rév. 3), et la raison est l'ASYMÉTRIE du coût de l'erreur :
    /// ouvrir une story quand l'utilisateur voulait un post se répare d'un tap
    /// dans l'éventail, alors qu'un post publié ne se dé-publie pas. Le geste
    /// courant sur un média reçu est bref ; le défaut tombe du côté réversible.
    ///
    /// La règle est écrite ici AVEC sa raison : une assertion qui porte une
    /// valeur sans sa justification ressemble à un défaut, et le prochain
    /// lecteur la « corrigerait » de bonne foi.
    func test_profile_conversationMedia_ouvreUneStorySurSaGraine() {
        let profil = profil(.conversationMedia(messageId: "msg-7", attachmentId: "piece-3"))

        XCTAssertEqual(profil.initialFormat, .story, "e9/O13 — profil DÉFINI, câblage lot G.")
        XCTAssertEqual(
            profil.opensWith, .keyboardOnContent,
            "Le média reçu est déjà posé par la porte : il ne reste que le mot à écrire."
        )
        XCTAssertNil(profil.routesToLegacy)
    }

    func test_conversationMedia_offreLEventailComplet_storyPostEtReelSiQualifiant() {
        let graine = ComposerOrigin.conversationMedia(messageId: "msg-7", attachmentId: "piece-3")

        XCTAssertEqual(eventail(graine, reel: false), [.story, .post])
        XCTAssertEqual(eventail(graine, reel: true), [.story, .post, .reel])
    }

    // MARK: - Règle : le corpus couvre toutes les portes

    func test_corpus_couvreLesNeufPortes_uneSeuleFoisChacune() {
        let noms = Self.toutesLesOrigines.map(nom(de:))

        XCTAssertEqual(
            Set(noms).count, noms.count,
            "Deux entrées du corpus désignent la même porte : une porte resterait sans profil éprouvé."
        )
        XCTAssertEqual(
            noms.count, 9,
            "Neuf portes sont spécifiées (planche §3). Une porte ajoutée à `ComposerOrigin` doit entrer ici "
            + "avec son profil, jamais s'ajouter en silence."
        )
    }

    // MARK: - Règle : diapositives et timeline suivent le FORMAT, jamais l'origine

    /// Les diapositives sont les pages d'une scène : une story les enchaîne, un
    /// post les porte en carrousel. Un réel est une prise continue et un mood
    /// une carte unique — ni l'un ni l'autre n'a de pages.
    func test_diapositives_suiventLeFormat_jamaisLOrigine() {
        for origin in Self.toutesLesOrigines {
            let profil = profil(origin)
            let attendu = profil.initialFormat == .story || profil.initialFormat == .post

            XCTAssertEqual(
                profil.showsSlides, attendu,
                "\(nom(de: origin)) : les diapositives se décident au format (\(profil.initialFormat)), "
                + "pas à la porte."
            )
        }
    }

    /// La timeline anime une scène dans le temps. Un mood n'a pas de scène —
    /// c'est un visage et un mot.
    func test_timeline_absenteAuSeulFormatStatut() {
        for origin in Self.toutesLesOrigines {
            let profil = profil(origin)

            XCTAssertEqual(
                profil.showsTimeline, profil.initialFormat != .status,
                "\(nom(de: origin)) : seul le statut se passe de timeline."
            )
        }
    }

    // MARK: - Règle : la capture

    /// Une « reprise publiée » part d'un contenu DÉJÀ publié — le post cité, la
    /// story qu'on retouche. Le brouillon et le partage reprennent eux aussi un
    /// document, mais NON publié : l'atelier y reste entier, capture comprise.
    private func reprendUnContenuPublie(_ origin: ComposerOrigin) -> Bool {
        switch origin {
        case .repost, .edit:
            return true
        case .storyTray, .feedComposer, .reelTab, .moodChip, .draft, .share, .conversationMedia:
            return false
        }
    }

    func test_capture_refuseeAuxReprisesPublieesEtAuStatut() {
        for origin in Self.toutesLesOrigines {
            let profil = profil(origin)
            let refusee = reprendUnContenuPublie(origin) || profil.initialFormat == .status

            XCTAssertEqual(
                profil.allowsCapture, !refusee,
                "\(nom(de: origin)) : la caméra n'est offerte ni sur un contenu déjà publié (elle n'y "
                + "ajouterait rien) ni sur un mood (qui n'a pas de média)."
            )
        }
    }

    // MARK: - Règle : l'état d'ouverture

    /// Une porte qui s'ouvre sur la caméra alors que le profil refuse la capture
    /// serait une porte sur une pièce fermée.
    func test_ouvertureCamera_impliqueToujoursLaCapture() {
        for origin in Self.toutesLesOrigines {
            let profil = profil(origin)
            guard profil.opensWith == .cameraReady || profil.opensWith == .videoCameraReady else { continue }

            XCTAssertTrue(
                profil.allowsCapture,
                "\(nom(de: origin)) : ouvrir sur la caméra sans autoriser la capture est une porte sur "
                + "une pièce fermée."
            )
        }
    }

    /// Deux portes seulement mettent l'appareil dans la main tout de suite : le
    /// tray (photo) et l'onglet réels (vidéo). Partout ailleurs, ouvrir sur la
    /// caméra écraserait ce que la porte vient d'apporter — ou réclamerait un
    /// geste que l'utilisateur n'a pas demandé.
    func test_ouverturesCamera_appartiennentAuxSeulesPortesDeCaptureDirecte() {
        for origin in Self.toutesLesOrigines {
            let profil = profil(origin)
            let estCamera = profil.opensWith == .cameraReady || profil.opensWith == .videoCameraReady
            let estPorteDeCapture = nom(de: origin) == "storyTray" || nom(de: origin) == "reelTab"

            XCTAssertEqual(
                estCamera, estPorteDeCapture,
                "\(nom(de: origin)) : seules les portes de capture directe ouvrent l'appareil."
            )
        }
    }

    func test_ouvertureCameraVideo_etFormatReel_seRepondent() {
        for origin in Self.toutesLesOrigines {
            let profil = profil(origin)

            XCTAssertEqual(
                profil.opensWith == .videoCameraReady, profil.initialFormat == .reel,
                "\(nom(de: origin)) : la caméra VIDÉO est l'ouverture du réel, et le réel n'ouvre que là."
            )
        }
    }

    func test_grilleDeMoods_etFormatStatut_seRepondent() {
        for origin in Self.toutesLesOrigines {
            let profil = profil(origin)

            XCTAssertEqual(
                profil.opensWith == .moodGrid, profil.initialFormat == .status,
                "\(nom(de: origin)) : la grille de moods EST l'ouverture du statut, et rien d'autre."
            )
        }
    }

    /// Reprendre, c'est retrouver un document déjà constitué : un brouillon, un
    /// partage entrant, une publication qu'on retouche.
    private func reprendUnDocumentExistant(_ origin: ComposerOrigin) -> Bool {
        switch origin {
        case .draft, .share, .edit:
            return true
        case .storyTray, .feedComposer, .reelTab, .moodChip, .repost, .conversationMedia:
            return false
        }
    }

    func test_reprise_reserveeAuxOriginesQuiRetrouventUnDocument() {
        for origin in Self.toutesLesOrigines {
            let profil = profil(origin)

            XCTAssertEqual(
                profil.opensWith == .resume, reprendUnDocumentExistant(origin),
                "\(nom(de: origin)) : on ne « reprend » que ce qui existe déjà."
            )
        }
    }

    /// Le clavier se lève sur `content`. Une story, un réel et un mood n'ont pas
    /// ce champ : y lever le clavier viserait le vide.
    /// REFORMULÉE, pas supprimée. C1 déduisait « clavier sur `content` ⟹ format
    /// post », en tenant `content` pour un champ du seul post. La loi du miroir
    /// invalide l'inférence, pas ce qu'elle protégeait : un repost de story et
    /// un média reçu lèvent aussi le clavier, sur une LÉGENDE.
    ///
    /// Ce que la règle protège vraiment : le clavier ne se lève que là où il y a
    /// un texte à écrire d'emblée. Une porte qui ouvre sur la caméra, la grille
    /// de moods ou la reprise d'un document ne le lève pas — sinon elle
    /// masquerait sa propre surface derrière un clavier.
    func test_clavierSurContenu_seulementLaOuUnTexteSEcritDEmblee() {
        let portesAClavier: [ComposerOrigin] = [
            .feedComposer,
            .repost(ofPostId: "post-source", sourceFormat: .story),
            .conversationMedia(messageId: "msg-7", attachmentId: "piece-3")
        ]

        for origin in Self.toutesLesOrigines {
            let leve = profil(origin).opensWith == .keyboardOnContent
            let attendu = portesAClavier.contains(origin)
            XCTAssertEqual(
                leve, attendu,
                "\(nom(de: origin)) : le clavier ne se lève que là où un texte s'écrit d'emblée."
            )
        }
    }

    // MARK: - Règle : ce qui route vers l'historique ne prétend pas ouvrir le neuf

    /// L'unique porte de chaque composer historique — **et `nil` pour celui que
    /// le meuble a repris**. Le `switch` reste exhaustif : un cinquième composer
    /// historique casse la compilation de cette suite.
    ///
    /// `.feedComposer` y répond `nil` depuis le lot 3. Le cas ne se supprime PAS
    /// de `LegacyComposer` pour autant, et c'est délibéré : une garde négative
    /// ne rougit que si elle sait NOMMER son interdit. Retirer le cas rendrait
    /// `test_aucunePorte_neRetombeSurLaFeuilleDuFil` inécrivable, et le retour
    /// du routage passerait alors sans un mot — le mode d'extinction silencieux
    /// propre aux gardes négatives. La feuille `FeedComposerSheet`, elle, est
    /// toujours montée par le fil : le cas nomme donc un composer qui EXISTE.
    private func origine(routantVers legacy: LegacyComposer) -> ComposerOrigin? {
        switch legacy {
        case .statusComposer: return .moodChip
        case .repostComposer: return .repost(ofPostId: "post-source", sourceFormat: .story)
        case .storyEdit: return .edit(postId: "story-a-moi", documentFormat: .post)
        case .feedComposer: return nil
        }
    }

    private static let composersHistoriques: [LegacyComposer] = [
        .statusComposer, .repostComposer, .storyEdit, .feedComposer
    ]

    /// REFORMULÉE au lot 3, jamais affaiblie. Elle affirmait « chaque composer
    /// historique a EXACTEMENT une porte » ; elle affirme désormais la même
    /// chose pour les trois qui en gardent une, **et l'ABSENCE de porte pour
    /// celui que le meuble a repris**.
    ///
    /// Ses deux moitiés rougissent, chacune pour une régression différente :
    /// une porte qui disparaîtrait d'un composer encore routé (cas mort), et le
    /// fil qui reviendrait sur sa feuille (régression produit). Le compte final
    /// est écrit en dur — `Self.composersHistoriques.count` aurait suivi la
    /// disparition du cas et se serait tu.
    func test_chaqueComposerHistorique_aExactementUnePorte_saufCeluiQueLeMeubleAAbsorbe() {
        for legacy in Self.composersHistoriques {
            guard let origin = origine(routantVers: legacy) else {
                XCTAssertFalse(
                    Self.toutesLesOrigines.contains { profil($0).routesToLegacy == legacy },
                    "\(legacy) n'a plus de porte depuis le lot 3 : une origine qui y retomberait renverrait "
                    + "la surface de création la plus utilisée de l'app sur sa feuille historique."
                )
                continue
            }

            XCTAssertEqual(
                profil(origin).routesToLegacy, legacy,
                "\(nom(de: origin)) devait router vers \(legacy) : un composer historique sans porte est "
                + "un cas mort, et deux portes sur le même composer sont une ambiguïté de routage."
            )
        }

        let routes = Self.toutesLesOrigines.compactMap { profil($0).routesToLegacy }

        XCTAssertEqual(
            routes.count, 3,
            "Lot 3 : exactement TROIS portes routent encore vers l'historique — le mood, le repost et "
            + "l'édition. Les six autres sont servies par le meuble."
        )
    }

    /// REFORMULÉE au lot 3 : la porte du fil rejoint le périmètre du meuble.
    ///
    /// L'ensemble est écrit en toutes lettres plutôt que compté — un compte
    /// resterait vert le jour où une porte en remplacerait une autre, et ce
    /// test-ci est le seul endroit qui dise QUI le meuble sert.
    func test_leMeuble_sertLesSixPortesDeSonPerimetre_dontLaPlusUtilisee() {
        let serviesParLeMeuble = Set(
            Self.toutesLesOrigines.filter { profil($0).routesToLegacy == nil }.map(nom(de:))
        )

        XCTAssertEqual(
            serviesParLeMeuble,
            ["storyTray", "feedComposer", "reelTab", "draft", "share", "conversationMedia"],
            "Périmètre après le lot 3 : le tray, LE FIL, les réels (profil défini, câblage hors v1), le "
            + "brouillon, le partage et le média de conversation (câblage lot G). Le mood, le repost et "
            + "l'édition gardent leur composer actuel."
        )
    }

    /// **La garde NÉGATIVE du lot 3 — celle qui rougit si le routage revient.**
    ///
    /// Elle ne se contente pas d'interroger la porte du fil : elle balaie les
    /// NEUF origines. Le retour du routage ne se ferait pas nécessairement sur
    /// la ligne qu'on vient de modifier — une porte voisine pourrait se mettre à
    /// pointer la feuille du fil, et le contrat « la surface de création la plus
    /// utilisée de l'app est servie par le meuble » tomberait par un autre
    /// chemin, sans que le test de la porte du fil bronche.
    ///
    /// Elle exige que `LegacyComposer.feedComposer` RESTE dans l'enum : une
    /// garde négative privée du symbole qu'elle cherche passe au vert en
    /// perdant sa protection.
    func test_aucunePorte_neRetombeSurLaFeuilleDuFil() {
        for origin in Self.toutesLesOrigines {
            XCTAssertNotEqual(
                profil(origin).routesToLegacy, LegacyComposer.feedComposer,
                "\(nom(de: origin)) route vers `FeedComposerSheet` : le lot 3 a fait cesser ce routage, et "
                + "y revenir renverrait la porte la plus utilisée de l'app sur sa feuille historique."
            )
        }
    }

    /// Annoncer un format qu'un composer historique ne sait pas produire, ce
    /// serait promettre une surface qui n'existe pas.
    /// REFORMULÉE. C1 gravait « chaque composer historique ne sait produire
    /// qu'UN format » et l'imposait au profil. La vérification a montré que
    /// cette loi décrivait le **CÂBLAGE**, jamais une capacité : le SDK accepte
    /// `targetType` depuis toujours (`StoryModels.swift:2593`), et le chemin de
    /// repost SAIT produire une story — ce sont les appelants qui envoient
    /// `nil`, et le gateway qui replie ce `nil` sur `POST`
    /// (`PostService.ts:2221`).
    ///
    /// La loi garde donc ce qu'elle protégeait — ne pas promettre une surface
    /// qui n'existe pas — mais au bon endroit :
    ///
    /// - une porte qui FIXE son format doit annoncer celui que son composer
    ///   historique produit ; c'est la partie encore vérifiable ici ;
    /// - une porte qui PORTE son format annonce le format porté, et c'est alors
    ///   la CHAÎNE COMPLÈTE qui doit savoir le produire. Ce maillon manque
    ///   encore : tant que `targetType` vaut `nil` et que le gateway le replie
    ///   sur `POST`, un repost de story produirait un post.
    ///
    /// Rien n'est vécu par l'utilisateur aujourd'hui — `ComposerProfile` n'a
    /// AUCUN site d'appel dans l'app, le modèle est inerte. La contrainte porte
    /// sur le CÂBLAGE de C2-C3, pas sur le modèle : les portes de présentation
    /// ne devront pas ouvrir un repost sur son format tant que le repli du
    /// gateway n'aura pas basculé sur `?? original.type`.
    ///
    /// **Rév. lot 3** : `.feedComposer` a QUITTÉ ce test, et son assertion n'est pas
    /// perdue — elle vit dans
    /// `test_profile_feedComposer_estServiParLeMeuble_surSaSurfaceDocument`.
    /// Ce test-ci parle des portes qui annoncent le format de leur composer
    /// HISTORIQUE ; le fil n'en a plus, et l'y laisser aurait fait dire à son
    /// nom une chose fausse. C'est le vieillissement exact que la rév. 4 de
    /// `ComposerIntent` a laissé courir un lot durant.
    func test_formatAnnonce_desPortesQuiFixentLeurFormat_estCeluiDuComposerHistorique() {
        XCTAssertEqual(profil(.moodChip).initialFormat, .status, "statusComposer ne produit qu'un statut.")
    }

    func test_formatAnnonce_desPortesQuiPortentLeurFormat_estLeFormatPorte() {
        XCTAssertEqual(profil(.repost(ofPostId: "p", sourceFormat: .story)).initialFormat, .story)
        XCTAssertEqual(profil(.edit(postId: "d", documentFormat: .reel)).initialFormat, .reel)
    }

    /// **Sentinelle LEVÉE le 2026-08-23 (C2), et transformée — pas supprimée.**
    ///
    /// Elle affirmait « le profil n'est consommé par AUCUNE surface », et son
    /// rôle était d'empêcher qu'on le câble AVANT que les appelants du repost
    /// n'envoient le type de leur carte — sans quoi une porte aurait pu ouvrir
    /// un repost sur un format que la chaîne d'envoi ne produisait pas.
    ///
    /// Les deux moitiés de cette condition sont désormais vraies :
    /// V0 bis moitié iOS a livré les six sites (`92529dac5`, arrivé sur `main`
    /// par la PR #3389), et C2 câble le profil dans `MeeshyComposerHost`.
    ///
    /// Supprimer la garde à ce moment-là aurait été le geste facile et faux :
    /// on aurait rendu la suite verte en PERDANT la protection, et rien
    /// n'aurait plus empêché un futur site de repost de repasser à `nil`. Elle
    /// encode donc maintenant la CONDITION elle-même — les six sites portent
    /// leur format — au lieu de l'attente qui la précédait. C'est la même
    /// exigence, exprimée du bon côté du seuil.
    func test_lesSixSitesDuRepost_portentLeFormatDeLeurCarte() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")

        // Les six sites recensés le 2026-08-23. Les deux sites `.post` du viewer
        // de story ne sont PAS ici : ils étaient déjà conformes, et sont devenus
        // l'option explicite d'ancrage (loi 5).
        let sites = ["ReelsViewModel", "FeedViewModel", "PostDetailView",
                     "ProfileUserPostsList", "RootViewComponents", "FeedView"]

        for site in sites {
            guard let enumerateur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
                return XCTFail("Arborescence app introuvable à \(racine.path)")
            }
            var trouve = false
            for case let url as URL in enumerateur where url.lastPathComponent == "\(site).swift" {
                let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
                trouve = true
                XCTAssertTrue(
                    source.contains("targetType"),
                    "\(site) n'envoie plus de `targetType` — le repost y retomberait sur le défaut serveur `?? POST`, et un réel ou une story y perdrait son format"
                )
                XCTAssertFalse(
                    source.contains("targetType: nil"),
                    "\(site) repasse `targetType: nil` — c'est exactement l'arbitrage que la loi du miroir a renversé"
                )
            }
            XCTAssertTrue(trouve, "Site de repost introuvable : \(site).swift — la garde ne mesurerait rien pour lui")
        }
    }

    // MARK: - Règle : la table est une fonction de l'ORIGINE seule

    /// La loi de C1 se PRÉCISE, elle ne tombe pas : le profil ignore la GRAINE
    /// — les identifiants que la porte transporte — mais le FORMAT qu'une porte
    /// porte fait partie de son identité, pas de sa graine.
    ///
    /// Deux reposts de deux posts DU MÊME FORMAT ouvrent le même composer ;
    /// un repost de story et un repost de post, non. C'est tout l'objet du
    /// miroir : « le format d'un repost miroite celui de sa source ».
    func test_profil_ignoreLaGraine_deSaPorte() {
        XCTAssertEqual(
            profil(.repost(ofPostId: "a", sourceFormat: .story)),
            profil(.repost(ofPostId: "b", sourceFormat: .story)),
            "Le profil se lit sur la porte, pas sur l'identifiant qu'elle apporte."
        )
        XCTAssertEqual(
            profil(.edit(postId: "a", documentFormat: .post)),
            profil(.edit(postId: "b", documentFormat: .post))
        )
        XCTAssertEqual(profil(.draft(id: "a")), profil(.draft(id: "b")))
        XCTAssertEqual(
            profil(.conversationMedia(messageId: "m1", attachmentId: "p1")),
            profil(.conversationMedia(messageId: "m2", attachmentId: "p2"))
        )
    }

    func test_profil_distingueLeFormatQueLaPortePorte() {
        XCTAssertNotEqual(
            profil(.repost(ofPostId: "a", sourceFormat: .story)),
            profil(.repost(ofPostId: "a", sourceFormat: .post)),
            "Le format d'une source n'est pas une graine : il change le composer."
        )
        XCTAssertNotEqual(
            profil(.edit(postId: "a", documentFormat: .post)),
            profil(.edit(postId: "a", documentFormat: .reel))
        )
    }

    /// La graine n'a pas de champ à elle : elle est matérialisée par les valeurs
    /// associées de l'origine (rév. 3). Deux intentions qui pointent des médias
    /// différents sont donc deux intentions différentes.
    func test_intention_distingueLesGrainesQuElleTransporte() {
        let premiere = ComposerIntent(origin: .conversationMedia(messageId: "msg-7", attachmentId: "piece-3"))
        let seconde = ComposerIntent(origin: .conversationMedia(messageId: "msg-7", attachmentId: "piece-4"))

        XCTAssertNotEqual(premiere, seconde)
        XCTAssertEqual(premiere, ComposerIntent(origin: .conversationMedia(messageId: "msg-7", attachmentId: "piece-3")))
    }

    // MARK: - Règle : le vocabulaire des formats est celui du SDK

    /// `ComposerFormat` nomme les quatre mêmes contenus que `PostType` (SDK,
    /// `StoryModels.swift`) : le composer ne s'invente pas un cinquième format,
    /// et ce qu'il ouvre se publie sous le type que le serveur connaît.
    func test_chaqueFormat_correspondAUnPostTypeDuSDK_etReciproquement() {
        // Un ANCRAGE avant l'aller-retour, et il n'est pas redondant avec lui.
        // L'aller-retour seul ne prouve PAS que le pont est correct : il prouve
        // que ses deux sens sont inverses l'un de l'autre, ce que satisfait
        // TOUTE permutation cohérente. Transposer .story et .post des deux
        // côtés laisse la suite entièrement verte — mesuré — et une story
        // partirait au serveur sous « POST ». Épingler UN sens sur le
        // vocabulaire du serveur retire ce degré de liberté ; l'aller-retour
        // ci-dessous épingle alors l'autre.
        XCTAssertEqual(ComposerFormat.story.postType.rawValue, "STORY")
        XCTAssertEqual(ComposerFormat.post.postType.rawValue, "POST")
        XCTAssertEqual(ComposerFormat.reel.postType.rawValue, "REEL")
        XCTAssertEqual(ComposerFormat.status.postType.rawValue, "STATUS")

        for type in PostType.allCases {
            XCTAssertEqual(
                ComposerFormat(type).postType, type,
                "\(type) doit faire l'aller-retour sans perte : sinon deux vocabulaires divergent."
            )
        }

        let formats = Self.toutesLesOrigines.map { profil($0).initialFormat }

        XCTAssertEqual(
            Set(formats.map { $0.postType.rawValue }).count, 4,
            "Les neuf portes couvrent les quatre formats — aucun format n'est déclaré sans porte."
        )
    }

    // MARK: - Règle : l'éventail des formats (loi 9, raffinée par le contrat V0)

    /// Miroir de `composerOpening()` (`packages/shared/utils/composer-contract.ts`).
    /// Le contrat est la SOURCE, ce fichier en est le miroir : toute évolution
    /// touche les deux sites, et ces assertions sont ce qui le prouve.
    ///
    /// Contrainte de la **loi 4** pour les consommateurs : un format absent de
    /// `offeredFormats` n'est pas grisé — il n'est PAS AFFICHÉ.

    private func eventail(_ origin: ComposerOrigin, reel: Bool = false) -> [ComposerFormat] {
        ComposerProfile.profile(for: origin, compositionQualifiesAsReel: reel).offeredFormats
    }

    /// L'invariant qui tient tout le reste : on ne peut pas ouvrir sur un format
    /// que l'éventail n'offre pas, sinon le sélecteur naîtrait sur une valeur
    /// qu'il ne sait pas afficher.
    func test_eventail_contientToujoursLeFormatInitial_pourToutePorteEtToutContexte() {
        for origin in Self.toutesLesOrigines {
            for reel in [false, true] {
                let profil = ComposerProfile.profile(for: origin, compositionQualifiesAsReel: reel)
                XCTAssertTrue(
                    profil.offeredFormats.contains(profil.initialFormat),
                    "\(nom(de: origin)) (réel=\(reel)) ouvre sur un format qu'il n'offre pas."
                )
            }
        }
    }

    func test_eventail_neComporteAucunDoublon() {
        for origin in Self.toutesLesOrigines {
            for reel in [false, true] {
                let offerts = eventail(origin, reel: reel)
                XCTAssertEqual(
                    offerts.count, Set(offerts.map(\.postType.rawValue)).count,
                    "\(nom(de: origin)) propose deux fois le même format."
                )
            }
        }
    }

    /// « Le format d'un repost MIROITE celui de sa source. »
    func test_repost_ouvreAuFormatDeSaSource() {
        XCTAssertEqual(profil(.repost(ofPostId: "p", sourceFormat: .story)).initialFormat, .story)
        XCTAssertEqual(profil(.repost(ofPostId: "p", sourceFormat: .reel)).initialFormat, .reel)
        XCTAssertEqual(profil(.repost(ofPostId: "p", sourceFormat: .status)).initialFormat, .status)
        XCTAssertEqual(profil(.repost(ofPostId: "p", sourceFormat: .post)).initialFormat, .post)
    }

    /// Changer le format d'un repost est le geste d'ANCRAGE — « garder la chose
    /// pour de bon ». L'éphémère reste éphémère par défaut ; le post est la
    /// seule cible permanente, donc la seule option ajoutée.
    func test_repost_offreSaSourceEtLAncrageEnPost() {
        XCTAssertEqual(eventail(.repost(ofPostId: "p", sourceFormat: .story)), [.story, .post])
        XCTAssertEqual(eventail(.repost(ofPostId: "p", sourceFormat: .reel)), [.reel, .post])
        XCTAssertEqual(eventail(.repost(ofPostId: "p", sourceFormat: .status)), [.status, .post])
    }

    /// Reposter un post ne le propose pas deux fois : il est déjà son propre
    /// ancrage. Un sélecteur à une seule option ne doit donc pas s'afficher.
    func test_repost_dUnPost_nOffreQueLePost() {
        XCTAssertEqual(eventail(.repost(ofPostId: "p", sourceFormat: .post)), [.post])
    }

    func test_edit_ouvreAuFormatDuDocument() {
        XCTAssertEqual(profil(.edit(postId: "d", documentFormat: .story)).initialFormat, .story)
        XCTAssertEqual(profil(.edit(postId: "d", documentFormat: .reel)).initialFormat, .reel)
    }

    /// L'édition ne convertit qu'entre POST et RÉEL : `UpdatePostSchema.type`
    /// est un `z.enum(['POST','REEL'])`, le serveur refuse le reste. Changer le
    /// format d'un contenu déjà publié est le rôle du REPOST, pas de l'édition.
    func test_edit_dUneStoryOuDUnStatut_nOffreAucunChoix() {
        XCTAssertEqual(eventail(.edit(postId: "d", documentFormat: .story), reel: true), [.story])
        XCTAssertEqual(eventail(.edit(postId: "d", documentFormat: .status), reel: true), [.status])
    }

    func test_edit_convertitEntrePostEtReel() {
        XCTAssertEqual(eventail(.edit(postId: "d", documentFormat: .reel)), [.reel, .post])
        XCTAssertEqual(eventail(.edit(postId: "d", documentFormat: .post), reel: true), [.post, .reel])
        XCTAssertEqual(eventail(.edit(postId: "d", documentFormat: .post), reel: false), [.post])
    }

    /// Le gate AJOUTE le réel, il ne RETIRE jamais le format propre d'une porte.
    /// Sans cette asymétrie, l'invariant précédent tomberait pour l'onglet
    /// réels, dont la composition n'existe pas encore quand la caméra s'ouvre.
    func test_qualificationReel_ajouteLeReel_etNeRetireRien() {
        for origin in Self.toutesLesOrigines {
            let sans = eventail(origin, reel: false)
            let avec = eventail(origin, reel: true)
            for format in sans {
                XCTAssertTrue(
                    avec.contains(format),
                    "\(nom(de: origin)) PERD \(format) quand la composition qualifie en réel."
                )
            }
        }
    }

    func test_reelTab_offreReelEtPost_sansConditionDeQualification() {
        XCTAssertEqual(eventail(.reelTab, reel: false), [.reel, .post])
        XCTAssertEqual(eventail(.reelTab, reel: true), [.reel, .post])
    }

    func test_moodChip_nOffreQueLeStatut() {
        XCTAssertEqual(eventail(.moodChip, reel: true), [.status])
    }

    /// Le gate du réel gouverne l'ÉVENTAIL, jamais le ROUTAGE. C'est ce qui
    /// autorise `ComposerIntent.routesToLegacy` à trancher sans composition
    /// sous la main — la porte doit savoir quoi présenter AVANT que quoi que
    /// ce soit soit composé, et une supposition à cet endroit-là ouvrirait le
    /// mauvais composer.
    ///
    /// Sans ce test, la propriété se supposerait : le jour où une porte se
    /// mettrait à router différemment selon la qualification, `routesToLegacy`
    /// répondrait faux en silence, et la porte présenterait le meuble là où le
    /// legacy était attendu.
    func test_routageLegacy_neDependJamaisDeLaQualificationEnReel() {
        for origin in Self.toutesLesOrigines {
            XCTAssertEqual(
                ComposerProfile.profile(for: origin, compositionQualifiesAsReel: false).routesToLegacy,
                ComposerProfile.profile(for: origin, compositionQualifiesAsReel: true).routesToLegacy,
                "\(nom(de: origin)) change de composer historique selon la composition — le routage doit être stable."
            )
        }
    }

    // MARK: - Règle : ce que vise un repost — la racine, au format de la carte

    /// La confusion a été faite en revue puis rattrapée : « seul le serveur
    /// connaît le type de la racine, donc lui seul peut miroiter » est
    /// mécaniquement vrai et produit FAUX. Ces cas sont ce qui empêche de la
    /// refaire.

    func test_repostTarget_sansChaine_viseLaCarteElleMeme() {
        let cible = RepostTargeting.target(cardId: "carte-1", cardType: "POST")

        XCTAssertEqual(cible.postId, "carte-1")
        XCTAssertEqual(cible.targetType, .post)
    }

    /// La RÉFÉRENCE remonte à la racine : sans quoi le repost d'un repost
    /// embarquerait une carte de partage vide.
    func test_repostTarget_dUneChaine_viseLaRacine() {
        let cible = RepostTargeting.target(
            cardId: "carte-2", cardType: "POST",
            repostOfId: "intermediaire", originalRepostOfId: "racine"
        )

        XCTAssertEqual(cible.postId, "racine")
    }

    func test_repostTarget_sansRacineHydratee_viseCeQueLaCarteRepartage() {
        let cible = RepostTargeting.target(cardId: "carte-3", cardType: "POST", repostOfId: "partagee")

        XCTAssertEqual(cible.postId, "partagee")
    }

    /// LE CAS QUI TRANCHE. Une carte de fil de type POST qui embarque une
    /// story : la référence remonte à la story, le format reste POST. Faire
    /// suivre le format à la racine donnerait une story de 20 h dans le tray
    /// de quelqu'un qui a agi sur une carte de fil et voulait son fil.
    func test_repostTarget_dUnePosteQuiEmbarqueUneStory_resteUnPost() {
        let cible = RepostTargeting.target(
            cardId: "carte-4", cardType: "POST",
            repostOfId: "story-source", originalRepostOfId: "story-source"
        )

        XCTAssertEqual(cible.postId, "story-source", "La référence remonte à la racine.")
        XCTAssertEqual(cible.targetType, .post, "Le format reste celui de la CARTE, jamais de la racine.")
    }

    func test_repostTarget_dUnReel_resteUnReel() {
        XCTAssertEqual(RepostTargeting.target(cardId: "r", cardType: "REEL").targetType, .reel)
    }

    /// Le vocabulaire serveur est en capitales ; un fil qui sert autre chose ne
    /// doit pas produire un type que la passerelle ne reconnaîtrait pas.
    func test_repostTarget_normaliseLeVocabulaireServeur() {
        XCTAssertEqual(RepostTargeting.target(cardId: "c", cardType: " reel ").targetType, .reel)
    }

    /// `nil` reste le FILET du gateway (`?? POST`), jamais une intention : une
    /// carte sans type déclaré ne doit pas inventer de format.
    func test_repostTarget_sansTypeDeCarte_laisseLeRepliDecider() {
        XCTAssertNil(RepostTargeting.target(cardId: "c", cardType: nil).targetType)
        XCTAssertNil(RepostTargeting.target(cardId: "c", cardType: "   ").targetType)
        XCTAssertNil(
            RepostTargeting.target(cardId: "c", cardType: "PODCAST").targetType,
            "Un type que le SDK ne connaît pas ne doit pas inventer de format."
        )
    }
}
