import XCTest
import MeeshySDK
@testable import Meeshy

/// **Les TROIS peaux de la citation rendent la MÊME règle** (#4946).
///
/// Ce que ces gardes épinglent ne s'éprouve pas à l'exécution : ce sont des
/// vues SwiftUI qu'aucun test ne peut presser sans rendu, et le défaut qu'elles
/// gardent est une DIVERGENCE — trois fichiers qui écrivent chacun sa propre
/// orthographe. Le comportement de la règle elle-même est jugé en exécution par
/// `QuotedReplyPresentationTests` ; ici on vérifie que les peaux la CONSOMMENT.
///
/// Trois précautions, reprises des gardes voisines de ce dossier, parce qu'un
/// comptage de lexèmes est exactement le genre de garde qui meurt en silence :
/// - **ancre positive d'abord** — une source tronquée par un commentaire de
///   bloc jamais refermé satisferait toute assertion NÉGATIVE ;
/// - **tranches découpées entre DEUX ancres qui doivent toutes deux être
///   trouvées** — sinon la tranche est vide et la négative passe pour rien ;
/// - **ancres de CODE, jamais de commentaire** : `AppSourceGuard.stripComments`
///   les efface, et une ancre effacée rend la garde inopérante.
final class BubbleQuotedReplyThumbHashGuardTests: XCTestCase {

    private struct UnanchoredSource: Error { let reason: String }

    private static let bubblePath = "Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift"
    private static let focalPath = "Meeshy/Features/Main/Focal/Row/FocalQuotedReplyView.swift"
    private static let composerPath = "Meeshy/Features/Main/Views/ConversationView+ComposerBanners.swift"
    private static let rulePath = "Meeshy/Features/Main/Views/Bubble/QuotedReplyPresentation.swift"

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views/Bubble
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(path)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func anchored(
        _ path: String,
        _ marker: String,
        floor: Int,
        _ testFile: StaticString = #filePath,
        _ testLine: UInt = #line
    ) throws -> String {
        let code = try source(path)
        guard code.contains(marker), code.count > floor else {
            let reason = "\(path) ne s'ancre pas : « \(marker) » " +
                "\(code.contains(marker) ? "présent" : "ABSENT"), \(code.count) caractères après " +
                "dépouillement des commentaires (plancher \(floor)). Fichier tronqué, renommé ou " +
                "déplacé — les gardes de la citation sont INOPÉRANTES."
            XCTFail(reason, file: testFile, line: testLine)
            throw UnanchoredSource(reason: reason)
        }
        return code
    }

    private func slice(
        of code: String,
        from start: String,
        to end: String,
        _ testFile: StaticString = #filePath,
        _ testLine: UInt = #line
    ) throws -> Substring {
        guard let startRange = code.range(of: start) else {
            let reason = "ancre de début introuvable : « \(start) » — la tranche ne peut pas être découpée, garde inopérante."
            XCTFail(reason, file: testFile, line: testLine)
            throw UnanchoredSource(reason: reason)
        }
        guard let endRange = code.range(of: end, range: startRange.upperBound..<code.endIndex) else {
            let reason = "ancre de fin introuvable après « \(start) » : « \(end) » — garde inopérante."
            XCTFail(reason, file: testFile, line: testLine)
            throw UnanchoredSource(reason: reason)
        }
        return code[startRange.lowerBound..<endRange.lowerBound]
    }

    // MARK: - Le ThumbHash, sur les trois peaux

