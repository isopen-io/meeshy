import XCTest
@testable import Meeshy
import MeeshySDK

/// **Un vocal enregistré sans réseau cesse d'être DÉTRUIT.**
///
/// C'est le seul geste de ce lot dont l'échec détruit le contenu de
/// l'utilisateur, et il le détruisait de deux façons différentes selon le point
/// d'entrée : `publishAudioPost` effaçait le fichier dans son `catch`
/// (`removeItem(at: audioURL)`), `publishAudioFromSheet` le laissait orphelin,
/// que personne ne relit ni ne rejoue. Or les deux montaient le fichier par TUS
/// **sans aucune garde réseau** : hors ligne, l'échec était SYSTÉMATIQUE. Un
/// enregistrement composé dans le métro était perdu à coup sûr.
///
/// La décision de ce lot est une CONSTANTE, pas une table : **un enregistrement
/// local part par la file durable, en ligne comme hors ligne.** Ce qu'on y perd
/// est mesuré et nul — ni l'un ni l'autre jumeau n'écrivait `uploadProgress`
/// (seulement `isUploading`), donc aucune progression n'existe à perdre. Ce
/// qu'on y gagne : le post apparaît optimiste tout de suite, et il survit à un
/// kill de l'app.
@MainActor
final class FeedViewModelAudioPublishTests: XCTestCase {

    private var fichierVocal: URL!

    override func setUp() async throws {
        try await super.setUp()
        fichierVocal = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("voix-\(UUID().uuidString).m4a")
        try Data("des octets d'audio".utf8).write(to: fichierVocal)
    }

    override func tearDown() async throws {
        if let fichierVocal { try? FileManager.default.removeItem(at: fichierVocal) }
        fichierVocal = nil
        try await super.tearDown()
    }

    private func makeSUT(offlineQueue: MockOfflineQueue) -> FeedViewModel {
        FeedViewModel(
            api: MockAPIClientForApp(),
            socialSocket: MockSocialSocket(),
            postService: MockPostService(),
            languageProvider: MockLanguageProvider(preferredLanguages: []),
            offlineQueue: offlineQueue
        )
    }

    private func intention(
        durationMs: Int = 4000,
        transcription: MobileTranscriptionPayload? = nil,
        forcePlainPost: Bool = false
    ) -> PublishIntent {
        PublishIntent.audioRecording(
            fileURL: fichierVocal,
            mimeType: "audio/mp4",
            durationMs: durationMs,
            transcription: transcription,
            forcePlainPost: forcePlainPost,
            content: nil,
            visibility: "PUBLIC",
            visibilityUserIds: nil,
            mentions: nil,
            location: nil,
            discoverabilityPrecision: nil
        )
    }

    // MARK: - 1. La perte, nommée

