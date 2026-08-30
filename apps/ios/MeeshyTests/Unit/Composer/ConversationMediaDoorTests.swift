import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

// MARK: - Seam

/// Résolveur INJECTÉ par le protocole, jamais par le type concret : la porte
/// n'a pas à télécharger quoi que ce soit pour qu'on éprouve ce qu'elle fait
/// d'un succès et d'un échec.
private final class StubMediaResolver: MediaSaveSourceResolving, @unchecked Sendable {
    var result: Result<URL, Error> = .failure(MediaSaveError.sourceUnavailable)
    private(set) var lastRequest: MediaSaveRequest?
    /// Le COMPTE, pas seulement la dernière requête : une graine de texte ne
    /// doit solliciter ce résolveur ZÉRO fois, et `lastRequest == nil` ne
    /// distinguerait pas « jamais appelé » de « appelé puis remis à nil ».
    private(set) var callCount = 0

    func resolveLocalFile(for request: MediaSaveRequest) async throws -> URL {
        lastRequest = request
        callCount += 1
        return try result.get()
    }
}

/// **La PORTE du média reçu** (lot 5, O13).
///
/// Elle est la quatrième porte de production du meuble, et la première dont le
/// profil existait — écrit, testé, câblé sur RIEN — depuis trois lots. Une
/// porte définie et branchée sur rien n'est pas « en attente » : c'est de l'UI
/// morte qui passe au vert dans toutes les gardes, parce qu'aucune ne mesure ce
/// qu'un utilisateur ATTEINT.
@MainActor
final class ConversationMediaDoorTests: XCTestCase {

    // MARK: - Fixtures

    private func makeFile(named name: String, bytes: Int = 512) throws -> URL {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ConversationMediaDoor-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let url = root.appendingPathComponent(name)
        try Data(repeating: 0x37, count: bytes).write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return url
    }

