import XCTest
@testable import Meeshy

/// Élection de la focus card (contrat LWS-8 / I-070, §4.2).
///
/// **Suite COMPLÉTÉE par I-073.** Ce lot verrouille les trois critères que
/// la tâche nomme, plus ce qui les rend vérifiables :
///
/// 1. **La bande vient du miroir gelé.** `bas de la région visible −
///    FocalFocusCurve.focusBandOffset`, hystérésis =
///    `FocalFocusCurve.focusBandHalfHeight`. Aucune de ces deux cotes ne
///    s'écrit dans la peau, et l'élection elle-même est celle du miroir
///    (`electFocusRow`), jamais une seconde implémentation.
/// 2. **Le gagnant est stable sous oscillation** (critère C-015) : l'hystérésis
///    du miroir absorbe un va-et-vient plus large que le tremblement du pouce,
///    et le témoin non-vacuité prouve qu'elle n'est pas pour autant infinie.
/// 3. **La carte suit le DÉFILEMENT, jamais les événements.** Un `message:new`
///    pouce immobile change la géométrie des rangs sans produire de tick
///    d'offset : l'élu ne bouge pas. Ce fait se prouve en DEUX morceaux — le
///    témoin de comportement ci-dessous (la géométrie change, l'élu tient) et
///    la garde de source qui montre que l'élection n'a QUE deux points
///    d'entrée : le tick d'offset et l'amorçage au montage. Aucun des deux
///    seul ne suffirait (leçon 266 : le défaut vit dans l'espace entre deux
///    suites justes).
///
/// **Choix d'observation (justifié, re-prouvé).** Aucun observateur de
/// défilement NEUF n'est introduit : l'élection s'abonne au relais qui existe
/// déjà (`ScrollOffsetRelay`, écrit par l'unique `onScrollOffsetChange` de
/// `MeeshyRefreshableScroll`), exactement comme `SectionScrollPillHost`
/// (I-063bis) et `ConversationListHeaderOverlay` avant lui. La sonde de
/// géométrie de défilement d'iOS 18 n'aurait rien apporté ici : elle rapporte
/// la géométrie du CONTENEUR, jamais le `midY` des rangs — il aurait donc
/// fallu, en plus, la même mesure de rangs, c'est-à-dire un observateur de
/// plus pour la même information. La garde I-064 reste donc INCHANGÉE, et
/// cette suite l'étend au dossier neuf.
///
/// **I-073 ajoute** : candidats vides ⇒ `nil` ; la garde qui prouve que
/// l'élection ne porte AUCUNE dépendance `#available(iOS 17…)` (elle
/// fonctionne donc là où la perspective, elle, s'arrête) ; la garde qui
/// prouve qu'elle ne lit jamais `reduceMotion` (« élection conservée » est
/// structurel, pas incident).
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN`
/// (`apps/ios/meeshy.sh:1584`) : cette suite reste en phase 1.
final class FocusCardElectionTests: XCTestCase {

    // MARK: - Décor

    /// Bas de la région visible du défilement, en coordonnées globales.
    private static let viewportBottom: CGFloat = 812

    /// Bande au CENTRE de la région visible (2026-08-21) — décor : liste
    /// déjà défilée d'une demi-hauteur (la remontée vers le haut ne joue plus).
    private var band: CGFloat {
        LentilleFocusBand.centerY(viewportTop: 0, viewportBottom: Self.viewportBottom, offsetFromTop: Self.viewportBottom)
    }

    /// Pas vertical entre deux rangs — la cote du contrat (`LentilleMetrics`),
    /// jamais un nombre inventé pour la commodité du test.
    private var rowPitch: CGFloat { LentilleMetrics.Row.height }

    private func elect(_ candidates: [FocalFocusCurve.RowCandidate], current: String?) -> String? {
        LentilleFocusElectionHost.elect(
            candidates: candidates,
            viewportTop: 0,
            viewportBottom: Self.viewportBottom,
            offsetFromTop: Self.viewportBottom,
            currentId: current
        )
    }

    private func candidate(_ id: String, atBandOffset offset: CGFloat) -> FocalFocusCurve.RowCandidate {
        FocalFocusCurve.RowCandidate(id: id, midY: band + offset)
    }

    // MARK: - 1. La bande vient du miroir

    /// Le rang dont le milieu tombe DANS la bande gagne — et la bande est bien
    /// celle du miroir, ancrée au bas de la région visible.
    func test_election_picksTheRowWhoseMidYFallsInTheMirrorsBand() {
        let candidates = [
            candidate("haut", atBandOffset: -4 * rowPitch),
            candidate("dans-la-bande", atBandOffset: 0),
            candidate("bas", atBandOffset: 2 * rowPitch)
        ]

        XCTAssertEqual(
            elect(candidates, current: nil), "dans-la-bande",
            "Le gagnant est le rang le plus proche du centre de la bande (§4.2). Si un " +
            "autre rang l'emporte, la bande n'est pas ancrée où le miroir la place : " +
            "`FocalFocusCurve.focusBandOffset` sous le BAS de la région visible, jamais " +
            "sous le haut ni au milieu de l'écran."
        )
    }

    /// La bande est calculée, pas devinée : le même jeu de candidats élit un
    /// autre rang si la région visible change de hauteur. Sans ce témoin, une
    /// élection qui ignorerait `viewportBottom` (bande figée à une constante)
    /// passerait le test précédent au vert.
    func test_election_followsTheViewportBottom_neverAFixedScreenPosition() {
        let candidates = [
            FocalFocusCurve.RowCandidate(id: "a", midY: band),
            // Bande au CENTRE (2026-08-21) : raccourcir la région visible de 3
            // pas la fait remonter de 1,5 pas — « b », à 2 pas au-dessus, passe
            // devant « a » (0,5 contre 1,5), là où « a » gagnait à pleine hauteur.
            FocalFocusCurve.RowCandidate(id: "b", midY: band - 2 * rowPitch)
        ]

        let shortViewport = Self.viewportBottom - 3 * rowPitch
        let winner = LentilleFocusElectionHost.elect(
            candidates: candidates,
            viewportTop: 0,
            viewportBottom: shortViewport,
            offsetFromTop: shortViewport,
            currentId: nil
        )

        XCTAssertEqual(
            winner, "b",
            "Sur une région visible plus courte, la bande (au centre) remonte de la moitié " +
            "du raccourci et c'est le rang du dessus qui l'occupe. Un gagnant inchangé signalerait une bande " +
            "constante — le défaut exact que le split view iPad et le clavier révèlent " +
            "en production, jamais sur un simulateur au repos."
        )
    }

    /// L'hystérésis passée au miroir est bien sa demi-hauteur de bande, et sa
    /// borne est INCLUSIVE (le miroir documente `<=`). Deux témoins encadrant
    /// la borne : dedans, le courant garde la main ; un point au-delà, il la
    /// perd au profit du plus proche.
    func test_hysteresis_isTheMirrorsHalfBand_withAnInclusiveBound() {
        let half = FocalFocusCurve.focusBandHalfHeight

        let onTheEdge = [
            candidate("sortant", atBandOffset: half),
            candidate("entrant", atBandOffset: 0)
        ]
        XCTAssertEqual(
            elect(onTheEdge, current: "sortant"), "sortant",
            "Sur la borne EXACTE de la bande, le courant garde la main : le miroir " +
            "documente une comparaison inclusive. Un `<` strict ferait clignoter la carte " +
            "sur un rang immobile pile en limite."
        )

        let justPast = [
            candidate("sortant", atBandOffset: half + 1),
            candidate("entrant", atBandOffset: 0)
        ]
        XCTAssertEqual(
            elect(justPast, current: "sortant"), "entrant",
            "Un point au-delà de la bande, le courant la cède au plus proche du centre. " +
            "Sans ce second témoin, une hystérésis INFINIE (le premier élu garde la main " +
            "pour toujours) passerait le témoin précédent au vert."
        )
    }

    // MARK: - 2. Stabilité sous oscillation (C-015)

    /// Critère C-015 : le gagnant est stable sous une oscillation de ±40 px.
    /// Le pouce qui tremble, le rebond d'un `bounce` de fin de liste et le
    /// micro-défilement d'un retour clavier produisent tous ce va-et-vient ;
    /// aucun ne doit faire changer la carte de rang.
    func test_winner_isStableUnderA40PixelOscillation() {
        var current: String? = nil
        let amplitude: CGFloat = 40

        // Position de repos : « b » pile dans la bande, ses voisins un pas au-dessus
        // et un pas au-dessous.
        func snapshot(shiftedBy shift: CGFloat) -> [FocalFocusCurve.RowCandidate] {
            [
                candidate("a", atBandOffset: -rowPitch + shift),
                candidate("b", atBandOffset: shift),
                candidate("c", atBandOffset: rowPitch + shift)
            ]
        }

        current = elect(snapshot(shiftedBy: 0), current: current)
        XCTAssertEqual(current, "b", "Élection initiale : le rang de la bande.")

        for turn in 0..<12 {
            let shift = turn.isMultiple(of: 2) ? amplitude : -amplitude
            current = elect(snapshot(shiftedBy: shift), current: current)
            XCTAssertEqual(
                current, "b",
                "Oscillation ±\(amplitude) px, tour \(turn) : l'élu a changé. L'hystérésis " +
                "du miroir (demi-hauteur de bande) est précisément là pour absorber ce " +
                "va-et-vient — une carte qui saute d'un rang à l'autre sous un pouce " +
                "immobile est le défaut que le critère C-015 interdit."
            )
        }
    }

    /// Non-vacuité de l'hystérésis (leçon 266) : au-delà de l'oscillation, un
    /// vrai défilement DOIT déplacer la carte. Sans ce témoin, une élection
    /// gelée sur son premier gagnant passerait le test précédent au vert.
    func test_aRealScroll_doesMoveTheWinner_soTheHysteresisIsNotInfinite() {
        let atRest = [
            candidate("a", atBandOffset: -rowPitch),
            candidate("b", atBandOffset: 0),
            candidate("c", atBandOffset: rowPitch)
        ]
        let current = elect(atRest, current: nil)
        XCTAssertEqual(current, "b")

        let scrolled = [
            candidate("a", atBandOffset: 0),
            candidate("b", atBandOffset: rowPitch),
            candidate("c", atBandOffset: 2 * rowPitch)
        ]
        XCTAssertEqual(
            elect(scrolled, current: current), "a",
            "Après un défilement d'un rang complet, la carte doit suivre : « a » occupe " +
            "désormais la bande. Une hystérésis qui ne lâche jamais serait pire qu'aucune."
        )
    }

    /// Départage déterministe : à distance égale, l'`id` croissant gagne — et
    /// le résultat ne dépend PAS de l'ordre dans lequel les rangs se sont
    /// enregistrés. Les candidats sortent d'un dictionnaire, dont l'ordre
    /// d'itération n'est pas garanti : sans départage stable, la carte
    /// clignoterait entre deux rangs à égalité d'une frame à l'autre.
    func test_ties_areBrokenDeterministically_whateverTheRegistrationOrder() {
        let first = LentilleFocusCandidateRegistry()
        first.register(id: "zebre", midY: band - rowPitch / 2)
        first.register(id: "alpha", midY: band + rowPitch / 2)

        let second = LentilleFocusCandidateRegistry()
        second.register(id: "alpha", midY: band + rowPitch / 2)
        second.register(id: "zebre", midY: band - rowPitch / 2)

        XCTAssertEqual(
            elect(first.candidates, current: nil),
            elect(second.candidates, current: nil),
            "Deux registres au même contenu, remplis dans deux ordres différents, doivent " +
            "élire le MÊME rang : l'ordre d'itération d'un dictionnaire Swift n'est pas " +
            "stable d'un lancement à l'autre."
        )
        XCTAssertEqual(
            elect(first.candidates, current: nil), "alpha",
            "À égalité de distance, le miroir départage par `id` croissant."
        )
    }

    /// I-073 : « candidats vides ⇒ nil ». Une liste filtrée (recherche sans
    /// résultat, section repliée jusqu'au dernier rang) ne doit jamais faire
    /// planter l'élection ni lui faire inventer un gagnant — le registre vide
    /// est un état ATTEIGNABLE, pas une erreur de programmation.
    func test_election_withNoCandidates_returnsNil() {
        XCTAssertNil(
            elect([], current: nil),
            "Aucun candidat, aucun courant : `nil` — pas de crash, pas de gagnant inventé."
        )
        XCTAssertNil(
            elect([], current: "quelqu-un-de-parti"),
            "Aucun candidat MÊME avec un `currentId` non-nil : le miroir garde `nil` sur " +
            "`candidates.isEmpty`, avant même de chercher le courant parmi les candidats — " +
            "un `currentId` fantôme ne doit pas survivre à une liste vidée."
        )
    }

    // MARK: - 3. Le registre des candidats

    func test_registry_registersUpdatesAndForgetsRows() {
        let registry = LentilleFocusCandidateRegistry()
        registry.register(id: "a", midY: band)
        registry.register(id: "b", midY: band + rowPitch)

        XCTAssertEqual(registry.candidates.count, 2)
        XCTAssertEqual(elect(registry.candidates, current: nil), "a")

        // Le rang se déplace : une seule entrée, mise à jour — jamais un doublon.
        registry.register(id: "a", midY: band + 2 * rowPitch)
        XCTAssertEqual(
            registry.candidates.count, 2,
            "Ré-enregistrer un rang doit METTRE À JOUR sa position, pas ajouter un " +
            "second candidat du même id : deux entrées pour un rang fausseraient toute " +
            "élection ultérieure et fuiraient à chaque frame de défilement."
        )
        XCTAssertEqual(elect(registry.candidates, current: nil), "b")

        registry.unregister(id: "b")
        XCTAssertEqual(
            registry.candidates.map(\.id), ["a"],
            "Un rang sorti de l'écran doit quitter le registre : sinon il resterait " +
            "candidat depuis une position périmée, et la carte pourrait s'élire sur un " +
            "rang qui n'est plus rendu."
        )
    }

    /// Le rang élu sort de l'écran (recyclage du `LazyVStack`) : le miroir
    /// traite un `currentId` absent comme « aucun courant » et ré-élit parmi
    /// les présents. La carte ne reste jamais accrochée à un fantôme.
    func test_electedRowScrolledOff_yieldsToAPresentRow() {
        let registry = LentilleFocusCandidateRegistry()
        registry.register(id: "parti", midY: band)
        let current = elect(registry.candidates, current: nil)
        XCTAssertEqual(current, "parti")

        registry.unregister(id: "parti")
        registry.register(id: "reste", midY: band + rowPitch)

        XCTAssertEqual(
            elect(registry.candidates, current: current), "reste",
            "Le rang élu ayant quitté le registre, l'élection doit repartir des présents."
        )
    }

    // MARK: - 4. La carte suit le DÉFILEMENT, jamais les événements

    /// Critère d'acceptation LWS-8, mot pour mot : « un `message:new` pendant
    /// que le pouce est immobile ne déplace pas la carte ».
    ///
    /// Le scénario : une conversation arrive en tête de liste, tous les rangs
    /// descendent d'un pas. La GÉOMÉTRIE change donc réellement — le registre
    /// est mis à jour par les `GeometryReader` des rangs — mais aucun tick
    /// d'offset n'a lieu, puisque personne n'a défilé. L'élu doit tenir.
    ///
    /// Ce témoin ne vaut QUE couplé à la garde de source
    /// `test_election_hasExactlyTwoEntryPoints_theOffsetTickAndTheMount` :
    /// ici on prouve que l'état ne bouge pas tant que l'élection n'est pas
    /// appelée ; là-bas, que rien d'autre qu'un tick de défilement ne
    /// l'appelle.
    func test_aDataEvent_doesNotMoveTheElectedCard_whileTheThumbIsStill() {
        let registry = LentilleFocusCandidateRegistry()
        registry.register(id: "b", midY: band)
        registry.register(id: "a", midY: band - 3 * rowPitch)

        let election = LentilleFocusElection()
        election.adopt(elect(registry.candidates, current: election.electedId))
        XCTAssertEqual(election.electedId, "b", "Élection initiale, au tick de défilement.")

        // `message:new` : un rang neuf s'insère en tête et pousse les autres
        // vers le bas de trois pas. La géométrie change RÉELLEMENT — les
        // `GeometryReader` des rangs réécrivent le registre — mais personne
        // n'a défilé, donc aucun tick d'offset n'appelle l'élection.
        let push = 3 * rowPitch
        registry.register(id: "neuf", midY: band - 4 * rowPitch + push)
        registry.register(id: "a", midY: band - 3 * rowPitch + push)
        registry.register(id: "b", midY: band + push)

        XCTAssertEqual(
            election.electedId, "b",
            "L'élu a bougé sur un événement de DONNÉES. L'élection ne doit se déclencher " +
            "que sur un tick d'offset : sinon la carte saute sous les yeux de " +
            "l'utilisateur chaque fois qu'un message arrive, alors qu'il n'a pas touché " +
            "l'écran — exactement ce que §4.2 interdit."
        )

        XCTAssertEqual(
            elect(registry.candidates, current: election.electedId), "a",
            "Non-vacuité : la mutation ci-dessus est ÉLECTORALEMENT significative — si " +
            "une élection avait eu lieu, elle aurait donné « a ». Sans ce témoin, un " +
            "registre inchangé rendrait le test précédent vide de sens (leçon 266)."
        )
    }

    /// L'état d'élu est publié à CHAQUE changement, et à eux seuls : une
    /// écriture identique ne doit pas invalider les abonnés (I-071 : la focus
    /// card). C'est la même discipline que `SectionScrollPillHost.applyLaw`.
    func test_election_adoptsOnlyOnChange() {
        let election = LentilleFocusElection()
        XCTAssertNil(election.electedId, "Aucune carte élue avant le premier tick.")

        election.adopt("a")
        XCTAssertEqual(election.electedId, "a")
        election.adopt("a")
        XCTAssertEqual(election.electedId, "a")
        election.adopt(nil)
        XCTAssertNil(
            election.electedId,
            "Une liste vidée (filtre, recherche sans résultat) doit pouvoir RETIRER la " +
            "carte : `adopt(nil)` n'est pas un no-op."
        )
    }

    // MARK: - 5. Gardes de source

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private static var perspectiveDirectory: URL {
        iosRoot.appendingPathComponent("Meeshy/Features/Main/Lentille/Perspective")
    }

    /// Découverte dynamique (leçon 257) — jamais une liste de noms recopiée.
    private func perspectiveSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.perspectiveDirectory,
            includingPropertiesForKeys: nil
        )
        return try entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    private func source(at relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    func test_guardDiscoversAtLeastOnePerspectiveFile_neverSilentlyEmpty() throws {
        XCTAssertFalse(
            try perspectiveSources().isEmpty,
            "La garde n'a chargé AUCUN fichier depuis `\(Self.perspectiveDirectory.path)` " +
            "— elle passerait alors au vert sans rien vérifier (leçon 257)."
        )
    }

    /// **Le choix d'observation, verrouillé.** L'élection réutilise le
    /// détecteur EXISTANT : elle s'abonne au relais d'offset déjà publié. Elle
    /// n'introduit ni sonde de géométrie de défilement, ni `PreferenceKey`, ni
    /// `ScrollViewReader` — c'est l'extension au dossier neuf de la contrainte
    /// que la garde I-064 pose sur `ConversationListView.swift` et
    /// `Lentille/Chrome/`, et la raison pour laquelle cette garde-là n'a PAS
    /// eu besoin d'être modifiée.
    func test_election_introducesNoNewScrollObserver_anywhereInPerspective() throws {
        for source in try perspectiveSources() {
            let code = normalizedCode(source.code)
            for forbidden in ["ScrollViewReader", "onScrollGeometryChange", "PreferenceKey"] {
                XCTAssertEqual(
                    occurrences(of: forbidden, in: code), 0,
                    "\(source.name) introduit « \(forbidden) » : un SECOND canal de mesure " +
                    "du défilement, concurrent du relais existant. La sonde de géométrie " +
                    "d'iOS 18 ne rapporte de toute façon que la géométrie du CONTENEUR, " +
                    "jamais le `midY` des rangs — elle aurait coûté un observateur de plus " +
                    "sans dispenser de la mesure des rangs."
                )
            }
        }

        let hostCode = normalizedCode(try source(at: "Meeshy/Features/Main/Lentille/Perspective/LentilleFocusElectionHost.swift"))
        XCTAssertTrue(
            hostCode.contains("@ObservedObject var relay: ScrollOffsetRelay"),
            "L'hôte doit s'abonner au RELAIS existant — un consommateur de plus sur un " +
            "objet qui publiait déjà, exactement comme `SectionScrollPillHost` (I-063bis) " +
            "et `ConversationListHeaderOverlay` avant lui."
        )
    }

    /// L'élection a EXACTEMENT deux points d'entrée : le tick d'offset et
    /// l'amorçage au montage. C'est la moitié « source » de la preuve que la
    /// carte suit le défilement et non les événements.
    func test_election_hasExactlyTwoEntryPoints_theOffsetTickAndTheMount() throws {
        let hostCode = normalizedCode(try source(at: "Meeshy/Features/Main/Lentille/Perspective/LentilleFocusElectionHost.swift"))

        XCTAssertEqual(
            occurrences(of: "electFromScroll(", in: hostCode), 3,
            "Trois occurrences attendues : la déclaration, l'appel du tick d'offset, " +
            "l'appel d'amorçage au montage. Toute occurrence supplémentaire est un " +
            "déclencheur d'élection de plus — et c'est par là qu'un événement de données " +
            "finirait par déplacer la carte."
        )
        XCTAssertEqual(
            occurrences(of: ".adaptiveOnChange(of: relay.offset)", in: hostCode), 1,
            "Un tick d'offset = une élection. C'est le SEUL abonnement de l'hôte : il ne " +
            "doit observer ni le modèle, ni le registre, ni une horloge."
        )
        XCTAssertEqual(
            occurrences(of: "adaptiveOnChange(of: registry", in: hostCode)
            + occurrences(of: "adaptiveOnChange(of: election", in: hostCode), 0,
            "L'hôte ne doit PAS observer le registre ni l'état d'élu : observer le " +
            "registre, ce serait précisément élire sur un événement de données."
        )
        XCTAssertTrue(
            hostCode.contains("FocalFocusCurve.electFocusRow("),
            "L'élection appartient au miroir GELÉ. Une seconde implémentation côté peau " +
            "diverge au premier ajustement — et c'est la carte, l'élément le plus visible " +
            "de l'écran, qui le montrerait."
        )
        XCTAssertTrue(
            hostCode.contains("hysteresis: FocalFocusCurve.focusBandHalfHeight"),
            "L'hystérésis est la demi-hauteur de bande publiée par le miroir, jamais un " +
            "nombre choisi ici."
        )
        XCTAssertTrue(
            hostCode.contains("focusY: LentilleFocusBand.centerY(viewportTop: viewportTop, viewportBottom: viewportBottom, offsetFromTop: offsetFromTop)"),
            "La bande de l'élection doit être CELLE de la perspective (I-069) : un seul " +
            "`LentilleFocusBand`, sinon la carte s'élit là où la perspective ne pique pas."
        )
    }

    /// I-073 : « iOS 16 (perspective inerte) : élection FONCTIONNE quand même
    /// (le relais est disponible partout) ». `LentillePerspective.swift` garde
    /// son `.visualEffect` derrière `#available(iOS 17.0, *)` (iOS 16 y rend
    /// le rang tel quel) — mais l'élection, elle, ne dépend d'AUCUNE API
    /// iOS 17+ : `GeometryReader`, `ScrollOffsetRelay` et `ObservableObject`
    /// existent depuis toujours sur la cible `16.0` du projet. Témoin de
    /// discrimination (leçon 266) : la perspective PORTE la garde, l'élection
    /// ne la porte PAS — sans le premier membre de la comparaison, une classe
    /// qui ne contiendrait jamais `#available` par accident (fichier vide,
    /// faute de frappe) passerait la moitié « élection » sans rien prouver.
    func test_electionHasNoIOS17AvailabilityGate_soItStillWorksWherePerspectiveGoesInert() throws {
        let perspectiveCode = normalizedCode(try source(at: "Meeshy/Features/Main/Lentille/Perspective/LentillePerspective.swift"))
        XCTAssertTrue(
            perspectiveCode.contains("#available(iOS 17"),
            "Prérequis du témoin : la perspective DOIT porter la garde iOS 17+, sinon la " +
            "comparaison ci-dessous ne discrimine rien."
        )

        for file in ["LentilleFocusElection.swift", "LentilleFocusElectionHost.swift"] {
            let code = normalizedCode(try source(at: "Meeshy/Features/Main/Lentille/Perspective/\(file)"))
            XCTAssertEqual(
                occurrences(of: "#available(iOS", in: code), 0,
                "\(file) porte une garde `#available(iOS …)` : l'élection doit rester " +
                "disponible sur TOUTE la plage de déploiement (16.0+), y compris là où la " +
                "perspective (`.visualEffect`, iOS 17+) est inerte — sinon un utilisateur " +
                "iOS 16 perdrait la focus card en même temps que le fondu, alors que rien " +
                "dans l'élection n'en dépend."
            )
        }
    }

    /// I-073, corollaire du critère « reduce motion ⇒ … élection CONSERVÉE » :
    /// le magasin et l'hôte d'élection ne lisent JAMAIS
    /// `accessibilityReduceMotion`. Ce n'est pas une précaution qu'il faudrait
    /// se souvenir d'appliquer à chaque évolution — c'est une IMPOSSIBILITÉ
    /// structurelle que l'élection réagisse au réglage : elle ne le connaît
    /// pas. `LentillePerspectiveCurveTests` verrouille déjà le symétrique côté
    /// transformation (reduce motion ⇒ identité) ; ce témoin verrouille le
    /// fait que l'élection, elle, n'a même pas la donnée pour varier.
    func test_electionNeverReadsReduceMotion_conservationIsStructuralNotIncidental() throws {
        for file in ["LentilleFocusElection.swift", "LentilleFocusElectionHost.swift"] {
            let code = normalizedCode(try source(at: "Meeshy/Features/Main/Lentille/Perspective/\(file)"))
            for forbidden in ["reduceMotion", "accessibilityReduceMotion"] {
                XCTAssertEqual(
                    occurrences(of: forbidden, in: code), 0,
                    "\(file) référence « \(forbidden) » : l'élection ne doit dépendre du " +
                    "réglage sous AUCUNE forme — « élection conservée » (LWS-8) est garanti " +
                    "par l'ABSENCE de cette dépendance, pas par un `if` qui pourrait un jour " +
                    "être inversé par erreur."
                )
            }
        }
    }

    /// L'écriture de l'élu est gardée par l'inégalité — la même discipline que
    /// `SectionScrollPillHost.applyLaw`. Le comportement est couvert par
    /// `test_election_adoptsOnlyOnChange` ; la FORME l'est ici, parce qu'un
    /// test de comportement ne peut pas voir une invalidation SwiftUI de trop.
    func test_electedState_isPublishedOnlyOnChange() throws {
        let storeCode = normalizedCode(try source(at: "Meeshy/Features/Main/Lentille/Perspective/LentilleFocusElection.swift"))

        XCTAssertTrue(
            storeCode.contains("guard id != electedId else { return }"),
            "`adopt` doit sortir sans écrire quand la valeur est identique : à ~120 Hz, " +
            "une écriture inconditionnelle publierait ~120 invalidations par seconde à " +
            "tous les abonnés de la carte, pour zéro changement visible."
        )
        XCTAssertTrue(
            storeCode.contains("willSet { objectWillChange.send() }"),
            "Publication sur `willSet`, comme `ScrollOffsetRelay` : `@Published` est " +
            "refusé sur une propriété d'un type `nonisolated`, et l'annotation doit vivre " +
            "sur le TYPE pour désisoler la `deinit`."
        )
        XCTAssertTrue(
            storeCode.contains("nonisolated final class LentilleFocusElection: ObservableObject"),
            "`nonisolated` sur le TYPE — sans cela, Swift 6.2 dote la `deinit` d'une " +
            "isolation `@MainActor` et le shim de rétro-déploiement libère deux fois le " +
            "scope task-local : le démontage de la liste tuait le processus " +
            "(cf. la note de `ScrollOffsetRelay`, même famille d'objet, même piège)."
        )
    }

    /// L'état d'élu vit dans l'hôte dédié et son magasin — JAMAIS dans le body
    /// de la liste. L'y porter re-diffuserait tous les rangs à chaque tick :
    /// le défaut même que `ScrollOffsetRelay` a été créé pour éliminer.
    func test_electedState_neverLivesInTheListBody() throws {
        let listCode = normalizedCode(try source(at: "Meeshy/Features/Main/Views/ConversationListView.swift"))

        XCTAssertEqual(
            occurrences(of: "FocalFocusCurve", in: listCode), 0,
            "La liste ne doit connaître NI la courbe NI l'électeur : elle monte un hôte, " +
            "c'est tout. Le jour où l'élection s'écrit dans ce fichier, elle s'écrit dans " +
            "un body qui se ré-exécute pour ~99 rangs."
        )
        XCTAssertEqual(
            occurrences(of: "electFocusRow", in: listCode), 0,
            "Aucun appel à l'électeur depuis le body de la liste."
        )
        XCTAssertTrue(
            listCode.contains("@State private var focusElection = LentilleFocusElection()"),
            "Le magasin est retenu par un `@State` — une RÉFÉRENCE stable sans " +
            "abonnement, exactement comme `scrollOffsetRelay` et `sectionFrameRegistry`. " +
            "Un `@StateObject` ou un `@ObservedObject` ici abonnerait le body entier au " +
            "rythme de l'élection."
        )
        XCTAssertEqual(
            occurrences(of: "focusElection.electedId", in: listCode), 0,
            "Le body de la liste ne LIT jamais l'élu : il déclare le magasin et le passe " +
            "à l'hôte, rien de plus. Le lire ici abonnerait la liste au rythme de " +
            "l'élection — les trois consommateurs du relais (header, pilule, élection) " +
            "s'abonnent chacun dans LEUR hôte, jamais dans ce body."
        )
        XCTAssertEqual(
            occurrences(of: "@ObservedObject private var focusElection", in: listCode)
            + occurrences(of: "@StateObject private var focusElection", in: listCode), 0,
            "Le magasin d'élection ne doit être ni observé ni possédé comme objet " +
            "d'état par la liste : `@State` retient la référence SANS s'abonner."
        )
    }

    // MARK: - 6. Montage

    func test_conversationList_mountsTheElectionHostOnce_behindTheFlag() throws {
        let listCode = normalizedCode(try source(at: "Meeshy/Features/Main/Views/ConversationListView.swift"))

        XCTAssertEqual(
            occurrences(of: "LentilleFocusElectionHost(", in: listCode), 1,
            "UN seul hôte d'élection : deux hôtes, ce sont deux élections concurrentes " +
            "sur le même magasin, donc une carte qui tremble sans raison visible."
        )
        XCTAssertTrue(
            listCode.contains("if LentilleFeatureFlag.isLentilleListEnabled { LentilleFocusElectionHost("),
            "L'hôte doit être monté DERRIÈRE son propre drapeau (leçon 257, corollaire de " +
            "portée : une garde de montage doit vérifier la condition, pas seulement la " +
            "présence — brancher en dur allumerait la Lentille pour tout le monde)."
        )
        XCTAssertEqual(
            occurrences(of: ".lentilleFocusCandidate(id: conversation.id, registry: focusCandidateRegistry, isEnabled: perspectiveEnabled)", in: listCode), 1,
            "Les rangs se portent candidats en UN seul site, avec le drapeau déjà résolu " +
            "par section — jamais relu dans le corps d'un rang."
        )
        XCTAssertTrue(
            listCode.contains("@State private var focusCandidateRegistry = LentilleFocusCandidateRegistry()"),
            "Le registre est une boîte INERTE retenue par `@State` : les " +
            "`GeometryReader` des rangs y écrivent à chaque layout sans déclencher la " +
            "moindre invalidation — même patron que `sectionFrameRegistry`."
        )
    }

    /// Drapeau OFF ⇒ ni candidature, ni hôte : le rang est rendu NU et
    /// l'élection n'existe pas. Un `GeometryReader` monté-mais-inerte sur
    /// chaque rang coûterait une mesure par rang et par frame pour rien.
    func test_candidateModifier_isNotEvenMounted_whenTheFlagIsOff() throws {
        let joined = try perspectiveSources().map { normalizedCode($0.code) }.joined(separator: " ")

        XCTAssertTrue(
            joined.contains("func lentilleFocusCandidate( id: String, registry: LentilleFocusCandidateRegistry, isEnabled: Bool ) -> some View { if isEnabled {"),
            "Le point d'entrée de candidature doit être un `@ViewBuilder` à deux branches, " +
            "gardé par le drapeau déjà résolu."
        )
        XCTAssertTrue(
            joined.contains("} else { self } }"),
            "Sous drapeau OFF, le rang doit être rendu NU — pas enveloppé dans un " +
            "`background` de mesure inerte."
        )
    }
}
