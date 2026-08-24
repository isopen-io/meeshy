import XCTest
@testable import MeeshySDK

/// The sender's checkmark must EXACTLY represent the real state of all the other
/// interlocutors: ✓ sent → ✓✓ delivered (everyone received) → ✓✓ read (everyone
/// read). These tests pin the WhatsApp-style all-or-nothing group semantics.
final class DeliveryStatusResolverTests: XCTestCase {

    // MARK: - resolve(status:deliveredCount:readCount:recipientCount:)

    // 1:1 — a single recipient: the stored status is trustworthy as-is.
    func test_resolve_direct_oneRecipientRead_isRead() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 1, readCount: 1, recipientCount: 1)
        XCTAssertEqual(result, .read)
    }

    func test_resolve_direct_oneRecipientDelivered_isDelivered() {
        let result = DeliveryStatusResolver.resolve(
            status: .delivered, deliveredCount: 1, readCount: 0, recipientCount: 1)
        XCTAssertEqual(result, .delivered)
    }

    // Unknown denominator (0) must not regress 1:1 behaviour — trust the status.
    func test_resolve_unknownRecipientCount_trustsStatus() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 1, readCount: 1, recipientCount: 0)
        XCTAssertEqual(result, .read)
    }

    // THE bug: a group where ONE of several members read must NOT show "read".
    func test_resolve_group_partialRead_demotesBelowRead() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 1, readCount: 1, recipientCount: 10)
        XCTAssertEqual(result, .sent,
            "one reader out of ten is neither delivered-to-all nor read-by-all")
    }

    // A group where ONE member received (but not all) must NOT show "delivered".
    func test_resolve_group_partialDelivery_demotesToSent() {
        let result = DeliveryStatusResolver.resolve(
            status: .delivered, deliveredCount: 1, readCount: 0, recipientCount: 10)
        XCTAssertEqual(result, .sent,
            "one recipient out of ten is not delivered-to-all")
    }

    func test_resolve_group_allDeliveredSomeRead_isDelivered() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 4, readCount: 2, recipientCount: 4)
        XCTAssertEqual(result, .delivered,
            "everyone received but not everyone read → delivered, not read")
    }

    func test_resolve_group_allRead_isRead() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 4, readCount: 4, recipientCount: 4)
        XCTAssertEqual(result, .read)
    }

    func test_resolve_group_noneYet_isSent() {
        let result = DeliveryStatusResolver.resolve(
            status: .sent, deliveredCount: 0, readCount: 0, recipientCount: 4)
        XCTAssertEqual(result, .sent)
    }

    // Pre-delivery send lifecycle is always returned verbatim — it is not a
    // function of recipient counts.
    func test_resolve_sending_isAlwaysVerbatim() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(status: .sending, deliveredCount: 9, readCount: 9, recipientCount: 10),
            .sending)
    }

    func test_resolve_failed_isAlwaysVerbatim() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(status: .failed, deliveredCount: 0, readCount: 0, recipientCount: 10),
            .failed)
    }

    func test_resolve_slowAndClock_areVerbatim() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(status: .slow, deliveredCount: 5, readCount: 5, recipientCount: 5),
            .slow)
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(status: .clock, deliveredCount: 5, readCount: 5, recipientCount: 5),
            .clock)
    }

    // Counts exceeding the denominator (a member left after sending) still read.
    func test_resolve_group_countsExceedRecipients_isRead() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 6, readCount: 5, recipientCount: 4)
        XCTAssertEqual(result, .read)
    }

    // MARK: - "All" markers (live count-blind path) take precedence over counts

    // C1: the real-time group path advances state + stamps readByAllAt but does
    // NOT carry per-row counters. The marker must win so the checkmark doesn't
    // regress to a single check while the stale counters say "not everyone".
    func test_resolve_group_readByAllMarker_winsOverStaleCounts() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 0, readCount: 0, recipientCount: 10,
            deliveredToAllAt: Date(), readByAllAt: Date())
        XCTAssertEqual(result, .read)
    }

    func test_resolve_group_deliveredToAllMarker_winsOverStaleCounts() {
        let result = DeliveryStatusResolver.resolve(
            status: .delivered, deliveredCount: 0, readCount: 0, recipientCount: 10,
            deliveredToAllAt: Date(), readByAllAt: nil)
        XCTAssertEqual(result, .delivered)
    }

    // No markers (cold-start: gateway currently leaves them null) → counts decide.
    func test_resolve_group_noMarkers_partialRead_isSent() {
        let result = DeliveryStatusResolver.resolve(
            status: .read, deliveredCount: 1, readCount: 1, recipientCount: 10,
            deliveredToAllAt: nil, readByAllAt: nil)
        XCTAssertEqual(result, .sent)
    }

    // A marker never resurrects a pre-delivery lifecycle state.
    func test_resolve_sending_markerIgnored() {
        let result = DeliveryStatusResolver.resolve(
            status: .sending, deliveredCount: 0, readCount: 0, recipientCount: 10,
            deliveredToAllAt: Date(), readByAllAt: Date())
        XCTAssertEqual(result, .sending)
    }

    // MARK: - fromCounts(deliveredCount:readCount:recipientCount:)

    func test_fromCounts_group_partialRead_isSent() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 1, readCount: 1, recipientCount: 5),
            .sent)
    }

    func test_fromCounts_group_allDelivered_isDelivered() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 5, readCount: 0, recipientCount: 5),
            .delivered)
    }

    func test_fromCounts_group_allRead_isRead() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 5, readCount: 5, recipientCount: 5),
            .read)
    }

    func test_fromCounts_direct_oneRead_isRead() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 1, readCount: 1, recipientCount: 1),
            .read)
    }

    // Unknown denominator falls back to legacy "any > 0" so 1:1 still advances.
    func test_fromCounts_unknownDenominator_anyReadIsRead() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 1, readCount: 1, recipientCount: 0),
            .read)
    }

    func test_fromCounts_unknownDenominator_anyDeliveredIsDelivered() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 1, readCount: 0, recipientCount: 0),
            .delivered)
    }

    func test_fromCounts_nothing_isSent() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 0, readCount: 0, recipientCount: 3),
            .sent)
    }

    // MARK: - Réciprocité showReadReceipts
    //
    // Qui ne partage pas ses accusés ne voit pas ceux des autres. Le paramètre
    // est un booléen OPAQUE : ce résolveur est documenté « stateless and pure »
    // et lire `UserPreferencesManager` ici violerait la pureté du SDK, en plus
    // de le rendre intestable. L'app lit la préférence et la transmet.
    //
    // Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.

    func test_resolve_optedOut_degradesGroupReadToDelivered() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .sent, deliveredCount: 3, readCount: 3, recipientCount: 3,
                showReadReceipts: false),
            .delivered)
    }

    func test_resolve_optedOut_degradesDirectReadToDelivered() {
        // Conversation directe : le statut stocké fait autorité et vaut déjà
        // `.read` — la dégradation doit aussi s'y appliquer.
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .read, deliveredCount: 1, readCount: 1, recipientCount: 1,
                showReadReceipts: false),
            .delivered)
    }

    func test_resolve_optedOut_degradesReadByAllMarker() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .sent, deliveredCount: 0, readCount: 0, recipientCount: 3,
                readByAllAt: Date(),
                showReadReceipts: false),
            .delivered)
    }

    func test_resolve_optedOut_leavesDeliveredUntouched() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .sent, deliveredCount: 3, readCount: 0, recipientCount: 3,
                showReadReceipts: false),
            .delivered)
    }

    func test_resolve_optedOut_leavesSentUntouched() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .sent, deliveredCount: 0, readCount: 0, recipientCount: 3,
                showReadReceipts: false),
            .sent)
    }

    /// Le cycle d'envoi propre à l'expéditeur n'a rien à voir avec la lecture
    /// des pairs : il ne doit pas être touché.
    func test_resolve_optedOut_leavesSendLifecycleUntouched() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .failed, deliveredCount: 0, readCount: 0, recipientCount: 3,
                showReadReceipts: false),
            .failed)
    }

    func test_resolve_sharing_stillPromotesToRead() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .sent, deliveredCount: 3, readCount: 3, recipientCount: 3,
                showReadReceipts: true),
            .read)
    }

    /// Par défaut on partage : les appelants de persistance ne passent pas le
    /// paramètre et ne doivent SURTOUT pas voir leur état dégradé — gater
    /// l'écriture corromprait l'état stocké.
    func test_resolve_defaultsToSharing() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .sent, deliveredCount: 3, readCount: 3, recipientCount: 3),
            .read)
    }

    // MARK: - « On ne lit pas ce qu'on n'a pas reçu » (2026-08-24)

    /// Le gateway servait `deliveredCount` et `readCount` par des chemins
    /// asymétriques : un participant qui marque LU sans avoir jamais émis
    /// d'accusé de livraison comptait comme lecteur sans compter comme
    /// destinataire. La source est corrigée (`resolveReceivedAt`), mais
    /// l'invariant est LOGIQUE et le résolveur doit le tenir seul : un cache
    /// local, un événement partiel ou un serveur plus ancien peuvent encore
    /// lui tendre `delivered < read`.
    ///
    /// Sans cette tenue, un message lu par TOUS restait à UNE coche : le palier
    /// « lu » exige `readCount >= recipientCount`, et le palier « distribué »
    /// juste en dessous exigeait un `deliveredCount` que personne n'avait
    /// incrémenté.
    func test_resolve_group_readImpliesDelivered_evenWhenTheServerUndercounts() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .sent, deliveredCount: 0, readCount: 2, recipientCount: 2),
            .read,
            "tout le monde a lu — la double coche de lecture"
        )
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .sent, deliveredCount: 0, readCount: 3, recipientCount: 3,
                showReadReceipts: false),
            .delivered,
            "accusés de lecture coupés : la lecture prouve quand même la distribution à tous"
        )
    }

    /// Contre-épreuve : l'invariant ne doit RIEN inventer. Deux lecteurs sur
    /// trois ne font pas trois destinataires servis.
    func test_resolve_group_theInvariantNeverInflatesBeyondTheReadCount() {
        XCTAssertEqual(
            DeliveryStatusResolver.resolve(
                status: .sent, deliveredCount: 0, readCount: 2, recipientCount: 3),
            .sent,
            "deux lecteurs sur trois : ni distribué à tous, ni lu par tous — le tout-ou-rien tient"
        )
    }

    func test_fromCounts_readImpliesDelivered_too() {
        XCTAssertEqual(
            DeliveryStatusResolver.fromCounts(deliveredCount: 0, readCount: 2, recipientCount: 2),
            .read
        )
    }
}
