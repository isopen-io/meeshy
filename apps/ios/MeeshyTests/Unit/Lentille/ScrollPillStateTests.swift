import XCTest
import MeeshySDK
@testable import Meeshy

/// Pilule de section et rail vivants (contrat LWS-6, travaux 4-5) : le
/// MONTAGE, pas les vues — celles-ci sont couvertes par I-061
/// (`SectionScrollPillTests`).
///
/// Ce que ce fichier garde tient en une phrase : *la pilule est branchée sur
/// le signal qui existe déjà, sa visibilité est décidée par la loi partagée, et
/// les deux vues sont réellement montées — chacune derrière SA condition*.
/// Leçon 257 : une vue déclarée, compilée, testée unitairement et jamais
/// montée ne fait rougir aucune suite. Une garde de montage doit donc vérifier
/// (a) qu'elle est montée et (b) qu'elle l'est derrière sa propre condition —
/// monter en dur satisferait (a) tout en allumant la Lentille pour tout le
/// monde, le défaut inverse et pire.
///
/// Suite ouverte : LWS-6/I-064 la complète.
final class ScrollPillStateTests: XCTestCase {

    // MARK: - Source

    private func source(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// L'UNITÉ de la liste (`ConversationListView.swift` + `ConversationListView+*.swift`) : le rail de
    /// stories, la queue et les feuilles vivent dans leurs fichiers, et les gardes négatives
    /// ci-dessous doivent les balayer aussi.
    private func listViewSource() throws -> String {
        try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView.swift")
    }

    private func pillHostSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Lentille/Chrome/SectionScrollPillHost.swift")
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

    // MARK: - Un seul détecteur, un consommateur de plus

    func test_noNewScrollObserver_isIntroducedByTheLentilleChrome() throws {
        let view = normalizedCode(try listViewSource())
        let host = normalizedCode(try pillHostSource())

        for (file, code) in [("ConversationListView.swift", view), ("SectionScrollPillHost.swift", host)] {
            for forbidden in ["ScrollViewReader", "onScrollGeometryChange", "PreferenceKey"] {
                XCTAssertEqual(
                    occurrences(of: forbidden, in: code), 0,
                    "`\(forbidden)` est apparu dans \(file) : la pilule doit réutiliser le " +
                    "détecteur EXISTANT (contrat LWS-6 travail 4, « un seul détecteur — aucun " +
                    "observateur de scroll nouveau »). Un second observateur ne casse rien de " +
                    "visible : il double le coût du défilement et fait diverger deux vérités."
                )
            }
        }

        XCTAssertEqual(
            occurrences(of: "onScrollOffsetChange:", in: view), 1,
            "Le détecteur doit rester UNIQUE — l'`onScrollOffsetChange` de " +
            "`MeeshyRefreshableScroll`, qui écrit `scrollOffsetRelay` ET dérive " +
            "`isScrollingDown`."
        )
        XCTAssertEqual(
            occurrences(of: "adaptiveOnChange(of: isScrollingDown)", in: view), 1,
            "Un seul observateur d'`isScrollingDown` — celui qui existait."
        )
        XCTAssertTrue(
            // #10841 : la barre qui s'escamote rend le FOCUS (la bande des
            // communautés le suit) au lieu de fermer la bande à côté de lui.
            view.contains("adaptiveOnChange(of: isScrollingDown) { wasHidden, isHidden in if !wasHidden && isHidden { isSearching = false } }"),
            "Le signal booléen ne pilote PLUS la pilule (arbitrage I-063bis) : il ne bascule " +
            "qu'aux changements de direction, sous hystérésis, et il est remis à false par " +
            "programme (filtre, feed). Le brancher là donnait « une fenêtre après la dernière " +
            "bascule », pas « une fenêtre après l'ARRÊT ». Il reste ce qu'il était pour la " +
            "barre du bas et les boutons flottants."
        )
        XCTAssertTrue(
            host.contains("@ObservedObject var relay: ScrollOffsetRelay"),
            "La pilule s'abonne au RELAIS existant — un consommateur de plus sur un objet qui " +
            "publiait déjà, exactement comme `ConversationListHeaderOverlay`."
        )
        XCTAssertTrue(
            host.contains(".adaptiveOnChange(of: relay.offset) { _, _ in noteScrollEvent() }"),
            "Un tick d'offset = un événement de défilement pour la loi. C'est ce qui donne à " +
            "la pilule un ARRÊT observable, là où `isScrollingDown` n'a que des bascules."
        )
        XCTAssertEqual(
            occurrences(of: "ScrollTimePillLaw", in: view), 0,
            "L'état de la loi ne doit PAS vivre dans le body de la liste : l'y porter " +
            "re-diffuserait ~99 rangs à chaque tick — le défaut même que `ScrollOffsetRelay` " +
            "a été créé pour éliminer. Il vit dans l'hôte nominal."
        )
    }

    // MARK: - La loi décide, la peau recopie

    func test_pillVisibility_isDelegatedToTheSharedLaw_neverReimplemented() throws {
        let code = normalizedCode(try pillHostSource())

        XCTAssertTrue(
            code.contains("activity = ScrollTimePillLaw.reduce(state: activity, event: .scrolled(at: instant))"),
            "Chaque tick d'offset doit entrer dans la loi comme un `.scrolled` — c'est elle " +
            "qui réarme, jamais la vue."
        )
        XCTAssertTrue(
            code.contains("let visible = ScrollTimePillLaw.isVisible(state: activity, at: instant)"),
            "La visibilité doit être DEMANDÉE à la loi (`isVisible`), jamais calculée ici : " +
            "critère LWS-6 « loi LWS-0, pas une réimplémentation »."
        )
        XCTAssertTrue(
            code.contains("event: .tick(at: now)"),
            "Le re-sondage passe un `.tick` : il redemande la visibilité SANS réarmer (un " +
            "`.scrolled` de sonde ferait vivre la pilule pour toujours)."
        )
        XCTAssertEqual(
            occurrences(of: "900", in: code), 0,
            "La fenêtre de persistance ne s'écrit NULLE PART dans la peau (garde R15) : sa " +
            "seule maison est `SCROLL_ACTIVITY_LINGER_MS` (packages/shared), mirroré par " +
            "`ScrollTimePillLaw.lingerMs`."
        )
        XCTAssertTrue(
            code.contains("guard !probeScheduled else { return }"),
            "Une seule sonde en vol : sans ce verrou, un défilement de 60 ticks/s armerait " +
            "60 `Task` dormantes par seconde pour un seul effacement à venir."
        )
    }

    /// L'ARRÊT, pas la dernière bascule : la sonde se replace toujours sur
    /// l'échéance de la fenêtre COURANTE, donc un défilement survenu entre
    /// temps la repousse d'autant, et la pilule s'efface une fenêtre après le
    /// DERNIER événement. Le test compare à la loi, jamais à un nombre — il
    /// reste vrai si la fenêtre partagée change.
    func test_probeDelay_tracksTheEndOfScrolling_notTheFirstEvent() {
        let start = ScrollTimePillLaw.initialState()
        XCTAssertEqual(
            SectionScrollPillHost.probeDelayMs(state: start, at: 5_000), 0,
            "Aucun défilement observé ⇒ rien à sonder (et rien à effacer)."
        )

        let firstScroll = 1_000.0
        var state = ScrollTimePillLaw.reduce(state: start, event: .scrolled(at: firstScroll))
        XCTAssertEqual(
            SectionScrollPillHost.probeDelayMs(state: state, at: firstScroll),
            ScrollTimePillLaw.lingerMs,
            "Juste après un défilement, l'échéance est une fenêtre plus loin."
        )

        // Le défilement CONTINUE : 300 ms plus tard, un nouvel événement.
        let secondScroll = firstScroll + 300
        state = ScrollTimePillLaw.reduce(state: state, event: .scrolled(at: secondScroll))
        XCTAssertEqual(
            SectionScrollPillHost.probeDelayMs(state: state, at: secondScroll),
            ScrollTimePillLaw.lingerMs,
            "Chaque événement repousse l'échéance : la pilule ne peut pas s'effacer PENDANT " +
            "qu'on défile — c'est la différence entre « après l'arrêt » et « après la " +
            "dernière bascule de direction »."
        )
        XCTAssertTrue(
            ScrollTimePillLaw.isVisible(state: state, at: firstScroll + ScrollTimePillLaw.lingerMs),
            "À l'échéance du PREMIER événement, un défilement plus récent la garde visible."
        )

        // Sonde à l'échéance courante : la fenêtre est écoulée.
        let deadline = secondScroll + ScrollTimePillLaw.lingerMs
        XCTAssertEqual(
            SectionScrollPillHost.probeDelayMs(state: state, at: deadline), 0,
            "À l'échéance, plus rien à attendre — la sonde ne se réarme pas."
        )
        XCTAssertFalse(
            ScrollTimePillLaw.isVisible(state: state, at: deadline),
            "Une fenêtre après le DERNIER défilement : invisible."
        )
    }

    /// Sémantique attendue de bout en bout, telle que la peau la consomme :
    /// invisible à l'ouverture, visible au premier événement, invisible à la
    /// borne (fenêtre semi-ouverte). Ce test ne réimplémente pas la loi — il
    /// vérifie que la SÉQUENCE que la vue lui fait jouer produit bien le
    /// comportement du critère.
    func test_pillLifecycle_invisibleThenVisibleThenGoneAtTheWindowBound() {
        let start = ScrollTimePillLaw.initialState()
        XCTAssertFalse(
            ScrollTimePillLaw.isVisible(state: start, at: 1_000),
            "À l'ouverture, aucun défilement n'a eu lieu : la pilule est invisible."
        )

        let scrolledAt = 1_000.0
        let scrolled = ScrollTimePillLaw.reduce(state: start, event: .scrolled(at: scrolledAt))
        XCTAssertTrue(
            ScrollTimePillLaw.isVisible(state: scrolled, at: scrolledAt),
            "Premier événement de défilement ⇒ visible."
        )

        let probed = ScrollTimePillLaw.reduce(state: scrolled, event: .tick(at: scrolledAt + ScrollTimePillLaw.lingerMs))
        XCTAssertEqual(
            probed, scrolled,
            "Le `.tick` de la sonde ne doit RIEN faire avancer — sinon la pilule ne " +
            "s'effacerait jamais."
        )
        XCTAssertFalse(
            ScrollTimePillLaw.isVisible(state: probed, at: scrolledAt + ScrollTimePillLaw.lingerMs),
            "À la borne pile (une fenêtre après le dernier défilement), la pilule est déjà " +
            "invisible — c'est ce que la sonde `Task.sleep(lingerMs)` vient constater."
        )
    }

    /// Précision de borne (contrat I-064 : « tick(t+0.899) visible,
    /// tick(t+0.901) invisible » — 899/901 ms autour d'une fenêtre de
    /// 900 ms). Exprimé relativement à `ScrollTimePillLaw.lingerMs`, jamais
    /// par un nombre recopié : ce test reste vrai si la fenêtre partagée
    /// change un jour (garde R15 — packages/shared reste le seul domicile de
    /// `SCROLL_ACTIVITY_LINGER_MS`). R6 (contrat §5) : « 900 ms après
    /// l'arrêt → invisible » — ce sont les deux tickets les plus proches de
    /// la borne semi-ouverte que la loi documente elle-même.
    func test_pillVisibility_isVisibleOneMsBeforeTheBound_andInvisibleOneMsAfter() {
        let start = ScrollTimePillLaw.initialState()
        let scrolledAt = 2_000.0
        let scrolled = ScrollTimePillLaw.reduce(state: start, event: .scrolled(at: scrolledAt))

        let justBeforeBound = scrolledAt + ScrollTimePillLaw.lingerMs - 1
        let tickedJustBefore = ScrollTimePillLaw.reduce(state: scrolled, event: .tick(at: justBeforeBound))
        XCTAssertTrue(
            ScrollTimePillLaw.isVisible(state: tickedJustBefore, at: justBeforeBound),
            "À `lingerMs - 1` ms après le défilement, la fenêtre n'est pas encore écoulée : " +
            "un `.tick` de sonde à cet instant doit encore trouver la pilule visible."
        )

        let justAfterBound = scrolledAt + ScrollTimePillLaw.lingerMs + 1
        let tickedJustAfter = ScrollTimePillLaw.reduce(state: scrolled, event: .tick(at: justAfterBound))
        XCTAssertFalse(
            ScrollTimePillLaw.isVisible(state: tickedJustAfter, at: justAfterBound),
            "À `lingerMs + 1` ms, la fenêtre est écoulée depuis 1 ms : la pilule est déjà " +
            "invisible — la borne `[lastScrolledAt, lastScrolledAt + lingerMs)` est bien " +
            "semi-ouverte, pas arrondie."
        )
    }

    /// Réarmement par `.scrolled` intercalé, sur la machine BRUTE de la loi
    /// (`reduce`/`isVisible`), pas seulement sur `probeDelayMs` (déjà couvert
    /// par `test_probeDelay_tracksTheEndOfScrolling_notTheFirstEvent`) : un
    /// défilement survenu AVANT l'échéance d'origine repousse cette échéance,
    /// et la pilule reste visible à l'instant où elle aurait dû s'effacer.
    func test_interleavedScroll_rearmsTheWindow_keepingThePillVisibleAtTheOriginalBound() {
        let start = ScrollTimePillLaw.initialState()
        let firstScroll = 10_000.0
        var state = ScrollTimePillLaw.reduce(state: start, event: .scrolled(at: firstScroll))

        let originalBound = firstScroll + ScrollTimePillLaw.lingerMs
        let interleavedScroll = originalBound - 100   // survient AVANT l'échéance d'origine
        state = ScrollTimePillLaw.reduce(state: state, event: .scrolled(at: interleavedScroll))

        XCTAssertTrue(
            ScrollTimePillLaw.isVisible(state: state, at: originalBound),
            "Un `.scrolled` intercalé avant l'échéance d'origine réarme la fenêtre : à cette " +
            "échéance-LÀ, un défilement plus récent a eu lieu entre-temps, la pilule doit " +
            "rester visible."
        )

        let newBound = interleavedScroll + ScrollTimePillLaw.lingerMs
        XCTAssertFalse(
            ScrollTimePillLaw.isVisible(state: state, at: newBound),
            "Une fenêtre après le SECOND (dernier) défilement — pas le premier — la pilule " +
            "est enfin invisible : « après l'arrêt », pas « après la première bascule »."
        )
    }

    func test_timestamp_isInMilliseconds_theUnitTheLawExpects() {
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        XCTAssertEqual(
            SectionScrollPillHost.timestamp(date),
            1_700_000_000_000,
            "La loi raisonne en MILLISECONDES (miroir du TS). Injecter des secondes " +
            "rendrait la fenêtre 1000 fois trop longue — la pilule ne s'effacerait " +
            "jamais, et aucun test de la loi ne le verrait."
        )
    }

    // MARK: - Libellé de la pilule

    func test_sectionPillTitle_isNilWhenThereIsNoSectionToName() {
        XCTAssertNil(
            ConversationListView.sectionPillTitle(visibleSectionId: "work", sections: []),
            "Liste vide : aucune pilule à afficher."
        )
    }

    func test_sectionPillTitle_namesTheVisibleSection() {
        let sections = [
            MeeshyConversationSection.pinned,
            LentilleSectionIdentity.section(for: .today),
            LentilleSectionIdentity.section(for: .older)
        ]

        XCTAssertEqual(
            ConversationListView.sectionPillTitle(
                visibleSectionId: LentilleSectionIdentity.olderId,
                sections: sections
            ),
            LentilleSticker.displayTitle(LentilleSectionIdentity.section(for: .older).name),
            "La pilule nomme la section dont les rangs viennent d'entrer à l'écran, criée " +
            "par la MÊME fonction que le sticker (`LentilleSticker.displayTitle`) — deux " +
            "transformations parallèles dériveraient. Valeur attendue résolue via CETTE " +
            "MÊME fonction (locale-agnostique par construction), jamais une chaîne " +
            "française recopiée en dur qui romprait sous la locale `en` du CI."
        )
    }

    func test_sectionPillTitle_fallsBackToTheFirstSection_whenNothingSeenYet() {
        let sections = [MeeshyConversationSection.pinned, LentilleSectionIdentity.section(for: .today)]

        XCTAssertEqual(
            ConversationListView.sectionPillTitle(visibleSectionId: nil, sections: sections),
            LentilleSticker.displayTitle(MeeshyConversationSection.pinned.name),
            "Avant tout `onAppear` de rang (ouverture), la pilule nomme la première section " +
            "rendue — jamais une chaîne vide."
        )
        XCTAssertEqual(
            ConversationListView.sectionPillTitle(visibleSectionId: "section-disparue", sections: sections),
            LentilleSticker.displayTitle(MeeshyConversationSection.pinned.name),
            "Une section qui a disparu du groupement (filtre, suppression de catégorie) ne " +
            "doit pas laisser la pilule sans texte."
        )
    }

    // MARK: - Section ÉPINGLÉE (2026-08-21) — celle qui TIENT la ligne d'épinglage

    /// Un `LazyVStack(pinnedViews:)` garde un moment le sticker POUSSÉ par le
    /// suivant au-dessus de la ligne (minY < ligne) avant de le démonter : le
    /// « plus haut à l'écran » nommait alors une section déjà passée
    /// (« AUJOURD'HUI » affiché sous « PLUS ANCIEN » épinglé, simulateur
    /// 2026-08-21). L'épinglé est le sticker le plus BAS parmi ceux situés à la
    /// ligne ou au-dessus — celui qui la tient.
    func test_pinnedSectionId_isTheStickerHoldingTheLine_notAStaleOnePushedAbove() {
        let positions: [String: CGFloat] = ["today": 40, "week": 82, "older": 122, "much-older": 380]
        XCTAssertEqual(
            LentilleSectionPositionRegistry.pinnedSectionId(positions: positions, pinLine: 122),
            "older",
            "Deux stickers périmés dorment encore au-dessus de la ligne : la pilule nomme " +
            "celui qui TIENT la ligne, jamais le plus haut."
        )
    }

    func test_pinnedSectionId_duringAPush_staysOnThePushedSticker_untilTheNextReachesTheLine() {
        let pinLine: CGFloat = 122
        let pushing: [String: CGFloat] = ["today": 110, "week": 150]
        XCTAssertEqual(
            LentilleSectionPositionRegistry.pinnedSectionId(positions: pushing, pinLine: pinLine),
            "today",
            "Pendant la poussée, le sticker poussé (déjà un peu au-dessus de la ligne) reste " +
            "l'épinglé tant que le suivant n'a pas atteint la ligne."
        )
        let arrived: [String: CGFloat] = ["today": 82, "week": 122]
        XCTAssertEqual(
            LentilleSectionPositionRegistry.pinnedSectionId(positions: arrived, pinLine: pinLine),
            "week",
            "Le suivant a atteint la ligne : c'est lui l'épinglé."
        )
    }

    func test_pinnedSectionId_atTheTopOfTheList_namesTheFirstUpcomingSticker() {
        let positions: [String: CGFloat] = ["today": 200, "week": 420]
        XCTAssertEqual(
            LentilleSectionPositionRegistry.pinnedSectionId(positions: positions, pinLine: 122),
            "today",
            "Aucun sticker à la ligne (liste au repos en haut) : la pilule nomme la section " +
            "du haut de l'écran, la première à venir."
        )
    }

    func test_pinnedSectionId_toleratesSubpointRounding_atTheLine() {
        let positions: [String: CGFloat] = ["today": 60, "week": 122.4]
        XCTAssertEqual(
            LentilleSectionPositionRegistry.pinnedSectionId(positions: positions, pinLine: 122),
            "week",
            "Une fraction de point au-dessus de la ligne (arrondi de layout) est « à la ligne »."
        )
    }

    func test_pinnedSectionId_withoutAMeasuredLine_fallsBackToTheTopmostSticker() {
        let positions: [String: CGFloat] = ["today": 40, "older": 122]
        XCTAssertEqual(
            LentilleSectionPositionRegistry.pinnedSectionId(positions: positions, pinLine: nil),
            "today",
            "Ligne pas encore mesurée (premier layout) : règle historique, le plus haut."
        )
        XCTAssertNil(
            LentilleSectionPositionRegistry.pinnedSectionId(positions: [:], pinLine: 122),
            "Aucun sticker monté : aucun épinglé."
        )
    }

    func test_registry_keepsTheLastMeasuredPinLine() {
        let registry = LentilleSectionPositionRegistry()
        XCTAssertNil(registry.pinLine, "Rien mesuré : pas de ligne.")
        registry.registerPinLine(122)
        XCTAssertEqual(registry.pinLine, 122)
        registry.registerPinLine(138)
        XCTAssertEqual(registry.pinLine, 138, "La dernière mesure gagne (rotation, header).")
    }

    // MARK: - Montage : déclaré == monté, chacun derrière SA condition (leçon 257)

    // MARK: - PIERRE TOMBALE — `test_sectionScrollPill_isMountedExactlyOnce_behindTheFlag`
    //
    // Cette garde exigeait que la pilule de section soit MONTÉE dans la liste.
    // Elle est retirée le 2026-08-23 parce que le produit a retiré la pilule,
    // pas parce qu'elle gênait : directive de `463547f5d` — « on n'a pas besoin
    // de sticker de section central, car les sections stick sur place quand on
    // les dépasse ». Le doublon y est mesuré au simulateur : sticker
    // « MEESHY TEAM » à (0, 122.0, 402×21.3) et capsule portant le MÊME mot à
    // (160.0, 130.0, 82×13.3) — 81 % de recouvrement de la bande, pour zéro
    // information supplémentaire.
    //
    // Elle était rouge sur `main` depuis, et son message accusait à tort le
    // câblage (« I-061 l'avait écrite et testée sans la monter : une vue juste,
    // compilée, invisible ») — vrai à l'époque d'I-061, faux depuis que le
    // démontage est devenu la décision.
    //
    // **Ce qui protège encore cette surface**, et pourquoi la retirer ne perd
    // rien : `SectionScrollPillTests` (5 témoins) couvre la vue elle-même, et
    // la loi de défilement de ce fichier — `ScrollTimePillLaw` — reste
    // intégralement testée ci-dessus. Ne pas rétablir `sectionScrollPillOverlay`
    // sans ré-amender d'abord la directive de `463547f5d`.

    // MARK: - Un seul rail de stories, le même que le fil (#11033)

    /// La liste montait sa JUMELLE (`StoriesVivantsRail`) pendant que le fil
    /// montait `StoryTrayView` : la jumelle ne peignait ni le contour équipé,
    /// ni la présence, ni les menus de l'avatar. Le rail est désormais le MÊME
    /// composant aux deux emplacements, et la jumelle n'existe plus.
    func test_conversationList_mountsTheFeedStoryTray_andNoTwinRail() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertEqual(
            occurrences(of: "StoryTrayView(", in: code), 1,
            "La liste monte `StoryTrayView` — le composant du fil — une fois, sans condition."
        )
        XCTAssertEqual(
            occurrences(of: "StoriesVivantsRail", in: code), 0,
            "La jumelle du rail ne revient pas dans la liste."
        )
        XCTAssertFalse(
            code.contains("LentilleFeatureFlag.isLentilleListEnabled { StoryTrayView(")
                || code.contains("} else { StoryTrayView("),
            "Le rail ne dépend d'aucun drapeau : le même composant aux deux emplacements."
        )
        XCTAssertEqual(
            occurrences(of: "onStoryViewRequest?(userId, true)", in: code), 2,
            "Le tap story suit le MÊME chemin sur le tray et sur `PinnedStoryTrailBand`."
        )
        XCTAssertTrue(
            code.contains("PinnedStoryTrailBand( viewModel: storyViewModel, scrollOffset: offset, onViewStory: { userId in onStoryViewRequest?(userId, true) } )"),
            "`PinnedStoryTrailBand` : inchangé."
        )
        XCTAssertEqual(
            occurrences(of: "showStatusComposer = true", in: code), 2,
            "L'ajout de statut ouvre la sheet que la liste héberge — un site pour le tray, un " +
            "pour l'accès rapide « Poser un mood » de la queue de liste."
        )
    }

    func test_twinRailSource_isDeleted() {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Lentille/Chrome/StoriesVivantsRail.swift")
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: url.path),
            "`StoriesVivantsRail.swift` est la jumelle du rail de stories : supprimée (#11033)."
        )
    }

    func test_feedHosts_mountTheSameStoryTray() throws {
        let iPhoneFeed = normalizedCode(try source(at: "Meeshy/Features/Main/Views/RootViewComponents.swift"))
        let iPadFeed = normalizedCode(try source(at: "Meeshy/Features/Main/Views/FeedView.swift"))

        XCTAssertEqual(occurrences(of: "StoryTrayView(", in: iPhoneFeed), 1, "Le fil iPhone monte `StoryTrayView`.")
        XCTAssertEqual(occurrences(of: "StoryTrayView(", in: iPadFeed), 1, "Le fil iPad monte `StoryTrayView`.")
    }
}
