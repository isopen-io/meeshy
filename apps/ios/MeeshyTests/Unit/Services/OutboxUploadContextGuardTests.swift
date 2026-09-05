import XCTest

/// **Un téléversement qui ne dit pas POUR QUI il téléverse crée la mauvaise
/// ligne — et le post naît VIDE, sans un mot.**
///
/// La chaîne, maillon par maillon, telle qu'elle vivait avant cette garde :
///
/// 1. `OutboxDispatcher.dispatchCreatePost` appelait
///    `TusUploadManager.uploadFile(fileURL:mimeType:credential:)` — **sans
///    `uploadContext:`** ;
/// 2. `TusUploadManager` ne pose la métadonnée `uploadcontext` que
///    `if let context` ⇒ elle partait absente ;
/// 3. côté gateway, `isPostMediaUploadContext(upload.metadata?.uploadcontext)`
///    rendait faux ⇒ branche `else` ;
/// 4. cette branche crée un **`MessageAttachment`**, et répond **201 avec un id
///    parfaitement valide** ;
/// 5. `PostService.createPost` réclame ensuite ces ids par un `updateMany` sur
///    **`postMedia`** ⇒ `claimed.count == 0` ;
/// 6. le manque est journalisé par un `logger.warn` serveur, **et rien
///    d'autre** : la réponse 201 est identique à celle d'un post plein.
///
/// Conséquence vécue : un média composé HORS LIGNE arrivait publié et **sans son
/// média**. Aucune erreur client, aucune erreur serveur, un post vide.
///
/// **Pourquoi une garde de SOURCE et pas un test de comportement.** Le maillon
/// fautif est un ARGUMENT d'appel, pas une valeur de retour : aucun double ne
/// peut l'observer sans qu'on injecte un téléverseur dans le dispatcher — ce que
/// ce lot ne fait pas. La source est ici la seule surface où le défaut existe.
///
/// **Pourquoi un INVENTAIRE et pas une exigence universelle.** Une garde
/// « tout `uploadFile` porte un contexte » serait **fausse** : une pièce jointe
/// de MESSAGE n'en porte légitimement aucun — elle veut précisément créer un
/// `MessageAttachment`. La session suivante la « corrigerait » en posant
/// `uploadContext: "post"` sur un envoi de message, qui créerait alors un
/// `PostMedia` orphelin que plus aucun message ne réclamerait. La garde énumère
/// donc, et exige que la liste SANS contexte soit **exactement** les trois sites
/// de message, nommés par fichier + déclaration englobante — jamais par numéro
/// de ligne, qui bouge à chaque édition du voisinage.
final class OutboxUploadContextGuardTests: XCTestCase {

    // MARK: - Lecture de la source de production

    private var racineApp: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Services
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private struct ArborescenceIntrouvable: Error, CustomStringConvertible {
        let chemin: String
        var description: String {
            "Arborescence app introuvable à \(chemin) — la garde ne mesurerait RIEN"
        }
    }

    private struct AncreIntrouvable: Error, CustomStringConvertible {
        let ancre: String
        var description: String {
            "L'ancre `\(ancre)` a disparu — la garde ne mesurerait RIEN"
        }
    }

    private func sourcesDeProduction() throws -> [(fichier: String, code: String)] {
        guard let enumerateur = FileManager.default.enumerator(
            at: racineApp, includingPropertiesForKeys: nil
        ) else {
            throw ArborescenceIntrouvable(chemin: racineApp.path)
        }
        var sources: [(fichier: String, code: String)] = []
        for case let url as URL in enumerateur where url.pathExtension == "swift" {
            let brut = try String(contentsOf: url, encoding: .utf8)
            sources.append((url.lastPathComponent, AppSourceGuard.stripComments(brut)))
        }
        return sources
    }

    // MARK: - Découpe d'un appel

    /// Les ARGUMENTS d'un appel, par appariement de parenthèses en ignorant les
    /// littéraux de chaîne. Un appel écrit sur plusieurs lignes — la forme de la
    /// moitié des sites — n'est lisible d'aucune autre façon : une lecture
    /// ligne à ligne ne verrait jamais l'argument `uploadContext:` posé trois
    /// lignes plus bas. `nil` quand la parenthèse ne se referme pas.
    private func argumentsDeLAppel(dans code: String, ouvranteA depart: String.Index) -> String? {
        var profondeur = 0
        var dansUneChaine = false
        var echappe = false
        var arguments = ""
        var curseur = depart
        while curseur < code.endIndex {
            let caractere = code[curseur]
            if dansUneChaine {
                if echappe { echappe = false }
                else if caractere == "\\" { echappe = true }
                else if caractere == "\"" { dansUneChaine = false }
            } else if caractere == "\"" {
                dansUneChaine = true
            } else if caractere == "(" {
                profondeur += 1
                if profondeur == 1 {
                    curseur = code.index(after: curseur)
                    continue
                }
            } else if caractere == ")" {
                profondeur -= 1
                if profondeur == 0 { return arguments }
            }
            arguments.append(caractere)
            curseur = code.index(after: curseur)
        }
        return nil
    }

    /// Le nom de la déclaration ENGLOBANTE — la dernière `func <nom>` déclarée
    /// avant l'appel. C'est l'identité stable d'un site : elle survit à
    /// l'insertion de vingt lignes au-dessus, ce qu'un numéro de ligne ne fait
    /// pas.
    private func declarationEnglobante(dans code: String, avant borne: String.Index) -> String {
        guard let derniere = code.range(
            of: "func ", options: .backwards, range: code.startIndex..<borne
        ) else { return "?" }
        let nom = code[derniere.upperBound...].prefix { $0.isLetter || $0.isNumber || $0 == "_" }
        return nom.isEmpty ? "?" : String(nom)
    }

