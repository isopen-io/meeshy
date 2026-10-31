import Foundation
import Testing
@testable import MeeshySDK

/// LA LOI D'ACCÈS DES CERCLES, côté SDK (#13927) — le miroir Swift rejoue les
/// cas COMMUNS `packages/shared/fixtures/relation-access-cases.json`, écrits à
/// la main pour la loi TypeScript `resolveRelationAccess`. Il ne décide d'aucun
/// accès : il sert à ne pas PROPOSER ce que le serveur refusera. Un seuil, une
/// garde ou un ordre de verdicts qui dériverait du TypeScript rougit ici.
struct RelationAccessCasesTests {

    // MARK: - Le fichier commun, sous sa forme filaire

    private struct CaseFile: Decodable {
        let cases: [Case]
    }

    private struct Case: Decodable {
        let id: String
        let matrix: String
        let input: WireInput
        let expected: WireVerdict
    }

    private struct WireInput: Decodable {
        let viewerId: String
        let targetId: String
        let grantedByViewer: String
        let grantedByTarget: String
        let sharesCommunity: Bool
        let blockedEitherWay: Bool
        let viewerMinor: RelationAgeClass
        let targetMinor: RelationAgeClass
        let viewerRole: String?
        let feature: RelationFeature
        let consent: RelationConsent?

        var lawInput: RelationAccessInput {
            RelationAccessInput(
                viewerId: viewerId,
                targetId: targetId,
                grantedByViewer: RelationLevel(wire: grantedByViewer),
                grantedByTarget: RelationLevel(wire: grantedByTarget),
                sharesCommunity: sharesCommunity,
                blockedEitherWay: blockedEitherWay,
                viewerMinor: viewerMinor,
                targetMinor: targetMinor,
                viewerRole: PlatformRole(caseFolding: viewerRole),
                feature: feature,
                consent: consent
            )
        }
    }

    private struct WireVerdict: Decodable, Equatable {
        let allowed: Bool
        let effectiveLevel: String
        let reason: String
        let requiresConsent: Bool
    }

    private static func project(_ access: RelationAccess) -> WireVerdict {
        WireVerdict(
            allowed: access.allowed,
            effectiveLevel: access.effectiveLevel.rawValue,
            reason: access.reason.rawValue,
            requiresConsent: access.requiresConsent
        )
    }

    private func cases() throws -> [Case] {
        let data = try ActionPolicyVectorFixtures.sharedData("packages/shared/fixtures/relation-access-cases.json")
        return try JSONDecoder().decode(CaseFile.self, from: data).cases
    }

    // MARK: - Les cas communs

    @Test func theSharedFileCarriesCases_neverZero() throws {
        #expect(try cases().count >= 60)
    }

    @Test func everySharedCaseGivesTheSameVerdict() throws {
        for sharedCase in try cases() {
            let actual = Self.project(RelationAccess.resolve(sharedCase.input.lawInput))
            #expect(actual == sharedCase.expected, "\(sharedCase.id)")
        }
    }

    @Test func theSharedCasesCoverEveryFeatureAndEveryVerdictReason() throws {
        let played = try cases()
        let features = Set(played.map { $0.input.feature })
        #expect(features == Set(RelationFeature.allCases))
        let reasons = Set(played.map { $0.expected.reason })
        #expect(reasons == Set(RelationAccessReason.allCases.map(\.rawValue)))
    }

    // MARK: - La table du TypeScript, relue pour que le miroir ne dérive pas

    private func levelsSource() throws -> String {
        let data = try ActionPolicyVectorFixtures.sharedData("packages/shared/utils/relation-levels.ts")
        return String(decoding: data, as: UTF8.self)
    }

