import XCTest
import MeeshySDK
@testable import Meeshy

/// LOT 3.2 (matrice §5 « Focal Grandeur Nature ») — le repli texte inerte du
/// correctif « rangée vide » (2026-08-17) est remplacé par le rendu RÉEL :
/// carte lieu (`LocationMessageView`, réutilisée telle quelle) + cartes
/// fichier (`BubbleAttachmentView`, une par pièce du panier `.nonMedia` —
/// badge de téléchargement et visionneuse inchangés). Le bloc reste posé NU
/// au retrait `FocalMetrics.Text.indent`, sans bulle ni capsule.
///
/// Ces témoins couvrent :
/// 1. l'HISTORIQUE du bug (l'ancien `textBlock` rendait "" pour lieu
///    seul/fichier seul — preuve conservée, elle documente pourquoi le gate
///    existe) ;
/// 2. la DÉCISION pure `FocalNonMediaGate.shouldRender`, INCHANGÉE par ce
///    lot ;
/// 3. la loi partagée `MessageAccessibilityLabelComposer.
///    nonMediaAccessibilityParts` — désormais label d'accessibilité de la
///    carte lieu et repli de transition du site d'appel historique, jamais
///    une seconde résolution ;
/// 4. l'`Equatable` du bloc (ids + présence lieu + primitives de rendu ;
///    les closures ne participent JAMAIS) ;
/// 5. des gardes source : `FocalRow` monte bien le bloc, et le bloc rend
///    bien les cartes réelles (la boucle du repli texte est MORTE).
///
/// Aucun rendu SwiftUI réel n'est exercé (garde §7-R15, « aucun snapshot,
/// aucun test de rendu ») : la preuve porte sur les fonctions pures et le
/// code source, même discipline que `FocalAudioRoutingTests`/
/// `FocalMediaProtectionTests`.
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
            forwardAttribution: nil,
            editedAt: nil,
            isEditSaving: false,
            hasEditHistory: false,
            reactions: [],
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: nil),
            isMe: false,
            senderName: "Ali",
            callNotice: nil, joinNotice: nil
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

    // MARK: - 1. Historique : l'ancien `textBlock` rendait "" pour ces cas

    /// Preuve autonome, sans instancier de View : reproduit littéralement
    /// l'expression de `FocalRow.textBlock`
    /// (`content.translation?.preferredContent ?? content.text?.raw ?? ""`)
    /// pour un message « lieu seul ». `hasTextOrNonMediaContent` est VRAI
    /// alors que le texte effectif est VIDE — la rangée blanche du rapport
    /// utilisateur du 2026-08-17, raison d'être du gate.
    func test_locationOnly_hadTextOrNonMediaContentTrue_butEffectiveTextWasEmpty() {
        let content = makeContent(location: makePlace())
        XCTAssertTrue(content.hasTextOrNonMediaContent, "hasTextOrNonMediaContent doit rester vrai (lieu = contenu)")
        let oldTextBlockValue = content.translation?.preferredContent ?? content.text?.raw ?? ""
        XCTAssertEqual(oldTextBlockValue, "", "avant le gate, textBlock rendait une chaîne vide pour un message lieu seul")
    }

    /// Même preuve pour un fichier seul (`.nonMedia`).
    func test_fileOnly_hadTextOrNonMediaContentTrue_butEffectiveTextWasEmpty() {
        let content = makeContent(attachments: .nonMedia([fileAttachment()]))
        XCTAssertTrue(content.hasTextOrNonMediaContent)
        let oldTextBlockValue = content.translation?.preferredContent ?? content.text?.raw ?? ""
        XCTAssertEqual(oldTextBlockValue, "")
    }

    // MARK: - 2. `FocalNonMediaGate.shouldRender` — décision INCHANGÉE par le LOT 3.2

    func test_gate_locationOnly_rendersNow() {
        XCTAssertTrue(FocalNonMediaGate.shouldRender(hasSharedPlace: true, nonMediaCount: 0, audioMode: .none))
    }

    func test_gate_fileOnly_rendersNow() {
        XCTAssertTrue(FocalNonMediaGate.shouldRender(hasSharedPlace: false, nonMediaCount: 1, audioMode: .none))
    }

    func test_gate_locationAndFile_rendersNow() {
        XCTAssertTrue(FocalNonMediaGate.shouldRender(hasSharedPlace: true, nonMediaCount: 1, audioMode: .none))
    }

    /// Un message qui a DÉJÀ du texte continue de rendre le bloc lieu/fichier
    /// EN PLUS du texte — additif, pas un remplacement (parité avec
    /// `bubbleInnerContent`, qui empile lieu → fichiers → texte).
    func test_gate_locationWithText_stillRenders() {
        XCTAssertTrue(FocalNonMediaGate.shouldRender(hasSharedPlace: true, nonMediaCount: 0, audioMode: .none))
    }

    /// Ni lieu ni fichier ⇒ rien à rendre, le bloc ne se monte pas —
    /// `textOrEmojiBlock` reste seul responsable (pas de rangée vide
    /// supplémentaire, pas de double affichage).
    func test_gate_neitherLocationNorFile_doesNotRender() {
        XCTAssertFalse(FocalNonMediaGate.shouldRender(hasSharedPlace: false, nonMediaCount: 0, audioMode: .none))
    }

    /// Média pur (photo/vidéo/audio SEUL, sans lieu ni fichier) : jamais
    /// concerné — `FocalAttachmentBlock`/`FocalAudioBlock` le rendaient déjà
    /// (F-082), le gate doit rester silencieux.
    func test_gate_pureVisualOrAudio_doesNotRender() {
        XCTAssertFalse(FocalNonMediaGate.shouldRender(hasSharedPlace: false, nonMediaCount: 0, audioMode: .soleWithFooter))
    }

    /// Parité bulle ASSUMÉE : quand l'audio héberge déjà la légende
    /// (`.hostsCaption`), la bulle elle-même n'atteint jamais
    /// `textBubbleContent` — donc pas le lieu/fichier non plus. Le gate
    /// reproduit EXACTEMENT cette retenue.
    func test_gate_audioHostsCaption_neverRenders_evenWithLocationOrFile() {
        XCTAssertFalse(FocalNonMediaGate.shouldRender(hasSharedPlace: true, nonMediaCount: 0, audioMode: .hostsCaption))
        XCTAssertFalse(FocalNonMediaGate.shouldRender(hasSharedPlace: false, nonMediaCount: 3, audioMode: .hostsCaption))
    }

    /// Matrice bout-en-bout : `FocalAudioRouting.mode(for:)` (déjà testé
    /// isolément par `FocalAudioRoutingTests`) alimente directement le gate.
    func test_gate_integratesWithRealAudioRoutingMode_forMixedAudioPlusFile_noVisual() {
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

    // MARK: - 3. La loi partagée (labels des cartes + repli de transition)

    /// Depuis le LOT 3.2 les parts ne sont plus le CORPS du bloc : la part
    /// « lieu » devient le label d'accessibilité de la carte
    /// `LocationMessageView` (et le repli de transition du site d'appel
    /// historique, qui n'a pas encore de `SharedPlace` à donner). Toujours
    /// la MÊME loi que VoiceOver — jamais une seconde résolution.
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
        XCTAssertTrue(parts[0].contains("budget.pdf"), "la loi doit citer le VRAI nom de fichier, jamais une donnée inventée")
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

    // MARK: - 4. `FocalNonMediaBlock` — Equatable (ids + présence lieu + primitives)

    /// Les labels HISTORIQUES (`hasSharedPlace:items:isDark:`) doivent
    /// continuer de compiler tels quels — c'est le contrat de transition :
    /// le site d'appel actuel de `FocalRow` les passe encore, la session
    /// principale câblera `location:`/`accentHex:`/`isMe:`/closures ensuite.
    func test_focalNonMediaBlock_legacyInitLabels_stillCompile_andCompareEqual() {
        let items = [fileAttachment(id: "f1")]
        let lhs = FocalNonMediaBlock(hasSharedPlace: true, items: items, isDark: false)
        let rhs = FocalNonMediaBlock(hasSharedPlace: true, items: items, isDark: false)
        XCTAssertEqual(lhs, rhs)
    }

    func test_focalNonMediaBlock_equatable_sameInputsWithRealPlace_isEqual() {
        let items = [fileAttachment(id: "f1")]
        let lhs = FocalNonMediaBlock(items: items, isDark: false, location: makePlace(), accentHex: "6366F1")
        let rhs = FocalNonMediaBlock(items: items, isDark: false, location: makePlace(), accentHex: "6366F1")
        XCTAssertEqual(lhs, rhs)
    }

    func test_focalNonMediaBlock_equatable_differentPlacePresence_isNotEqual() {
        let items = [fileAttachment(id: "f1")]
        let lhs = FocalNonMediaBlock(items: items, isDark: false, location: makePlace())
        let rhs = FocalNonMediaBlock(items: items, isDark: false, location: nil)
        XCTAssertNotEqual(lhs, rhs)
    }

    /// La PRÉSENCE du lieu est le signal comparé, quel que soit son canal :
    /// le drapeau de transition du site historique et le `SharedPlace` réel
    /// comptent pareil — un re-render n'est dû que si le lieu apparaît ou
    /// disparaît, pas quand l'hôte migre d'un canal à l'autre.
    func test_focalNonMediaBlock_equatable_legacyFlagAndRealPlace_bothCountAsPresence() {
        let items = [fileAttachment(id: "f1")]
        let viaLegacyFlag = FocalNonMediaBlock(hasSharedPlace: true, items: items, isDark: false)
        let viaRealPlace = FocalNonMediaBlock(items: items, isDark: false, location: makePlace())
        XCTAssertEqual(viaLegacyFlag, viaRealPlace)
    }

    func test_focalNonMediaBlock_equatable_differentItemIds_isNotEqual() {
        let lhs = FocalNonMediaBlock(items: [fileAttachment(id: "f1")], isDark: false)
        let rhs = FocalNonMediaBlock(items: [fileAttachment(id: "f2")], isDark: false)
        XCTAssertNotEqual(lhs, rhs)
    }

    func test_focalNonMediaBlock_equatable_differentAccent_isNotEqual() {
        let items = [fileAttachment(id: "f1")]
        let lhs = FocalNonMediaBlock(items: items, isDark: false, accentHex: "6366F1")
        let rhs = FocalNonMediaBlock(items: items, isDark: false, accentHex: "4338CA")
        XCTAssertNotEqual(lhs, rhs)
    }

    /// Les closures ne participent JAMAIS à l'égalité (mission LOT 3.2,
    /// même règle que `FocalRowInput` vs `FocalRowActions`) : deux blocs
    /// identiques par leurs données restent égaux quelles que soient les
    /// closures — sinon chaque passe de body de l'hôte invaliderait le
    /// diffing Equatable (les closures sont recréées à chaque évaluation).
    func test_focalNonMediaBlock_equatable_closuresNeverParticipate() {
        let items = [fileAttachment(id: "f1")]
        let lhs = FocalNonMediaBlock(
            items: items, isDark: false, location: makePlace(),
            onTapLocation: { _ in XCTFail("jamais appelée par ==") },
            onShareFile: { _ in XCTFail("jamais appelée par ==") }
        )
        let rhs = FocalNonMediaBlock(
            items: items, isDark: false, location: makePlace(),
            onTapLocation: nil,
            onShareFile: nil
        )
        XCTAssertEqual(lhs, rhs)
    }

    // MARK: - 5. Gardes source — câblage réel et repli texte MORT

    private func rowSource(_ fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// La rangée doit réellement MONTER le bloc — un correctif qui n'ajoute
    /// que le fichier sans le câbler laisserait le bug intact.
    func test_focalRow_actuallyMountsTheNonMediaBlock() throws {
        let stripped = AppSourceGuard.stripComments(try rowSource("FocalRow.swift"))
        XCTAssertTrue(
            stripped.contains("nonMediaBlock"),
            "FocalRow.swift doit monter nonMediaBlock dans standardBody — sinon le correctif est mort code"
        )
        XCTAssertTrue(
            stripped.contains("FocalNonMediaGate.shouldRender("),
            "FocalRow.swift doit déléguer la décision à FocalNonMediaGate.shouldRender — jamais une garde ré-écrite en ligne"
        )
    }

    /// LOT 3.2 : le bloc rend les cartes RÉELLES par réutilisation —
    /// `LocationMessageView` (lieu) et `BubbleAttachmentView` (une par
    /// fichier, carte + badge de téléchargement + visionneuse). La boucle du
    /// repli texte (`parts.enumerated()`) est MORTE — sa disparition est la
    /// preuve que le remplacement a bien eu lieu, pas un simple ajout.
    func test_focalNonMediaBlock_rendersRealCards_theInertTextLoopIsDead() throws {
        let stripped = AppSourceGuard.stripComments(try rowSource("FocalNonMediaBlock.swift"))
        XCTAssertTrue(
            stripped.contains("LocationMessageView("),
            "FocalNonMediaBlock.swift doit rendre la carte lieu réelle (LocationMessageView, réutilisée telle quelle)"
        )
        XCTAssertTrue(
            stripped.contains("BubbleAttachmentView("),
            "FocalNonMediaBlock.swift doit rendre chaque fichier via BubbleAttachmentView — jamais une carte fichier réimplémentée"
        )
        XCTAssertFalse(
            stripped.contains("parts.enumerated()"),
            "la boucle du repli texte inerte doit être MORTE — les parts ne sont plus le corps du bloc"
        )
    }

    /// La loi VoiceOver reste l'UNIQUE résolution du couple lieu/fichier
    /// (label de la carte lieu + repli de transition) — jamais une seconde
    /// résolution locale.
    func test_focalNonMediaBlock_reusesTheSharedA11yLaw() throws {
        let stripped = AppSourceGuard.stripComments(try rowSource("FocalNonMediaBlock.swift"))
        XCTAssertTrue(
            stripped.contains("MessageAccessibilityLabelComposer.nonMediaAccessibilityParts("),
            "FocalNonMediaBlock.swift doit citer la loi partagée — jamais re-résoudre lieu/fichier localement"
        )
    }

    /// Contrainte §WS-4 : aucun `@State` dans les vues Focal de rangée —
    /// les sous-vues réutilisées (résolveurs de `BubbleAttachmentView`,
    /// vignette de `LocationMessageView`) ont le droit d'avoir le leur.
    func test_focalNonMediaBlock_hasNoState() throws {
        let stripped = AppSourceGuard.stripComments(try rowSource("FocalNonMediaBlock.swift"))
        XCTAssertFalse(
            stripped.contains("@State"),
            "FocalNonMediaBlock.swift ne doit porter aucun @State — tout l'état vit dans les sous-vues réutilisées"
        )
    }
}
