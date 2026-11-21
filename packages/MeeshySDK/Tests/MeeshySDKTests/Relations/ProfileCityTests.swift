import Foundation
import Testing
@testable import MeeshySDK

/// La ville déclarée (#18862, iOS #19388) : décodée quand le serveur la sert, absente sinon ; lue par « Voir comme »
/// selon le cercle choisi ; portée par chaque copie du compte, et gardée quand une réponse de moi ne la sert pas.
struct ProfileCityTests {

    private func decode(_ json: String) throws -> MeeshyUser {
        try JSONDecoder().decode(MeeshyUser.self, from: Data(json.utf8))
    }

    private func me(city: String? = "Dakar", circle: String? = "FRIEND") -> MeeshyUser {
        MeeshyUser(id: "me", username: "aissa", bio: "Designer sonore", voicePublic: true,
                   addresses: nil, city: city, cityCircle: circle)
    }

    @Test func theServedCityAndItsCircleAreDecoded() throws {
        let user = try decode(#"{"id":"me","username":"aissa","city":"Dakar","cityCircle":"CLOSE"}"#)
        #expect(user.declaredCity == "Dakar")
        #expect(user.declaredCityCircle == .close)
    }

    @Test func anOlderServerWithoutTheFieldsDecodesToNoCity() throws {
        let user = try decode(#"{"id":"u","username":"rui"}"#)
        #expect(user.city == nil)
        #expect(user.declaredCity == nil)
        #expect(user.declaredCityCircle == nil)
    }

    @Test func aBlankCityIsNoCity() {
        #expect(me(city: "   ").declaredCity == nil)
        #expect(me(city: "  Porto ").declaredCity == "Porto")
    }

    @Test func anUnknownCircleClosesInsteadOfOpeningToPublic() {
        #expect(ProfileCity.circle(wire: "ATOM") == nil)
        #expect(ProfileCity.seen(city: "Dakar", circle: "ATOM", by: .blood) == nil)
    }

    @Test func seenAsShowsTheCityFromItsCircleUpwardOnly() {
        #expect(ProfileCity.seen(city: "Dakar", circle: "FRIEND", by: .public) == nil)
        #expect(ProfileCity.seen(city: "Dakar", circle: "FRIEND", by: .acquaintance) == nil)
        #expect(ProfileCity.seen(city: "Dakar", circle: "FRIEND", by: .friend) == "Dakar")
        #expect(ProfileCity.seen(city: "Dakar", circle: "FRIEND", by: .blood) == "Dakar")
        #expect(ProfileCity.seen(city: "Dakar", circle: "PUBLIC", by: .public) == "Dakar")
    }

    @Test func withoutAChosenCircleNobodyButMeReadsTheCity() {
        #expect(ProfileCity.seen(city: "Dakar", circle: nil, by: .blood) == nil)
    }

    @Test func editingTheCityKeepsEveryOtherField() {
        let edited = me().withDeclaredCity(" Lisbonne ", circle: .close)
        #expect(edited.declaredCity == "Lisbonne")
        #expect(edited.cityCircle == "CLOSE")
        #expect(edited.bio == "Designer sonore")
        #expect(edited.voicePublic == true)
    }

    @Test func everyCopyOfTheAccountCarriesTheCity() {
        let user = me()
        #expect(user.withProfileDecor(nil).declaredCity == "Dakar")
        #expect(user.withProfileChanges(bio: "x").cityCircle == "FRIEND")
        #expect(user.droppingDataURIImages().declaredCity == "Dakar")
    }

    @Test func aResponseOfMineWithoutTheCityKeepsTheOneIHold() {
        let served = MeeshyUser(id: "me", username: "aissa")
        let kept = served.carryingDeclaredCity(from: me())
        #expect(kept.declaredCity == "Dakar")
        #expect(kept.declaredCityCircle == .friend)
    }

    @Test func aResponseThatServesTheCityWins() {
        let served = MeeshyUser(id: "me", username: "aissa", city: "Porto", cityCircle: "PUBLIC")
        let kept = served.carryingDeclaredCity(from: me())
        #expect(kept.declaredCity == "Porto")
        #expect(kept.declaredCityCircle == .public)
    }

    @Test func anotherAccountsCityIsNeverCarried() {
        let other = MeeshyUser(id: "other", username: "rui")
        #expect(other.carryingDeclaredCity(from: me()).city == nil)
    }

    private func body(_ request: UpdateProfileRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    @Test func thePatchCarriesTheCityAndItsCircle() throws {
        let sent = try body(UpdateProfileRequest(city: " Dakar ", cityCircle: .friend))
        #expect(sent["city"] as? String == "Dakar")
        #expect(sent["cityCircle"] as? String == "FRIEND")
    }

    @Test func anUntouchedCityIsOmittedAndAClearedOneIsSentEmpty() throws {
        let untouched = try body(UpdateProfileRequest(bio: "x"))
        #expect(untouched["city"] == nil)
        #expect(untouched["cityCircle"] == nil)
        let cleared = try body(UpdateProfileRequest(city: ""))
        #expect(cleared["city"] as? String == "")
    }

    @Test func aCityLongerThanTheGatewayBoundIsCut() {
        let request = UpdateProfileRequest(city: String(repeating: "a", count: 120))
        let count = request.city?.count
        #expect(count == ProfileCity.maxLength)
    }
}
