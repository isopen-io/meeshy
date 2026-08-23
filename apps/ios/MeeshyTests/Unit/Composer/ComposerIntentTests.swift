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

    func test_profile_feedComposer_resteSurSaFeuilleHistorique() {
        let profil = profil(.feedComposer)

        XCTAssertEqual(
            profil.routesToLegacy, .feedComposer,
            "Rév. 4 : le meuble n'a pas de surface « document sans scène » (clavier sur content, rangée "
            + "photo·caméra·emoji·document·lieu·micro, envoi durable offline). Recâbler la porte la plus "
            + "utilisée sans elle serait une régression sèche — la bascule est post-v1."
        )
        XCTAssertEqual(profil.initialFormat, .post)
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

    func test_profile_draft_reprendUnDocumentAuFormatPost() {
        let profil = profil(.draft(id: "brouillon-42"))

        XCTAssertEqual(
            profil.initialFormat, .post,
            "Rév. 3 : `.draft` ouvre en état TRANSITOIRE `.post` ; c'est le host qui rebascule au format du "
            + "brouillon une fois le document chargé (loi 9 — les capacités suivent le format courant)."
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

    /// L'unique porte de chaque composer historique. Le `switch` est exhaustif :
    /// un cinquième composer historique casse la compilation de cette suite.
    private func origine(routantVers legacy: LegacyComposer) -> ComposerOrigin {
        switch legacy {
        case .statusComposer: return .moodChip
        case .repostComposer: return .repost(ofPostId: "post-source", sourceFormat: .story)
        case .storyEdit: return .edit(postId: "story-a-moi", documentFormat: .post)
        case .feedComposer: return .feedComposer
        }
    }

    private static let composersHistoriques: [LegacyComposer] = [
        .statusComposer, .repostComposer, .storyEdit, .feedComposer
    ]

    func test_chaqueComposerHistorique_aExactementUnePorte() {
        for legacy in Self.composersHistoriques {
            let origin = origine(routantVers: legacy)

            XCTAssertEqual(
                profil(origin).routesToLegacy, legacy,
                "\(nom(de: origin)) devait router vers \(legacy) : un composer historique sans porte est "
                + "un cas mort, et deux portes sur le même composer sont une ambiguïté de routage."
            )
        }

        let routes = Self.toutesLesOrigines.compactMap { profil($0).routesToLegacy }

        XCTAssertEqual(
            routes.count, Self.composersHistoriques.count,
            "Exactement quatre portes routent vers l'historique — les cinq autres sont servies par le meuble."
        )
    }

    func test_leMeuble_neSertQueLesCinqPortesDeSonPerimetre() {
        let serviesParLeMeuble = Set(
            Self.toutesLesOrigines.filter { profil($0).routesToLegacy == nil }.map(nom(de:))
        )

        XCTAssertEqual(
            serviesParLeMeuble,
            ["storyTray", "reelTab", "draft", "share", "conversationMedia"],
            "Périmètre v1 : le tray, les réels (profil défini, câblage hors v1), le brouillon, le partage "
            + "et le média de conversation (câblage lot G). Tout le reste garde son composer actuel."
        )
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
    func test_formatAnnonce_desPortesQuiFixentLeurFormat_estCeluiDuComposerHistorique() {
        XCTAssertEqual(profil(.moodChip).initialFormat, .status, "statusComposer ne produit qu'un statut.")
        XCTAssertEqual(profil(.feedComposer).initialFormat, .post, "feedComposer ne produit qu'un post.")
    }

    func test_formatAnnonce_desPortesQuiPortentLeurFormat_estLeFormatPorte() {
        XCTAssertEqual(profil(.repost(ofPostId: "p", sourceFormat: .story)).initialFormat, .story)
        XCTAssertEqual(profil(.edit(postId: "d", documentFormat: .reel)).initialFormat, .reel)
    }

    /// Le modèle reste INERTE tant que le maillon manque : aucun consommateur
    /// applicatif ne peut donc afficher un format que la chaîne ne produirait
    /// pas. Cette garde rougit le jour où quelqu'un câble le profil sans avoir
    /// d'abord fait basculer le repli du gateway.
    func test_leProfil_nEstEncoreConsommeParAucuneSurface() {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        guard let enumerateur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
            return XCTFail("Arborescence app introuvable à \(racine.path)")
        }
        var consommateurs: [String] = []
        for case let url as URL in enumerateur where url.pathExtension == "swift" {
            guard url.lastPathComponent != "ComposerIntent.swift",
                  let source = try? String(contentsOf: url, encoding: .utf8),
                  source.contains("ComposerProfile.profile(for:") else { continue }
            consommateurs.append(url.lastPathComponent)
        }
        XCTAssertEqual(
            consommateurs, [],
            "Le profil est CÂBLÉ (\(consommateurs)) : vérifier que le repli du gateway miroite avant d'ouvrir un repost sur son format."
        )
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
}
