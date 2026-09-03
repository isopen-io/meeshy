import XCTest
@testable import Meeshy

/// F-090 (WS-11) — Dynamic Type XL sur les 8 branches de contenu de la
/// rangée (contrat §WS-11, critère §7 « Accessibilité » : « Dynamic Type
/// XL : la rangée s'étire, la focale reste lisible »).
///
/// **Écart de méthode assumé vs le contrat.** §WS-11 demande de reprendre le
/// harnais `mount(_:size:)`/`renderAndCollectLabels`/`assertNoTruncation` de
/// `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Accessibility/DynamicTypeTests.swift`
/// (montage réel `UIHostingController` + fenêtre clé + `RunLoop`). Ce
/// harnais vit dans la cible `MeeshySDK` (package Swift séparé) ; le
/// reproduire ici monterait `FocalRow` (cible `Meeshy`, `@testable import`)
/// dans un VRAI `UIWindow` — praticable en légende, mais AUCUN moyen de le
/// vérifier depuis cet environnement (Linux, pas de toolchain Swift, R5) et
/// un montage réel resterait un test de RENDU, exactement ce que R15
/// proscrit hors screenshot maîtrisé. La mission F-090 tranche explicitement
/// en ce sens : « teste au niveau modèle/composition (lineLimit nil ou
/// politique documentée), pas de screenshot ». Ce fichier applique donc le
/// MÊME esprit que `DynamicTypeTests` (une branche = une preuve qu'elle ne
/// tronque pas) par une garde de SOURCE : soit AUCUN `.lineLimit` n'encadre
/// le texte de la branche (silence = pas de limite = pousse la rangée à
/// n'importe quelle taille, jamais de troncature), soit un `.lineLimit`
/// EXISTE et sa présence est une politique documentée et volontaire (citée
/// ici, avec sa justification produit). Les deux issues sont des PREUVES ;
/// seul un `.lineLimit` NON documenté serait un défaut.
///
/// Les 8 branches (§WS-11) : texte court, texte 6 lignes, emoji-only, 1
/// image, 4 images, audio, réponse citée, notice d'appel.
final class FocalDynamicTypeTests: XCTestCase {

    // MARK: - Lecture de source

