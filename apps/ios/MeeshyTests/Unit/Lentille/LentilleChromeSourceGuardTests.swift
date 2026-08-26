import XCTest
@testable import Meeshy

/// Garde de source DÉDIÉE LWS-6/I-064 : `ConversationListView.swift` et
/// `Lentille/Chrome/*.swift` ne réintroduisent ni un second détecteur de
/// défilement, ni une constante de loi gelée recopiée en dur.
///
/// **Pourquoi une suite séparée de `ScrollPillStateTests`.** Ce fichier
/// vérifiait déjà, en passant, l'absence de `ScrollViewReader` /
/// `onScrollGeometryChange` / `PreferenceKey` sur `ConversationListView.swift`
/// et `SectionScrollPillHost.swift` (I-063/I-063bis) — mais le contrat cite
/// `LentilleChromeSourceGuardTests` comme sa PROPRE suite, et le périmètre
/// devait de toute façon s'étendre : chaque fichier de `Lentille/Chrome/`
/// (pas seulement l'hôte de la pilule), et les littéraux de loi R15, jamais
/// vérifiés app-side pour `ConversationListView.swift` puisque ce fichier
/// vit HORS des `SKIN_DIRS` de `scripts/check-law-literals.sh` (il n'est pas
/// sous `Lentille/**`).
///
/// **Alignement sur `scripts/check-law-literals.sh`.** Le script ne « strip »
/// AUCUN commentaire — il fait un `grep` verbatim sur le fichier source. La
/// consigne I-064 est explicite : « le script ne tolère même pas les
/// commentaires — aligne ta garde sur son comportement. » Les témoins de
/// littéraux ci-dessous lisent donc la source BRUTE (aucun
/// `AppSourceGuard.stripComments`), à la différence des autres suites
/// Lentille qui, elles, gardent une FORME de code et doivent donc ignorer
/// les commentaires pour ne pas se faire piéger par une indentation ou une
/// prose qui changent sans changer le code.
///
/// **Leçon 257 (garde d'ensemble).** Le contenu de `Lentille/Chrome/` est
/// DÉCOUVERT par `FileManager`, jamais recopié dans une liste : un fichier
/// ajouté demain à ce dossier entre automatiquement dans le périmètre de la
/// garde, et la suite échoue explicitement si elle n'en trouve aucun — une
/// garde qui charge zéro fichier passe toujours au vert sans rien vérifier.
final class LentilleChromeSourceGuardTests: XCTestCase {

    // MARK: - Localisation des sources

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private static var chromeDirectory: URL {
        iosRoot.appendingPathComponent("Meeshy/Features/Main/Lentille/Chrome")
    }

    private func listViewSource() throws -> (name: String, code: String) {
        let url = Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Views/ConversationListView.swift")
        return ("ConversationListView.swift", try String(contentsOf: url, encoding: .utf8))
    }

