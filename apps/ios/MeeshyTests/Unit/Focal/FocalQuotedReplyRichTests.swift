import XCTest
import MeeshySDK
@testable import Meeshy

/// **LOI DES ZONES** (directive produit 2026-08-24) — une citation de la
/// rangée plate n'offre que TROIS classes de zone tactile, et pas une de
/// plus :
/// 1. l'AVATAR de l'auteur cité → profil (`onQuotedAuthorTap`, résolution
///    hôte) ;
/// 2. la MINIATURE ou l'ICÔNE DE LECTURE → plein écran / lecture
///    (`onQuotedMediaTap`, résolution hôte) ;
/// 3. TOUT LE RESTE, LE NOM COMPRIS → saut à l'original (comportement
///    historique, re-prouvé par `FocalRealtimeMatrixTests.test_F09`).
///
/// Le NOM portait sa propre zone jusqu'au 2026-08-24 ; il retombe désormais
/// sous la zone 3 (« il faut le moins de point actionnable pour permettre de
/// pouvoir manipuler le message simplement »). La suite qui gardait ce tap a
/// été REMPLACÉE, pas déplacée : une garde qui reste verte en protégeant la
/// loi ABROGÉE est pire qu'une garde absente.
///
/// Patron « garde de source » du dossier : ces zones sont des gestes SwiftUI
/// qu'aucun test d'exécution ne peut presser sans rendu. Trois précautions,
/// parce qu'un comptage de lexèmes est exactement le genre de garde qui meurt
/// en silence :
/// - **ancre positive d'abord** (`anchoredQuotedReplySource`) — une source
///   tronquée par un commentaire de bloc jamais refermé (accident réel du
///   2026-08-24 : 959 lignes lues → 221) satisferait toute assertion
///   NÉGATIVE ;
/// - **inventaire EXACT**, pas « au moins un » — une 5ᵉ zone doit faire
///   rougir, y compris construite autrement qu'avec `.onTapGesture` ;
/// - **tranche du NOM**, découpée entre deux ancres qui doivent TOUTES DEUX
///   être trouvées — c'est la seule assertion qui dit la nouveauté de la loi.
final class FocalQuotedReplyRichTests: XCTestCase {

    private struct UnanchoredSource: Error { let reason: String }

    /// Union des constructeurs de zone tactile. Compter les seuls
    /// `.onTapGesture` laisserait passer une zone posée en `Button`, en
    /// `.gesture(TapGesture())`, en `.highPriorityGesture` — ou, comme
    /// l'avatar ici, confiée au `onTap:` du composant partagé.
    ///
    /// **`Button {` ET `Button(`, les deux.** Une mutation d'épreuve, jouée
    /// le 2026-08-24 sur cette garde même, a posé une quatrième zone en
    /// `Button { … } label: { … }` : la fermeture est FINALE, donc il n'y a
    /// AUCUNE parenthèse ouvrante, et l'inventaire est resté vert en perdant
    /// sa protection. La forme à fermeture finale est justement la plus
    /// naturelle à écrire — c'est celle qu'un contributeur emploiera.
    private static let tapLexemes = [
        ".onTapGesture",
        "Button(",
        "Button {",
        "Menu(",
        "Menu {",
        ".contextMenu",
        ".gesture(",
        ".simultaneousGesture(",
        ".highPriorityGesture(",
        ".onLongPressGesture",
        "onTap:"
    ]

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(path)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func quotedReplySource() throws -> String {
        try source("Meeshy/Features/Main/Focal/Row/FocalQuotedReplyView.swift")
    }

