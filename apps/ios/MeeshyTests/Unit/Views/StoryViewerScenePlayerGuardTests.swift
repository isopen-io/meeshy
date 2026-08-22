import XCTest
@testable import Meeshy

/// Gardes de câblage — Lot E, Task E4 (« Le viewer story adopte le
/// ScenePlayer », mode `.reader`).
///
/// La couche CONTENU du viewer est montée deux fois dans
/// `StoryViewerView+Canvas.swift` : le canvas SORTANT du cross-fade, puis le
/// canvas de la story COURANTE. Ces deux montages sont le point de couture
/// B4 → E4 : le jour où l'hôte direct (`StoryReaderRepresentable`) laisse la
/// place à `MeeshyScenePlayer(mode: .reader)`, c'est là que ça se passe.
///
/// **Pourquoi ces gardes sont ancrées sur le SITE et non sur le fichier.**
/// La version précédente cherchait ses fils par `text.contains("isGlobalMuted")`
/// sur 4 000 lignes. Or `isGlobalMuted`, `preloadedImages`, `preloadedVideoURLs`,
/// `preloadedAudioURLs` et `onPlaybackProgressing` sont AUSSI des propriétés
/// déclarées de `StoryCardView` et sont relus ailleurs (sidebar, indicateur de
/// stall) : couper le fil AU MONTAGE laissait la garde verte — exactement la
/// régression qu'elle prétendait interdire. Ici, chaque fil est cherché DANS la
/// fenêtre équilibrée de l'appel (`callWindows`), jamais dans le fichier.
///
/// **Pourquoi les fils sont désignés par leur VALEUR et non par leur étiquette.**
/// Le swap renommera les paramètres de l'hôte (`story:` → `document:`, …). Ce
/// qui ne doit pas changer, c'est que la valeur POSSÉDÉE PAR LE VIEWER atteigne
/// le montage : le muet persistant, la chaîne du Prisme, les actifs préchargés,
/// la pause en phase, la porte du rail, la fraction de chargement, le signal de
/// stall. Une garde par étiquette rougirait pour un renommage bénin et resterait
/// verte sur un fil coupé ; une garde par valeur fait l'inverse.
final class StoryViewerScenePlayerGuardTests: XCTestCase {

    private static let canvasFile = "Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"

