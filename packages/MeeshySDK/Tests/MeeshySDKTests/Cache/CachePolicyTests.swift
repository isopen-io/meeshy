import XCTest
@testable import MeeshySDK

final class CachePolicyTests: XCTestCase {

    func test_init_validStaleTTL_preservesValues() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: 50, storageLocation: .grdb)
        XCTAssertEqual(policy.ttl, 3600)
        XCTAssertEqual(policy.staleTTL, 300)
        XCTAssertEqual(policy.maxItemCount, 50)
    }

    func test_init_staleTTLGreaterThanTTL_clampsToTTL() {
        let policy = CachePolicy(ttl: 300, staleTTL: 3600, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.staleTTL, 300)
    }

    func test_init_nilStaleTTL_staysNil() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertNil(policy.staleTTL)
    }

    func test_init_staleTTLEqualToTTL_preserves() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 3600, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.staleTTL, 3600)
    }

    func test_predefined_conversations() {
        let p = CachePolicy.conversations
        XCTAssertEqual(p.ttl, 86400)
        XCTAssertEqual(p.staleTTL, 300)
    }

    func test_predefined_messages() {
        let p = CachePolicy.messages
        XCTAssertEqual(p.ttl, TimeInterval.months(6))
        XCTAssertEqual(p.staleTTL, TimeInterval.minutes(2))
        XCTAssertEqual(p.maxItemCount, 600)
    }

    func test_predefined_mediaImages() {
        let p = CachePolicy.mediaImages
        XCTAssertEqual(p.ttl, TimeInterval.years(1))
        if case .disk(let subdir, let max) = p.storageLocation {
            XCTAssertEqual(subdir, "Images")
            XCTAssertEqual(max, 300_000_000)
        } else { XCTFail("Expected .disk") }
    }

    func test_timeInterval_minutes() { XCTAssertEqual(TimeInterval.minutes(5), 300) }
    func test_timeInterval_hours() { XCTAssertEqual(TimeInterval.hours(24), 86400) }
    func test_timeInterval_days() { XCTAssertEqual(TimeInterval.days(7), 604800) }
    func test_timeInterval_months() { XCTAssertEqual(TimeInterval.months(6), 15_552_000) }
    func test_timeInterval_years() { XCTAssertEqual(TimeInterval.years(1), 31_536_000) }

    func test_freshness_freshWhenUnderStaleTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 100)
        XCTAssertEqual(result, .fresh)
    }

    func test_freshness_staleAtExactStaleTTLBoundary() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.freshness(age: 300), .stale)
    }

    func test_freshness_staleWhenBetweenStaleTTLAndTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 500)
        XCTAssertEqual(result, .stale)
    }

    func test_freshness_expiredAtExactTTLBoundary() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.freshness(age: 3600), .expired)
    }

    func test_freshness_expiredWhenOverTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 4000)
        XCTAssertEqual(result, .expired)
    }

    func test_freshness_noStaleTTL_freshUnderTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 100)
        XCTAssertEqual(result, .fresh)
    }

    func test_freshness_noStaleTTL_expiredOverTTL() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        let result = policy.freshness(age: 4000)
        XCTAssertEqual(result, .expired)
    }

    // MARK: - TTL edge cases (point 45 extras)

    func test_freshness_zeroAge_isFresh() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 300, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.freshness(age: 0), .fresh)
    }

    func test_freshness_noStaleTTL_atExactTTL_isExpired() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.freshness(age: 3600), .expired)
    }

    func test_freshness_noStaleTTL_justUnderTTL_isFresh() {
        let policy = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.freshness(age: 3599.9), .fresh)
    }

    func test_freshness_verySmallTTL() {
        let policy = CachePolicy(ttl: 0.001, staleTTL: nil, maxItemCount: nil, storageLocation: .grdb)
        XCTAssertEqual(policy.freshness(age: 0.0001), .fresh)
        XCTAssertEqual(policy.freshness(age: 0.01), .expired)
    }

    func test_freshness_staleTTLZero_alwaysStaleUntilExpired() {
        let policy = CachePolicy(ttl: 3600, staleTTL: 0, maxItemCount: nil, storageLocation: .grdb)
        // age 0 is not < staleTTL (0), so it should be stale
        XCTAssertEqual(policy.freshness(age: 0), .stale)
        XCTAssertEqual(policy.freshness(age: 1800), .stale)
        XCTAssertEqual(policy.freshness(age: 3600), .expired)
    }

    func test_predefined_feedPosts() {
        let p = CachePolicy.feedPosts
        XCTAssertEqual(p.ttl, TimeInterval.days(7))
        XCTAssertEqual(p.staleTTL, TimeInterval.minutes(5))
        XCTAssertEqual(p.maxItemCount, 100)
    }

    func test_predefined_notifications() {
        let p = CachePolicy.notifications
        XCTAssertEqual(p.ttl, TimeInterval.hours(24))
        XCTAssertEqual(p.staleTTL, TimeInterval.minutes(2))
        XCTAssertEqual(p.maxItemCount, 200)
    }

    // MARK: - Stories — le cache porte les TRADUCTIONS
    //
    // Directive user 2026-07-27 : préférer le cache tant que le statut est
    // actif, invalider au bout de 72 heures.
    //
    // L'entrée du tray transporte, pour chaque story, la traduction de son
    // contenu ET celle de chaque texte du canvas — la charge la plus coûteuse à
    // reconstituer (un aller ZMQ et une passe modèle par overlay et par
    // langue). Un TTL de 24 h la jetait au premier cold start du lendemain,
    // spinner compris, alors que `purgeStoryTray` retire déjà les stories
    // sorties de leur propre fenêtre de visibilité. La validité d'une story et
    // la durée de vie du conteneur sont deux choses distinctes.

    func test_predefined_stories_keepsTranslationsForSeventyTwoHours() {
        XCTAssertEqual(CachePolicy.stories.ttl, TimeInterval.hours(72))
    }

    func test_predefined_stories_revalidatesQuicklyWhileStayingInstant() {
        // Fenêtre « fraîche » courte : le tray se resynchronise vite en delta,
        // mais l'affichage reste instantané entre-temps (SWR).
        XCTAssertEqual(CachePolicy.stories.staleTTL, TimeInterval.minutes(5))
    }

    func test_predefined_stories_servesCacheWellBeyondAStoryLifetime() {
        // 25 h : au-delà de la fenêtre de visibilité d'une story, mais toujours
        // servi depuis le cache. Les stories mortes sont retirées par la purge
        // du tray, pas par l'expiration du conteneur.
        XCTAssertEqual(CachePolicy.stories.freshness(age: .hours(25)), .stale)
    }

    func test_predefined_stories_expireAfterSeventyTwoHours() {
        XCTAssertEqual(CachePolicy.stories.freshness(age: .hours(73)), .expired)
    }
}