    /// ANCRE POSITIVE — à passer AVANT tout comptage ou toute assertion
    /// négative. Un fichier renommé, déplacé, ou dépouillé jusqu'à la moelle
    /// par un commentaire de bloc ouvert et jamais refermé rendrait vertes
    /// toutes les gardes de ce fichier sans protéger quoi que ce soit.
    private func anchoredQuotedReplySource(
        _ testFile: StaticString = #filePath,
        _ testLine: UInt = #line
    ) throws -> String {
        let code = try quotedReplySource()
        guard code.contains("struct FocalQuotedReplyView"), code.count > 4_000 else {
            let reason = "FocalQuotedReplyView.swift ne s'ancre pas : `struct FocalQuotedReplyView` " +
                "\(code.contains("struct FocalQuotedReplyView") ? "présent" : "ABSENT"), " +
                "\(code.count) caractères après dépouillement des commentaires (plancher 4000). " +
                "Fichier tronqué, renommé ou déplacé — les gardes de la LOI DES ZONES sont INOPÉRANTES."
            XCTFail(reason, file: testFile, line: testLine)
            throw UnanchoredSource(reason: reason)
        }
        return code
    }

    /// Découpe entre deux ancres qui doivent TOUTES DEUX être trouvées.
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

    private func hostSource() throws -> String {
        try source("Meeshy/Features/Main/Views/MessageListViewController.swift")
    }

    // MARK: - La loi : le NOM n'est plus une zone

    /// LA nouveauté du 2026-08-24, et la seule assertion qui la dise. Le NOM
    /// ne porte plus ni geste, ni forme de frappe propre, ni trait de bouton :
    /// un tap dessus traverse jusqu'à la zone 3 et retourne au message cité.
    func test_loiDesZones_leNomNEstPlusUneZoneTactile() throws {
        let code = try anchoredQuotedReplySource()
        // **L'ancre a bougé sous la garde** (#5103). Elle partait de
        // `Text(title)` ; le NOM se rend désormais à DEUX endroits — dans
        // `quotedFlow()`, qui le fait couler avec le texte, et dans `titleLine`,
        // que seuls mood et story montent. `quotedFlow` étant déclaré AVANT,
        // la tranche partait de lui et avalait `quotedThumbnail` et
        // `authorGate` — deux zones tactiles LÉGITIMES (2 et 1).
        //
        // La garde rougissait donc sur un déplacement, pas sur une infraction.
        // Elle interroge maintenant les DEUX rendus du nom, chacun borné par sa
        // propre déclaration : c'est la loi qu'elle voulait dire.
        // La borne de fin est la DÉCLARATION suivante, jamais un lexème qui
        // réapparaît plus loin : `@ViewBuilder` ne revient qu'à 150 lignes
        // d'ici, et la tranche avalait tout le `body` — dont le tap de la
        // ZONE 3, parfaitement légitime.
        let flowSlice = try slice(of: code, from: "private func quotedFlow()", to: "var body: some View")
        let titleSlice = try slice(of: code, from: "private var titleLine", to: "private var previewGlyph")
        let nameSlice = flowSlice + titleSlice

        var offenders: [String] = []
        for lexeme in Self.tapLexemes where nameSlice.contains(lexeme) {
            offenders.append(lexeme)
        }
        if nameSlice.contains(".accessibilityAddTraits(.isButton)") {
            offenders.append(".accessibilityAddTraits(.isButton)")
        }
        XCTAssertTrue(
            offenders.isEmpty,
            "le NOM de l'auteur cité a REPRIS une zone tactile propre [\(offenders.joined(separator: ", "))] — " +
            "LOI DES ZONES 2026-08-24 : le nom retombe sous la zone 3 (retour au message cité), seul l'AVATAR " +
            "ouvre le profil. « Le moins de point actionnable pour permettre de manipuler le message simplement. »"
        )
    }

    // MARK: - Zone 1 : l'avatar → profil

