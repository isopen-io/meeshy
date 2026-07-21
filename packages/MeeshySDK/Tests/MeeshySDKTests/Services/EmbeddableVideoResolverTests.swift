import Testing
import Foundation
@testable import MeeshySDK

@Suite("EmbeddableVideoResolver")
struct EmbeddableVideoResolverTests {

    @Test("watch?v= résout l'id")
    func watchURL() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        #expect(v?.provider == .youtube)
        #expect(v?.videoId == "dQw4w9WgXcQ")
        #expect(v?.startSeconds == nil)
    }

    @Test("youtu.be court résout l'id")
    func shortURL() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/dQw4w9WgXcQ")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("shorts résout l'id")
    func shortsURL() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://www.youtube.com/shorts/dQw4w9WgXcQ")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("embed résout l'id")
    func embedURL() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://www.youtube.com/embed/dQw4w9WgXcQ")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("m.youtube.com résout l'id")
    func mobileURL() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://m.youtube.com/watch?v=dQw4w9WgXcQ")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("timestamp t=90 (secondes) parsé")
    func startSeconds() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/dQw4w9WgXcQ?t=90")
        #expect(v?.startSeconds == 90)
    }

    @Test("timestamp t=1m30s parsé")
    func startHMS() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")
        #expect(v?.startSeconds == 90)
    }

    @Test("params parasites ignorés")
    func noiseParams() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&si=abc")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("URL non-YouTube → nil")
    func nonYouTube() {
        #expect(EmbeddableVideoResolver.resolve(urlString: "https://vimeo.com/12345") == nil)
        #expect(EmbeddableVideoResolver.resolve(urlString: "https://example.com/watch?v=abc") == nil)
    }

    @Test("URL malformée / non-http → nil")
    func malformed() {
        #expect(EmbeddableVideoResolver.resolve(urlString: "pas une url") == nil)
        #expect(EmbeddableVideoResolver.resolve(urlString: "mailto:a@b.com") == nil)
    }

    @Test("resolve(in:) extrait la première URL d'un texte")
    func inText() {
        let v = EmbeddableVideoResolver.resolve(in: "Regarde ça https://youtu.be/dQw4w9WgXcQ c'est top")
        #expect(v?.videoId == "dQw4w9WgXcQ")
    }

    @Test("thumbnailURL et embedURL bien construites")
    func urls() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/dQw4w9WgXcQ")!
        #expect(v.thumbnailURL().absoluteString == "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
        #expect(v.embedURL.absoluteString == "https://www.youtube.com/embed/dQw4w9WgXcQ")
    }

    @Test("watchURL canonique reconstruite depuis le videoId")
    func watchURLCanonical() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/dQw4w9WgXcQ")!
        #expect(v.watchURL.absoluteString == "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    }

    @Test("watchURL ajoute le timestamp quand un start est présent")
    func watchURLWithStart() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/dQw4w9WgXcQ?t=90")!
        #expect(v.watchURL.absoluteString == "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s")
    }

    @Test("videoId avec lettre Unicode (accent) tronqué sous le minimum → rejeté")
    func unicodeVideoIdRejectedByAsciiFilter() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/café12345678")
        #expect(v == nil)
    }

    @Test("videoId avec chiffre Unicode non-ASCII (Devanagari) → rejeté")
    func unicodeDigitVideoIdRejected() {
        // "\u{0966}" = chiffre Devanagari '0', accepté par Character.isNumber mais pas ASCII.
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/abc123\u{0966}\u{0966}\u{0966}")
        #expect(v == nil)
    }

    @Test("thumbnailURL/embedURL ne force-unwrap jamais même avec un videoId Unicode construit directement")
    func neverForceCrashesOnDirectUnicodeVideoId() {
        let v = EmbeddedVideo(provider: .youtube, videoId: "日本語テスト1234", startSeconds: nil)
        let thumb = v.thumbnailURL()
        let embed = v.embedURL
        let watch = v.watchURL
        #expect(thumb.scheme == "https")
        #expect(embed.scheme == "https")
        #expect(watch.scheme == "https")
    }

    @Test("videoId contenant '/' construit directement ne peut pas injecter de segment de chemin")
    func directVideoIdWithSlashCannotInjectPathSegment() {
        let v = EmbeddedVideo(provider: .youtube, videoId: "abc/../../evil", startSeconds: nil)
        let thumb = v.thumbnailURL()
        #expect(thumb.host == "img.youtube.com")
        #expect(thumb.absoluteString == "https://img.youtube.com/vi/abc%2F..%2F..%2Fevil/hqdefault.jpg")
        #expect(thumb.pathComponents == ["/", "vi", "abc/../../evil", "hqdefault.jpg"])
        let embed = v.embedURL
        #expect(embed.host == "www.youtube.com")
        #expect(embed.absoluteString == "https://www.youtube.com/embed/abc%2F..%2F..%2Fevil")
        #expect(embed.pathComponents == ["/", "embed", "abc/../../evil"])
    }

    @Test("make() rejette un id ASCII valide suivi de garbage plutôt que de le tronquer")
    func longValidAsciiPrefixFollowedByGarbageIsRejectedNotTruncated() {
        let v = EmbeddableVideoResolver.resolve(urlString: "https://youtu.be/abc123défault")
        #expect(v == nil)
    }
}