    private func matches(_ pattern: String, in text: String) throws -> [[String]] {
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).map { match in
            (1..<match.numberOfRanges).compactMap { index in
                Range(match.range(at: index), in: text).map { String(text[$0]) }
            }
        }
    }

    private func block(after marker: String, until terminator: String, in text: String) throws -> String {
        let start = try #require(text.range(of: marker))
        let tail = text[start.upperBound...]
        let end = try #require(tail.range(of: terminator))
        return String(tail[..<end.lowerBound])
    }

    private func featureSet(named name: String) throws -> Set<String> {
        let source = try levelsSource()
        let declaration = try block(after: "export const \(name)", until: "]);", in: source)
        let opener = try #require(declaration.range(of: "new Set<RelationFeature>(["))
        let body = String(declaration[opener.upperBound...])
        return Set(try matches("'([\\w.]+)'", in: body).compactMap(\.first))
    }

    @Test func theMinimumLevelOfEveryFeatureIsTheOneOfTheTypeScriptTable() throws {
        let table = try block(after: "export const RELATION_FEATURE_MIN_LEVEL", until: "};", in: try levelsSource())
        let rows = try matches("(?:'([\\w.]+)'|(\\w+)):\\s*'([A-Z]+)'", in: table)
        let declared = Dictionary(uniqueKeysWithValues: rows.map { row in (row.first ?? "", row.last ?? "") })
        #expect(declared.count == RelationFeature.allCases.count)
        for feature in RelationFeature.allCases {
            #expect(declared[feature.rawValue] == feature.minimumLevel.rawValue, "\(feature.rawValue)")
        }
    }

    @Test func theConsentDirectedAndPresenceSetsAreTheOnesOfTheTypeScriptTable() throws {
        let consent = try featureSet(named: "RELATION_CONSENT_FEATURES")
        let directed = try featureSet(named: "RELATION_DIRECTED_FEATURES")
        let presence = try featureSet(named: "RELATION_PRESENCE_FEATURES")
        #expect(Set(RelationFeature.allCases.filter(\.requiresConsent).map(\.rawValue)) == consent)
        #expect(Set(RelationFeature.allCases.filter(\.isDirected).map(\.rawValue)) == directed)
        #expect(Set(RelationFeature.allCases.filter(\.isPresence).map(\.rawValue)) == presence)
    }

    @Test func theLevelsAreOrderedAsInTheTypeScriptScale() throws {
        let data = try ActionPolicyVectorFixtures.sharedData("packages/shared/types/relation.ts")
        let source = String(decoding: data, as: UTF8.self)
        let scale = try block(after: "export const RELATION_LEVELS = [", until: "] as const", in: source)
        let declared = try matches("'([A-Z]+)'", in: scale).compactMap(\.first)
        #expect(declared == RelationLevel.allCases.sorted().map(\.rawValue))
        #expect(declared.count == 6)
    }

    // MARK: - Les lectures fermées par défaut

    @Test func anUnreadableLevelReadsPublic_neverHigher() {
        #expect(RelationLevel(wire: "GALAXY") == .public)
        #expect(RelationLevel(wire: "ATOM") == .public)
        #expect(RelationLevel(wire: nil) == .public)
        #expect(RelationLevel(wire: "BLOOD") == .blood)
    }

    @Test func aLowerCaseRoleStillReadsAsAdministrator_likeTheTypeScriptLaw() {
        let input = RelationAccessInput(
            viewerId: "a", targetId: "b",
            grantedByViewer: .public, grantedByTarget: .public,
            sharesCommunity: false, blockedEitherWay: false,
            viewerMinor: .adult, targetMinor: .adult,
            viewerRole: PlatformRole(caseFolding: "admin"),
            feature: .presenceDetailed, consent: nil
        )
        #expect(RelationAccess.resolve(input).reason == .role)
    }

    @Test func aMissingConsentIsAnUnknownOne_andKeepsTheFeatureClosed() {
        let input = RelationAccessInput(
            viewerId: "a", targetId: "b",
            grantedByViewer: .blood, grantedByTarget: .blood,
            sharesCommunity: false, blockedEitherWay: false,
            viewerMinor: .adult, targetMinor: .adult,
            viewerRole: .user, feature: .locationLive, consent: nil
        )
        let access = RelationAccess.resolve(input)
        #expect(access.allowed == false && access.reason == .consent && access.requiresConsent)
    }
}
