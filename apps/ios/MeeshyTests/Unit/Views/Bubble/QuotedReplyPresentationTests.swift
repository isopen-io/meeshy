import XCTest
import MeeshySDK
@testable import Meeshy

/// La RÈGLE de présentation d'une citation, en exécution.
///
/// `QuotedReplyPresentation` est le site UNIQUE de ce qu'une citation
/// MONTRE — le titre « Auteur : », le budget de lignes de son aperçu, et la
/// ligne de détails « 1024×768 · 0:42 · 1,2 Mo » d'un média cité. Les trois
/// peaux (bulle, rangée plate, bandeau du composeur) la consomment ; aucune
/// ne réécrit sa propre orthographe. Le pendant de source — « aucune de ces
/// trois peaux ne porte de constante locale » — vit dans
/// `BubbleQuotedReplyThumbHashGuardTests`.
///
/// La suite n'est PAS `@MainActor` : la règle est `nonisolated` par
/// déclaration, précisément pour qu'elle reste appelable depuis un contexte
/// détaché comme depuis le rendu.
final class QuotedReplyPresentationTests: XCTestCase {

    /// Locale FIXÉE — jamais `.current`. Une suite qui jugerait la locale du
    /// SIMULATEUR serait verte en local et rouge en CI (idiome du dépôt
    /// depuis 234i, cf. `CallManager.formatDuration`).
    private let french = Locale(identifier: "fr_FR")

    /// Le MOT « pages » tel que le catalogue le sert au lecteur qui exécute la
    /// suite. Relu par la même clé que la règle — jamais recopié en littéral :
    /// un simulateur en allemand rendrait « Seiten », et une assertion sur
    /// « pages » serait rouge sans qu'aucun défaut n'existe.
    private static let pagesWord = String(
        localized: "feed.post.detail.pages",
        defaultValue: "pages",
        bundle: .main
    )

    // MARK: - Le titre : « Auteur : »

    func test_title_composesAuthorWithNonBreakingSpaceBeforeColon() {
        let title = QuotedReplyPresentation.title(author: "Alice")
        XCTAssertTrue(title.hasPrefix("Alice"), "le nom ouvre le titre — rendu : « \(title) »")
        XCTAssertTrue(title.hasSuffix(":"), "le titre se ferme par le deux-points — rendu : « \(title) »")
        XCTAssertTrue(
            title.contains("\u{00A0}:"),
            "l'usage français demande une espace INSÉCABLE avant le deux-points : sans elle, le « : » se " +
            "retrouve seul en début de ligne dès que la citation se replie. Rendu : « \(title) »"
        )
    }

    /// Le titre n'ajoute RIEN au nom qu'on lui donne — deux caractères de
    /// ponctuation, pas un mot. C'est ce qui lui permet de se passer d'une
    /// entrée de catalogue (et donc de ne pas rendre du FRANÇAIS dans les six
    /// autres locales le temps qu'un lot traduise une espace insécable).
    func test_title_addsPunctuationOnly_neverATranslatableWord() {
        XCTAssertEqual(QuotedReplyPresentation.title(author: "Alice"), "Alice\u{00A0}:")
        XCTAssertEqual(
            QuotedReplyPresentation.title(author: "Bob").count, "Bob".count + 2,
            "le titre n'ajoute que l'espace insécable et le deux-points"
        )
    }

    func test_title_emptyAuthor_staysAColonlessLabel() {
        // Un mood échoé par le serveur peut n'avoir aucun nom : la peau
        // retombe alors sur son propre libellé (« Humeur ») AVANT d'appeler la
        // règle. Un titre vide ne doit pas produire un « : » orphelin.
        XCTAssertEqual(QuotedReplyPresentation.title(author: ""), "")
    }

    // MARK: - Les budgets de lignes, une peau à la fois

    func test_previewLineLimit_bubbleReadsThreeLines_focalAndComposerTwo() {
        XCTAssertEqual(QuotedReplyPresentation.previewLineLimit(for: .bubble), 3)
        XCTAssertEqual(QuotedReplyPresentation.previewLineLimit(for: .focal), 2)
        XCTAssertEqual(QuotedReplyPresentation.previewLineLimit(for: .composer), 2)
    }

    func test_titleLineLimit_isAlwaysOne_theAuthorNeverWraps() {
        XCTAssertEqual(QuotedReplyPresentation.titleLineLimit, 1)
    }

