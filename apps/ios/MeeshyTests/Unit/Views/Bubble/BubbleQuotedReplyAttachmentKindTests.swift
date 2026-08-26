import XCTest
@testable import Meeshy
import MeeshySDK

/// Pins the contract of `BubbleQuotedReply.resolveAttachmentKind`, the
/// helper that decodes `ReplyReference.attachmentType` (a free-form
/// String coming from the SDK) into the canonical `AttachmentKind`.
///
/// Two paths must work:
///   1. Short kind rawValue (`"image"`, `"video"`, ...) — emitted by the
///      post-fix SDK that runs `AttachmentKind(mimeType:).rawValue`.
///   2. Raw MIME (`"image/jpeg"`, `"video/mp4"`, ...) — emitted by older
///      cached payloads still in GRDB before the migration finishes.
///
/// Without this two-step lookup the bubble would show `"paperclip"` + the
/// generic "Media" fallback every time a stale cached payload renders.
@MainActor
final class BubbleQuotedReplyAttachmentKindTests: XCTestCase {

    // MARK: - nil / empty input

    func test_resolve_nilInput_returnsNil() {
        XCTAssertNil(BubbleQuotedReply.resolveAttachmentKind(nil))
    }

    func test_resolve_emptyInput_returnsNil() {
        XCTAssertNil(BubbleQuotedReply.resolveAttachmentKind(""))
    }

    // MARK: - Short kind rawValue (new SDK payloads)

    func test_resolve_imageRawValue_returnsImageKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("image")
        XCTAssertEqual(kind, .image)
        XCTAssertEqual(kind?.sfSymbolName, "camera.fill")
    }

    func test_resolve_videoRawValue_returnsVideoKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("video")
        XCTAssertEqual(kind, .video)
        XCTAssertEqual(kind?.sfSymbolName, "video.fill")
    }

    func test_resolve_audioRawValue_returnsAudioKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("audio")
        XCTAssertEqual(kind, .audio)
    }

    func test_resolve_pdfRawValue_returnsPDFKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("pdf")
        XCTAssertEqual(kind, .pdf)
        XCTAssertEqual(kind?.sfSymbolName, "doc.fill")
    }

    // MARK: - Raw MIME (legacy cached payloads)

    func test_resolve_imageMIME_returnsImageKind() {
        // The pre-fix SDK stored `firstAtt.mimeType` directly. Cached
        // ReplyReferences in GRDB still carry that — the resolver MUST
        // recognise them so the icon doesn't fall back to paperclip.
        let kind = BubbleQuotedReply.resolveAttachmentKind("image/jpeg")
        XCTAssertEqual(kind, .image)
    }

    func test_resolve_videoMIME_returnsVideoKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("video/mp4")
        XCTAssertEqual(kind, .video)
    }

    func test_resolve_audioMIME_returnsAudioKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("audio/mpeg")
        XCTAssertEqual(kind, .audio)
    }

    func test_resolve_pdfMIME_returnsPDFKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("application/pdf")
        XCTAssertEqual(kind, .pdf)
    }

    func test_resolve_pdfMIME_returnsLocalizedShortLabel() {
        // Pinning the fallback that replaces the hardcoded "Media" string
        // in the bubble. For PDF, `shortLabel` returns "PDF" (not
        // localized because the brand uses the format name verbatim).
        let kind = BubbleQuotedReply.resolveAttachmentKind("application/pdf")
        XCTAssertEqual(kind?.shortLabel, "PDF")
    }

    // MARK: - Unknown input

    func test_resolve_unknownMIME_returnsOther() {
        // Single-source-of-truth contract: unknown MIME never returns nil
        // — it folds to `.other` so the UI always has a glyph + label
        // ready (paperclip + "Fichier"). Better than showing a hard-coded
        // "Media" label and an opaque paperclip with no semantic.
        let kind = BubbleQuotedReply.resolveAttachmentKind("application/x-some-binary-format")
        XCTAssertEqual(kind, .other)
        XCTAssertEqual(kind?.sfSymbolName, "paperclip")
    }
}

