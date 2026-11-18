import Foundation
import Testing
@testable import MeeshySDK

/// L'accent CHOISI de la vitrine (#19201, iOS #19391) : servi, il passe avant la couleur calculée ; absent, `null` ou
/// hors liste, rien ne change. Il part dans le PATCH (`null` pour l'automatique), voyage avec chaque copie du compte,
/// et les deux événements (`user:updated`, `profile:updated`) le repeignent sans toucher à ce qu'ils ne portent pas.
struct ProfileAccentTests {

    private func decode(_ json: String) throws -> MeeshyUser {
        try JSONDecoder().decode(MeeshyUser.self, from: Data(json.utf8))
    }

    private func me(accent: String? = "#A855F7") -> MeeshyUser {
        MeeshyUser(id: "me", username: "aissa", displayName: "Aïssa", bio: "Designer sonore", voicePublic: true,
                   city: "Dakar", cityCircle: "FRIEND", profileAccentColor: accent)
    }

    // MARK: - La liste fermée

    @Test func theListIsThePlancheOrder() {
        let keys = ProfileAccent.tones.map(\.key)
        #expect(keys == ["violet", "turquoise", "coral", "amber", "blue", "green", "raspberry"])
    }

    @Test func aServedToneIsReadWhateverItsCase() {
        let tone = ProfileAccent.tone(wire: " #a855f7 ")
        #expect(tone?.key == "violet")
        #expect(tone?.bareHex == "A855F7")
    }

    @Test func aColourOffTheListIsNoTone() {
        #expect(ProfileAccent.tone(wire: "#123456") == nil)
        #expect(ProfileAccent.tone(wire: "violet") == nil)
        #expect(ProfileAccent.tone(wire: nil) == nil)
    }

    // MARK: - Ce que la vitrine peint

