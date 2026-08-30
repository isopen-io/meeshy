import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// Gardes du bouton 🔇 — Lot E, Task E2 (« trois surfaces, monté si piste
/// seulement »). B3.6.
///
/// « UN SEUL prédicat partagé avec E1 » : le bouton n'existe QUE si
/// `BackgroundSoundBadge.announcement(for:)` (le résolveur unique, E1) ne
/// rend pas `.none` — jamais une seconde condition d'existence recopiée à la
/// main qui pourrait diverger. `BackgroundSoundBadge.showsMuteButton(for:)`
/// est CE prédicat, écrit une fois à côté de `backgroundSound(of:)`/
/// `announcement(for:)` (E1), appelé par les surfaces qui montent un bouton
/// muet — jamais un `!= BackgroundAudioAnnouncement.none` recopié localement
/// (vérifié par `test_readingSurfaces_neverRecomputeExistenceLocally`).
///
/// Correctif revue DoD (rejet du commit 1721a0ee2) : « le bouton existe » ne
/// suffit pas — le tap doit RÉELLEMENT atteindre un lecteur. Deux des trois
/// surfaces livraient un état muet en ÉCRITURE SEULE (déclaré, basculé, lu
/// pour l'icône — aucun consommateur). Fermé ici :
/// - carte de post (`FeedPostCard`) : bouton ABSENT — décision DÉFINITIVE
///   depuis E3, plus un report. `ScenePlayerConfig(mode: .card).isMuted` est
///   gelé à `true` côté SDK (B4) et `isPlaying` y est un `.constant(false)`
///   figé (E3, née en pause et le RESTE) : la scène de carte ne jouera JAMAIS
///   de son, donc aucun bouton muet n'aura jamais de lecteur local à piloter
///   sur cette surface. B3.6-carte est CLOSE par une décision d'architecture
///   (silence permanent par construction), pas par un bouton temporairement
///   retiré. Le badge E1 (annonce) reste inchangé ;
/// - détail de post (`PostDetailView`) : bouton CONSERVÉ, mais sa porte est
///   maintenant conjuguée au prédicat de rendu réel du canvas
///   (`BackgroundSoundBadge.detailCanvasIsRendered`) — un post NON-story
///   portant son propre fond (son emprunté, E1) ne monte plus un bouton
///   inerte ;
/// - plein écran réel (`ReelsPlayerView`) : bouton CONSERVÉ, gate additionnée
///   (`borrowedSoundTrack != nil` — le seul cas où un lecteur LOCAL existe
///   réellement), le tap pilote RÉELLEMENT `audioPlayer.togglePlayPause()`.
final class MuteButtonExistenceGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    /// Le bloc de code entre deux marqueurs (le second exclu). `end == nil`
    /// borne jusqu'à la fin du fichier.
    private func block(from start: String, to end: String?, in text: String) -> String {
        guard let startRange = text.range(of: start) else { return "" }
        let tail = text[startRange.upperBound...]
        guard let end, let endRange = tail.range(of: end) else { return String(tail) }
        return String(tail[..<endRange.lowerBound])
    }

    // MARK: - B3.6 existence : un prédicat pur, partagé

    func test_showsMuteButton_noneAnnouncement_isFalse() {
        XCTAssertFalse(BackgroundSoundBadge.showsMuteButton(for: .none))
    }

    func test_showsMuteButton_originalAnnouncement_isTrue() {
        XCTAssertTrue(BackgroundSoundBadge.showsMuteButton(for: .original))
    }

    func test_showsMuteButton_creditAnnouncementWithMetadata_isTrue() {
        XCTAssertTrue(BackgroundSoundBadge.showsMuteButton(
            for: .credit(title: "Nuits d'été", username: "sam", duration: 15)
        ))
    }

    /// Cache froid (métadonnées `nil`) : la piste EXISTE toujours (B3.4, « si
    /// et seulement si » — `.credit` ne dégénère jamais vers `.none`), le
    /// bouton doit donc rester monté.
    func test_showsMuteButton_creditAnnouncementWithoutMetadata_isTrue() {
        XCTAssertTrue(BackgroundSoundBadge.showsMuteButton(
            for: .credit(title: nil, username: nil, duration: nil)
        ))
    }

    // MARK: - « L'icône dit l'état »

    func test_muteIconName_whenMuted_isSpeakerSlash() {
        XCTAssertEqual(BackgroundSoundBadge.muteIconName(isMuted: true), "speaker.slash.fill")
    }

    func test_muteIconName_whenUnmuted_isSpeakerWave() {
        XCTAssertEqual(BackgroundSoundBadge.muteIconName(isMuted: false), "speaker.wave.2.fill")
    }

    // MARK: - Câblage : les surfaces neuves réutilisent le prédicat PARTAGÉ, jamais un `!= .none` recopié
    //
    // Correctif revue (constat mineur #10) : la forme QUALIFIÉE seulement —
    // un simple `!= .none` matcherait n'importe quel autre enum de ces
    // fichiers (faux positif garanti à terme, sans lien avec le défaut
    // visé) ; `!= BackgroundAudioAnnouncement.none` est le cas précis.
    func test_readingSurfaces_neverRecomputeExistenceLocally() throws {
        let surfaces = [
            "Meeshy/Features/Main/Views/FeedPostCard.swift",
            "Meeshy/Features/Main/Views/PostDetailView.swift",
            "Meeshy/Features/Main/Views/ReelsPlayerView.swift",
        ]
        for path in surfaces {
            let text = try source(path)
            XCTAssertFalse(
                text.contains("!= BackgroundAudioAnnouncement.none"),
                "\(path) ne doit jamais recopier localement une condition d'existence " +
                "qualifiée — un seul prédicat partagé, BackgroundSoundBadge.showsMuteButton(for:)."
            )
        }
    }

    // MARK: - Carte (FeedPostCard) — bouton ABSENT PAR DÉCISION (E3 a clos le report)
    //
    // E2 avait retiré le bouton faute de lecteur local à piloter, en le
    // reportant à E3. E3 a livré la scène de carte et démontré que le report
    // était en réalité IMPOSSIBLE à honorer : `ScenePlayerConfig(mode: .card)`
    // fige `isMuted = true` côté SDK (B4, contrat gelé) et E3 monte la scène
    // avec un `isPlaying` en `.constant(false)`. La carte est donc silencieuse
    // PAR CONSTRUCTION — aucun bouton muet n'y aura jamais de lecteur à
    // piloter. B3.6-carte est close par une décision d'architecture, pas par
    // un bouton en attente : ce qui suit garde la DÉCISION, pas un report.

    func test_feedPostCard_muteButton_isNeverMounted_cardIsSilentByConstruction() throws {
        // #4078/#4084 — la rangée auteur a quitté `FeedPostCard.swift` pour
        // `FeedPostCard+Header.swift`. Une garde NÉGATIVE laissée sur le seul
        // hôte serait passée au vert sans plus rien protéger : c'est dans la
        // moitié EXTRAITE qu'un bouton muet réapparaîtrait.
        let text = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
            + source("Meeshy/Features/Main/Views/FeedPostCard+Header.swift")
        XCTAssertFalse(
            text.contains("BackgroundSoundBadge.showsMuteButton(for: backgroundSoundAnnouncement)"),
            "La carte ne doit JAMAIS monter de bouton muet : sa scène est muette par " +
            "construction (ScenePlayerConfig(mode: .card).isMuted figé à true, B4) et née en " +
            "pause pour de bon (isPlaying en .constant(false), E3). Aucun lecteur local n'y " +
            "existera pour le piloter."
        )
        XCTAssertFalse(
            text.contains("isBackgroundSoundMuted"),
            "État muet DÉCORATIF retiré : la carte ne doit plus déclarer un état qui n'atteint " +
            "aucun lecteur."
        )
    }

    /// Non-régression E1 : le badge d'ANNONCE (pas le bouton) reste monté,
    /// résolu sur la MÊME valeur qu'avant — seule la commande de contrôle a
    /// été retirée, pas l'affichage informatif.
    func test_feedPostCard_backgroundSoundBadge_stillMounted_noRegression() throws {
        let text = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(
            text.contains("var backgroundSoundAnnouncement: BackgroundAudioAnnouncement"),
            "La carte doit continuer d'exposer l'annonce résolue (E1)."
        )
        // Le badge lui-même est parti dans l'extraction ; la valeur, non.
        XCTAssertTrue(
            try source("Meeshy/Features/Main/Views/FeedPostCard+Header.swift")
                .contains("announcement: backgroundSoundAnnouncement"),
            "Le badge (E1) doit continuer de consommer cette valeur — non-régression."
        )
    }

    // MARK: - Détail (PostDetailView) — rangée d'actions + canvas RÉELLEMENT muté

    func test_postDetailView_mountsMuteButton_gatedBySharedResolver() throws {
        let text = try source("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(
            text.contains("let renderedItem = StoryItem(feedPost: post)"),
            "La conversion StoryItem(feedPost:) doit être hissée en UNE valeur partagée " +
            "par la porte du bouton et storyCanvasSection (correctif revue #8) — jamais " +
            "reconstruite par évaluation de body."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.announcement(for: renderedItem.storyEffects)"),
            "Le détail doit résoudre l'annonce via le MÊME résolveur partagé (E1), sur la " +
            "valeur HISSÉE — pas une reconstruction locale."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.showsMuteButton(for:"),
            "Le bouton muet du détail doit se monter via le prédicat partagé."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.muteIconName(isMuted: isCanvasMuted)"),
            "L'icône du bouton doit dire l'état via le helper partagé."
        )
    }

    /// Correctif revue (BLOQUANT-adjacent, majeur #3) : la porte du bouton
    /// ne doit JAMAIS diverger du canvas RÉELLEMENT rendu par
    /// `postDetailContent` — un post NON-story portant son PROPRE
    /// storyEffects (son emprunté, forme dominante E1) n'affiche aucun
    /// canvas nulle part et ne doit donc PAS monter de bouton.
    func test_postDetailView_muteButtonGate_isConjoinedWithCanvasRenderPredicate() throws {
        let text = try source("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.detailCanvasIsRendered(post: post, renderedItem: renderedItem)"),
            "La porte du bouton doit conjuguer le prédicat de rendu réel du canvas " +
            "(BackgroundSoundBadge.detailCanvasIsRendered) — pas seulement l'existence de " +
            "l'annonce, qui peut être vraie sans qu'aucun canvas ne rende (post non-story " +
            "portant son propre fond)."
        )
    }

    /// Le tap doit RÉELLEMENT contrôler le lecteur local : les DEUX sites qui
    /// rendaient le canvas story avec `mute: false` figé (natif + repost-de-
    /// story, RF3) passent par le même état local.
    func test_postDetailView_canvasSites_wireToLocalMuteState() throws {
        // #4086 — le chemin NATIF a suivi la section canvas dans son propre
        // fichier ; le chemin republication est resté chez l'hôte. Compter sur
        // un seul des deux ferait dire à cette garde « un site câblé » là où
        // il y en a bien deux — un rouge honnête, mais qui désigne le mauvais
        // coupable et invite à recâbler ce qui l'est déjà.
        let text = try source("Meeshy/Features/Main/Views/PostDetailView.swift")
            + source("Meeshy/Features/Main/Views/PostDetailView+Canvas.swift")
        let wiredOccurrences = text.components(separatedBy: "mute: isCanvasMuted").count - 1
        XCTAssertEqual(
            wiredOccurrences, 2,
            "Les DEUX sites StoryReaderRepresentable (natif + repost-de-story, RF3) doivent " +
            "consommer le même état local — pas un troisième site oublié, pas une régression " +
            "vers un seul site câblé."
        )
        XCTAssertFalse(
            text.contains("mute: false"),
            "Aucun site ne doit plus figer le mute à `false` — c'est précisément ce que le " +
            "bouton local doit désormais piloter."
        )
    }

    func test_postDetailView_muteState_isLocalNotGlobal() throws {
        let text = try source("Meeshy/Features/Main/Views/PostDetailView.swift")
        // `private` est TOMBÉ au #4086, et pour une raison qui ne change rien
        // à ce que cette garde protège : un membre `private` d'une View n'est
        // pas visible depuis un fichier d'EXTENSION, où le chemin natif vit
        // désormais. Ce qui compte ici est `@State` — l'état reste LOCAL à la
        // vue, ce que la seconde assertion confirme par la négative.
        XCTAssertTrue(
            text.contains("@State var isCanvasMuted"),
            "Le muet du détail doit être un état LOCAL à la vue."
        )
        XCTAssertFalse(
            text.contains("isGlobalMuted"),
            "Le détail ne doit JAMAIS référencer le muet global du viewer story."
        )
    }

    // MARK: - `BackgroundSoundBadge.detailCanvasIsRendered` — comportement RÉEL, pas juste la source
    //
    // Les gardes de source ci-dessus ne couvrent que le CÂBLAGE (le bon
    // appel est présent) — jamais si le prédicat calcule la bonne réponse.
    // Ces tests construisent de VRAIS FeedPost dans les formes que la
    // production émet (E1 : BorrowedSoundPost pour un post NON-story) et
    // appellent la fonction bout en bout.

    /// Forme dominante E1 pour un son EMPRUNTÉ SANS canvas : post de type
    /// POST (pas STORY), pas de repost, storyEffects PROPRE (le fond
    /// emprunté). Aucun canvas ne rend nulle part dans postDetailContent —
    /// le prédicat DOIT retourner false, sous peine de bouton inerte
    /// (c'est exactement le défaut du commit rejeté).
    func test_detailCanvasIsRendered_nonStoryPostWithOwnBackground_isFalse() {
        var post = FeedPost(author: "alice", authorId: "a1", type: "POST", content: "")
        post.storyEffects = StoryEffects(backgroundAudioId: "lib-sound-9")
        let renderedItem = StoryItem(feedPost: post)
        XCTAssertFalse(
            BackgroundSoundBadge.detailCanvasIsRendered(post: post, renderedItem: renderedItem),
            "Un post NON-story portant son propre fond audio ne rend AUCUN canvas — le " +
            "bouton ne doit pas se monter (défaut du commit rejeté)."
        )
    }

    /// Story native avec effects — storyCanvasSection rend bien un canvas.
    func test_detailCanvasIsRendered_nativeStoryWithEffects_isTrue() {
        var post = FeedPost(author: "alice", authorId: "a1", type: "STORY", content: "")
        post.storyEffects = StoryEffects(backgroundAudioId: "lib-sound-9")
        let renderedItem = StoryItem(feedPost: post)
        XCTAssertTrue(BackgroundSoundBadge.detailCanvasIsRendered(post: post, renderedItem: renderedItem))
    }

    /// Story native SANS effects ni média — storyCanvasSection rend le
    /// placeholder « Story indisponible », pas un canvas.
    func test_detailCanvasIsRendered_emptyNativeStory_isFalse() {
        let post = FeedPost(author: "alice", authorId: "a1", type: "STORY", content: "")
        let renderedItem = StoryItem(feedPost: post)
        XCTAssertFalse(BackgroundSoundBadge.detailCanvasIsRendered(post: post, renderedItem: renderedItem))
    }

    /// POST qui reposte une STORY dont la source a du contenu : `repostEmbed`
    /// rend son canvas.
    func test_detailCanvasIsRendered_storyRepostWithContent_isTrue() {
        let repost = RepostContent(author: "bob", authorId: "b1", content: "", type: "STORY",
                                    storyEffects: StoryEffects(backgroundAudioId: "lib-sound-9"))
        let post = FeedPost(author: "alice", authorId: "a1", type: "POST", content: "", repost: repost)
        let renderedItem = StoryItem(feedPost: post)
        XCTAssertTrue(BackgroundSoundBadge.detailCanvasIsRendered(post: post, renderedItem: renderedItem))
    }

    /// **Vue `2h` (#4086) — le témoin de la règle unique.**
    ///
    /// POST qui reposte une STORY dont la source est EXPIRÉE ou sans asset.
    /// Ce cas répondait `true` : la branche republication de la porte ne
    /// demandait que le TYPE, et elle avait raison de le faire, puisque
    /// `repostEmbed` rendait alors un canvas NOIR — sans aucune garde de
    /// contenu, là où le chemin natif affiche « Story indisponible ». Le
    /// bouton muet se montait par-dessus, prêt à piloter un lecteur sans rien
    /// à jouer.
    ///
    /// C'est le seul cas où la règle unique change une réponse : au rang
    /// « story native » comme au rang « repost de post », l'ancienne et la
    /// nouvelle écriture rendent le même verdict. Un témoin posé ailleurs ne
    /// serait donc jamais tombé.
    func test_detailCanvasIsRendered_storyRepostWithEmptySource_isFalse() {
        let repost = RepostContent(author: "bob", authorId: "b1", content: "", type: "STORY")
        let post = FeedPost(author: "alice", authorId: "a1", type: "POST", content: "", repost: repost)
        let renderedItem = StoryItem(feedPost: post)
        XCTAssertFalse(
            BackgroundSoundBadge.canvasHasContent(renderedItem),
            "Rien à rendre : ni effects, ni média — ni côté post, ni côté source."
        )
        XCTAssertFalse(
            BackgroundSoundBadge.detailCanvasIsRendered(post: post, renderedItem: renderedItem),
            "Une story republiée dont la source a disparu doit afficher « Story " +
            "indisponible », donc AUCUN canvas — et donc aucun bouton de son."
        )
    }

    /// Le second facteur de la porte reste nécessaire : `canvasHasContent`
    /// seul dirait `true` pour un post NON-story portant son propre fond
    /// audio (son emprunté, E1), alors qu'aucun canvas ne rend nulle part.
    /// Sans lui, la règle unique deviendrait une régression.
    func test_canvasHasContent_aloneIsNotEnough_theNatureOfThePostStillCounts() {
        var post = FeedPost(author: "alice", authorId: "a1", type: "POST", content: "")
        post.storyEffects = StoryEffects(backgroundAudioId: "lib-sound-9")
        let renderedItem = StoryItem(feedPost: post)
        XCTAssertTrue(BackgroundSoundBadge.canvasHasContent(renderedItem))
        XCTAssertFalse(BackgroundSoundBadge.isCanvasPost(post))
        XCTAssertFalse(BackgroundSoundBadge.detailCanvasIsRendered(post: post, renderedItem: renderedItem))
    }

    // MARK: - Vue `2h` — une règle, trois consommateurs (garde de source)

    /// Les DEUX chemins de rendu passent par le point de décision unique.
    /// Le chemin republication l'a rejoint ici : il appelait
    /// `storyCanvasContainer` en direct, sans garde.
    func test_bothCanvasPaths_goThroughTheSingleDecisionPoint() throws {
        let canvas = try source("Meeshy/Features/Main/Views/PostDetailView+Canvas.swift")
        let host = try source("Meeshy/Features/Main/Views/PostDetailView.swift")

        XCTAssertTrue(
            canvas.contains("BackgroundSoundBadge.canvasHasContent(renderedItem)"),
            "Le point de décision doit consulter la règle partagée, jamais la réécrire."
        )
        XCTAssertTrue(
            canvas.contains("storyCanvasOrPlaceholder(renderedItem: renderedItem)"),
            "Le chemin NATIF doit passer par le point de décision."
        )
        XCTAssertTrue(
            host.contains("storyCanvasOrPlaceholder(renderedItem: renderedItem)"),
            "Le chemin REPUBLICATION doit passer par le MÊME point de décision — " +
            "sans lui, une source expirée rend un rectangle noir sous un bouton de son."
        )
    }

    /// **Garde NÉGATIVE — la condition ne doit être réécrite NULLE PART.**
    ///
    /// C'est la forme même du défaut de la vue `2h` : trois sites disaient la
    /// même chose, et la copie la plus pauvre décidait. Elle balaie l'hôte ET
    /// son extension : le code a traversé cette frontière dans ce lot, et une
    /// garde négative restée sur un seul fichier passerait au vert en ne
    /// regardant plus rien.
    func test_theEmptinessRule_isNeverRewrittenOutsideItsSite() throws {
        let sites = try source("Meeshy/Features/Main/Views/PostDetailView.swift")
            + source("Meeshy/Features/Main/Views/PostDetailView+Canvas.swift")

        for rewrite in ["storyEffects == nil && renderedItem.media.isEmpty",
                        "renderedItem.storyEffects != nil || !renderedItem.media.isEmpty"] {
            XCTAssertFalse(
                sites.contains(rewrite),
                "Condition de contenu réécrite à la main (« \(rewrite) ») : elle vit " +
                "dans BackgroundSoundBadge.canvasHasContent(_:), et nulle part ailleurs."
            )
        }
    }

    /// Fusible : sans lui, les deux gardes ci-dessus passeraient au vert sur
    /// une lecture vide — le mode de panne le plus courant d'une garde de
    /// source, et le seul qu'aucune de ses assertions ne peut signaler.
    func test_thePostDetailSourcesAreActuallyRead() throws {
        XCTAssertGreaterThan(
            try source("Meeshy/Features/Main/Views/PostDetailView+Canvas.swift").count, 1_000)
        XCTAssertGreaterThan(
            try source("Meeshy/Features/Main/Views/PostDetailView.swift").count, 50_000)
    }

    /// POST qui reposte un POST (pas une story) : ni storyCanvasSection ni
    /// la branche isStoryRepost de repostEmbed ne rendent de canvas.
    func test_detailCanvasIsRendered_nonStoryRepost_isFalse() {
        let repost = RepostContent(author: "bob", authorId: "b1", content: "", type: "POST")
        let post = FeedPost(author: "alice", authorId: "a1", type: "POST", content: "", repost: repost)
        let renderedItem = StoryItem(feedPost: post)
        XCTAssertFalse(BackgroundSoundBadge.detailCanvasIsRendered(post: post, renderedItem: renderedItem))
    }

    // MARK: - Plein écran POST (galerie média / VideoTransportControls) — NON-régression, 3e surface
    //
    // Correctif revue (mineur #6) : l'ancienne garde vérifiait seulement le
    // NOM de la vue appelante (`ConversationMediaGalleryView(`) — jamais le
    // site qui porte RÉELLEMENT le muet. Supprimer le bouton muet du
    // transport laissait l'ancien test vert. Remonte désormais jusqu'au
    // site réel : carte/détail → galerie → VideoTransportControls (SDK) →
    // `manager.isMuted`.

    func test_postFullscreenGallery_stillMountedByCardAndDetail_noRegression() throws {
        for path in [
            "Meeshy/Features/Main/Views/FeedPostCard.swift",
            "Meeshy/Features/Main/Views/PostDetailView.swift",
        ] {
            let text = try source(path)
            XCTAssertTrue(
                text.contains("ConversationMediaGalleryView("),
                "\(path) : la galerie plein écran ne doit pas régresser — 3e surface de B3.6."
            )
        }
    }

    func test_postFullscreenGallery_mountsVideoTransportControls_noRegression() throws {
        let text = try source("Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift")
        XCTAssertTrue(
            text.contains("VideoTransportControls("),
            "La galerie doit monter le composant SDK qui porte réellement le muet plein écran."
        )
    }

    func test_videoTransportControls_muteButton_pilotsRealPlayer_noRegression() throws {
        let text = MyStoriesSourceCorpus.strippingComments(
            try String(
                contentsOf: MyStoriesSourceCorpus.appRoot()
                    .appendingPathComponent("../../packages/MeeshySDK/Sources/MeeshyUI/Media/VideoTransportControls.swift"),
                encoding: .utf8
            )
        )
        XCTAssertTrue(
            text.contains("manager.isMuted.toggle()"),
            "Le SITE qui porte réellement le muet plein écran (SDK, VideoTransportControls) " +
            "doit rester câblé au lecteur — retirer ce bouton laisserait l'ancienne garde " +
            "(nom de vue seul) verte à tort."
        )
    }

    // MARK: - Rail du viewer story — NON-régression (déjà son propre muet, hors périmètre)

    func test_storyViewerSidebar_muteRail_noRegression() throws {
        let text = try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
        XCTAssertTrue(
            text.contains("railPlan.showsSound"),
            "Le rail garde sa propre condition d'existence (piste audible) — non touchée par E2."
        )
        XCTAssertTrue(
            text.contains(#"isGlobalMuted ? "speaker.slash.fill" : "speaker.wave.2.fill""#),
            "L'icône du rail doit continuer à dire l'état — même convention, non régressée."
        )
        XCTAssertTrue(
            text.contains("toggleGlobalMute()"),
            "Le rail continue de basculer le muet GLOBAL du reader — E2 ne le touche pas."
        )
    }

    // MARK: - Réel plein écran (ReelsPlayerView) — bouton local, RÉELLEMENT câblé au lecteur

    func test_reelsPlayerView_mountsMuteButton_gatedBySharedAnnouncement() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelPageView+Info.swift")
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.showsMuteButton(for: announcement)"),
            "Le bouton muet du réel doit se monter via le prédicat partagé, sur la MÊME " +
            "valeur `announcement` que le badge de la ligne meta (E1)."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.muteIconName(isMuted: !audioPlayer.isPlaying)"),
            "L'icône doit dire l'état RÉEL du lecteur (audioPlayer.isPlaying) — pas un état " +
            "local séparé qui pourrait diverger du son réellement audible."
        )
    }

    /// Correctif revue BLOQUANT #1 : le tap doit RÉELLEMENT piloter le
    /// lecteur qui joue la piste de fond (`audioPlayer`, `startBorrowedSoundIfNeeded()`)
    /// — jamais un état écrit sans consommateur. La porte est renforcée :
    /// le bouton ne se monte QUE quand un lecteur LOCAL existe
    /// (`borrowedSoundTrack != nil`) pour éviter de promettre un contrôle
    /// sur un cas où l'annonce vient d'ailleurs (ex. audio incrusté dans une
    /// vidéo) sans qu'aucun moteur pilotable n'existe.
    func test_reelsPlayerView_muteButton_wiresToLocalPlayer() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelPageView+Info.swift")
        XCTAssertTrue(
            text.contains("audioPlayer.togglePlayPause()"),
            "Le tap doit basculer le lecteur RÉEL de la piste de fond empruntée — pas un " +
            "état local sans consommateur."
        )
        XCTAssertTrue(
            text.contains("borrowedSoundTrack != nil"),
            "La porte doit exiger qu'un lecteur LOCAL existe (borrowedSoundTrack) — jamais " +
            "monter un bouton sur la seule existence de l'annonce quand rien de pilotable " +
            "ne joue localement."
        )
    }

    /// L'état muet DÉCORATIF (écriture seule) doit avoir disparu : sa seule
    /// présence prouvait le défaut du commit rejeté (supprimer les
    /// `.toggle()` laissait l'ancienne garde de 17 tests verte).
    func test_reelsPlayerView_decorativeMuteState_isRemoved() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertFalse(
            text.contains("isBackgroundSoundMuted"),
            "L'état muet local sans consommateur doit être retiré — remplacé par la lecture " +
            "directe de audioPlayer.isPlaying, la SEULE source de vérité sur ce qui joue."
        )
    }

    func test_reelsPlayerView_muteState_isLocalNotGlobal() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertFalse(
            text.contains("isGlobalMuted"),
            "Le réel ne doit JAMAIS référencer le muet global du viewer story."
        )
    }

    /// Non-régression FORTE : le réel plein écran joue TOUJOURS avec le son
    /// natif — `drive()` réaffirme `manager.isMuted = false` inconditionnellement
    /// à chaque passage. Le bouton NEUF (fond storyEffects) ne doit PAS
    /// toucher à cette réaffirmation, sous peine de la faire fuiter en dehors
    /// de son passage et de re-museler le réel après un tap utilisateur.
    func test_reelsPlayerView_nativeAudioAlwaysOnInvariant_notDisturbed() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertTrue(
            text.contains("manager.isMuted = false"),
            "L'invariant « le viewer plein écran joue TOUJOURS avec le son natif » " +
            "(réaffirmé par drive()) ne doit pas régresser — le bouton NEUF pilote un " +
            "état LOCAL séparé (fond storyEffects), jamais `manager.isMuted`."
        )
    }

    /// Correctif revue (mineur #7) : cible tactile 44x44 (HIG), même
    /// convention que la carte (le MÊME commit l'ajoutait sur FeedPostCard
    /// sans l'ajouter ici) — c'est le seul contrôle interactif de la ligne
    /// meta auteur, un glyphe de 10pt sans zone de hit élargie ratait un tap
    /// sur deux à l'usage (précédent documenté sur la carte).
    func test_reelsPlayerView_muteButton_hasFortyFourPointHitTarget() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelPageView+Info.swift")
        let buttonBlock = block(
            from: "BackgroundSoundBadge.muteIconName(isMuted: !audioPlayer.isPlaying)",
            to: "reels.action.unmute",
            in: text
        )
        XCTAssertFalse(buttonBlock.isEmpty, "Bloc du bouton muet du réel introuvable.")
        XCTAssertTrue(
            buttonBlock.contains(".frame(minWidth: 44, minHeight: 44)"),
            "Cible tactile 44x44 (HIG) manquante sur le bouton muet du réel."
        )
        XCTAssertTrue(
            buttonBlock.contains(".contentShape(Rectangle())"),
            "Zone de hit non élargie au rectangle complet sur le bouton muet du réel."
        )
    }
}