    /// **Le défaut : trois miniatures, zéro ThumbHash.** La donnée voyage
    /// depuis #4945 et `CachedAsyncImage` sait la rendre depuis toujours
    /// (`thumbHash: String? = nil`) ; aucune des trois peaux ne la passait, si
    /// bien que chaque vignette citée restait un carré de couleur unie jusqu'à
    /// la fin du téléchargement — un pop-in, sur une surface où le cache a
    /// pourtant déjà de quoi dessiner (Cache-First).
    ///
    /// La garde est POSITIVE et découpée sur la tranche de la miniature : un
    /// `thumbHash:` posé ailleurs dans le fichier ne la satisferait pas.
    func test_lesTroisPeaux_serventLeThumbHashDeLaCitation() throws {
        let bubble = try anchored(Self.bubblePath, "struct BubbleQuotedReply", floor: 8_000)
        let bubbleThumb = try slice(of: bubble, from: "private var quotedThumbnail", to: "private func previewGlyph")
        assertServesThumbHash(bubbleThumb, "reply", peau: "bulle")

        let focal = try anchored(Self.focalPath, "struct FocalQuotedReplyView", floor: 4_000)
        // La miniature de la rangée plate a quitté le `HStack` de tête pour le
        // bloc de l'auteur (#5103) : elle vit désormais dans sa propre
        // propriété. La borne suit la DÉCLARATION, jamais la disposition — une
        // ancre posée sur une géographie rougit au premier déplacement, et
        // c'est ce qui vient d'arriver à sa voisine.
        let focalThumb = try slice(of: focal, from: "private var quotedThumbnail", to: "private var authorGate")
        assertServesThumbHash(focalThumb, "reference", peau: "rangée plate")

        let composer = try anchored(Self.composerPath, "func composerReplyAttachmentPreview", floor: 6_000)
        let composerThumb = try slice(
            of: composer,
            from: "func composerReplyAttachmentPreview(type: String, reply: ReplyReference)",
            to: "private var composerReplyLocationTile"
        )
        XCTAssertTrue(
            composerThumb.contains("CachedAsyncImage("),
            "le bandeau du composeur doit rendre sa miniature par CachedAsyncImage (3-tier)."
        )
        XCTAssertTrue(
            composerThumb.contains("thumbHash: quotedThumbHash"),
            "les DEUX vignettes du bandeau (image, vidéo) servent le ThumbHash résolu une fois par la règle — " +
            "sinon la miniature d'une citation reste un aplat de couleur jusqu'au réseau."
        )
        XCTAssertTrue(
            composerThumb.contains("QuotedReplyPresentation.thumbHash(for: reply)"),
            "le ThumbHash du bandeau vient de la RÈGLE (qui refuse un média protégé), jamais de " +
            "`reply.attachmentThumbHash` lu en direct."
        )
    }

    private func assertServesThumbHash(
        _ thumbSlice: Substring,
        _ referenceName: String,
        peau: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(
            thumbSlice.contains("CachedAsyncImage("),
            "la miniature de la peau \(peau) doit passer par CachedAsyncImage (3-tier) — jamais un AsyncImage nu.",
            file: file, line: line
        )
        XCTAssertTrue(
            thumbSlice.contains("thumbHash: QuotedReplyPresentation.thumbHash(for: \(referenceName))"),
            "la miniature de la peau \(peau) doit servir son ThumbHash PAR LA RÈGLE — c'est elle qui le refuse " +
            "à un média protégé (un flou EST une image). Sans lui, la vignette citée reste un carré de couleur " +
            "unie jusqu'à la fin du téléchargement.",
            file: file, line: line
        )
    }

    // MARK: - « Auteur : », composé par la règle — et le monogramme épargné

    /// Les trois peaux écrivaient leur titre chacune de son côté, et aucune
    /// n'écrivait le deux-points que le porteur demande. Le titre vient
    /// désormais de la règle, espace insécable comprise.
    ///
    /// **Et l'AVATAR reçoit le NOM, pas le titre.** `MeeshyAvatar` tire ses
    /// initiales de `name:` : lui passer « Alice : » produirait un monogramme
    /// « A: ». Les deux valeurs sont donc distinctes dans chaque peau — c'est
    /// le piège que ce lot pose et que cette garde ferme.
    func test_lesTroisPeaux_composentLeurTitreParLaRegle_etDonnentLeNomNuALAvatar() throws {
        let bubble = try anchored(Self.bubblePath, "struct BubbleQuotedReply", floor: 8_000)
        XCTAssertTrue(
            bubble.contains("QuotedReplyPresentation.title(author: quotedAuthorName)"),
            "la bulle doit composer « Auteur : » par la règle partagée."
        )
        XCTAssertTrue(
            bubble.contains("name: quotedAuthorName"),
            "l'avatar de la bulle reçoit le NOM NU — « Alice : » lui ferait dessiner un monogramme « A: »."
        )

        let focal = try anchored(Self.focalPath, "struct FocalQuotedReplyView", floor: 4_000)
        XCTAssertTrue(
            focal.contains("QuotedReplyPresentation.title(author: authorName)"),
            "la rangée plate doit composer son titre par la MÊME règle que la bulle."
        )
        XCTAssertTrue(
            focal.contains("name: authorName"),
            "l'avatar de la rangée plate reçoit lui aussi le NOM NU."
        )

        let composer = try anchored(Self.composerPath, "func composerReplyBanner", floor: 6_000)
        XCTAssertTrue(
            composer.contains("QuotedReplyPresentation.title(author: composerReplyTitle(reply))"),
            "le bandeau du composeur doit composer son titre par la règle — sans quoi la MÊME citation " +
            "s'annonce « Alice » ici et « Alice : » deux surfaces plus loin."
        )
        // Exécution — ce que la règle rend, quelle que soit la peau.
        XCTAssertTrue(QuotedReplyPresentation.title(author: "Alice").contains("\u{00A0}:"))
    }

