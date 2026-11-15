import XCTest
@testable import MeeshySDK

/// BW-IOS-01 — le gateway annonce `permessage-deflate` depuis toujours
/// (`perMessageDeflate`, seuil 256 o), mais Starscream ne pose l'en-tête
/// d'extension que si le `SocketManager` le demande. Sans `.compress` dans la
/// liste d'options, TOUTES les trames iOS voyagent non compressées et la
/// configuration serveur reste inerte.
///
/// La configuration est construite dans le CORPS de `SocketTransportFactory` /
/// `armConnection()` : aucune surface publique ne la rend lisible, donc la
/// garde est une garde de SOURCE — motif déjà présent au dépôt
/// (`CallEmitSourceGuardTests`).
///
/// #16750 — la socket de message en portait DEUX blocs, celui d'un inscrit et
/// celui d'un invité, qui ne différaient que par leurs en-têtes. Ils n'en font
/// plus qu'UN, dans `SocketTransportFactory` : le compte attendu descend de 2 à
/// 1, et c'est un RENFORCEMENT — une option ne peut plus manquer à une copie.
///
/// Elle vise les BLOCS `SocketManager(socketURL: … config: [ … ])`, jamais le
/// fichier : un `.compress` écrit ailleurs (commentaire, autre appel) ne doit
/// jamais faire passer un bloc qui, lui, ne le déclare pas. Les deux derniers
/// tests éprouvent exactement cela sur une source fabriquée.
final class SocketCompressionSourceGuardTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Découpe la source en blocs de configuration : de chaque
    /// `SocketManager(socketURL:` jusqu'à la LIGNE qui ferme sa liste d'options.
    ///
    /// La fermeture se cherche ligne à ligne, jamais sur la première occurrence
    /// de `])` : `.extraHeaders(["Authorization": …])` en porte une au milieu du
    /// bloc, et une garde qui s'y arrêterait ne lirait jamais les options
    /// suivantes — elle rougirait sur un bloc pourtant conforme.
    private func socketManagerConfigBlocks(in source: String) -> [String] {
        source
            .components(separatedBy: "SocketManager(socketURL:")
            .dropFirst()
            .map { tail in
                var block: [String] = []
                for line in tail.components(separatedBy: "\n") {
                    block.append(line)
                    if line.trimmingCharacters(in: .whitespaces) == "])" { break }
                }
                return block.joined(separator: "\n")
            }
    }

    // MARK: - Les trois blocs réels

    func test_socketTransportFactoryConfigBlock_declaresCompressOption() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/SocketTransportFactory.swift")
        let blocks = socketManagerConfigBlocks(in: source)

        XCTAssertEqual(
            blocks.count, 1,
            "SocketTransportFactory est la configuration UNIQUE des deux poignées de main de la socket de " +
            "message (inscrit + invité, #16750) — un bloc de plus doit faire rougir cette garde tant qu'il " +
            "n'est pas couvert"
        )
        for (index, block) in blocks.enumerated() {
            XCTAssertTrue(
                block.contains(".compress"),
                "Le bloc de configuration #\(index + 1) de SocketTransportFactory doit déclarer `.compress` : " +
                "sans lui, Starscream ne négocie pas permessage-deflate et le `perMessageDeflate` du gateway reste inerte"
            )
        }
    }

    /// Le corollaire du précédent : le gestionnaire ne RECONSTRUIT plus de
    /// configuration chez lui. Une troisième copie y reviendrait sans faire
    /// rougir le test ci-dessus, qui ne lit plus ce fichier.
    func test_messageSocketManager_buildsNoSocketManagerConfigurationOfItsOwn() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/MessageSocketManager.swift")

        XCTAssertEqual(
            socketManagerConfigBlocks(in: source).count, 0,
            "MessageSocketManager passe par `SocketTransportFactory` : une configuration écrite chez lui " +
            "rouvrirait la divergence que #16750 a fermée (une option négociée par l'inscrit et pas par l'invité)"
        )
    }

    func test_socialSocketManagerConfigBlock_declaresCompressOption() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/SocialSocketManager.swift")
        let blocks = socketManagerConfigBlocks(in: source)

        XCTAssertEqual(
            blocks.count, 1,
            "SocialSocketManager ne construit qu'un SocketManager — un second bloc doit être couvert avant de passer"
        )
        XCTAssertTrue(
            blocks[0].contains(".compress"),
            "La socket sociale porte le même JSON répétitif que la socket messages : elle doit négocier permessage-deflate"
        )
    }

    // MARK: - Contre-épreuves du découpage (la garde vise le BLOC, pas le fichier)

    func test_socketManagerConfigBlocks_blockWithoutCompress_isNotRescuedByTheRestOfTheFile() {
        let fabricated = """
        // .compress est mentionné ICI, hors de toute liste d'options.
        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .reconnects(true),
        ])
        """
        let blocks = socketManagerConfigBlocks(in: fabricated)

        XCTAssertEqual(blocks.count, 1)
        XCTAssertFalse(
            blocks[0].contains(".compress"),
            "Un `.compress` écrit hors du bloc ne doit JAMAIS sauver un bloc qui ne le déclare pas — " +
            "sinon la garde passerait au vert en ayant perdu sa protection"
        )
    }

    func test_socketManagerConfigBlocks_blockWithCompress_isRecognised() {
        let fabricated = """
        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .compress,
        ])
        """
        let blocks = socketManagerConfigBlocks(in: fabricated)

        XCTAssertEqual(blocks.count, 1)
        XCTAssertTrue(blocks[0].contains(".compress"))
    }
}
