import XCTest
import MeeshySDK
@testable import Meeshy

/// Correctif « rangée vide » (2026-08-17) — bug utilisateur : « certains
/// messages de Script et Focal … ont le contenu VIDE, pourtant en mode
/// bulle on y voit quelque chose ». `content.location != nil` et le panier
/// `.nonMedia` de `content.attachments` (fichier, ou lieu hérité du cache
/// local) font tous deux compter `BubbleContent.hasTextOrNonMediaContent`
/// comme VRAI (`BubbleContent.swift:192-217`), donc `FocalRow.textOrEmojiBlock`
/// montait `textBlock` — mais `textBlock` ne rend QUE
/// `content.translation?.preferredContent ?? content.text?.raw ?? ""`, une
/// CHAÎNE VIDE pour un message « lieu seul »/« fichier seul » sans texte
/// propre. `BubbleLocationRenderingTests` documentait déjà EXACTEMENT cette
/// même classe de bug côté bulle (route corrigée) ; le Fil en avait hérité
/// sans le correctif équivalent.
///
/// Ces témoins couvrent la DÉCISION pure (`FocalNonMediaGate.shouldRender`)
/// et le TEXTE de repli (`MessageAccessibilityLabelComposer.
/// nonMediaAccessibilityParts`, élargi de `private` à `internal` pour que
/// `FocalNonMediaBlock` réutilise la MÊME loi — jamais une seconde
/// résolution). Aucun rendu SwiftUI réel n'est exercé (garde §7-R15,
/// « aucun snapshot, aucun test de rendu ») : la preuve porte sur les
/// fonctions pures que `FocalRow`/`FocalNonMediaBlock` appellent, même
/// discipline que `FocalAudioRoutingTests`/`FocalMediaProtectionTests`.
@MainActor
final class FocalNonMediaBlockTests: XCTestCase {

    // MARK: - Fabrique minimale (même patron que `FocalAudioRoutingTests`)

