import Testing
@testable import MeeshySDK

struct BoundedFIFOMapTests {

    @Test func subscript_insertAndRead_roundTrips() {
        var map = BoundedFIFOMap<String, Int>(capacity: 3)
        map["a"] = 1
        #expect(map["a"] == 1)
        #expect(map.count == 1)
    }

    @Test func subscript_updateExistingKey_doesNotGrowCount() {
        var map = BoundedFIFOMap<String, Int>(capacity: 3)
        map["a"] = 1
        map["a"] = 2
        #expect(map["a"] == 2)
        #expect(map.count == 1)
    }

    @Test func eviction_overCapacity_dropsOldestInsertion() {
        var map = BoundedFIFOMap<String, Int>(capacity: 2)
        map["a"] = 1
        map["b"] = 2
        map["c"] = 3
        #expect(map["a"] == nil)
        #expect(map["b"] == 2)
        #expect(map["c"] == 3)
        #expect(map.count == 2)
    }

    @Test func eviction_updateOfExistingKey_doesNotEvict() {
        var map = BoundedFIFOMap<String, Int>(capacity: 2)
        map["a"] = 1
        map["b"] = 2
        map["a"] = 10
        #expect(map["a"] == 10)
        #expect(map["b"] == 2)
        #expect(map.count == 2)
    }

    @Test func removeValue_purgesKeyFromOrder() {
        var map = BoundedFIFOMap<String, Int>(capacity: 2)
        map["a"] = 1
        let removed = map.removeValue(forKey: "a")
        #expect(removed == 1)
        #expect(map.isEmpty)
        // "a" supprimé ne doit plus compter dans l'ordre : deux nouvelles
        // insertions tiennent sans éviction fantôme.
        map["b"] = 2
        map["c"] = 3
        #expect(map["b"] == 2)
        #expect(map["c"] == 3)
    }

    @Test func removeValue_missingKey_returnsNil() {
        var map = BoundedFIFOMap<String, Int>(capacity: 2)
        #expect(map.removeValue(forKey: "ghost") == nil)
    }

    @Test func subscript_assignNil_removes() {
        var map = BoundedFIFOMap<String, Int>(capacity: 2)
        map["a"] = 1
        map["a"] = nil
        #expect(map["a"] == nil)
        #expect(map.isEmpty)
    }

    @Test func removeAll_clearsEverything() {
        var map = BoundedFIFOMap<String, Int>(capacity: 2)
        map["a"] = 1
        map["b"] = 2
        map.removeAll()
        #expect(map.isEmpty)
        map["c"] = 3
        #expect(map["c"] == 3)
    }

    @Test func capacity_clampedToMinimumOne() {
        var map = BoundedFIFOMap<String, Int>(capacity: 0)
        map["a"] = 1
        map["b"] = 2
        #expect(map.count == 1)
        #expect(map["b"] == 2)
    }
}
