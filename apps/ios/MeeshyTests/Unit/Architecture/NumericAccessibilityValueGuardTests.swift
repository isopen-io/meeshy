import XCTest

/// **Un nombre exposé à VoiceOver passe par la locale — jamais par
/// l'interpolation.**
///
/// `.accessibilityValue("\(count)")` grave les chiffres latins. L'arabe s'écrit
/// en chiffres arabo-indiens : l'interpolation faisait donc cohabiter deux
/// systèmes d'écriture dans la même interface. Même défaut pour le glyphe `%`
/// et son espacement, qui appartiennent eux aussi à la locale — et que
/// `MessageOverlayMenu` gravait dans DEUX orthographes différentes à quatre
/// lignes d'écart.
///
/// 234i → 240i ont réduit sept familles de compteurs sans jamais empêcher la
/// suivante. Cette garde ferme celle-ci **par la forme** plutôt que par
/// l'inventaire : peu importe quel compteur naît demain, s'il interpole son
/// nombre dans une valeur d'accessibilité, il tombe ici.
///
/// Elle **se garde elle-même** (leçon 238i) : un balayage qui n'inspecterait
/// rien, ou un dépouilleur qui mangerait les littéraux en même temps que les
/// commentaires, rendrait l'interdiction verte et inopérante en silence.
final class NumericAccessibilityValueGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Architecture
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    /// Les commentaires sont retirés, les littéraux conservés : le doc-comment
    /// de `LocalizedNumber` **cite** le code fautif qu'il remplace, et doit
    /// pouvoir le faire sans déclencher la garde qu'il documente.
    private func strippedOfComments(_ text: String) -> String {
        let withoutBlocks = text.replacingOccurrences(
            of: "/\\*.*?\\*/", with: "", options: [.regularExpression]
        )
        return withoutBlocks.replacingOccurrences(
            of: "//[^\n]*", with: "", options: [.regularExpression]
        )
    }

    private func swiftFiles(under root: URL) -> [URL] {
        guard let walker = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: nil
        ) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Toute valeur d'accessibilité écrite comme un littéral INTERPOLÉ.
    /// `.accessibilityValue(LocalizedNumber.exact(n))` ne matche pas — il n'y a
    /// pas de littéral. `.accessibilityValue("\(n)")` matche.
    private func interpolatedAccessibilityValues(in text: String) -> [String] {
        let pattern = #"\.accessibilityValue\(\s*"[^"\n]*\\\([^\n]*"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap {
            Range($0.range, in: text).map { r in String(text[r]) }
        }
    }

    // MARK: - Interdiction

    func test_noAccessibilityValueInterpolatesItsNumber() {
        var offenders: [String] = []
        for file in swiftFiles(under: appRoot) {
            guard let raw = try? String(contentsOf: file, encoding: .utf8) else { continue }
            for hit in interpolatedAccessibilityValues(in: strippedOfComments(raw)) {
                offenders.append("\(file.lastPathComponent) — \(hit.trimmingCharacters(in: .whitespaces))")
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            "Ces valeurs d'accessibilité interpolent leur contenu au lieu de passer par "
            + "la locale. Un nombre passe par `LocalizedNumber.exact` / `.percent` ; "
            + "un texte composé passe par une clé de catalogue :\n"
            + offenders.sorted().joined(separator: "\n")
        )
    }

    /// Le `%` littéral est l'autre moitié du défaut : son glyphe ET son
    /// espacement appartiennent à la locale.
    func test_noAccessibilityValueHardcodesThePercentGlyph() {
        var offenders: [String] = []
        let pattern = #"\.accessibilityValue\(\s*"[^"\n]*%[^"\n]*""#
        for file in swiftFiles(under: appRoot) {
            guard let raw = try? String(contentsOf: file, encoding: .utf8),
                  let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let text = strippedOfComments(raw)
            let range = NSRange(text.startIndex..., in: text)
            for match in regex.matches(in: text, range: range) {
                guard let r = Range(match.range, in: text) else { continue }
                offenders.append("\(file.lastPathComponent) — \(String(text[r]))")
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            "Le glyphe « % » et son espacement viennent de la locale "
            + "(`LocalizedNumber.percent`), pas d'un littéral :\n"
            + offenders.sorted().joined(separator: "\n")
        )
    }

    // MARK: - Consolidation

    /// L'interdiction seule resterait verte si les compteurs disparaissaient.
    /// Ces hôtes sont ceux que 241i a convertis : ils doivent continuer à nommer
    /// la source.
    func test_convertedHostsNameTheSingleSource() {
        let hosts = [
            "Features/Main/Views/FeedCommentsSheet.swift",
            "Features/Main/Views/PostDetailView.swift",
            "Features/Main/Views/ReelsPlayerView.swift",
            "Features/Main/Components/ConversationDashboardView.swift",
            "Features/Main/Components/MessageOverlayMenu.swift",
        ]
        for host in hosts {
            let url = appRoot.appendingPathComponent(host)
            let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            XCTAssertTrue(
                text.contains("LocalizedNumber."),
                "\(host) ne nomme plus `LocalizedNumber.` — soit le compteur a disparu "
                + "(mettre la liste à jour), soit la règle a été réécrite sur place."
            )
        }
    }

    // MARK: - La garde se garde elle-même

    /// Un balayage qui n'inspecte rien rend l'interdiction verte en silence.
    func test_theSweepActuallyReadsTheApp() {
        XCTAssertGreaterThan(
            swiftFiles(under: appRoot).count, 400,
            "Le balayage ne voit presque aucun fichier : la racine de l'app a bougé."
        )
    }

    /// L'extracteur doit VRAIMENT extraire — sinon il ne prouve rien.
    func test_theExtractorFindsAKnownOffender() {
        let fabricated = #"""
        Text("x")
            .accessibilityValue("\(likeCount)")
        """#
        XCTAssertEqual(
            interpolatedAccessibilityValues(in: fabricated).count, 1,
            "L'extracteur ne reconnaît plus le défaut qu'il est censé interdire."
        )
    }

    /// …et ne doit PAS attraper la forme corrigée, sans quoi il enverrait
    /// corriger ce qui ne l'est pas (le faux rouge de la leçon 238i).
    func test_theExtractorSparesTheFixedForm() {
        let fixed = #"""
            .accessibilityValue(LocalizedNumber.exact(likeCount))
        """#
        XCTAssertTrue(
            interpolatedAccessibilityValues(in: fixed).isEmpty,
            "La forme corrigée ne doit pas être signalée."
        )
    }

    // MARK: - Durées (247i)

    /// **Le trou que cette garde avait, et qui a laissé la famille ouverte deux
    /// ans.**
    ///
    /// L'interdiction du haut de fichier reconnaît un LITTÉRAL interpolé. Une
    /// durée n'en est pas un : elle traversait un formateur privé —
    ///
    /// ```swift
    /// private func formatDuration(_ s: TimeInterval) -> String {
    ///     String(format: "%d:%02d", Int(s) / 60, Int(s) % 60)
    /// }
    /// ```
    ///
    /// — et arrivait au site d'appel sous la forme la plus INNOCENTE qui soit,
    /// `.accessibilityValue(formattedDuration)`. Aucun littéral, aucun `\(…)`,
    /// aucune alerte : chiffres latins dans une interface arabe, et « 4:32 »
    /// annoncé « 4 heures 32 » pour un compte à rebours de quatre minutes.
    ///
    /// La leçon de forme : **une garde qui épingle une SYNTAXE est contournée
    /// par une fonction.** Celle-ci va donc chercher le motif à sa SOURCE, dans
    /// le corps du formateur, où il redevient un littéral.
    private func handRolledClockFormats(in text: String) -> [String] {
        let pattern = #"String\(format:\s*"%0?\d*d:%02d"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap {
            Range($0.range, in: text).map { r in String(text[r]) }
        }
    }

    /// `NotificationSettingsView.formattedDndTime` grave « HH:mm » pour la
    /// PERSISTANCE — le format que `UserNotificationPreferences` relit et que
    /// le gateway reçoit. Le localiser corromprait la donnée : c'est le seul
    /// site du dépôt où les chiffres latins sont la bonne réponse, et il est
    /// nommé ici plutôt que toléré en silence.
    private let clockFormatIsDataNotUI = ["NotificationSettingsView.swift"]

    func test_noHandRolledClockFormatterSurvivesInTheApp() {
        var offenders: [String] = []
        for file in swiftFiles(under: appRoot)
        where !clockFormatIsDataNotUI.contains(file.lastPathComponent) {
            guard let raw = try? String(contentsOf: file, encoding: .utf8) else { continue }
            for hit in handRolledClockFormats(in: strippedOfComments(raw)) {
                offenders.append("\(file.lastPathComponent) — \(hit)")
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            "Ces sites composent une horloge à la main. `String(format:)` sans locale "
            + "grave les chiffres latins : une durée MONTRÉE passe par "
            + "`LocalizedNumber.duration`, une durée DITE par "
            + "`LocalizedNumber.spokenDuration` :\n"
            + offenders.sorted().joined(separator: "\n")
        )
    }

    /// L'interdiction ci-dessus resterait verte si les minuteries disparaissaient.
    /// Ces hôtes sont ceux que 247i a convertis.
    func test_convertedDurationHostsNameTheSingleSource() {
        let hosts = [
            "Features/Main/Components/CameraView.swift",
            "Features/Main/Components/ComposerModels.swift",
            "Features/Main/Components/MessageOverlayMenu.swift",
            "Features/Main/Components/RecentMediaStrip.swift",
            "Features/Main/Components/UniversalComposerBar+Recording.swift",
            "Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift",
            "Features/Main/Components/MessageDetail/MessageViewsDetailView.swift",
            "Features/Main/Services/CallManager.swift",
            "Features/Main/Views/AudioPostComposerView.swift",
            "Features/Main/Views/MagicLinkView.swift",
            "Features/Main/Views/ThemedConversationRow.swift",
        ]
        for host in hosts {
            let url = appRoot.appendingPathComponent(host)
            let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            XCTAssertTrue(
                text.contains("LocalizedNumber.duration")
                || text.contains("LocalizedNumber.spokenDuration")
                || text.contains("LocalizedNumber.wholeSeconds"),
                "\(host) ne nomme plus la source des durées — soit la minuterie a disparu "
                + "(mettre la liste à jour), soit la règle a été réécrite sur place."
            )
        }
    }

    /// **La moitié PARLÉE de la règle.** Une durée d'horloge servie à VoiceOver
    /// est fausse même en chiffres latins : le synthétiseur lit « 2:05 » comme
    /// une heure. Ces vues rendent une minuterie ET l'annoncent ; leur valeur
    /// d'accessibilité doit venir de la forme parlée, jamais de celle affichée.
    func test_timerHostsSpeakTheirDurationInWords() {
        let hosts = [
            "Features/Main/Views/CallView.swift",
            "Features/Main/Views/FloatingCallPillView.swift",
            "Features/Main/Views/MagicLinkView.swift",
            "Features/Main/Views/AudioPostComposerView.swift",
            "Features/Main/Components/CameraView.swift",
            "Features/Main/Components/UniversalComposerBar+Recording.swift",
        ]
        for host in hosts {
            let url = appRoot.appendingPathComponent(host)
            let text = AppSourceGuard.stripComments(
                (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            )
            XCTAssertTrue(
                text.contains("spokenDuration") || text.contains("spokenCountdown"),
                "\(host) rend une minuterie sans jamais nommer sa forme parlée : "
                + "sa valeur d'accessibilité annonce donc une heure."
            )
        }
    }

    /// L'extracteur de durées doit reconnaître les TROIS orthographes que l'app
    /// portait — sans quoi l'interdiction serait verte pour la mauvaise raison.
    func test_theClockExtractorFindsEveryKnownOffender() {
        let fabricated = #"""
        String(format: "%d:%02d", mins, secs)
        String(format: "%02d:%02d", minutes, seconds)
        String(format: "%d:%02d:%02d", hours, minutes, seconds)
        """#
        XCTAssertEqual(
            handRolledClockFormats(in: fabricated).count, 3,
            "L'extracteur ne reconnaît plus les formes qu'il est censé interdire."
        )
    }

    /// …et doit épargner la forme corrigée ET les autres `String(format:)` du
    /// dépôt, sans quoi il enverrait corriger ce qui ne l'est pas (leçon 238i).
    func test_theClockExtractorSparesEverythingElse() {
        let innocent = #"""
        LocalizedNumber.duration(seconds: total)
        LocalizedNumber.spokenDuration(seconds: total)
        String(format: String(localized: "a11y.transcription.confidence"), pct)
        String(format: "%.1f MB", megabytes)
        """#
        XCTAssertTrue(
            handRolledClockFormats(in: innocent).isEmpty,
            "La forme corrigée et les formats sans rapport ne doivent pas être signalés."
        )
    }

    /// Le dépouilleur doit manger les commentaires SANS manger les littéraux :
    /// `LocalizedNumber` cite le code fautif dans sa documentation.
    func test_theStripperRemovesCommentsButKeepsLiterals() {
        let sample = #"""
        /// .accessibilityValue("\(post.viewCount)")
        let kept = ".accessibilityValue"
        """#
        let stripped = strippedOfComments(sample)
        XCTAssertFalse(stripped.contains("post.viewCount"), "Le commentaire doit disparaître.")
        XCTAssertTrue(stripped.contains("\".accessibilityValue\""), "Le littéral doit rester.")
    }
}
