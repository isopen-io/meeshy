import Foundation
import Testing
@testable import MeeshySDK

/// L'HISTORIQUE D'UN SANG, SA LECTURE (#18872, planche Carte-Sang) : par jour, par fenêtre, ses arrêts et la tête de
/// lecture. Toujours sur les points servis, jamais un point inventé.
struct BloodHistoryRulesTests {

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Lisbon") ?? .gmt
        return calendar
    }

    /// Le 16 novembre 2026, 17 h 42 à Lisbonne.
    private var now: Date {
        calendar.date(from: DateComponents(year: 2026, month: 11, day: 16, hour: 17, minute: 42)) ?? Date()
    }

    private func point(_ latitude: Double, _ longitude: Double, hour: Int, minute: Int, dayOffset: Int = 0) -> BloodLocationPoint {
        let day = calendar.date(byAdding: .day, value: dayOffset, to: calendar.startOfDay(for: now)) ?? now
        let at = calendar.date(byAdding: DateComponents(hour: hour, minute: minute), to: day) ?? day
        return BloodLocationPoint(latitude: latitude, longitude: longitude, recordedAt: at)
    }

    @Test("« Aujourd'hui » couvre depuis minuit jusqu'à maintenant, « Hier » la veille entière")
    func ranges() {
        let today = BloodHistoryRange.today.interval(now: now, calendar: calendar)
        #expect(today.start == calendar.startOfDay(for: now))
        #expect(today.end == now)
        let yesterday = BloodHistoryRange.yesterday.interval(now: now, calendar: calendar)
        #expect(yesterday.end == calendar.startOfDay(for: now))
        #expect(yesterday.duration == 24 * 3_600)
        let month = BloodHistoryRange.month.interval(now: now, calendar: calendar)
        let first = calendar.dateComponents([.month, .day], from: month.start)
        #expect(first.month == 10 && first.day == 18)
    }

    @Test("le chemin d'un jour est la somme de ses pas ; trente barres, aujourd'hui en dernier")
    func dailyDistances() {
        let points = [
            point(38.7000, -9.1400, hour: 9, minute: 10),
            point(38.7100, -9.1400, hour: 12, minute: 30),
            point(38.7000, -9.1400, hour: 10, minute: 0, dayOffset: -1),
            point(38.7050, -9.1400, hour: 11, minute: 0, dayOffset: -1),
        ]
        let days = BloodHistoryRules.dailyDistances(points, now: now, calendar: calendar)
        #expect(days.count == 30)
        #expect(days[29] > 1_100 && days[29] < 1_120)
        #expect(days[28] > 550 && days[28] < 560)
        #expect(days[0] == 0)
    }

    @Test("rester au même endroit au moins dix minutes fait un arrêt ; passer ne fait rien")
    func stops() {
        let points = [
            point(38.7000, -9.1400, hour: 9, minute: 10),
            point(38.7001, -9.1401, hour: 9, minute: 40),
            point(38.7100, -9.1400, hour: 10, minute: 0),
            point(38.7200, -9.1400, hour: 10, minute: 5),
            point(38.7201, -9.1400, hour: 10, minute: 30),
        ]
        #expect(BloodHistoryRules.stops(points) == [0, 3])
    }

    @Test("la tête de lecture montre le dernier relevé à son instant")
    func playhead() {
        let points = [
            point(38.70, -9.14, hour: 9, minute: 0),
            point(38.71, -9.14, hour: 12, minute: 0),
            point(38.72, -9.14, hour: 15, minute: 0),
        ]
        #expect(BloodHistoryRules.index(atProgress: 0, in: points) == 0)
        #expect(BloodHistoryRules.index(atProgress: 0.6, in: points) == 1)
        #expect(BloodHistoryRules.index(atProgress: 1, in: points) == 2)
        #expect(BloodHistoryRules.index(atProgress: 0.5, in: []) == nil)
    }

    @Test("un arrêt se pose sur la piste de lecture à son instant : le début à 0, la fin à 1, rien hors du chemin")
    func progressOfIndex() {
        let points = [
            point(38.70, -9.14, hour: 9, minute: 0),
            point(38.71, -9.14, hour: 12, minute: 0),
            point(38.72, -9.14, hour: 15, minute: 0),
        ]
        #expect(BloodHistoryRules.progress(ofIndex: 0, in: points) == 0)
        #expect(BloodHistoryRules.progress(ofIndex: 1, in: points) == 0.5)
        #expect(BloodHistoryRules.progress(ofIndex: 2, in: points) == 1)
        #expect(BloodHistoryRules.progress(ofIndex: 3, in: points) == nil)
        #expect(BloodHistoryRules.progress(ofIndex: 0, in: [points[0]]) == 0)
        #expect(BloodHistoryRules.progress(ofIndex: 0, in: []) == nil)
    }

    @Test("un réglage de fantôme part seul ; un rayon sans personne ou un identifiant illisible ne part pas")
    func settingsChange_isShapedLikeTheSchema() throws {
        #expect(BloodLocationSettingsChange() == nil)
        #expect(BloodLocationSettingsChange(proximityRadiusMeters: 500) == nil)
        #expect(BloodLocationSettingsChange(userId: "pas-un-id", ghost: true) == nil)
        let ranged = try #require(BloodLocationSettingsChange(userId: "0123456789ABCDEF01234567", proximityRadiusMeters: 9_000))
        let radius = ranged.proximityRadiusMeters
        #expect(radius == 5_000)
        #expect(ranged.userId == "0123456789abcdef01234567")
    }

    @Test("qui a regardé ma position : une rangée par personne, combien de fois, la dernière fois, et qui lit trop souvent")
    func consultations_groupByObserver() {
        let journal = BloodLocationConsultations(
            items: [
                BloodLocationConsultation(observerId: "leo", consultedAt: now.addingTimeInterval(-3_600)),
                BloodLocationConsultation(observerId: "mina", consultedAt: now.addingTimeInterval(-60)),
                BloodLocationConsultation(observerId: "leo", consultedAt: now.addingTimeInterval(-600)),
            ],
            excessiveObserverIds: ["leo"]
        )
        let rows = journal.byObserver
        #expect(rows.map(\.observerId) == ["mina", "leo"])
        #expect(rows.map(\.count) == [1, 2])
        #expect(rows.last?.lastAt == now.addingTimeInterval(-600))
        #expect(rows.map(\.isExcessive) == [false, true])
    }
}

