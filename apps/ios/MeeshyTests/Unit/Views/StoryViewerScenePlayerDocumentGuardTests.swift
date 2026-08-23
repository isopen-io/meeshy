import XCTest
@testable import Meeshy

/// Gardes du DOCUMENT et du PORTEUR servis au `MeeshyScenePlayer` par le viewer
/// story — le swap E4, exécuté au socle du lot C.
///
/// La garde de couture d'E4 (`StoryViewerScenePlayerGuardTests`) tient déjà deux
/// choses : que chaque montage garde les fils du viewer, et que le fichier ouvre
/// sa porte v3 sur `storyEffects?.canvasV3` sans jamais migrer l'archive. Elle ne
/// peut rien dire de trois autres, qu'un swap peut trahir en SILENCE :
///
/// 1. **Quel document va à quel montage.** Le canvas SORTANT du cross-fade peint
///    la story qu'on QUITTE ; le courant, celle qu'on rejoint. Servir le document
///    de la story courante aux DEUX satisfait la garde de couture — elle cherche
///    son motif dans le FICHIER, pas dans la fenêtre — et fait pourtant clignoter
///    la story d'arrivée pendant les 350 ms du fondu, au lieu de fondre celle
///    qu'on quitte. Le même piège vaut pour le porteur.
///
/// 2. **Le porteur existe.** Le document dit ce qu'il faut PEINDRE ; il ne dit
///    pas où vivent les pixels. Sans `carrier:`, `MeeshyScenePlayer` enveloppe un
///    `StoryItem` dont `media` vaut `[]`, et `StoryItem.toRenderableSlide` perd
///    son hydratation read-time : `aspectRatio` d'abord — source de dimensionnement
///    PRIMAIRE, puisque le composer stampe toujours la sentinelle `1.0`, donc tout
///    média non carré s'affiche SQUISHÉ —, puis `duration`, l'adresse d'un clip
///    audio et le backdrop legacy ; le résolveur de `makeUIView` perd en plus son
///    repli distant par `postMediaId`. Un montage sans porteur compile, se monte,
///    et rend faux.
///
/// 3. **Le lecteur ne peint que ce qu'on lui a servi NATIF.** La porte v3 est le
///    correctif du rejet DoD C0c : à l'origine, `canvasV3` valait `nil` pour
///    100 % des stories tant que `X-Canvas-Caps: 3` n'était pas posé. L'en-tête
///    est posé depuis `cf05538d9` (2026-08-22) et l'aller-retour v1→v3→v1 n'est
///    plus lossy depuis `b82ebbc17` (`carrierAspect`) — mais la porte reste en
///    place par PRUDENCE : un montage inconditionnel changerait ce que le
///    lecteur PEINT pour toute l'archive v1 restante (`CANVAS_V3_READ` reste
///    OFF, cf. `tasks/todo-c4-canvas-caps-ouvre-la-porte-du-lecteur-2026-08-22.md`),
///    un changement de rendu qui se mesure et se livre à part.
///
/// Comme la garde de couture, ces assertions visent la fenêtre ÉQUILIBRÉE de
/// l'appel — ou, depuis la porte, le corps ÉQUILIBRÉ de la fonction hôte : ce qui
/// est chaîné après la parenthèse fermante n'en fait pas partie.
final class StoryViewerScenePlayerDocumentGuardTests: XCTestCase {