    /// Le défaut que la règle solde : 2 lignes dans la bulle, 1 dans la
    /// rangée plate, 1 dans le bandeau — la MÊME citation se lisait de trois
    /// façons. Aucune peau ne descend plus sous deux lignes.
    func test_previewLineLimit_noSkinFallsBackToASingleLine() {
        for skin in QuotedReplyPresentation.Skin.allCases {
            XCTAssertGreaterThanOrEqual(
                QuotedReplyPresentation.previewLineLimit(for: skin), 2,
                "la peau \(skin) tronque l'aperçu à une ligne — le porteur en demande 2 à 3."
            )
        }
    }

    // MARK: - La ligne de détails

    func test_detailsLabel_image_rendersDimensionsThenSize() {
        let label = QuotedReplyPresentation.detailsLabel(
            mimeType: "image/jpeg", width: 1024, height: 768,
            durationMs: nil, fileSize: 1_200_000, pageCount: nil, locale: french
        )
        XCTAssertNotNil(label)
        XCTAssertTrue(label?.contains("1024\u{00D7}768") == true, "× TYPOGRAPHIQUE, jamais la lettre « x ». Rendu : « \(label ?? "nil") »")
        XCTAssertTrue(
            label?.contains(QuotedReplyPresentation.detailsSeparator) == true,
            "les segments se séparent par « · » entouré d'espaces INSÉCABLES — un « · » orphelin en début de " +
            "ligne est la seule façon de rendre cette ligne illisible. Rendu : « \(label ?? "nil") »"
        )
        XCTAssertEqual(
            label?.components(separatedBy: QuotedReplyPresentation.detailsSeparator).count, 2,
            "deux segments attendus (dimensions, taille) — l'unité et le séparateur décimal appartiennent à la " +
            "locale, pas au code. Rendu : « \(label ?? "nil") »"
        )
    }

    func test_detailsLabel_video_rendersDimensionsDurationAndSize_inThatOrder() {
        let label = QuotedReplyPresentation.detailsLabel(
            mimeType: "video/mp4", width: 1920, height: 1080,
            durationMs: 42_000, fileSize: 3_400_000, pageCount: nil, locale: french
        )
        let parts = (label ?? "").components(separatedBy: QuotedReplyPresentation.detailsSeparator)
        XCTAssertEqual(parts.count, 3, "trois segments attendus — rendu : « \(label ?? "nil") »")
        XCTAssertEqual(parts.first, "1920\u{00D7}1080")
        XCTAssertEqual(parts.dropFirst().first, "0:42", "la durée s'écrit en horloge mm:ss — l'utilitaire maison, jamais un String(format:)")
    }

    func test_detailsLabel_audio_rendersDurationAndSize_withoutDimensions() {
        let label = QuotedReplyPresentation.detailsLabel(
            mimeType: "audio/mpeg", width: nil, height: nil,
            durationMs: 62_000, fileSize: 480_000, pageCount: nil, locale: french
        )
        XCTAssertTrue(label?.hasPrefix("1:02") == true, "rendu : « \(label ?? "nil") »")
        XCTAssertFalse(label?.contains("\u{00D7}") == true, "un vocal n'a pas de dimensions à annoncer")
    }

    /// Un document n'a pas de pixels : ses dimensions, quand la passerelle en
    /// sert par accident, ne veulent rien dire — on annonce ses PAGES.
    func test_detailsLabel_document_rendersPageCountAndSize_neverPixelDimensions() {
        let label = QuotedReplyPresentation.detailsLabel(
            mimeType: "application/pdf", width: 595, height: 842,
            durationMs: nil, fileSize: 240_000, pageCount: 12, locale: french
        )
        XCTAssertFalse(label?.contains("\u{00D7}") == true, "rendu : « \(label ?? "nil") »")
        XCTAssertTrue(
            label?.contains("12 \(Self.pagesWord)") == true,
            "le nombre de pages doit être annoncé, et le MOT venir du catalogue — rendu : « \(label ?? "nil") »"
        )
    }