    func test_loiDesZones_lAvatarEstLaSeulePorteVersLeProfil() throws {
        let code = try anchoredQuotedReplySource()
        XCTAssertTrue(
            code.contains("MeeshyAvatar("),
            "la citation doit monter l'avatar PARTAGÉ du dépôt (MeeshyAvatar) — jamais un cercle redessiné sur place."
        )
        XCTAssertTrue(
            code.contains("context: .custom(FocalMetrics.Avatar.size)"),
            "l'avatar de la citation prend sa cote de FocalMetrics.Avatar.size — jamais un littéral (garde R15)."
        )
        XCTAssertTrue(
            code.contains("onTap: { onQuotedAuthorTap?(reference) }"),
            "l'avatar doit porter la ZONE 1 via son propre `onTap` — le composant fournit alors sa forme de frappe " +
            "CIRCULAIRE et son haptique, au lieu d'un rectangle rapporté."
        )
        // Compté sur les DEUX formes d'appel — `f?(…)` et `f(…)`. Ne compter
        // que l'optionnelle laissait un second site passer sous la garde dès
        // qu'il déballait la fermeture avant de l'appeler (mutation d'épreuve
        // du 2026-08-24).
        let zone1Sites = code.components(separatedBy: "onQuotedAuthorTap?(").count - 1
            + code.components(separatedBy: "onQuotedAuthorTap(").count - 1
        XCTAssertEqual(
            zone1Sites, 1,
            "`onQuotedAuthorTap` doit être déclenché depuis UN SEUL site (l'avatar) — \(zone1Sites) trouvé(s). " +
            "Deux sites = deux points actionnables pour une seule capacité, ce que la directive 2026-08-24 proscrit."
        )
        XCTAssertTrue(
            code.contains("bubble.reply.author_hint"),
            "la clé d'accessibilité du geste « ouvrir le profil » doit SUIVRE l'avatar. Elle n'a qu'un site " +
            "d'usage dans tout le dépôt : la retirer d'ici en ferait une clé MORTE dans les sept catalogues."
        )
    }

    /// L'anti-perte. `authorAvatarUrl` est `nil` à huit des douze sites de
    /// construction (story, humeur, brouillon restauré) : si le rendu de
    /// l'avatar était gardé par la présence de l'URL, la porte vers le profil
    /// disparaîtrait précisément là où elle existait avant ce lot. Elle ne
    /// dépend que du genre de citation, jamais d'une photo.
    func test_loiDesZones_lAvatarSeDessineMemeSansURL_laPorteNeDependJamaisDUnePhoto() throws {
        let code = try anchoredQuotedReplySource()
        XCTAssertTrue(
            code.contains("avatarURL: reference.authorAvatarUrl"),
            "l'URL d'avatar est un PARAMÈTRE de l'avatar, jamais sa condition d'existence."
        )
        let gateSlice = try slice(of: code, from: "if showsAuthorGate", to: "MeeshyAvatar(")
        XCTAssertFalse(
            gateSlice.contains("authorAvatarUrl"),
            "l'avatar est gardé par l'URL de la photo — sans photo, plus aucune porte vers le profil. " +
            "MeeshyAvatar retombe sur les initiales colorées : le rendu est INCONDITIONNEL."
        )
        XCTAssertTrue(
            code.contains("!reference.isStoryReply"),
            "la ZONE 1 n'existe que pour la citation d'un MESSAGE : une story ou une humeur citée porte " +
            "`authorName == \"Story\"` (ou vide) et aucun avatar — l'hôte fabriquerait une fiche à ce nom."
        )
    }

    // MARK: - Zone 2 : le média → plein écran / lecture