// MARK: - LOI DES ZONES (directive produit 2026-08-24)

/// **LOI DES ZONES** — une citation n'offre que TROIS classes de zone tactile,
/// et pas une de plus :
/// 1. l'AVATAR de l'auteur cité → ouvre son profil (`onQuotedAuthorTap`) ;
/// 2. la MINIATURE ou l'ICÔNE DE LECTURE → joue ou affiche le média EN PLEIN
///    ÉCRAN (`onQuotedMediaTap`) ;
/// 3. TOUT LE RESTE, LE NOM COMPRIS → retour au message cité.
///
/// Cette peau est celle que voit TOUT LE MONDE : le programme bêta naît éteint
/// (`BetaFeaturesPreference`, défaut OFF) ⇒ `readingModes` OFF ⇒
/// `ReadingModeOrchestrator` rend `.bubbles` dès sa première branche. La
/// rangée plate, où le défaut a été signalé, est derrière le drapeau.
///
/// **Répartition des zones, et pourquoi la garde regarde DEUX niveaux.** Le
/// composant porte les zones 1 et 2 ; la zone 3 vit chez ses TROIS hôtes, qui
/// l'enveloppent chacun d'un `.onTapGesture` vers `onReplyTap` /
/// `onStoryReplyTap`. Une garde qui ne compterait que dans le composant
/// laisserait un hôte poser une quatrième zone sans rougir ; une garde qui ne
/// regarderait que les hôtes ne verrait pas le nom se réarmer.
///
/// Trois précautions, parce qu'un comptage de lexèmes est exactement le genre
/// de garde qui meurt en silence :
/// - **ancre positive d'abord** — une source tronquée par un commentaire de
///   bloc jamais refermé (accident réel du 2026-08-24 : 959 lignes lues → 221)
///   satisferait toute assertion NÉGATIVE ;
/// - **inventaire EXACT**, pas « au moins un » — une 4ᵉ zone doit faire rougir,
///   y compris construite autrement qu'avec `.onTapGesture` ;
/// - **tranches découpées entre DEUX ancres qui doivent toutes deux être
///   trouvées** — sinon la tranche est vide et la négative passe pour rien.
@MainActor
final class BubbleQuotedReplyZoneLawTests: XCTestCase {

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
            .deletingLastPathComponent()   // .../Unit/Views/Bubble
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(path)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// ANCRE POSITIVE — à passer AVANT tout comptage ou toute assertion
    /// négative. Un fichier renommé, déplacé, ou dépouillé jusqu'à la moelle
    /// par un commentaire de bloc ouvert et jamais refermé rendrait vertes
    /// toutes les gardes de cette suite sans protéger quoi que ce soit.
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
                "déplacé — les gardes de la LOI DES ZONES sont INOPÉRANTES."
            XCTFail(reason, file: testFile, line: testLine)
            throw UnanchoredSource(reason: reason)
        }
        return code
    }

    private func quotedReplySource() throws -> String {
        try anchored(
            "Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift",
            "struct BubbleQuotedReply",
            floor: 8_000
        )
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

    // MARK: - Zone 3 : le NOM n'en sort jamais

    /// Le nom n'a JAMAIS porté de geste dans cette peau — c'est ce qui a fait
    /// dire que le défaut était propre à la rangée plate. Cette garde n'est
    /// donc pas une correction : c'est le CLIQUET qui empêche la peau la plus
    /// vue de gagner un jour le défaut que l'autre vient de perdre.
    func test_loiDesZones_leNomNEstPasUneZoneTactile() throws {
        let code = try quotedReplySource()
        let nameSlice = try slice(of: code, from: "Text(quotedTitle)", to: "moodDateLabel(previewColor: previewColor)")

        var offenders: [String] = []
        for lexeme in Self.tapLexemes where nameSlice.contains(lexeme) {
            offenders.append(lexeme)
        }
        if nameSlice.contains(".accessibilityAddTraits(.isButton)") {
            offenders.append(".accessibilityAddTraits(.isButton)")
        }
        XCTAssertTrue(
            offenders.isEmpty,
            "le NOM de l'auteur cité a pris une zone tactile propre [\(offenders.joined(separator: ", "))] — " +
            "LOI DES ZONES 2026-08-24 : le nom retombe sous la zone 3 (retour au message cité), seul l'AVATAR " +
            "ouvre le profil. « Le moins de point actionnable pour permettre de manipuler le message simplement. »"
        )
    }

    // MARK: - Zone 1 : l'avatar → profil

    func test_loiDesZones_lAvatarEstLaSeulePorteVersLeProfil() throws {
        let code = try quotedReplySource()
        let titleRow = try slice(of: code, from: "HStack(spacing: 6) {", to: "Text(quotedTitle)")
        XCTAssertTrue(
            titleRow.contains("authorGate"),
            "l'avatar doit PRÉCÉDER le nom sur la ligne de titre : c'est lui qui porte la porte vers le profil."
        )
        XCTAssertTrue(
            code.contains("MeeshyAvatar("),
            "la citation doit monter l'avatar PARTAGÉ du dépôt (MeeshyAvatar) — jamais un cercle redessiné sur place."
        )
        XCTAssertTrue(
            code.contains("context: .custom(Self.authorAvatarSize)"),
            "l'avatar prend sa cote de la constante NOMMÉE du fichier — jamais un littéral posé dans l'appel."
        )
        XCTAssertTrue(
            code.contains("onTap: authorGateTap"),
            "la ZONE 1 est confiée au `onTap` du composant partagé : il fournit alors sa forme de frappe " +
            "CIRCULAIRE et son haptique, au lieu d'un rectangle rapporté."
        )
        // Compté sur les DEUX formes d'appel — `f?(…)` et `f(…)`.
        let zone1Sites = code.components(separatedBy: "onQuotedAuthorTap?(").count - 1
            + code.components(separatedBy: "onQuotedAuthorTap(").count - 1
        XCTAssertEqual(
            zone1Sites, 1,
            "`onQuotedAuthorTap` doit être déclenché depuis UN SEUL site (l'avatar) — \(zone1Sites) trouvé(s). " +
            "Deux sites = deux points actionnables pour une seule capacité, ce que la directive 2026-08-24 proscrit."
        )
        XCTAssertTrue(
            code.contains("bubble.reply.author_hint"),
            "la clé d'accessibilité du geste « ouvrir le profil » doit vivre là où la ZONE 1 existe. La rangée " +
            "plate l'a DÉPLACÉE du nom vers l'avatar ; ici elle est réemployée. Elle n'est morte nulle part, et " +
            "aucune des sept langues n'a bougé."
        )
    }

    /// L'anti-perte. `authorAvatarUrl` est `nil` à huit des douze sites de
    /// construction de `ReplyReference` : si le rendu de l'avatar était gardé
    /// par la présence de l'URL, la porte vers le profil disparaîtrait
    /// précisément là où le produit la demande. Elle ne dépend que du GENRE de
    /// citation, jamais d'une photo.
    func test_loiDesZones_lAvatarSeDessineMemeSansURL_laPorteNeDependJamaisDUnePhoto() throws {
        let code = try quotedReplySource()
        XCTAssertTrue(
            code.contains("avatarURL: reply.authorAvatarUrl"),
            "l'URL d'avatar est un PARAMÈTRE de l'avatar, jamais sa condition d'existence."
        )
        let gateSlice = try slice(of: code, from: "if showsAuthorGate", to: "MeeshyAvatar(")
        XCTAssertFalse(
            gateSlice.contains("authorAvatarUrl"),
            "l'avatar est gardé par l'URL de la photo — sans photo, plus aucune porte vers le profil. " +
            "MeeshyAvatar retombe sur les initiales colorées : le rendu est INCONDITIONNEL."
        )
        XCTAssertTrue(
            code.contains("!reply.isStoryReply"),
            "la ZONE 1 n'existe que pour la citation d'un MESSAGE : une story ou une humeur citée porte " +
            "`authorName == \"Story\"` (ou vide) et aucun avatar — l'hôte fabriquerait une fiche à ce nom."
        )
    }

    // MARK: - Une zone NON CÂBLÉE n'est pas posée

    /// La nouveauté propre à cette peau. Elle est montée par SIX sites, dont
    /// trois n'ont aucun hôte de résolution (aperçu du menu contextuel, ligne
    /// de conversation, onboarding). Une zone qui y serait posée quand même
    /// AVALERAIT le tap sans rien faire — et le tap n'atteindrait plus la
    /// zone 3, qui, elle, est toujours là. C'est la loi 4 du dépôt : un
    /// contrôle existe s'il a un effet.
    func test_loiDesZones_uneZoneNonCablee_nEstPasPosee_etLeTapRetombeEnZone3() throws {
        let code = try quotedReplySource()
        XCTAssertTrue(
            code.contains("guard let onQuotedAuthorTap, showsAuthorGate else { return nil }"),
            "la ZONE 1 rend un geste OPTIONNEL : sans gestionnaire, `MeeshyAvatar` ne pose aucun geste " +
            "(`hasTapHandler == false`) et le tap traverse jusqu'à la zone 3."
        )
        XCTAssertTrue(
            code.contains("guard let onQuotedMediaTap, !reply.isStoryReply,"),
            "la ZONE 2 rend un geste OPTIONNEL, et refuse la story : le viewer que la zone 3 ouvre pour elle " +
            "EST déjà le plein écran demandé."
        )
        XCTAssertEqual(
            code.components(separatedBy: "if let mediaGateTap").count - 1, 2,
            "les DEUX formes de la zone 2 (miniature, glyphe) doivent chacune n'attacher leur geste que " +
            "lorsqu'il existe — sinon l'image ou le glyphe avale un tap qui ne fait rien."
        )
    }

    // MARK: - Zone 2 : le média → plein écran / lecture

    func test_loiDesZones_uneCapaciteUnSite_leGlypheNeDoubleJamaisLaMiniature() throws {
        let code = try quotedReplySource()
        XCTAssertTrue(
            code.contains("thumbnailUrlString == nil && (attachmentKind?.isMedia ?? false)"),
            "le glyphe ne peut être tactile QUE sans miniature (sinon deux zones pour une capacité) et QUE pour " +
            "un média réellement ouvrable (sinon il double la zone 3)."
        )
        XCTAssertTrue(
            code.contains(".accessibilityHidden(true)"),
            "le glyphe qui n'est PAS une zone tactile est décoratif : effacé de VoiceOver, le libellé court " +
            "voisin (« Photo », « Vidéo », …) disant déjà le genre."
        )
        // Exécution — la table qui décide de l'inertie du glyphe document.
        XCTAssertTrue(AttachmentKind.image.isMedia)
        XCTAssertTrue(AttachmentKind.video.isMedia)
        XCTAssertTrue(AttachmentKind.audio.isMedia)
        XCTAssertFalse(AttachmentKind.pdf.isMedia, "un PDF cité n'ouvre pas de plein écran — son glyphe reste inerte")
        XCTAssertFalse(AttachmentKind.document.isMedia)
    }

    /// La demande produit, mot pour mot : « permettre de voir une icône AUDIO
    /// PLAY pour jouer l'audio cité ». Le `waveform` historique nommait un
    /// TYPE — il ne disait pas que l'audio pouvait s'écouter.
    func test_loiDesZones_lAudioCiteMontreUneIconeDeLecture_pasUneOndeInerte() throws {
        let code = try quotedReplySource()
        XCTAssertTrue(
            code.contains("kind.hasTimebasedTrack ? \"play.circle.fill\" : kind.sfSymbolName"),
            "une piste temporelle citée (audio, vidéo) montre une icône de LECTURE ; les autres familles gardent " +
            "leur glyphe de genre."
        )
        XCTAssertTrue(
            code.contains("attachmentKind?.hasTimebasedTrack == true"),
            "la miniature d'une piste temporelle porte le MÊME bouton play : un seul vocabulaire visuel pour " +
            "« ceci se joue », que la citation ait une vignette ou non."
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

    // MARK: - Zone 2 : un média PROTÉGÉ n'en a pas

    /// **Le lot du 2026-08-24 avait ARMÉ une zone et ANNONCÉ une lecture sur un
    /// contenu que son propre verrou refuse d'ouvrir.** Le verrou posé dans
    /// `openQuotedMedia` ne gardait que le TAP ; douze lignes plus haut, ici,
    /// `playBadge` et `quotedThumbnail` affichaient la vignette NON FLOUTÉE
    /// d'un média protégé et posaient un `play.circle.fill` par-dessus, sans
    /// jamais consulter la protection — qu'ils ne POUVAIENT pas consulter,
    /// `ReplyReference` ne la portant pas.
    ///
    /// Scénario : A envoie une vidéo à VUE UNIQUE, B y répond. La citation de
    /// la réponse — visible par tout le fil, à chaque relecture, sur la peau
    /// que voit TOUT LE MONDE — montrait la vignette de la vidéo protégée sous
    /// un bouton play que le tap refusait d'honorer. Exposition, doublée d'un
    /// contrôle qui ment (loi 4 du dépôt).
    ///
    /// La vignette voyage sans condition depuis la passerelle : c'est la
    /// PROTECTION qui décide de la rendre, jamais son absence.
    func test_loiDesZones_unMediaProtege_nAffichePasSaVignette_etNArmeRien() throws {
        let code = try quotedReplySource()
        XCTAssertTrue(
            code.contains("reply.quotedMediaIsProtected"),
            "la citation doit consulter la protection du média cité — le prédicat PARTAGÉ des deux peaux."
        )
        let thumbSlice = try slice(of: code, from: "private var thumbnailUrlString", to: "private var attachmentKind")
        XCTAssertTrue(
            thumbSlice.contains("quotedMediaIsProtected"),
            "la MINIATURE elle-même doit être filtrée : le verrou du TAP ne retire pas de l'écran la vignette " +
            "en clair d'une vidéo à vue unique."
        )
        let gateSlice = try slice(of: code, from: "private var mediaGateTap", to: "private var glyphOpensTheMedia")
        XCTAssertTrue(
            gateSlice.contains("quotedMediaIsProtected"),
            "la ZONE 2 ne doit pas être armée sur un média protégé. `playBadge` et les deux formes du geste " +
            "sont toutes conditionnées à `mediaGateTap` : le fermer ici les ferme toutes."
        )
        XCTAssertTrue(
            code.contains("if mediaGateTap != nil, attachmentKind?.hasTimebasedTrack == true"),
            "le badge play reste conditionné à l'ARMEMENT de la zone — sans quoi il réapparaîtrait sur un média " +
            "protégé alors même que rien ne peut plus l'ouvrir."
        )
        // Exécution — le prédicat partagé et sa prudence face au silence du fil.
        XCTAssertTrue(makeProtectedReference(true).quotedMediaIsProtected)
        XCTAssertFalse(makeProtectedReference(false).quotedMediaIsProtected)
        XCTAssertFalse(
            makeProtectedReference(nil).quotedMediaIsProtected,
            "`nil` = le fil n'a RIEN dit : la vignette d'une citation ordinaire ne doit pas disparaître parce " +
            "qu'un blob de cache ancien se tait. Le verrou de l'hôte, lui, reste inconditionnel."
        )
        XCTAssertFalse(makeProtectedReference(true).offersMediaGate)
        XCTAssertTrue(makeProtectedReference(false).offersMediaGate)
    }

    /// La protection doit VOYAGER, sinon la garde ci-dessus protège un champ
    /// que personne ne remplit. `ReplyReference` la porte, sa projection
    /// d'égalité la compare, et les DEUX constructeurs du chemin de rendu réel
    /// (réseau et cache) la gravent depuis la même dérivation.
    func test_loiDesZones_laProtectionVoyageJusquALaCitation() throws {
        let slice2 = try slice(
            of: try source("Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift"),
            from: "fileprivate struct ReplySlice",
            to: "private var theme"
        )
        XCTAssertTrue(
            slice2.contains("attachmentIsProtected"),
            "la protection DÉCIDE du rendu : absente de la projection d'égalité (`==` MANUEL), la citation " +
            "resterait figée sur sa première résolution."
        )
        let content = try source("Meeshy/Features/Main/Views/Bubble/BubbleContent.swift")
        XCTAssertTrue(
            content.contains("lhs.reference.attachmentIsProtected == rhs.reference.attachmentIsProtected"),
            "second `==` MANUEL, second inventaire à tenir : `BubbleContent.Reply` filtre l'invalidation de la " +
            "rangée plate comme `ReplySlice` filtre celle de la bulle."
        )
    }

    private func makeProtectedReference(_ isProtected: Bool?) -> ReplyReference {
        ReplyReference(
            messageId: "m1",
            authorName: "Alice",
            previewText: "",
            attachmentType: "video/mp4",
            attachmentThumbnailUrl: "https://cdn.meeshy.me/t.jpg",
            attachmentIsProtected: isProtected
        )
    }

    // MARK: - Les deux zones, pour VoiceOver

    /// **Une zone livrée qu'aucun geste VoiceOver n'atteint n'est pas livrée.**
    /// L'hôte pose `.accessibilityElement(children: .combine)` — la rangée
    /// devient UN élément — puis REMPLACE son libellé : le
    /// `.accessibilityAddTraits(authorGateTraits)`, le
    /// `.accessibilityHint(authorGateHint)` et les
    /// `.accessibilityLabel("bubble.reply.open_media")` posés ici ne sont
    /// jamais prononcés. VoiceOver n'a ni tap localisé ni appui long : sans
    /// action NOMMÉE, les deux capacités que ce lot livre sont indisponibles au
    /// lecteur d'écran, sur la peau servie par défaut.
    ///
    /// Précédent du dépôt, à trois fichiers de là : `BubbleSystemViews`
    /// (« VoiceOver n'a pas d'appui long : l'action lui est offerte
    /// explicitement, sinon la fiche lui reste inaccessible »). Le lot avait
    /// copié l'idiome du TRAIT et laissé l'ACTION derrière lui.
    func test_loiDesZones_lesDeuxZonesSontOffertesAVoiceOver_chezLHote() throws {
        let host = try anchored(
            "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift",
            "struct BubbleStandardLayout",
            floor: 20_000
        )
        XCTAssertTrue(
            host.contains(".accessibilityActions {"),
            "l'hôte doit offrir les zones de la citation en actions NOMMÉES, sur l'élément même qui porte le " +
            "libellé combiné — c'est le seul endroit où VoiceOver peut les entendre."
        )
        let block = try slice(
            of: host,
            from: "private var quotedZoneAccessibilityActions",
            to: "\n    static func nonMediaAccessibilityParts"
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
            "présence d'une citation — sinon VoiceOver se voit proposer d'ouvrir la fiche d'une story, ou de " +
            "lire un média que le verrou refuse."
        )
        // Exécution — ce que la DONNÉE offre, indépendamment de toute peau.
        XCTAssertTrue(makeProtectedReference(false).offersAuthorGate)
        XCTAssertFalse(
            ReplyReference(messageId: "s1", authorName: "Story", previewText: "", isStoryReply: true).offersAuthorGate,
            "une story citée ne désigne aucune personne : l'hôte fabriquerait une fiche au nom de « Story »"
        )
        XCTAssertFalse(
            ReplyReference(messageId: "m2", authorName: "Alice", previewText: "coucou").offersMediaGate,
            "une citation SANS pièce jointe n'offre aucune zone 2 — l'action serait récitée pour rien"
        )
    }

    // MARK: - L'inventaire : aucune 4ᵉ classe de zone

    /// Un COMPTE ne dit pas la destination, et un compte de `.onTapGesture` ne
    /// voit pas une zone posée autrement. Cette garde compte l'UNION des
    /// constructeurs, après l'ancre positive, et énumère dans son message les
    /// sites attendus : une zone de plus, même légitime, oblige à rouvrir la
    /// loi consciemment — c'est exactement le but.
    func test_loiDesZones_inventaireExactDesZonesTactilesDuComposant() throws {
        let code = try quotedReplySource()
        let total = Self.tapLexemes.reduce(0) { partial, lexeme in
            partial + code.components(separatedBy: lexeme).count - 1
        }
        XCTAssertEqual(
            total, 3,
            "inventaire des zones tactiles de BubbleQuotedReply : \(total) au lieu de 3. Les trois SITES " +
            "attendus sont (1) l'avatar → profil, (2) la miniature → plein écran, (3) le glyphe de la ligne " +
            "d'aperçu → plein écran / lecture. Les sites 2 et 3 s'excluent par construction " +
            "(`glyphOpensTheMedia` exige `thumbnailUrlString == nil`) : à l'exécution la citation n'offre " +
            "jamais plus de DEUX cibles ici, la troisième classe (retour au message cité) étant posée par " +
            "l'hôte. Une zone de plus dans ce fichier est une QUATRIÈME classe — la directive du 2026-08-24 " +
            "n'en admet que trois."
        )
    }

    /// La zone 3, chez ses TROIS hôtes — un site chacun, jamais deux. Sans
    /// cette moitié, un hôte pourrait empiler un second geste sur la citation
    /// (« ouvrir le fil », « répondre à nouveau ») sans qu'aucune garde ne
    /// bouge : le composant, lui, resterait à trois.
    func test_loiDesZones_chaqueHoteNePoseQuUneSeuleZone3() throws {
        let hosts: [(path: String, marker: String, floor: Int, jump: String)] = [
            (
                "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift",
                "struct BubbleStandardLayout", 20_000,
                "onStoryReplyTap?(reply.reference.messageId)"
            ),
            (
                "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift",
                "func mediaWithReplyContainer", 5_000,
                "onStoryReplyTap?(reply.reference.messageId)"
            ),
            (
                "Meeshy/Features/Main/Views/ConversationMediaViews.swift",
                "struct AudioMediaView", 20_000,
                "onStoryReplyTap?(ref.messageId)"
            )
        ]

        for host in hosts {
            let code = try anchored(host.path, host.marker, floor: host.floor)
            XCTAssertEqual(
                code.components(separatedBy: host.jump).count - 1, 1,
                "\(host.path) doit poser EXACTEMENT une zone 3 (retour au message cité) autour de la " +
                "citation. \(code.components(separatedBy: host.jump).count - 1) trouvée(s) : 0 = la citation " +
                "n'est plus suivable, 2+ = un second point actionnable pour une seule capacité."
            )
            XCTAssertTrue(
                code.contains("onQuotedAuthorTap: onQuotedAuthorTap"),
                "\(host.path) doit transmettre onQuotedAuthorTap — sans ce fil, l'avatar de la citation est " +
                "dessiné mais MORT, et le tap retombe silencieusement sur la zone 3."
            )
            XCTAssertTrue(
                code.contains("onQuotedMediaTap: onQuotedMediaTap"),
                "\(host.path) doit transmettre onQuotedMediaTap — sans ce fil, la miniature est décorative."
            )
        }
    }

    // MARK: - Le fil jusqu'à l'hôte de résolution

    func test_loiDesZones_laChaineDescendJusquAuControleurDeListe() throws {
        let bubble = try anchored(
            "Meeshy/Features/Main/Views/ThemedMessageBubble.swift",
            "struct ThemedMessageBubble", floor: 10_000
        )
        XCTAssertTrue(
            bubble.contains("var onQuotedAuthorTap: ((ReplyReference) -> Void)? = nil"),
            "ThemedMessageBubble doit DÉCLARER la zone 1 avec un défaut `nil` : les surfaces sans hôte " +
            "(aperçu du menu contextuel, ligne de conversation, onboarding) gardent la seule zone 3."
        )
        XCTAssertTrue(
            bubble.contains("onQuotedAuthorTap: onQuotedAuthorTap") && bubble.contains("onQuotedMediaTap: onQuotedMediaTap"),
            "ThemedMessageBubble doit TRANSMETTRE les deux zones à BubbleStandardLayout."
        )

        let host = try anchored(
            "Meeshy/Features/Main/Views/MessageListViewController.swift",
            "func openQuotedMedia(_ reference: ReplyReference)", floor: 50_000
        )
        XCTAssertTrue(
            host.contains("onQuotedAuthorTap: { [weak self] ref in"),
            "le contrôleur doit monter la zone 1 sur la peau BULLE — c'est la peau servie par défaut " +
            "(programme bêta OFF ⇒ `readingModes` OFF ⇒ `.bubbles`), donc celle où le câblage compte le plus."
        )
        XCTAssertTrue(
            host.contains("onQuotedMediaTap: { [weak self] ref in"),
            "le contrôleur doit monter la zone 2 sur la peau BULLE."
        )
    }

    /// Le verrou d'exposition. Ce lot ÉLARGIT la porte — une icône de lecture
    /// explicite invite là où un glyphe inerte ne le faisait pas, et la peau
    /// vue par tout le monde vient d'acquérir la zone média. `openQuotedMedia`
    /// n'avait AUCUNE garde de protection, là où `BubbleGridCell.handleTap`
    /// refuse d'ouvrir un attachement à vue unique ou flouté non révélé.
    /// Élargir une porte sans son verrou est une régression d'exposition.
    func test_loiDesZones_lHoteRefuseUnMediaProtege_commeLaGrilleDeLaBulle() throws {
        let code = try anchored(
            "Meeshy/Features/Main/Views/MessageListViewController.swift",
            "func openQuotedMedia(_ reference: ReplyReference)", floor: 50_000
        )
        let body = try slice(
            of: code,
            from: "func openQuotedMedia(_ reference: ReplyReference)",
            to: "switch attachment.type {"
        )
        XCTAssertTrue(
            body.contains("attachment.isViewOnce || attachment.isBlurred"),
            "un média cité à VUE UNIQUE ou FLOUTÉ ne doit pas s'ouvrir depuis la citation : le tap retombe sur " +
            "le saut à l'original, où le média garde son propre geste de révélation. Miroir de " +
            "`BubbleGridCell.handleTap` (`guard !attachmentIsProtected || isRevealed`)."
        )
        XCTAssertTrue(
            body.contains("scrollToMessage(localId: localId)"),
            "le refus doit RETOMBER sur le saut à l'original — jamais sur un no-op silencieux, qui ferait " +
            "d'une zone annoncée une cible morte."
        )
    }

    // MARK: - Les cotes, en exécution

    /// Les deux cotes sont NOMMÉES dans le fichier plutôt qu'écrites dans
    /// l'appel : la ZONE 2 et son bouton play doivent parler de la même
    /// surface, et l'avatar de la citation montrer le même visage à la même
    /// taille que celui de la rangée plate (`FocalMetrics.Avatar.size`).
    func test_loiDesZones_lesCotesSontNommees_etAccordeesAvecLaRangeePlate() {
        XCTAssertEqual(
            BubbleQuotedReply.authorAvatarSize, FocalMetrics.Avatar.size,
            "l'avatar d'une citation a la MÊME cote dans les deux peaux — une citation ne change pas de " +
            "visage selon le mode de lecture."
        )
        XCTAssertEqual(
            BubbleQuotedReply.thumbnailSize, 38,
            "la miniature garde sa cote historique : ce lot lui donne un geste, pas une nouvelle taille."
        )
    }
}