    private func makeJPEG() throws -> URL {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 120, height: 90))
        let image = renderer.image { ctx in
            UIColor.systemIndigo.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 120, height: 90))
        }
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ConversationMediaDoor-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let url = root.appendingPathComponent("recu.jpg")
        try XCTUnwrap(image.jpegData(compressionQuality: 0.9)).write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return url
    }

    private func attachment(
        mimeType: String,
        id: String = "att-1",
        fileUrl: String = "https://cdn.example/recu",
        thumbnailUrl: String? = nil,
        isViewOnce: Bool = false,
        isBlurred: Bool = false,
        isEncrypted: Bool = false
    ) -> MessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            fileName: "recu",
            originalName: "recu",
            mimeType: mimeType,
            fileUrl: fileUrl,
            isViewOnce: isViewOnce,
            isBlurred: isBlurred,
            thumbnailUrl: thumbnailUrl,
            isEncrypted: isEncrypted
        )
    }

    /// Adaptateur de fixture : `seed(for:)` prend désormais un PLAN (#4025), et
    /// les témoins de média n'en désignent qu'une moitié. Écrire l'adaptateur
    /// plutôt que d'élargir chaque appel garde ces témoins concentrés sur ce
    /// qu'ils mesurent — la matérialisation du fichier, pas la forme du plan.
    private func plan(_ media: MessageAttachment?,
                      description: String? = nil) -> ComposableAttachment.SeedPlan {
        ComposableAttachment.SeedPlan(media: media, description: description)
    }

    private func message(_ attachments: [MessageAttachment] = [],
                         content: String = "",
                         isBlurred: Bool = false) -> Message {
        var m = MeeshyMessage(conversationId: "conv-1", content: content, attachments: attachments)
        m.isBlurred = isBlurred
        return m
    }

    // MARK: - Ce que la MATÉRIALISATION rend

    /// Un échec de matérialisation n'ouvre RIEN. Ouvrir une scène sans son
    /// média serait pire que ne rien ouvrir : l'auteur croirait avoir mal visé,
    /// et composerait par-dessus le vide.
    func test_uneMaterialisationQuiEchoue_neRendAucuneGraine() async {
        let resolver = StubMediaResolver()
        resolver.result = .failure(MediaSaveError.sourceUnavailable)

        let seed = await ConversationMediaSeeding.seed(
            for: plan(attachment(mimeType: "image/jpeg")), resolver: resolver)

        XCTAssertNil(seed, "Sans fichier, il n'y a rien à semer — et la porte doit le DIRE, pas l'ouvrir.")
    }

    /// Le résolveur reçoit bien la pièce jointe qu'on lui a désignée : sans
    /// cette assertion, une porte qui matérialiserait une AUTRE pièce du même
    /// message resterait verte.
    func test_laMaterialisation_viseLaPieceJointeDesignee() async throws {
        let resolver = StubMediaResolver()
        resolver.result = .success(try makeJPEG())

        _ = await ConversationMediaSeeding.seed(
            for: plan(attachment(mimeType: "image/jpeg", id: "piece-7")), resolver: resolver)

        XCTAssertEqual(resolver.lastRequest?.attachmentId, "piece-7")
        XCTAssertEqual(resolver.lastRequest?.kind, .image)
    }

    /// Une IMAGE devient un bitmap DÉJÀ DÉCODÉ ; une VIDÉO reste un fichier.
    /// Les inverser casserait la graine des deux côtés : le fond de slide ne
    /// sait poser qu'un bitmap, l'envoi d'un premier plan vidéo qu'un fichier.
    func test_uneImage_devientUnBitmap_uneVideoResteUnFichier() async throws {
        let imageResolver = StubMediaResolver()
        imageResolver.result = .success(try makeJPEG())
        let imageSeed = await ConversationMediaSeeding.seed(
            for: plan(attachment(mimeType: "image/jpeg")), resolver: imageResolver)

        // `payload` est OPTIONNEL depuis #4025 — une graine de TEXTE seul n'a
        // rien à poser. Le `case .none` n'est donc pas une formalité de
        // compilation : il DIT ce que ce témoin attend, à savoir qu'une image
        // reçue produit TOUJOURS une charge. Un double `XCTUnwrap` aurait fait
        // taire la même exigence.
        switch try XCTUnwrap(imageSeed).payload {
        case .image: break
        case .video: XCTFail("Une image reçue doit devenir un BITMAP : le fond de slide n'accepte rien d'autre.")
        case .audio: XCTFail("Une image reçue n'est pas un son — la forme est élue par le mime, une seule fois.")
        case .none: XCTFail("Une image reçue doit produire une charge — une graine SANS payload ne pose rien sur le canvas.")
        }

        let videoResolver = StubMediaResolver()
        videoResolver.result = .success(try makeFile(named: "recu.mp4"))
        let videoSeed = await ConversationMediaSeeding.seed(
            for: plan(attachment(mimeType: "video/mp4")), resolver: videoResolver)

        switch try XCTUnwrap(videoSeed).payload {
        case .video: break
        case .image: XCTFail("Une vidéo reçue doit rester un FICHIER : décoder une piste vidéo en bitmap perdrait le son et le mouvement.")
        case .audio: XCTFail("Une vidéo n'est pas une piste sonore : elle se pose sur le canvas, le son ne s'y pose pas.")
        case .none: XCTFail("Une vidéo reçue doit produire une charge — une graine SANS payload ne pose rien sur le canvas.")
        }
    }

    /// **La composabilité n'est PAS la publiabilité**, et le cas qui les sépare
    /// est l'AUDIO. `PublicationTargetRule.targets` répond « où le PONT peut-il
    /// envoyer ces octets tels quels ? » — note vocale comprise. La graine, elle,
    /// répond « puis-je poser ceci sur un CANVAS ? ». Les fondre ferait offrir
    /// « Composer » sur une note vocale que la graine ne sait pas poser, et
    /// l'atelier ouvrirait sur une couche sans actif chargé — « invisible aux
    /// lecteurs », dit le log de l'upload.
    /// **RETOURNÉ au #4461.** Ce témoin exigeait qu'un son ne sème RIEN, et sa
    /// raison — « l'atelier ouvrirait sur une couche sans actif chargé » — était
    /// juste tant que la graine ne savait poser que des bitmaps et des pistes
    /// vidéo. `StoryComposerSeed.audio` emprunte désormais le chemin du collage
    /// (`attachPastedAudio`), qui charge l'actif : la couche n'est plus vide,
    /// donc le refus n'a plus d'objet.
    ///
    /// Il est retourné et non supprimé : ce qu'il garde maintenant est que le
    /// son sème bien une charge SONORE — pas une image, pas une vidéo, pas
    /// `nil`.
    func test_unAudio_semeUneCharge_SONORE() async throws {
        let resolver = StubMediaResolver()
        resolver.result = .success(try makeFile(named: "note.m4a"))

        let seed = await ConversationMediaSeeding.seed(
            for: plan(attachment(mimeType: "audio/m4a")), resolver: resolver)

        guard case .audio? = seed?.payload else {
            return XCTFail("un son doit semer une charge sonore, pas \(String(describing: seed?.payload))")
        }
    }

    /// Un LIEU (`application/x-location`), un PDF, un document : `AttachmentKind`
    /// les range hors `.image`/`.video`, et la garde O13 « jamais `.location` »
    /// est donc tenue GRATUITEMENT — par la forme de la graine, pas par une
    /// condition qu'on pourrait oublier de recopier.
    func test_niLieuNiDocument_neSeSement() async throws {
        for mime in ["application/x-location", "application/pdf",
                     "application/msword", "text/plain", "application/zip"] {
            let resolver = StubMediaResolver()
            resolver.result = .success(try makeFile(named: "piece.bin"))
            let seed = await ConversationMediaSeeding.seed(
                for: plan(attachment(mimeType: mime)), resolver: resolver)
            XCTAssertNil(seed, "\(mime) ne se pose sur aucun canvas.")
        }
    }

    /// **Une VIGNETTE n'est pas le média.** Le repli `thumbnailUrl` est
    /// recopié tel quel des sites « Enregistrer », où il est bénin : ranger la
    /// vignette dans la photothèque au lieu du film est un moindre mal. Ici il
    /// ne l'est pas — la graine alimente une PUBLICATION. Pour une vidéo, le
    /// JPEG matérialisé serait copié en `{objectId}.jpg` et posé par
    /// `insertForegroundVideo` comme piste VIDÉO : une couche « vidéo » dont
    /// l'actif est une image fixe. Pour une image, le fil recevrait la vignette
    /// à la place de la photo, sans un mot.
    func test_unMediaSansFichier_neSeSemeJamaisDepuisSaVignette() async throws {
        for mime in ["video/mp4", "image/jpeg"] {
            let resolver = StubMediaResolver()
            resolver.result = .success(try makeJPEG())

            let seed = await ConversationMediaSeeding.seed(
                for: plan(attachment(mimeType: mime, fileUrl: "",
                                thumbnailUrl: "https://cdn.example/vignette.jpg")),
                resolver: resolver)

            XCTAssertNil(seed, "\(mime) : la vignette n'est pas le média.")
            XCTAssertNil(
                resolver.lastRequest,
                "Le refus doit précéder la matérialisation — sinon on télécharge une vignette pour la jeter."
            )
        }
    }

    // MARK: - La CIBLE : le troisième verrou de la protection

    /// La cible refait la MÊME mesure que le menu et la feuille, en LISANT la
    /// même règle. C'est le verrou qui survit à un futur déclencheur : un
    /// quatrième site qui oublierait le gate ne pourrait toujours pas construire
    /// de cible sur un média protégé.
    func test_uneCible_refuseUnMediaProtege_auxDeuxNiveaux() {
        XCTAssertNotNil(ComposableMessageTarget(message: message([attachment(mimeType: "image/jpeg")])))

        XCTAssertNil(
            ComposableMessageTarget(message: message([attachment(mimeType: "image/jpeg", isBlurred: true)])),
            "Une pièce FLOUTÉE : le flou est un masque de rendu, et la porte matérialise le fichier d'origine."
        )
        XCTAssertNil(
            ComposableMessageTarget(message: message([attachment(mimeType: "image/jpeg", isViewOnce: true)])),
            "Une pièce à VUE UNIQUE — la protection se déclare aussi au niveau de la pièce jointe."
        )
        XCTAssertNil(
            ComposableMessageTarget(message: message([attachment(mimeType: "image/jpeg")], isBlurred: true)),
            "Un MESSAGE flouté : masqué dans la conversation, il ne s'ouvre pas sur un fil public."
        )
    }

    // MARK: - Gardes de source

    private func sourcesDeLApp() -> [URL] {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
        guard let walker = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil) else {
            XCTFail("L'arbre source de l'app est introuvable — la garde ne mesurerait RIEN")
            return []
        }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// **LA garde qui rend ce lot vérifiable** : la porte a un APPELANT.
    ///
    /// Le profil `.conversationMedia` existait depuis C1 — écrit, testé, et
    /// construit par AUCUN site de production. Toutes les gardes de la table
    /// restaient vertes, parce qu'une table se mesure sans qu'on l'atteigne.
    func test_laPorteDuMediaRecu_estConstruiteParUnSiteDeProduction() throws {
        let sources = sourcesDeLApp()
        XCTAssertGreaterThan(
            sources.count, 50,
            "Trop peu de sources balayées — le chemin de l'arbre app est faux, et la garde ci-dessous "
                + "passerait au vert sur une chaîne vide."
        )
        XCTAssertTrue(
            sources.contains { $0.lastPathComponent == "MeeshyComposerHost.swift" },
            "Garde-fou du garde-fou : le balayage doit atteindre le dossier Composer."
        )

        let porteurs = try sources.filter {
            AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8))
                .contains("ComposerIntent(origin: .conversationMedia(")
        }
        XCTAssertEqual(
            porteurs.map { $0.lastPathComponent }, ["ConversationMediaComposerDoor.swift"],
            "Un seul site construit cette intention, et c'est une PORTE. Zéro : le profil est redevenu "
                + "de l'UI morte. Deux : le montage a été recopié, avec son envoi et sa sortie."
        )
    }

    /// La porte n'envoie RIEN elle-même : elle passe par `StoryViewModel`, qui
    /// possède la file durable et la réconciliation optimiste. Un appel direct
    /// à un service les perdrait toutes les deux — c'est l'interdit du second
    /// chemin d'envoi.
    func test_laPorte_nAppelleAucunServiceDePublication_enDirect() throws {
        let code = try porteCode()

        XCTAssertTrue(
            code.contains("struct ConversationMediaComposerDoor"),
            "Garde-fou : la source lue n'est pas celle de la porte."
        )
        XCTAssertTrue(
            code.contains("publishStoryInBackground("),
            "La porte publie par le modèle — sans cet appel, le format choisi dans l'éventail n'atteint rien."
        )
        for interdit in ["PostService.shared", "postService.publishAttachment("] {
            XCTAssertFalse(
                code.contains(interdit),
                "La porte appelle « \(interdit) » en direct : second chemin d'envoi, hors file durable."
            )
        }
    }

    /// **Un échec se DIT, et referme.** Ce que le test de comportement ci-dessus
    /// mesure s'arrête à la graine ; ce qui suit vérifie que la porte fait
    /// quelque chose de ce `nil` — sans quoi elle resterait montée sur un écran
    /// noir, et l'auteur croirait l'app figée.
    func test_unEchecDeMaterialisation_seDit_etReferme() throws {
        let compact = try porteCode()
            .components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertTrue(
            compact.contains("materialisation=.failed"),
            "L'échec doit être un ÉTAT, pas un silence : sans lui la porte réessaierait sans fin ou "
                + "présenterait un atelier vide."
        )
        XCTAssertTrue(
            compact.contains("FeedbackToastManager.shared.showError("),
            "Un échec muet laisse l'auteur devant un geste qui « n'a rien fait » — il le refera."
        )
        XCTAssertTrue(
            compact.contains("onDismiss()"),
            "La porte doit RENDRE LA MAIN : sans cela, l'échec laisse un plein écran noir sans issue."
        )
    }

    /// L'audience mémorisée traverse le maillon NEUF. Sans elle, le SDK retombe
    /// sur `PostVisibility.friends` sans un mot, et le dernier choix de l'auteur
    /// est perdu (loi 10).
    func test_laPorte_passeLAudienceMemorisee_auMeuble() throws {
        let code = try porteCode()
        let montages = code.components(separatedBy: "MeeshyComposerHost(").dropFirst()

        XCTAssertEqual(montages.count, 1, "La porte monte le meuble une fois, et une seule.")
        for montage in montages {
            XCTAssertTrue(
                String(montage.prefix(600)).contains("initialVisibility:"),
                "Le maillon neuf doit passer `initialVisibility` — sinon l'audience retombe sur « amis », "
                    + "en silence."
            )
        }
    }

    /// **Une ATTENTE plein écran doit avoir une issue** (loi 4 : un écran sans
    /// contrôle n'est pas un état, c'est un blocage).
    ///
    /// La porte est montée en `.fullScreenCover` — non renvoyable au geste — et
    /// sa matérialisation passe par `resolveLocalFile`, qui sur défaut de cache
    /// TÉLÉCHARGE, sans plafond. Sans issue, une vidéo reçue non encore mise en
    /// cache laisse l'auteur devant un plein écran noir pour une durée bornée
    /// par le seul réseau. Le geste JUMEAU (« Enregistrer ») ne fait pas ça : il
    /// résout en tâche de fond et laisse l'app utilisable.
    func test_lAttente_offreUneSortie() throws {
        let code = try porteCode()

        XCTAssertTrue(
            code.contains("struct ConversationMediaComposerDoor"),
            "Garde-fou : la source lue n'est pas celle de la porte."
        )
        let attente = try XCTUnwrap(
            code.components(separatedBy: "private var attente:").dropFirst().first,
            "La vue d'attente a disparu — la garde ne mesurerait RIEN."
        )
        let corps = String(attente.prefix(900))
        XCTAssertTrue(
            corps.contains("Button"),
            "L'attente doit porter un CONTRÔLE. Un `ProgressView` seul dans un plein écran non renvoyable "
                + "au geste n'est pas un état, c'est un blocage."
        )
        XCTAssertTrue(
            corps.contains("onDismiss"),
            "Ce contrôle doit RENDRE LA MAIN : sans lui, un téléchargement lent enferme l'auteur dans un "
                + "plein écran noir pour une durée bornée par le seul réseau."
        )
    }

    private func porteCode() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ConversationMediaComposerDoor.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - #4025 — la porte s'ouvre aussi sur un message TEXTE

    /// **Le troisième verrou s'ouvre au texte, sans se desserrer.**
    ///
    /// `ComposableMessageTarget` existe pour qu'aucun déclencheur — fût-il un
    /// quatrième, écrit demain, qui oublierait le gate d'offre — ne puisse
    /// construire de cible sur un contenu protégé. Il refusait aussi, par
    /// construction, tout message sans pièce jointe : son `init?` exigeait un
    /// `MessageAttachment`. Un message texte ne pouvait donc pas ouvrir la
    /// porte, quoi qu'en dise le menu.
    func test_target_seDeployeSurUnMessageTexte() throws {
        let cible = try XCTUnwrap(ComposableMessageTarget(message: message(content: "On se voit à 18h")))
        XCTAssertNil(cible.attachment, "un message texte ne pose rien sur le canvas")
        XCTAssertEqual(cible.plan.description, "On se voit à 18h")
    }

    /// Et il reste FERMÉ sur ce qui ne sème rien — sans quoi « la porte s'ouvre
    /// aussi sur le texte » deviendrait « la porte s'ouvre toujours », sur une
    /// scène vide.
    func test_target_refuseUnMessageQuiNeSemeRien() {
        XCTAssertNil(ComposableMessageTarget(message: message()))
        XCTAssertNil(ComposableMessageTarget(message: message(content: "   ")))
    }

    /// **Le verrou vaut pour le texte comme pour le média.** Un message flouté
    /// ne construit pas de cible, que la chose masquée soit une photo ou une
    /// phrase — le flou n'est qu'un masque de rendu, jamais une transformation
    /// du contenu.
    func test_target_refuseUnTexteProtege() {
        XCTAssertNil(ComposableMessageTarget(message: message(content: "secret", isBlurred: true)))
    }

    /// La graine d'un message texte ne demande RIEN au résolveur de média : il
    /// n'y a aucun fichier à matérialiser. Le témoin le prouve par le compte
    /// d'appels — un résolveur sollicité pour rien serait un aller-retour
    /// réseau posé sur un geste qui n'en a pas besoin.
    func test_graineTexte_neSollicitePasLeResolveurDeMedia() async throws {
        let resolver = StubMediaResolver()
        let cible = try XCTUnwrap(ComposableMessageTarget(message: message(content: "salut")))

        let graine = await ConversationMediaSeeding.seed(for: cible.plan, resolver: resolver)

        XCTAssertEqual(graine?.description, "salut")
        XCTAssertNil(graine?.payload, "aucun actif à poser sur le canvas")
        XCTAssertEqual(resolver.callCount, 0, "aucun fichier à matérialiser")
    }
}
