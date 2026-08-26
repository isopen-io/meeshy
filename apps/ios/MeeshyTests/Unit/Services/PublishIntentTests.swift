import XCTest
import MeeshySDK
@testable import Meeshy

/// **Une INTENTION de publier : ce que l'auteur a produit, composé UNE fois.**
///
/// Le défaut qu'elle ferme n'est pas un bug isolé, c'est un mécanisme. Deux
/// jumeaux publiaient le même geste — un enregistrement vocal — depuis deux
/// endroits, et ils divergeaient sur trois points à la fois : l'un DÉTRUISAIT le
/// fichier dans son `catch`, l'autre le laissait orphelin ; l'un étiquetait
/// l'enregistrement avec la langue de la TRANSCRIPTION, l'autre avec celle du
/// sélecteur de TEXTE du composer ; et ils ne portaient pas les mêmes mentions.
/// Rien de tout cela ne se voit en lisant l'un des deux.
///
/// Ce que ce type retient, et qui est la LEÇON du lot :
///
/// - **une fabrique de charge ne pose AUCUNE valeur par défaut.** Un défaut fait
///   disparaître un champ d'un site d'appel sans casser la moindre compilation
///   — c'est exactement ainsi que la branche hors ligne de `setStatus` avait
///   perdu la source et la voix d'un mood, pendant que sa jumelle en ligne les
///   passait. La garde de source ci-dessous rend cette règle EXÉCUTABLE ;
/// - **l'init est PRIVÉ.** On n'entre pas dans ce type autrement que par un
///   geste NOMMÉ, ce qui interdit qu'un huitième site de publication se compose
///   une intention à sa façon ;
/// - **la langue d'un vocal est celle qu'on PARLE.** La fabrique ne prend
///   AUCUNE langue de composer : la retenir en paramètre serait garder
///   l'occasion de refaire la divergence mesurée.
final class PublishIntentTests: XCTestCase {

    private func fichierAudio(_ nom: String = "voix.m4a") -> URL {
        URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(nom)
    }

    private func intentionVocale(
        durationMs: Int = 4000,
        transcription: MobileTranscriptionPayload? = nil,
        forcePlainPost: Bool = false,
        mentions: [PostMentionInput]? = nil
    ) -> PublishIntent {
        PublishIntent.audioRecording(
            fileURL: fichierAudio(),
            mimeType: "audio/mp4",
            durationMs: durationMs,
            transcription: transcription,
            forcePlainPost: forcePlainPost,
            content: nil,
            visibility: "PUBLIC",
            visibilityUserIds: nil,
            mentions: mentions,
            location: nil,
            discoverabilityPrecision: nil
        )
    }

    private func intentionDocument(
        localMedia: [ComposerDocumentMedia] = [],
        forcePlainPost: Bool = false,
        originalLanguage: String? = nil
    ) -> PublishIntent {
        PublishIntent.document(
            localMedia: localMedia,
            forcePlainPost: forcePlainPost,
            content: "bonjour",
            visibility: "PUBLIC",
            visibilityUserIds: nil,
            originalLanguage: originalLanguage,
            mentions: nil,
            location: nil,
            discoverabilityPrecision: nil
        )
    }

    // MARK: - 1. Le type suit la règle de composition, au MÊME endroit qu'avant

    /// Non-régression exacte de `ReelComposition.defaultType` : la convergence
    /// des deux jumeaux ne doit RIEN changer à la surface où le contenu atterrit.
    /// Un `"REEL"` codé en dur ici ferait tomber les deux cas `POST`.
    func test_lIntentionVocale_suitLaRegleDeCompositionDuReel() {
        XCTAssertEqual(
            intentionVocale(durationMs: 4000).type, "REEL",
            "Un vocal d'au moins 3 s qualifie un RÉEL — même moteur que les chemins visuels."
        )
        XCTAssertEqual(
            intentionVocale(durationMs: 4000, forcePlainPost: true).type, "POST",
            "`forcePlainPost` reste honoré : l'auteur qui refuse le format réel garde son post."
        )
        XCTAssertEqual(
            intentionVocale(durationMs: 1200).type, "POST",
            "Sous le plancher de durée, un vocal ne qualifie pas."
        )
        XCTAssertEqual(
            intentionVocale(durationMs: 4000).type,
            ReelComposition.defaultType(
                mimeTypes: ["audio/mp4"], durationsMs: [4000], forcePlainPost: false
            ).rawValue,
            "La règle vit dans `ReelComposition`, et nulle part ailleurs."
        )
    }