    private func rowRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row")
    }

    private func bubbleRoot() -> URL {
        rowRoot()
            .deletingLastPathComponent()   // .../Focal
            .deletingLastPathComponent()   // .../Main
            .appendingPathComponent("Views/Bubble")
    }

    private func source(_ url: URL) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - Branches 1 & 2 : texte court / texte 6 lignes (même chemin de code)

    /// `FocalRow.textBlock` n'impose AUCUN `.lineLimit` autour de
    /// `BubbleExpandableText` — un texte court comme un texte de 6 lignes
    /// s'étirent donc librement sous Dynamic Type, sans jamais tronquer visuellement
    /// (seule la troncature à 512 CARACTÈRES de `BubbleExpandableText`
    /// s'applique, indépendante de la taille de police — voir ci-dessous).
    func test_shortAndSixLineText_focalRowAppliesNoLineLimit() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        guard let start = code.range(of: "private var textBlock: some View {"),
              let end = code.range(of: "\n    }", range: start.upperBound..<code.endIndex)
        else {
            XCTFail("le corps de `textBlock` est introuvable dans FocalRow.swift — la structure a-t-elle changé ?")
            return
        }
        let body = code[start.lowerBound..<end.lowerBound]
        XCTAssertFalse(
            body.contains(".lineLimit("),
            "FocalRow.textBlock impose un `.lineLimit` — un texte de 6 lignes tronquerait à " +
            ".accessibility5 (critère §7 « Accessibilité »). Aucune limite n'est la politique voulue : " +
            "la rangée s'étire, `BubbleExpandableText` gère sa PROPRE troncature (512 caractères, " +
            "indépendante de Dynamic Type — voir test_bubbleExpandableText_truncatesByCharacterCountNotByLine)."
        )
    }

    /// `BubbleExpandableText` (§1.3, lu jamais modifié) est le renderer réel
    /// du texte — cette garde vérifie l'HYPOTHÈSE dont dépend le test
    /// ci-dessus : si ce fichier externe se met un jour à poser un
    /// `.lineLimit`, la rangée Focal tronquerait sans qu'aucun fichier
    /// Focal/** n'ait changé — cette garde le détecterait la première.
    func test_bubbleExpandableText_truncatesByCharacterCountNotByLine() throws {
        let code = try source(bubbleRoot().appendingPathComponent("BubbleExpandableText.swift"))
        XCTAssertFalse(
            code.contains(".lineLimit("),
            "BubbleExpandableText.swift (lu par FocalRow, jamais modifié) pose maintenant un `.lineLimit` — " +
            "la troncature Dynamic Type qu'aucun fichier Focal/** ne contrôle romprait le critère §7 " +
            "« la rangée s'étire » ; re-router via un rendu Focal natif serait alors nécessaire (hors périmètre F-090)."
        )
        XCTAssertTrue(
            code.contains(".fixedSize(horizontal: false, vertical: true)"),
            "BubbleExpandableText.swift doit croître verticalement sans plafond (`.fixedSize(horizontal: false, " +
            "vertical: true)`) — c'est ce qui permet à un texte de 6 lignes de s'étirer sous Dynamic Type XL " +
            "au lieu d'être comprimé dans une hauteur fixe."
        )
    }

    // MARK: - Branche 3 : emoji-only

    func test_emojiOnly_noLineLimit_growsFreely() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalRow.swift"))
        guard let start = code.range(of: "private var emojiBlock: some View {"),
              let end = code.range(of: "\n    }", range: start.upperBound..<code.endIndex)
        else {
            XCTFail("le corps de `emojiBlock` est introuvable dans FocalRow.swift — la structure a-t-elle changé ?")
            return
        }
        let body = code[start.lowerBound..<end.lowerBound]
        XCTAssertFalse(
            body.contains(".lineLimit("),
            "FocalRow.emojiBlock impose un `.lineLimit` — l'emoji-only (90/60/45pt, §7) doit rester " +
            "affiché en entier quelle que soit la taille de police."
        )
        XCTAssertTrue(
            body.contains(".fixedSize(horizontal: false, vertical: true)"),
            "FocalRow.emojiBlock doit poser `.fixedSize(horizontal: false, vertical: true)` — un grand " +
            "emoji à .accessibility5 doit pouvoir croître verticalement sans être comprimé."
        )
    }

    // MARK: - Branches 4 & 5 : 1 image / 4 images (même fichier, même politique)

    /// La grille média (`FocalAttachmentBlock`/`FocalGridCell`) ne porte
    /// AUCUN texte de contenu tronquable — seul un badge de compte
    /// (« +N », un compteur « vue unique ») y apparaît, tous deux des
    /// glyphes courts et fixes, sans risque de troncature. Aucun
    /// `.lineLimit` n'y a donc sa place ; sa présence signalerait un texte
    /// de contenu ajouté sans étude Dynamic Type.
    func test_mediaGrid_oneAndFourImages_noLineLimitAnywhere() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalAttachmentBlock.swift"))
        XCTAssertFalse(
            code.contains(".lineLimit("),
            "FocalAttachmentBlock.swift (grille 1/2/3/4+ images) pose un `.lineLimit` — la grille média " +
            "ne devrait porter que des glyphes courts (« +N », compte « vue unique »), jamais un texte " +
            "susceptible de tronquer à .accessibility5. Auditer le nouveau texte introduit."
        )
    }

    // MARK: - Branche 6 : audio

    /// `FocalAudioBlock` délègue ENTIÈREMENT le rendu (waveform, transcription
    /// traduite en italique) à `AudioMediaView`/`AudioCarouselView` (§1.3, lus
    /// jamais modifiés) — ce fichier lui-même ne pose donc aucun `.lineLimit`
    /// (rien à tronquer, il ne contient aucun `Text` de contenu). La
    /// vérification Dynamic Type de la transcription elle-même est hors
    /// périmètre Focal/** (fichier non possédé par ce chantier, §1.3).
    func test_audioBlock_delegatesRenderingWithoutImposingALineLimit() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalAudioBlock.swift"))
        XCTAssertFalse(
            code.contains(".lineLimit("),
            "FocalAudioBlock.swift pose un `.lineLimit` — ce fichier ne devrait faire que router vers " +
            "AudioMediaView/AudioCarouselView (§1.3), sans texte de contenu propre à tronquer."
        )
    }

    // MARK: - Branche 7 : réponse citée — POLITIQUE DOCUMENTÉE, budget PARTAGÉ (#4946)

    /// `FocalQuotedReplyView` tronque volontairement : le TITRE et la ligne de
    /// DÉTAILS à une ligne (`QuotedReplyPresentation.titleLineLimit`), l'APERÇU
    /// au budget de la peau plate (`previewLineLimit(for: .focal)` — deux
    /// lignes depuis #4946 ; une seule coupait la moitié des citations à
    /// mi-phrase). Politique explicite, pas un oubli — et elle ne s'ÉPELLE
    /// plus sur place : le budget vient de la règle partagée des trois peaux,
    /// et aucun `.lineLimit(1)` littéral ne subsiste (la peau bulle est tenue à
    /// la même interdiction par `BubbleQuotedReplyThumbHashGuardTests`). Le
    /// comportement F09 de la matrice (« ligne tronquée ») se lit à la règle,
    /// où il vit désormais.
    func test_quotedReply_lineBudgetComesFromTheSharedRule_notALiteral() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalQuotedReplyView.swift"))
        func occurrences(of needle: String) -> Int { code.components(separatedBy: needle).count - 1 }

        XCTAssertEqual(
            occurrences(of: ".lineLimit(1)"), 0,
            "FocalQuotedReplyView.swift épelle un budget de lignes sur place : il vient de `QuotedReplyPresentation`."
        )
        XCTAssertEqual(
            occurrences(of: ".lineLimit(QuotedReplyPresentation.titleLineLimit)"), 2,
            "Le titre et la ligne de détails tiennent chacun sur UNE ligne — deux éléments, ni plus ni moins."
        )
        XCTAssertEqual(
            occurrences(of: ".lineLimit(QuotedReplyPresentation.previewLineLimit(for: .focal))"), 1,
            "L'aperçu prend le budget de la peau plate, et lui seul."
        )
        XCTAssertEqual(QuotedReplyPresentation.titleLineLimit, 1)
        XCTAssertEqual(QuotedReplyPresentation.previewLineLimit(for: .focal), 2)
    }

    // MARK: - Branche 8 : notice d'appel

    /// `FocalCallNoticeRow` réutilise `BubbleCallNoticeView` (§1.3, lu jamais
    /// modifié) TEL QUEL — sa politique Dynamic Type est donc HÉRITÉE, hors
    /// contrôle de Focal/**. Ce que WS-11 PEUT garantir : `FocalSystemRows.swift`
    /// lui-même n'ajoute aucun `.lineLimit` par-dessus, et la notice système
    /// générique voisine (`FocalSystemNoticeRow`, texte plat sans capsule)
    /// n'en impose pas non plus.
    func test_callNotice_focalDoesNotAddALineLimitOnTopOfTheInheritedView() throws {
        let code = try source(rowRoot().appendingPathComponent("FocalSystemRows.swift"))
        XCTAssertFalse(
            code.contains(".lineLimit("),
            "FocalSystemRows.swift pose un `.lineLimit` — la notice d'appel (`FocalCallNoticeRow`, " +
            "délègue à `BubbleCallNoticeView`, §1.3) et la notice système plate " +
            "(`FocalSystemNoticeRow`) doivent rester libres de toute troncature ajoutée côté Focal."
        )
    }
}
