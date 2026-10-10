import Foundation
import Testing
@testable import MeeshySDK

/// #9478 — la passerelle déclare la fraîcheur d'un média : `private, no-store`
/// pour une vue unique, `private, no-cache` pour un éphémère vivant,
/// `private, max-age=31536000` pour un média ordinaire (#9315). Le cache disque
/// lit cette déclaration avant d'écrire quoi que ce soit.
struct MediaCacheDirectiveTests {

    @Test func ordinaryMedia_isPersisted() {
        #expect(MediaCacheDirective(cacheControl: "private, max-age=31536000") == .persist)
        #expect(MediaCacheDirective(cacheControl: "private, max-age=31536000, immutable") == .persist)
    }

    @Test func absentHeader_isPersisted_likeBefore() {
        #expect(MediaCacheDirective(cacheControl: nil) == .persist)
        #expect(MediaCacheDirective(cacheControl: "") == .persist)
    }

    @Test func viewOnce_isNeverStored() {
        #expect(MediaCacheDirective(cacheControl: "private, no-store") == .neverStore)
        #expect(MediaCacheDirective(cacheControl: "No-Store") == .neverStore)
    }

    @Test func ephemeral_isRevalidatedAtEachUse() {
        #expect(MediaCacheDirective(cacheControl: "private, no-cache") == .revalidateEachUse)
        #expect(MediaCacheDirective(cacheControl: "no-cache=\"Set-Cookie\", private") == .revalidateEachUse)
    }

    @Test func noStore_winsOverNoCache() {
        #expect(MediaCacheDirective(cacheControl: "no-cache, no-store") == .neverStore)
    }

    @Test func aDirectiveThatOnlyContainsTheWord_doesNotProtect() {
        #expect(MediaCacheDirective(cacheControl: "private, x-no-store-hint=1") == .persist)
    }

    @Test func onlyAnOrdinaryMedia_mayPersist() {
        #expect(MediaCacheDirective.persist.mayPersist)
        #expect(!MediaCacheDirective.revalidateEachUse.mayPersist)
        #expect(!MediaCacheDirective.neverStore.mayPersist)
    }

    @Test func readsTheHeaderOfAnHTTPResponse() throws {
        let url = try #require(URL(string: "https://gate.meeshy.me/api/v1/attachments/file/a.jpg"))
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Cache-Control": "private, no-store"])
        #expect(MediaCacheDirective(response: response) == .neverStore)
        #expect(MediaCacheDirective(response: nil) == .persist)
    }

    @Test func goneStatuses_areRecognised() {
        #expect(MediaCacheDirective.meansGone(statusCode: 404))
        #expect(MediaCacheDirective.meansGone(statusCode: 410))
        #expect(!MediaCacheDirective.meansGone(statusCode: 500))
        #expect(!MediaCacheDirective.meansGone(statusCode: 401))
    }
}
