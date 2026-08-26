import XCTest
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **T2.3 — trois outils inertes gagnent un effet : photo, caméra et document
/// posent désormais un fichier LOCAL dans le brouillon.**
///
/// Jusqu'ici, `ComposerDocumentTool.effect` ne concédait qu'UN outil (l'emoji,
/// qui n'ingère rien — il écrit dans le texte que le meuble possède déjà).
/// Les cinq autres rendaient `nil` faute de destination :
/// `ComposerDocumentDraft` ne portait ni `mediaIds`, ni fichier, ni lieu.
/// T2.1 a comblé le premier trou (`ComposerDocumentDraft.localMedia`), T2.2 le
/// second pour la langue (`documentLanguage`) — ce lot ferme le troisième pour
/// TROIS des cinq outils restants : photo, caméra, document.
///
/// **Ce que ce lot ne fait PAS**, et qu'il ne faut pas lire comme acquis :
/// lieu et micro restent `nil`. `servedRow != canonicalRow` doit RESTER vrai —
/// c'est l'assertion 3 de la garde de la porte du document
/// (`ComposerDocumentSurfaceTests.test_laPorteDuDocument_...`), et elle ne se
/// retourne pas ce lot.
///
/// **Une valeur associée, jamais trois cas.**
/// `ComposerDocumentToolEffect.attachesLocalMedia(ComposerMediaIntake)` porte
/// UNE valeur associée — `.photoLibrary` / `.camera` / `.files` — pour que
/// `handleDocumentTool` (`MeeshyComposerHost.swift`) reste aiguillé sur
/// l'EFFET, jamais sur l'outil qui l'a déclenché.
final class ComposerDocumentToolChainTests: XCTestCase {

    // MARK: - Lecture de la source du meuble (gardes de source 4, 5)

    private func hostSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func hostCode() throws -> String {
        AppSourceGuard.stripComments(try hostSource())
    }