    @Test func theChosenAccentWinsOverTheComputedOne() throws {
        let user = try decode(##"{"id":"me","username":"aissa","profileAccentColor":"#4ECDC4"}"##)
        #expect(user.chosenAccent?.key == "turquoise")
        #expect(user.profileAccentHex == "4ECDC4")
    }

    @Test func withoutAChosenAccentTheComputedOneStays() throws {
        let computed = DynamicColorGenerator.profileAccentHex(userId: "me", name: "aissa")
        let older = try decode(#"{"id":"me","username":"aissa"}"#)
        #expect(older.profileAccentHex == computed)
        let automatic = try decode(#"{"id":"me","username":"aissa","profileAccentColor":null}"#)
        #expect(automatic.profileAccentHex == computed)
        let corrupted = try decode(##"{"id":"me","username":"aissa","profileAccentColor":"#123456"}"##)
        #expect(corrupted.profileAccentHex == computed)
    }

    @Test func theHexOfAProfileFallsBackOnTheComputedAccent() {
        #expect(ProfileAccent.hex(chosen: "#FF2E63", userId: "u", name: "léo") == "FF2E63")
        let computed = DynamicColorGenerator.profileAccentHex(userId: "u", name: "léo")
        #expect(ProfileAccent.hex(chosen: nil, userId: "u", name: "léo") == computed)
    }

    // MARK: - Le compte et ses copies

    @Test func changingTheAccentKeepsEveryOtherField() {
        let edited = me().withProfileAccent("#2ECC71")
        #expect(edited.profileAccentColor == "#2ECC71")
        #expect(edited.bio == "Designer sonore")
        #expect(edited.declaredCity == "Dakar")
        #expect(edited.voicePublic == true)
        #expect(me().withProfileAccent(nil).profileAccentColor == nil)
        #expect(me().withProfileAccent("#123456").profileAccentColor == nil)
    }

    @Test func everyCopyOfTheAccountCarriesTheAccent() {
        let user = me()
        #expect(user.withProfileDecor(nil).profileAccentColor == "#A855F7")
        #expect(user.withProfileChanges(bio: "x").profileAccentColor == "#A855F7")
        #expect(user.droppingDataURIImages().profileAccentColor == "#A855F7")
        #expect(user.withDeclaredCity("Porto", circle: .public).profileAccentColor == "#A855F7")
    }

    @Test func aResponseWithoutTheAccentKeepsTheOneIHold() {
        let served = MeeshyUser(id: "me", username: "aissa")
        #expect(served.carryingProfileAccent(from: me()).profileAccentColor == "#A855F7")
        let other = MeeshyUser(id: "other", username: "rui")
        #expect(other.carryingProfileAccent(from: me()).profileAccentColor == nil)
        let servedTone = MeeshyUser(id: "me", username: "aissa", profileAccentColor: "#3498DB")
        #expect(servedTone.carryingProfileAccent(from: me()).profileAccentColor == "#3498DB")
    }

    // MARK: - Le PATCH

    private func body(_ request: UpdateProfileRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    @Test func aChosenToneLeavesInItsWireForm() throws {
        let violet = try #require(ProfileAccent.tones.first)
        let sent = try body(UpdateProfileRequest(profileAccentColor: .tone(violet)))
        #expect(sent["profileAccentColor"] as? String == "#A855F7")
    }

    @Test func automaticLeavesAsNullAndAnUntouchedAccentIsOmitted() throws {
        let automatic = try body(UpdateProfileRequest(profileAccentColor: .automatic))
        #expect(automatic.keys.contains("profileAccentColor"))
        #expect(automatic["profileAccentColor"] is NSNull)
        let untouched = try body(UpdateProfileRequest(bio: "x"))
        #expect(untouched.keys.contains("profileAccentColor") == false)
    }

    @Test func aChoiceReadsBackFromTheServedValue() {
        #expect(ProfileAccentChoice(wire: "#F8B500").wire == "#F8B500")
        #expect(ProfileAccentChoice(wire: nil) == .automatic)
        #expect(ProfileAccentChoice(wire: "#000000") == .automatic)
    }

    // MARK: - Les événements

    private func userUpdated(_ changes: String) throws -> UserUpdatedEvent {
        let json = #"{"userId":"me","changes":{"# + changes + #"}}"#
        return try JSONDecoder().decode(UserUpdatedEvent.self, from: Data(json.utf8))
    }

    @Test func userUpdatedRepaintsTheAccentOfAPeer() throws {
        let event = try userUpdated(##""profileAccentColor":"#FF6B6B""##)
        let repainted = try #require(event.repainted(me()))
        #expect(repainted.profileAccentColor == "#FF6B6B")
        #expect(repainted.bio == "Designer sonore")
    }

    @Test func userUpdatedWithNullGoesBackToAutomatic() throws {
        let event = try userUpdated(#""profileAccentColor":null"#)
        let repainted = try #require(event.repainted(me()))
        #expect(repainted.profileAccentColor == nil)
    }

    @Test func userUpdatedWithoutTheKeyLeavesTheAccent() throws {
        let event = try userUpdated(##""avatar":"https://cdn/new.png""##)
        #expect(event.profileAccentColor == .unchanged)
        let repainted = try #require(event.repainted(me()))
        #expect(repainted.profileAccentColor == "#A855F7")
    }

    private func profileUpdated(_ accent: String?) throws -> ProfileUpdatedEvent {
        let key = accent.map { #","profileAccentColor":"# + $0 } ?? ""
        let json = #"{"userId":"me","updatedAt":"2026-11-17T10:05:00.000Z","profile":{"systemLanguage":"fr","#
            + #""firstName":"Aïssa","lastName":"Ndiaye","username":"aissa""# + key + "}}"
        return try JSONDecoder().decode(ProfileUpdatedEvent.self, from: Data(json.utf8))
    }

    @Test func myOtherDeviceRepaintsMyAccent() throws {
        let projected = try #require(OwnProfileSync.projected(me(), applying: try profileUpdated("\"#3498DB\"")))
        #expect(projected.profileAccentColor == "#3498DB")
    }

    @Test func aSnapshotWithoutTheAccentKeepsMine() throws {
        let event = try profileUpdated(nil)
        #expect(event.profile.profileAccentColor == .unchanged)
        let projected = OwnProfileSync.projected(me(), applying: event)
        #expect(projected?.profileAccentColor == "#A855F7")
    }

    @Test func aSnapshotWithNullGoesBackToAutomatic() throws {
        let projected = try #require(OwnProfileSync.projected(me(), applying: try profileUpdated("null")))
        #expect(projected.profileAccentColor == nil)
    }
}
