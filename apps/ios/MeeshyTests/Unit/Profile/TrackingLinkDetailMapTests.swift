import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Le détail d'un lien de suivi a sa carte des visiteurs et son « Modifier » (#19499, planche `Lien-Detail`).
@MainActor
final class TrackingLinkDetailMapTests: XCTestCase {

    private struct Refused: Error {}

    private static func link(name: String? = "Dakar", campaign: String? = "nuit", isActive: Bool = true) throws -> TrackingLink {
        var json: [String: Any] = [
            "id": "tl-1", "token": "dkr", "originalUrl": "https://meeshy.me", "shortUrl": "https://meeshy.me/l/dkr",
            "totalClicks": 12, "uniqueClicks": 9, "isActive": isActive, "createdAt": "2026-11-01T00:00:00Z"
        ]
        json["name"] = name
        json["campaign"] = campaign
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(TrackingLink.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private static func place(_ country: String, _ city: String?, _ count: Int) -> TrackingVisitorPlace {
        TrackingVisitorPlace(country: country, city: city, count: count)
    }

    private static func model(places: TrackingLinkPlaceStats? = nil,
                              update: @escaping @Sendable (String, TrackingLinkChanges) async throws -> TrackingLink = { _, _ in
                                  throw Refused()
                              }) -> TrackingDetailViewModel {
        TrackingDetailViewModel(token: "dkr", isActive: true, setActiveRemote: { _, _ in },
                                placesRemote: { _, _ in
                                    guard let places else { throw Refused() }
                                    return places
                                },
                                updateRemote: update,
                                locate: { place in
                                    TrackingVisitorZone(place: place, latitude: place.country == "SN" ? 14.7 : 48.8,
                                                        longitude: place.country == "SN" ? -17.4 : 2.3)
                                })
    }

    // MARK: - La carte

    func test_visitorMap_servedPlaces_areLocatedLargestFirst_withTheServedCountryCount() async {
        let served = TrackingLinkPlaceStats(countryCount: 31, clicksByPlace: [Self.place("FR", nil, 308),
                                                                              Self.place("SN", "Dakar", 488),
                                                                              Self.place("PT", "Lisbonne", 0)])
        let model = Self.model(places: served)

        await model.loadVisitorMap()

        let map = model.visitorMap
        XCTAssertEqual(map?.countryCount, 31)
        XCTAssertEqual(map?.zones.map(\.place.count), [488, 308], "une zone vide ne se dessine pas")
        XCTAssertEqual(map?.isLocating, false)
    }

    func test_visitorMap_serverWithoutPlaces_orFailing_leavesTheSectionAbsent() async {
        let older = Self.model(places: TrackingLinkPlaceStats(countryCount: nil, clicksByPlace: nil))
        await older.loadVisitorMap()
        XCTAssertNil(older.visitorMap, "un serveur antérieur à #19412 ne sert pas la carte : la section se tait")

        let failing = Self.model(places: nil)
        await failing.loadVisitorMap()
        XCTAssertNil(failing.visitorMap)
    }

    func test_visitorMap_withoutCountryCount_countsTheCountriesOfItsZones() {
        let places = [Self.place("SN", "Dakar", 3), Self.place("SN", "Thiès", 2), Self.place("FR", nil, 1)]
        let count = TrackingVisitorMapLayout.countryCount(TrackingLinkPlaceStats(countryCount: nil, clicksByPlace: places),
                                                          places: places)
        XCTAssertEqual(count, 2)
    }

    func test_visitorMap_keepsTwelveZonesAtMost() {
        let places = (1...20).map { Self.place("FR", "Ville \($0)", $0) }
        let shown = TrackingVisitorMapLayout.shown(places)
        XCTAssertEqual(shown.count, 12)
        XCTAssertEqual(shown.first?.count, 20)
    }

    func test_bubbles_arePlacedByTheMapProjection_andAZoneOutOfViewIsNotDrawn() {
        let viewport = LocationMapViewport(centerLatitude: 14.7, centerLongitude: -17.4, latitudeDelta: 2,
                                           longitudeDelta: 2, width: 300, height: 240)
        let dakar = TrackingVisitorZone(place: Self.place("SN", "Dakar", 488), latitude: 14.7, longitude: -17.4)
        let paris = TrackingVisitorZone(place: Self.place("FR", "Paris", 308), latitude: 48.8, longitude: 2.3)

        let points = TrackingVisitorMapLayout.points([dakar, paris], in: viewport)

        XCTAssertEqual(points.map(\.id), ["SN|Dakar"], "Paris est hors de la carte")
        XCTAssertEqual(points.first?.position ?? 0, 0.5, accuracy: 0.001)
        XCTAssertEqual(points.first?.elevation ?? 0, 0.5, accuracy: 0.001)
        XCTAssertEqual(points.first?.value, 488)
        XCTAssertEqual(points.first?.spoken, TrackingDetailCopy.zoneClicks(TrackingVisitorMapLayout.name(dakar.place), 488))
    }

    // MARK: - Modifier

    func test_draft_sendsOnlyWhatChanged_andAnEmptiedFieldErasesIt() throws {
        let link = try Self.link()
        var draft = TrackingLinkEditDraft(link: link)
        XCTAssertFalse(draft.hasChanges(from: link))

        draft.name = "  Dakar nuit  "
        draft.campaign = ""
        draft.isActive = false

        let changes = draft.changes(from: link)
        XCTAssertEqual(changes, TrackingLinkChanges(name: .some("Dakar nuit"), campaign: .some(nil), isActive: false))
        XCTAssertTrue(draft.hasChanges(from: link))
    }

    func test_save_showsTheChangesAtOnce_thenAdoptsWhatTheServerKept() async throws {
        let link = try Self.link()
        let served = try Self.link(name: "Dakar nuit", campaign: nil, isActive: false)
        let model = Self.model(update: { _, _ in served })

        let saved = await model.save(TrackingLinkChanges(name: .some("Dakar nuit"), campaign: .some(nil), isActive: false),
                                     from: link)

        XCTAssertEqual(saved, .saved)
        XCTAssertEqual(model.edited?.name, "Dakar nuit")
        XCTAssertNil(model.edited?.campaign)
        XCTAssertFalse(model.isActive)
    }

    func test_save_refused_putsTheScreenBackAsItWas() async throws {
        let link = try Self.link()
        let model = Self.model()

        let saved = await model.save(TrackingLinkChanges(name: .some("Autre"), isActive: false), from: link)

        XCTAssertEqual(saved, .refused)
        XCTAssertNil(model.edited, "le serveur a refusé : l'écran revient au lien ouvert")
        XCTAssertTrue(model.isActive)
    }

    func test_save_byAnOlderServerThatIgnoresTheName_saysSo() async throws {
        let link = try Self.link()
        let unchanged = try Self.link()
        let model = Self.model(update: { _, _ in unchanged })

        let saved = await model.save(TrackingLinkChanges(name: .some("Autre")), from: link)

        XCTAssertEqual(saved, .partlyRetained)
        XCTAssertEqual(model.edited?.name, "Dakar", "l'écran montre ce que le serveur a retenu")
    }

    // MARK: - L'écran est fait du kit

    func test_detail_hasItsEditGesture_itsVisitorMap_andDrawsTheBubblesWithK50() throws {
        let detail = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Links/Views/TrackingLinkDetailView.swift"))
        XCTAssertTrue(detail.contains("title: TrackingDetailCopy.edit"), "« Modifier » est dans la rangée Copier · QR · Partager")
        XCTAssertTrue(detail.contains("visitorMapSection"))
        let map = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Links/Views/TrackingLinkDetailView+Map.swift"))
        XCTAssertTrue(map.contains("MeeshyChart(kind: .bubbles"), "les bulles sont K50, jamais redessinées sur place")
        XCTAssertTrue(map.contains("LocationMapCanvas("), "le fond est la carte nue partagée")
        XCTAssertFalse(map.contains("Circle()"), "aucune bulle redessinée sur place (loi 12)")
    }
}
