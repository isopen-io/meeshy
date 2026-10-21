import XCTest
@testable import MeeshySDK

final class LockedTests: XCTestCase {

    func test_mutate_returnsClosureValueAndLeavesNewStateReadable() {
        let locked = Locked(10)
        let returned = locked.mutate { state -> String in
            state += 5
            return "done"
        }
        XCTAssertEqual(returned, "done")
        XCTAssertEqual(locked.read { $0 }, 15)
    }

    func test_concurrentMutations_neverLoseAnIncrement() async {
        let locked = Locked(0)
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<1000 {
                group.addTask { locked.mutate { $0 += 1 } }
            }
        }
        XCTAssertEqual(locked.read { $0 }, 1000)
    }

    func test_copy_sharesTheOriginalLockAndState() {
        let original = Locked(1)
        let copy = original
        original.mutate { $0 = 42 }
        XCTAssertEqual(copy.read { $0 }, 42)
    }

    func test_mutateUnchecked_acceptsNonSendableState() {
        let locked = Locked(uncheckedState: NSMutableString(string: "a"))
        locked.mutateUnchecked { $0.append("b") }
        XCTAssertEqual(locked.mutateUnchecked { $0 as String }, "ab")
    }

    func test_uncheckedSubscript_readsAndWritesThroughKeyPath() {
        struct Box { var count = 0; var label = "a" }
        let locked = Locked(uncheckedState: Box())
        locked[unchecked: \.count] = 7
        locked[unchecked: \.label] = "b"
        XCTAssertEqual(locked[unchecked: \.count], 7)
        XCTAssertEqual(locked[unchecked: \.label], "b")
    }

    func test_uncheckedSubscript_supportsWeakReferenceKeyPath() {
        struct State { weak var target: NSObject? }
        let object = NSObject()
        let locked = Locked(uncheckedState: State())
        locked[unchecked: \.target] = object
        XCTAssertTrue(locked[unchecked: \.target] === object)
    }
}