    /// L'enregistrement est REMIS à la file, et le chemin de publication ne le
    /// supprime pas lui-même.
    ///
    /// **Ce que ce témoin mesure exactement, dit sans le maquiller.** Avec la
    /// VRAIE file, le fichier à ce chemin-là ne survit pas : `enqueuePostMedia`
    /// le COPIE sous `pending-media/<cmid>/` (phase B) puis efface la source
    /// temporaire (phase C). L'enregistrement est donc RELOCALISÉ, jamais
    /// « préservé sur place » — écrire l'inverse ici deviendrait la loi lue par
    /// la session suivante, qui en conclurait que la file ne doit pas déplacer
    /// les fichiers. Ce qui est prouvé ici, sur un double qui ne touche pas le
    /// disque, c'est que le VIEW MODEL ne détruit rien : la destruction d'hier
    /// était un `removeItem(at: audioURL)` écrit dans le `catch` du chemin de
    /// publication, et la garde de source plus bas est ce qui la retient.
    func test_publierUnVocal_lEnfileDurablement_etNeDetruitPasLEnregistrement() async {
        let queue = MockOfflineQueue()
        let sut = makeSUT(offlineQueue: queue)

        await sut.publish(intention())

        XCTAssertEqual(queue.enqueuePostMediaCalls.count, 1, "un vocal part par la file durable, et une seule fois")
        XCTAssertEqual(queue.enqueuePostMediaCalls.first?.sourceMediaURLs, [fichierVocal])
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: fichierVocal.path),
            "Le chemin de PUBLICATION a supprimé l'enregistrement de son propre chef. C'est la perte que ce "
                + "lot ferme : hors ligne, la montée TUS échouait systématiquement et le `catch` effaçait le "
                + "fichier. Seule la file a le droit d'en disposer — elle le relocalise d'abord."
        )
        XCTAssertEqual(sut.posts.count, 1, "le post apparaît optimiste tout de suite")
        XCTAssertTrue(sut.publishSuccess)
        XCTAssertNil(sut.publishError)
    }

    /// Le post optimiste est clé par le jeton de l'INTENTION — sans quoi l'écho
    /// du gateway ne pourrait pas le remplacer, et le vocal apparaîtrait en
    /// double au flush.
    func test_lePostOptimiste_estCleParLeJetonDeLIntention() async {
        let queue = MockOfflineQueue()
        let sut = makeSUT(offlineQueue: queue)
        let intent = intention()

        await sut.publish(intent)

        XCTAssertEqual(sut.posts.first?.id, intent.clientMutationId)
        XCTAssertEqual(queue.enqueuePostMediaCalls.first?.clientMutationId, intent.clientMutationId)
    }

    // MARK: - 3. Ce qui QUALIFIE la chaîne voyage AVEC elle

    /// Sans la transcription embarquée, le serveur re-transcrit
    /// (`PostService.createPost` ne l'évite qu'en la RECEVANT) : le travail fait
    /// sur l'appareil est jeté en silence, et le texte affiché peut cesser
    /// d'être celui que l'auteur avait relu.
    func test_laTranscriptionFaiteSurLAppareil_voyageJusquALaFile() async {
        let queue = MockOfflineQueue()
        let sut = makeSUT(offlineQueue: queue)
        let transcription = MobileTranscriptionPayload(
            text: "Salut tout le monde", language: "fr", durationMs: 4000
        )

        await sut.publish(intention(transcription: transcription))

        XCTAssertEqual(
            queue.enqueuePostMediaCalls.first?.mobileTranscription?.text, "Salut tout le monde",
            "La transcription faite sur l'appareil est perdue entre l'intention et la file : le serveur la "
                + "refera, et le résultat peut différer de celui que l'auteur a relu."
        )
        XCTAssertEqual(
            queue.enqueuePostMediaCalls.first?.originalLanguage, "fr",
            "La langue d'un vocal est celle qu'on PARLE, portée par la transcription."
        )
    }

    /// Sans transcription, AUCUNE langue n'est déclarée — le serveur détecte.
    /// C'est la divergence mesurée entre les deux jumeaux : celui de la feuille
    /// empruntait la langue du sélecteur de TEXTE, et un vocal en wolof composé
    /// dans un composer réglé sur « fr » partait déclaré français.
    func test_sansTranscription_aucuneLangueNEstDeclaree() async {
        let queue = MockOfflineQueue()
        let sut = makeSUT(offlineQueue: queue)

        await sut.publish(intention(transcription: nil))

        XCTAssertNil(queue.enqueuePostMediaCalls.first?.originalLanguage)
        XCTAssertNil(queue.enqueuePostMediaCalls.first?.mobileTranscription)
    }

    /// **Le MIME DÉCLARÉ voyage jusqu'à la file.**
    ///
    /// Il était REÇU par la fabrique puis JETÉ : il ne servait qu'à élire le
    /// type, et le dispatcher re-dérivait ensuite un MIME depuis l'EXTENSION du
    /// fichier relocalisé. Pour un vocal importé depuis Fichiers en `.caf` /
    /// `.aiff` / `.opus`, cette dérivation rend `application/octet-stream` — et
    /// le gateway ne reconnaît un média audio qu'à
    /// `mimeType.startsWith('audio/')` : ni transcription embarquée persistée,
    /// ni Whisper, et une carte optimiste rendue comme une IMAGE. Le site
    /// d'envoi connaissait pourtant le MIME depuis le début.
    func test_leMimeDeclare_voyageJusquALaFile() async {
        let queue = MockOfflineQueue()
        let sut = makeSUT(offlineQueue: queue)

        await sut.publish(intention())

        XCTAssertEqual(
            queue.enqueuePostMediaCalls.first?.sourceMediaMimeTypes, ["audio/mp4"],
            "Le MIME déclaré par le site d'envoi doit voyager AVEC le fichier. Sans lui, le dispatcher le "
                + "re-dérive de l'extension, et un conteneur audio hors table part annoncé "
                + "`application/octet-stream` : le fichier cesse d'être une voix pour tout le reste de la chaîne."
        )
    }

    // MARK: - 4. Le type suit `ReelComposition`, au même endroit qu'avant

    func test_leTypeDUnVocal_resteCeluiDeLaRegleDeComposition() async {
        let longue = MockOfflineQueue()
        await makeSUT(offlineQueue: longue).publish(intention(durationMs: 4000))
        XCTAssertEqual(longue.enqueuePostMediaCalls.first?.type, "REEL")

        let forcee = MockOfflineQueue()
        await makeSUT(offlineQueue: forcee).publish(intention(durationMs: 4000, forcePlainPost: true))
        XCTAssertEqual(forcee.enqueuePostMediaCalls.first?.type, "POST")

        let courte = MockOfflineQueue()
        await makeSUT(offlineQueue: courte).publish(intention(durationMs: 1200))
        XCTAssertEqual(courte.enqueuePostMediaCalls.first?.type, "POST")
    }

    /// Le refus SYNCHRONE de la file retire le post optimiste — sans quoi un
    /// vocal impossible à enfiler resterait affiché comme publié.
    func test_leRefusDeLaFile_retireLePostOptimiste() async {
        let queue = MockOfflineQueue()
        queue.enqueuePostMediaError = APIError.networkError(URLError(.timedOut))
        let sut = makeSUT(offlineQueue: queue)

        await sut.publish(intention())

        XCTAssertTrue(sut.posts.isEmpty)
        XCTAssertNotNil(sut.publishError)
        XCTAssertFalse(sut.publishSuccess)
    }

    // MARK: - 6. La ligne créée par ce lot a des CONSOMMATEURS

    private func brouillonEnFile(media: [URL], type: String = "REEL") -> RecoveredOfflinePost {
        RecoveredOfflinePost(
            clientMutationId: "cmid_bloque",
            content: "",
            visibility: "PUBLIC",
            originalLanguage: nil,
            type: type,
            moodEmoji: nil,
            audioUrl: nil,
            audioDuration: nil,
            visibilityUserIds: nil,
            localMediaURLs: media,
            createdAt: Date(timeIntervalSinceNow: -120)
        )
    }

    /// **Un vocal bloqué en file n'est JAMAIS proposé comme brouillon — parce
    /// que l'accepter le DÉTRUIT.**
    ///
    /// La chaîne, mesurée maillon par maillon : le composer du feed ne sait
    /// restaurer que l'image et la vidéo (`restoreRecoveredMedia` fait
    /// `case .audio: break`), donc le brouillon « restauré » est VIDE ; il pose
    /// quand même `recoveredPostCmid` ; et la publication suivante, quelle
    /// qu'elle soit, appelle `supersedeRecoveredPost` → `cancelCreatePost`, qui
    /// efface le fichier relocalisé ET la ligne. L'enregistrement n'a alors
    /// jamais été vu par son auteur.
    ///
    /// Le trou est né du lot lui-même : avant que les deux jumeaux vocaux
    /// entrent dans cette file, aucune ligne `.createPost` ne portait d'audio,
    /// et le `break` était juste. **Un lot qui fait converger une chaîne doit
    /// énumérer les CONSOMMATEURS de la ligne qu'il vient de créer.**
    func test_uneLigneVocaleBloquee_nEstJamaisProposeeCommeBrouillon() async {
        let queue = MockOfflineQueue()
        queue.recoverLastUnsentPostResult = brouillonEnFile(media: [fichierVocal])
        let sut = makeSUT(offlineQueue: queue)

        let brouillon = await sut.recoverUnsentPost()

        XCTAssertNil(
            brouillon,
            "Un vocal a été offert comme brouillon. Le composer ne sait pas le rouvrir : il rendra un "
                + "brouillon VIDE, puis la publication suivante supprimera la ligne ET le fichier. "
                + "L'enregistrement est perdu sans que l'auteur l'ait jamais vu."
        )
    }

    /// **Le même conteneur exotique, et la même perte.** Un `.caf` importé
    /// depuis Fichiers est un enregistrement comme un autre : si la table des
    /// extensions ne le reconnaît pas comme audio, la garde ci-dessus le laisse
    /// passer et la destruction reprend.
    func test_unVocalDansUnConteneurApple_estReconnuLuiAussi() async {
        let caf = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("voix-\(UUID().uuidString).caf")
        let queue = MockOfflineQueue()
        queue.recoverLastUnsentPostResult = brouillonEnFile(media: [caf])
        let sut = makeSUT(offlineQueue: queue)

        let brouillon = await sut.recoverUnsentPost()

        XCTAssertNil(brouillon, "`.caf` doit être reconnu comme une voix — sinon la garde ne couvre que `.m4a`.")
    }

    /// Non-régression : la reprise de brouillon reste OFFERTE pour ce que le
    /// composer sait rouvrir. Sans ce témoin, « ne rien proposer jamais »
    /// satisferait le précédent.
    func test_unBrouillonVISUEL_resteProposeALaReprise() async {
        let photo = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("photo-\(UUID().uuidString).jpg")
        let queue = MockOfflineQueue()
        queue.recoverLastUnsentPostResult = brouillonEnFile(media: [photo], type: "POST")
        let sut = makeSUT(offlineQueue: queue)

        let brouillon = await sut.recoverUnsentPost()

        XCTAssertEqual(brouillon?.clientMutationId, "cmid_bloque")
    }

    // MARK: - Gardes de SOURCE — 2. UN SEUL chemin, et 5. la destruction a disparu

    private var racineApp: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/ViewModels
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private struct AncreIntrouvable: Error, CustomStringConvertible {
        let ancre: String
        var description: String { "L'ancre `\(ancre)` a disparu — la garde ne mesurerait RIEN" }
    }

    private func corpsDeDeclaration(commencantPar ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var corps = ""
        for caractere in code[debut.lowerBound...] {
            corps.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return corps }
            }
        }
        return nil
    }

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(
            try String(contentsOf: racineApp.appendingPathComponent(chemin), encoding: .utf8)
        )
    }

    /// **Les deux jumeaux ne montent plus, et n'effacent plus.**
    ///
    /// La garde vise le CORPS de chaque fonction, jamais le fichier : celui-ci
    /// porte cinq autres chemins de publication qui montent légitimement par
    /// TUS, et une garde ancrée sur le fichier les condamnerait en croyant
    /// protéger l'audio.
    func test_lesDeuxJumeauxAudio_neMontentPlusEtNEffacentPlus() throws {
        let code = try source("Features/Main/Views/FeedView+Attachments.swift")

        for ancre in ["func publishAudioPost(", "private func publishAudioFromSheet("] {
            guard let corps = corpsDeDeclaration(commencantPar: ancre, dans: code) else {
                throw AncreIntrouvable(ancre: ancre)
            }
            XCTAssertTrue(
                corps.contains("PublishIntent.audioRecording("),
                "\(ancre) ne compose plus d'intention de publication — les deux jumeaux doivent publier la "
                    + "MÊME matière, sinon ils recommenceront à diverger."
            )
            XCTAssertFalse(
                corps.contains("TusUploadManager"),
                "\(ancre) monte de nouveau le fichier lui-même. Hors ligne, cette montée échoue "
                    + "SYSTÉMATIQUEMENT — c'est ce qui rendait la perte certaine."
            )
            XCTAssertFalse(
                corps.contains("removeItem(at: audioURL)"),
                "\(ancre) efface de nouveau l'enregistrement. C'est la DESTRUCTION du contenu de "
                    + "l'utilisateur : le fichier n'est relocalisé que par la file durable, qui seule sait "
                    + "quand il a été téléversé."
            )
        }
    }

    /// **Un seul chemin, quelles que soient les conditions réseau.** La règle du
    /// lot est une CONSTANTE, pas une table : y remettre une condition ferait
    /// renaître les deux comportements que ce lot vient de fusionner — et la
    /// branche la moins empruntée serait, comme hier, celle qui détruit.
    func test_lePublieurDeVocal_neConsulteAucuneConditionReseau() throws {
        let code = try source("Features/Main/ViewModels/FeedViewModel.swift")
        guard let corps = corpsDeDeclaration(
            commencantPar: "func publish(_ intent: PublishIntent)", dans: code
        ) else {
            throw AncreIntrouvable(ancre: "func publish(_ intent: PublishIntent)")
        }

        XCTAssertFalse(
            corps.contains("NetworkMonitor"),
            "Le publieur consulte l'état du réseau. Un enregistrement local part par la file durable EN "
                + "LIGNE COMME HORS LIGNE : c'est la constante qui rend les deux jumeaux prouvablement "
                + "identiques."
        )
        XCTAssertFalse(corps.contains("isOffline"))
    }

    /// **L'audience choisie GOUVERNE un vocal — loi 4 : un contrôle existe s'il
    /// a un EFFET.**
    ///
    /// Les deux hôtes tiennent `postVisibility` / `postVisibilityUserIds` dans
    /// leur portée immédiate (leur sélecteur d'audience les écrit, et leurs
    /// cinq autres chemins de publication les lisent) ; les deux jumeaux
    /// vocaux publiaient quand même `"PUBLIC"`. Le comportement était le même
    /// avant la convergence — par le DÉFAUT de `createPost` — et c'est ce qui
    /// rend le littéral pire que l'oubli : un défaut est un trou, un littéral
    /// est une décision apparente que personne n'a prise.
    func test_lesDeuxJumeauxAudio_honorentLAudienceChoisie() throws {
        let code = try source("Features/Main/Views/FeedView+Attachments.swift")

        for ancre in ["func publishAudioPost(", "private func publishAudioFromSheet("] {
            guard let corps = corpsDeDeclaration(commencantPar: ancre, dans: code) else {
                throw AncreIntrouvable(ancre: ancre)
            }
            XCTAssertTrue(
                corps.contains("visibility: postVisibility"),
                "\(ancre) publie sous une audience qui n'est pas celle que l'auteur a choisie. Choisir "
                    + "« seulement ces personnes » puis enregistrer sa voix publiait à TOUT LE MONDE."
            )
            XCTAssertTrue(
                corps.contains("visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds"),
                "\(ancre) perd la liste NOMMÉE de l'audience. `[]` n'est pas `nil` : le gateway entend un "
                    + "effacement là où l'auteur a désigné des personnes."
            )
            XCTAssertFalse(
                corps.contains("visibility: \"PUBLIC\""),
                "\(ancre) grave de nouveau l'audience en littéral."
            )
        }
    }

    /// **Le modèle du feed cesse de citer un serveur qui a changé.**
    ///
    /// Il portait « the gateway only echoes the cmid on the POST branch of
    /// post:created, so only type == "POST" can be reconciled ». Mesuré :
    /// `core.ts` ne bifurque qu'entre STORY, STATUS et TOUT LE RESTE — un RÉEL
    /// emprunte la même branche `else` qu'un POST, son cmid EST échoué, et
    /// `postCreated` réconcilie par cmid SEUL sans regarder le type.
    ///
    /// Cette phrase-là ne pouvait pas rester : ce lot enfile désormais un vocal
    /// sous le type `"REEL"`, et la réconciliation par cmid est exactement la
    /// garantie dont dépend son post optimiste. Un commentaire qui énonce plus
    /// ÉTROIT que le code est la loi que lira la session suivante.
    ///
    /// **Garde lue sur la source BRUTE, commentaires compris** — comme sa
    /// jumelle sur `StatusViewModel` : la dépouiller effacerait précisément la
    /// phrase cherchée, et la garde serait verte pour la mauvaise raison.
    func test_leModeleDuFeed_neCitePlusUnServeurQuiAChange() throws {
        let url = racineApp.appendingPathComponent("Features/Main/ViewModels/FeedViewModel.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            brut.contains("func publish(_ intent: PublishIntent)"),
            "Le fichier lu n'est pas celui du modèle du feed — la garde ne mesurerait RIEN."
        )
        XCTAssertFalse(
            brut.contains("only type == \"POST\" can be reconciled"),
            "Le modèle cite encore un serveur qui a changé : un RÉEL passe par la même branche `else` que "
                + "le POST, donc son cmid est échoué et il se réconcilie par cmid seul. Corriger la phrase, "
                + "pas la garde."
        )
    }
}
