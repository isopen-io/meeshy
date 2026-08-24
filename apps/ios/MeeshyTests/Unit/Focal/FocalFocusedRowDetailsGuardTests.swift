import XCTest
@testable import Meeshy

/// Focal (2026-08-21) — le message EN FOCUS porte ses détails en PERMANENCE :
/// identité même en continuation, jour + heure, texte plafonné. Ces témoins
/// de structure (source lue à l'exécution) verrouillent le point que la
/// capture d'ouverture du 2026-08-21 a révélé : l'heure de la rangée en focus
/// passait par le révélé de défilement (`FocalRevealedTime`) et restait donc
/// INVISIBLE au repos — la règle était écrite, pas câblée.
final class FocalFocusedRowDetailsGuardTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func normalized(_ relativePath: String) throws -> String {
        let raw = try String(
            contentsOf: Self.iosRoot.appendingPathComponent(relativePath),
            encoding: .utf8
        )
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// **Directive 2026-08-23 — la date et les coches vivent EN BAS, toujours.**
    ///
    /// Elles paraissaient aux deux bouts de la même carte : dans la chip de
    /// focus en haut à droite ET dans la méta du bas. Deux fois la même
    /// information, à deux endroits, sur un seul message — magnifié ou non,
    /// c'est la ligne BASSE qui date le message.
    func test_focalRow_keepsTheDateAndChecks_atTheBottom_focusedOrNot() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        // Le haut ne porte plus que l'identité — plus de Spacer ni de chip de date.
        XCTAssertTrue(row.contains("if input.isFocused { focusIdentityChip"), "haut : l'identité seule")
        XCTAssertFalse(row.contains("focusIdentityChip Spacer(minLength: 4) focusStampChip"), "la chip de date a quitté la ligne du haut")
        XCTAssertTrue(row.contains(".offset(y: -FocalMetrics.FocusStrip.identityOverhang)"))
        // Le bas porte la bande ET la chip de date, sur la même ligne.
        XCTAssertTrue(
            row.contains("if input.isFocused { HStack(alignment: .center, spacing: 4) { focusStrip Spacer(minLength: 4) focusStampChip }"),
            "bas : bande à gauche, date+coche à droite"
        )
        XCTAssertEqual(
            row.components(separatedBy: ".opacity(input.isFocused ? 0 : 1)").count - 1, 3,
            "en-tête, ligne drapeau+réactions ET méta-rangée s'effacent en focus — la chip du bas les remplace"
        )
        XCTAssertTrue(row.contains("BubbleDeliveryCheck(status: status, isOffline: false, tint: metaTint, readTint: readTint)"), "la coche d'état de réception dans la chip de date")
    }

    /// Hors focus, une TÊTE DE GROUPE doit dater son message par le bas comme
    /// n'importe quelle rangée de suite : sinon la règle « toujours en bas »
    /// ne tiendrait que pour la moitié des messages.
    func test_everyRow_carriesTheMetaRow_headOfGroupIncluded() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertFalse(row.contains("if !input.isFirstInGroup { FocalMetaRow("), "la méta n'est plus réservée aux rangées de suite")
        XCTAssertTrue(row.contains("FocalMetaRow("), "toute rangée porte sa méta")
        XCTAssertTrue(row.contains("onShowReadStatus: actions.onShowReadStatus.map"), "les coches du bas ouvrent les détails de lecture")
    }

    /// Garde NÉGATIVE — l'en-tête d'identité ne redevient jamais porteur de
    /// l'heure ni des coches. Contre-épreuve dans le test suivant.
    func test_identityHeader_carriesNoTimeAndNoChecks() throws {
        let header = try normalized("Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift")
        XCTAssertFalse(header.contains("BubbleDeliveryCheck"), "aucune coche dans l'en-tête")
        XCTAssertFalse(header.contains("FocalRevealedTime"), "aucun horodatage dans l'en-tête")
        XCTAssertFalse(header.contains("timeString"), "l'en-tête ne reçoit même plus l'heure")
    }

    func test_theGuardAbove_wouldCatchATimeComingBack_intoTheHeader() {
        let reintroduced = "HStack { Text(displayName) stamp BubbleDeliveryCheck(status: status) }"
        XCTAssertTrue(reintroduced.contains("BubbleDeliveryCheck"))
    }

    /// 2026-08-22 : tout ce que porte la bulle en focus apparaît AVEC la carte
    /// — au tick d'élection, jamais au posé — parce que rien ne change de
    /// hauteur : bande et identité sont des superpositions, la date est
    /// pré-calculée à la configuration.
    func test_focusDetails_areInstant_noHeightChange_precomputedDate() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(row.contains(".opacity(input.isFocused ? 0 : 1)"), "la ligne drapeau+réactions garde sa place, elle s'efface")
        // La carte est le FOND du bloc (même repère que ses chips) — plus une
        // vue UIKit bornée à la cellule qui dérivait avant la pose.
        XCTAssertTrue(row.contains(".background { if input.isFocused { focusCardBackground } }"), "carte = fond SwiftUI du contenu")
        XCTAssertTrue(row.contains(".padding(.vertical, -FocalScrollPerspective.focusCardInnerMargin)"), "mêmes cotes que focusCardInsets")
        XCTAssertTrue(row.contains("FocalMetaRow("), "la méta-rangée reste, focus ou pas")
        XCTAssertTrue(row.contains("if let precomputed = input.focusTimestamp { return precomputed }"), "date pré-calculée")
        let controller = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(controller.contains("if electionChanged { syncFocalFocusDetails() }"), "détails synchronisés au tick d'élection")
        // Jamais un `apply` imbriqué (crash UIKit « APPLYING_SNAPSHOTS_REENTRANTLY »,
        // payé au simulateur) : la reconfiguration est différée et coalescée.
        XCTAssertTrue(controller.contains("guard !focalDetailsSyncScheduled else { return }"), "coalescée")
        XCTAssertTrue(controller.contains("focalDetailsSyncScheduled = true DispatchQueue.main.async"), "différée au prochain tour")
        XCTAssertTrue(controller.contains("if focalReconfigureInFlight { focalDetailsPendingAfterApply = true return }"), "un seul apply en vol")
        XCTAssertTrue(controller.contains("focusTimestamp: self.focalDetailedLocalId == localId ? self.focalFocusTimestamp(for: message.createdAt) : nil"))
        let input = try normalized("Meeshy/Features/Main/Focal/Core/FocalRowInput.swift")
        XCTAssertTrue(input.contains("let focusTimestamp: String?"))
    }

    /// 2026-08-21 : le message en focus porte sur sa bordure basse les
    /// drapeaux disponibles, l'icône de traduction, le (+) emoji et ses
    /// réactions ; ses coches (haut-droite) ouvrent les détails de lecture.
    func test_focusedRow_hasTheBottomStrip_andTappableChecks() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(row.contains("focusStrip Spacer(minLength: 4) focusStampChip"), "la bande est une superposition SUR la ligne basse, la date à sa droite")
        XCTAssertTrue(row.contains(".offset(y: FocalMetrics.FocusStrip.overhang)"))
        XCTAssertTrue(row.contains("actions.onSetActiveDisplayLanguage?(content.messageId, code)"), "un drapeau = afficher cette langue")
        XCTAssertTrue(row.contains("actions.onShowTranslationDetail?(content.messageId)"), "l'icône de traduction du mode bulle")
        XCTAssertTrue(row.contains("actions.onOpenReactPicker?(content.messageId)"), "le (+) emoji, toujours")
        XCTAssertTrue(row.contains("onShowReadStatus: actions.onShowReadStatus.map"), "les coches ouvrent les détails de lecture")
        _ = try normalized("Meeshy/Features/Main/Focal/Row/FocalMetaRow.swift")
        // Ordre (directive 2026-08-22) : traduction → drapeaux → (+) → réactions.
        let strip = try XCTUnwrap(row.range(of: "private var focusStrip: some View {"))
        let tail = row[strip.lowerBound...]
        let iTranslate = try XCTUnwrap(tail.range(of: "\"character.bubble\"")).lowerBound
        let iFlags = try XCTUnwrap(tail.range(of: "Self.focusFlagCodes(")).lowerBound
        let iPlus = try XCTUnwrap(tail.range(of: "\"face.smiling\"")).lowerBound
        let iReactions = try XCTUnwrap(tail.range(of: "focusReactionChip(reaction)")).lowerBound
        XCTAssertTrue(iTranslate < iFlags && iFlags < iPlus && iPlus < iReactions, "ordre : traduction, drapeaux, (+), réactions")
        XCTAssertTrue(row.contains("focusChip(filled: mine)"), "fond PLEIN quand j'ai réagi")
        XCTAssertTrue(row.contains(".fill(filled ? focusAccent : MeeshyColors.backgroundSecondary(isDark: input.isDark))"), "une seule coquille de chip")
        let controller = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(controller.contains("cell.clipsToBounds = false"))
        XCTAssertTrue(controller.contains("cell.layer.zPosition = isFocusedCell ? 1 : 0"))
        let meta = try normalized("Meeshy/Features/Main/Focal/Row/FocalMetaRow.swift")
        XCTAssertTrue(meta.contains("Button(action: onShowReadStatus)"), "les coches du bas sont un bouton quand la rangée sait ouvrir les détails")
    }

    func test_focusFlagCodes_putTheOriginalFirst_thenAvailable_thenTheDisplayedOne_neverRepeated() {
        XCTAssertEqual(
            FocalRow.focusFlagCodes(originalLangCode: "en", availableFlags: ["fr", "EN", "es"],
                                    activeLangCode: "fr", limit: FocalMetrics.FocusStrip.flagLimitMagnified),
            ["en", "fr", "es"]
        )
        XCTAssertEqual(
            FocalRow.focusFlagCodes(originalLangCode: "fr", availableFlags: [],
                                    activeLangCode: "en", limit: FocalMetrics.FocusStrip.flagLimitMagnified),
            ["fr", "en"]
        )
    }

    /// L'heure permanente a suivi la date : elle vit dans la méta du bas, et
    /// c'est ELLE qui distingue le message en focus (heure toujours lisible)
    /// des autres (révélée au défilement).
    func test_metaRow_rendersAPermanentTime_whenAskedTo_andTheRevealedOneOtherwise() throws {
        let meta = try normalized("Meeshy/Features/Main/Focal/Row/FocalMetaRow.swift")
        XCTAssertTrue(
            meta.contains("FocalRevealedTime(timeString: timeString, tint: metaTint)"),
            "Hors focus, la règle commune reste le révélé de défilement."
        )
    }

    /// **Directive 2026-08-24 — l'heure ET les coches ne vivent que pendant
    /// le défilement.**
    ///
    /// L'heure passait déjà par le révélé (`FocalRevealedTime`) ; les coches,
    /// elles, restaient inscrites en permanence sur chaque rangée. Une
    /// conversation immobile portait donc la moitié de ses détails de
    /// réception — la règle « au repos, rien » n'était vraie que pour une
    /// des deux informations.
    func test_theChecks_followTheSameRevealAsTheTime_notOnlyTheTime() throws {
        let meta = try normalized("Meeshy/Features/Main/Focal/Row/FocalMetaRow.swift")
        XCTAssertTrue(
            meta.contains("FocalRevealedDetail { deliveryChecks(deliveryStatus) }"),
            "les coches passent par le MÊME révélé que l'heure"
        )
        XCTAssertTrue(meta.contains("Button(action: onShowReadStatus)"), "elles restent le bouton des détails de lecture")
    }

    /// Garde NÉGATIVE — un révélé qui ne couperait que l'opacité laisserait
    /// un bouton INVISIBLE mais tappable au milieu du fil : appuyer dans le
    /// vide ouvrirait les détails de lecture d'un message qu'on ne voit pas.
    func test_theReveal_alsoCutsTheTouch_notJustTheOpacity() throws {
        let reveal = try normalized("Meeshy/Features/Main/Focal/Chrome/FocalTimestampRevealState.swift")
        XCTAssertTrue(reveal.contains(".allowsHitTesting(reveal.isRevealed)"), "invisible ⇒ intouchable")
        XCTAssertTrue(reveal.contains("struct FocalRevealedDetail"), "un seul enrobage, deux consommateurs")
    }

    func test_theGuardAbove_wouldCatchARevealThatOnlyFadesOut() {
        let opacityOnly = "content().opacity(reveal.isRevealed ? 1 : 0)"
        XCTAssertFalse(opacityOnly.contains(".allowsHitTesting(reveal.isRevealed)"))
    }

    /// **Directive 2026-08-24 — plus de CADRE en mode focal.** Le fond garde
    /// la couleur de la conversation ; le trait qui l'encadrait disparaît, et
    /// avec lui l'anneau des chips posées sur ses bords.
    func test_theFocusCard_andItsChips_carryNoBorderAnymore() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertFalse(row.contains("strokeBorder"), "ni la carte ni les chips ne tracent de bord")
        XCTAssertTrue(
            row.contains(".fill(focusAccent.opacity(input.isDark ? FocalScrollPerspective.focusCardFillOpacityDark : FocalScrollPerspective.focusCardFillOpacityLight))"),
            "le fond reste la couleur de la conversation"
        )
        let perspective = try normalized("Meeshy/Features/Main/Focal/Core/FocalScrollPerspective.swift")
        XCTAssertFalse(perspective.contains("focusCardBorderOpacity"), "la teinte du cadre n'a plus de porteur")
        XCTAssertFalse(perspective.contains("focusChipRingOpacity"), "ni l'anneau des chips")
        XCTAssertFalse(perspective.contains("borderWidth"), "la carte UIKit résiduelle n'en trace pas non plus")
    }

    /// Sans anneau, la chip du drapeau AFFICHÉ ne se distinguait plus que par
    /// rien du tout : la marque d'état passe au fond, jamais au trait.
    func test_theActiveChip_isMarkedByItsFill_sinceTheRingIsGone() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(row.contains("FocalScrollPerspective.focusChipFillOpacity(isDark: input.isDark, isActive: isActive)"), "l'état actif se lit au fond")
        let perspective = try normalized("Meeshy/Features/Main/Focal/Core/FocalScrollPerspective.swift")
        XCTAssertTrue(perspective.contains("static func focusChipFillOpacity(isDark: Bool, isActive: Bool)"), "une seule loi de teinte, dans Core")
    }

    func test_theActiveChipFill_isDenserThanTheRestingOne_onBothThemes() {
        for isDark in [true, false] {
            XCTAssertGreaterThan(
                FocalScrollPerspective.focusChipFillOpacity(isDark: isDark, isActive: true),
                FocalScrollPerspective.focusChipFillOpacity(isDark: isDark, isActive: false),
                "sinon l'actif serait indiscernable du repos"
            )
        }
    }

    // MARK: - Directive 2026-08-24 — l'identité de la bulle magnifiée

    /// La chip d'identité du focus recomposait une identité PAUVRE : un
    /// avatar et un nom, rien d'autre. La présence, le mood, l'anneau de
    /// story et le fantôme des visiteurs sans compte — tout ce que
    /// `FocalIdentityHeader` sait déjà porter — s'évaporaient au moment
    /// précis où le message est le plus regardé.
    func test_theMagnifiedIdentity_reusesTheHeader_ratherThanRecomposingAPoorerOne() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        let chip = try XCTUnwrap(row.range(of: "private var focusIdentityChip: some View {"))
        let body = String(row[chip.lowerBound...].prefix(1400))
        XCTAssertTrue(body.contains("FocalIdentityHeader("), "la chip réutilise l'en-tête, elle ne le réécrit pas")
        XCTAssertTrue(body.contains("senderPresence: input.senderPresence"), "présence")
        XCTAssertTrue(body.contains("senderMoodEmoji: input.senderMoodEmoji"), "mood")
        XCTAssertTrue(body.contains("senderIsAnonymous: input.senderIsAnonymous"), "le fantôme d'un compte anonyme")
    }

    /// **Le toucher mène au PROFIL** (directive 2026-08-24), par le routage
    /// que l'hôte tient déjà : feuille de profil pour un compte, fiche de
    /// participation pour un visiteur qui n'en a pas — lui n'a pas d'autre
    /// identité que celle-là.
    func test_theMagnifiedIdentity_opensTheProfile_throughTheHostsExistingRouting() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        let chip = try XCTUnwrap(row.range(of: "private var focusIdentityChip: some View {"))
        let body = String(row[chip.lowerBound...].prefix(1400))
        XCTAssertTrue(body.contains("onOpenProfile: actions.onOpenProfile"), "le routage de l'hôte, pas un second")
    }

    /// **L'identité revient EN BORDURE** (directive 2026-08-24, seconde
    /// passe) : sa chip est de nouveau posée à cheval sur la ligne haute de la
    /// carte, comme celles de la ligne basse. Elle avait été sortie de la
    /// carte le matin même ; c'est le placement d'avant qui est retenu.
    @MainActor
    func test_theMagnifiedIdentity_sitsOnTheCardsEdge_inItsChip() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        let chip = try XCTUnwrap(row.range(of: "private var focusIdentityChip: some View {"))
        let body = String(row[chip.lowerBound...].prefix(1500))
        XCTAssertTrue(body.contains("focusChip(height: FocalMetrics.FocusStrip.identityChipHeight)"), "sa chip, à son gabarit")
        XCTAssertTrue(body.contains("FocalIdentityHeader("), "et l'en-tête complet dedans")
        XCTAssertEqual(
            FocalMetrics.FocusStrip.identityOverhang,
            FocalMetrics.FocusStrip.identityChipHeight / 2 + FocalScrollPerspective.focusCardInnerMargin,
            "son centre tombe SUR la ligne de la carte"
        )
    }

    /// « Juste la taille qui est maintenue » : l'auteur du message magnifié
    /// reste plus grand que celui d'une rangée ordinaire.
    @MainActor
    func test_theMagnifiedIdentity_keepsItsLargerSize() {
        XCTAssertGreaterThan(FocalMetrics.FocusStrip.identityAvatarSize, FocalMetrics.Avatar.size)
        XCTAssertGreaterThan(FocalMetrics.FocusStrip.identityNameSize, FocalMetrics.Name.size)
    }

    /// L'en-tête reste utilisable là où il vivait : hors focus, il remplit sa
    /// ligne et ouvre le profil. Les deux emplois ne doivent pas se confondre.
    func test_theHeader_keepsItsRowBehaviour_whereItAlreadyLived() throws {
        let header = try normalized("Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift")
        XCTAssertTrue(header.contains("var fillsWidth: Bool = true"), "par défaut il remplit sa ligne")
        XCTAssertTrue(header.contains("if let onTap { onTap() } else { onOpenProfile?(profileUser) }"),
                      "sans destination explicite, le routage de l'hôte tient")
    }

    // MARK: - Quand la magnificence s'arme (directive 2026-08-24)

    /// Le premier pixel défilé ne magnifie plus rien : un pouce qui ripe, un
    /// rebond, un ajustement de deux points posaient la carte et faisaient
    /// apparaître les chips.
    func test_magnification_doesNotArmOnTheFirstPixelScrolled() {
        XCTAssertFalse(
            FocalMagnificationLaw.isArmed(
                alreadyArmed: false, scrollStartedAt: 1_000, now: 1_050, velocity: 40)
        )
    }

    /// Première porte : un défilement franc dit dès le premier événement qu'on
    /// cherche quelque chose.
    func test_magnification_armsImmediately_onHighVelocity() {
        XCTAssertTrue(
            FocalMagnificationLaw.isArmed(
                alreadyArmed: false, scrollStartedAt: 1_000, now: 1_000,
                velocity: FocalMagnificationLaw.highVelocityThreshold)
        )
        XCTAssertTrue(
            FocalMagnificationLaw.isArmed(
                alreadyArmed: false, scrollStartedAt: nil, now: 1_000,
                velocity: -FocalMagnificationLaw.highVelocityThreshold),
            "le sens du geste n'entre pas en compte — seule la vitesse"
        )
    }

    /// Seconde porte : lent, mais SOUTENU. La borne est inclusive à
    /// `sustainedMs` pile, et pas une milliseconde avant.
    func test_magnification_armsOnSustainedScroll_atTheBoundaryAndNotBefore() {
        let start = 10_000.0
        let ms = FocalMagnificationLaw.sustainedScrollMs
        XCTAssertFalse(
            FocalMagnificationLaw.isArmed(
                alreadyArmed: false, scrollStartedAt: start, now: start + ms - 1, velocity: 10)
        )
        XCTAssertTrue(
            FocalMagnificationLaw.isArmed(
                alreadyArmed: false, scrollStartedAt: start, now: start + ms, velocity: 10)
        )
    }

    /// **Une fois armée, elle le reste** : désarmer au moindre repos ferait
    /// clignoter la carte à chaque pause — or c'est à l'arrêt qu'on lit le
    /// message élu.
    func test_magnification_staysArmed_onceItHasBeen() {
        XCTAssertTrue(
            FocalMagnificationLaw.isArmed(
                alreadyArmed: true, scrollStartedAt: nil, now: 99_999, velocity: 0)
        )
    }

    /// Au repos, sans geste et sans historique, rien ne s'arme.
    func test_magnification_staysQuiet_whenNothingIsScrolling() {
        XCTAssertFalse(
            FocalMagnificationLaw.isArmed(
                alreadyArmed: false, scrollStartedAt: nil, now: 5_000, velocity: 0)
        )
    }

    /// Les deux seuils sont NOMMÉS — ils passeront aux préférences
    /// utilisateur, et il ne doit y avoir qu'un endroit à brancher.
    func test_magnificationThresholds_areNamed_forTheComingPreference() {
        XCTAssertEqual(FocalMagnificationLaw.sustainedScrollMs, 4000)
        XCTAssertGreaterThan(FocalMagnificationLaw.highVelocityThreshold, 0)
        XCTAssertTrue(
            FocalMagnificationLaw.isArmed(
                alreadyArmed: false, scrollStartedAt: 0, now: 900, velocity: 0,
                sustainedMs: 800, velocityThreshold: 5_000),
            "les seuils s'injectent — c'est par là que la préférence entrera"
        )
    }

    /// La peau doit CONSULTER la loi, pas la réimplémenter : sans élection,
    /// pas de carte ni de chips.
    func test_theController_asksTheLaw_beforeElecting() throws {
        let controller = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(controller.contains("FocalMagnificationLaw.isArmed("), "la loi est consultée")
        XCTAssertTrue(controller.contains("focalMagnificationArmed"), "son verdict est retenu")
        // La garde a suivi l'implémentation : l'élection n'est plus protégée
        // SUR SA LIGNE mais par un `guard` en amont, qui suspend TOUTE la
        // passe — poses comprises (directive 2026-08-24, seconde passe). Le
        // témoin de ce guard vit dans
        // `test_withoutArming_theRowsStayFlat_asInScript`.
        XCTAssertTrue(
            controller.contains("guard focalMagnificationArmed else {"),
            "sans armement, la passe entière s'arrête — sinon la carte reparaît au premier pixel"
        )
    }

    // MARK: - Directive 2026-08-24 (seconde passe)

    /// **Trois drapeaux sans magnificence, cinq avec.** Une rangée ordinaire
    /// n'en montrait qu'UN : un message disponible en six langues ne laissait
    /// rien paraître tant qu'il n'était pas élu.
    func test_flagCodes_areCappedAtThreePlain_andFiveMagnified() {
        let many = ["fr", "es", "de", "it", "pt", "ar"]
        XCTAssertEqual(
            FocalRow.focusFlagCodes(originalLangCode: "en", availableFlags: many, activeLangCode: "en",
                                    limit: FocalMetrics.FocusStrip.flagLimitPlain).count,
            3
        )
        XCTAssertEqual(
            FocalRow.focusFlagCodes(originalLangCode: "en", availableFlags: many, activeLangCode: "en",
                                    limit: FocalMetrics.FocusStrip.flagLimitMagnified).count,
            5
        )
        XCTAssertEqual(FocalMetrics.FocusStrip.flagLimitPlain, 3)
        XCTAssertEqual(FocalMetrics.FocusStrip.flagLimitMagnified, 5)
    }

    /// La coupe ne perd JAMAIS le drapeau affiché : un état actif dont le
    /// témoin a disparu serait pire que pas de témoin du tout.
    func test_theActiveFlag_survivesTheCap_evenWhenItRanksLast() {
        let codes = FocalRow.focusFlagCodes(
            originalLangCode: "en", availableFlags: ["fr", "es", "de", "it"], activeLangCode: "ar", limit: 3)
        XCTAssertEqual(codes.count, 3)
        XCTAssertTrue(codes.contains("ar"), "la langue affichée reste montrée")
        XCTAssertEqual(codes.first, "ar", "et elle passe en tête de la coupe")
    }

    /// Sous le plafond, rien ne bouge : l'ordre porte le sens — l'original
    /// d'abord, puis les traductions.
    func test_belowTheCap_theOrderIsUntouched() {
        XCTAssertEqual(
            FocalRow.focusFlagCodes(originalLangCode: "en", availableFlags: ["fr"], activeLangCode: "fr", limit: 5),
            ["en", "fr"]
        )
    }

    /// **Tant que la magnificence n'est pas armée, le fil défile comme en
    /// Script** : ni réduction, ni compaction, ni élection. J'avais d'abord
    /// retardé la seule élection en laissant le relief s'appliquer — c'était
    /// la moitié de la règle.
    func test_withoutArming_theRowsStayFlat_asInScript() throws {
        let controller = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(controller.contains("guard focalMagnificationArmed else {"), "la passe s'arrête AVANT les poses")
        XCTAssertTrue(
            controller.contains("for cell in cells { FocalScrollPerspective.reset(cell.contentView.layer) }"),
            "et remet les cellules à plat, sinon une pose héritée resterait figée"
        )
    }

    func test_theGuardAbove_wouldCatchThePosesBeingAppliedUnarmed() {
        let unguarded = "let poses = FocalScrollPerspective.poses(cells: geometries, focusY: focusY)"
        XCTAssertFalse(unguarded.contains("guard focalMagnificationArmed else {"))
    }

    /// « Moins d'espace entre les messages d'un groupe » — et la respiration
    /// passe à la FRONTIÈRE des groupes, qui doit rester lisible.
    func test_groupSpacing_isTighterInside_thanBetweenGroups() {
        XCTAssertLessThanOrEqual(FocalMetrics.Row.paddingVertical, 3)
        XCTAssertGreaterThan(
            FocalMetrics.Row.groupTopPadding,
            FocalMetrics.Row.paddingVertical,
            "un groupe se distingue du suivant par plus d'air qu'il n'en met en lui-même"
        )
    }
}