/// LE RELEVÉ DU SANG (#18872) : ce qui part vers `POST /me/location/blood`, et quand. Un pas trop court ou un relevé
/// trop flou ne part pas ; immobile, un point par quart d'heure suffit à dire un arrêt ; sans Sang, rien ne part.
struct BloodLocationRecordGateTests {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func last(_ latitude: Double, _ longitude: Double, minutesAgo: Double) -> BloodLocationPoint {
        BloodLocationPoint(latitude: latitude, longitude: longitude, recordedAt: now.addingTimeInterval(-minutesAgo * 60))
    }

    @Test("un relevé hors du globe ou non fini n'existe pas ; une précision illisible est omise")
    func readingIsBounded() {
        #expect(BloodLocationReading(latitude: 95, longitude: 0) == nil)
        #expect(BloodLocationReading(latitude: 0, longitude: .infinity) == nil)
        let reading = BloodLocationReading(latitude: 38.71, longitude: -9.13, accuracy: -4)
        #expect(reading?.accuracy == nil)
        let huge = BloodLocationReading(latitude: 38.71, longitude: -9.13, accuracy: 900_000)
        #expect(huge?.accuracy == 100_000)
    }

    @Test("le premier relevé part ; un relevé trop flou ne part jamais")
    func firstAndBlurry() throws {
        let first = try #require(BloodLocationReading(latitude: 38.71, longitude: -9.13, accuracy: 30))
        #expect(BloodLocationRecordGate.isDue(first, at: now, after: nil))
        let blurry = try #require(BloodLocationReading(latitude: 38.71, longitude: -9.13, accuracy: 3_000))
        #expect(!BloodLocationRecordGate.isDue(blurry, at: now, after: nil))
    }

    @Test("un pas de moins de 200 m il y a cinq minutes ne part pas ; un kilomètre part aussitôt")
    func distance() throws {
        let near = try #require(BloodLocationReading(latitude: 38.7105, longitude: -9.13))
        #expect(!BloodLocationRecordGate.isDue(near, at: now, after: last(38.71, -9.13, minutesAgo: 5)))
        let far = try #require(BloodLocationReading(latitude: 38.72, longitude: -9.13))
        #expect(BloodLocationRecordGate.isDue(far, at: now, after: last(38.71, -9.13, minutesAgo: 5)))
    }

    @Test("immobile, un nouveau point part après un quart d'heure")
    func interval() throws {
        let still = try #require(BloodLocationReading(latitude: 38.71, longitude: -9.13))
        #expect(!BloodLocationRecordGate.isDue(still, at: now, after: last(38.71, -9.13, minutesAgo: 14)))
        #expect(BloodLocationRecordGate.isDue(still, at: now, after: last(38.71, -9.13, minutesAgo: 15)))
    }

    @Test("sans lien Sang, personne ne relirait : rien ne part")
    func audience() {
        let friend = RelationLink(userId: "a", effectiveLevel: .friend, grantedByMe: .blood)
        let blood = RelationLink(userId: "b", effectiveLevel: .blood, grantedByMe: .blood)
        #expect(!BloodLocationRecordGate.hasAudience([]))
        #expect(!BloodLocationRecordGate.hasAudience([friend]))
        #expect(BloodLocationRecordGate.hasAudience([friend, blood]))
    }
}