    // MARK: - 2. La langue d'un vocal est celle qu'on PARLE

    /// Le jumeau de la feuille étiquetait un enregistrement SANS transcription
    /// avec la langue du sélecteur de TEXTE. Un vocal en wolof composé dans un
    /// composer réglé sur « fr » partait donc déclaré français — et le Prisme le
    /// servait au rang 0 sous une étiquette fausse.
    func test_laLangueDUnVocal_estCelleDeLaTranscription_ouAUCUNE() {
        let transcrit = intentionVocale(
            transcription: MobileTranscriptionPayload(text: "Salaam", language: "wo")
        )
        XCTAssertEqual(transcrit.originalLanguage, "wo")

        XCTAssertNil(
            intentionVocale(transcription: nil).originalLanguage,
            "Sans transcription, personne sur l'appareil ne sait ce qui a été DIT : la langue reste à "
                + "détecter par le serveur. Emprunter celle du sélecteur de texte mal-étiquette le Prisme "
                + "au rang 0 — c'est la divergence mesurée entre les deux jumeaux."
        )
    }

    // MARK: - 3. Un cmid est un jeton d'ENVOI, jamais une empreinte de contenu

    func test_deuxIntentionsDeMemeMatiere_portentDeuxJetonsDifferents() {
        let premiere = intentionVocale()
        let seconde = intentionVocale()

        XCTAssertNotEqual(
            premiere.clientMutationId, seconde.clientMutationId,
            "Deux envois d'une même matière sont deux envois. Un cmid dérivé du contenu ferait prendre le "
                + "second pour un rejeu du premier, et le gateway répondrait le résultat du premier."
        )
        for jeton in [premiere.clientMutationId, seconde.clientMutationId] {
            XCTAssertTrue(
                ClientMutationId.isValid(jeton),
                "Le jeton doit respecter le contrat serveur (`ClientMutationId.regexPattern`) : \(jeton)"
            )
        }
    }

    // MARK: - Ce que l'intention TRANSPORTE, champ par champ

    /// LOI 4 appliquée aux données : un champ que personne ne remplit ni ne lit
    /// est du code mort testé vert. Chacun est ici prouvé ALIMENTÉ.
    func test_lIntentionPorteToutCeQuiQualifieLEnregistrement() {
        let transcription = MobileTranscriptionPayload(
            text: "Salut tout le monde", language: "fr", durationMs: 4000
        )
        let intention = intentionVocale(
            transcription: transcription,
            mentions: [PostMentionInput.handle("bob", display: .note)]
        )

        XCTAssertEqual(intention.localMediaURLs, [fichierAudio()])
        XCTAssertEqual(
            intention.localMediaMimeTypes, ["audio/mp4"],
            "Le MIME déclaré doit VOYAGER, pas seulement servir à élire le type. Jeté, il laissait le "
                + "dispatcher le re-dériver de l'extension — `application/octet-stream` pour un `.caf`, et le "
                + "gateway cessait alors de voir un média audio."
        )
        XCTAssertEqual(
            intention.localMediaMimeTypes.count, intention.localMediaURLs.count,
            "Les deux tableaux sont alignés par INDEX : une longueur différente ferait servir le MIME d'un "
                + "fichier à un autre."
        )
        XCTAssertEqual(intention.visibility, "PUBLIC")
        XCTAssertNil(intention.content)
        XCTAssertEqual(
            intention.mobileTranscription, transcription,
            "Ce qui QUALIFIE l'enregistrement voyage AVEC lui : sans la transcription faite sur "
                + "l'appareil, le serveur la refait et jette celle que l'auteur a relue."
        )
        XCTAssertEqual(intention.mentions?.count, 1)
    }

