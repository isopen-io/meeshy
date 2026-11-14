import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K14 — la capsule de statut, lue comme des VALEURS : la recette, la loi du
/// temps (durée, silence), la nature, le contraste, puis la séance d'un hôte
/// (haptique, annonce, minuteur) avec horloge, sommeil et effets injectés. Les
/// mesures viennent du fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyStatusCapsule")
struct MeeshyStatusCapsuleTests {

    // MARK: - Recette

    @Test("la recette suit les vecteurs : rayon, largeur, marges, tailles, seuils")
    func recipe_followsTheVectors() throws {
        let recipe = try Self.object("recipe")
        #expect(Double(MeeshyStatusCapsuleRecipe.radius) == recipe["radius"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.maxWidth) == recipe["maxWidth"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.paddingVertical) == recipe["paddingVertical"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.paddingHorizontal) == recipe["paddingHorizontal"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.gap) == recipe["gap"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.iconSize) == recipe["iconSize"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.messageSize) == recipe["messageSize"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.detailSize) == recipe["detailSize"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.actionHeight) == recipe["actionHeight"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.actionPaddingHorizontal) == recipe["actionPaddingHorizontal"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.actionGap) == recipe["actionGap"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.actionGlyphSize) == recipe["actionGlyphSize"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.actionSize) == recipe["actionSize"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.edgeGap) == recipe["edgeGap"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.sideMargin) == recipe["sideMargin"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.slideOffset) == recipe["slideOffset"] as? Double)
        #expect(Double(MeeshyStatusCapsuleRecipe.dismissThreshold) == recipe["dismissThreshold"] as? Double)
        #expect(MeeshyStatusCapsuleRecipe.detailOpacity == recipe["detailOpacity"] as? Double)
        #expect(MeeshyStatusCapsuleRecipe.actionPressedOpacity == recipe["actionPressedOpacity"] as? Double)
        #expect(MeeshyStatusCapsuleRecipe.reducedFadeSeconds * 1000 == recipe["reducedFadeMs"] as? Double)
        #expect(MeeshyStatusCapsuleRecipe.messageLines(isAccessibilitySize: false) == recipe["messageLines"] as? Int)
        #expect(MeeshyStatusCapsuleRecipe.messageLines(isAccessibilitySize: true) == recipe["messageLinesLargeText"] as? Int)
    }

    @Test("la cible de l'action et du ✕ est de 44 pt, l'action se dessine en 36")
    func recipe_tapTargetCoversTheDrawnAction() throws {
        let tapTarget = try #require(try Self.object("recipe")["tapTarget"] as? [String: Any])
        #expect(Double(MeeshyStatusCapsuleRecipe.tapTarget) == tapTarget["ios"] as? Double)
        #expect(MeeshyStatusCapsuleRecipe.tapTarget >= MeeshyControlSize.tapTarget)
        #expect(MeeshyStatusCapsuleRecipe.actionHeight < MeeshyStatusCapsuleRecipe.tapTarget)
    }

    @Test("les mesures sont des jetons du design system, pas des nombres propres")
    func recipe_isMadeOfTokens() {
        #expect(MeeshyStatusCapsuleRecipe.radius == MeeshyRadius.xlPlus)
        #expect(MeeshyStatusCapsuleRecipe.paddingVertical == MeeshySpacing.smPlus)
        #expect(MeeshyStatusCapsuleRecipe.paddingHorizontal == MeeshySpacing.mdPlus)
        #expect(MeeshyStatusCapsuleRecipe.gap == MeeshySpacing.smPlus)
        #expect(MeeshyStatusCapsuleRecipe.edgeGap == MeeshySpacing.mdPlus)
        #expect(MeeshyStatusCapsuleRecipe.sideMargin == MeeshySpacing.xl)
        #expect(MeeshyStatusCapsuleRecipe.actionHeight == MeeshyControlSize.regular)
        #expect(MeeshyStatusCapsuleRecipe.actionPaddingHorizontal == MeeshySpacing.lg)
        #expect(MeeshyStatusCapsuleRecipe.actionGap == MeeshySpacing.xsPlus)
        #expect(MeeshyStatusCapsuleRecipe.iconSize == MeeshyIconSize.lg)
        #expect(MeeshyStatusCapsuleRecipe.actionGlyphSize == MeeshyIconSize.sm)
        #expect(MeeshyStatusCapsuleRecipe.messageSize == MeeshyFont.subheadSize)
        #expect(MeeshyStatusCapsuleRecipe.detailSize == MeeshyFont.smallSize)
    }