    func test_thumbnail_rendersFromReferenceThumbnailUrl_withVideoPlayButton() throws {
        let code = try anchoredQuotedReplySource()
        XCTAssertTrue(
            code.contains("reference.attachmentThumbnailUrl") && code.contains("reference.storyThumbnailUrl"),
            "La miniature doit lire les URL DÉJÀ portées par ReplyReference — jamais une seconde résolution d'attachment."
        )
        XCTAssertTrue(
            code.contains("CachedAsyncImage(") && code.contains("url: thumbnailURL.absoluteString"),
            "La vignette passe par CachedAsyncImage (3-tier) — jamais un AsyncImage nu qui re-télécharge à chaque réutilisation de cellule."
        )
        XCTAssertTrue(
            code.contains("thumbHash: QuotedReplyPresentation.thumbHash(for: reference)"),
            "L'appel a gagné un SECOND argument (#4946) : le flou ThumbHash instantané, refusé par la règle " +
            "pour un média protégé. La forme mono-ligne d'origine n'est donc plus celle du fichier — c'est " +
            "l'ajout qui a fait bouger cette assertion, pas un déplacement du composant."
        )
        XCTAssertTrue(
            code.contains("attachmentKind?.hasTimebasedTrack == true"),
            "Le badge de la miniature se décide sur le GENRE RÉSOLU, jamais sur la chaîne brute. Même expression " +
            "que la peau bulle, et c'est ce qui rend le badge vrai sur le chemin de rendu réel."
        )
        XCTAssertTrue(
            code.contains("Image(systemName: \"play.circle.fill\")"),
            "Le badge vidéo est un BOUTON play (`play.circle.fill`), le même glyphe que la zone média sans " +
            "miniature — un seul vocabulaire visuel pour « ceci se joue »."
        )
    }

    /// **Le défaut du 2026-08-24 : une garde qui CIMENTAIT une comparaison
    /// morte.** Le badge play de la miniature était gardé par
    /// `reference.attachmentType == "video"` — une comparaison de CHAÎNE
    /// LITTÉRALE — alors que sur le chemin de rendu réel `attachmentType`
    /// porte le MIME BRUT : `MessagePersistenceActor` y grave
    /// `firstAtt?.mimeType` (« video/mp4 »), `MessageRecord+ToMessage` le
    /// redécode tel quel, `BubbleContentBuilder` le donne à la rangée. La
    /// condition n'était donc vraie que sur la bulle OPTIMISTE, seule à poser
    /// le rawValue court (`AttachmentType.video.rawValue`).
    ///
    /// Symptôme : le bouton play s'affichait à l'envoi puis DISPARAISSAIT dès
    /// que le serveur accusait, pour ne plus jamais revenir — pendant que la
    /// même citation le montrait sur la peau bulle, qui, elle, résolvait le
    /// genre.
    ///
    /// L'assertion positive vit dans le test au-dessus ; celle-ci est sa
    /// moitié NÉGATIVE, et elle est la seule à dire ce qui était faux. Sans
    /// elle, réintroduire la comparaison à côté de l'expression juste
    /// laisserait toutes les gardes vertes.
    func test_loiDesZones_leBadgePlay_neCompareJamaisUneChaineBruteDeMime() throws {
        let code = try anchoredQuotedReplySource()
        XCTAssertFalse(
            code.contains("attachmentType == \"video\""),
            "`attachmentType` porte le MIME sur le chemin de rendu réel (« video/mp4 ») : toute comparaison à " +
            "une chaîne littérale de genre y est FAUSSE, et le badge play disparaît dès que le serveur accuse. " +
            "Passer par `BubbleQuotedReply.resolveAttachmentKind`, qui décode les DEUX formes."
        )
        // Exécution — la table qui rend la comparaison littérale fausse.
        XCTAssertEqual(BubbleQuotedReply.resolveAttachmentKind("video/mp4"), .video)
        XCTAssertEqual(BubbleQuotedReply.resolveAttachmentKind("video"), .video)
        XCTAssertNotEqual("video/mp4", "video", "c'est CE fossé que la comparaison littérale ne franchissait pas")
    }

    // MARK: - Zone 2 : un média PROTÉGÉ n'en a pas

