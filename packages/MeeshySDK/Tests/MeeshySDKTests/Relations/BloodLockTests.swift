import Foundation
import Testing
@testable import MeeshySDK

/// LE VERROU DU SANG, lu tel que le serveur le sert (#20359, #20361, #20408). Un serveur d'avant ne sert rien : le
/// client garde son comportement d'avant. Un mineur déclaré garde le retrait de sa position et de son titre.
struct BloodLockTests {

    private func settings(_ json: String) throws -> RelationPersonSettings {
        try JSONDecoder().decode(RelationPersonSettings.self, from: Data(json.utf8))
    }

    @Test func aServerThatServesNothingLocksNothing() throws {
        let served = try settings(#"{"userId":"u1","bringBlocked":true}"#)
        #expect(served.bloodLock == .open)
        #expect(!served.bloodLock.isLocked)
    }

    @Test func aLockedBloodLocksEverythingIncludingPositionAndTitle() throws {
        let served = try settings(#"{"userId":"u1","bringBlocked":false,"lockedByLevel":true,"bloodBundleAccepted":true,"ritualSharesLocked":true}"#)
        #expect(served.bloodLock.isLocked)
        #expect(served.bloodLock.locksPositionAndTitle)
        #expect(served.bloodBundleAccepted == true)
    }

    @Test func aLockedBloodWithoutTheRitualFieldIsAFullBlood() throws {
        let served = try settings(#"{"userId":"u1","bringBlocked":false,"lockedByLevel":true}"#)
        #expect(served.bloodLock.locksPositionAndTitle)
    }

    @Test func aDeclaredMinorKeepsTheWithdrawalOfPositionAndTitle() throws {
        let served = try settings(#"{"userId":"u1","bringBlocked":false,"lockedByLevel":true,"ritualSharesLocked":false}"#)
        #expect(served.bloodLock.isLocked)
        #expect(!served.bloodLock.locksPositionAndTitle)
    }

    @Test func aBloodThatHasNotAcceptedTheListIsNotLocked() throws {
        let served = try settings(#"{"userId":"u1","bringBlocked":true,"lockedByLevel":false,"bloodBundleAccepted":false,"ritualSharesLocked":false}"#)
        #expect(!served.bloodLock.isLocked)
        #expect(!served.bloodLock.locksPositionAndTitle)
    }

    @Test func everyPerPersonSettingServesTheLock() throws {
        let json = Data(#"{"userId":"u1","shared":true,"lockedByLevel":true}"#.utf8)
        #expect(try JSONDecoder().decode(FallPersonSettings.self, from: json).lockedByLevel == true)
        #expect(try JSONDecoder().decode(InactivityPersonSettings.self, from: json).lockedByLevel == true)
        #expect(try JSONDecoder().decode(PhoneCallPersonSettings.self, from: json).lockedByLevel == true)
        #expect(try JSONDecoder().decode(PhoneReachabilityPersonSettings.self, from: json).lockedByLevel == true)
        #expect(try JSONDecoder().decode(BatteryPersonSettings.self, from: json).lockedByLevel == true)
    }

    @Test func anOldServerLeavesTheLockAbsent() throws {
        let json = Data(#"{"userId":"u1","shared":true}"#.utf8)
        #expect(try JSONDecoder().decode(FallPersonSettings.self, from: json).lockedByLevel == nil)
        #expect(try JSONDecoder().decode(BatteryPersonSettings.self, from: json).lockedByLevel == nil)
    }

    @Test func theLockedCodeIsReadOnTheMachineCode() {
        let rejection = APIRejection(statusCode: 409, code: "RELATION_BLOOD_LOCKED", message: "Entre Sangs, rien ne se coupe")
        #expect(RelationRefusal.from(MeeshyError.rejected(rejection)) == .bloodLocked)
    }

    @Test func theSettingsRoutesDeclareTheirRefusalsStructured() {
        #expect(RelationsEndpoint.byUserIdSettings(userId: "u").rejectionPolicy == .structured)
        #expect(RelationsEndpoint.byUserIdBatterySettings(userId: "u").rejectionPolicy == .structured)
        #expect(RelationsEndpoint.byUserIdFallSettings(userId: "u").rejectionPolicy == .structured)
        #expect(RelationsEndpoint.byUserIdInactivitySettings(userId: "u").rejectionPolicy == .structured)
        #expect(RelationsEndpoint.byUserIdPhoneCallSettings(userId: "u").rejectionPolicy == .structured)
        #expect(RelationsEndpoint.byUserIdPhoneReachabilitySettings(userId: "u").rejectionPolicy == .structured)
    }
}