    // MARK: - Ce que la face rend

    @Test("un message vide ou fait d'espaces ne rend rien ; un détail vide n'existe pas")
    func face_emptyMessageRendersNothing_emptyDetailIsAbsent() {
        #expect(!MeeshyStatusCapsuleRecipe.isVisible(message: ""))
        #expect(!MeeshyStatusCapsuleRecipe.isVisible(message: "  \n "))
        #expect(MeeshyStatusCapsuleRecipe.isVisible(message: "Dix scènes au maximum"))
        #expect(MeeshyStatusCapsuleRecipe.visibleDetail(nil) == nil)
        #expect(MeeshyStatusCapsuleRecipe.visibleDetail("") == nil)
        #expect(MeeshyStatusCapsuleRecipe.visibleDetail("  ") == nil)
        #expect(MeeshyStatusCapsuleRecipe.visibleDetail("Gardé en brouillon") == "Gardé en brouillon")
    }

    @Test("le lecteur d'écran lit « message, détail » ; le message seul sans détail")
    func face_spokenTextJoinsMessageAndDetail() {
        #expect(MeeshyStatusCapsuleRecipe.spokenText(message: "Non publié : le réel", detail: "Gardé en brouillon")
                == "Non publié : le réel, Gardé en brouillon")
        #expect(MeeshyStatusCapsuleRecipe.spokenText(message: "Dix scènes au maximum", detail: nil) == "Dix scènes au maximum")
        #expect(MeeshyStatusCapsuleRecipe.spokenText(message: "Dix scènes au maximum", detail: " ") == "Dix scènes au maximum")
    }

    @Test("l'action passe sous le texte en grande police, jamais autrement")
    func face_actionMovesBelowTheTextInLargeType() {
        #expect(MeeshyStatusCapsuleRecipe.actionIsBelowText(isAccessibilitySize: true))
        #expect(!MeeshyStatusCapsuleRecipe.actionIsBelowText(isAccessibilitySize: false))
    }

    @Test("le détail est à 85 % sur le verre sombre, en encre pleine sur le ton onLight")
    func face_detailInkOpacity() {
        #expect(MeeshyStatusCapsuleRecipe.detailInkOpacity(tone: .deep) == 0.85)
        #expect(MeeshyStatusCapsuleRecipe.detailInkOpacity(tone: .plain) == 0.85)
        #expect(MeeshyStatusCapsuleRecipe.detailInkOpacity(tone: .onLight) == 1)
    }

    @MainActor
    @Test("une capsule sans action ni fermeture ne prend aucun doigt ; avec l'une ou l'autre, oui")
    func face_touchTraversesWithoutActionOrDismiss() {
        #expect(!MeeshyStatusCapsuleRecipe.takesTouches(hasAction: false, hasDismiss: false))
        #expect(MeeshyStatusCapsuleRecipe.takesTouches(hasAction: true, hasDismiss: false))
        #expect(MeeshyStatusCapsuleRecipe.takesTouches(hasAction: false, hasDismiss: true))
    }

    @Test("le lecteur d'écran lit le texte, puis l'action, puis ✕, même quand l'action passe dessous")
    func face_readingOrder_textThenActionThenClose() {
        let order = MeeshyStatusCapsulePart.allCases.sorted {
            MeeshyStatusCapsuleRecipe.readingOrder($0) > MeeshyStatusCapsuleRecipe.readingOrder($1)
        }
        #expect(order == [.text, .action, .close])
    }

    // MARK: - Glisser pour fermer

    @Test("elle suit le doigt vers son bord seulement ; 24 pt ferment, en deçà elle revient")
    func dismiss_dragFollowsTowardTheEdgeOnly() {
        #expect(MeeshyStatusCapsuleRecipe.dragOffset(translation: 10, edge: .bottom) == 10)
        #expect(MeeshyStatusCapsuleRecipe.dragOffset(translation: -10, edge: .bottom) == 0)
        #expect(MeeshyStatusCapsuleRecipe.dragOffset(translation: -10, edge: .top) == -10)
        #expect(MeeshyStatusCapsuleRecipe.dragOffset(translation: 10, edge: .top) == 0)
        #expect(!MeeshyStatusCapsuleRecipe.shouldDismiss(translation: 23.9, edge: .bottom))
        #expect(MeeshyStatusCapsuleRecipe.shouldDismiss(translation: 24, edge: .bottom))
        #expect(MeeshyStatusCapsuleRecipe.shouldDismiss(translation: -24, edge: .top))
        #expect(!MeeshyStatusCapsuleRecipe.shouldDismiss(translation: -40, edge: .bottom))
    }

    // MARK: - La loi du temps

    @Test("la durée visible suit les vecteurs : durée × action × lecteur d'écran")
    func timing_visibleMilliseconds_followsTheVectors() throws {
        let timing = try Self.object("timing")
        #expect(MeeshyStatusCapsuleTiming.automaticMilliseconds == timing["automaticMs"] as? Int)
        #expect(MeeshyStatusCapsuleTiming.screenReaderMilliseconds == timing["screenReaderMs"] as? Int)
        #expect(MeeshyStatusCapsuleTiming.silenceMilliseconds == timing["silenceMs"] as? Int)
        for row in try Self.rows("visible") {
            let got = MeeshyStatusCapsuleTiming.visibleMilliseconds(
                duration: try Self.duration(row),
                hasAction: try #require(row["hasAction"] as? Bool),
                isScreenReaderOn: try #require(row["screenReader"] as? Bool)
            )
            #expect(got == row["ms"] as? Int, "\(row)")
        }
    }

    @Test("le même id redit dans les 2 s se tait ; à 2 s, ou pour un autre id, elle parle")
    func timing_speaks_followsTheVectors() throws {
        let origin = Date(timeIntervalSince1970: 1_000)
        for row in try Self.rows("silence") {
            let id = try #require(row["id"] as? String)
            let elapsed = try #require(row["elapsedMs"] as? Int)
            let last = (row["lastId"] as? String).map { MeeshyStatusCapsuleTiming.Spoken(id: $0, at: origin) }
            let now = origin.addingTimeInterval(Double(elapsed) / 1000)
            #expect(MeeshyStatusCapsuleTiming.speaks(id: id, at: now, last: last) == row["speaks"] as? Bool, "\(row)")
        }
    }

    @Test("la nature règle l'haptique, la priorité de l'annonce et le rôle ; elle ne colore rien")
    func kind_followsTheVectors() throws {
        for row in try Self.rows("kinds") {
            let kind = try kitRequired(MeeshyStatusCapsuleKind(rawValue: try kitRequired(row["kind"] as? String)))
            #expect(kind.feedback.rawValue == row["haptic"] as? String, "\(row)")
            #expect(kind.announcesUrgently == (row["priority"] as? String == "high"), "\(row)")
            #expect(kind.role.rawValue == row["role"] as? String, "\(row)")
        }
        #expect(MeeshyStatusCapsuleKind.allCases.count == 4)
    }

    // MARK: - Contraste

    @Test("le contraste du message, du détail et de l'action tient les vecteurs et le plancher de 4,5:1")
    func contrast_isComputedFromTheRecipe() throws {
        let contrast = try Self.object("contrast")
        let floor = try #require(contrast["floor"] as? Double)
        let deep = MeeshyStatusCapsuleRecipe.messageContrast(tone: .deep)
        let onLight = MeeshyStatusCapsuleRecipe.messageContrast(tone: .onLight)
        let detail = MeeshyStatusCapsuleRecipe.detailContrast(tone: .deep)
        let detailOnLight = MeeshyStatusCapsuleRecipe.detailContrast(tone: .onLight)
        let action = MeeshyStatusCapsuleRecipe.actionContrast()
        #expect(deep >= floor && deep >= (contrast["messageDeepDense"] as? Double ?? 99), "deep \(deep)")
        #expect(onLight >= floor && onLight >= (contrast["messageOnLight"] as? Double ?? 99), "onLight \(onLight)")
        #expect(detail >= floor && detail >= (contrast["detailDeepDense"] as? Double ?? 99), "détail \(detail)")
        #expect(detailOnLight >= onLight, "l'encre pleine ne contraste pas moins que le message")
        #expect(action >= floor && action >= (contrast["actionOnWhite"] as? Double ?? 99), "action \(action)")
    }

    // MARK: - Valeurs : l'élément et l'action

    @MainActor
    @Test("deux actions aux mêmes mots sont égales, fermetures différentes ; le libellé ou le glyphe les distinguent")
    func action_equality_comparesValuesNotClosures() {
        let retry = MeeshyStatusCapsuleAction(label: "Réessayer", systemImage: "arrow.clockwise") { _ = 1 }
        #expect(retry == MeeshyStatusCapsuleAction(label: "Réessayer", systemImage: "arrow.clockwise") { _ = 2 })
        #expect(retry != MeeshyStatusCapsuleAction(label: "Annuler", systemImage: "arrow.clockwise") {})
        #expect(retry != MeeshyStatusCapsuleAction(label: "Réessayer", systemImage: nil) {})
    }

    @MainActor
    @Test("deux éléments aux mêmes valeurs sont égaux ; l'id, le message ou la durée les distinguent ; défauts : info, automatique")
    func item_equality_comparesValuesNotClosures() {
        let base = MeeshyStatusCapsuleItem(id: "limit.scene", message: "Dix scènes au maximum")
        #expect(base.kind == .info)
        #expect(base.duration == .automatic)
        #expect(base == MeeshyStatusCapsuleItem(id: "limit.scene", message: "Dix scènes au maximum"))
        #expect(base != MeeshyStatusCapsuleItem(id: "limit.other", message: "Dix scènes au maximum"))
        #expect(base != MeeshyStatusCapsuleItem(id: "limit.scene", message: "Onze scènes"))
        #expect(base != MeeshyStatusCapsuleItem(id: "limit.scene", message: "Dix scènes au maximum", duration: .persistent))
    }

    @MainActor
    @Test("un même refus reposé avec une nouvelle occurrence est un autre élément : l'hôte relance son minuteur, le silence de 2 s tient")
    func item_occurrence_distinguishesARepresentation() {
        let first = MeeshyStatusCapsuleItem(id: "limit.text", message: "1000 caractères au maximum", kind: .warning)
        #expect(first.occurrence == 0)
        let again = MeeshyStatusCapsuleItem(id: "limit.text", message: "1000 caractères au maximum", kind: .warning, occurrence: 1)
        #expect(first != again)
        #expect(again == MeeshyStatusCapsuleItem(id: "limit.text", message: "1000 caractères au maximum", kind: .warning, occurrence: 1))
    }

    @MainActor
    @Test("reposé dans les 2 s sous une nouvelle occurrence : ni vibration ni annonce, mais le minuteur repart")
    func session_representedWithinTwoSeconds_restartsTheTimerSilently() async {
        let spy = SessionSpy()
        let session = spy.session()
        let first = MeeshyStatusCapsuleItem(id: "limit.text", message: "1000 caractères au maximum", kind: .warning)
        await session.run(first, haptic: .automatic, retire: spy.retire)
        spy.events = []
        spy.advance(milliseconds: 500)
        let again = MeeshyStatusCapsuleItem(id: "limit.text", message: "1000 caractères au maximum", kind: .warning, occurrence: 1)
        await session.run(again, haptic: .automatic, retire: spy.retire)
        #expect(spy.events.isEmpty)
        #expect(spy.sleeps == [4000, 4000])
    }

    // MARK: - La séance d'un hôte

    @MainActor
    @Test("à l'apparition : un seul haptique par id, choisi par la nature, et une annonce « message, détail » à la bonne priorité")
    func session_playsHapticAndAnnouncesOncePerId() async {
        let spy = SessionSpy()
        let session = spy.session()
        let failure = MeeshyStatusCapsuleItem(id: "publish.partial", message: "Non publié : le réel", detail: "Gardé en brouillon",
                                              kind: .failure, duration: .persistent)
        await session.run(failure, haptic: .automatic, retire: spy.retire)
        #expect(spy.events == ["haptic:error", "announce:Non publié : le réel, Gardé en brouillon:urgent"])
        let info = MeeshyStatusCapsuleItem(id: "net.off", message: "Story enregistrée", kind: .info, duration: .persistent)
        spy.events = []
        await session.run(info, haptic: .automatic, retire: spy.retire)
        #expect(spy.events == ["haptic:light", "announce:Story enregistrée:normal"])
    }

    @MainActor
    @Test("haptic none : l'hôte ne vibre pas, il annonce encore")
    func session_hapticNone_staysSilentOnTheFinger() async {
        let spy = SessionSpy()
        await spy.session().run(MeeshyStatusCapsuleItem(id: "a", message: "Plafond", kind: .warning, duration: .persistent),
                                haptic: .none, retire: spy.retire)
        #expect(spy.events == ["announce:Plafond:normal"])
    }

    @MainActor
    @Test("le même id représenté dans les 2 s ne vibre ni ne s'annonce ; après 2 s, si")
    func session_sameIdWithinTwoSeconds_staysSilent() async {
        let spy = SessionSpy()
        let session = spy.session()
        let item = MeeshyStatusCapsuleItem(id: "limit.text", message: "1000 caractères au maximum", kind: .warning, duration: .persistent)
        await session.run(item, haptic: .automatic, retire: spy.retire)
        spy.events = []
        spy.advance(milliseconds: 1999)
        await session.run(item, haptic: .automatic, retire: spy.retire)
        #expect(spy.events.isEmpty)
        spy.advance(milliseconds: 2001)
        await session.run(item, haptic: .automatic, retire: spy.retire)
        #expect(spy.events == ["haptic:warning", "announce:1000 caractères au maximum:normal"])
    }

    @MainActor
    @Test("sans action : elle se retire à l'heure de la loi (4 s, 6 s sous lecteur d'écran), en visant son id")
    func session_retiresAtTheLawsTime() async {
        let spy = SessionSpy()
        let item = MeeshyStatusCapsuleItem(id: "limit.image", message: "10 images au maximum", kind: .warning)
        await spy.session().run(item, haptic: .automatic, retire: spy.retire)
        #expect(spy.sleeps == [4000])
        #expect(spy.retired == ["limit.image"])
        let reader = SessionSpy(screenReader: true)
        await reader.session().run(item, haptic: .automatic, retire: reader.retire)
        #expect(reader.sleeps == [6000])
        #expect(reader.retired == ["limit.image"])
    }

    @MainActor
    @Test("avec une action elle reste tant que l'hôte ne la retire pas : aucun minuteur")
    func session_withAction_staysUntilRetired() async {
        let spy = SessionSpy()
        let item = MeeshyStatusCapsuleItem(
            id: "publish.partial", message: "Non publié : le réel", kind: .failure,
            action: MeeshyStatusCapsuleAction(label: "Réessayer", systemImage: "arrow.clockwise") {}
        )
        await spy.session().run(item, haptic: .automatic, retire: spy.retire)
        #expect(spy.sleeps.isEmpty)
        #expect(spy.retired.isEmpty)
    }

    @MainActor
    @Test("une durée imposée par l'hôte s'applique, relevée à 6 s sous lecteur d'écran")
    func session_imposedDuration_isHonoured() async {
        let spy = SessionSpy()
        let item = MeeshyStatusCapsuleItem(id: "x", message: "Court", duration: .milliseconds(2500))
        await spy.session().run(item, haptic: .automatic, retire: spy.retire)
        #expect(spy.sleeps == [2500])
    }

    @MainActor
    @Test("un minuteur annulé par le remplacement ne ferme jamais le successeur")
    func session_cancelledTimer_neverRetiresTheSuccessor() async {
        let spy = SessionSpy(sleepThrows: true)
        let item = MeeshyStatusCapsuleItem(id: "first", message: "Premier")
        await spy.session().run(item, haptic: .automatic, retire: spy.retire)
        #expect(spy.retired.isEmpty)
    }

    // MARK: - Source

    @Test("la face ne vibre jamais : seul le site unique de l'hôte appelle HapticFeedback")
    func source_onlyTheHostPlaysHaptics() throws {
        #expect(!(try Self.code("MeeshyStatusCapsule.swift")).contains("HapticFeedback."))
        #expect(!(try Self.code("MeeshyStatusCapsuleRecipe.swift")).contains("HapticFeedback."))
        #expect(try Self.code("MeeshyStatusCapsuleHost.swift").contains("HapticFeedback."))
    }

    @Test("le verre ne passe que par K01 ; aucun singleton, aucune couleur en dur dans les fichiers de K14")
    func source_hasNoDirectGlassNoSingletonNoLiteralColor() throws {
        let files = ["MeeshyStatusCapsule.swift", "MeeshyStatusCapsuleRecipe.swift", "MeeshyStatusCapsuleHost.swift",
                     "Catalog/MeeshyKitCatalog+K14.swift"]
        let forbidden = [
            "Color(hex:", "Color(red:", "Color(white:", "Color.white", "Color.black", "Color.gray", "Color.red",
            "(.white", "(.black", "#FF", "0x", "glassEffect", "adaptiveGlass", "adaptiveLiquidGlass", "UIBlurEffect",
            "Material", ".blur(", ".shadow(", ".shared", "static let shared", "GeometryReader",
        ]
        for file in files {
            let code = try Self.code(file)
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
        #expect(try Self.code("MeeshyStatusCapsule.swift").contains(".meeshyGlass(in:"))
    }

    @Test("seules la translation et l'opacité s'animent : ni largeur, ni flou, ni ombre")
    func source_animatesOnlyTransformAndOpacity() throws {
        let code = try Self.code("MeeshyStatusCapsuleHost.swift") + (try Self.code("MeeshyStatusCapsule.swift"))
        #expect(!code.contains(".frame(width"))
        #expect(!code.contains("scaleEffect"))
        #expect(code.contains(".offset("))
        #expect(code.contains(".opacity("))
    }

    // MARK: - Aides

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K14-MeeshyStatusCapsule.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
    }

    private static func duration(_ row: [String: Any]) throws -> MeeshyStatusCapsuleDuration {
        switch try #require(row["duration"] as? String) {
        case "automatic": return .automatic
        case "persistent": return .persistent
        default: return .milliseconds(try #require(row["value"] as? Int))
        }
    }

    /// Le code d'un fichier du kit, commentaires de ligne retirés.
    private static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}