    /// **Une seule page ne s'annonce pas.** La clé partagée du dépôt
    /// (`feed.post.detail.pages`) n'a pas de singulier, et en ouvrir un coûterait
    /// une clé neuve — donc du français dans six locales — pour un fait qui
    /// n'apprend rien : le glyphe de document dit déjà que c'en est un.
    /// « 1 pages » serait une faute ; l'omission n'en est pas une.
    func test_detailsLabel_singlePage_isOmitted_neverRenderedAsAPluralFault() {
        XCTAssertNil(
            QuotedReplyPresentation.detailsLabel(
                mimeType: "application/pdf", width: nil, height: nil,
                durationMs: nil, fileSize: nil, pageCount: 1, locale: french
            ),
            "une page unique n'est pas un fait à annoncer"
        )
        let withSize = QuotedReplyPresentation.detailsLabel(
            mimeType: "application/pdf", width: nil, height: nil,
            durationMs: nil, fileSize: 240_000, pageCount: 1, locale: french
        )
        XCTAssertFalse(
            withSize?.contains(Self.pagesWord) == true,
            "…et elle ne s'invite pas non plus à côté de la taille — rendu : « \(withSize ?? "nil") »"
        )
    }

    /// Chaque segment ABSENT est omis — jamais un « 0 o », jamais un « 0:00 »
    /// de remplissage, jamais un séparateur orphelin.
    func test_detailsLabel_missingFacts_areOmitted_neverRenderedAsZero() {
        XCTAssertNil(
            QuotedReplyPresentation.detailsLabel(
                mimeType: "image/jpeg", width: nil, height: nil,
                durationMs: nil, fileSize: nil, pageCount: nil, locale: french
            ),
            "aucun fait ⇒ AUCUNE ligne : une ligne vide pousserait la citation d'un cran sans rien dire"
        )
        XCTAssertNil(
            QuotedReplyPresentation.detailsLabel(
                mimeType: "video/mp4", width: 0, height: 0,
                durationMs: 0, fileSize: 0, pageCount: 0, locale: french
            ),
            "un zéro n'est pas un fait : `MeeshyMessageAttachment.fileSize` vaut 0 pour « inconnu »"
        )
        let onlySize = QuotedReplyPresentation.detailsLabel(
            mimeType: "image/png", width: 640, height: nil,
            durationMs: nil, fileSize: 2_000, pageCount: nil, locale: french
        )
        XCTAssertFalse(
            onlySize?.contains("\u{00D7}") == true,
            "une largeur SANS hauteur n'est pas une dimension — rendu : « \(onlySize ?? "nil") »"
        )
    }

    /// La locale porte les CHIFFRES, le séparateur décimal et l'unité — pas le
    /// code. Le témoin s'écrit sur les dimensions parce que c'est le segment
    /// dont ce fichier choisit le format (`IntegerFormatStyle`) : un
    /// `String(format: "%d×%d")` y graverait les chiffres LATINS jusque dans
    /// une interface arabe, exactement le défaut que 238i-241i ont soldé
    /// ailleurs.
    ///
    /// **`ar_SA`, jamais `ar` nue** : mesuré dans ce dépôt (`LocalizedNumberTests`,
    /// `InteractiveProgressBarAccessibilityTests`), une locale arabe SANS région
    /// emprunte celle de l'appareil et rend des chiffres latins.
    func test_detailsLabel_dimensionsFollowTheReadersDigitSystem() {
        let arabic = Locale(identifier: "ar_SA")
        let label = QuotedReplyPresentation.detailsLabel(
            mimeType: "image/jpeg", width: 1024, height: 768,
            durationMs: nil, fileSize: nil, pageCount: nil, locale: arabic
        )
        XCTAssertNotNil(label)
        XCTAssertFalse(
            label?.contains("1024") == true,
            "les dimensions gravent des chiffres LATINS dans une interface arabe — rendu : « \(label ?? "nil") »"
        )
        XCTAssertTrue(
            label?.contains("\u{00D7}") == true,
            "le séparateur × reste, lui, typographique dans toutes les locales — rendu : « \(label ?? "nil") »"
        )
    }

    /// Les DIMENSIONS ne se groupent pas : « 1 024×768 » n'est pas une taille
    /// d'image, c'est une faute de frappe.
    func test_detailsLabel_dimensionsAreNotGrouped() {
        let label = QuotedReplyPresentation.detailsLabel(
            mimeType: "image/jpeg", width: 4032, height: 3024,
            durationMs: nil, fileSize: nil, pageCount: nil, locale: french
        )
        XCTAssertEqual(label, "4032\u{00D7}3024")
    }

    // MARK: - La projection depuis la citation elle-même

