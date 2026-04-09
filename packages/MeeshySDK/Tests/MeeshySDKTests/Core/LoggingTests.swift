import XCTest
import os
@testable import MeeshySDK

final class LoggingTests: XCTestCase {

    // MARK: - Logger Categories Exist

    func test_logger_network_exists() {
        let logger = Logger.network
        XCTAssertNotNil(logger)
    }

    func test_logger_auth_exists() {
        let logger = Logger.auth
        XCTAssertNotNil(logger)
    }

    func test_logger_messages_exists() {
        let logger = Logger.messages
        XCTAssertNotNil(logger)
    }

    func test_logger_media_exists() {
        let logger = Logger.media
        XCTAssertNotNil(logger)
    }

    func test_logger_socket_exists() {
        let logger = Logger.socket
        XCTAssertNotNil(logger)
    }

    func test_logger_cache_exists() {
        let logger = Logger.cache
        XCTAssertNotNil(logger)
    }

    func test_logger_ui_exists() {
        let logger = Logger.ui
        XCTAssertNotNil(logger)
    }

    // MARK: - Logger Usage Does Not Crash

    func test_logger_network_canLog() {
        Logger.network.debug("Test log network")
    }

    func test_logger_auth_canLog() {
        Logger.auth.debug("Test log auth")
    }

    func test_logger_messages_canLog() {
        Logger.messages.debug("Test log messages")
    }
}