    private func makeContent(
        text: String? = nil,
        attachments: BubbleContent.Attachments = .none,
        location: SharedPlace? = nil,
        isEmojiOnly: Bool = false
    ) -> BubbleContent {
        BubbleContent(
            messageId: "m1",
            kind: .standard,
            text: text.map {
                BubbleContent.Text(
                    raw: $0, isEmojiOnly: isEmojiOnly, emojiFontSize: nil,
                    firstLinkURL: nil, embeddedVideo: nil, trackedLinks: [:], embedTrackedURL: nil
                )
            },
            translation: nil,
            reply: nil,
            attachments: attachments,
            location: location,
            ephemeral: nil,
            isBlurred: false,
            isViewOnce: false,
            isPinned: false,
            isForwarded: false,
            editedAt: nil,
            isEditSaving: false,
            hasEditHistory: false,
            reactions: [],
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: nil),
            isMe: false,
            senderName: "Ali",
            callNotice: nil
        )
    }

    private func makePlace() -> SharedPlace {
        SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel", address: "Champ de Mars, Paris")
    }

    private func fileAttachment(id: String = "f1", name: String = "budget.pdf") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, fileName: name, originalName: name, mimeType: "application/pdf", fileSize: 1)
    }

    private func audioAttachment(id: String = "a1") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, fileName: "a", originalName: "a", mimeType: "audio/mpeg", fileSize: 1)
    }

    private func visualAttachment(id: String = "v1") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, fileName: "v", originalName: "v", mimeType: "image/jpeg", fileSize: 1)
    }

    // MARK: - 1. Reproduction du bug : l'ancien `textBlock` rendait "" pour ces cas

    /// Preuve autonome, sans instancier de View : reproduit littéralement
    /// l'expression de `FocalRow.textBlock`
    /// (`content.translation?.preferredContent ?? content.text?.raw ?? ""`)
    /// pour un message « lieu seul ». `hasTextOrNonMediaContent` est VRAI
    /// (c'était le seul signal lu par `textOrEmojiBlock` avant ce correctif)
    /// alors que le texte effectif est VIDE — exactement la rangée blanche
    /// du rapport utilisateur.
    func test_locationOnly_hadTextOrNonMediaContentTrue_butEffectiveTextWasEmpty() {
        let content = makeContent(location: makePlace())
        XCTAssertTrue(content.hasTextOrNonMediaContent, "hasTextOrNonMediaContent doit rester vrai (lieu = contenu)")
        let oldTextBlockValue = content.translation?.preferredContent ?? content.text?.raw ?? ""
        XCTAssertEqual(oldTextBlockValue, "", "avant ce correctif, textBlock rendait une chaîne vide pour un message lieu seul")
    }

    /// Même preuve pour un fichier seul (`.nonMedia`).
    func test_fileOnly_hadTextOrNonMediaContentTrue_butEffectiveTextWasEmpty() {
        let content = makeContent(attachments: .nonMedia([fileAttachment()]))
        XCTAssertTrue(content.hasTextOrNonMediaContent)
        let oldTextBlockValue = content.translation?.preferredContent ?? content.text?.raw ?? ""
        XCTAssertEqual(oldTextBlockValue, "")
    }

    // MARK: - 2. `FocalNonMediaGate.shouldRender` — la décision qui corrige le trou

    func test_gate_locationOnly_rendersNow() {
        XCTAssertTrue(FocalNonMediaGate.shouldRender(hasSharedPlace: true, nonMediaCount: 0, audioMode: .none))
    }

    func test_gate_fileOnly_rendersNow() {
        XCTAssertTrue(FocalNonMediaGate.shouldRender(hasSharedPlace: false, nonMediaCount: 1, audioMode: .none))
    }

    func test_gate_locationAndFile_rendersNow() {
        XCTAssertTrue(FocalNonMediaGate.shouldRender(hasSharedPlace: true, nonMediaCount: 1, audioMode: .none))
    }

    /// Un message qui a DÉJÀ du texte (jamais vide avant) continue de rendre
    /// le bloc lieu/fichier EN PLUS du texte — additif, pas un remplacement
    /// (parité avec `bubbleInnerContent`, qui empile lieu → fichiers →
    /// texte dans le même VStack).
    func test_gate_locationWithText_stillRenders() {
        XCTAssertTrue(FocalNonMediaGate.shouldRender(hasSharedPlace: true, nonMediaCount: 0, audioMode: .none))
    }

    /// Ni lieu ni fichier ⇒ rien à décrire, le bloc ne se monte pas —
    /// `textOrEmojiBlock` reste seul responsable (pas de rangée vide
    /// supplémentaire, pas de double affichage).
    func test_gate_neitherLocationNorFile_doesNotRender() {
        XCTAssertFalse(FocalNonMediaGate.shouldRender(hasSharedPlace: false, nonMediaCount: 0, audioMode: .none))
    }

    /// Média pur (photo/vidéo/audio SEUL, sans lieu ni fichier) : jamais
    /// concerné par ce correctif — `FocalAttachmentBlock`/`FocalAudioBlock`
    /// le rendaient déjà (F-082), le gate doit rester silencieux.
    func test_gate_pureVisualOrAudio_doesNotRender() {
        XCTAssertFalse(FocalNonMediaGate.shouldRender(hasSharedPlace: false, nonMediaCount: 0, audioMode: .soleWithFooter))
    }

    /// Parité bulle ASSUMÉE (pas une correction inventée) : quand l'audio
    /// héberge déjà la légende (`.hostsCaption`), la bulle elle-même
    /// n'atteint jamais `textBubbleContent` — donc pas le lieu/fichier non
    /// plus. Le gate doit reproduire EXACTEMENT cette même retenue, jamais
    /// « corriger » un cas que la bulle ne couvre pas elle-même.
    func test_gate_audioHostsCaption_neverRenders_evenWithLocationOrFile() {
        XCTAssertFalse(FocalNonMediaGate.shouldRender(hasSharedPlace: true, nonMediaCount: 0, audioMode: .hostsCaption))
        XCTAssertFalse(FocalNonMediaGate.shouldRender(hasSharedPlace: false, nonMediaCount: 3, audioMode: .hostsCaption))
    }

    /// Matrice bout-en-bout : `FocalAudioRouting.mode(for:)` (déjà testé
    /// isolément par `FocalAudioRoutingTests`) alimente directement le gate
    /// — vérifie l'intégration des deux lois pures sans rendu.
    func test_gate_integratesWithRealAudioRoutingMode_forMixedAudioPlusFile_noVisual() {
        // `.mixed` audio + fichier, sans visuel, sans texte, sans reply :
        // `FocalAudioRouting.mode` retombe sur `.hostsCaption` (le fichier
        // agit alors comme le canal `hasTextOrNonMediaContent` qui déclenche
        // la légende) — le gate doit rester silencieux, parité bulle.
        let content = makeContent(attachments: .mixed(visual: [], audio: [audioAttachment()], nonMedia: [fileAttachment()]))
        let mode = FocalAudioRouting.mode(for: content)
        XCTAssertEqual(mode, .hostsCaption)
        XCTAssertFalse(FocalNonMediaGate.shouldRender(hasSharedPlace: false, nonMediaCount: 1, audioMode: mode))
    }

    /// Audio + visuel + fichier (`.standalone`, pas de légende hébergée) :
    /// la bulle rend le fichier via `textBubbleContent` en parallèle de
    /// l'audio et de la grille — le gate doit rendre aussi.
    func test_gate_integratesWithRealAudioRoutingMode_forAudioVisualAndFile() {
        let content = makeContent(attachments: .mixed(visual: [visualAttachment()], audio: [audioAttachment()], nonMedia: [fileAttachment()]))
        let mode = FocalAudioRouting.mode(for: content)
        XCTAssertEqual(mode, .standalone)
        XCTAssertTrue(FocalNonMediaGate.shouldRender(hasSharedPlace: false, nonMediaCount: 1, audioMode: mode))
    }

    // MARK: - 3. Le texte de repli n'est JAMAIS vide, JAMAIS inventé

    /// Réutilise la loi WS-1 élargie (`internal`) — mêmes clés i18n que
    /// VoiceOver, jamais une seconde résolution.
    func test_fallbackText_location_isNeverEmpty_andMatchesTheSharedA11yKey() {
        let expected = String(localized: "a11y.message.location", bundle: .main)
        let parts = MessageAccessibilityLabelComposer.nonMediaAccessibilityParts(hasSharedPlace: true, nonMedia: [])
        XCTAssertEqual(parts, [expected])
        XCTAssertFalse(expected.isEmpty)
    }

    func test_fallbackText_file_citesTheRealFileName_neverAGenericPlaceholder() {
        let parts = MessageAccessibilityLabelComposer.nonMediaAccessibilityParts(
            hasSharedPlace: false,
            nonMedia: [fileAttachment(name: "budget.pdf")]
        )
        XCTAssertEqual(parts.count, 1)
        XCTAssertTrue(parts[0].contains("budget.pdf"), "le repli doit citer le VRAI nom de fichier, jamais une donnée inventée")
    }

    func test_fallbackText_locationAndFile_bothAppear_locationOnce() {
        let locationLabel = String(localized: "a11y.message.location", bundle: .main)
        let parts = MessageAccessibilityLabelComposer.nonMediaAccessibilityParts(
            hasSharedPlace: true,
            nonMedia: [fileAttachment(name: "rapport.pdf")]
        )
        XCTAssertEqual(parts.count, 2)
        XCTAssertEqual(parts.filter { $0 == locationLabel }.count, 1)
        XCTAssertTrue(parts[1].contains("rapport.pdf"))
    }

    // MARK: - 4. `FocalNonMediaBlock` — Equatable (même patron que `FocalRichBlockEquatableTests`)

    func test_focalNonMediaBlock_equatable_sameInputs_isEqual() {
        let items = [fileAttachment(id: "f1")]
        let lhs = FocalNonMediaBlock(hasSharedPlace: true, items: items, isDark: false)
        let rhs = FocalNonMediaBlock(hasSharedPlace: true, items: items, isDark: false)
        XCTAssertEqual(lhs, rhs)
    }

    func test_focalNonMediaBlock_equatable_differentSharedPlace_isNotEqual() {
        let items = [fileAttachment(id: "f1")]
        let lhs = FocalNonMediaBlock(hasSharedPlace: true, items: items, isDark: false)
        let rhs = FocalNonMediaBlock(hasSharedPlace: false, items: items, isDark: false)
        XCTAssertNotEqual(lhs, rhs)
    }

    func test_focalNonMediaBlock_equatable_differentItemIds_isNotEqual() {
        let lhs = FocalNonMediaBlock(hasSharedPlace: false, items: [fileAttachment(id: "f1")], isDark: false)
        let rhs = FocalNonMediaBlock(hasSharedPlace: false, items: [fileAttachment(id: "f2")], isDark: false)
        XCTAssertNotEqual(lhs, rhs)
    }

    // MARK: - 5. Garde source — câblage réel dans `FocalRow.swift`

    private func focalRowSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// La rangée doit réellement MONTER le bloc — un correctif qui n'ajoute
    /// que le fichier sans le câbler laisserait le bug intact.
    func test_focalRow_actuallyMountsTheNonMediaBlock() throws {
        let stripped = AppSourceGuard.stripComments(try focalRowSource())
        XCTAssertTrue(
            stripped.contains("nonMediaBlock"),
            "FocalRow.swift doit monter nonMediaBlock dans standardBody — sinon le correctif est mort code"
        )
        XCTAssertTrue(
            stripped.contains("FocalNonMediaGate.shouldRender("),
            "FocalRow.swift doit déléguer la décision à FocalNonMediaGate.shouldRender — jamais une garde ré-écrite en ligne"
        )
    }
}