    // MARK: - T2.1 — le geste « je publie un document composé dans le meuble »

    /// Même règle de composition que le vocal — `ReelComposition`, et nulle
    /// part ailleurs.
    func test_leTypeDUnDocument_suitLaRegleDeCompositionDuReel() {
        let video = ComposerDocumentMedia(
            url: URL(fileURLWithPath: "/tmp/clip.mp4"), mimeType: "video/mp4", durationMs: 4000
        )
        XCTAssertEqual(
            intentionDocument(localMedia: [video]).type, "REEL",
            "Une vidéo d'au moins 3 s qualifie un RÉEL — même moteur que les autres chemins de publication."
        )
        XCTAssertEqual(
            intentionDocument(localMedia: [video], forcePlainPost: true).type, "POST",
            "`forcePlainPost` reste honoré : l'auteur qui refuse le format réel garde son post."
        )
        let photo = ComposerDocumentMedia(
            url: URL(fileURLWithPath: "/tmp/photo.jpg"), mimeType: "image/jpeg", durationMs: nil
        )
        XCTAssertEqual(
            intentionDocument(localMedia: [photo]).type, "POST",
            "Une seule image ne qualifie pas — il en faut deux ou plus."
        )
    }

    /// La langue d'un document est celle que l'auteur a DÉCLARÉE — à la
    /// différence du vocal, dont la langue vient de la transcription.
    func test_laLangueDUnDocument_estCelleQueLAuteurADeclaree() {
        XCTAssertEqual(intentionDocument(originalLanguage: "es").originalLanguage, "es")
    }

    // MARK: - Lecture de la source de production

    private var racineApp: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Services
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private struct AncreIntrouvable: Error, CustomStringConvertible {
        let ancre: String
        var description: String { "L'ancre `\(ancre)` a disparu — la garde ne mesurerait RIEN" }
    }