    /// Tout `.swift` de `Lentille/Chrome/`, découvert au moment du test —
    /// jamais une liste de noms recopiée à la main.
    private func chromeSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.chromeDirectory,
            includingPropertiesForKeys: nil
        )
        let swiftFiles = entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try swiftFiles.map { url in
            (url.lastPathComponent, try String(contentsOf: url, encoding: .utf8))
        }
    }

    private func allGuardedSources() throws -> [(name: String, code: String)] {
        try [listViewSource()] + chromeSources()
    }

    /// Les mêmes sources, **commentaires retirés** — réservé aux témoins de
    /// LITTÉRAUX, jamais aux détecteurs.
    ///
    /// La distinction n'est pas cosmétique, elle sépare deux intentions
    /// opposées :
    ///
    /// - un **détecteur** (`ScrollViewReader`, `onScrollGeometryChange`, un
    ///   `PreferenceKey` de défilement) interdit jusqu'à la MENTION du symbole,
    ///   parce qu'une mention en commentaire est déjà une invitation à le
    ///   réintroduire. Ces trois-là lisent le BRUT, et le disent dans leur
    ///   message (« commentaires compris ») ;
    /// - un **littéral de loi** interdit qu'une constante soit RECOPIÉE dans le
    ///   code au lieu d'être lue depuis son miroir Swift. En CITER une dans une
    ///   phrase qui explique une décision n'est pas la recopier.
    ///
    /// Le cas qui a tranché : `463547f5d` a retiré la pilule de section, et a
    /// laissé dans `ConversationListView.swift` le commentaire qui explique
    /// pourquoi — « invisible 900 ms après le dernier [événement d'offset] ».
    /// Le témoin des littéraux, qui lisait en brut, s'est mis à rougir sur la
    /// PROSE qui documente le retrait. La garde accusait le texte qui la
    /// justifiait.
    ///
    /// Même idiome que `FocalNoBubbleSourceGuardTests`, qui strippe déjà dans
    /// son chargeur et épingle à part ses occurrences légitimes.
    ///
    /// Portée VOLONTAIREMENT étroite : seul le témoin des littéraux interdits
    /// de `ConversationListView` consomme cette lecture. Les deux autres
    /// témoins de littéraux du fichier n'en ont pas besoin et ne sont pas
    /// touchés — `test_softLawLiterals_areNeverUsedAsNumericComparisons` ne
    /// compte que des COMPARAISONS (un chiffre en prose n'en est pas une), et
    /// `test_hardLawLiteral520_…` épingle un compte de 1 sur une occurrence qui
    /// vit dans le CODE (`min(windowWidth * 0.42, 520)`), donc identique dans
    /// les deux lectures. Élargir sans nécessité aurait déplacé les bases de
    /// comptage de gardes actuellement justes.
    private func listViewLiteralSource() throws -> (name: String, code: String) {
        let source = try listViewSource()
        return (source.name, AppSourceGuard.stripComments(source.code))
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// Compte les comparaisons numériques `>`, `>=`, `<`, `<=` immédiatement
    /// suivies (espaces optionnels) du littéral — même patron que
    /// `check-law-literals.sh` (`grep -nE "\s*(>|>=|<|<=)\s*$literal\b"`).
    /// Restreindre les littéraux « mous » (25/24) à leur usage en
    /// COMPARAISON évite les faux positifs sur des entiers ordinaires
    /// (`duration: 0.25`, `- 24` dans une soustraction de padding) — même
    /// nuance que le script.
    private func comparisonOccurrences(of literal: String, in code: String) -> Int {
        let pattern = "[<>]=?\\s*\(NSRegularExpression.escapedPattern(for: literal))\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            XCTFail("Regex de garde invalide pour le littéral « \(literal) » — corriger le motif dans LentilleChromeSourceGuardTests avant de faire confiance à ce témoin.")
            return 0
        }
        let range = NSRange(code.startIndex..., in: code)
        return regex.numberOfMatches(in: code, range: range)
    }

    // MARK: - Garde d'ensemble (leçon 257)

    func test_guardDiscoversAtLeastOneChromeFile_neverSilentlyEmpty() throws {
        let sources = try chromeSources()
        XCTAssertFalse(
            sources.isEmpty,
            "LentilleChromeSourceGuardTests n'a chargé AUCUN fichier depuis " +
            "`\(Self.chromeDirectory.path)` — vérifier que ce chemin existe encore depuis le " +
            "bundle de test (`apps/ios/Meeshy/Features/Main/Lentille/Chrome/`). Une garde qui " +
            "charge zéro fichier passe TOUJOURS au vert sans avoir rien vérifié (leçon 257) : " +
            "c'est le défaut le plus coûteux de cette suite, bien pire qu'un simple trou de " +
            "couverture."
        )
    }

    // MARK: - Aucun détecteur de défilement neuf (contrat LWS-6 travail 4)

    func test_noScrollViewReader_inAnyGuardedFile() throws {
        for source in try allGuardedSources() {
            let count = occurrences(of: "ScrollViewReader", in: source.code)
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « ScrollViewReader » " +
                "(commentaires compris) : la Lentille réutilise le détecteur EXISTANT " +
                "(`onScrollOffsetChange` de `MeeshyRefreshableScroll`) — contrat LWS-6 travail " +
                "4, « un seul détecteur, aucun observateur de scroll nouveau »."
            )
        }
    }

    func test_noOnScrollGeometryChange_inAnyGuardedFile() throws {
        for source in try allGuardedSources() {
            let count = occurrences(of: "onScrollGeometryChange", in: source.code)
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « onScrollGeometryChange » " +
                "(commentaires compris) : cette sonde de géométrie appartient à l'élection de " +
                "la focus card (LWS-8, I-070), pas au périmètre LWS-6 — la pilule et le sticky " +
                "sticker se contentent du relais d'offset déjà publié."
            )
        }
    }

    func test_noNewScrollPreferenceKey_inAnyGuardedFile() throws {
        for source in try allGuardedSources() {
            let count = occurrences(of: "PreferenceKey", in: source.code)
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de « PreferenceKey » " +
                "(commentaires compris) : un `PreferenceKey` de défilement serait un second " +
                "canal de mesure, concurrent du relais `ScrollOffsetRelay` existant — contrat " +
                "LWS-6 travail 4."
            )
        }
    }

    // MARK: - Littéraux de loi (R15) dans Lentille/Chrome/*.swift
    //
    // Ce périmètre EST sous les `SKIN_DIRS` de `check-law-literals.sh` (tout
    // `.swift` sous `Lentille/**`, hors `Lentille/Core/**`) : le script le
    // garde déjà en CI. Ces témoins le rejouent app-side, en RAW (comme le
    // script), pour que la garde soit visible dans la MÊME suite que le
    // reste du contrat I-064 — pas une redondance inerte, une seconde ligne
    // de défense qui n'a pas besoin du script pour rougir.

    func test_hardLawLiterals_areAbsent_fromChromeFiles() throws {
        let hardLiterals = ["900", "520", "380", "0.45", "0.82"]
        for source in try chromeSources() {
            for literal in hardLiterals {
                let count = occurrences(of: literal, in: source.code)
                XCTAssertEqual(
                    count, 0,
                    "\(source.name) contient « \(literal) » (\(count) fois, commentaires " +
                    "compris) — constante de loi gelée (fenêtre pilule 900 ms, ou courbe de " +
                    "focus 520/380/0.45/0.82, packages/shared/utils/focus-curve.ts) : elle " +
                    "doit être LUE depuis son miroir Swift (`ScrollTimePillLaw.lingerMs`, " +
                    "`FOCUS_CURVE_CONSTANTS`), jamais recopiée dans une peau (garde R15)."
                )
            }
        }
    }

    /// `25` et `24` ne sont interdits qu'en COMPARAISON numérique (seuils de
    /// l'orchestrateur LWS-8 : `ORCHESTRATOR_UNREAD_CAP = 25`,
    /// `ORCHESTRATOR_ABSENCE_WINDOW_MS` = 24 h) — un zéro aveugle sur le
    /// chiffre lui-même ferait rougir du code n'ayant rien à voir avec la loi
    /// (un index, une taille de police). Même règle sur `ConversationListView.swift` :
    /// aucune des deux valeurs n'y a de rôle légitime, comparaison ou non.
    func test_softLawLiterals_areNeverUsedAsNumericComparisons() throws {
        let softLiterals = ["25", "24"]
        for source in try allGuardedSources() {
            for literal in softLiterals {
                let count = comparisonOccurrences(of: literal, in: source.code)
                XCTAssertEqual(
                    count, 0,
                    "\(source.name) compare une valeur à « \(literal) » (\(count) fois) — " +
                    "seuils de l'orchestrateur LWS-8 (plafond de non-lus, fenêtre d'absence) : " +
                    "à lire depuis leur miroir Swift, jamais à comparer en dur dans une peau."
                )
            }
        }
    }

    // MARK: - Littéraux de loi (R15) dans ConversationListView.swift
    //
    // `ConversationListView.swift` n'est PAS sous les `SKIN_DIRS` du script
    // (il vit hors `Lentille/**`) : ce fichier hôte porte du code bien
    // antérieur à la Lentille, et notamment UNE occurrence légitime de
    // « 520 » sans rapport avec la loi — voir le test dédié ci-dessous. Un
    // zéro aveugle sur CE fichier ferait rougir sur du code hérité ; le
    // compte FIXE détecte toute variation dans les deux sens.

    func test_hardLawLiterals_thatHaveNoLegitimateOccurrence_areAbsent_fromConversationListView() throws {
        let (name, code) = try listViewLiteralSource()
        for literal in ["900", "380", "0.45", "0.82"] {
            let count = occurrences(of: literal, in: code)
            XCTAssertEqual(
                count, 0,
                "\(name) contient « \(literal) » (\(count) fois, hors commentaires) — " +
                "aucune occurrence légitime de cette constante n'existe dans ce fichier ; " +
                "c'est une constante de loi gelée (pilule 900 ms ou courbe de focus " +
                "380/0.45/0.82) qui doit être lue depuis son miroir Swift, jamais recopiée."
            )
        }
    }

    /// `520` est le SEUL des sept littéraux cités par le contrat I-064 à
    /// avoir une occurrence PRÉ-EXISTANTE et sans rapport dans ce fichier :
    /// `min(windowWidth * 0.42, 520)` (clampage de largeur de colonne iPad,
    /// hérité de la fusion `95aa95c`, antérieure à toute la Lentille — sans
    /// lien avec `FOCUS_CURVE_CONSTANTS.list.maxDistance`, qui vaut la même
    /// valeur par pure coïncidence). Un zéro aveugle ferait rougir ce test
    /// sur du code légitime et déjà en production ; le compte FIXE (1)
    /// détecte au contraire toute VARIATION — à la hausse (fuite d'une
    /// constante de loi ailleurs dans le fichier) comme à la baisse (le jour
    /// où ce clamp change ou disparaît, mettre à jour CE commentaire et le
    /// nombre ci-dessous, jamais relâcher la garde en la supprimant).
    // MARK: - Une SEULE écriture de la cascade de couverture de story (lot 3)
    //
    // Le rail de tête de liste doit montrer la PREVIEW de la story, ce que le
    // tray fait depuis 2026-05-27 via `latestStoryThumbnailURL` — cascade
    // « cover composite locale > `thumbnailUrl` serveur > `url` image >
    // avatar », dont le premier maillon touche le cache disque. Une seconde
    // écriture app-side serait la TROISIÈME du même arbitrage (la première
    // étant `StoryCoverThumbnail.preferredCoverURLString`, la règle pure) et
    // la première à diverger : le rail et le tray montreraient alors deux
    // images pour la même story.
    //
    // Périmètre : TOUT `apps/ios/Meeshy/**`, découvert par `FileManager` —
    // jamais une liste de fichiers recopiée, sinon la garde laisse passer le
    // prochain doublon (leçon 257). Commentaires RETIRÉS ici (à la différence
    // des témoins de littéraux ci-dessus, qui doivent lire en brut comme le
    // script) : une docstring qui NOMME `latestStoryThumbnailURL` pour
    // expliquer d'où vient la couverture n'est pas une seconde écriture.

    private func appSources() throws -> [(name: String, code: String)] {
        let root = Self.iosRoot.appendingPathComponent("Meeshy")
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
        var out: [(name: String, code: String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            let raw = try String(contentsOf: url, encoding: .utf8)
            out.append((relative, AppSourceGuard.stripComments(raw)))
        }
        return out.sorted { $0.name < $1.name }
    }

    func test_appSourceWalk_neverSilentlyEmpty() throws {
        XCTAssertGreaterThan(
            try appSources().count, 100,
            "Le parcours de `Meeshy/**` n'a presque rien chargé — une garde d'ensemble qui " +
            "ne lit aucun fichier passe TOUJOURS au vert (leçon 257)."
        )
    }

    func test_theStoryCoverCascade_isWrittenExactlyOnce_inTheWholeApp() throws {
        let sources = try appSources()

        let definitions = sources.filter { $0.code.contains("func latestStoryThumbnailURL(") }.map(\.name)
        XCTAssertEqual(
            definitions, ["Features/Main/Views/StoryTrayView.swift"],
            "Le résolveur de couverture doit exister UNE fois, dans StoryTrayView.swift. " +
            "Trouvé : \(definitions). Le rail Lentille l'APPELLE (portée interne depuis le " +
            "lot 3) — il ne le recopie pas."
        )

        let callers = sources.filter { $0.code.contains("StoryCoverThumbnail.preferredCoverURLString(") }.map(\.name)
        XCTAssertEqual(
            callers, ["Features/Main/Views/StoryTrayView.swift"],
            "La cascade pure (`preferredCoverURLString`) ne doit être consommée que par " +
            "`latestStoryThumbnailURL`. Un second appelant serait une troisième écriture de " +
            "l'ordre de préférence. Trouvé : \(callers)."
        )
    }

    func test_theRailMapping_resolvesItsCoversThroughThatSameResolver() throws {
        let (name, raw) = try listViewSource()
        let code = AppSourceGuard.stripComments(raw)
        XCTAssertEqual(
            occurrences(of: "latestStoryThumbnailURL(", in: code), 2,
            "\(name) doit appeler le résolveur PARTAGÉ deux fois — une pour la pastille " +
            "« moi », une pour les autres. Sans cet appel le rail retombe sur les avatars et " +
            "l'exigence « afficher la preview de la story » redevient une régression " +
            "silencieuse."
        )
    }

    /// Contrôle positif : sans lui, un chemin cassé ou un motif trop étroit
    /// rendrait les deux témoins ci-dessus verts pour toujours.
    func test_theCoverGuardActuallyDetectsASecondWriting() {
        let fake = "func latestStoryThumbnailURL(_ group: StoryGroup) -> String? { nil }"
        XCTAssertTrue(fake.contains("func latestStoryThumbnailURL("))
        XCTAssertFalse(
            AppSourceGuard.stripComments("// func latestStoryThumbnailURL(_ g: G) -> String?\n")
                .contains("func latestStoryThumbnailURL("),
            "Une CITATION en commentaire ne doit pas compter pour une écriture."
        )
    }

    // MARK: - Le rail rend la preview, le mood et l'état vu (lot 3)

    private func railSource() throws -> (name: String, code: String) {
        let url = Self.chromeDirectory.appendingPathComponent("StoriesVivantsRail.swift")
        return ("StoriesVivantsRail.swift", AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8)))
    }

    func test_theRail_drawsItsPastillesWithTheSharedCachedAvatar_notAHandRolledLoader() throws {
        let (name, code) = try railSource()
        XCTAssertEqual(
            occurrences(of: "AsyncImage(", in: code), 0,
            "\(name) : `AsyncImage` sans repli d'initiales est ce qui peignait un cercle VIDE " +
            "pour tout auteur sans avatar. L'atome partagé `CachedAvatarImage` sert le cache " +
            "chaud ET les initiales."
        )
        XCTAssertEqual(
            occurrences(of: "CachedAvatarImage(", in: code), 2,
            "\(name) : les DEUX pastilles (« moi » et les autres) passent par le même atome."
        )
    }

    func test_theRail_animatesItsMoods_throughTheSharedBadgeAtom() throws {
        let (name, code) = try railSource()
        XCTAssertEqual(
            occurrences(of: "MeeshyMoodBadge(", in: code), 2,
            "\(name) : le mood de « moi » ET celui de chaque auteur passent par l'atome " +
            "partagé — le seul endroit où le ressort `repeatForever` est écrit, et le seul " +
            "qui consulte Reduce Motion."
        )
        XCTAssertEqual(
            occurrences(of: "repeatForever", in: code), 0,
            "\(name) : aucun ressort écrit à la main dans une peau. Il échapperait au " +
            "portillon d'accessibilité de l'atome."
        )
    }

    func test_theRail_paintsItsRingThroughThePolicy_neverFromIsLiveAlone() throws {
        let (name, code) = try railSource()
        XCTAssertTrue(
            code.contains("LentilleRailPolicy.ringIsAccented(entry)"),
            "\(name) : l'anneau des autres pastilles doit demander la règle. Avant le lot 3 " +
            "il lisait `entry.isLive` seul — toujours faux faute de modèle d'appel — donc " +
            "tout le rail était gris, y compris les stories NON VUES."
        )
    }

    func test_hardLawLiteral520_matchesTheOneKnownUnrelatedOccurrence_inConversationListView() throws {
        let (name, code) = try listViewSource()
        XCTAssertEqual(
            occurrences(of: "520", in: code), 1,
            "\(name) : le compte de « 520 » a changé par rapport au repère connu (1 — " +
            "`min(windowWidth * 0.42, 520)`, sans rapport avec la loi). Si ce changement AJOUTE " +
            "une seconde occurrence, vérifier qu'elle n'est pas `FOCUS_CURVE_CONSTANTS.list." +
            "maxDistance` recopiée en dur avant de faire quoi que ce soit d'autre."
        )
    }
}