    /// **Le lot avait ARMÉ une zone et ANNONCÉ une lecture sur un contenu que
    /// son propre verrou refuse d'ouvrir.** `openQuotedMedia` refuse un
    /// attachement à vue unique ou flouté ; la citation, elle, affichait sa
    /// vignette NON FLOUTÉE et posait un `play.circle.fill` par-dessus, sans
    /// jamais consulter la protection — qu'elle ne POUVAIT pas consulter,
    /// `ReplyReference` ne la portant pas.
    ///
    /// La vignette voyage sans condition depuis la passerelle
    /// (`attachmentMediaSelect` porte `thumbnailUrl`) : c'est la PROTECTION qui
    /// décide de la rendre, jamais son absence.
    func test_loiDesZones_unMediaProtege_nAffichePasSaVignette_etNArmeRien() throws {
        let code = try anchoredQuotedReplySource()
        XCTAssertTrue(
            code.contains("reference.quotedMediaIsProtected"),
            "la citation doit consulter la protection du média cité — le prédicat PARTAGÉ des deux peaux."
        )
        let thumbSlice = try slice(of: code, from: "private var thumbnailURL", to: "private var hasTappableMedia")
        XCTAssertTrue(
            thumbSlice.contains("quotedMediaIsProtected"),
            "la MINIATURE elle-même doit être filtrée : sans cela, la vignette en clair d'une vidéo à vue " +
            "unique reste visible par tout le fil, à chaque relecture — le tap verrouillé n'y change rien."
        )
        let gateSlice = try slice(of: code, from: "private var hasTappableMedia", to: "private var showsAuthorGate")
        XCTAssertTrue(
            gateSlice.contains("quotedMediaIsProtected"),
            "la ZONE 2 ne doit pas être armée sur un média protégé : une icône de lecture au-dessus d'un verrou " +
            "est un contrôle qui MENT (loi 4 du dépôt). Le tap retombe en zone 3."
        )
        // Exécution — le prédicat partagé, et sa prudence face au silence.
        XCTAssertTrue(makeReference(attachmentIsProtected: true).quotedMediaIsProtected)
        XCTAssertFalse(makeReference(attachmentIsProtected: false).quotedMediaIsProtected)
        XCTAssertFalse(
            makeReference(attachmentIsProtected: nil).quotedMediaIsProtected,
            "`nil` = le fil n'a RIEN dit : la vignette d'une citation ordinaire ne doit pas disparaître parce " +
            "qu'un blob de cache ancien se tait. Le verrou de l'hôte reste, lui, inconditionnel."
        )
        XCTAssertFalse(
            makeReference(attachmentIsProtected: true).offersMediaGate,
            "un média protégé n'offre AUCUNE zone 2, quel que soit son genre ou sa vignette"
        )
        XCTAssertTrue(makeReference(attachmentIsProtected: false).offersMediaGate)
    }

    private func makeReference(attachmentIsProtected: Bool?) -> ReplyReference {
        ReplyReference(
            messageId: "m1",
            authorName: "Alice",
            previewText: "",
            attachmentType: "video/mp4",
            attachmentThumbnailUrl: "https://cdn.meeshy.me/t.jpg",
            attachmentIsProtected: attachmentIsProtected
        )
    }

    func test_mediaZoneTap_firesQuotedMediaTap_notTheJump() throws {
        let code = try anchoredQuotedReplySource()
        XCTAssertTrue(
            code.contains("onQuotedMediaTap?(reference)"),
            "La zone média doit router vers onQuotedMediaTap — le saut à l'original reste au bloc, jamais à la vignette."
        )
    }

    /// « Le moins de point actionnable » appliqué à la lettre : une capacité
    /// = UN site. Le glyphe de la ligne d'aperçu n'est la zone 2 que
    /// lorsqu'aucune miniature ne la porte déjà, et que le média s'ouvre
    /// vraiment — un glyphe de document renverrait au message cité, ce que la
    /// zone 3 fait déjà sous lui.
    func test_loiDesZones_uneCapaciteUnSite_leGlypheNeDoubleJamaisLaMiniature() throws {
        let code = try anchoredQuotedReplySource()
        XCTAssertTrue(
            code.contains("thumbnailURL == nil && hasTappableMedia && (attachmentKind?.isMedia ?? false)"),
            "le glyphe ne peut être tactile QUE sans miniature (sinon deux zones pour une capacité) et QUE pour " +
            "un média réellement ouvrable (sinon il double la zone 3)."
        )
        XCTAssertTrue(
            code.contains(".accessibilityHidden(true)"),
            "le glyphe qui n'est PAS une zone tactile est décoratif : effacé de VoiceOver, le libellé court " +
            "voisin (« Photo », « Vidéo », …) disant déjà le genre."
        )
        // Exécution — la table qui décide de l'inertie du glyphe document.
        XCTAssertTrue(AttachmentKind.audio.isMedia)
        XCTAssertTrue(AttachmentKind.image.isMedia)
        XCTAssertTrue(AttachmentKind.video.isMedia)
        XCTAssertFalse(AttachmentKind.pdf.isMedia, "un PDF cité n'ouvre pas de plein écran — son glyphe reste inerte")
        XCTAssertFalse(AttachmentKind.document.isMedia)
        XCTAssertFalse(AttachmentKind.archive.isMedia)
    }

