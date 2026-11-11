import XCTest
@testable import Meeshy

/// #8459 — la pilule est UN bloc de verre réel (iOS 26). #17327 — les actions du
/// `(…)` s'y déploient au-dessus de la rangée de base EN GROUPE ; à deux, elles
/// sortent en deux rails sur les bords et la pilule ne grandit pas.
/// #17323 — chaque bouton y est lui-même un Liquid Glass interactif (iOS 26) ou
/// le verre dessiné de `adaptiveLiquidGlass` (iOS 16 à 25) ; Fin reste rouge.
/// #8435 — le bouton PiP quitte le plein écran par le même chemin que le glissé.
@MainActor
final class CallViewGlassGuardTests: XCTestCase {

    private func callViewCode() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
    }

    private func block(_ start: String, until end: String, in code: String) throws -> String {
        let from = try XCTUnwrap(code.range(of: start), "\(start) introuvable — la garde ne mesurerait rien")
        let to = try XCTUnwrap(code.range(of: end, range: from.upperBound ..< code.endIndex), "\(end) introuvable")
        return String(code[from.upperBound ..< to.lowerBound])
    }

    /// #17323 — un bouton de la pilule est un verre à lui : le traitement vient
    /// de la loi pure `CallButtonGlassRule`, jamais d'un disque dessiné.
    func test_pillGlyph_isAnInteractiveGlassDisc_chosenByThePureRule() throws {
        let glyph = try block("struct CallPillGlyph: View {", until: "struct CallPillButtonLabel", in: try callViewCode())
        XCTAssertTrue(glyph.contains(".modifier(CallButtonGlassModifier(kind: kind, diameter: diameter))"))
        XCTAssertFalse(glyph.contains("CallButtonFill.color"), "Plus de disque dessiné sous le glyphe")
        XCTAssertFalse(glyph.contains("Color.white.opacity(0.16)"))
        XCTAssertTrue(glyph.contains("CallButtonGlassRule.treatment("), "Le toucher dessiné ne reste que là où le verre ne réagit pas seul")
    }

    func test_buttonGlass_noFlatTranslucentDiscRemains_andEndStaysRed() throws {
        let glass = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallControlGlass.swift")
        )
        XCTAssertFalse(glass.contains("Color.white.opacity(0.16)"))
        XCTAssertFalse(glass.contains("static func color(for kind: CallPillButtonKind)"), "Le disque plat par état a quitté l'écran d'appel")
        let modifier = try block("struct CallButtonGlassModifier: ViewModifier {", until: "\n}\n", in: glass)
        XCTAssertTrue(modifier.contains(".callControlGlass(diameter: diameter"), "Le verre neutre est celui de l'en-tête : adaptiveLiquidGlass interactif")
        XCTAssertTrue(modifier.contains(".endCallGlass(diameter: diameter)"), "Fin reste rouge")
        let endGlass = try block("func endCallGlass(diameter: CGFloat) -> some View {", until: "\n    }\n", in: glass)
        XCTAssertTrue(endGlass.contains(".adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.error)"))
        let anchor = try XCTUnwrap(AppSourceGuard.unitURLs("Meeshy/Features/Call/Views/CallModeCarousel.swift").first)
        let directory = anchor.deletingLastPathComponent()
        for url in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        where url.pathExtension == "swift" {
            let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            XCTAssertFalse(code.contains("CallButtonFill.color("), "\(url.lastPathComponent) : un disque plat par état")
            XCTAssertFalse(code.contains("Color.white.opacity(0.16)"), "\(url.lastPathComponent) : plus aucun disque translucide dessiné dans la vue d'appel (#17323)")
        }
    }

    /// #8459 · #8550 — UN seul bloc de verre réel : la pilule ; en groupe, les
    /// familles OU le panneau ouvert s'y déploient, au-dessus de la rangée de
    /// base, sans second bloc. #8578 — le panneau REMPLACE les rangées : jamais
    /// les deux à la fois. #17327 — c'est la loi pure `CallControlsDisposition` qui
    /// dit si la pilule se déplie (groupe, ou option dessinée dedans), jamais une
    /// bascule locale.
    func test_groupActions_unfoldInsideTheSingleGlassBlock_aboveTheBaseRow() throws {
        let code = try callViewCode()
        let pill = try block("var callControlsPill: some View {", until: "var pillHairline: some View", in: code)
        XCTAssertEqual(pill.components(separatedBy: ".callControlsGlass(in:").count - 1, 1, "Un seul verre pour tout le bloc")
        let panel = try XCTUnwrap(pill.range(of: "panelRows(panel)"))
        let families = try XCTUnwrap(pill.range(of: "familyRows(disposition.pillRows(actions, layer: layer))"))
        let base = try XCTUnwrap(pill.range(of: "baseRow"))
        let glass = try XCTUnwrap(pill.range(of: ".callControlsGlass(in:"))
        XCTAssertTrue(pill.contains("if text.hasBaseRow, disposition.unfoldsPill(for: layer) {"), "La pilule se déplie par la loi, pas par l'état seul du (…)")
        XCTAssertTrue(pill.contains("let disposition = controlsDisposition"))
        XCTAssertTrue(pill.contains("if let panel = layer.pillPanel {"), "Le panneau se lit dans CallScreenLayer")
        let alternative = String(pill[panel.upperBound ..< families.lowerBound])
        XCTAssertTrue(alternative.contains("} else {"), "Le panneau REMPLACE les familles, il ne s'empile pas (#8578)")
        XCTAssertLessThan(families.lowerBound, base.lowerBound)
        XCTAssertLessThan(base.lowerBound, glass.lowerBound, "Le verre enveloppe les rangées ET la rangée de base")
        XCTAssertFalse(pill.contains("isGroupStage ?"), "La disposition vient de la loi pure, jamais d'une bascule locale")
        XCTAssertFalse(pill.contains("railActionButton"), "Les boutons des rails sont ceux des rails, pas ceux de la pilule")
        XCTAssertFalse(code.contains("callLegibilityVeil"), "Plus de voile non vitré : le bloc est du verre")
        XCTAssertFalse(code.contains("CallReactionPalette"), "La palette flottante a rejoint la pilule")
    }

    /// #17327 — À DEUX, deux rails verticaux sur les bords : « mon image » à
    /// gauche, « l'appel » à droite, centrés verticalement, chacun UNE capsule de
    /// verre qui porte les mêmes boutons que les rangées. La garde d'avant
    /// interdisait tout rail (#8459) ; la directive porteur du 2026-11-09 a retiré
    /// cet interdit : à deux, les rails sont IMPOSÉS, à plusieurs ils sont bannis.
    func test_duoActions_comeOutAsTwoEdgeRails_chosenByThePureLaw() throws {
        let code = try callViewCode()
        let rails = try block("var callActionRails: some View {", until: "private func actionRail(", in: code)
        XCTAssertTrue(rails.contains("controlsDisposition.railRows(currentActionSet, layer: layer)"), "Les rails se lisent dans la loi : rien en groupe")
        XCTAssertTrue(rails.contains("CallRailsLayout.bottomClearance("), "Centrés sur toute la hauteur en paysage, au-dessus de la pilule en portrait")
        XCTAssertTrue(rails.contains("alignment: side == .leading ? .leading : .trailing"), "Mon image ouvre la marche, l'appel la ferme, retournés en droite à gauche")
        XCTAssertTrue(rails.contains("AsyncRenderRow(id: row.family"), "Construits sur le fil principal (#9456)")
        XCTAssertTrue(rails.contains(".callChromeVisibility(isChromeVisible)"), "Les rails se rangent avec l'en-tête et la pilule")
        XCTAssertTrue(rails.contains(".animation(disclosureAnimation, value: rows)"), "Un rail apparu ou parti suit le (…), jamais d'un coup")
        let rail = try block("private func actionRail(", until: "private struct CallRailSlide", in: code)
        XCTAssertEqual(rail.components(separatedBy: ".callControlsGlass(in: Capsule())").count - 1, 1, "UNE capsule de verre par rail, l'atome adaptatif")
        XCTAssertTrue(rail.contains("railActionButton(action)"), "Les boutons sont ceux des rangées : même verre, mêmes libellés VoiceOver")
        XCTAssertTrue(rail.contains("AdaptiveGlassContainer(spacing: CallControlGlassMetrics.containerSpacing)"), "Les disques voisins se composent ensemble")
        XCTAssertTrue(rail.contains("ViewThatFits(in: .vertical)"), "Trop haut, un rail défile au lieu de déborder")
        XCTAssertTrue(rail.contains("CallControlsCopy.familyTitle(row.family)"), "VoiceOver nomme le rail")
        XCTAssertFalse(rail.contains(".adaptiveGlass("), "Aucun verre dessiné à la main dans la vue")
        let slideStart = try XCTUnwrap(code.range(of: "private struct CallRailSlide: ViewModifier {"))
        let slide = String(code[slideStart.upperBound...])
        XCTAssertTrue(slide.contains("CallRailsLayout.slideOffset("), "Le rail entre et sort par SON bord de l'écran")
        XCTAssertTrue(slide.contains("layoutDirection == .rightToLeft"), "Retourné en écriture de droite à gauche")
        XCTAssertTrue(code.contains("guard !reduceMotion else { return .opacity }"), "Réduire les animations : un fondu")
        XCTAssertTrue(code.contains("callEdgeControls\n"), "Les rails sont montés dans l'appel établi")
    }

    /// #17327 — « Une seule forme par disposition » : plus aucune commande de ma
    /// caméra autour de ma vignette ni en haut au centre, ni aucune rangée du
    /// (…) qui doublerait le rail gauche.
    func test_noSecondFormOfMyImageControls_remains() throws {
        let code = try callViewCode()
        for removed in ["selfTileControlRows", "selfTileControlRow(", "CallSelfTileControlsPlacement", "CallSelfTileControlButton", "CallSelfTileControlGlyph", "menuRows(", "selfTileRows(", "selfTileControlsBounds"] {
            XCTAssertFalse(code.contains(removed), "\(removed) : une seconde forme des commandes de ma caméra")
        }
        let handler = try block(".adaptiveOnChange(of: isGroupStage) { _, isGroup in", until: ".adaptiveOnChange(of: isVideoStage)", in: code)
        XCTAssertFalse(handler.contains("layer"), "De deux à trois, l'état du (…) ne bouge pas : seule la forme change")
    }

    /// #17327 — les boutons de ma vignette retirés vibraient au toucher pour
    /// allumer ou couper la caméra et pour arrêter le partage d'écran : le rail
    /// gauche et la rangée « Mon image », qui les remplacent, gardent ce retour.
    func test_myImageButtons_keepTheTouchFeedbackOfTheRemovedTileButtons() throws {
        let code = try callViewCode()
        let camera = try block("private func cameraActionButton(captioned: Bool, diameter: CGFloat) -> some View {", until: "private func cameraPickerActionButton", in: code)
        XCTAssertTrue(camera.contains("HapticFeedback.light()\n            callManager.cameraActuator.toggleVideo()"), "Caméra : retour au toucher avant la bascule")
        let screenShare = try block("case .screenShare:", until: "case .captions:", in: code)
        XCTAssertTrue(screenShare.contains("if callManager.screenShare.isSharing { HapticFeedback.light() }"), "Écran : retour au toucher à l'arrêt du partage")
    }

    /// Le bloc de verre est un verre RÉEL sous iOS 26 (`adaptiveGlass`, qui
    /// porte le `glassEffect` et le repli matériau) ; les disques de verre
    /// voisins qu'il porte se composent dans un `AdaptiveGlassContainer`.
    func test_controlsGlass_isRealAdaptiveGlass_andItsButtonsShareAContainer() throws {
        let glass = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallControlGlass.swift")
        )
        let modifier = try block("func callControlsGlass<S: Shape>(in shape: S) -> some View {", until: "\n    }\n", in: glass)
        XCTAssertTrue(modifier.contains(".adaptiveGlass(in: shape)"))
        let controlCircle = try block("func callControlGlass(diameter: CGFloat, isActive: Bool, tint: Color) -> some View {", until: "\n    }\n", in: glass)
        XCTAssertTrue(controlCircle.contains(".adaptiveLiquidGlass(in: Circle()"), "Le disque de l'en-tête est un verre dessiné avant iOS 26")
        XCTAssertTrue(controlCircle.contains("interactive: true"))
        let chip = try block("func callChipGlass(isActive: Bool, tint: Color) -> some View {", until: "\n    }\n", in: glass)
        XCTAssertTrue(chip.contains("adaptiveLiquidGlass(in: Capsule()"))
        let code = try callViewCode()
        let base = try block("private var baseRow: some View {", until: "private func moreButton(", in: code)
        XCTAssertTrue(base.contains("AdaptiveGlassContainer(spacing: CallControlGlassMetrics.containerSpacing)"))
    }

    /// #17323 — l'en-tête : Réduire, Image dans l'image et Conversation sont des
    /// verres voisins, composés ensemble, qui naissent tous du MÊME bouton de verre ;
    /// la capsule de droite est un verre interactif quand elle s'ouvre au toucher.
    func test_header_buttonsShareAGlassContainer_andTheChipIsInteractive() throws {
        let header = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Header.swift")
        )
        let chrome = try block("var topChrome: some View {", until: "private func headerButton(", in: header)
        XCTAssertTrue(chrome.contains("AdaptiveGlassContainer(spacing: CallControlGlassMetrics.containerSpacing)"))
        XCTAssertTrue(chrome.contains("ForEach(headerActions, id: \\.self)"), "Les boutons viennent de la loi CallHeaderRule")
        XCTAssertEqual(header.components(separatedBy: ".callControlGlass(diameter: 40").count - 1, 1, "Un seul bouton de verre, trois usages")
        XCTAssertFalse(chrome.contains(".adaptiveGlass("))
        let glassButton = try block("private func headerGlassButton(", until: "func refreshHeaderNames()", in: header)
        XCTAssertTrue(glassButton.contains(".frame(width: 44, height: 44)"), "Cible tactile HIG 44 pt")
        let chip = try block("private func chipContent(", until: "private var chipSeparator", in: header)
        XCTAssertTrue(chip.contains(".modifier(CallInteractiveChromeCapsule())"))
    }

    /// #17329 — Image dans l'image quitte la liste « l'appel » pour l'en-tête, entre
    /// Réduire et Conversation ; son bouton garde le repli sur la pastille.
    func test_header_pictureInPictureButton_isBetweenMinimizeAndConversation_andLeavesThroughEnterSystemPiP() throws {
        let header = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Header.swift")
        )
        let button = try block("func pictureInPictureHeaderButton(", until: "private func headerGlassButton(", in: header)
        XCTAssertTrue(button.contains("enterSystemPiP()"))
        XCTAssertFalse(button.contains("callManager.startSystemPiP()"), "Le bouton passe par enterSystemPiP et son repli")
        let pill = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Pill.swift")
        )
        XCTAssertFalse(pill.contains("pictureInPicture"), "La liste « l'appel » ne porte plus l'image dans l'image")
    }

    /// Les rangées d'actions ne portent plus aucun fond propre : elles sont
    /// DANS le bloc, et elles défilent à l'horizontale.
    func test_actionRows_carryNoBackgroundOfTheirOwn() throws {
        let code = try callViewCode()
        let rows = try block("private func familyRows(", until: "func actionButton(", in: code)
        XCTAssertFalse(rows.contains("callChromeGlass"))
        XCTAssertTrue(rows.contains("CallPillRow("))
        XCTAssertFalse(code.contains("glassEffectID"), "Plus de morphing : les actions naissent dans le bloc qui grandit")
        let row = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallPillRow.swift")
        )
        XCTAssertTrue(row.contains("ScrollView(.horizontal, showsIndicators: false)"))
        XCTAssertTrue(row.contains("scrollTargetBehavior(.viewAligned(limitBehavior: .never))"), "Un lancer va aussi loin qu'il porte (#8736)")
        XCTAssertFalse(row.contains(".adaptiveGlass("), "Une rangée n'a pas de plaque de verre à elle : seuls ses boutons sont du verre")
        XCTAssertFalse(row.contains("callChromeGlass"))
        XCTAssertTrue(row.contains("AdaptiveGlassContainer(spacing: CallControlGlassMetrics.containerSpacing)"), "Les disques voisins d'une rangée se composent ensemble")
        XCTAssertFalse(row.contains("CallButtonFill.color"))
        let chip = try block("struct CallPillChip: View {", until: "private var artwork: some View {", in: row)
        XCTAssertTrue(chip.contains(".buttonStyle(CallPressButtonStyle(glassPressesItself: art.carriesGlass))"), "Une puce de verre ne rétrécit pas par-dessus son verre interactif")
    }

    /// Les fichiers de l'écran d'appel qui portent un défilement horizontal
    /// — balayés par GLOB, jamais par liste : un nouveau carrousel est gardé
    /// dès qu'il existe.
    private func horizontalScrollerSources() throws -> [String: String] {
        let anchor = try XCTUnwrap(AppSourceGuard.unitURLs("Meeshy/Features/Call/Views/CallModeCarousel.swift").first)
        let directory = anchor.deletingLastPathComponent()
        let horizontal = try NSRegularExpression(pattern: #"ScrollView\([^)]*\.horizontal"#)
        return try (FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil))
            .filter { url in
                let name = url.lastPathComponent
                return url.pathExtension == "swift"
                    && (name.hasPrefix("Call") || name.hasPrefix("GroupCall"))
            }
            .reduce(into: [String: String]()) { result, url in
                let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
                let range = NSRange(code.startIndex ..< code.endIndex, in: code)
                guard horizontal.firstMatch(in: code, range: range) != nil else { return }
                result[url.lastPathComponent] = code
            }
    }

    /// #8575 · #8736 — un geste de glissé posé sur les éléments d'un
    /// défilement horizontal capte le doigt avant le `ScrollView` : la rangée
    /// ne défile plus. L'enfoncement passe par un `ButtonStyle`, qui ne pose
    /// aucun geste — dans TOUT fichier d'appel qui défile à l'horizontale.
    func test_horizontalScrollers_carryNoDragGesture_soEveryRowScrolls() throws {
        let scrollers = try horizontalScrollerSources()
        let expected: Set<String> = ["CallModeCarousel.swift", "CallPillRow.swift", "GroupCallStageView.swift"]
        XCTAssertTrue(expected.isSubset(of: Set(scrollers.keys)), "La garde ne mesurerait rien : \(scrollers.keys.sorted())")
        for (file, code) in scrollers {
            XCTAssertFalse(code.contains(".pressable()"), "\(file) : pressable() pose un DragGesture(minimumDistance: 0) qui vole le défilement")
            XCTAssertFalse(code.contains("DragGesture(minimumDistance: 0)"), file)
        }
        let code = try callViewCode()
        XCTAssertFalse(code.contains(".pressable()"))
        XCTAssertFalse(code.contains("DragGesture(minimumDistance: 0)"))
        XCTAssertTrue(code.contains("struct CallPressButtonStyle: ButtonStyle"))
        for file in ["CallPillRow.swift", "CallModeCarousel.swift"] {
            XCTAssertTrue(scrollers[file]?.contains(".buttonStyle(CallPressButtonStyle(") == true, file)
        }
    }

    /// #8736 — le carrousel et les rangées laissent le lancer aller aussi
    /// loin qu'il porte ; le centre suit le doigt, et le choix ne part qu'au
    /// repos, jamais un défilement programmé contre le doigt.
    func test_carouselAndRows_followTheFingerWithoutBlocking() throws {
        let carousel = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallModeCarousel.swift")
        )
        let row = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallPillRow.swift")
        )
        for (file, code) in [("CallModeCarousel", carousel), ("CallPillRow", row)] {
            XCTAssertTrue(code.contains(".viewAligned(limitBehavior: .never)"), "\(file) : l'accroche par défaut raccourcit le lancer")
            XCTAssertFalse(code.contains("scrollTargetBehavior(.viewAligned)"), "\(file) : accroche sans limitBehavior")
        }
        XCTAssertEqual(carousel.components(separatedBy: "LazyHStack(spacing: layout.spacing)").count - 1, 2, "Les deux pistes, iOS 17+ et iOS 16, sont paresseuses")
        XCTAssertTrue(carousel.contains("onScrollPhaseChange"), "iOS 18 : le choix part au repos du défilement")
        XCTAssertTrue(carousel.contains(".task(id: centred)"), "Avant iOS 18 : le repos se lit après un court délai")
        XCTAssertTrue(carousel.contains("CallModeCarouselRule.trackHeight(itemHeight:"), "La bande de glissé tient un pouce")
        XCTAssertTrue(carousel.contains("motion.rests(on:"), "Le choix se lit par la règle pure")
        XCTAssertTrue(carousel.contains("motion.follows("), "Le suivi programmé se lit par la règle pure")
    }

    /// #8578 — un mode libère l'écran : le chrome d'appel se masque par la
    /// MÊME règle que le toucher (`CallChromeVisibility`), et le mode ne pose
    /// qu'UN carrousel, centré en bas, et sa barre d'action.
    func test_mode_freesTheScreen_withASingleCarouselAndItsActionBar() throws {
        let code = try callViewCode()
        XCTAssertTrue(code.contains("isModeActive: layer.freesTheScreen"))
        XCTAssertTrue(code.contains("callModeLayer"))
        XCTAssertFalse(code.contains("CallEffectsPanel("), "Le panneau Effets empilé a laissé place au mode")
        XCTAssertFalse(code.contains("CallCapturePanel("), "Le panneau Capture empilé a laissé place au mode")
        let controls = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallModeControls.swift")
        )
        let effects = try block("struct CallEffectsModeControls: View {", until: "struct CallMontageModeControls: View {", in: controls)
        XCTAssertTrue(effects.contains("if showsSettings {"), "Réglages REMPLACE la bande de looks (P8b)")
        XCTAssertTrue(effects.contains("settingsPanel"), "Le panneau prend la place de la bande, au-dessus de la barre")
        XCTAssertTrue(effects.contains("switch category {"), "Un seul carrousel, Visage OU Couleur")
        XCTAssertEqual(effects.components(separatedBy: "CallEffectsBar(").count - 1, 1, "Une seule barre de verre : ‹ · Réglages · (+)")
        XCTAssertFalse(effects.contains("CallModeActionBar("), "Effets ne porte ni Quitter ni Valider (loi 14, #17409)")
        XCTAssertFalse(effects.contains("validate"), "Le look touché s'applique tout de suite : aucun « Valider »")
        let montage = try block("struct CallMontageModeControls: View {", until: "struct CallMontageStage: View {", in: controls)
        XCTAssertEqual(montage.components(separatedBy: "CallModeCarousel(").count - 1, 1)
        XCTAssertEqual(montage.components(separatedBy: "CallModeActionBar(").count - 1, 1)
        let carousel = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallModeCarousel.swift")
        )
        XCTAssertTrue(carousel.contains(".scrollTargetBehavior(.viewAligned(limitBehavior: .never))"), "Le carrousel s'accroche")
        XCTAssertTrue(carousel.contains(".scrollPosition(id: $centred, anchor: .center)"), "L'élément choisi se pose au centre")
        XCTAssertTrue(carousel.contains(".accessibilityAdjustableAction"), "VoiceOver choisit d'un balayage vertical")
    }

    /// P8b.4 · P8b.6 · P8b.8 — la barre d'Effets est UN verre d'une pièce (l'atome partagé) :
    /// ‹ · Réglages · (+). Réglages ouvert, elle perd sa rangée de puces et se RESSERRE par
    /// morphisme ; le panneau Luminosité · Flou du fond est un VERRE SÉPARÉ posé au-dessus
    /// d'elle, à la place de la bande de looks, qui monte depuis la barre en fondu et y
    /// redescend. « Réduire les animations » en fait un fondu court, jamais un retrait net.
    func test_effectsBar_isOneGlassPiece_andSettingsRiseInTheirOwnGlassAboveIt() throws {
        let bar = try block(
            "struct CallEffectsBar<Looks: View>: View {",
            until: "private struct CallModeShotActions",
            in: AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallModeCarousel.swift"))
        )
        XCTAssertTrue(bar.contains(".callControlsGlass(in:"), "Le verre est l'atome partagé, d'une pièce")
        XCTAssertTrue(bar.contains("AdaptiveGlassContainer("))
        XCTAssertTrue(bar.contains("symbol: \"chevron.backward\""), "‹ Retour à l'appel")
        XCTAssertTrue(bar.contains("symbol: \"gearshape\""), "Réglages porte l'engrenage, pas le glyphe d'Effets")
        XCTAssertTrue(bar.contains("symbol: \"plus\""), "(+) Ajouter un autre look")
        XCTAssertTrue(bar.contains("showsSettings ? .active : .normal"), "Réglages ouvert = disque blanc")
        XCTAssertTrue(bar.contains("if !showsSettings {"), "Réglages ouvert, la barre perd sa rangée de puces et se resserre")
        XCTAssertTrue(bar.contains(".transition(.opacity)"), "Les puces partent en fondu")
        XCTAssertFalse(bar.contains("settings()"), "Le panneau n'est plus DANS la barre : c'est un verre séparé")
        XCTAssertFalse(bar.contains("slider.horizontal.3"))
        let controls = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallModeControls.swift")
        )
        let effects = try block("struct CallEffectsModeControls: View {", until: "struct CallMontageModeControls: View {", in: controls)
        XCTAssertFalse(effects.contains("settings: {"), "La barre ne reçoit plus le panneau")
        XCTAssertTrue(effects.contains(".callChromeGlass(in:"), "Le panneau est son propre verre, l'atome partagé d'un groupe sans bouton de verre")
        XCTAssertTrue(effects.contains(".combined(with: .offset(y: CallEffectsSettingsMotion.panelRise(reduceMotion: reduceMotion)))"), "Le panneau monte depuis la barre, en fondu")
        XCTAssertTrue(effects.contains("CallEffectsSettingsMotion.duration(reduceMotion: reduceMotion)"), "Réduire les animations = fondu court")
        XCTAssertFalse(effects.contains("reduceMotion ? nil"), "Réduire les animations ne supprime plus l'animation")
        XCTAssertTrue(effects.contains("Text(CallEffectsCopy.brightness)"), "« Luminosité » est un titre visible")
        XCTAssertTrue(effects.contains("Toggle(isOn: blurBinding)"), "« Flou du fond » est une ligne titrée à interrupteur")
    }

    /// #8625 — aucun déclencheur : deux tapes sur le style choisi prennent la
    /// photo, un appui long filme, et l'arrêt se pose au centre du gabarit.
    func test_mode_shootsFromTheSelectedStyle_withoutAShutter() throws {
        let code = try callViewCode()
        let controls = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallModeControls.swift")
        )
        let carousel = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallModeCarousel.swift")
        )
        XCTAssertFalse(controls.contains("CallModeShutter"), "Le déclencheur a quitté Effets et Montage")
        XCTAssertFalse(carousel.contains("struct CallModeShutter"))
        XCTAssertTrue(carousel.contains("CallModeGestureRule.outcome("), "Le geste se lit par la règle pure")
        XCTAssertTrue(code.contains("CallModeRecordingOverlay(capture: capture)"), "L'arrêt de l'enregistrement se pose sur la scène")
        XCTAssertTrue(controls.contains("CallModeRecordingStop(startedAt:"))
        XCTAssertTrue(code.contains("CallCaptureOutcomeAnnouncer(capture: capture)"), "Le résultat s'annonce même après la sortie du mode")
    }

    /// #8625 — une lenteur est un bug : l'écran d'appel TIENT la capture sans
    /// l'observer. Aperçu, chrono, flash et résultat se lisent dans des vues
    /// feuilles ; sinon un film redessinerait tout l'écran à chaque trame.
    func test_callView_holdsTheCaptureWithoutObservingIt() throws {
        let code = try callViewCode()
        XCTAssertTrue(code.contains("@StateObject var captureHost = CallCaptureHost()"))
        XCTAssertFalse(code.contains("@StateObject var capture "), "Observer le contrôleur redessine l'écran d'appel à chaque trame")
        XCTAssertFalse(code.contains("@ObservedObject var capture"))
        for published in ["preview", "previewFeed", "recordingStartedAt", "flashCount", "status", "style", "thumbnails", "isRecording"] {
            XCTAssertFalse(code.contains("capture.\(published)"), "capture.\(published) se lit dans une vue feuille, jamais dans CallView")
        }
        let service = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallCaptureController.swift")
        )
        let host = try block("final class CallCaptureHost: ObservableObject {", until: "final class CallCaptureController", in: service)
        XCTAssertFalse(host.contains("@Published"), "Le propriétaire ne publie rien")
        XCTAssertFalse(service.contains("@Published private(set) var preview"), "L'aperçu se publie sur son flux, pas sur le contrôleur")
    }

    /// #17327 — ma vignette ne porte plus aucune commande autour d'elle (#8747
    /// retiré) : elle garde son glissé, son pincement, son zoom, et la toucher
    /// permute les flux.
    func test_selfTile_carriesNoControlAroundIt_onlyTheZoom() throws {
        let code = try callViewCode()
        let pip = try block("var pipView: some View {", until: "var videoAutoPaused: Bool {", in: code)
        XCTAssertFalse(pip.contains("selfTileControlRows("), "Plus de rangées autour de la vignette")
        XCTAssertTrue(pip.contains("selfTileZoomSlot(tileSize: size)"), "Le zoom reste dans la vignette")
        XCTAssertFalse(pip.contains("tapCameraMenu"), "Plus de grille repliée dans la vignette")
        XCTAssertFalse(code.contains("foldedCameraButton"))
        XCTAssertFalse(code.contains("cameraControlsGrid"))
        XCTAssertTrue(pip.contains(".onTapGesture { tapPictureInPicture() }"), "Toucher la vignette permute (contrôles rendus d’abord, G1.9)")
        XCTAssertTrue(pip.contains("selfTilePinchGesture"))
        let center = try block("func pipCenter(", until: "func pipTileSize(", in: code)
        XCTAssertFalse(center.contains("restingCenter"), "La vignette ne réserve plus la place de rangées")
    }

    /// Loi 4 — la vignette du duo établi porte la couleur de qui elle montre,
    /// comme ma vignette à l'appel entrant : jamais un trait blanc neutre.
    func test_pipStroke_carriesTheColorOfWhoIsInTheTile() throws {
        let code = try callViewCode()
        let pip = try block("var pipView: some View {", until: "var videoAutoPaused: Bool {", in: code)
        XCTAssertTrue(pip.contains("CallSelfTileStroke.colorKey(showsLocal: !effectiveSwapStreams"), "La couleur suit le flux montré dans la vignette")
        XCTAssertTrue(pip.contains("lineWidth: CallSelfTileStroke.lineWidth"))
        let chrome = try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTileChrome.swift")
        XCTAssertTrue(chrome.contains("Color(hex: CallSpeakerColor.hex(for: key))"), "La fonction partagée, jamais une palette locale")
    }

    func test_cameraZoom_followsMyFullScreenImage_neverTheTile() throws {
        let code = try callViewCode()
        let pip = try block("var pipView: some View {", until: "var videoAutoPaused: Bool {", in: code)
        XCTAssertFalse(pip.contains("callCameraZoom"), "Pincer la vignette la redimensionne, il ne zoome pas")
        XCTAssertTrue(pip.contains("selfTileZoomSlot(tileSize: size)"), "Le zoom de la vignette est un bouton dans la vignette")
        XCTAssertTrue(code.contains(".callCameraZoom(isEnabled: effectiveSwapStreams)"))
        let lens = try block("var zoomLensRail: some View {", until: "\n    }\n", in: code)
        XCTAssertTrue(lens.contains("CallCameraRail.isShown("))
        XCTAssertTrue(lens.contains("CallZoomLensCapsule()"), "Mon image en plein écran : les pastilles de zoom, et rien d'autre")
        XCTAssertTrue(lens.contains("alignment: .top"), "Mon image en plein écran : le zoom en haut au centre")
        XCTAssertFalse(lens.contains("railActionButton"), "Les commandes de ma caméra sont dans leur rail (#17327)")
        let capsule = try block("struct CallZoomLensCapsule: View {", until: "\n}\n", in: code)
        XCTAssertTrue(capsule.contains("CallCameraZoomAccessibilityElement()"))
        let stage = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/GroupCallStageView.swift")
        )
        XCTAssertTrue(stage.contains(".callCameraZoom(isEnabled: tile.isLocal && tile.showsVideo)"))
        XCTAssertTrue(stage.contains("GroupCallSpotlight.featuresLocal(focus)"))
    }

    /// Le bouton PiP et le glissé quittent le plein écran par la même entrée.
    func test_pipSwipe_leavesFullScreenThroughTheSameEntry() throws {
        let code = try callViewCode()
        XCTAssertTrue(code.contains("case .systemPiP: enterSystemPiP()"))
        XCTAssertTrue(code.contains("CallPiPPolicy.shouldFallBackToPill("))
        XCTAssertTrue(code.contains("CallPiPPolicy.swipeDownOutcome("))
    }

    /// G3.2 — l'option Enregistrer : titre centré, phrase d'accord, deux puces larges
    /// Audio | Vidéo côte à côte qui lancent la demande ; aucune rangée défilante.
    func test_recordingPanel_isCenteredTitle_consentLine_andTwoWideChoices() throws {
        let recording = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Recording.swift"))
        let launch = try block("var recordingPanelRows: some View {", until: "\n    }\n", in: recording)
        XCTAssertTrue(launch.contains("callManager.recording.request(kind: kind)"), "Un choix lance aussitôt la demande d'accord")
        XCTAssertTrue(launch.contains("closePanel()"))
        let controls = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallRecordingControls.swift"))
        let panel = try block("struct CallRecordingPanel: View {", until: "/// La couche d'enregistrement", in: try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallRecordingControls.swift"))
        XCTAssertFalse(panel.contains("CallPillRow"), "Deux puces larges côte à côte, pas une rangée défilante de 68 pt")
        XCTAssertFalse(panel.contains("CallPillChip"))
        XCTAssertTrue(panel.contains("CallRecordingCopy.consent"), "Tout le monde doit accepter : la phrase est écrite")
        XCTAssertTrue(panel.contains("CallRecordingChoiceChip("))
        XCTAssertTrue(controls.contains("callChipGlass("), "La puce est le verre adaptatif, jamais un verre dessiné")
        let row = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallPillRow.swift"))
        let header = try block("struct CallPanelHeader: View {", until: "struct CallPanelHeaderButton", in: row)
        XCTAssertFalse(header.contains("Spacer(minLength: 0)"), "Le titre est centré, il ne suit pas le Retour")
        XCTAssertTrue(header.contains(".frame(maxWidth: .infinity)"))
        let pill = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Pill.swift"))
        XCTAssertTrue(pill.contains("layer.captionsBaseRow"), "La rangée de base n'est pas légendée sous une option")
    }
}
