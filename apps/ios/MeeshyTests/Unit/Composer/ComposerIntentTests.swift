import XCTest
import MeeshySDK
// `ComposerChromeOwner` et `ComposerTopBarControl` vivent dans MeeshyUI :
// la chaîne du mood (porte → surface → chrome → publieur) les NOMME, et
// s'appuyer sur la seule visibilité transitive de `@testable import Meeshy`
// est ce qui casse au premier renommage.
import MeeshyUI
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
/// un composer historique de plus — casse la COMPILATION de cette suite avant
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
        .edit(postId: "post-a-moi", documentFormat: .post),
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

    /// Les quatre formats, écrits en toutes lettres. `ComposerFormat` n'est pas
    /// `CaseIterable` — le rendre tel pour ce corpus aurait élargi le modèle de
    /// production au bénéfice d'un test, et le `switch` exhaustif de `nom(_:)`
    /// ci-dessous casse déjà la compilation si un cinquième format apparaît.
    private static let tousLesFormats: [ComposerFormat] = [.story, .post, .reel, .status]

    private func nom(_ format: ComposerFormat) -> String {
        switch format {
        case .story: return "story"
        case .post: return "post"
        case .reel: return "reel"
        case .status: return "status"
        }
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

    /// **REFORMULÉE au lot 4.6, jamais affaiblie.** Elle affirmait « rien ne
    /// change pour le mood — ce lot route, il ne migre pas ce chemin » ; la
    /// migration a eu lieu, et la garde change donc d'objet plutôt que de
    /// disparaître.
    ///
    /// Ce qu'elle affirme désormais est PLUS que l'ancienne assertion : la porte
    /// est servie par le meuble, ET son format d'ouverture est resté le statut.
    /// Le second point était déjà là ; le premier est ce que le lot a livré.
    func test_profile_moodChip_estServiParLeMeuble() {
        let profil = profil(.moodChip)

        XCTAssertNil(
            profil.routesToLegacy,
            "Lot 4.6 : la porte du mood ouvre le MEUBLE. Y revenir renverrait les six déclencheurs sur "
            + "`StatusComposerView`, que plus aucune feuille ne monte."
        )
        XCTAssertEqual(profil.initialFormat, .status)
    }

    /// **REFORMULÉE au lot 4.7.** Son nom promettait deux choses dont une a
    /// cessé d'être vraie : la capture reste refusée à TOUS les reposts, mais
    /// le routage ne l'est plus « pour le repost » en bloc — il l'est pour les
    /// trois formats dont le meuble ne sait rien faire.
    ///
    /// Les deux moitiés sont donc éprouvées séparément ci-dessous, et la seconde
    /// écrit ses QUATRE cas en toutes lettres plutôt que d'en compter trois : un
    /// compte serait resté vert le jour où un format en remplacerait un autre.
    func test_profile_repost_nAutorisePasLaCapture_quelQueSoitSonFormat() {
        for format in Self.tousLesFormats {
            XCTAssertFalse(
                profil(.repost(ofPostId: "post-source", sourceFormat: format)).allowsCapture,
                "Un repost cite un contenu déjà publié : la caméra n'a rien à y ajouter, en \(nom(format)) comme ailleurs."
            )
        }
    }

    /// **Lot 4.7 — le routage de cette porte est fonction du FORMAT PORTÉ**, ce
    /// que la doctrine de la table autorise en toutes lettres (« le FORMAT qu'une
    /// porte porte fait partie de son identité »).
    ///
    /// Faire passer `.repost` à `nil` en bloc aurait fait dire à la table que le
    /// meuble sert aussi les reposts de story, de post et de réel. C'est faux, et
    /// mesuré : le meuble n'a aucune graine `StoryItem`, son canal de scène ne
    /// porte pas `repostOfId`, et il ne passe ni `allowedVisibilities` ni
    /// `initialVisibilityUserIds` à l'atelier — le plafond d'audience du repost
    /// (`StoryRepostAudience`, loi 10) tomberait EN SILENCE.
    func test_profile_repost_neQuitteSonComposer_queDansLeFormatQueLeMeubleSaitServir() {
        XCTAssertNil(
            profil(.repost(ofPostId: "s", sourceFormat: .status)).routesToLegacy,
            "Le repost d'un MOOD est servi par le meuble : sa surface existe, son envoi est celui du mood."
        )
        for format: ComposerFormat in [.story, .post, .reel] {
            XCTAssertEqual(
                profil(.repost(ofPostId: "s", sourceFormat: format)).routesToLegacy, .repostComposer,
                "Le repost d'un \(nom(format)) garde son composer : sa graine est un StoryItem que le meuble ne "
                + "sait pas adopter, et son plafond d'audience n'a aucun chemin jusqu'à l'atelier."
            )
        }
    }

    /// L'édition ouvre au format du DOCUMENT, pas à un format fixe — le
    /// document est connu de l'appelant, qui tape « modifier » sur une carte
    /// rendue. Elle garde son composer historique dans ce périmètre ; ce qui
    /// change au lot 7.8, c'est LEQUEL.
    ///
    /// **Rév. lot 7.8 — la table cesse de faire passer un post pour une
    /// story.** Elle rendait `.storyEdit` quel que soit le format, or
    /// `.storyEdit` désigne `storyEditComposerCover`, l'atelier d'une STORY.
    /// Éditer un post ou un réel — ce que font les cinq montages
    /// d'`EditPostSheet` — n'avait aucune représentation. Le routage suit
    /// désormais le FORMAT, ce que la doctrine de la table autorise en toutes
    /// lettres (« le FORMAT qu'une porte porte fait partie de son identité »),
    /// et l'inventaire de parité qui gouverne le retrait de la feuille vit dans
    /// `EditParityInventoryTests`.
    func test_profile_edit_ouvreAuFormatDuDocument_etGardeSonComposerActuel() {
        let profil = profil(.edit(postId: "post-a-moi", documentFormat: .post))

        XCTAssertEqual(
            profil.routesToLegacy, .editPostSheet,
            "Périmètre v1 : l'édition garde son composer actuel — et pour un POST, c'est `EditPostSheet`, "
            + "jamais l'atelier d'une story."
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
    ///
    /// **L'OUVERTURE a changé au lot 5, et la raison est double.** Elle valait
    /// `.keyboardOnContent`, ce qui disait deux choses fausses : que le clavier
    /// se lèverait (`focusesContentOnAppear` n'a qu'un consommateur de
    /// production, la surface DOCUMENT — sous la scène, rien ne le lit, et
    /// l'atelier n'a aucun champ « contenu » à mettre au foyer), et que « Post »
    /// monterait un document (où la photo semée disparaîtrait de l'écran ET de
    /// la publication). `.mediaSeeded` dit ce que la porte FAIT — le média est
    /// déjà posé — et route ses trois formats sur la scène, ce qui rend enfin
    /// son éventail peignable.
    func test_profile_conversationMedia_ouvreUneStorySurSaGraine() {
        let profil = profil(.conversationMedia(messageId: "msg-7", attachmentId: "piece-3"))

        XCTAssertEqual(profil.initialFormat, .story, "e9/O13 — le média reçu ouvre une story.")
        XCTAssertEqual(
            profil.opensWith, .mediaSeeded,
            "Le média reçu est DÉJÀ posé par la porte : il n'y a ni capture à ouvrir, ni champ à mettre "
                + "au foyer — et tous ses formats doivent rester dans l'atelier."
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

    /// **Précisée au lot 4.7, sur une lecture qui était déjà fausse.** Le sens
    /// « la grille de moods n'ouvre QUE sur un statut » tient partout et pour
    /// toujours. Sa réciproque — « tout statut s'ouvre sur la grille » — ne vaut
    /// que pour les portes qui FIXENT leur format : une porte qui PORTE le sien
    /// peut être un statut ouvert au clavier, et c'est exactement la
    /// republication d'un mood (`.repost(sourceFormat: .status)`), qui ouvre sur
    /// `.keyboardOnContent`.
    ///
    /// Le corpus des neuf portes ne contient qu'un repost de STORY, si bien que
    /// l'équivalence y reste vraie — mais l'écrire comme une loi générale en
    /// aurait fait la loi que lirait la session suivante, celle qui déduirait la
    /// surface de l'OUVERTURE au lieu du FORMAT. Les deux sens sont donc
    /// éprouvés séparément, et le second sur son domaine.
    func test_grilleDeMoods_ouvreToujoursUnStatut_etLeStatutFixeSOuvreSurElle() {
        for origin in Self.toutesLesOrigines + [.repost(ofPostId: "s", sourceFormat: .status)] {
            let profil = profil(origin)
            guard profil.opensWith == .moodGrid else { continue }
            XCTAssertEqual(
                profil.initialFormat, .status,
                "\(nom(de: origin)) ouvre la grille de moods sur autre chose qu'un statut."
            )
        }

        for origin in Self.toutesLesOrigines {
            let profil = profil(origin)
            XCTAssertEqual(
                profil.opensWith == .moodGrid, profil.initialFormat == .status,
                "\(nom(de: origin)) : parmi les neuf portes, la grille de moods EST l'ouverture du statut."
            )
        }

        XCTAssertEqual(
            profil(.repost(ofPostId: "s", sourceFormat: .status)).opensWith, .keyboardOnContent,
            "La republication d'un mood ouvre au CLAVIER, pas sur la grille : elle reprend un emoji déjà choisi. "
            + "C'est le FORMAT qui la fait atterrir sur la surface du mood, jamais son ouverture."
        )
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
    /// invalide l'inférence, pas ce qu'elle protégeait : un repost de story lève
    /// aussi le clavier, sur une LÉGENDE.
    ///
    /// Ce que la règle protège vraiment : le clavier ne se lève que là où il y a
    /// un texte à écrire d'emblée. Une porte qui ouvre sur la caméra, la grille
    /// de moods ou la reprise d'un document ne le lève pas — sinon elle
    /// masquerait sa propre surface derrière un clavier.
    ///
    /// **`.conversationMedia` a QUITTÉ cette liste au lot 5.** Elle y figurait
    /// depuis C1 et n'y avait jamais eu sa place : `focusesContentOnAppear` n'a
    /// qu'un consommateur de production — la surface DOCUMENT —, et cette porte
    /// monte l'ATELIER, où il n'y a aucun champ « contenu » à mettre au foyer
    /// (on écrit dans une story en posant un OBJET TEXTE). La ligne ANNONÇAIT
    /// donc un clavier qui ne se lève pas, et c'est cette annonce que le lot a
    /// retirée, pas une capacité.
    func test_clavierSurContenu_seulementLaOuUnTexteSEcritDEmblee() {
        let portesAClavier: [ComposerOrigin] = [
            .feedComposer,
            .repost(ofPostId: "post-source", sourceFormat: .story)
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
    /// le meuble a repris**. Le `switch` reste exhaustif : un composer historique
    /// de plus casse la compilation de cette suite. C'est ce qui a fait remonter
    /// le lot 7.8 jusqu'ici : `.editPostSheet` ne pouvait pas naître en silence.
    ///
    /// « Unique » se lit au niveau de la PORTE, pas du format. Deux formats
    /// atteignent `.editPostSheet` (le post et le réel, plus le mood qu'aucun
    /// site n'offre d'éditer) ; la porte, elle, reste `.edit`, et ce sont
    /// `EditParityInventoryTests` qui éprouvent le routage format par format.
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
        // Lot 4.6 : la porte du mood a rejoint le meuble. Le cas RESTE dans
        // `LegacyComposer` pour la même raison que `.feedComposer` — sans lui,
        // `test_aucunePorte_neRetombeSurLeComposerDeMood` serait inécrivable, et
        // le retour du routage passerait sans un mot.
        case .statusComposer: return nil
        case .repostComposer: return .repost(ofPostId: "post-source", sourceFormat: .story)
        // Lot 7.8 : `.storyEdit` désigne `storyEditComposerCover`, et donc
        // l'édition d'une STORY — c'est le format qui l'atteint, pas la porte.
        // La table rendait ce cas pour les quatre formats ; l'écrire ici en
        // `.post` était la moitié test du même mensonge.
        case .storyEdit: return .edit(postId: "story-a-moi", documentFormat: .story)
        case .editPostSheet: return .edit(postId: "post-a-moi", documentFormat: .post)
        case .feedComposer: return nil
        }
    }

    private static let composersHistoriques: [LegacyComposer] = [
        .statusComposer, .repostComposer, .storyEdit, .editPostSheet, .feedComposer
    ]

    /// REFORMULÉE au lot 3 puis au lot 4.6, jamais affaiblie. Elle affirmait
    /// « chaque composer historique a EXACTEMENT une porte » ; elle affirme
    /// désormais la même chose pour ceux qui en gardent une, **et l'ABSENCE de
    /// porte pour ceux que le meuble a repris** — le fil, puis le mood.
    ///
    /// Ses deux moitiés rougissent, chacune pour une régression différente :
    /// une porte qui disparaîtrait d'un composer encore routé (cas mort), et un
    /// composer absorbé qui reviendrait dans la table (régression produit). Le
    /// compte final est écrit en dur — `Self.composersHistoriques.count` aurait
    /// suivi la disparition d'un cas et se serait tu.
    ///
    /// **Attention à ce que le compte mesure.** Il porte sur le CORPUS, dont le
    /// seul repost est un repost de STORY. Le repost d'un mood, servi par le
    /// meuble depuis le lot 4.7, ne fait donc pas baisser ce compte : c'est
    /// `test_profile_repost_neQuitteSonComposer_queDansLeFormatQueLeMeubleSaitServir`
    /// qui tient cette moitié-là, format par format.
    func test_chaqueComposerHistorique_aExactementUnePorte_saufCeuxQueLeMeubleAAbsorbes() {
        for legacy in Self.composersHistoriques {
            guard let origin = origine(routantVers: legacy) else {
                XCTAssertFalse(
                    Self.toutesLesOrigines.contains { profil($0).routesToLegacy == legacy },
                    "\(legacy) n'a plus de porte : une origine qui y retomberait renverrait sur une feuille "
                    + "historique que plus aucun site ne monte."
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
            routes.count, 2,
            "Lot 4.6 : exactement DEUX portes du corpus routent encore vers l'historique — le repost (de "
            + "STORY, le seul du corpus) et l'édition. Les sept autres sont servies par le meuble."
        )
    }

    /// REFORMULÉE au lot 3 (le fil), puis au lot 4.6 (le mood) : le périmètre du
    /// meuble s'écrit en toutes lettres, jamais en compte — un compte resterait
    /// vert le jour où une porte en remplacerait une autre, et ce test-ci est le
    /// seul endroit qui dise QUI le meuble sert.
    ///
    /// **Le nom du test a changé avec l'ensemble.** Un nom qui dirait « six » sur
    /// un ensemble de sept est un mensonge silencieux : il passe au vert, et la
    /// session suivante le lit comme la loi.
    func test_leMeuble_sertLesSeptPortesDeSonPerimetre_dontLaPlusUtiliseeEtLeMood() {
        let serviesParLeMeuble = Set(
            Self.toutesLesOrigines.filter { profil($0).routesToLegacy == nil }.map(nom(de:))
        )

        XCTAssertEqual(
            serviesParLeMeuble,
            ["storyTray", "feedComposer", "reelTab", "moodChip", "draft", "share", "conversationMedia"],
            "Périmètre après le lot 4.6 : le tray, LE FIL, les réels (profil défini, câblage hors v1), LE "
            + "MOOD, le brouillon, le partage et le média de conversation (câblage lot G). Le repost de "
            + "story/post/réel et l'édition gardent leur composer actuel."
        )
    }

    /// **La garde NÉGATIVE du lot 4.6 — jumelle exacte de celle du fil.**
    ///
    /// Elle balaie les NEUF origines plutôt que d'interroger la seule porte du
    /// mood : le retour du routage ne se ferait pas nécessairement sur la ligne
    /// qu'on vient de modifier. Une porte voisine pourrait se mettre à pointer
    /// `StatusComposerView`, et le contrat « le mood est servi par le meuble »
    /// tomberait par un autre chemin sans que le test de la porte du mood
    /// bronche.
    ///
    /// Elle exige que `LegacyComposer.statusComposer` RESTE dans l'énum : une
    /// garde négative privée du symbole qu'elle cherche passe au vert en perdant
    /// sa protection. C'est aussi ce qui la rend écrivable AVANT le retrait du
    /// fichier (tâche 4.8, conditionnelle) — le cas nomme un composer qui existe.
    func test_aucunePorte_neRetombeSurLeComposerDeMood() {
        for origin in Self.toutesLesOrigines {
            XCTAssertNotEqual(
                profil(origin).routesToLegacy, LegacyComposer.statusComposer,
                "\(nom(de: origin)) route vers `StatusComposerView` : le lot 4.6 a fait cesser ce routage, et "
                + "y revenir renverrait les six déclencheurs du mood sur une feuille que plus aucun site ne monte."
            )
        }

        for format in Self.tousLesFormats {
            XCTAssertNotEqual(
                profil(.repost(ofPostId: "s", sourceFormat: format)).routesToLegacy, LegacyComposer.statusComposer,
                "Le repost en \(nom(format)) route vers `StatusComposerView` : aucun format n'y revient."
            )
        }
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
    ///
    /// **Rév. lot 4.6 : son DERNIER occupant était `.moodChip`, et il vient de
    /// quitter l'historique lui aussi.** Le test ne se supprime pas — il se
    /// TRANSFORME, et son assertion (« la porte du mood ouvre sur `.status` »)
    /// est reprise mot pour mot dans la chaîne ci-dessous, augmentée des trois
    /// maillons qui la rendent atteignable.
    ///
    /// **Les quatre maillons ensemble, jamais un seul.** C'est la raison que
    /// `test_leMeuble_monteLeDocument_pourLaPorteDuFil` écrit déjà : chacun pris
    /// isolément laisse passer une régression que les autres attrapent. Une
    /// porte qui routerait de nouveau, une règle de surface qui renverrait le
    /// document, un chrome qui céderait à un atelier absent — trois façons
    /// différentes de livrer un écran où l'on compose un mood sans pouvoir
    /// l'envoyer.
    func test_laChaineDuMood_vaDeLaPorte_jusquAuPublieur() {
        let profil = profil(.moodChip)

        XCTAssertEqual(profil.initialFormat, .status, "La porte du mood ouvre sur un statut, et sur rien d'autre.")
        XCTAssertNil(profil.routesToLegacy, "1er maillon — la porte ouvre le MEUBLE.")

        let surface = ComposerSurfaceRouting.surface(opening: profil.opensWith, format: profil.initialFormat)
        XCTAssertEqual(surface, .mood, "2e maillon — le meuble monte la surface du mood, pas le document.")

        XCTAssertEqual(
            ComposerChromeOwnership.owner(for: surface), .host,
            "3e maillon — le chrome revient au meuble : il n'y a pas d'atelier sous cette surface pour peindre la flèche."
        )
        XCTAssertTrue(
            ComposerChromeOwnership.socleZones(for: surface).contains(.publish),
            "4e maillon — et le socle peint bien un PUBLIEUR. Sans lui, les trois premiers maillons mèneraient "
            + "à un écran sans issue, ce que le lot 3 a refusé de livrer pour la porte du fil."
        )
    }

    /// **Lot 4.7 — la même chaîne, pour la REPUBLICATION d'un mood.**
    ///
    /// Elle ne se déduit pas de la précédente : la porte du repost n'ouvre pas
    /// sur `.moodGrid` mais sur `.keyboardOnContent`, et c'est le FORMAT — non
    /// l'ouverture — qui la fait atterrir sur la surface du mood. Écrire la règle
    /// sur l'ouverture serait resté vert pour la création et aurait fait
    /// atterrir la republication sur un éditeur de texte.
    func test_laChaineDeLaRepublicationDUnMood_vaDeLaPorte_jusquAuPublieur() {
        let profil = profil(.repost(ofPostId: "mood-source", sourceFormat: .status))

        XCTAssertEqual(profil.initialFormat, .status, "La republication MIROITE le format de sa source.")
        XCTAssertNil(profil.routesToLegacy, "1er maillon — le repost d'un mood ouvre le MEUBLE.")
        XCTAssertNotEqual(profil.opensWith, .moodGrid, "L'ouverture n'est PAS celle de la création — c'est le format qui tranche.")

        let surface = ComposerSurfaceRouting.surface(opening: profil.opensWith, format: profil.initialFormat)
        XCTAssertEqual(surface, .mood, "2e maillon — republier un mood ouvre la surface du mood.")
        XCTAssertEqual(ComposerChromeOwnership.owner(for: surface), .host, "3e maillon — le chrome revient au meuble.")
        XCTAssertTrue(
            ComposerChromeOwnership.socleZones(for: surface).contains(.publish),
            "4e maillon — le socle publie."
        )
    }

    // MARK: - Lot 4.7 — la graine que la porte PORTE

    /// **`repostOfId` vient de la PORTE, jamais d'un paramètre parallèle.**
    ///
    /// C'est ce que le commentaire de `ComposerOrigin` dit déjà : la graine n'a
    /// pas de champ à elle, elle est matérialisée par les valeurs associées. Un
    /// site de montage qui recopierait l'identifiant à côté en ferait une
    /// SECONDE source — deux « quel post republie-t-on » à faire diverger.
    func test_laGraineDuRepost_estLueSurLaPorte_etAucuneAutrePorteNEnRendUne() {
        XCTAssertEqual(
            ComposerOrigin.repost(ofPostId: "racine-42", sourceFormat: .status).repostedPostId, "racine-42",
            "La porte du repost porte l'identifiant republié — c'est lui que le brouillon du mood emportera."
        )
        XCTAssertEqual(
            ComposerOrigin.repost(ofPostId: "racine-42", sourceFormat: .story).repostedPostId, "racine-42",
            "Le format ne change rien à la LECTURE de la graine, seulement au composer qui l'ouvre."
        )

        for origin in Self.toutesLesOrigines where nom(de: origin) != "repost" {
            XCTAssertNil(
                origin.repostedPostId,
                "\(nom(de: origin)) n'est pas une republication : lui faire rendre un identifiant ferait partir "
                + "un `repostOfId` sur une création, et le serveur y verrait un repartage."
            )
        }
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
    ///
    /// **CE QUE CE FILET COÛTE, écrit ici pour qu'il cesse d'être silencieux.**
    /// `targetType: nil` fait replier le gateway sur `POST`
    /// (`services/gateway/src/services/PostService.ts:2278`,
    /// `opts.targetType ?? PostType.POST`), et `computeExpiresAt(POST)`
    /// (`:2288`) ne pose alors aucune échéance : une story ou un mood
    /// repartagés deviennent un post PERMANENT. C'est un ANCRAGE que personne
    /// n'a demandé — l'issue que la loi 5 du prisme composer nomme « la plus
    /// coûteuse », et l'inverse exact de l'ancrage VOLONTAIRE
    /// (`StoryViewerView.repostAsPostDirect`, `targetType: .post` en dur).
    ///
    /// Le filet reste le bon arbitrage — supposer un format serait pire — mais
    /// il ne doit être atteint que par une carte réellement sans type, jamais
    /// par une course entre le tap et l'envoi
    /// (`test_lesTroisSitesDeCourse_lisentLaCarteAvantDOuvrirLeTask`).
    func test_repostTarget_sansTypeDeCarte_laisseLeRepliDecider() {
        XCTAssertNil(RepostTargeting.target(cardId: "c", cardType: nil).targetType)
        XCTAssertNil(RepostTargeting.target(cardId: "c", cardType: "   ").targetType)
        XCTAssertNil(
            RepostTargeting.target(cardId: "c", cardType: "PODCAST").targetType,
            "Un type que le SDK ne connaît pas ne doit pas inventer de format."
        )
    }

    /// LA MOITIÉ DE LA LOI QUI N'ÉTAIT COUVERTE NULLE PART. Les cas de
    /// RÉFÉRENCE ci-dessus portent tous un `cardType` connu, et le cas du
    /// FILET ci-dessus ne repartage rien. La combinaison — une carte SANS type
    /// déclaré qui repartage quelque chose — ne l'était donc pas, alors que
    /// c'est exactement la forme qu'une carte servie par un fil ancien ou par
    /// un cache d'une version antérieure peut prendre.
    ///
    /// Les deux règles du lot 0 bis sont INDÉPENDANTES : le filet sur le
    /// FORMAT ne doit jamais contaminer la RÉFÉRENCE. Un repost dont le format
    /// se replie sur le défaut serveur doit malgré tout viser la RACINE, sans
    /// quoi il produirait la carte de partage vide que `repostTargetId`
    /// (`packages/shared/utils/repost-target.ts`, jumeau de cette règle) existe
    /// pour éviter.
    func test_leFiletDuFormat_neContaminePasLaReference() {
        let sansTypeMaisAvecRacine = RepostTargeting.target(
            cardId: "carte", cardType: nil,
            repostOfId: "maillon", originalRepostOfId: "racine"
        )

        XCTAssertEqual(
            sansTypeMaisAvecRacine.postId, "racine",
            "Un format inconnu ne doit pas faire retomber la référence sur la carte : la chaîne se replie toujours sur sa racine."
        )
        XCTAssertNil(
            sansTypeMaisAvecRacine.targetType,
            "Le format reste au filet du gateway — il ne s'invente pas depuis la racine."
        )

        let typeInconnuSansRacineHydratee = RepostTargeting.target(
            cardId: "carte", cardType: "PODCAST", repostOfId: "maillon"
        )

        XCTAssertEqual(typeInconnuSansRacineHydratee.postId, "maillon")
        XCTAssertNil(typeInconnuSansRacineHydratee.targetType)
    }

    // MARK: - Règle : la carte se lit au TAP, jamais après l'envoi

    /// Les trois sites qui repostent depuis une VUE prenaient leur instantané
    /// de carte À L'INTÉRIEUR du `Task`, derrière un `await MainActor.run` —
    /// et leur commentaire décrivait la course qu'ils subissaient.
    ///
    /// Une fonction `@MainActor` n'exécute pas son `Task` au tap : elle
    /// l'ENFILE. Entre l'enfilage et le premier tour de boucle du `Task`, le
    /// socket peut retirer la carte du modèle. La lecture rend alors `nil`,
    /// `RepostTargeting` rend `targetType: nil`, et le filet du gateway ANCRE
    /// un éphémère (voir `test_repostTarget_sansTypeDeCarte_laisseLeRepliDecider`
    /// pour le coût exact et ses ancres serveur).
    ///
    /// La garde mesure l'ORDRE dans le corps de la fonction, pas une absence :
    /// la lecture doit précéder le `Task`. Elle porte aussi son ancre POSITIVE
    /// — la lecture doit EXISTER —, sans quoi renommer la propriété lue
    /// éteindrait la protection en silence au lieu de la faire rougir.
    func test_lesTroisSitesDeCourse_lisentLaCarteAvantDOuvrirLeTask() throws {
        for site in Self.sitesDeRepostDepuisUneVue {
            let source = try sourceDeProduction(site.fichier)

            guard let corps = DeclarationBodyScanner.body(containing: site.declaration, in: source) else {
                XCTFail("`\(site.declaration)` introuvable dans \(site.fichier) — la garde ne mesurerait plus rien pour ce site")
                continue
            }
            let nu = DeclarationBodyScanner.mask(corps)

            guard let lecture = nu.range(of: site.lecture) else {
                XCTFail("\(site.fichier) ne lit plus la carte par `\(site.lecture)` — la garde ne mesurerait plus rien pour ce site")
                continue
            }
            guard let tache = nu.range(of: "Task {") else {
                XCTFail("\(site.fichier) n'ouvre plus de `Task` dans `\(site.declaration)` — revoir cette garde avant de la croire")
                continue
            }

            XCTAssertTrue(
                lecture.lowerBound < tache.lowerBound,
                "\(site.fichier) lit la carte DANS le `Task` : un tour de boucle du main actor peut l'avoir retirée du modèle entre le tap et l'envoi, `cardType` rend alors `nil`, le gateway replie sur `POST` et une story repartagée devient un post permanent. L'instantané se prend avant d'ouvrir le `Task`."
            )
            XCTAssertFalse(
                nu.contains("MainActor.run"),
                "\(site.fichier) refait un saut d'acteur pour lire la carte : l'instantané pris au tap n'a besoin d'aucun `await`, et tout saut réintroduit la course."
            )
        }
    }

    /// Les trois sites de repost qui lisent leur carte dans un ÉTAT DE VUE
    /// (les trois autres la reçoivent en paramètre ou la lisent au premier
    /// énoncé de leur fonction, sans `Task` intercalé).
    private static let sitesDeRepostDepuisUneVue: [(fichier: String, declaration: String, lecture: String)] = [
        (fichier: "FeedView.swift",
         declaration: "private func togglePostRepost(postId: String)",
         lecture: "viewModel.posts.first(where: { $0.id == postId })"),
        (fichier: "RootViewComponents.swift",
         declaration: "private func togglePostRepost(postId: String)",
         lecture: "viewModel.posts.first(where: { $0.id == postId })"),
        (fichier: "PostDetailView.swift",
         declaration: "private func toggleDetailRepost(quote: Bool)",
         lecture: "displayPost")
    ]

    /// `LocalizedError` et non `Error` nu : XCTest rapporte une erreur lancée
    /// par `localizedDescription`, et un `Error` sans `errorDescription` y perd
    /// son message au profit d'un « error 1 » qui ne dit rien.
    private struct SourceDeProductionIntrouvable: LocalizedError {
        let nom: String
        var errorDescription: String? {
            "Source de production introuvable : \(nom) — la garde ne mesurerait rien pour ce site"
        }
    }

    /// Racine des sources de l'app, dérivée du chemin de CE fichier :
    /// `MeeshyTests/Unit/Composer/…` remonte quatre niveaux jusqu'à `apps/ios`.
    private func sourceDeProduction(_ nomDeFichier: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")

        guard let enumerateur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
            throw SourceDeProductionIntrouvable(nom: nomDeFichier)
        }
        for case let url as URL in enumerateur where url.lastPathComponent == nomDeFichier {
            return try String(contentsOf: url, encoding: .utf8)
        }
        throw SourceDeProductionIntrouvable(nom: nomDeFichier)
    }
}
