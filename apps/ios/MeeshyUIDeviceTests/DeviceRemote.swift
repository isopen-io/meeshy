import XCTest
import Network

/// **Un iPhone branché se pilote depuis le Mac (#10682).**
///
/// `devicectl` n'a aucune entrée tactile et `idb` ne voit que les simulateurs :
/// le seul moyen qu'Apple supporte pour toucher l'écran d'un appareil est un
/// bundle XCUITest. Ce test n'en mesure rien. Il ouvre un serveur TCP sur
/// l'appareil, que `iproxy` relie au Mac par USB, et exécute les commandes
/// qu'il reçoit jusqu'à `quit`.
///
/// Il ne tourne dans aucun gate. On le lance par
/// `apps/ios/scripts/iphone-remote/iphone-remote.sh start`, et l'on commande
/// avec `iphone-remote.sh <commande>` : `tree`, `tap <libellé>`,
/// `tapc <fragment>`, `xy x y`, `dxy x y`, `press x y secondes`,
/// `drag x1 y1 x2 y2 secondes`, `swipe x1 y1 x2 y2`, `type <texte>`,
/// `url <lien>`, `activate`, `sleep <secondes>`, `quit`. Les coordonnées sont
/// en points de l'écran.
nonisolated final class DeviceRemoteTests: XCTestCase {

    static let port: UInt16 = 8100

    func test_serve() throws {
        // Un élément qui disparaît entre sa recherche et son toucher ne
        // termine pas la session : l'échec se rapporte et la commande suivante
        // s'exécute.
        continueAfterFailure = true
        // Une app qui s'anime sans cesse n'est jamais « au repos » et XCUITest
        // attend alors sans fin avant chaque geste : `IPHONE_REMOTE_SPRINGBOARD=1`
        // (passé en `TEST_RUNNER_IPHONE_REMOTE_SPRINGBOARD=1`) vise le tremplin,
        // qui touche l'écran par coordonnées sans attendre Meeshy, déjà lancée.
        let viaSpringboard = ProcessInfo.processInfo.environment["IPHONE_REMOTE_SPRINGBOARD"] == "1"
        let app = viaSpringboard ? XCUIApplication(bundleIdentifier: "com.apple.springboard") : XCUIApplication()
        if !viaSpringboard { app.launch() }
        let server = DeviceRemoteServer()
        try server.start(port: Self.port)
        var serving = true
        while serving {
            guard let (command, reply) = server.next() else {
                RunLoop.current.run(until: Date().addingTimeInterval(0.05))
                continue
            }
            reply(DeviceRemoteCommand.run(command, on: app, serving: &serving))
        }
    }
}

nonisolated enum DeviceRemoteCommand {

    static func run(_ line: String, on app: XCUIApplication, serving: inout Bool) -> String {
        let parts = line.split(separator: " ").map(String.init)
        let rest = parts.dropFirst().joined(separator: " ")
        let number = { (index: Int) -> Double in parts.indices.contains(index) ? Double(parts[index]) ?? 0 : 0 }
        switch parts.first ?? "" {
        case "tree":
            return app.debugDescription
        case "tap":
            return tap(app, matching: "label == %@ OR identifier == %@", rest)
        case "tapc":
            return tap(app, matching: "label CONTAINS[c] %@ OR identifier CONTAINS[c] %@", rest)
        case "xy":
            point(app, number(1), number(2)).tap()
            return "ok"
        case "dxy":
            point(app, number(1), number(2)).doubleTap()
            return "ok"
        case "press":
            point(app, number(1), number(2)).press(forDuration: number(3))
            return "ok"
        case "drag":
            point(app, number(1), number(2)).press(forDuration: number(5), thenDragTo: point(app, number(3), number(4)))
            return "ok"
        case "swipe":
            point(app, number(1), number(2)).press(forDuration: 0.05, thenDragTo: point(app, number(3), number(4)),
                                                   withVelocity: .fast, thenHoldForDuration: 0)
            return "ok"
        case "type":
            app.typeText(rest)
            return "ok"
        case "url":
            guard let url = URL(string: rest) else { return "lien illisible : \(rest)" }
            guard #available(iOS 16.4, *) else { return "lien profond : iOS 16.4 minimum" }
            app.open(url)
            return "ok"
        case "activate":
            app.activate()
            return "ok"
        case "sleep":
            Thread.sleep(forTimeInterval: number(1))
            return "ok"
        case "quit":
            serving = false
            return "fin"
        default:
            return "commande inconnue : \(line)"
        }
    }

    private static func point(_ app: XCUIApplication, _ x: Double, _ y: Double) -> XCUICoordinate {
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y))
    }

    /// Touche le CENTRE du cadre relevé, plutôt que l'élément lui-même : un
    /// élément redessiné entre sa recherche et son toucher ferait échouer la
    /// requête.
    private static func tap(_ app: XCUIApplication, matching format: String, _ label: String) -> String {
        let target = app.descendants(matching: .any).matching(NSPredicate(format: format, label, label)).firstMatch
        guard target.waitForExistence(timeout: 3) else { return "absent : \(label)" }
        let frame = target.frame
        point(app, frame.midX, frame.midY).tap()
        return "ok \(frame)"
    }
}

/// Le serveur : une ligne de commande par connexion, une réponse terminée par
/// `<<END>>`. Les commandes s'exécutent sur le fil du test, qui seul peut
/// toucher `XCUIApplication`.
nonisolated final class DeviceRemoteServer: @unchecked Sendable {

    typealias Reply = @Sendable (String) -> Void

    private let lock = NSLock()
    private var pending: [(String, Reply)] = []
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "me.meeshy.device-remote")

    nonisolated deinit {}

    func start(port: UInt16) throws {
        guard let endpoint = NWEndpoint.Port(rawValue: port) else { throw DeviceRemoteError.invalidPort }
        let listener = try NWListener(using: .tcp, on: endpoint)
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { return }
            connection.start(queue: self.queue)
            self.receive(connection, buffer: Data())
        }
        listener.start(queue: queue)
        self.listener = listener
    }

    func next() -> (String, Reply)? {
        lock.lock()
        defer { lock.unlock() }
        return pending.isEmpty ? nil : pending.removeFirst()
    }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, done, _ in
            let buffer = buffer + (data ?? Data())
            guard let newline = buffer.firstIndex(of: 10) else {
                if !done { self?.receive(connection, buffer: buffer) }
                return
            }
            let line = String(decoding: buffer[..<newline], as: UTF8.self)
            self?.enqueue(line) { output in
                connection.send(content: Data((output + "\n<<END>>\n").utf8),
                                completion: .contentProcessed { _ in connection.cancel() })
            }
        }
    }

    private func enqueue(_ line: String, _ reply: @escaping Reply) {
        lock.lock()
        pending.append((line, reply))
        lock.unlock()
    }
}

nonisolated enum DeviceRemoteError: Error {
    case invalidPort
}
