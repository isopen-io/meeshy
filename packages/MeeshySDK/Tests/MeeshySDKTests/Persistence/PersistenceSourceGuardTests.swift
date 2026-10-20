import XCTest

final class PersistenceSourceGuardTests: XCTestCase {

    private static var persistenceDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Persistence", isDirectory: true)
    }

    private static func codeLines(of url: URL) throws -> [String] {
        try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") }
    }

    func test_appDatabase_hasNoForceTry() throws {
        let url = Self.persistenceDirectory.appendingPathComponent("AppDatabase.swift")

        let offending = try Self.codeLines(of: url).filter { $0.contains("try!") }

        XCTAssertEqual(offending, [])
    }

    func test_persistenceMigrationFiles_haveNoLoggerSubsystem() throws {
        let directory = Self.persistenceDirectory.appendingPathComponent("Migrations", isDirectory: true)
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        XCTAssertFalse(files.isEmpty)

        let offending = try files.flatMap { file in
            try Self.codeLines(of: file).filter { $0.contains("Logger(subsystem:") }
        }

        XCTAssertEqual(offending, [])
    }

    func test_appDatabase_hasNoLoggerSubsystem() throws {
        let url = Self.persistenceDirectory.appendingPathComponent("AppDatabase.swift")

        let offending = try Self.codeLines(of: url).filter { $0.contains("Logger(subsystem:") }

        XCTAssertEqual(offending, [])
    }
}