/// Les effets d'une séance, enregistrés : l'horloge avance à la main, le
/// sommeil rend la main tout de suite en notant sa durée.
@MainActor
private final class SessionSpy {
    var events: [String] = []
    var sleeps: [Int] = []
    var retired: [String] = []
    private var now = Date(timeIntervalSince1970: 5_000)
    private let screenReader: Bool
    private let sleepThrows: Bool

    init(screenReader: Bool = false, sleepThrows: Bool = false) {
        self.screenReader = screenReader
        self.sleepThrows = sleepThrows
    }

    func advance(milliseconds: Int) {
        now = now.addingTimeInterval(Double(milliseconds) / 1000)
    }

    func retire(_ id: String) {
        retired.append(id)
    }

    func session() -> MeeshyStatusCapsuleSession {
        MeeshyStatusCapsuleSession(effects: MeeshyStatusCapsuleSession.Effects(
            play: { [self] in events.append("haptic:\($0.rawValue)") },
            announce: { [self] text, urgent in events.append("announce:\(text):\(urgent ? "urgent" : "normal")") },
            now: { [self] in now },
            sleep: { [self] milliseconds in
                sleeps.append(milliseconds)
                if sleepThrows { throw CancellationError() }
            },
            isScreenReaderOn: { [self] in screenReader }
        ))
    }
}