    /// La demande produit, mot pour mot : « permettre de voir une icône AUDIO
    /// PLAY pour jouer l'audio cité ». Le `waveform` historique nommait un
    /// TYPE — il ne disait pas que l'audio pouvait s'écouter.
    func test_loiDesZones_lAudioCiteMontreUneIconeDeLecture_pasUneOndeInerte() throws {
        let code = try anchoredQuotedReplySource()
        XCTAssertTrue(
            code.contains("kind.hasTimebasedTrack ? \"play.circle.fill\" : kind.sfSymbolName"),
            "une piste temporelle citée (audio, vidéo) montre une icône de LECTURE ; les autres familles gardent " +
            "leur glyphe de genre."
        )
        // La correction reste LOCALE à la citation : `AttachmentKind` sert
        // toutes les autres surfaces, qui décrivent bien un TYPE.
        XCTAssertEqual(
            AttachmentKind.audio.sfSymbolName, "waveform",
            "la source de vérité partagée ne doit PAS avoir été déplacée : ailleurs (liste de conversations, " +
            "feuille de détail, aperçus push) le glyphe audio décrit un type, pas une action."
        )
        XCTAssertTrue(AttachmentKind.audio.hasTimebasedTrack)
        XCTAssertTrue(AttachmentKind.video.hasTimebasedTrack)
        XCTAssertFalse(AttachmentKind.image.hasTimebasedTrack, "une image citée garde son glyphe de genre, pas un bouton play")
    }

    // MARK: - L'inventaire : aucune 4ᵉ classe de zone

    /// Un COMPTE ne dit pas la destination, et un compte de `.onTapGesture`
    /// ne voit pas une zone posée autrement. Cette garde compte l'UNION des
    /// constructeurs, après l'ancre positive, et énumère dans son message les
    /// sites attendus : une 5ᵉ zone légitime oblige à rouvrir la loi
    /// consciemment — c'est exactement le but.
    func test_loiDesZones_inventaireExactDesZonesTactiles() throws {
        let code = try anchoredQuotedReplySource()
        let total = Self.tapLexemes.reduce(0) { partial, lexeme in
            partial + code.components(separatedBy: lexeme).count - 1
        }
        XCTAssertEqual(
            total, 4,
            "inventaire des zones tactiles de FocalQuotedReplyView : \(total) au lieu de 4. Les quatre SITES " +
            "attendus sont (1) l'avatar → profil, (2) la miniature → plein écran, (3) le glyphe de la ligne " +
            "d'aperçu → plein écran / lecture, (4) le bloc entier → retour au message cité. Les sites 2 et 3 " +
            "s'excluent par construction (`glyphOpensTheMedia` exige `thumbnailURL == nil`) : à l'exécution une " +
            "citation n'offre jamais plus de TROIS cibles, une par classe de la LOI DES ZONES."
        )
    }

    // MARK: - Zone 3 : la résolution hôte, inchangée

