import Testing
@testable import MeeshyUI

struct AudioConsentNoticeTests {
    @Test func equal_whenSameVisibleParams() {
        let a = AudioConsentNotice(message: "m", actionTitle: "a", accentHex: "#6366F1", onTap: {})
        let b = AudioConsentNotice(message: "m", actionTitle: "a", accentHex: "#6366F1", onTap: {})
        #expect(a == b)
    }
    @Test func notEqual_whenMessageDiffers() {
        let a = AudioConsentNotice(message: "m1", actionTitle: "a", accentHex: "#6366F1", onTap: {})
        let b = AudioConsentNotice(message: "m2", actionTitle: "a", accentHex: "#6366F1", onTap: {})
        #expect(a != b)
    }
}