    // MARK: - Aucune constante de ligne posée sur place

    /// Le défaut d'origine, mot pour mot : 2 lignes dans la bulle, 1 dans la
    /// rangée plate, 1 dans le bandeau — trois implémentations, trois budgets.
    /// Toute borne de lignes de la citation vient désormais de la règle ; un
    /// littéral remis ici rouvrirait la divergence sans qu'aucun rendu ne
    /// change de forme.
    func test_aucunePeau_neGardeSaProprConstanteDeLignes() throws {
        let bubble = try anchored(Self.bubblePath, "struct BubbleQuotedReply", floor: 8_000)
        assertEveryLineLimitComesFromTheRule(bubble[...], peau: "bulle")

        let focal = try anchored(Self.focalPath, "struct FocalQuotedReplyView", floor: 4_000)
        assertEveryLineLimitComesFromTheRule(focal[...], peau: "rangée plate")

        // Le bandeau d'ÉDITION vit dans le même fichier et garde sa propre
        // ligne : la tranche s'arrête donc au bandeau de réponse.
        let composer = try anchored(Self.composerPath, "func composerReplyBanner", floor: 6_000)
        let replyBanner = try slice(of: composer, from: "func composerReplyBanner", to: "var composerEditBanner")
        assertEveryLineLimitComesFromTheRule(replyBanner, peau: "bandeau du composeur")
    }

    private func assertEveryLineLimitComesFromTheRule(
        _ code: Substring,
        peau: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let calls = code.components(separatedBy: ".lineLimit(").dropFirst()
        XCTAssertFalse(
            calls.isEmpty,
            "la peau \(peau) ne borne plus AUCUNE ligne — la garde ne protège plus rien.",
            file: file, line: line
        )
        for call in calls {
            XCTAssertTrue(
                call.hasPrefix("QuotedReplyPresentation."),
                "la peau \(peau) borne une ligne par une constante LOCALE (« .lineLimit(\(call.prefix(12))… ») — " +
                "c'est exactement la divergence que #4946 solde : le budget appartient à " +
                "`QuotedReplyPresentation`, une règle pour les trois peaux.",
                file: file, line: line
            )
        }
    }

    // MARK: - La miniature est SOUS L'AUTEUR, sur les trois peaux

