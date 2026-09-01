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
/// **Ce que ce lot (T2.3) ne faisait PAS encore** : lieu et micro restaient
/// `nil`. Les deux ont depuis gagné un effet — `.place` au T2.5
/// (`.attachesLocation`), `.microphone` au T2.6 (`.attachesTranscribedAudio`,
/// dernier des six). `servedRow == canonicalRow` désormais : l'assertion 3 de
/// la garde de la porte du document
/// (`ComposerDocumentSurfaceTests.test_laPorteDuDocument_...`) s'est retournée
/// au T2.6, sur sa PREMIÈRE condition (la rangée) — aucun site de production
/// ne monte la porte pour autant.
///
/// **Une valeur associée, jamais trois cas.**
/// `ComposerDocumentToolEffect.attachesLocalMedia(ComposerMediaIntake)` porte
/// UNE valeur associée — `.photoLibrary` / `.camera` / `.files` — pour que
/// `handleDocumentTool` (`MeeshyComposerHost.swift`) reste aiguillé sur
/// l'EFFET, jamais sur l'outil qui l'a déclenché.
final class ComposerDocumentToolChainTests: XCTestCase {

    // MARK: - Lecture de la source du meuble (gardes de source 4, 5)

    private func hostSource() throws -> String {
        return try AppSourceGuard.composerHostSource()
    }

    private func hostCode() throws -> String {
        AppSourceGuard.stripComments(try hostSource())
    }

    /// **T2.6** — même patron que `hostSource()`/`hostCode()` juste au-dessus,
    /// pour `ComposerDocumentSurface.swift` : c'est là que vit
    /// `DocumentComposerDoor.publish`, la porte d'envoi, jamais dans le meuble.
    private func surfaceSource() throws -> String {
        return try AppSourceGuard.composerSurfaceSource()
    }