    private static let canvasFile = "Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: Self.canvasFile)
    }

    /// Fenêtres équilibrées de chaque appel à `MeeshyScenePlayer(`.
    private func playerMounts(in text: String) -> [String] {
        var windows: [String] = []
        var searchStart = text.startIndex

        while let opening = text.range(of: "MeeshyScenePlayer(", range: searchStart..<text.endIndex) {
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
    /// donc pas l'argument en deux).
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

    // MARK: - La porte : le lecteur ne prend la main que sur un v3 NATIF

    /// **Le fait qui commandait cette garde à l'origine (rejet DoD C0c, constat
    /// 1).** Avant `cf05538d9` (2026-08-22), iOS ne posait AUCUN en-tête
    /// `X-Canvas-Caps` — le relevé exhaustif du funnel n'en comptait que treize,
    /// aucun `caps`. Côté gateway, `resolveWireForm` (`storyEffectsV3.ts`) rendait
    /// donc `'as-is'` pour un blob v1 et `'sentinel'` (v1 !) pour un v3-natif :
    /// **iOS ne recevait jamais de v3**, et `StoryEffects.canvasV3` — posé au
    /// décodage sous la seule condition `v >= 3` — valait `nil` pour CENT POUR
    /// CENT des stories affichées.
    ///
    /// Un montage inconditionnel du lecteur ferait donc passer TOUTE l'archive
    /// par `CanvasV3(migrating:)` → `StoryEffects(rendering:)`. Cet aller-retour
    /// était LOSSY : la migration remappe les ancres libres dans l'espace de
    /// scène FIXE 9:16 (`remapFreeAnchor`, piloté par
    /// `effects.canvasAspectRatio`), et le retour ne réassignait ni le ratio ni
    /// le remap inverse. Sur un fond 16:9 — le cas COURANT, le composer
    /// stampant un ratio CONTINU dès qu'un fond est importé — un texte écrit à
    /// y = 0,90 se peignait à y ≈ 0,63.
    ///
    /// **DEUX PRÉMISSES DE CETTE PORTE SONT TOMBÉES depuis (2026-08-22).**
    /// D'abord, `X-Canvas-Caps: 3` est POSÉ (`ClientInfoProvider.swift`) : le
    /// gateway sert désormais du v3 natif à iOS, donc `canvasV3` n'est plus
    /// `nil` pour cent pour cent des stories. Ensuite, l'aller-retour n'est plus
    /// lossy : la scène loge son `carrierAspect` et le retour applique le remap
    /// inverse (`CanvasV3MigrationTests`
    /// `.v1RoundTripThroughV3_isFAITHFUL_nowThatTheSceneCarriesItsAspect`).
    ///
    /// La porte reste néanmoins EN PLACE et cette garde avec elle : la retirer
    /// change ce que le lecteur PEINT pour toute l'archive, ce qui se mesure et
    /// se livre pour soi — pas en effet de bord. Cette garde ne défend donc plus
    /// une perte, elle défend un changement de rendu non encore mesuré.
    ///
    /// La porte rend les deux branches SELF-COHÉRENTES : l'archive v1 se peint
    /// dans son propre cadre comme avant le swap, et une story v3-native se
    /// peint elle aussi dans son cadre RÉEL — `StoryEffects(rendering:)` restaure
    /// `canvasAspectRatio` depuis `scene.carrierAspect` quand la scène l'a logé
    /// (`CanvasV3Migration.swift:543`), donc un fond paysage composé nativement
    /// en v3 garde son 16:9 ; seule une scène sans `carrierAspect` (fond déjà
    /// portrait) retombe sur le défaut portrait, à raison. Le lecteur a déjà la
    /// main sur ce cas depuis que l'en-tête `X-Canvas-Caps: 3` est posé
    /// (`cf05538d9`) ; ce qui reste fermé, c'est la porte de l'ARCHIVE v1
    /// (ci-dessus), par prudence.
    func test_theArchiveIsNeverPaintedThroughAMigration() throws {
        let text = try source()
        let migrations = text.components(separatedBy: "CanvasV3(migrating:").count - 1
        XCTAssertEqual(
            migrations, 0,
            "Le viewer story dérive un document par migration \(migrations) fois. Il ne doit " +
            "JAMAIS le faire : pour toute story v1 servie as-is, cette dérivation est le " +
            "chemin de l'archive, et l'aller-retour v1→v3→v1 letterboxe " +
            "les ancres libres. Cette perte est RÉPARÉE depuis 2026-08-22 " +
            "(CanvasV3MigrationTests.v1RoundTripThroughV3_isFAITHFUL_nowThatTheSceneCarriesItsAspect), " +
            "mais retirer la porte change le rendu de TOUTE l'archive : ça se mesure à part."
        )
    }

    /// Le corollaire de la porte, au SITE : le document servi au lecteur est la
    /// valeur que la porte a DÉJÀ liée — jamais une expression calculée au
    /// montage.
    ///
    /// L'assertion vise l'absence de parenthèses dans l'argument, et c'est
    /// délibéré : `document: canvasDocument(for: story)` cache une migration
    /// derrière un nom sobre, et une garde qui chercherait le mot « migrating »
    /// dans la fenêtre du montage passerait au vert sans rien voir (elle l'a
    /// fait — constat au premier RED de cette suite). Un montage qui ne peut
    /// servir qu'un identifiant lié n'a nulle part où cacher un calcul.
    func test_everyPlayerMountIsServedTheDocumentTheGateAlreadyBound() throws {
        let windows = playerMounts(in: try source())
        XCTAssertFalse(
            windows.isEmpty,
            "Aucun montage du lecteur — le swap E4 a disparu du viewer story."
        )
        for window in windows {
            let document = try XCTUnwrap(
                argument("document:", in: window),
                "Un montage du lecteur sans document servi."
            )
            XCTAssertFalse(
                document.contains("(") || document.contains("migrating"),
                "Le document servi au lecteur est CALCULÉ au montage — reçu « \(document) ». " +
                "Il doit être la valeur liée par la porte v3 (`if let document = …`), sans quoi " +
                "un appel au nom sobre peut y glisser une migration : le lecteur ne prend la " +
                "main que sur un document v3 NATIF, l'archive v1 garde son hôte direct."
            )
        }
    }

    func test_theV1ArchiveKeepsItsDirectHost() throws {
        let text = try source()
        XCTAssertTrue(
            text.contains("StoryReaderRepresentable("),
            "L'hôte canvas direct doit RESTER construit ici : c'est la branche que prend " +
            "l'archive v1 (les blobs v1 non convertis — CANVAS_V3_READ reste OFF). " +
            "X-Canvas-Caps: 3 est posé depuis cf05538d9, donc ce n'est plus la totalité des " +
            "stories : une composition v3-native passe désormais par MeeshyScenePlayer. Sans " +
            "cet hôte direct, l'archive v1 repasserait par la migration."
        )
    }

    private func mounts() throws -> (current: String, outgoing: String) {
        let windows = playerMounts(in: try source())
        XCTAssertEqual(
            windows.count, 2,
            "Le viewer monte le ScenePlayer EXACTEMENT deux fois : le canvas sortant du " +
            "cross-fade et la story courante. En trouver un autre nombre veut dire que le " +
            "swap E4 a dupliqué ou perdu un montage."
        )
        let outgoing = windows.filter { $0.contains("isOutgoing: true") }
        let current = windows.filter { !$0.contains("isOutgoing: true") }
        guard outgoing.count == 1, current.count == 1,
              let outgoingMount = outgoing.first, let currentMount = current.first else {
            throw XCTSkip("Montages du ScenePlayer non identifiables — voir l'assertion ci-dessus.")
        }
        return (currentMount, outgoingMount)
    }

    // MARK: - Chaque canvas sert la story QU'IL peint, des deux côtés de la porte

    /// Corps ÉQUILIBRÉ de la fonction `name` — de son accolade ouvrante à la
    /// fermante correspondante. C'est l'unité qui a un sens depuis que la porte
    /// v3 loge DEUX hôtes par canvas : la story qu'un canvas peint se lit à sa
    /// porte, pas à l'argument `document:` du lecteur, qui ne voit plus qu'une
    /// valeur déjà liée.
    private func hostBody(_ name: String, in text: String) throws -> String {
        guard let signature = text.range(of: "private func \(name)(") else {
            throw XCTSkip("Fonction hôte \(name) introuvable — le viewer a changé de découpe.")
        }
        guard let opening = text.range(of: "{", range: signature.upperBound..<text.endIndex) else {
            throw XCTSkip("Corps de \(name) introuvable.")
        }
        var depth = 1
        var cursor = opening.upperBound
        while cursor < text.endIndex, depth > 0 {
            if text[cursor] == "{" { depth += 1 }
            if text[cursor] == "}" { depth -= 1 }
            cursor = text.index(after: cursor)
        }
        return String(text[opening.upperBound..<cursor])
    }

    /// Un canvas ne peint qu'UNE story, et il la nomme partout : à la porte, au
    /// porteur du lecteur, et à l'hôte direct de l'archive.
    ///
    /// **Pourquoi la garde a déménagé de l'argument vers la fonction hôte.** Le
    /// lecteur reçoit désormais `document:` — la valeur que la porte a liée —,
    /// qui ne nomme plus aucune story. Interroger cet argument ne prouverait donc
    /// plus rien. Ce qui prouve, c'est que le corps du canvas SORTANT ne mentionne
    /// jamais la story courante et réciproquement : servir le document de l'une à
    /// l'autre fait clignoter la story d'arrivée pendant les 350 ms du fondu, au
    /// lieu de fondre celle qu'on quitte.
    func test_eachCanvasGatesCarriesAndHostsTheStoryItPaints() throws {
        let text = try source()

        for (host, painted) in [("outgoingContentHost", "outgoing"),
                                ("currentContentHost", "story")] {
            let body = try hostBody(host, in: text)
            for label in ["nativeSceneDocument(of:", "carrier:", "story:"] {
                let raw = try XCTUnwrap(
                    argument(label, in: body),
                    "\(host) ne passe rien sous \(label)."
                )
                let value = raw.hasSuffix(")") ? String(raw.dropLast()) : raw
                XCTAssertEqual(
                    value, painted,
                    "\(host) doit passer sous \(label) la story QU'IL peint — reçu « \(raw) ». " +
                    "Servir à un canvas la story de l'autre fait clignoter la story d'arrivée " +
                    "pendant les 350 ms du fondu, au lieu de fondre celle qu'on quitte."
                )
            }
        }

        XCTAssertFalse(
            try hostBody("currentContentHost", in: text).contains("outgoing"),
            "Le canvas de la story COURANTE mentionne la story sortante : les deux canvas se " +
            "servent l'un l'autre, et le fondu montre deux fois la story d'arrivée. (Le contrôle " +
            "ne vaut que dans ce sens : « story » est une sous-chaîne de StoryItem et de " +
            "StoryReaderRepresentable, elle ne discrimine rien. Les trois égalités ci-dessus " +
            "épinglent l'autre sens.)"
        )
    }

    // MARK: - Chaque montage porte la story QU'IL peint

    func test_eachMountCarriesTheStoryItPaints() throws {
        let mounts = try mounts()

        let outgoingCarrier = try XCTUnwrap(
            argument("carrier:", in: mounts.outgoing),
            "Le montage sortant doit donner son PORTEUR : sans lui, `media` vaut [] et le " +
            "canvas du fondu perd l'adresse de ses pixels — il repart du néant le temps de " +
            "la transition, là où il devrait afficher exactement ce qu'on quitte."
        )
        XCTAssertTrue(
            outgoingCarrier.contains("outgoing"),
            "Le porteur du canvas sortant est la story qu'on QUITTE — reçu « \(outgoingCarrier) »."
        )

        let currentCarrier = try XCTUnwrap(
            argument("carrier:", in: mounts.current),
            "Le montage courant doit donner son PORTEUR : sans lui, `toRenderableSlide` perd " +
            "son hydratation read-time (aspectRatio — source de dimensionnement PRIMAIRE, le " +
            "composer stampant toujours la sentinelle 1.0 —, duration, adresse d'un clip audio, " +
            "backdrop legacy) et le résolveur perd son repli distant par postMediaId."
        )
        XCTAssertFalse(
            currentCarrier.contains("outgoing"),
            "Le porteur du canvas courant est la story qu'on rejoint — reçu « \(currentCarrier) »."
        )
        XCTAssertTrue(
            currentCarrier.contains("story"),
            "Le porteur du canvas courant est la story courante — reçu « \(currentCarrier) »."
        )
    }

    // MARK: - Un seul chemin de sortie, pour de bon

    /// « UN SEUL chemin de sortie » ne se prouve pas par la PRÉSENCE du motif :
    /// deux montages qui recopient chacun `canvasV3 ?? migration` la satisfont
    /// aussi, et l'un des deux dérive ensuite en silence. Ce qui la prouve, c'est
    /// l'UNICITÉ de la dérivation dans le fichier.
    func test_theDocumentIsDerivedInExactlyOnePlace() throws {
        let text = try source()
        let derivations = text.components(separatedBy: "storyEffects?.canvasV3").count - 1
        XCTAssertEqual(
            derivations, 1,
            "La dérivation v3 ⇒ document doit être écrite UNE fois et partagée par les deux " +
            "montages — trouvée \(derivations) fois. Recopiée par montage, elle laisse le " +
            "canvas sortant et le canvas courant diverger sans qu'aucune garde ne le voie."
        )
    }
}