    func test_host_resolvesQuotedAuthor_fromLocalStore_withNameOnlyFallback() throws {
        let code = try hostSource()
        XCTAssertTrue(
            code.contains("func openQuotedAuthorProfile(_ reference: ReplyReference)"),
            "L'hôte doit résoudre l'auteur cité — la vue ne porte que la référence, jamais l'identité complète."
        )
        XCTAssertTrue(
            code.contains("store.domainMessage(for: localId, currentUserId: currentUserId)"),
            "La résolution passe par le store local (message cité → sender réel), jamais par une seconde source de vérité."
        )
        XCTAssertTrue(
            code.contains("username: reference.authorName"),
            "Repli nom-seul obligatoire : un message cité hors fenêtre locale doit quand même ouvrir une fiche profil."
        )
    }

    func test_host_routesQuotedMedia_byAttachmentType_withJumpFallback() throws {
        let code = try hostSource()
        guard let start = code.range(of: "func openQuotedMedia(_ reference: ReplyReference)"),
              let end = code.range(of: "\n    }", range: start.upperBound..<code.endIndex)
        else {
            XCTFail("`openQuotedMedia` est introuvable dans l'hôte.")
            return
        }
        let body = code[start.lowerBound..<end.upperBound]
        XCTAssertTrue(
            body.contains("onMediaTap?(attachment)"),
            "Image/vidéo citée → la MÊME galerie plein écran que la rangée (onMediaTap), jamais une surface parallèle."
        )
        XCTAssertTrue(
            body.contains("playAudio(attachmentId: attachment.id)"),
            "Audio cité → la MÊME file de lecture que la rangée (playAudio)."
        )
        XCTAssertTrue(
            body.contains("scrollToMessage(localId: localId)"),
            "Document ou cité hors fenêtre → repli sur le saut à l'original — jamais un no-op silencieux."
        )
    }

    // MARK: - Câblage jusqu'à la rangée

    func test_focalRow_passesBothCallbacksToTheQuotedReplyView() throws {
        let code = try source("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(
            code.contains("onQuotedAuthorTap: actions.onQuotedAuthorTap"),
            "FocalRow doit transmettre onQuotedAuthorTap — sans ce fil, le tap de l'avatar est mort."
        )
        XCTAssertTrue(
            code.contains("onQuotedMediaTap: actions.onQuotedMediaTap"),
            "FocalRow doit transmettre onQuotedMediaTap — sans ce fil, la vignette est décorative."
        )
    }

    /// **Le trou de la rangée plate, trouvé le 2026-08-24.** Un message AUDIO
    /// qui répond héberge sa citation DANS le widget
    /// (`BubbleContent.audioHostsReply`), et `FocalRow.showsQuotedReply`
    /// l'exclut alors explicitement : cette citation-là n'est PAS rendue par
    /// `FocalQuotedReplyView` mais par `BubbleQuotedReply`, via
    /// `FocalAudioBlock` → `AudioMediaView.replyTopSlot`.
    ///
    /// La LOI DES ZONES posée dans `FocalQuotedReplyView` ne l'atteignait donc
    /// pas : sur le MÊME écran, la citation d'un message texte offrait avatar
    /// et zone média, celle d'un message vocal n'offrait rien. Les deux fils
    /// ci-dessous sont ce qui rend la loi vraie pour TOUTE citation du mode,
    /// pas seulement pour celles que la rangée dessine elle-même.
    ///
    /// « Un écart NON DIT est un défaut » : celui-ci était non dit parce que
    /// la peau concernée porte le nom de l'AUTRE mode.
    func test_loiDesZones_laCitationHebergeeParLAudio_recoitAussiSesDeuxZones() throws {
        let row = try source("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(
            row.contains("onQuotedAuthorTap: actions.onQuotedAuthorTap")
                && row.contains("onQuotedMediaTap: actions.onQuotedMediaTap"),
            "FocalRow doit transmettre les deux zones à FocalAudioBlock AUSSI — sans quoi la citation d'un " +
            "message vocal reste la seule du mode à n'offrir ni avatar ni zone média."
        )
        let block = try source("Meeshy/Features/Main/Focal/Row/FocalAudioBlock.swift")
        XCTAssertTrue(
            block.contains("var onQuotedAuthorTap: ((ReplyReference) -> Void)? = nil")
                && block.contains("var onQuotedMediaTap: ((ReplyReference) -> Void)? = nil"),
            "FocalAudioBlock doit DÉCLARER les deux zones."
        )
        XCTAssertTrue(
            block.contains("onQuotedAuthorTap: onQuotedAuthorTap")
                && block.contains("onQuotedMediaTap: onQuotedMediaTap"),
            "FocalAudioBlock doit les TRANSMETTRE à AudioMediaView, seul hôte de cette citation-là."
        )
        // Et l'exclusion qui rend ce chemin nécessaire est toujours là : si
        // elle disparaissait, la citation serait rendue DEUX fois.
        XCTAssertTrue(
            row.contains("content.reply != nil && !content.audioHostsReply && !content.visualHostsReply"),
            "la rangée ne dessine la citation que si aucun widget ne l'héberge — c'est CETTE exclusion qui " +
            "envoie la citation d'un vocal chez BubbleQuotedReply."
        )
    }