    private struct SiteDeTeleversement {
        let fichier: String
        let declaration: String
        let porteUnContexte: Bool
        var etiquette: String { "\(fichier):\(declaration)" }
    }

    private func inventaireDesTeleversements() throws -> [SiteDeTeleversement] {
        var sites: [SiteDeTeleversement] = []
        for (fichier, code) in try sourcesDeProduction() {
            var curseur = code.startIndex
            while let trouve = code.range(of: "uploadFile(", range: curseur..<code.endIndex) {
                let ouvrante = code.index(before: trouve.upperBound)
                let arguments = argumentsDeLAppel(dans: code, ouvranteA: ouvrante)
                sites.append(SiteDeTeleversement(
                    fichier: fichier,
                    declaration: declarationEnglobante(dans: code, avant: trouve.lowerBound),
                    porteUnContexte: arguments?.contains("uploadContext:") ?? false
                ))
                curseur = trouve.upperBound
            }
        }
        return sites
    }

    /// Le corps d'un BLOC par appariement d'accolades. `nil` quand l'ancre a
    /// disparu — l'appelant fait alors rougir, jamais passer.
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

    // MARK: - Le garde-fou des gardes

    /// Sans lui, un chemin devenu faux rendrait la partition VIDE, et une
    /// partition vide satisfait n'importe quelle assertion d'absence.
    func test_laGardeLitUneSourceNonVide_etTrouveDesTeleversements() throws {
        let sites = try inventaireDesTeleversements()

        XCTAssertGreaterThan(
            sites.count, 10,
            "L'inventaire des `uploadFile(` est quasi vide : le chemin de lecture est faux, et toutes les "
                + "gardes ci-dessous passeraient au vert sans rien mesurer."
        )
        XCTAssertTrue(
            sites.allSatisfy { $0.declaration != "?" },
            "Un site n'a pas de déclaration englobante identifiable — l'étiquette d'un site doit être "
                + "stable, sinon la partition ci-dessous nomme un fantôme. Sites : "
                + "\(sites.map(\.etiquette))"
        )
    }

    // MARK: - Le défaut, nommé

    /// La file durable dit désormais POUR QUI elle téléverse.
    func test_laFileDurable_declareLeContexteDeSonTeleversement() throws {
        let dispatcher = try sourcesDeProduction()
            .first { $0.fichier == "OutboxDispatcher.swift" }
        let code = try XCTUnwrap(dispatcher?.code, "OutboxDispatcher.swift est introuvable")

        guard let corps = corpsDeDeclaration(
            commencantPar: "private func dispatchCreatePost(", dans: code
        ) else {
            throw AncreIntrouvable(ancre: "private func dispatchCreatePost(")
        }

        XCTAssertTrue(
            corps.contains("uploadFile("),
            "Le rejeu d'un post média ne téléverse plus rien — si le média part par un autre chemin, c'est "
                + "cette garde qu'il faut réécrire, pas supprimer."
        )
        XCTAssertTrue(
            corps.contains("uploadContext:"),
            "Le rejeu d'un post média téléverse SANS contexte. Le gateway crée alors un `MessageAttachment` "
                + "et répond 201 avec un id valide ; `PostService.createPost` ne réclame que des `PostMedia`, "
                + "donc il n'en réclame AUCUN — et le post arrive publié et VIDE, sans une seule erreur. "
                + "C'est le défaut que `17f6182b3e` a fermé côté web et qui est resté vivant ici."
        )
    }

    // MARK: - L'inventaire : qui a le DROIT de téléverser sans contexte

    /// **Une liste NOMMÉE, jamais un compte.** Un compte figé est un chiffre à
    /// maintenir, et il repasse au vert dès qu'on ajoute et retire un site dans
    /// le même lot.
    func test_lesSeulsTeleversementsSansContexte_sontLesPiecesJointesDeMESSAGE() throws {
        let sansContexte = try inventaireDesTeleversements()
            .filter { !$0.porteUnContexte }
            .map(\.etiquette)
            .sorted()

        XCTAssertEqual(
            sansContexte,
            [
                "ConversationView+AttachmentHandlers.swift:sendMessageWithAttachments",
                // **Le sticker de conversation (#4823, 2026-09-02)** : le PNG rendu
                // d'un sticker est une pièce jointe de MESSAGE ordinaire — c'est
                // le repli que lisent le web et Android — donc il téléverse SANS
                // contexte, exactement comme une photo envoyée en conversation.
                "ConversationView+Sticker.swift:uploadAndSendSticker",
                // **Le découpage du 2026-08-31 (`ec6591a296`) a déplacé ces deux
                // sites** de `OutboxDispatcher.swift` vers son extension
                // `+Messages.swift`. L'inventaire nommait l'ANCIEN fichier et la
                // garde rougissait — bruyamment, ce qui est la bonne direction :
                // une garde qui nomme un fichier et le perd doit tomber, jamais
                // passer sur une chaîne vide.
                "OutboxDispatcher+Messages.swift:dispatchSendMessage",
                "OutboxDispatcher+Messages.swift:dispatchSendMessage"
            ],
            "Un téléversement sans contexte crée un `MessageAttachment` ; si ce site alimente le `mediaIds` "
                + "d'un post, le post naîtra VIDE (`PostService.createPost` ne réclame que des `PostMedia`, "
                + "et un manque n'y produit qu'un `logger.warn`). Les trois seuls sites qui en ont le DROIT "
                + "sont les pièces jointes de MESSAGE, qui veulent précisément un `MessageAttachment`. "
                + "NE PAS lever cette garde en ajoutant `uploadContext:` à un envoi de message : cela "
                + "créerait un `PostMedia` orphelin que plus aucun message ne réclamerait. "
                + "Trouvés — \(sansContexte)."
        )
    }
}
