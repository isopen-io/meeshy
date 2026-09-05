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

    /// La VALEUR passée sous `label` dans une fenêtre de montage : du deux-points
    /// jusqu'à la virgule de même profondeur (un sous-appel `f(a, b)` ne coupe
    /// donc pas l'argument en deux). `nil` quand l'étiquette est absente.
    private func argument(_ label: String, in window: String) -> String? {
        guard let start = window.range(of: label) else { return nil }
        var depth = 0
        var cursor = start.upperBound

        while cursor < window.endIndex {
            let character = window[cursor]
            if character == "(" || character == "[" || character == "{" { depth += 1 }
            if character == ")" || character == "]" || character == "}" {
                if depth == 0 { break }
                depth -= 1
            }
            if character == "," && depth == 0 { break }
            cursor = window.index(after: cursor)
        }
        return String(window[start.upperBound..<cursor])
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Les QUATRE montages de la couche contenu, classés par ce qu'ils peignent :
    /// le canvas sortant du cross-fade (`isOutgoing: true`) et celui de la story
    /// courante — DEUX montages chacun.
    ///
    /// **Amendement du 2026-08-22 (rejet DoD C0c, constat 1).** Le swap E4 n'a
    /// pas REMPLACÉ l'hôte direct : il l'a mis derrière une porte. `MeeshyScenePlayer`
    /// ne prend la main que pour une story qui porte un document v3 NATIF ;
    /// l'archive v1 garde son hôte direct. À l'origine la raison était
    /// mécanique, pas prudentielle : avant `cf05538d9` (2026-08-22), iOS ne
    /// posait AUCUN `X-Canvas-Caps`, donc `resolveWireForm` servait du v1 tel
    /// quel, `StoryEffects.canvasV3` valait `nil` pour CENT POUR CENT des
    /// stories, et un montage inconditionnel aurait peint toute l'archive à
    /// travers `CanvasV3(migrating:)` → `StoryEffects(rendering:)`. Cet
    /// aller-retour était alors LOSSY : la migration letterboxait les ancres
    /// libres dans l'espace de scène fixe 9:16 (`remapFreeAnchor`), pendant
    /// que le cadre du viewer (`readerCanvasRatio`) gardait, lui, le ratio
    /// RÉEL. Un texte écrit à y = 0,90 sur un fond 16:9 se peignait à y ≈ 0,63.
    ///
    /// Les DEUX raisons sont tombées depuis. L'en-tête `X-Canvas-Caps: 3` est
    /// posé depuis `cf05538d9` (`ClientInfoProvider.swift:77`, appelé par
    /// `APIClient.swift:603` et `:903`) — `StoryEffects.canvasV3` n'est donc
    /// plus systématiquement `nil`. Et la perte de ratio est RÉPARÉE depuis
    /// `b82ebbc17` — la scène loge son `carrierAspect` et le retour applique
    /// le remap inverse (`CanvasV3MigrationTests`
    /// `.v1RoundTripThroughV3_isFAITHFUL_nowThatTheSceneCarriesItsAspect`).
    /// La porte reste en place aujourd'hui par PRUDENCE, pas par nécessité
    /// mécanique : la retirer change ce que le lecteur PEINT pour toute
    /// l'archive v1 restante — ce changement de rendu se mesure et se livre à
    /// part (reste ouvert dans C4 : le 426 et la porte de mise à jour).
    ///
    /// Chaque canvas a donc DEUX montages, et les deux doivent porter TOUS les
    /// fils du viewer : une porte qui coupe un fil d'un seul côté est exactement
    /// la dérive qu'une garde ancrée sur un seul montage ne verrait pas.
    private func contentHostMounts(in text: String) throws -> (current: [String], outgoing: [String]) {
        let windows = Self.contentHostConstructors.flatMap { callWindows(of: $0, in: text) }
        XCTAssertEqual(
            windows.count, 4,
            "La couche contenu du viewer se monte EXACTEMENT quatre fois : les deux canvas " +
            "(sortant du cross-fade + story courante) × les deux hôtes derrière la porte v3 " +
            "(le lecteur pour un document natif, l'hôte direct pour l'archive v1). En trouver " +
            "un autre nombre veut dire qu'un montage a été dupliqué, perdu, ou qu'une branche " +
            "de la porte a disparu — les gardes de fil ci-dessous ne sauraient plus lequel " +
            "interroger."
        )
        let outgoing = windows.filter { $0.contains("isOutgoing: true") }
        let current = windows.filter { !$0.contains("isOutgoing: true") }
        guard outgoing.count == 2, current.count == 2 else {
            throw XCTSkip("Montages de la couche contenu non identifiables — voir l'assertion ci-dessus.")
        }
        return (current, outgoing)
    }

    func test_contentHostMountIsAnchoredOnABalancedCall() throws {
        let mounts = try contentHostMounts(in: try source())
        let named = mounts.current.map { ("courant", $0) } + mounts.outgoing.map { ("sortant", $0) }
        for (name, mount) in named {
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
        for mount in try contentHostMounts(in: try source()).current {
            for thread in Self.currentMountThreads {
                XCTAssertTrue(
                    mount.contains(thread.needle),
                    "Fil coupé à UN des deux montages de la story courante — \(thread.needle) " +
                    "absent. \(thread.law) Les DEUX hôtes derrière la porte v3 le portent, sans " +
                    "quoi le fil se coupe pour la moitié du parc sans qu'aucune garde ne le voie."
                )
            }
        }
    }

    func test_outgoingMountStaysBornInEditMode_andKeepsItsCacheAndPrisme() throws {
        for mount in try contentHostMounts(in: try source()).outgoing {
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
    }

    /// Les deux étiquettes sous lesquelles le muet voyage : l'hôte direct l'appelle
    /// `mute:`, le lecteur `isMuted:`. La garde vise la VALEUR sous l'une ou
    /// l'autre — jamais l'étiquette.
    private static let muteLabels = ["isMuted:", "mute:"]

    /// **Amendement du 2026-08-22 (rejet DoD C0c, constat 2).** La version
    /// précédente cherchait la sous-chaîne `"mute: false"` dans la fenêtre. Après
    /// le swap, le lecteur nomme ce paramètre `isMuted:` — et `"isMuted: false"`
    /// ne CONTIENT pas `"mute: false"` (la casse du M). La garde est donc restée
    /// VERTE sous la mutation exacte qu'elle prétendait interdire (constaté :
    /// `isMuted: isGlobalMuted` → `isMuted: false` ⇒ 7 tests, 1 échec, et l'échec
    /// était celui du VOISIN `test_currentStoryMountKeepsEveryThreadTheViewerOwns`).
    /// Elle interroge désormais la VALEUR, sous l'une ou l'autre étiquette : un
    /// littéral booléen est refusé, quel que soit le nom du paramètre.
    func test_theMuteThreadIsTheViewerPreference_notALiteral() throws {
        for mount in try contentHostMounts(in: try source()).current {
            let values = Self.muteLabels.compactMap { argument($0, in: mount) }
            XCTAssertFalse(
                values.isEmpty,
                "Aucun fil de muet à ce montage de la story courante : ni mute:, ni isMuted:. " +
                "Le viewer PORTE un muet persistant — un montage qui ne le reçoit pas repart " +
                "non-muet à chaque avance."
            )
            for value in values {
                XCTAssertFalse(
                    value == "true" || value == "false",
                    "Le muet du viewer ne peut pas être un littéral au montage — reçu " +
                    "« \(value) ». Il porte l'état persistant isGlobalMuted, seul rescapé de la " +
                    "recréation du canvas à chaque story."
                )
            }
        }
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

    // MARK: - B2 (#3925) — la description s'affiche par-dessus le canvas composé

    /// La face LECTURE de la section description repliable du composer : le
    /// contenu partagé (`slide.content`) s'affiche par-dessus le canvas, résolu
    /// par le Prisme, et ne chevauche jamais la transcription vocale.
    func test_laDescription_saffichePardessusLeCanvas_resolueParLePrisme() throws {
        // **La couche a DÉMÉNAGÉ, la règle n'a pas bougé** (#4831). Tout ce qui
        // concerne la légende — sa condition de montage, sa colonne, ses
        // retraits — vit désormais dans `StoryViewerView+CanvasCaption.swift` :
        // `StoryViewerView+Canvas.swift` était largement hors budget, et la loi 4
        // interdit d'ajouter à un fichier qui l'est. Ce témoin suit le CODE, pas
        // le chemin ; seule la dernière assertion regarde encore le canvas, parce
        // que c'est lui qui doit continuer d'APPELER la couche.
        let canvas = try MyStoriesSourceCorpus.text(
            of: "Meeshy/Features/Main/Views/StoryViewerView+CanvasCaption.swift")
        XCTAssertTrue(
            canvas.contains("currentVoiceCaption == nil, let description = currentStoryDescription"),
            "L'overlay de description se peint sous le canvas gaté sur l'absence de transcription " +
            "vocale — les deux ne se chevauchent jamais."
        )
        // **Repointée au #4474, jamais supprimée.** Ce que ce témoin mesure —
        // « la description résolue est bien PEINTE par-dessus le canvas » —
        // reste vrai ; c'est la FORME qui a changé. Le `Text(description)` nu
        // était le défaut : dans un cartouche opaque, `lineLimit(4)`, et sous
        // un `allowsHitTesting(false)` qui le rendait indépliable. La couche
        // partagée reçoit la MÊME valeur résolue, ce que l'étiquette de son
        // argument prouve.
        XCTAssertTrue(
            canvas.contains("MediaCaptionOverlay(") && canvas.contains("caption: description"),
            "Le texte de la description est bien PEINT par-dessus le canvas composé — " +
            "désormais par `MediaCaptionOverlay`, qui reçoit la description RÉSOLUE (#4474)."
        )
        XCTAssertTrue(
            try source().contains("var currentStoryDescription"),
            "La description résolue vit dans une propriété de `StoryCardView` (l'hôte du canvas), " +
            "testable et unique."
        )
        XCTAssertTrue(
            try source().contains("captionLayer(geometry: geometry)"),
            "Et le canvas doit continuer de MONTER la couche extraite — sans cet appel, le " +
            "fichier de la légende reste parfait et l'écran n'a plus de légende (#4831)."
        )
        XCTAssertTrue(
            try source().contains("resolvedContent(preferredLanguages: resolvedViewerLanguageChain)"),
            "La description descend le Prisme (chaîne complète, repli original) — jamais " +
            "`translations.first`."
        )
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
        XCTAssertFalse(
            text.contains("CanvasV3(migrating:"),
            "Le viewer ne peint JAMAIS l'archive à travers une migration. La version d'origine " +
            "de cette garde exigeait ici « v3 ?? migration », au motif qu'un seul chemin de " +
            "sortie vaut mieux que deux branches. Le motif était juste, la prémisse fausse : " +
            "à l'époque iOS ne posait aucun X-Canvas-Caps, donc canvasV3 valait nil pour " +
            "CENT POUR CENT des stories — la branche ?? était la SEULE jamais prise, et " +
            "l'aller-retour v1→v3→v1 qu'elle impose letterboxait les ancres libres dans " +
            "l'espace 9:16 (perte depuis RÉPARÉE : CanvasV3MigrationTests." +
            "v1RoundTripThroughV3_isFAITHFUL_nowThatTheSceneCarriesItsAspect). L'unicité " +
            "du chemin de sortie est désormais tenue par la porte elle-même, écrite UNE fois " +
            "et partagée par les deux canvas (StoryViewerScenePlayerDocumentGuardTests." +
            "test_theDocumentIsDerivedInExactlyOnePlace)."
        )
        XCTAssertTrue(
            text.contains("StoryReaderRepresentable("),
            "L'hôte canvas direct RESTE le chemin de l'archive v1 — la porte v3 ne le remplace " +
            "pas, elle le précède. Le retirer ferait passer toute l'archive par la migration : " +
            "cf. l'assertion ci-dessus. Il vit AUSSI sous MeeshyScenePlayer côté SDK, pour la " +
            "story qui porte un document v3 natif."
        )
    }
}