    func test_detailsLabel_fromReference_readsTheSevenFactsItCarries() {
        let parts = (QuotedReplyPresentation.detailsLabel(for: makeReference(), locale: french) ?? "")
            .components(separatedBy: QuotedReplyPresentation.detailsSeparator)
        XCTAssertEqual(parts.count, 3, "dimensions, durée, taille — les trois faits que la citation transporte")
        XCTAssertEqual(parts.first, "800\u{00D7}600")
        XCTAssertEqual(parts.dropFirst().first, "0:05")
    }

    /// **La protection gouverne aussi ce qui part À CÔTÉ de la vignette.**
    /// Dimensions, durée et taille décrivent un contenu que le lecteur n'a pas
    /// le droit de voir : elles ne s'annoncent pas non plus.
    func test_detailsLabel_protectedMedia_annoncesNothing() {
        XCTAssertNil(
            QuotedReplyPresentation.detailsLabel(for: makeReference(isProtected: true), locale: french),
            "un média à vue unique / flouté / chiffré ne décrit pas son secret par la bande"
        )
    }

    func test_thumbHash_protectedMedia_isNeverServed_aBlurIsStillAnImage() {
        XCTAssertEqual(QuotedReplyPresentation.thumbHash(for: makeReference()), "abc123")
        XCTAssertNil(
            QuotedReplyPresentation.thumbHash(for: makeReference(isProtected: true)),
            "le flou ThumbHash EST une image : le servir pour un média protégé montre le contenu, en moins net"
        )
        XCTAssertNil(
            QuotedReplyPresentation.thumbHash(for: makeReference(thumbHash: "")),
            "une chaîne vide n'est pas un ThumbHash — `UIImage.fromThumbHash` échouerait en silence à chaque rendu"
        )
    }

    func test_thumbHash_unknownProtection_staysServed_anOldBlobIsSilentNotProtected() {
        XCTAssertEqual(
            QuotedReplyPresentation.thumbHash(for: makeReference(isProtected: nil)),
            "abc123",
            "`nil` = le fil n'a RIEN dit : la vignette d'une citation ordinaire ne disparaît pas parce qu'un " +
            "blob de cache ancien se tait (même prudence que `quotedMediaIsProtected`)"
        )
    }

    // MARK: - Ce que la citation ANNONCE

    /// Le point médian est une ponctuation VISUELLE : lu à voix haute il fait
    /// entendre « point » entre chaque fait. C'est la règle que `MetaSeparator`
    /// tient pour les VUES, appliquée ici à la CHAÎNE — que sa garde de source
    /// ne peut pas voir.
    func test_spokenPreview_replacesTheMiddleDot_soVoiceOverNeverSaysPoint() {
        let spoken = QuotedReplyPresentation.spokenPreview(
            preview: "Photo",
            details: "800\u{00D7}600" + QuotedReplyPresentation.detailsSeparator + "0:05"
        )
        XCTAssertFalse(
            spoken.contains("\u{00B7}"),
            "le point médian ne doit pas atteindre le lecteur d'écran — énoncé : « \(spoken) »"
        )
        XCTAssertEqual(spoken, "Photo, 800\u{00D7}600, 0:05")
    }

    func test_spokenPreview_joinsPreviewAndDetails() {
        XCTAssertEqual(
            QuotedReplyPresentation.spokenPreview(preview: "Photo", details: "800\u{00D7}600"),
            "Photo, 800\u{00D7}600"
        )
        XCTAssertEqual(QuotedReplyPresentation.spokenPreview(preview: "coucou", details: nil), "coucou")
        XCTAssertEqual(
            QuotedReplyPresentation.spokenPreview(preview: "", details: "0:42"), "0:42",
            "un aperçu vide ne laisse pas de virgule orpheline en tête de l'énoncé"
        )
        XCTAssertEqual(QuotedReplyPresentation.spokenPreview(preview: "", details: nil), "")
    }

    // MARK: - Fabrique

    private func makeReference(
        isProtected: Bool? = false,
        thumbHash: String? = "abc123"
    ) -> ReplyReference {
        ReplyReference(
            messageId: "m1",
            authorName: "Alice",
            previewText: "Photo",
            attachmentType: "image",
            attachmentThumbnailUrl: "https://cdn.meeshy.me/t.jpg",
            attachmentIsProtected: isProtected,
            attachmentFacts: ReplyReference.QuotedAttachmentFacts(
                thumbHash: thumbHash,
                width: 800,
                height: 600,
                durationMs: 5_000,
                fileSize: 500_000,
                pageCount: nil,
                mimeType: "image/jpeg"
            )
        )
    }
}