    /// Ce qui manque à `MeeshyScenePlayer` (B4, contrat gelé) pour que le swap
    /// E4 soit seulement POSSIBLE. Message du `XCTSkip` de la famille A — il
    /// est le compte rendu exécutable du blocage, pas un commentaire.
    private static let pendingB4Delta = """
    E4 en attente d'un delta d'API B4 (lot B, fichier SDK hors périmètre E). \
    MeeshyScenePlayer n'expose que (document:mode:sceneIndex:isPlaying:accentColorHex:) \
    et enveloppe un StoryItem SYNTHÉTIQUE dont `media` vaut []. Or le viewer tient \
    à son hôte huit fils SANS contrepartie : mute (le mode fige isMuted = (mode == .card), \
    donc .reader ne peut pas être muet), preloadedImages/VideoURLs/AudioURLs, \
    onContentReady, onContentProgress, onPlaybackProgressing, isOutgoing. Et sans \
    storyItem.media, StoryItem.toRenderableSlide perd l'hydratation read-time \
    (aspectRatio — source de dimensionnement PRIMAIRE, duration, audio.mediaURL, \
    backdrop legacy) ainsi que le repli distant par postMediaId du résolveur. \
    Piège annexe à traiter dans le même geste : CanvasV3Migration fabrique \
    SceneV3(id: "s1") en dur, donc hostIdentity vaudrait "s1" pour TOUTE story \
    legacy, là où le viewer s'appuie sur StorySlide.id == storyItem.id pour \
    piloter identityChanged dans updateUIView.
    """

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: Self.canvasFile)
    }

    // MARK: - Ancrage sur le site de montage

    /// Les constructeurs qui peuvent porter la couche CONTENU du viewer :
    /// l'hôte direct aujourd'hui, le ScenePlayer après le swap. La garde ne
    /// prend pas parti — elle exige que les fils tiennent, quel que soit l'hôte.
    private static let contentHostConstructors = ["MeeshyScenePlayer(", "StoryReaderRepresentable("]

    /// Fenêtres ÉQUILIBRÉES de chaque appel à `constructor` : du nom jusqu'à la
    /// parenthèse fermante de l'appel, closures et sous-appels compris. C'est
    /// cette fenêtre — et rien d'autre — que les gardes de fil interrogent.
    private func callWindows(of constructor: String, in text: String) -> [String] {
        var windows: [String] = []
        var searchStart = text.startIndex

        while let opening = text.range(of: constructor, range: searchStart..<text.endIndex) {
            var depth = 1
            var insideString = false
            var previous: Character?
            var cursor = opening.upperBound

            while cursor < text.endIndex, depth > 0 {
                let character = text[cursor]
                if character == "\"" && previous != "\\" { insideString.toggle() }
                if !insideString {
                    if character == "(" || character == "[" || character == "{" { depth += 1 }
                    if character == ")" || character == "]" || character == "}" { depth -= 1 }
                }
                previous = character
                cursor = text.index(after: cursor)
            }

            if depth == 0 { windows.append(String(text[opening.lowerBound..<cursor])) }
            searchStart = opening.upperBound
        }
        return windows
    }

    /// Les DEUX montages de la couche contenu, classés par ce qu'ils sont :
    /// le canvas sortant du cross-fade (`isOutgoing: true`) et celui de la
    /// story courante.
    private func contentHostMounts(in text: String) throws -> (current: String, outgoing: String) {
        let windows = Self.contentHostConstructors.flatMap { callWindows(of: $0, in: text) }
        XCTAssertEqual(
            windows.count, 2,
            "La couche contenu du viewer se monte EXACTEMENT deux fois (canvas sortant du " +
            "cross-fade + story courante). En trouver un autre nombre veut dire que le swap " +
            "E4 a dupliqué ou perdu un montage — les gardes de fil ci-dessous ne sauraient " +
            "plus lequel interroger."
        )
        let outgoing = windows.filter { $0.contains("isOutgoing: true") }
        let current = windows.filter { !$0.contains("isOutgoing: true") }
        guard let outgoingMount = outgoing.first, let currentMount = current.first,
              outgoing.count == 1, current.count == 1 else {
            throw XCTSkip("Montages de la couche contenu non identifiables — voir l'assertion ci-dessus.")
        }
        return (currentMount, outgoingMount)
    }

    func test_contentHostMountIsAnchoredOnABalancedCall() throws {
        let mounts = try contentHostMounts(in: try source())
        for (name, mount) in [("courant", mounts.current), ("sortant", mounts.outgoing)] {
            XCTAssertTrue(
                mount.hasSuffix(")"),
                "La fenêtre du montage \(name) doit se refermer sur sa parenthèse équilibrée — " +
                "sinon les gardes de fil lisent une fenêtre tronquée et deviennent vacuously vraies."
            )
            XCTAssertTrue(
                mount.contains("story:") || mount.contains("document:"),
                "La fenêtre du montage \(name) doit porter le contenu servi (story: aujourd'hui, " +
                "document: après le swap)."
            )
        }
    }

    /// Le fait mécanique qui JUSTIFIE l'ancrage sur la fenêtre : ces
    /// identifiants vivent aussi HORS du montage. Tant que c'est vrai, une
    /// garde en `contains` sur le fichier entier ne peut pas rougir sur un fil
    /// coupé au site — et cette suite doit rester ancrée sur la fenêtre.
    func test_theseThreadsAlsoLiveOutsideTheMount_soAWholeFileSearchCannotGuardThem() throws {
        let text = try source()
        for thread in ["isGlobalMuted", "preloadedImages", "preloadedVideoURLs",
                       "preloadedAudioURLs", "onPlaybackProgressing"] {
            let occurrences = text.components(separatedBy: thread).count - 1
            XCTAssertGreaterThan(
                occurrences, 1,
                "\(thread) n'apparaît qu'une fois : une garde en contains(fichier) suffirait. " +
                "Tant que ce n'est pas le cas, l'ancrage sur la fenêtre du montage est la SEULE " +
                "façon de faire rougir un fil coupé."
            )
        }
    }

    // MARK: - Les fils que le viewer tient à son hôte, AU MONTAGE

    /// Chaque fil : la valeur POSSÉDÉE PAR LE VIEWER, et la loi qu'elle porte.
    private static let currentMountThreads: [(needle: String, law: String)] = [
        ("isGlobalMuted",
         "Le muet est une préférence VIEWER persistante qui survit aux avances. Le canvas est " +
         "recréé à chaque story (.id(story.id)) : sans cette valeur AU MONTAGE, chaque nouvelle " +
         "story repart non-muette."),
        ("resolvedViewerLanguageChain",
         "Le Prisme du LECTEUR. Sans la chaîne AU MONTAGE, l'hôte résout avec [] et rend " +
         "inconditionnellement le texte ORIGINAL de l'auteur (le défaut exact qui a fait rejeter " +
         "E3 : .preferredContentLanguages jamais rappelé)."),
        ("preloadedImages",
         "Cache-first : les bitmaps déjà en mémoire alimentent le résolveur local du canvas."),
        ("preloadedVideoURLs",
         "Cache-first : les vidéos déjà sur disque alimentent le résolveur local du canvas."),
        ("preloadedAudioURLs",
         "Cache-first : les audios déjà sur disque alimentent le mixer (clips composer non " +
         "publiés inclus, keyés par audio.id)."),
        ("isCanvasPlaybackPaused",
         "La pause du viewer (long-press, feuilles ouvertes) doit geler la timeline canvas EN " +
         "PHASE avec la barre de progression. Sans ce fil, lastPlaybackTime avance dans le vide " +
         "et le resume saute."),
        ("isContentReady",
         "onContentReady arme la porte du rail à l'entrée du slide. Sans ce fil, le rail n'a " +
         "plus de porte et part avant que le contenu soit affichable."),
        ("slideContentProgress",
         "onContentProgress alimente la fraction lue par StoryReaderLoadingOverlay. Sans ce fil, " +
         "la fraction reste à 0 et l'overlay de chargement ne se retire jamais."),
        ("onPlaybackProgressing(progressing)",
         "Timeline unifiée : la barre ET l'auto-advance gèlent en phase avec la lecture du média " +
         "primaire. Sans ce fil, le rail avance sur une vidéo qui bufferise."),
    ]

    func test_currentStoryMountKeepsEveryThreadTheViewerOwns() throws {
        let mount = try contentHostMounts(in: try source()).current
        for thread in Self.currentMountThreads {
            XCTAssertTrue(
                mount.contains(thread.needle),
                "Fil coupé au montage de la story courante — \(thread.needle) absent. \(thread.law)"
            )
        }
    }

    func test_outgoingMountStaysBornInEditMode_andKeepsItsCacheAndPrisme() throws {
        let mount = try contentHostMounts(in: try source()).outgoing
        XCTAssertTrue(
            mount.contains("isOutgoing: true"),
            "Le canvas SORTANT du cross-fade doit naître en .edit : ses AVPlayer bg/FG et son " +
            "mixer audio ne démarrent jamais. Sans ce fil, les deux canvas jouent en double " +
            "350-400 ms à chaque avance (bug user 2026-05-28)."
        )
        for thread in ["preloadedImages", "preloadedVideoURLs", "preloadedAudioURLs",
                       "resolvedViewerLanguageChain"] {
            XCTAssertTrue(
                mount.contains(thread),
                "Le canvas sortant rend le MÊME slide que celui qu'on quitte : sans \(thread) " +
                "au montage, il repart du réseau et dans la langue de l'auteur le temps du fondu."
            )
        }
    }

    func test_theMuteThreadIsTheViewerPreference_notALiteral() throws {
        let mount = try contentHostMounts(in: try source()).current
        XCTAssertFalse(
            mount.contains("mute: false") || mount.contains("mute: true"),
            "Le muet du viewer ne peut pas être un littéral au montage : il porte l'état " +
            "persistant isGlobalMuted, seul rescapé de la recréation du canvas à chaque story."
        )
    }

    // MARK: - Le chrome est INCHANGÉ autour de la couche contenu

    func test_chromeLayersStayMountedAroundTheContentHost() throws {
        let text = try source()
        for layer in ["StoryProgressBarsView(", "StoryHeaderView(", "ReferenceNoteRow(",
                      "StoryActionSidebarView(", "makeCommentsOverlay()"] {
            XCTAssertTrue(
                text.contains(layer),
                "La refonte E4 ne touche QUE la couche contenu : \(layer) doit rester monté " +
                "autour, à l'identique."
            )
        }
    }

    // MARK: - Le swap lui-même (s'active tout seul le jour où B4 le permet)

    /// Tant que `MeeshyScenePlayer` n'est pas monté ici, ce test dit POURQUOI —
    /// et le `XCTSkip` porte le delta d'API B4 exigé. Le jour où le swap
    /// arrive, le test s'arme de lui-même et exige tout le contrat E4.
    func test_swapToScenePlayerReader_orTheReasonItIsStillPending() throws {
        let text = try source()
        guard text.contains("MeeshyScenePlayer(") else { throw XCTSkip(Self.pendingB4Delta) }

        XCTAssertTrue(
            text.contains("mode: .reader"),
            "Le mode passé DOIT être .reader — le seul des trois qui porte une chrome " +
            "(ScenePlayerConfig.showsChrome), donc le seul qui arme le fil de position."
        )
        XCTAssertFalse(
            text.contains("mode: .card"),
            "Le viewer story n'est pas une carte de fil : .card est le mode d'E3 (FeedPostCard)."
        )
        XCTAssertFalse(
            text.contains("mode: .preview"),
            "Le viewer story n'est pas l'aperçu du composer : .preview appartient au lot C."
        )
        XCTAssertTrue(
            text.contains("storyEffects?.canvasV3"),
            "Le document servi au player vient du storyEffects de la story courante."
        )
        XCTAssertTrue(
            text.contains("?? CanvasV3(migrating:"),
            "UN SEUL chemin de sortie : v3 ?? migration (B2). Deux branches séparées " +
            "dupliqueraient le montage et laisseraient l'une des deux dériver en silence."
        )
        XCTAssertFalse(
            text.contains("StoryReaderRepresentable("),
            "L'hôte canvas direct ne doit plus être construit DANS ce fichier : il vit " +
            "désormais SOUS MeeshyScenePlayer, côté SDK (MeeshyScenePlayer.host)."
        )
    }
}
