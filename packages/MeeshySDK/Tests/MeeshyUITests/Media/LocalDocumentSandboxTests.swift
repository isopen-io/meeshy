import XCTest
import Network
import WebKit
@testable import MeeshyUI

/// **Un document chiffré de bout en bout, ouvert sur l'appareil, ne prévient
/// personne qu'on le lit** (#10789, revue de sécurité du 2026-10-25). Le clair
/// d'une pièce reçue est un fichier local du coffre ; un HTML ou un SVG d'un
/// pair qui charge `http://…/beacon.png` à l'ouverture enverrait un accusé de
/// lecture et l'adresse IP du lecteur. Modèle de menace : pair malveillant (ou
/// serveur qui lui sert d'intermédiaire) qui fabrique le document.
@MainActor
final class LocalDocumentSandboxTests: XCTestCase {

    // MARK: - Une balise d'écoute locale

    /// Un serveur TCP sur la boucle locale qui compte les connexions reçues :
    /// toute ressource distante que la vue web tente de charger y arrive.
    private final class BeaconListener: @unchecked Sendable {
        private let listener: NWListener
        private let lock = NSLock()
        private var count = 0

        var connections: Int { lock.withLock { count } }
        var port: UInt16 { listener.port?.rawValue ?? 0 }

        init() throws {
            let parameters = NWParameters.tcp
            parameters.requiredInterfaceType = .loopback
            listener = try NWListener(using: parameters, on: .any)
            listener.newConnectionHandler = { [weak self] connection in
                self?.lock.withLock { self?.count += 1 }
                connection.cancel()
            }
        }

        func start() async throws {
            let ready = AsyncStream<Bool> { continuation in
                listener.stateUpdateHandler = { state in
                    switch state {
                    case .ready: continuation.yield(true); continuation.finish()
                    case .failed, .cancelled: continuation.yield(false); continuation.finish()
                    default: break
                    }
                }
            }
            listener.start(queue: .global())
            for await isReady in ready where !isReady { throw URLError(.cannotConnectToHost) }
        }

        func stop() { listener.cancel() }
    }

    private func beacon() async throws -> BeaconListener {
        let listener = try BeaconListener()
        try await listener.start()
        addTeardownBlock { listener.stop() }
        return listener
    }

    /// Un document de pair qui appelle sa balise de cinq façons à l'ouverture.
    private func hostileDocument(calling port: UInt16, extension ext: String = "html") throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("e2ee-doc-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        let base = "http://127.0.0.1:\(port)"
        let html = """
        <html><head><link rel="stylesheet" href="\(base)/style.css"></head>
        <body><img src="\(base)/beacon.png"><iframe src="\(base)/frame"></iframe>
        <video src="\(base)/video.mp4" autoplay></video>
        <svg xmlns="http://www.w3.org/2000/svg"><image href="\(base)/svg.png"/></svg>
        </body></html>
        """
        let file = dir.appendingPathComponent("doc.\(ext)")
        try Data(html.utf8).write(to: file)
        return file
    }

    private func settle(_ webView: WKWebView, extra: TimeInterval = 1.5) async {
        let deadline = Date().addingTimeInterval(8)
        try? await Task.sleep(nanoseconds: 200_000_000)
        while webView.isLoading, Date() < deadline { try? await Task.sleep(nanoseconds: 50_000_000) }
        try? await Task.sleep(nanoseconds: UInt64(extra * 1_000_000_000))
    }

    private func eventually(_ condition: () -> Bool, timeout: TimeInterval = 8) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline { try? await Task.sleep(nanoseconds: 50_000_000) }
        return condition()
    }

    // MARK: - Le témoin témoigne

    /// Sans la cage, la même vue web appelle la balise : le témoin sait voir.
    func test_temoin_uneVueWebOrdinaire_appelleLaBalise() async throws {
        let listener = try await beacon()
        let file = try hostileDocument(calling: listener.port)
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))

        webView.loadFileURL(file, allowingReadAccessTo: file)

        let called = await eventually { listener.connections > 0 }
        XCTAssertTrue(called, "une vue web sans cage charge les ressources distantes du document")
    }

    // MARK: - La cage

    func test_unDocumentLocalBalise_seLitEnTexteBrut() {
        for ext in ["html", "htm", "xhtml", "svg", "xml", "webarchive", "bin", "unknownext"] {
            XCTAssertEqual(LocalDocumentRendering(fileURL: URL(fileURLWithPath: "/v/a.\(ext)")), .plainText, ext)
        }
        for ext in ["pdf", "docx", "xlsx", "pptx", "txt", "rtf", "png", "jpeg"] {
            XCTAssertEqual(LocalDocumentRendering(fileURL: URL(fileURLWithPath: "/v/a.\(ext)")), .page, ext)
        }
    }

    func test_uneVueWebLocale_neGardeAucuneDonneeDeSite_etNExecuteAucunScript() {
        let webView = DocumentWebView.makeLocalWebView(mayLeave: false)

        XCTAssertFalse(webView.configuration.websiteDataStore.isPersistent)
        XCTAssertFalse(webView.configuration.defaultWebpagePreferences.allowsContentJavaScript)
    }

    func test_leGardienDeNavigation_neLaisseOuvrirQueLeDocument() {
        let document = URL(fileURLWithPath: "/v/E2EEMedia/abc.pdf")

        XCTAssertTrue(LocalDocumentNavigationGuard.allows(document, document: document))
        XCTAssertFalse(LocalDocumentNavigationGuard.allows(URL(string: "https://evil.example/read"), document: document))
        XCTAssertFalse(LocalDocumentNavigationGuard.allows(URL(fileURLWithPath: "/v/E2EEMedia/other.pdf"), document: document))
        XCTAssertFalse(LocalDocumentNavigationGuard.allows(nil, document: document))
    }

    /// La cage elle-même : même rendu en PAGE, le HTML d'un pair ne charge rien
    /// d'autre que son propre fichier.
    func test_laCage_bloqueToutChargementDistant_memeRenduEnPage() async throws {
        let listener = try await beacon()
        let file = try hostileDocument(calling: listener.port)
        let webView = DocumentWebView.makeLocalWebView(mayLeave: false)
        let navigationGuard = LocalDocumentNavigationGuard(document: file)
        webView.navigationDelegate = navigationGuard

        let loaded = await DocumentWebView.loadLocal(file, rendering: .page, into: webView)
        await settle(webView)

        XCTAssertTrue(loaded)
        XCTAssertEqual(listener.connections, 0, "aucune ressource distante n'est demandée")
        withExtendedLifetime(navigationGuard) {}
    }

    /// Le chemin réel : un HTML de pair s'affiche en texte brut, sans rien charger.
    func test_unHTMLDePair_seLitSansAppelerSaBalise() async throws {
        let listener = try await beacon()
        let file = try hostileDocument(calling: listener.port)
        let webView = DocumentWebView.makeLocalWebView(mayLeave: false)
        let navigationGuard = LocalDocumentNavigationGuard(document: file)
        webView.navigationDelegate = navigationGuard

        let loaded = await DocumentWebView.loadLocal(file, into: webView)
        await settle(webView)

        XCTAssertTrue(loaded)
        XCTAssertEqual(listener.connections, 0)
        withExtendedLifetime(navigationGuard) {}
    }
}
