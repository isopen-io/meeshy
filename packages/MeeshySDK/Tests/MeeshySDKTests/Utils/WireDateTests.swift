import Foundation
import Testing
@testable import MeeshySDK

/// LES DATES DU FIL (#6609) — ce que la passerelle reçoit et ce qu'elle sert :
/// une date-heure ISO 8601 complète, en UTC, à millisecondes
/// (`toISOString`, `z.string().datetime({ offset: true })`).
struct WireDateTests {

    private static let instant = Date(timeIntervalSince1970: 1_789_464_863.563)

    private static func millisecondes(_ date: Date) -> Int64 {
        Int64((date.timeIntervalSince1970 * 1_000).rounded())
    }

    // MARK: - Écriture

    @Test func string_rendUneDateHeureUTCAMillisecondes() {
        #expect(WireDate.string(from: Self.instant) == "2026-09-15T09:34:23.563Z")
    }

    @Test func string_uneSecondeRonde_porteQuandMemeSesMillisecondes() {
        #expect(WireDate.string(from: Date(timeIntervalSince1970: 1_789_464_863)) == "2026-09-15T09:34:23.000Z")
    }

    @Test func string_lEpoque_rendLaChaineDuDemarrageAFroid() {
        #expect(WireDate.string(from: Date(timeIntervalSince1970: 0)) == "1970-01-01T00:00:00.000Z")
    }

    @Test func string_sousLaMilliseconde_neDepasseJamaisLaDate() {
        let date = Date(timeIntervalSince1970: 1_789_464_863.5637)
        #expect(WireDate.string(from: date) == "2026-09-15T09:34:23.563Z",
                "un watermark écrit plus tard que lui-même ferait sauter une ligne du delta")
    }

    // MARK: - Aller-retour

    @Test func string_puisDate_allerRetourExactSurChaqueMillisecondeDUneSeconde() {
        let echecs = (0..<1_000).compactMap { ms -> Int? in
            let date = Date(timeIntervalSince1970: 1_789_464_863 + Double(ms) / 1_000)
            let ecrite = WireDate.string(from: date)
            guard let relue = WireDate.date(from: ecrite),
                  Self.millisecondes(relue) == Self.millisecondes(date),
                  ecrite.hasSuffix(String(format: ".%03dZ", ms)),
                  WireDate.string(from: relue) == ecrite
            else { return ms }
            return nil
        }
        #expect(echecs.isEmpty, "millisecondes perdues à l'aller-retour : \(echecs.prefix(10))")
    }

    // MARK: - Lecture

    @Test func date_avecFractions_seRelitALaMilliseconde() throws {
        let relue = try #require(WireDate.date(from: "2026-09-15T09:34:23.563Z"))
        #expect(Self.millisecondes(relue) == 1_789_464_863_563)
    }

    @Test func date_sansFractions_seRelit() throws {
        let relue = try #require(WireDate.date(from: "2026-09-15T09:34:23Z"))
        #expect(Self.millisecondes(relue) == 1_789_464_863_000)
    }

    @Test func date_avecDecalage_designeLeMemeInstant() throws {
        let relue = try #require(WireDate.date(from: "2026-09-15T11:34:23.563+02:00"))
        #expect(Self.millisecondes(relue) == 1_789_464_863_563)
    }

    @Test func date_uneHeureSeule_nEstPasUneDate() {
        #expect(WireDate.date(from: "03:53:29.563") == nil)
        #expect(WireDate.date(from: "") == nil)
    }

    // MARK: - La mesure qui justifie le helper

    /// La chaîne de repli posée par `ce94a0f71d` — heure seule, puis `.iso8601`
    /// sans fractions — ne relit PAS une date-heure à millisecondes : le
    /// checkpoint, l'heure serveur et le curseur servis étaient perdus.
    @Test func mesure_laChaineDeRepliDeCe94a0f_neRelitPasUneDateAMillisecondes() {
        let servie = "2026-09-15T09:34:23.563Z"
        let relue = (try? Date(servie, strategy: .iso8601.time(includingFractionalSeconds: true)))
            ?? (try? Date(servie, strategy: .iso8601))
        #expect(relue.map(Self.millisecondes) != 1_789_464_863_563)
    }
}
