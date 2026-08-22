import XCTest
@testable import Meeshy

/// **Réserve R-g — « cadence d'élection vs 60 Hz du contrat »** (§8, PORTE V1).
///
/// Le contrat écrit, mot pour mot (LWS-8,
/// `tasks/lentille-implementation-contract.md`) :
///
/// > « Élection de la focus card : `onScrollGeometryChange` (iOS 18+) ; repli
/// > iOS 17 par `PreferenceKey` throttlée à 60 Hz. Bande : `bottom − 140 ± 45`. »
///
/// La note de clôture V3 formule le doute ainsi : « élection par le relais
/// existant (choix Opus **vs** `onScrollGeometryChange`, à confirmer REV-3 ».
/// Cette suite existe parce que ce « vs » est une FAUSSE OPPOSITION, et parce
/// que le prouver une fois ne suffit pas : il faut le figer.
///
/// **Ce que la lecture du chemin complet établit.** `ScrollOffsetRelay` n'est
/// pas une alternative à l'API que le contrat nomme — il en est le
/// CONSOMMATEUR. Le producteur, maillon par maillon :
///
/// ```
/// iOS 18+   UIScrollView
///           → onScrollGeometryChange { $0.contentOffset.y }   ← l'API DU CONTRAT
///             (MeeshyUI/Navigation/ScrollOffsetTracking.swift)
///           → trackScrollContentOffset { … }
///           → MeeshyRefreshableScroll.onScrollOffsetChange?(offset)
///           → ConversationListView : scrollOffsetRelay.offset = offset
///           → willSet { objectWillChange.send() }
///           → LentilleFocusElectionHost.adaptiveOnChange(of: relay.offset)
///           → electFromScroll → FocalFocusCurve.electFocusRow
///
/// iOS 16-17 même chaîne, un seul maillon change en tête :
///           GeometryReader sentinelle → ScrollOffsetPreferenceKey
///           → .onPreferenceChange(…)                          ← LE REPLI DU CONTRAT
/// ```
///
/// Les deux branches sont donc EXACTEMENT celles que le contrat prescrit, à une
/// indirection près. Et sur toute la longueur de la chaîne il n'existe **aucun**
/// debounce, aucun throttle, aucun `asyncAfter`, aucun `Timer` : chaque maillon
/// transmet de façon synchrone, dans le tour de boucle où il a reçu. La cadence
/// de l'élection est donc celle de la passe d'affichage — la même, par
/// construction, que celle de la perspective `.visualEffect` (I-069). R-g se
/// solde en **conforme**.
///
/// **Pourquoi une suite, alors, si tout est conforme ?** Parce que la
/// conformité tient à des fichiers que la Lentille ne possède pas. Les gardes
/// existantes (`FocusCardElectionTests`, `ScrollPillStateTests`,
/// `LentilleChromeSourceGuardTests`) regardent toutes vers le BAS — elles
/// interdisent à la peau d'ajouter un second observateur. **Aucune ne regarde
/// vers le HAUT** : rien n'empêche aujourd'hui qu'un debounce apparaisse dans
/// `ScrollOffsetTracking.swift` ou `MeeshyRefreshableScroll.swift` pour de
/// bonnes raisons locales (lisser le header, économiser la batterie) et
/// dégrade au passage, silencieusement, l'élection de la focus card, la pilule
/// de section et le header d'un seul coup. C'est ce trou-là que cette suite
/// ferme.
///
/// **Ce qu'elle ne prouve pas.** Qu'une frame se rende en moins d'une frame :
/// c'est Instruments, sur device. Elle prouve que RIEN dans le code ne
/// s'interpose entre le geste et l'élection, et elle chiffre ce qu'un
/// interposant coûterait.
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN`
/// (`apps/ios/meeshy.sh:1584`) : cette suite reste en phase 1.
///
/// @see tasks/lentille-implementation-contract.md LWS-8, §4.2
/// @see tasks/lentille-workshop-execution.md §8 (réserve R-g)
final class LentilleFocusElectionCadenceTests: XCTestCase {

    // MARK: - Accès aux sources

    /// `.../apps/ios`
    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    /// Racine du monorepo — la chaîne d'offset traverse la frontière
    /// `apps/ios` → `packages/MeeshySDK`, et c'est précisément parce qu'elle la
    /// traverse que personne ne la gardait.
    private static var repoRoot: URL {
        iosRoot
            .deletingLastPathComponent()   // .../apps
            .deletingLastPathComponent()   // racine
    }

    private func source(_ relativePath: String) throws -> String {
        let url = Self.repoRoot.appendingPathComponent(relativePath)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw XCTSkip(
                "Source introuvable : \(relativePath) (résolu en \(url.path)). " +
                "Si ce fichier a été DÉPLACÉ, cette garde doit être repointée — pas " +
                "supprimée : c'est elle qui empêche un debounce d'apparaître en amont " +
                "de l'élection de la focus card (réserve R-g)."
            )
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Code seul — commentaires retirés. Un commentaire qui CITE « debounce »
    /// pour expliquer qu'il n'y en a pas ne doit pas faire rougir la garde
    /// (leçon `feedback_read_code_not_comments_for_source_guards`).
    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    // MARK: - Chemins de la chaîne d'offset

    private static let trackingPath =
        "packages/MeeshySDK/Sources/MeeshyUI/Navigation/ScrollOffsetTracking.swift"
    private static let scrollPath =
        "packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyRefreshableScroll.swift"
    private static let relayPath =
        "packages/MeeshySDK/Sources/MeeshyUI/Primitives/ScrollOffsetRelay.swift"
    private static let listPath =
        "apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift"
    private static let hostPath =
        "apps/ios/Meeshy/Features/Main/Lentille/Perspective/LentilleFocusElectionHost.swift"

    /// Primitives qui, insérées n'importe où sur la chaîne, transformeraient un
    /// tick par frame en tick par fenêtre.
    private static let delayPrimitives = [
        "debounce", "throttle", "asyncAfter", "Timer", "DispatchQueue",
    ]

    // MARK: - 1. Maillon 1 — le producteur EST l'API du contrat

    /// **Le « vs » de la note V3 n'existe pas.** L'élection ne remplace pas
    /// `onScrollGeometryChange` : elle en descend. Si cette assertion tombe,
    /// c'est que le producteur d'offset a changé d'API — et c'est alors la
    /// conformité de la Lentille au contrat LWS-8 qui est en jeu, pas
    /// seulement celle du header.
    func test_link1_theRelaysProducerIsTheContractsAPI_onScrollGeometryChange() throws {
        let code = normalizedCode(try source(Self.trackingPath))

        XCTAssertTrue(
            // Offset RELATIF à l'inset (2026-08-21, pull-to-refresh sous `safeAreaInset`) :
            // 0 au repos partout — la loi de la pilule et la bande lisent ce relais.
            code.contains("onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top }"),
            "Le chemin iOS 18+ de `trackScrollContentOffset` n'appelle plus " +
            "`onScrollGeometryChange` sur `contentOffset.y`. C'est l'API que le contrat " +
            "NOMME pour l'élection de la focus card (LWS-8 : « onScrollGeometryChange " +
            "(iOS 18+) »). L'élection de la Lentille ne l'appelle pas elle-même — elle " +
            "s'abonne au relais que CE maillon alimente. Changer ici, c'est débrancher " +
            "l'élection de l'API contractuelle sans que rien dans `Lentille/` ne bouge."
        )
        XCTAssertTrue(
            code.contains("if #available(iOS 18.0, *)"),
            "Le partage de rôles entre versions d'iOS a disparu. Le contrat en prescrit " +
            "DEUX : `onScrollGeometryChange` à partir d'iOS 18, `PreferenceKey` en deçà. " +
            "Un seul chemin laisse forcément une des deux gammes sans tick d'offset — " +
            "donc sans élection."
        )
    }

    /// Aucun temporisateur sur le maillon de tête : la géométrie reçue est
    /// re-publiée dans le même tour de boucle.
    func test_link1_theProducerForwardsSynchronously_noDelayPrimitiveAtAll() throws {
        let code = normalizedCode(try source(Self.trackingPath))

        for primitive in Self.delayPrimitives + ["Task.sleep", "await"] {
            XCTAssertEqual(
                occurrences(of: primitive, in: code), 0,
                "`ScrollOffsetTracking.swift` contient désormais « \(primitive) » : le " +
                "tick d'offset n'est plus synchrone. Ce fichier est le SOMMET de la " +
                "chaîne qui alimente l'élection de la focus card (R-g), la pilule de " +
                "section et le header d'un seul et même relais — un temporisateur ici " +
                "les ralentit TOUS LES TROIS, et aucune garde de `Lentille/` ne le verrait."
            )
        }
    }

    // MARK: - 2. Maillon 2 — le wrapper relaie sans retenir

    /// Les deux branches d'OS appellent `onScrollOffsetChange?` en PREMIÈRE
    /// instruction de leur closure. Une garde sur le fichier entier serait
    /// fausse (`performRefresh` y dort légitimement 0,4 s) : c'est la forme des
    /// deux points de transmission qui est figée, pas l'absence globale d'attente.
    func test_link2_bothOSPathsForwardTheOffsetAsTheirFirstStatement() throws {
        let code = normalizedCode(try source(Self.scrollPath))

        XCTAssertTrue(
            code.contains(
                ".onPreferenceChange(ScrollOffsetPreferenceKey.self) { offset in onScrollOffsetChange?(offset)"
            ),
            "Le chemin iOS 16–17 ne transmet plus l'offset en première instruction. " +
            "C'est le « repli iOS 17 par PreferenceKey » que le contrat prescrit pour " +
            "l'élection (LWS-8) : tout ce qui s'insère avant la transmission — une " +
            "garde, une fenêtre, une comparaison — retarde l'élection d'autant."
        )
        XCTAssertTrue(
            code.contains(
                ".trackScrollContentOffset { contentOffsetY in let offset = -contentOffsetY onScrollOffsetChange?(offset)"
            ),
            "Le chemin iOS 18+ ne transmet plus l'offset immédiatement après la " +
            "négation de signe. C'est la branche RÉELLEMENT empruntée sur les appareils " +
            "d'aujourd'hui : c'est elle qui fixe la cadence observée de la focus card."
        )

        for primitive in Self.delayPrimitives {
            XCTAssertEqual(
                occurrences(of: primitive, in: code), 0,
                "`MeeshyRefreshableScroll.swift` contient désormais « \(primitive) ». " +
                "Le seul délai tolérable dans ce fichier est le `Task.sleep` de " +
                "`performRefresh` (animation de rafraîchissement, hors chemin d'offset). " +
                "Un temporisateur de cette famille y sert presque toujours à lisser le " +
                "défilement — et lisse alors aussi l'élection de la focus card."
            )
        }
    }

    // MARK: - 3. Maillon 3 — le relais publie chaque écriture

    /// `ScrollOffsetRelay` ne porte qu'un `CGFloat` et le publie sur `willSet`.
    /// Il n'a ni fenêtre, ni quantification, ni file.
    func test_link3_theRelayPublishesEveryWrite_withNoWindowAndNoQuantisation() throws {
        let code = normalizedCode(try source(Self.relayPath))

        XCTAssertTrue(
            code.contains("public var offset: CGFloat = 0 { willSet { objectWillChange.send() } }"),
            "`ScrollOffsetRelay.offset` ne publie plus inconditionnellement sur `willSet`. " +
            "Toute forme d'écrémage ajoutée ici — fenêtre temporelle, pas minimal en " +
            "points, coalescence — devient la cadence de l'élection de la focus card, " +
            "de la pilule et du header à la fois."
        )
        for primitive in Self.delayPrimitives + ["Task.sleep", "Date("] {
            XCTAssertEqual(
                occurrences(of: primitive, in: code), 0,
                "`ScrollOffsetRelay.swift` contient désormais « \(primitive) ». Ce relais " +
                "doit rester une BOÎTE : il transporte, il ne décide pas quand. Une " +
                "horloge ici est indétectable depuis `Lentille/`, où toutes les gardes " +
                "d'élection regardent."
            )
        }
    }

    // MARK: - 4. Maillon 4 — l'écriture du relais précède toute garde

    /// Dans `ConversationListView`, l'écriture du relais est la PREMIÈRE
    /// instruction du callback — avant le `guard` de recherche. C'est ce qui
    /// fait que l'élection continue de suivre le pouce pendant que d'autres
    /// consommateurs du même callback, eux, se taisent.
    func test_link4_theListWritesTheRelayBeforeAnyEarlyReturn() throws {
        let code = normalizedCode(try source(Self.listPath))

        XCTAssertEqual(
            occurrences(of: "scrollOffsetRelay.offset = offset", in: code), 1,
            "L'écriture du relais doit rester unique et nue. Deux sites d'écriture, ou " +
            "une écriture conditionnelle, et la cadence de l'élection dépendrait de " +
            "l'état de l'écran."
        )
        XCTAssertTrue(
            code.contains("onScrollOffsetChange: { offset in scrollOffsetRelay.offset = offset"),
            "L'écriture du relais n'est plus la PREMIÈRE instruction du callback de " +
            "défilement. Elle doit précéder le `guard !isSearching, !showSearchOverlay` " +
            "qui suit : ce garde-là existe pour la barre du bas (`isScrollingDown`, " +
            "throttlée à 0,15 s exprès), pas pour l'élection. Le faire passer AVANT " +
            "l'écriture gèlerait la focus card dès l'ouverture de la recherche."
        )
    }

    // MARK: - 5. Maillon 5 — un tick, une élection

    /// L'hôte ne temporise pas non plus : il élit sur le tick, point.
    /// (Le compte des points d'entrée, lui, appartient à `FocusCardElectionTests`.)
    func test_link5_theElectionHostAddsNoTimerOfItsOwn() throws {
        let code = normalizedCode(try source(Self.hostPath))

        XCTAssertTrue(
            code.contains(".adaptiveOnChange(of: relay.offset)"),
            "L'hôte n'est plus abonné au tick d'offset. C'est le dernier maillon : " +
            "sans lui, toute la fraîcheur gagnée en amont est perdue."
        )
        for primitive in Self.delayPrimitives + ["Task.sleep", "await", "Date("] {
            XCTAssertEqual(
                occurrences(of: primitive, in: code), 0,
                "`LentilleFocusElectionHost.swift` contient désormais « \(primitive) ». " +
                "L'élection doit rester une fonction du DÉFILEMENT seul (§4.2) : une " +
                "horloge en ferait une fonction du temps, et la carte se remettrait à " +
                "bouger pouce immobile."
            )
        }
    }

    // MARK: - 6. Ce qu'une fenêtre coûterait — la loi chiffrée

    /// Bas de la région visible, en coordonnées globales — même décor que
    /// `FocusCardElectionTests`.
    private static let viewportBottom: CGFloat = 812

    private var focusY: CGFloat {
        LentilleFocusBand.centerY(viewportTop: 0, viewportBottom: Self.viewportBottom, offsetFromTop: Self.viewportBottom)
    }

    /// Pas vertical entre deux rangs — cote du contrat, jamais un nombre choisi ici.
    private var rowPitch: CGFloat { LentilleMetrics.Row.height }

    /// Vitesse de référence : un balayage FRANC du pouce. Elle n'est pas
    /// normative — elle sert de témoin, et elle est délibérément placée bien
    /// au-dessus d'un défilement de lecture pour que la démonstration porte sur
    /// le régime où la cadence compte vraiment.
    private static let briskFlickSpeed: CGFloat = 2000   // points par seconde

    private static let sixtyHertz: CGFloat = 1.0 / 60.0
    private static let oneTwentyHertz: CGFloat = 1.0 / 120.0
    /// Fenêtre hypothétique — celle qu'un « petit debounce » sur le relais
    /// introduirait sans que personne ne le remarque en lisant la Lentille.
    private static let hypotheticalDebounce: CGFloat = 0.1

    /// Nombre de rangs balayés par la simulation — assez pour que la différence
    /// entre « visite chaque rang » et « en saute deux sur trois » soit massive.
    private static let sweptRowCount = 24

    /// Rejoue un défilement à vitesse constante, échantillonné à `tick`, et rend
    /// la suite des élus (sans répétition consécutive). Les rangs défilent vers
    /// le HAUT : leur `midY` décroît, comme sous un pouce qui remonte la liste.
    private func electedSequence(speed: CGFloat, tick: CGFloat, rowCount: Int) -> [String] {
        let ids = (0..<rowCount).map { String(format: "row-%02d", $0) }
        // Marge : le dernier rang doit avoir le temps de FRANCHIR la bande, pas
        // seulement de l'atteindre — l'hystérésis retient le sortant jusqu'à une
        // demi-bande au-delà du centre.
        let duration = CGFloat(rowCount - 1) * rowPitch / speed + 0.25

        var elected: String?
        var sequence: [String] = []
        var step = 0

        while CGFloat(step) * tick <= duration {
            let time = CGFloat(step) * tick
            let candidates = ids.enumerated().map { index, id in
                FocalFocusCurve.RowCandidate(
                    id: id,
                    midY: focusY + CGFloat(index) * rowPitch - speed * time
                )
            }
            elected = LentilleFocusElectionHost.elect(
                candidates: candidates,
                viewportTop: 0,
                viewportBottom: Self.viewportBottom,
                offsetFromTop: Self.viewportBottom,
                currentId: elected
            )
            if let elected, sequence.last != elected { sequence.append(elected) }
            step += 1
        }
        return sequence
    }

    /// Plus grand saut d'indice entre deux élus consécutifs. `1` = la carte a
    /// visité chaque rang ; `n > 1` = elle en a sauté `n − 1`.
    private func largestRowSkip(in sequence: [String]) -> Int {
        let indices = sequence.compactMap { Int($0.dropFirst("row-".count)) }
        guard indices.count > 1 else { return 0 }
        return zip(indices, indices.dropFirst())
            .map { previous, next in next - previous }
            .max() ?? 0
    }

    /// **À la cadence de l'affichage, la carte ne saute AUCUN rang** — ni à
    /// 60 Hz ni à 120 Hz. C'est la promesse du contrat, chiffrée.
    func test_atDisplayCadence_theCardVisitsEveryRow_atBothRefreshRates() {
        for (tick, label) in [(Self.sixtyHertz, "60 Hz"), (Self.oneTwentyHertz, "120 Hz")] {
            let sequence = electedSequence(speed: Self.briskFlickSpeed, tick: tick, rowCount: Self.sweptRowCount)
            XCTAssertEqual(
                largestRowSkip(in: sequence), 1,
                "À \(label), un balayage à \(Int(Self.briskFlickSpeed)) pt/s fait SAUTER des " +
                "rangs à la focus card (plus grand saut observé : " +
                "\(largestRowSkip(in: sequence))). Un tick par frame doit la faire " +
                "descendre rang par rang : c'est ce que « l'élection suit le défilement » " +
                "veut dire à l'œil. Si cette assertion tombe sans qu'aucune garde de " +
                "source n'ait bougé, c'est la LOI qui a changé — hystérésis " +
                "(`FocalFocusCurve.focusBandHalfHeight`) ou pas de rang " +
                "(`LentilleMetrics.Row.height`)."
            )
            XCTAssertEqual(
                Set(sequence).count, Self.sweptRowCount,
                "À \(label), certains des \(Self.sweptRowCount) rangs ne sont JAMAIS élus au cours du " +
                "balayage (\(Set(sequence).count) distincts). Un rang qui traverse la " +
                "bande sans jamais porter la carte est un trou visible dans la descente."
            )
        }
    }

    /// **Témoin de discrimination** (leçon 266) : la même mesure, appliquée à
    /// une fenêtre de 100 ms, ÉCHOUE franchement. Sans ce membre, le test
    /// ci-dessus passerait au vert même si la mesure ne mesurait rien.
    func test_aHundredMillisecondWindowWouldSkipRowsWholesale_soTheGuardDiscriminates() {
        let debounced = electedSequence(
            speed: Self.briskFlickSpeed, tick: Self.hypotheticalDebounce, rowCount: Self.sweptRowCount
        )
        let perFrame = electedSequence(
            speed: Self.briskFlickSpeed, tick: Self.sixtyHertz, rowCount: Self.sweptRowCount
        )

        XCTAssertGreaterThanOrEqual(
            largestRowSkip(in: debounced), 3,
            "Une fenêtre de \(Int(Self.hypotheticalDebounce * 1000)) ms ne dégrade PAS " +
            "l'élection dans cette mesure — donc la mesure ne mesure pas la cadence, et " +
            "le test « à la cadence de l'affichage » qui l'accompagne ne prouve rien. " +
            "Réparer la mesure, jamais assouplir ce seuil."
        )
        // Le seuil est DÉRIVÉ, jamais posé : pendant la fenêtre, le contenu
        // défile de `vitesse × fenêtre` points, soit `… / Row.height` rangs
        // que la carte ne peut pas visiter. Le meilleur cas atteignable est
        // donc `sweptRowCount / rowsPerWindow` rangs distincts — une fraction
        // magique (`count / 2`) aurait basculé au premier changement de cote,
        // ce qu'elle a fait le 2026-08-22 quand la rangée est passée à trois
        // lignes : 3,1 rangs par fenêtre à 64 pt, 2,17 à 92, donc 12 sur 24 au
        // lieu de 8 — la dégradation est intacte, c'était le seuil qui mentait.
        let rowsPerWindow = Double(Self.briskFlickSpeed * Self.hypotheticalDebounce)
            / Double(LentilleMetrics.Row.height)
        let bestReachable = Int((Double(Self.sweptRowCount) / rowsPerWindow).rounded(.up))
        XCTAssertLessThanOrEqual(
            Set(debounced).count, bestReachable,
            "Une fenêtre de \(Int(Self.hypotheticalDebounce * 1000)) ms laisse passer PLUS de rangs " +
            "que la géométrie ne l'autorise (\(Set(debounced).count) visités pour \(bestReachable) " +
            "atteignables au mieux) — la mesure ne mesure donc pas la cadence."
        )
        XCTAssertLessThanOrEqual(
            Set(debounced).count * 2, Set(perFrame).count,
            "Une fenêtre de \(Int(Self.hypotheticalDebounce * 1000)) ms devrait priver la " +
            "carte d'au moins la moitié des rangs (observé : \(Set(debounced).count) sur " +
            "\(Set(perFrame).count) à la cadence de l'affichage). C'est le chiffre qui " +
            "justifie les gardes de source de cette suite : « juste un petit debounce sur " +
            "le relais » n'est jamais petit du côté de la focus card."
        )
    }

    /// La fraîcheur maximale de l'élection, énoncée comme une distance : à
    /// chaque instant, l'élu est au pire en retard de `vitesse × période` points.
    /// Un tick par frame maintient ce retard SOUS l'hystérésis du miroir — donc
    /// sous le seuil qui déclencherait un changement d'élu. Une fenêtre de
    /// 100 ms le fait exploser bien au-delà.
    func test_maximumElectionStaleness_staysUnderTheMirrorsHysteresis_onlyAtFrameCadence() {
        let hysteresis = FocalFocusCurve.focusBandHalfHeight

        for (tick, label) in [(Self.sixtyHertz, "60 Hz"), (Self.oneTwentyHertz, "120 Hz")] {
            let staleness = Self.briskFlickSpeed * tick
            XCTAssertLessThan(
                staleness, hysteresis,
                "À \(label), le retard maximal de l'élection vaut \(staleness) pt — " +
                "au-delà de l'hystérésis du miroir (\(hysteresis) pt). Passé ce seuil, " +
                "l'élu affiché peut être un rang que la bande a déjà quitté : la carte " +
                "« traîne » derrière le pouce au lieu de le suivre."
            )
        }

        let debouncedStaleness = Self.briskFlickSpeed * Self.hypotheticalDebounce
        XCTAssertGreaterThan(
            debouncedStaleness, rowPitch,
            "Une fenêtre de \(Int(Self.hypotheticalDebounce * 1000)) ms devrait produire un " +
            "retard supérieur à la hauteur d'un rang (\(rowPitch) pt) — c'est ce qui rend " +
            "le saut VISIBLE. Si ce n'est plus le cas, les constantes de la loi ont bougé " +
            "et les seuils de cette suite doivent être recalculés, pas relâchés."
        )
    }
}