    // MARK: - Les deux zones, pour VoiceOver

    /// **Une zone livrée qu'aucun geste VoiceOver n'atteint n'est pas livrée.**
    /// La rangée pose `.accessibilityElement(children: .combine)` — elle devient
    /// UN élément — puis REMPLACE son libellé par celui du composeur partagé :
    /// le trait de bouton, l'indice et le libellé que la citation pose sur son
    /// avatar et sur sa miniature ne sont jamais prononcés. VoiceOver n'a par
    /// ailleurs ni tap localisé ni appui long. Sans action NOMMÉE, les zones 1
    /// et 2 sont indisponibles au lecteur d'écran, alors que la cellule qui les
    /// héberge en expose déjà trois autres.
    ///
    /// Précédent du dépôt, à trois fichiers de là : `BubbleSystemViews`
    /// (« VoiceOver n'a pas d'appui long : l'action lui est offerte
    /// explicitement, sinon la fiche lui reste inaccessible »). Le lot du
    /// 2026-08-24 avait copié l'idiome du TRAIT et laissé l'ACTION derrière lui.
    func test_loiDesZones_lesDeuxZonesSontOffertesAVoiceOver_surLaRangee() throws {
        let row = try source("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(
            row.contains(".accessibilityActions {"),
            "la rangée doit offrir les zones de la citation en actions NOMMÉES : son `children: .combine` + " +
            "`.accessibilityLabel` explicite efface tout ce que la citation annonce à VoiceOver."
        )
        let block = try slice(
            of: row,
            from: "private var quotedZoneAccessibilityActions",
            to: "\n    private "
        )
        XCTAssertTrue(
            block.contains("bubble.reply.author_hint") && block.contains("bubble.reply.open_media"),
            "les deux actions réemploient les clés que la citation porte déjà — zéro clé neuve, zéro clé morte, " +
            "cliquet français inchangé."
        )
        XCTAssertTrue(
            block.contains("onQuotedAuthorTap(reference)") && block.contains("onQuotedMediaTap(reference)"),
            "chaque action doit DÉCLENCHER sa zone : une action nommée sans effet est un contrôle qui ment, et " +
            "le rotor la récite."
        )
        XCTAssertTrue(
            block.contains("reference.offersAuthorGate") && block.contains("reference.offersMediaGate"),
            "les actions suivent l'ARMEMENT (gestionnaire câblé ET zone offerte par la donnée), jamais la seule " +
            "présence d'une citation — sinon VoiceOver se voit proposer d'ouvrir la fiche d'une story."
        )
    }

    func test_host_mountsBothQuotedCallbacks() throws {
        let code = try hostSource()
        XCTAssertTrue(
            code.contains("focalActions.onQuotedAuthorTap"),
            "L'hôte doit monter onQuotedAuthorTap sur les actions de la rangée."
        )
        XCTAssertTrue(
            code.contains("focalActions.onQuotedMediaTap"),
            "L'hôte doit monter onQuotedMediaTap sur les actions de la rangée."
        )
    }
}