    private func sourceDuVerbe() throws -> String {
        let url = racineApp.appendingPathComponent("Features/Main/Services/PublishIntent.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func listeDeParametres(de ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var parametres = ""
        var curseur = code.index(before: debut.upperBound)
        while curseur < code.endIndex {
            let caractere = code[curseur]
            if caractere == "(" {
                profondeur += 1
                if profondeur == 1 {
                    curseur = code.index(after: curseur)
                    continue
                }
            } else if caractere == ")" {
                profondeur -= 1
                if profondeur == 0 { return parametres }
            }
            parametres.append(caractere)
            curseur = code.index(after: curseur)
        }
        return nil
    }

    private func occurrences(of aiguille: String, in botte: String) -> Int {
        botte.components(separatedBy: aiguille).count - 1
    }

    // MARK: - 4. La fabrique n'a AUCUN défaut

    /// **La discipline du dépôt rendue exécutable.** Un défaut sur une fabrique
    /// de charge fait disparaître un champ d'un site d'appel sans casser la
    /// moindre compilation : c'est le mécanisme littéral par lequel
    /// `CreatePostPayload.init` — qui en pose sur ses dix derniers paramètres —
    /// a laissé la branche hors ligne de `setStatus` perdre la source et la voix
    /// d'un mood pendant des mois.
    ///
    /// La garde lit la source DÉPOUILLÉE de ses commentaires : sans ce
    /// dépouillement, un `=` écrit dans une phrase d'explication la ferait
    /// rougir pour rien, et pire, un commentaire citant la règle pourrait la
    /// faire passer pour un contrôle qu'elle n'exerce plus.
    func test_laFabriqueDeLIntention_nePoseAucunDefaut() throws {
        let code = try sourceDuVerbe()
        let ancresEtMotsAttendus = [
            "static func audioRecording(": "fileURL:",
            "static func document(": "localMedia:",
        ]

        for (ancre, motAttendu) in ancresEtMotsAttendus {
            guard let parametres = listeDeParametres(de: ancre, dans: code) else {
                throw AncreIntrouvable(ancre: ancre)
            }

            XCTAssertTrue(
                parametres.contains(motAttendu),
                "La liste de paramètres lue est vide ou fausse pour « \(ancre) » — la garde ne mesurerait "
                    + "RIEN."
            )
            XCTAssertFalse(
                parametres.contains("="),
                "« \(ancre) » pose une valeur par défaut. Un défaut fait disparaître un champ d'un site "
                    + "d'appel SANS casser la compilation : c'est le mécanisme exact qui a fait partir un "
                    + "mood vocal muet et sans sa source. Chaque geste DÉCLARE tout ce qu'il publie, `nil` "
                    + "compris. Paramètres lus — \(parametres)"
            )
        }
    }

    // MARK: - 5. Le verbe naît DÉCLARÉ sans appelant

    /// **Garde RETOURNÉE à sa condition de levée (tâche 7.4b).**
    ///
    /// Elle exigeait `appels == 0` et nommait ce qui la lèverait : « les deux
    /// jumeaux audio adoptent la fabrique ». Ils l'ont adoptée, et la question a
    /// changé de sens sans changer de nature.
    ///
    /// Ce qu'elle retient maintenant : **DEUX appelants, et ils vivent dans le
    /// même fichier.** Un troisième site composant sa propre intention de vocal
    /// serait exactement ce que ce lot a fermé — un geste écrit une troisième
    /// fois, qui divergerait des deux autres sans que personne ne le voie, comme
    /// les deux d'hier divergeaient sur la destruction du fichier, la langue et
    /// les mentions. ZÉRO signifierait l'inverse : les jumeaux ont cessé de
    /// composer, et la fabrique est redevenue du code mort testé vert.
    ///
    /// La question « qui l'appelle » est une quantification UNIVERSELLE : elle
    /// se prouve sur toute l'arborescence de production, jamais sur le fichier
    /// qu'on a sous les yeux.
    func test_lIntentionDePublication_nEstComposeeQueParLesDeuxJumeauxAudio() throws {
        guard let enumerateur = FileManager.default.enumerator(
            at: racineApp, includingPropertiesForKeys: nil
        ) else {
            return XCTFail("Arborescence app introuvable à \(racineApp.path)")
        }

        var declarations = 0
        var appels = 0
        var fichiersAppelants: [String] = []
        for case let url as URL in enumerateur where url.pathExtension == "swift" {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            declarations += occurrences(of: "struct PublishIntent", in: source)
            let ici = occurrences(of: "PublishIntent.audioRecording(", in: source)
            appels += ici
            if ici > 0 { fichiersAppelants.append(url.lastPathComponent) }
        }

        XCTAssertEqual(
            declarations, 1,
            "L'intention doit exister, et une seule fois — sinon cette garde ne mesurerait rien."
        )
        XCTAssertEqual(
            appels, 2,
            "La fabrique doit avoir DEUX appelants — les deux points d'entrée d'un enregistrement vocal. "
                + "Zéro : les jumeaux ont cessé de composer, et la fabrique est redevenue du code mort ; "
                + "retourner cette garde dans l'autre sens. Trois : un geste de plus s'écrit tout seul, et "
                + "il divergera. Appelants trouvés — \(fichiersAppelants)."
        )
        XCTAssertEqual(
            fichiersAppelants, ["FeedView+Attachments.swift"],
            "Les deux appelants doivent vivre dans le fichier des deux jumeaux. Un modèle, une porte ou "
                + "une autre vue qui composerait sa propre intention de vocal serait le troisième site que "
                + "ce lot existe pour empêcher."
        )
    }
}