    /// **La géographie a changé le 2026-09-04, et cette garde avec elle.**
    ///
    /// Elle exigeait « miniature à GAUCHE, à sa droite le titre et la ligne de
    /// détails », et elle avait raison de le faire : c'était la géographie
    /// demandée, et son mérite était de la tenir sur les TROIS peaux (#4946).
    ///
    /// Nouvelle directive porteur : « lorsqu'on cite un message avec attachement,
    /// on a sa miniature dans la citation **juste en dessous de l'auteur** ».
    /// Ce qui change est la POSITION ; ce qui ne change pas est l'invariance —
    /// une citation ne se lit toujours pas autrement selon la peau.
    ///
    /// > **Une garde qui épingle une disposition abandonnée est le même piège
    /// > qu'un doc-comment périmé** : elle énonce une raison juste pour un
    /// > arbitrage qui n'est plus celui du produit, et elle rougit au moment où
    /// > on applique la nouvelle directive — donc exactement quand on a raison.
    ///
    /// Ce que la garde ne perd pas en changeant de cible : elle continue
    /// d'interroger les trois peaux, et c'est cela qui l'a rendue utile. La
    /// bulle posait sa vignette en fin de ligne et le bandeau du composeur
    /// entre le texte et sa croix de fermeture ; sans elle, la nouvelle
    /// géographie aurait pu n'être appliquée qu'à deux surfaces sur trois.
    func test_lesTroisPeaux_posentLaMiniatureSousLAuteur() throws {
        let bubble = try anchored(Self.bubblePath, "struct BubbleQuotedReply", floor: 8_000)
        let bubbleRow = try slice(of: bubble, from: "HStack(spacing: 8) {", to: "quotedDetailsLine")
        XCTAssertTrue(
            bubbleRow.contains("quotedThumbnail"),
            "la bulle doit monter sa miniature DANS le bloc de l'auteur, sous la ligne du nom."
        )
        XCTAssertNil(
            bubbleRow.range(of: #"HStack\(spacing: 8\) \{\s*quotedThumbnail"#, options: .regularExpression),
            "la miniature ne PRÉCÈDE plus le bloc titre + aperçu — elle le suit."
        )

        let focal = try anchored(Self.focalPath, "struct FocalQuotedReplyView", floor: 4_000)
        let focalRow = try slice(of: focal, from: "VStack(alignment: .leading, spacing: 2)", to: "padding(.leading")
        XCTAssertTrue(
            focalRow.contains("quotedThumbnail"),
            "la rangée plate monte sa miniature dans le bloc de l'auteur, après la ligne du nom."
        )

        let composer = try anchored(Self.composerPath, "func composerReplyBanner", floor: 6_000)
        let composerRow = try slice(of: composer, from: "VStack(alignment: .leading, spacing: 2)", to: "Spacer()")
        XCTAssertTrue(
            composerRow.contains("composerReplyAttachmentPreview(type: attType, reply: reply)"),
            "le bandeau du composeur monte l'aperçu du média DANS le bloc de l'auteur, sous sa ligne."
        )
    }

    // MARK: - Le bandeau du composeur : la protection AVANT toute vignette

    /// **Le défaut de sécurité de ce lot.** Les deux autres peaux refusaient
    /// déjà d'afficher la vignette d'un média cité PROTÉGÉ
    /// (`quotedMediaIsProtected`) ; le bandeau du composeur, lui, la rendait en
    /// clair ET l'ouvrait en plein écran au tap. Scénario : A envoie une photo
    /// à VUE UNIQUE, B y répond — la photo s'affichait dans le bandeau, au-
    /// dessus du clavier, à chaque frappe, et un tap l'ouvrait en grand.
    ///
    /// La garde exige que la protection soit lue AVANT la première
    /// `CachedAsyncImage` : c'est la première question de la vue, jamais un
    /// repli posé après coup.
    func test_leBandeauDuComposeur_testeLaProtectionAvantTouteVignette() throws {
        let composer = try anchored(Self.composerPath, "func composerReplyAttachmentPreview", floor: 6_000)
        let beforeFirstImage = try slice(
            of: composer,
            from: "func composerReplyAttachmentPreview(type: String, reply: ReplyReference)",
            to: "CachedAsyncImage("
        )
        XCTAssertTrue(
            beforeFirstImage.contains("reply.quotedMediaIsProtected"),
            "un média cité PROTÉGÉ (vue unique, flouté, chiffré) ne doit NI montrer sa vignette NI s'ouvrir " +
            "depuis le bandeau de réponse. La protection se lit avant la première miniature — la placer après " +
            "laisserait une branche par laquelle le secret sort."
        )
        XCTAssertTrue(
            beforeFirstImage.contains("EmptyView()"),
            "le refus rend RIEN : pas de vignette de repli, pas de badge tiré du média. Le glyphe générique de " +
            "la ligne d'aperçu et le placeholder du texte cité disent déjà ce qu'il y a à dire."
        )
        // Exécution — le prédicat partagé que la vue consulte, et sa prudence
        // face au silence d'un blob de cache ancien.
        XCTAssertTrue(makeReference(isProtected: true).quotedMediaIsProtected)
        XCTAssertFalse(makeReference(isProtected: false).quotedMediaIsProtected)
        XCTAssertFalse(makeReference(isProtected: nil).quotedMediaIsProtected)
        XCTAssertNil(
            QuotedReplyPresentation.thumbHash(for: makeReference(isProtected: true)),
            "et la règle refuse le ThumbHash du même média : la vue ne peut pas en obtenir un même en le demandant"
        )
    }

    /// Le `switch` littéral du bandeau (`case "image":`) n'était vrai que sur
    /// la bulle OPTIMISTE : `attachmentType` porte le MIME (« image/jpeg ») dès
    /// que le serveur accuse (`MessagePersistenceActor` y grave `mimeType`).
    /// Le bandeau perdait donc sa vignette au premier écho — même défaut, même
    /// correctif que le badge play de la rangée plate.
    func test_leBandeauDuComposeur_resoutLeGenre_neComparePasUneChaineBrute() throws {
        let composer = try anchored(Self.composerPath, "func composerReplyAttachmentPreview", floor: 6_000)
        let preview = try slice(
            of: composer,
            from: "func composerReplyAttachmentPreview(type: String, reply: ReplyReference)",
            to: "private var composerReplyLocationTile"
        )
        XCTAssertTrue(
            preview.contains("BubbleQuotedReply.resolveAttachmentKind(type)"),
            "le genre du média cité se RÉSOUT par le décodeur partagé (rawValue court OU MIME brut), jamais " +
            "par une comparaison de chaîne."
        )
        XCTAssertFalse(
            preview.contains("case \"image\":") || preview.contains("case \"video\":") || preview.contains("case \"audio\":"),
            "une comparaison littérale de genre est FAUSSE sur le chemin de rendu réel : elle ne reconnaît que " +
            "le rawValue court posé par la bulle optimiste."
        )
        // Exécution — le fossé que la comparaison littérale ne franchissait pas.
        XCTAssertEqual(BubbleQuotedReply.resolveAttachmentKind("image/jpeg"), .image)
        XCTAssertEqual(BubbleQuotedReply.resolveAttachmentKind("image"), .image)
    }

    // MARK: - Les faits doivent INVALIDER, sinon la citation se fige

    /// Les deux `==` MANUELS de la citation sont deux inventaires à tenir à
    /// jour. Un fait ajouté au type porteur mais absent d'eux ne redessine
    /// jamais la cellule : la citation reste figée sur sa PREMIÈRE résolution
    /// — le ThumbHash de la bulle optimiste, sans les dimensions que l'écho
    /// serveur apporte ensuite. C'est le défaut qu'`authorAvatarUrl` puis
    /// `attachmentIsProtected` ont déjà eu, chacun à son tour.
    func test_lesFaitsDuMediaCite_entrentDansLesDeuxProjectionsDEgalite() throws {
        let facts = [
            "attachmentThumbHash",
            "attachmentWidth",
            "attachmentHeight",
            "attachmentDurationMs",
            "attachmentFileSize",
            "attachmentPageCount",
            "attachmentMimeType"
        ]

        let bubble = try anchored(Self.bubblePath, "struct BubbleQuotedReply", floor: 8_000)
        let replySlice = try slice(of: bubble, from: "fileprivate struct ReplySlice", to: "private var theme")
        for fact in facts {
            XCTAssertTrue(
                replySlice.contains(fact),
                "`\(fact)` manque à `ReplySlice` — la bulle ne se redessinerait jamais quand ce fait arrive."
            )
        }

        let content = try anchored(
            "Meeshy/Features/Main/Views/Bubble/BubbleContent.swift",
            "struct Reply: Equatable", floor: 4_000
        )
        for fact in facts {
            XCTAssertTrue(
                content.contains("lhs.reference.\(fact) == rhs.reference.\(fact)"),
                "`\(fact)` manque au `==` de `BubbleContent.Reply` — la rangée plate garderait sa citation figée."
            )
        }
    }

    // MARK: - La règle est PURE

    /// Elle est appelée depuis le rendu (MainActor) comme depuis une suite de
    /// tests `nonisolated` : sans le marqueur, elle hériterait de l'isolation
    /// MainActor par défaut de la cible (SE-0466, `project.yml`).
    func test_laRegle_estNonisolated_etNeConnaitAucuneVue() throws {
        let rule = try anchored(Self.rulePath, "enum QuotedReplyPresentation", floor: 2_000)
        XCTAssertTrue(
            rule.contains("nonisolated enum QuotedReplyPresentation"),
            "la règle doit être `nonisolated` : pure, elle reste appelable depuis un `Task.detached` comme " +
            "depuis le rendu, et ses suites n'ont pas à devenir `@MainActor` pour la juger."
        )
        XCTAssertFalse(
            rule.contains("import SwiftUI"),
            "la règle ne connaît aucune vue : elle rend des CHAÎNES et des ENTIERS, les peaux les rendent."
        )
        XCTAssertFalse(
            rule.contains("static func resolveAttachmentKind"),
            "le décodeur de genre reste chez `BubbleQuotedReply` — la règle l'APPELLE, elle n'en écrit pas une jumelle."
        )
        XCTAssertTrue(
            rule.contains("BubbleQuotedReply.resolveAttachmentKind(type)"),
            "…et elle l'appelle bien : sans lui, la règle ne saurait pas qu'un document n'a pas de pixels à annoncer."
        )
    }

    private func makeReference(isProtected: Bool?) -> ReplyReference {
        ReplyReference(
            messageId: "m1",
            authorName: "Alice",
            previewText: "",
            attachmentType: "image/jpeg",
            attachmentThumbnailUrl: "https://cdn.meeshy.me/t.jpg",
            attachmentIsProtected: isProtected,
            attachmentFacts: ReplyReference.QuotedAttachmentFacts(
                thumbHash: "abc123",
                width: 1024,
                height: 768,
                durationMs: nil,
                fileSize: 1_200_000,
                pageCount: nil,
                mimeType: "image/jpeg"
            )
        )
    }
}