    private func surfaceCode() throws -> String {
        AppSourceGuard.stripComments(try surfaceSource())
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

    // MARK: - T2.6 — 1. `.microphone` gagne un effet, vers `.attachesTranscribedAudio`

    /// Mutation nommée par le plan : `.microphone.effect` vaut `nil`
    /// aujourd'hui — l'oublier fait rougir ce test. L'égalité EXACTE avec
    /// `.attachesTranscribedAudio` (pas seulement `!= nil`) attrape en prime
    /// un aiguillage sur un mauvais cas de `ComposerDocumentToolEffect` — par
    /// exemple `.attachesLocalMedia`, qui ouvrirait un sélecteur de FICHIER au
    /// lieu de la feuille d'enregistrement.
    func test_microphone_gagneUnEffet_versLAudioTranscrit() {
        XCTAssertEqual(
            ComposerDocumentTool.microphone.effect, .attachesTranscribedAudio,
            "`.microphone` doit ouvrir `AudioPostComposerView` — le sixième et dernier outil de la rangée "
                + "historique, dernier `nil` à combler (T2.6)."
        )
    }

    // MARK: - 2. servedRow sert les SIX, dans l'ordre canonique

    /// **RETOURNÉE au T2.6** — `servedRow` ne s'arrêtait qu'à cinq outils
    /// (le micro manquait). Mutation nommée par le plan : oublier de donner
    /// un effet à `.microphone` fait rougir CE test — `servedRow` resterait
    /// alors à cinq éléments. `servedRow` reste une PROJECTION de
    /// `canonicalRow` (`canonicalRow.filter { $0.effect != nil }`), jamais une
    /// liste écrite à part.
    func test_servedRow_sertTousLesOutils_dansLOrdreCanonique() {
        XCTAssertEqual(
            ComposerDocumentTool.servedRow,
            ComposerDocumentTool.canonicalRow,
            "L'ordre vient de `canonicalRow` — photo · caméra · emoji · doc · lieu · micro · mention "
                + "— jamais d'une liste à part."
        )
        XCTAssertEqual(
            ComposerDocumentTool.servedRow,
            [.photo, .camera, .emoji, .document, .place, .microphone, .mention],
            "La rangée servie doit couvrir la rangée canonique dans l'ordre de la maquette `1a` "
                + "(#4071). `.mention` est passé en queue parce qu'au 4e rang il poussait trois "
                + "outils hors champ, et qu'il est le seul à avoir une seconde porte — taper `@` : "
                + "les deux seuls outils dont la destination est le TEXTE, pas une pièce jointe."
        )
    }

    // MARK: - La mention a son affordance, et elle a un EFFET

    /// **`@` manquait à la rangée** — retour porteur 2026-08-28 : « il manque
    /// `@` pour mentionner ».
    ///
    /// L'autocomplétion, elle, était déjà là et vivante : la surface monte
    /// `ComposerMentionControllerBox`, l'alimente par
    /// `ComposerMentionFriendsSource` et relaie chaque frappe à
    /// `handleQuery(in:)`. Ce qui manquait n'était donc pas la mécanique mais
    /// l'AFFORDANCE — le geste n'existait que pour qui savait déjà taper `@`.
    ///
    /// L'outil ne peut pas être décoratif : `servedRow` est la projection
    /// `canonicalRow.filter { $0.effect != nil }`, donc un `.mention` sans
    /// effet ne serait tout simplement PAS peint. La loi 4 tient ici sans
    /// discipline — elle est une propriété du type.
    func test_laMention_estServie_etSonEffetEcritDansLeTexte() {
        XCTAssertEqual(
            ComposerDocumentTool.mention.effect, .opensReferencePicker,
            "sans effet, `.mention` disparaîtrait de `servedRow` — un outil peint a forcément un geste"
        )
        XCTAssertTrue(
            ComposerDocumentTool.servedRow.contains(.mention),
            "l'outil doit être SERVI, pas seulement déclaré"
        )
        XCTAssertEqual(
            ComposerDocumentTool.mention.symbolName, "at",
            "le glyphe DIT ce que l'outil fait, et `at` est de la même famille ligne que ses voisins"
        )
    }

    // MARK: - 3. servedRow == canonicalRow — RETOURNÉE, le micro ne manque plus

    /// **RETOURNÉE au T2.6.** Cette garde exigeait `servedRow != canonicalRow`
    /// et le disait sans détour : « le micro doit encore manquer ». Elle
    /// change de côté parce que la CONDITION qu'elle nommait vient de tomber —
    /// `.microphone` gagne enfin son effet (`.attachesTranscribedAudio`), la
    /// PREMIÈRE des deux conditions de levée de la porte du document
    /// (`ComposerDocumentSurfaceTests.test_laPorteDuDocument_...`), la SECONDE
    /// étant tombée au T2.2 (la langue). Aucun site de production ne monte la
    /// porte pour autant : cette garde-ci ne parle que de la RANGÉE, pas du
    /// montage.
    ///
    /// Mutation nommée par le plan : redonner `nil` au micro fait retomber
    /// `servedRow` à cinq éléments et rougir CE test — le sens inverse de
    /// l'ancienne garde, qui rougissait sur l'apparition d'un effet.
    func test_servedRow_devientEgalACanonicalRow_leMicroVientDeGagnerUnEffet() {
        XCTAssertEqual(
            ComposerDocumentTool.servedRow, ComposerDocumentTool.canonicalRow,
            "La rangée couvre désormais tous les outils de la feuille absorbée — la PREMIÈRE des deux "
                + "conditions de levée de la porte du document, la SECONDE (la langue) étant tombée au T2.2."
        )
        XCTAssertNotNil(
            ComposerDocumentTool.microphone.effect,
            "`.microphone` gagne un effet à ce lot — sans ça, le test ci-dessus ne prouverait rien de ce lot."
        )
    }

    // MARK: - T2.6 — DoD du lot 2 : le meuble sert RÉELLEMENT la rangée du document

    /// **Assertion DIRECTE, pas une attente sur T3.1.**
    /// `MeeshyComposerHostGuardTests.test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`
    /// reste VACUOUS — ses trois booléens (dont `leMeubleSertLaRangeeDuDocument()`,
    /// équivalent exact de ce test) ne s'évaluent QUE si un site de
    /// production monte une porte-document, ce qu'aucun ne fait encore. La
    /// deuxième capacité du DoD du lot 2 (spec v2 §E — la rangée d'outils du
    /// meuble couvre celle de la feuille absorbée) tombe donc RÉELLEMENT à ce
    /// lot, mais rien ne le mesure tant que T3.1 ne câble pas la porte. Cette
    /// garde ferme ce trou : elle lit la SOURCE du meuble (`servedDocumentTools`
    /// existe et EST `ComposerDocumentTool.servedRow`) et vérifie la valeur au
    /// niveau du TYPE — même mesure que
    /// `MeeshyComposerHostGuardTests.leMeubleSertLaRangeeDuDocument()`, câblée
    /// ICI plutôt que d'attendre que la porte soit montée.
    ///
    /// Mutation nommée par le plan : oublier un effet sur n'importe lequel des
    /// six outils fait rougir ce test.
    func test_leMeuble_sertReellementLaRangeeDuDocument_dansLeSource() throws {
        let code = try hostCode()
        guard declarationBody(startingAt: "var servedDocumentTools", in: code) != nil else {
            return XCTFail("`servedDocumentTools` est introuvable dans le meuble — la garde ne mesurerait RIEN.")
        }
        XCTAssertTrue(
            compact(code).contains(compact("ComposerDocumentTool.servedRow(for: selectedFormat)")),
            "`servedDocumentTools` doit rester une PROJECTION de `ComposerDocumentTool.servedRow` — jamais "
                + "une seconde liste écrite dans le meuble, qui pourrait diverger de la rangée canonique. "
                + "Depuis #4700 la projection prend le FORMAT : une story n'a pas de champ de contenu à outiller."
        )
        XCTAssertEqual(
            ComposerDocumentTool.servedRow, ComposerDocumentTool.canonicalRow,
            "Le meuble sert `servedDocumentTools`, projection de `servedRow` : tant que `servedRow` ne "
                + "couvre pas `canonicalRow`, le meuble perd des outils par rapport à la feuille historique "
                + "qu'il remplace — photo·caméra·fichier·lieu·micro d'un coup si la rangée était vide."
        )
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
        guard let corps = declarationBody(startingAt: "var documentDraft", in: try hostCode()) else {
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
            discoverabilityPrecision: nil, originalLanguage: nil, mobileTranscription: nil, references: []
        )
        XCTAssertEqual(brouillon.location, lieu, "Le brouillon doit porter le lieu tel que la fabrique l'a reçu.")

        let intent = PublishIntent.document(
            localMedia: brouillon.localMedia,
            declaredType: nil,
            forcePlainPost: brouillon.forcePlainPost,
            content: brouillon.text,
            visibility: brouillon.visibility.rawValue,
            visibilityUserIds: brouillon.visibilityUserIds,
            originalLanguage: brouillon.originalLanguage,
            mentions: brouillon.mentions,
            location: brouillon.location,
            discoverabilityPrecision: brouillon.discoverabilityPrecision,
            transcription: brouillon.mobileTranscription
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
        guard let corps = declarationBody(startingAt: "var documentDraft", in: try hostCode()) else {
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
        guard let corps = declarationBody(startingAt: "var documentOffersNearbyDiscoverability", in: try hostCode()) else {
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
            discoverabilityPrecision: nil, originalLanguage: nil, mobileTranscription: nil, references: []
        )
        XCTAssertNotEqual(
            ComposerDocumentSendPlan.plan(for: brouillon, isOffline: false), .refuse(.emptyDraft),
            "Un lieu seul doit suffire à faire partir un post — la feuille historique l'accepte déjà."
        )
    }

    // MARK: - T2.6 — Un vocal composé dans le meuble part AVEC sa transcription

    /// **Round-trip pur, sans lire de source** — même patron que
    /// `test_unLieuChoisi_voyageJusquALIntentionPubliee` juste au-dessus, pour
    /// la transcription plutôt que le lieu. Sans `mobileTranscription`, le
    /// serveur re-transcrit un vocal déjà transcrit SUR L'APPAREIL et jette ce
    /// travail en silence.
    ///
    /// Mutation nommée par le plan : omettre `transcription:` à l'appel — ou
    /// le poser à `nil` en dur — fait rougir ce test.
    func test_unVocalComposeDansLeMeuble_partAvecSaTranscription() {
        let vocal = ComposerDocumentMedia(
            url: URL(fileURLWithPath: "/tmp/vocal_\(UUID().uuidString).m4a"),
            mimeType: "audio/mp4",
            durationMs: 4000
        )
        let transcrit = MobileTranscriptionPayload(text: "Bonjour tout le monde", language: "fr")

        let brouillon = ComposerDocumentDraft.document(
            format: .post, forcePlainPost: false, text: "", visibility: .public,
            visibilityUserIds: [], repostOfId: nil, localMedia: [vocal], location: nil,
            discoverabilityPrecision: nil, originalLanguage: "fr", mobileTranscription: transcrit, references: []
        )
        XCTAssertEqual(
            brouillon.mobileTranscription, transcrit,
            "Le brouillon doit porter la transcription telle que la fabrique l'a reçue."
        )

        let intent = PublishIntent.document(
            localMedia: brouillon.localMedia,
            declaredType: nil,
            forcePlainPost: brouillon.forcePlainPost,
            content: brouillon.text,
            visibility: brouillon.visibility.rawValue,
            visibilityUserIds: brouillon.visibilityUserIds,
            originalLanguage: brouillon.originalLanguage,
            mentions: brouillon.mentions,
            location: brouillon.location,
            discoverabilityPrecision: brouillon.discoverabilityPrecision,
            transcription: brouillon.mobileTranscription
        )
        XCTAssertNotNil(
            intent.mobileTranscription,
            "La transcription faite SUR L'APPAREIL doit atteindre l'intention publiée — sans elle, le "
                + "serveur re-transcrit un travail déjà fait et le jette en silence."
        )
        XCTAssertEqual(intent.mobileTranscription?.text, "Bonjour tout le monde")
    }

    /// **LE CRUX du lot — la régression de langue à NE PAS rouvrir.**
    /// `PublishIntent.audioRecording` a fermé cette régression (7.4b) sur ses
    /// deux jumeaux : la langue PARLÉE (celle de la transcription) doit
    /// GAGNER sur la langue DÉCLARÉE par la capsule du composer. Un vocal en
    /// wolof composé dans un meuble réglé « fr » ne doit PAS partir étiqueté
    /// « fr » — le Prisme le servirait alors au rang 0 sous une étiquette
    /// fausse.
    ///
    /// Mutation nommée par le plan : passer la capsule telle quelle
    /// (`originalLanguage: originalLanguage`, sans le `??` sur
    /// `transcription?.language`) fait rougir ce test — c'est exactement la
    /// forme de la régression fermée par 7.4b, rouverte ici par une TROISIÈME
    /// fabrique (`.document`) si elle n'est pas gardée à l'identique.
    func test_leCrux_laLangueParleeGagneSurLaCapsule_memeSurLaTroisiemeFabrique() {
        let vocal = ComposerDocumentMedia(
            url: URL(fileURLWithPath: "/tmp/vocal_\(UUID().uuidString).m4a"),
            mimeType: "audio/mp4",
            durationMs: 4000
        )
        let intent = PublishIntent.document(
            localMedia: [vocal],
            declaredType: nil,
            forcePlainPost: false,
            content: nil,
            visibility: "PUBLIC",
            visibilityUserIds: nil,
            originalLanguage: "fr",
            mentions: nil,
            location: nil,
            discoverabilityPrecision: nil,
            transcription: MobileTranscriptionPayload(text: "Salaam", language: "wo")
        )
        XCTAssertEqual(
            intent.originalLanguage, "wo",
            "La langue PARLÉE (transcription: « wo ») doit gagner sur la capsule du meuble (« fr ») — "
                + "sinon un vocal wolof composé dans un composer réglé « fr » repart étiqueté français, et "
                + "le Prisme le traduit FR→WO sur un texte déjà wolof."
        )
    }

    /// **Un document SANS vocal garde la langue de la capsule.** Contre-épreuve
    /// du crux ci-dessus : `transcription: nil` ne doit RIEN changer à
    /// `originalLanguage` — sinon le `??` masquerait un défaut qui écraserait
    /// la langue déclarée d'un post texte ordinaire.
    func test_unDocumentSansVocal_gardeLaLangueDeLaCapsule() {
        let intent = PublishIntent.document(
            localMedia: [],
            declaredType: nil,
            forcePlainPost: false,
            content: "Hello everyone",
            visibility: "PUBLIC",
            visibilityUserIds: nil,
            originalLanguage: "en",
            mentions: nil,
            location: nil,
            discoverabilityPrecision: nil,
            transcription: nil
        )
        XCTAssertEqual(
            intent.originalLanguage, "en",
            "Sans transcription, la langue DÉCLARÉE par la capsule doit voyager telle quelle."
        )
    }

    /// **Le fichier enregistré survit à la porte.** `DocumentComposerDoor.publish`
    /// (`ComposerDocumentSurface.swift`) ne doit JAMAIS effacer le fichier
    /// local qu'il vient d'enfiler — ni sur un refus, ni sur un succès : la
    /// file durable en dispose, et un `removeItem` posé ici détruirait
    /// l'enregistrement AVANT qu'elle n'ait pu le lire. C'est la première des
    /// trois divergences que `PublishIntent` a fermées entre les deux jumeaux
    /// audio (doc-comment de `PublishIntent.swift`) : l'un des deux DÉTRUISAIT
    /// le fichier dans son `catch`.
    ///
    /// **Non-régression plutôt que rouge propre à ce lot** : `publish` ne
    /// touchait déjà pas au disque avant T2.6 (aucun média local n'y était
    /// jamais posé). Le corps de cette garde vaut d'être écrit maintenant que
    /// le sixième outil peut y déposer un fichier — même aveu que
    /// `test_handleDocumentTool_resteExhaustif_sansDefault` sur son absence de
    /// `default`.
    ///
    /// Mutation qui la fait rougir : ajouter un `try? FileManager.default.removeItem(`
    /// dans le corps de `DocumentComposerDoor.publish`.
    func test_lefichierEnregistre_neSurvitPasQuAUnRemoveItemAbsent() throws {
        guard let corps = declarationBody(startingAt: "private func publish(_ draft: ComposerDocumentDraft)", in: try surfaceCode()) else {
            return XCTFail("`DocumentComposerDoor.publish` est introuvable — la garde ne mesurerait RIEN.")
        }
        XCTAssertFalse(
            compact(corps).contains("removeItem"),
            "`DocumentComposerDoor.publish` efface un fichier : un vocal composé par le sixième outil "
                + "serait détruit avant que la file durable n'ait pu l'uploader."
        )
    }

    /// **Le canal, pas seulement la feuille.** `AudioPostComposerView` prouve
    /// que l'auteur PEUT enregistrer et transcrire ; cette garde prouve que ce
    /// résultat ATTEINT le brouillon envoyé à la porte — même patron que
    /// `test_leBrouillonDuDocument_porteLeLieuChoisi_pasUnLitteralNil` pour le
    /// lieu (T2.5).
    ///
    /// Mutation nommée par le plan : un littéral `mobileTranscription: nil`
    /// (au lieu de `mobileTranscription: documentTranscription`) fait rougir
    /// ce test — la transcription faite sur l'appareil serait JETÉE avant
    /// même d'atteindre `PublishIntent.document(transcription:)`.
    func test_leBrouillonDuDocument_porteLaTranscriptionEcrite_pasUnLitteralNil() throws {
        guard let corps = declarationBody(startingAt: "var documentDraft", in: try hostCode()) else {
            return XCTFail("`documentDraft` est introuvable dans le meuble — la garde ne mesurerait RIEN.")
        }
        let compacte = compact(corps)
        XCTAssertTrue(
            compacte.contains(compact("mobileTranscription: documentTranscription")),
            "Le cas `.document` doit poser `mobileTranscription: documentTranscription` — l'état que "
                + "`AudioPostComposerView` écrit au retour du sixième outil, pas un littéral qui l'ignorerait."
        )
        XCTAssertFalse(
            compacte.contains(compact("mobileTranscription: nil")),
            "Le cas `.document` pose encore `mobileTranscription: nil` : la transcription faite sur "
                + "l'appareil n'atteint jamais le brouillon envoyé à la porte."
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
        guard let corps = declarationBody(startingAt: "func handleDocumentTool", in: try hostCode()) else {
            return XCTFail("`handleDocumentTool` est introuvable dans le meuble — la garde ne mesurerait RIEN")
        }
        let compacte = compact(corps)

        XCTAssertFalse(
            compacte.contains("default:"),
            "Un `default:` réintroduit ferait hériter un septième effet du silence — voir le doc-comment "
                + "de `ComposerDocumentToolEffect`."
        )
        for casNomme in [
            ".insertsEmojiIntoText", ".attachesLocalMedia(", ".attachesLocation",
            ".attachesTranscribedAudio", "case.none"
        ] {
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
        for ancre in ["func ingestPhotoLibraryItems", "func ingestFileImporterResult"] {
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
            "func ingestPhotoLibraryItems",
            "func ingestCameraCapture",
            "func ingestFileImporterResult"
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
        guard let corps = declarationBody(startingAt: "func ingestFileImporterResult", in: try hostCode()) else {
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