    private func compact(_ text: String) -> String {
        text.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// Ancre une garde sur un BLOC (une fonction) et non sur le fichier
    /// entier. Coupe à l'accolade fermante appariée du premier bloc rencontré.
    /// `nil` quand l'ancre a disparu — l'appelant fait alors rougir, jamais
    /// passer.
    private func declarationBody(startingAt anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var body = ""
        for character in code[start.lowerBound...] {
            body.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return body }
            }
        }
        return nil
    }

    // MARK: - 8. Le garde-fou du corpus

    /// Sans lui, un chemin devenu faux ferait passer TOUTES les gardes
    /// négatives de cette suite sur une chaîne vide : elles resteraient
    /// vertes pour la mauvaise raison, y compris le jour où l'interdit
    /// qu'elles cherchent serait réintroduit.
    func test_theGuardsReadANonEmptySource() throws {
        let code = try hostCode()
        XCTAssertGreaterThan(
            code.count, 400,
            "La source du meuble est introuvable ou vide — les gardes ci-dessous ne mesureraient RIEN"
        )
        XCTAssertTrue(code.contains("struct MeeshyComposerHost"), "Le fichier lu n'est pas celui du meuble")
    }

    // MARK: - 1. Photo, caméra, document gagnent un effet

    /// Mutation nommée par le plan : les laisser à `nil` fait rougir ce test.
    /// L'égalité EXACTE (pas seulement `!= nil`) attrape en prime une valeur
    /// associée mal aiguillée (photo qui ouvrirait la caméra, par exemple).
    func test_photoCameraDocument_gagnentUnEffet_versLeBonSelecteur() {
        XCTAssertEqual(
            ComposerDocumentTool.photo.effect, .attachesLocalMedia(.photoLibrary),
            "`.photo` doit ouvrir la photothèque."
        )
        XCTAssertEqual(
            ComposerDocumentTool.camera.effect, .attachesLocalMedia(.camera),
            "`.camera` doit ouvrir la capture en direct."
        )
        XCTAssertEqual(
            ComposerDocumentTool.document.effect, .attachesLocalMedia(.files),
            "`.document` doit ouvrir l'importateur de fichiers."
        )
    }

    // MARK: - T2.5 — 1. `.place` gagne un effet, vers `.attachesLocation`

    /// Mutation nommée par le plan : `.place.effect` vaut `nil` aujourd'hui —
    /// le laisser ainsi fait rougir ce test. L'égalité EXACTE avec
    /// `.attachesLocation` (pas seulement `!= nil`) attrape en prime un
    /// aiguillage sur un mauvais cas de `ComposerDocumentToolEffect`.
    func test_place_gagneUnEffet_versLaPosition() {
        XCTAssertEqual(
            ComposerDocumentTool.place.effect, .attachesLocation,
            "`.place` doit ouvrir `LocationPickerView` — le canal que `ComposerDocumentDraft.location` "
                + "(T2.1) attend depuis le début."
        )
    }

    // MARK: - 2. servedRow sert les cinq, dans l'ordre canonique

    /// Mutation nommée par le plan : écrire une seconde liste ferait bouger
    /// l'ordre que les doigts connaissent. `servedRow` reste une PROJECTION de
    /// `canonicalRow` (`canonicalRow.filter { $0.effect != nil }`), jamais une
    /// liste écrite à part. Élargi au T2.5 : `.place` rejoint la rangée servie.
    func test_servedRow_sertPhotoCameraEmojiDocumentPlace_dansLOrdreCanonique() {
        XCTAssertEqual(
            ComposerDocumentTool.servedRow,
            [.photo, .camera, .emoji, .document, .place],
            "L'ordre vient de `canonicalRow` — photo · caméra · emoji · document · lieu — jamais d'une "
                + "liste à part."
        )
    }

    // MARK: - 3. servedRow != canonicalRow — seul le micro manque encore

    /// Mutation nommée par le plan : donner un effet au micro d'un coup
    /// ferait tomber la garde de la porte du document AVANT que T2.6 ne le
    /// décide (`ComposerDocumentSurfaceTests.test_laPorteDuDocument_...`).
    func test_servedRow_resteDistinctDeCanonicalRow_seulLeMicroManqueEncore() {
        XCTAssertNotEqual(
            ComposerDocumentTool.servedRow, ComposerDocumentTool.canonicalRow,
            "Le micro doit encore manquer à la rangée servie : lui donner un effet ferait tomber la garde "
                + "de la porte avant que T2.6 ne le décide."
        )
        XCTAssertNotNil(
            ComposerDocumentTool.place.effect,
            "`.place` gagne un effet à ce lot — sans ça, le test ci-dessus ne prouverait rien de ce lot."
        )
        XCTAssertNil(ComposerDocumentTool.microphone.effect, "Le micro ne gagne pas d'effet dans ce lot.")
    }

    // MARK: - T2.5 — Le lieu choisi atteint le brouillon envoyé à la porte

    /// **Le canal, pas seulement le sélecteur.** `LocationPickerView` prouve
    /// que l'auteur PEUT choisir un lieu ; cette garde prouve que ce choix
    /// ATTEINT le brouillon envoyé à la porte. Sans elle, `ComposerDocumentDraft`
    /// porterait `location` depuis T2.1 sans qu'aucun geste du meuble ne
    /// l'alimente jamais — exactement le trou que ce lot ferme.
    ///
    /// Mutation nommée par le plan : un littéral `location: nil` (au lieu de
    /// `location: documentLocation`) fait rougir ce test — le lieu choisi
    /// serait JETÉ avant même d'atteindre `PublishIntent.document(location:)`.
    func test_leBrouillonDuDocument_porteLeLieuChoisi_pasUnLitteralNil() throws {
        guard let corps = declarationBody(startingAt: "private var documentDraft", in: try hostCode()) else {
            return XCTFail("`documentDraft` est introuvable dans le meuble — la garde ne mesurerait RIEN.")
        }
        let compacte = compact(corps)
        XCTAssertTrue(
            compacte.contains(compact("location: documentLocation")),
            "Le cas `.document` doit poser `location: documentLocation` — l'état que `LocationPickerView` "
                + "écrit, pas un littéral qui l'ignorerait."
        )
        XCTAssertFalse(
            compacte.contains(compact("location: nil,")),
            "Le cas `.document` pose encore `location: nil` : le lieu choisi n'atteint jamais le brouillon "
                + "envoyé à la porte."
        )
    }

    /// **Round-trip pur, sans lire de source** — le plombage que la garde
    /// ci-dessus câble existe bien de bout en bout : un lieu posé sur
    /// `ComposerDocumentDraft.document(location:)` doit atteindre
    /// `PublishIntent.document(location:)` tel quel, exactement le canal que
    /// `DocumentComposerDoor.publish` emprunte en production
    /// (`location: draft.location`). Mutation nommée par le plan : le jeter
    /// en route fait rougir ce test.
    func test_unLieuChoisi_voyageJusquALIntentionPubliee() {
        let lieu = SharedPlace(latitude: 48.8583736, longitude: 2.2944813, name: "Tour Eiffel")
        let brouillon = ComposerDocumentDraft.document(
            format: .post, forcePlainPost: false, text: "bonjour", visibility: .public,
            visibilityUserIds: [], repostOfId: nil, localMedia: [], location: lieu,
            discoverabilityPrecision: nil, originalLanguage: nil
        )
        XCTAssertEqual(brouillon.location, lieu, "Le brouillon doit porter le lieu tel que la fabrique l'a reçu.")

        let intent = PublishIntent.document(
            localMedia: brouillon.localMedia,
            forcePlainPost: brouillon.forcePlainPost,
            content: brouillon.text,
            visibility: brouillon.visibility.rawValue,
            visibilityUserIds: brouillon.visibilityUserIds,
            originalLanguage: brouillon.originalLanguage,
            mentions: brouillon.mentions,
            location: brouillon.location,
            discoverabilityPrecision: brouillon.discoverabilityPrecision
        )
        XCTAssertEqual(intent.location, lieu, "Le lieu choisi doit atteindre l'intention publiée, jamais s'y perdre.")
    }

    // MARK: - T2.5 — Le second opt-in ne part QUE sur un choix explicite

    /// **Mutation nommée par le plan : poser une valeur par défaut ⇒ on
    /// rendrait trouvable un contenu que personne n'a accepté.**
    ///
    /// Comportement, testé au niveau du type qui porte la règle —
    /// `NearbyDiscoverabilityChoice` reste FERMÉ tant que rien n'a été activé,
    /// quelle que soit la mémoire locale. T2.5 délègue entièrement à lui,
    /// jamais une seconde écriture de la même règle.
    func test_leSecondOptIn_neParTQueSurUnChoixExplicite_jamaisParDefaut() {
        let memoireOuverte = NearbyDiscoverabilityChoice(memorized: .city, sharing: .exact)
        XCTAssertNil(
            memoireOuverte.precisionToSend,
            "Une mémoire non vide ne doit PRÉ-SÉLECTIONNER que le PALIER, jamais ACTIVER l'opt-in : "
                + "`isDiscoverable` reste `false` tant que l'auteur ne l'a pas ouvert."
        )
        XCTAssertNil(
            NearbyDiscoverabilityChoice.disabled.precisionToSend,
            "L'état inerte (aucun lieu choisi) ne doit jamais envoyer de palier."
        )
    }

    /// **Garde de câblage** — le meuble doit lire CE canal, jamais poser une
    /// valeur en dur. Sans elle, le test ci-dessus pourrait être juste et
    /// correct sans que la production ne l'appelle jamais.
    func test_leBrouillonDuDocument_porteLeSecondOptInDepuisLeChoix_jamaisUnLitteral() throws {
        guard let corps = declarationBody(startingAt: "private var documentDraft", in: try hostCode()) else {
            return XCTFail("`documentDraft` est introuvable dans le meuble — la garde ne mesurerait RIEN.")
        }
        let compacte = compact(corps)
        XCTAssertTrue(
            compacte.contains(compact("documentDiscoverability.precisionToSend")),
            "Le cas `.document` doit poser `discoverabilityPrecision:` depuis "
                + "`documentDiscoverability.precisionToSend` — la seule source qui sache si l'auteur a "
                + "explicitement activé le second opt-in."
        )
    }

    // MARK: - T2.5 — Le second opt-in n'est offert que sous la garde SDK, appelée

    /// Mutation nommée par le plan : recopier la condition
    /// (`hasPlace && visibility == .public` écrit à la main) diverge de
    /// `FeedNearbyDiscoverability.offers` au premier ajustement de l'une des
    /// deux — c'est exactement le défaut que cette fonction existe pour
    /// fermer, et que le composer inline du fil a déjà fermé une fois.
    func test_leSecondOptIn_estGateParFeedNearbyDiscoverabilityOffers_appelee_pasRecopiee() throws {
        guard let corps = declarationBody(startingAt: "private var documentOffersNearbyDiscoverability", in: try hostCode()) else {
            return XCTFail("`documentOffersNearbyDiscoverability` est introuvable dans le meuble — la garde "
                + "ne mesurerait RIEN.")
        }
        XCTAssertTrue(
            corps.contains("FeedNearbyDiscoverability.offers("),
            "Le second opt-in doit être gardé par `FeedNearbyDiscoverability.offers(hasPlace:visibility:)` "
                + "— la MÊME règle que le composer inline, jamais une condition recopiée."
        )
        XCTAssertFalse(
            compact(corps).contains(compact("== .public")),
            "Une condition `== .public` recopiée ICI diverge de `FeedNearbyDiscoverability.offers` au "
                + "premier ajustement de l'une des deux."
        )
    }

    // MARK: - T2.5 — Un lieu SEUL, sans texte ni média, peut partir

    /// Mutation nommée par le plan : exiger un texte ferait refuser
    /// exactement ce que `FeedView+Attachments.publishPostWithAttachments`
    /// accepte déjà (`pendingPlace != nil` dans son garde d'entrée) — parité
    /// de plan entre le meuble et la feuille historique.
    func test_unLieuSeul_sansTexteNiMedia_peutPartir() {
        let lieu = SharedPlace(latitude: 48.8583736, longitude: 2.2944813, name: "Tour Eiffel")
        let brouillon = ComposerDocumentDraft.document(
            format: .post, forcePlainPost: false, text: "", visibility: .public,
            visibilityUserIds: [], repostOfId: nil, localMedia: [], location: lieu,
            discoverabilityPrecision: nil, originalLanguage: nil
        )
        XCTAssertNotEqual(
            ComposerDocumentSendPlan.plan(for: brouillon, isOffline: false), .refuse(.emptyDraft),
            "Un lieu seul doit suffire à faire partir un post — la feuille historique l'accepte déjà."
        )
    }

    // MARK: - 4. handleDocumentTool reste exhaustif, sans `default`

    /// **Correction d'audit du plan (vague 1b).** `handleDocumentTool`
    /// switche sur `tool.effect : ComposerDocumentToolEffect?`, et ne porte
    /// AUCUN `default` avant comme après ce lot — l'assertion « pas de
    /// `default` » est donc une NON-RÉGRESSION, pas un rouge propre à ce lot.
    /// Le rouge qui compte ici est la COMPILATION : ajouter
    /// `.attachesLocalMedia` à `ComposerDocumentToolEffect` sans l'ajouter au
    /// `switch` casse le build de l'app avant que ce test tourne. Ce que ce
    /// test vérifie donc : les cas nommés SONT dans le corps, et `default`
    /// N'Y EST PAS — pour qu'un `default:` réintroduit le fasse tomber.
    func test_handleDocumentTool_resteExhaustif_sansDefault() throws {
        guard let corps = declarationBody(startingAt: "private func handleDocumentTool", in: try hostCode()) else {
            return XCTFail("`handleDocumentTool` est introuvable dans le meuble — la garde ne mesurerait RIEN")
        }
        let compacte = compact(corps)

        XCTAssertFalse(
            compacte.contains("default:"),
            "Un `default:` réintroduit ferait hériter un septième effet du silence — voir le doc-comment "
                + "de `ComposerDocumentToolEffect`."
        )
        for casNomme in [".insertsEmojiIntoText", ".attachesLocalMedia(", ".attachesLocation", "case.none"] {
            XCTAssertTrue(
                compacte.contains(compact(casNomme)),
                "« \(casNomme) » est absent de `handleDocumentTool` : le `switch` sur `tool.effect` n'est "
                    + "plus exhaustif à la main."
            )
        }
    }

    // MARK: - 5. ComposerIngestRouter.route(mime:) reste le SEUL classement image/vidéo

    /// Mutation nommée par le plan : reclasser à la main ouvrirait un second
    /// pipeline. `ComposerIngestRouter.route(mime:)` (`ComposerDropResolver.swift`)
    /// est le SEUL classement image/vidéo du dépôt — six sites de production
    /// le partagent déjà (`ComposerIngestRouterTests`).
    func test_leMeuble_neReclassifiePasImageVideoLuiMeme() throws {
        let code = try hostCode()
        for interdit in ["hasPrefix(\"image/\"", "hasPrefix(\"video/\""] {
            XCTAssertFalse(
                code.contains(interdit),
                "Le meuble reclasse « \(interdit) » lui-même : `ComposerIngestRouter.route(mime:)` est le "
                    + "SEUL classement image/vidéo du dépôt."
            )
        }
    }

    // MARK: - 6. Un fichier local ajouté porte son mime DÉCLARÉ, jamais dérivé de l'extension

    /// **Comportement**, pas une garde de source. `ComposerDocumentMediaFactory`
    /// (`ComposerDocumentSurface.swift`) est le site UNIQUE qui traduit ce
    /// qu'un sélecteur rend en `ComposerDocumentMedia`, et c'est lui que les
    /// trois familles d'ingestion du meuble appellent
    /// (`ingestPhotoLibraryItems`, `ingestCameraCapture`,
    /// `ingestFileImporterResult`).
    ///
    /// Le fichier ici porte un nom TEMPORAIRE générique — son extension ne dit
    /// RIEN du contenu réel, exactement le cas mesuré par `PublishIntent`
    /// (`PublishIntent.swift:64-75`) pour un vocal `.caf` importé depuis
    /// Fichiers : dériver le mime de l'extension (absente ici) y rendrait
    /// `application/octet-stream`, jamais le mime déclaré.
    ///
    /// **Ce que CE test ne prouve PAS (revue Opus, correctif 3)** : que
    /// `ingestFileImporterResult` DÉRIVE réellement ce mime depuis le
    /// `UTType` du fichier importé — il court-circuite cette dérivation en
    /// passant `"audio/x-caf"` EN DUR à la factory, qui n'est qu'un
    /// passe-plat. La dérivation RÉELLE (et son repli quand `UTType` ne rend
    /// aucun mime) est exercée par
    /// `test_leMimeDUnFichierCAF_neRetombeJamaisSurOctetStream` ci-dessous,
    /// via `ComposerMediaProbe.mime(forURL:declaredType:)`.
    func test_unFichierLocalAjoute_portesLeMimeDeclare_pasDeriveDeLExtension() {
        let url = URL(fileURLWithPath: "/tmp/composer_intake_\(UUID().uuidString)")
        let media = ComposerDocumentMediaFactory.media(url: url, declaredMimeType: "audio/x-caf")

        XCTAssertEqual(
            media.mimeType, "audio/x-caf",
            "Le mime DÉCLARÉ à la source doit voyager tel quel jusqu'au brouillon."
        )
        XCTAssertNotEqual(
            media.mimeType, MimeTypeResolver.mimeType(forURL: url),
            "Si cette égalité tient, le test ne prouve plus rien : dériver de l'extension (absente ici) "
                + "rendrait `application/octet-stream`, jamais le mime déclaré."
        )
    }

    // MARK: - Revue Opus — correctif 3 (mime import retombe sur octet-stream)

    /// **La VRAIE dérivation, pas un passe-plat.** `UTType.preferredMIMEType`
    /// rend `nil` pour `.caf` (`com.apple.coreaudio-format`) — un UTType
    /// pourtant bien identifié — et un repli direct sur
    /// `application/octet-stream` y ferait perdre EXACTEMENT le défaut que ce
    /// lot prétend fermer : la passerelle ne reconnaît un média audio qu'à
    /// `mimeType.startsWith('audio/')` (`PublishIntent.swift:64-75`), et
    /// n'y lance donc jamais Whisper.
    ///
    /// La prémisse (`preferredMIMEType == nil` pour `.caf`) est vérifiée EN
    /// PREMIER : si ce système la contredit, ce test doit rougir pour CETTE
    /// raison plutôt que de valider silencieusement un chemin jamais exercé.
    func test_leMimeDUnFichierCAF_neRetombeJamaisSurOctetStream() {
        let declaredType = UTType(filenameExtension: "caf")
        XCTAssertNil(
            declaredType?.preferredMIMEType,
            "Si ce système rend un mime pour `.caf`, la prémisse du test change — vérifier avant de lire "
                + "la suite : le repli mesuré ici ne serait plus exercé."
        )

        let url = URL(fileURLWithPath: "/tmp/enregistrement_\(UUID().uuidString).caf")
        let mime = ComposerMediaProbe.mime(forURL: url, declaredType: declaredType)

        XCTAssertTrue(
            mime.hasPrefix("audio/"),
            "« \(mime) » — un repli direct sur `application/octet-stream` désactiverait la reconnaissance "
                + "audio côté passerelle."
        )
        XCTAssertNotEqual(mime, "application/octet-stream")
    }

    /// Quand le système DONNE un mime, il gagne — le repli par extension ne
    /// s'active QUE si `preferredMIMEType` est `nil`, jamais en plus.
    func test_leMimeDeclare_gagneSurLeRepliParExtension_quandLeSystemeEnRendUn() {
        let url = URL(fileURLWithPath: "/tmp/photo_\(UUID().uuidString).heic")
        let declaredType = UTType.heic

        let mime = ComposerMediaProbe.mime(forURL: url, declaredType: declaredType)

        XCTAssertEqual(mime, declaredType.preferredMIMEType)
    }

    /// **Garde de câblage — la photothèque ET l'importateur DÉLÈGUENT la
    /// dérivation à `ComposerMediaProbe.mime(`, ils ne recalculent plus
    /// `?? "application/octet-stream"` eux-mêmes.**
    ///
    /// Sans cette garde, `ComposerMediaProbe.mime` pourrait exister, correct
    /// et testé en isolation (les deux tests ci-dessus), sans qu'aucun site
    /// de production ne l'appelle jamais — exactement le défaut que la revue
    /// Opus a nommé pour `test_unFichierLocalAjoute_...` : une sonde juste,
    /// mais un import qui ne la traverse pas.
    func test_laPhotothequeEtLImportateur_delegantLaDerivationDuMime_ALaSonde() throws {
        let code = try hostCode()
        XCTAssertEqual(
            occurrences(of: "ComposerMediaProbe.mime(", in: code), 2,
            "La photothèque et l'importateur doivent tous deux déléguer à `ComposerMediaProbe.mime(` — la "
                + "caméra n'en a pas besoin, son mime est CONNU (JPEG/QuickTime, choisi en écrivant le "
                + "fichier)."
        )
        for ancre in ["private func ingestPhotoLibraryItems", "private func ingestFileImporterResult"] {
            guard let corps = declarationBody(startingAt: ancre, in: code) else {
                XCTFail("« \(ancre) » est introuvable — la garde ne mesurerait RIEN")
                continue
            }
            XCTAssertFalse(
                compact(corps).contains(compact("?? \"application/octet-stream\"")),
                "« \(ancre) » recalcule encore son propre repli `application/octet-stream` au lieu de "
                    + "déléguer à `ComposerMediaProbe.mime(`, qui seul sait retomber sur la table par "
                    + "EXTENSION avant d'atteindre ce repli terminal."
            )
        }
    }

    // MARK: - Revue Opus — correctif 1 (vidéo → POST au lieu de RÉEL)

    /// **Comportement, sans toucher le disque.** Une image (ou un fichier
    /// générique) n'a pas de durée : la sonde route par
    /// `ComposerIngestRouter.route(mime:)` AVANT de charger quoi que ce soit
    /// avec `AVFoundation`, donc un chemin INEXISTANT ne fait ni échouer ni
    /// attendre cette branche — la seule façon de le prouver sans fixture
    /// vidéo/audio réelle (leçon du dépôt : synthétiser un clip H.264 dans un
    /// test est trop fragile en CI, `CameraModelSegmentMergeTests`).
    func test_laDureeDUneImage_estNilSansToucherLeDisque() async {
        let url = URL(fileURLWithPath: "/tmp/nexiste-pas-\(UUID().uuidString).jpg")
        let duration = await ComposerMediaProbe.durationMs(forURL: url, mime: "image/jpeg")
        XCTAssertNil(duration, "Une image n'a pas de durée — la sonde ne doit même pas tenter l'AVFoundation.")
    }

    func test_laDureeDUnFichierGenerique_estNilSansToucherLeDisque() async {
        let url = URL(fileURLWithPath: "/tmp/nexiste-pas-\(UUID().uuidString).pdf")
        let duration = await ComposerMediaProbe.durationMs(forURL: url, mime: "application/pdf")
        XCTAssertNil(duration)
    }

    /// **Garde de câblage — les trois ingestions sondent la durée RÉELLE, et
    /// ne la figent plus à `nil`.**
    ///
    /// `AVURLAsset(url:).load(.duration)` exige un fichier réel sur disque :
    /// une vidéo synthétique en test unitaire serait fragile (leçon nommée
    /// au test précédent). Ce que cette garde mesure à la place — le seul
    /// signal fiable sans fixture — est le CÂBLAGE : chaque ingestion capable
    /// de porter une vidéo/un audio appelle `ComposerMediaProbe.durationMs(`
    /// et ne fige plus `durationMs: nil` en dur.
    ///
    /// Mutation qui la fait rougir : retirer un des trois appels, ou
    /// réintroduire un littéral `durationMs: nil` dans un de ces corps.
    func test_lesTroisIngestions_sondentLaDureeReelle_neLaFigentPlusANil() throws {
        let code = try hostCode()
        XCTAssertEqual(
            occurrences(of: "ComposerMediaProbe.durationMs(", in: code), 3,
            "Les trois ingestions (photothèque, caméra, importateur) doivent sonder la durée RÉELLE — sans "
                + "quoi une vidéo composée dans le meuble partirait `durationMs: nil` et `ReelComposition` "
                + "la classerait `.post` au lieu de `.reel`."
        )
        for ancre in [
            "private func ingestPhotoLibraryItems",
            "private func ingestCameraCapture",
            "private func ingestFileImporterResult"
        ] {
            guard let corps = declarationBody(startingAt: ancre, in: code) else {
                XCTFail("« \(ancre) » est introuvable — la garde ne mesurerait RIEN")
                continue
            }
            XCTAssertFalse(
                compact(corps).contains(compact("durationMs: nil")),
                "« \(ancre) » fige encore `durationMs: nil` — la durée réelle d'une vidéo/audio ne "
                    + "partirait jamais jusqu'au brouillon."
            )
        }
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    // MARK: - Revue Opus — correctif 4 (fichier déjà accessible perdu)

    /// **`startAccessingSecurityScopedResource()` rend `false` pour un
    /// fichier qui N'EST PAS security-scoped** (conteneur app, certains
    /// fournisseurs) — ce n'est PAS un échec, et un `guard ... else {
    /// continue }` sauterait ce fichier pourtant lisible.
    func test_ingestFileImporterResult_neSautePasUnFichierDejaAccessible() throws {
        guard let corps = declarationBody(startingAt: "private func ingestFileImporterResult", in: try hostCode()) else {
            return XCTFail("`ingestFileImporterResult` est introuvable — la garde ne mesurerait RIEN")
        }
        let compacte = compact(corps)
        XCTAssertFalse(
            compacte.contains(compact("guard sourceURL.startAccessingSecurityScopedResource() else { continue }")),
            "Un `guard ... else { continue }` sur le retour de `startAccessingSecurityScopedResource()` "
                + "saute tout fichier qui n'est pas security-scoped, alors qu'il est lisible."
        )
        XCTAssertTrue(
            compacte.contains(compact("if scoped {")),
            "`stopAccessingSecurityScopedResource()` doit être conditionné à un `start` qui a rendu `true` "
                + "— jamais appelé sur une ressource qui n'a jamais été prise."
        )
    }
}
