import Foundation
import Testing
@testable import MeeshySDK

/// « Traduire automatiquement » part avec l'édition de ma vitrine (#19512) : la passerelle l'accepte sur
/// `PATCH /users/me` et l'écrit dans `UserPreferences.application`. Un PATCH qui ne le touche pas ne le nomme pas.
struct UpdateProfileRequestAutoTranslateTests {

    private func body(_ request: UpdateProfileRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    @Test func theSwitchTravelsInThePatch() throws {
        let sent = try body(UpdateProfileRequest(voicePublic: true, autoTranslateEnabled: false))
        #expect(sent["autoTranslateEnabled"] as? Bool == false)
        #expect(sent["voicePublic"] as? Bool == true)
    }

    @Test func anUntouchedSwitchIsOmitted() throws {
        let sent = try body(UpdateProfileRequest(bio: "x"))
        #expect(sent["autoTranslateEnabled"] == nil)
        #expect(sent["voicePublic"] == nil)
    }
}
