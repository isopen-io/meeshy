import XCTest
@testable import MeeshySDK

private struct NumberedPayload: Decodable, Sendable {
    let n: Int
}

final class SocketPayloadDecoderDeliveryTests: XCTestCase {

    func test_decode_deliversInArrivalOrderOnMain() async {
        let received = Locked<[Int]>([])
        let deliveriesOffMain = Locked<Int>(0)
        let all = expectation(description: "50 livraisons")
        all.expectedFulfillmentCount = 50

        for index in 0..<50 {
            SocketPayloadDecoder.decode(NumberedPayload.self, from: [["n": index]]) { payload in
                received.mutate { $0.append(payload.n) }
                if !Thread.isMainThread { deliveriesOffMain.mutate { $0 += 1 } }
                all.fulfill()
            }
        }
        await fulfillment(of: [all], timeout: 5)

        XCTAssertEqual(received.read { $0 }, Array(0..<50))
        XCTAssertEqual(deliveriesOffMain.read { $0 }, 0)
    }

    /// Une `Task { @MainActor in }` par événement hérite de la priorité du fil appelant : un événement poussé depuis
    /// un fil `userInteractive` pouvait doubler celui, plus ancien, d'un fil `background`. L'ordre d'arrivée ne
    /// dépend pas de la priorité de qui l'a reçu.
    func test_decode_consecutiveEventsFromMixedPriorityCallers_deliverInArrivalOrder() async {
        let count = 200
        let received = Locked<[Int]>([])
        let all = expectation(description: "\(count) livraisons")
        all.expectedFulfillmentCount = count

        DispatchQueue(label: "test.socket.producer").async {
            for index in 0..<count {
                let qos: DispatchQoS.QoSClass = index.isMultiple(of: 2) ? .background : .userInteractive
                DispatchQueue.global(qos: qos).sync {
                    SocketPayloadDecoder.decode(NumberedPayload.self, from: [["n": index]]) { payload in
                        received.mutate { $0.append(payload.n) }
                        all.fulfill()
                    }
                }
            }
        }
        await fulfillment(of: [all], timeout: 10)

        XCTAssertEqual(received.read { $0 }, Array(0..<count))
    }

    func test_deliveryLane_runsConsecutiveDeliveriesFIFOOnMain() async {
        let lane = MainActorDeliveryLane()
        let count = 500
        let received = Locked<[Int]>([])
        let deliveriesOffMain = Locked<Int>(0)
        let all = expectation(description: "\(count) livraisons")
        all.expectedFulfillmentCount = count

        DispatchQueue(label: "test.lane.producer").async {
            for index in 0..<count {
                let qos: DispatchQoS.QoSClass = index.isMultiple(of: 2) ? .utility : .userInteractive
                DispatchQueue.global(qos: qos).sync {
                    lane.deliver {
                        received.mutate { $0.append(index) }
                        if !Thread.isMainThread { deliveriesOffMain.mutate { $0 += 1 } }
                        all.fulfill()
                    }
                }
            }
        }
        await fulfillment(of: [all], timeout: 10)

        XCTAssertEqual(received.read { $0 }, Array(0..<count))
        XCTAssertEqual(deliveriesOffMain.read { $0 }, 0)
    }

    func test_decode_emptyUnexpectedOrUndecodablePayload_deliversNothing() async {
        let silence = expectation(description: "aucune livraison")
        silence.isInverted = true

        SocketPayloadDecoder.decode(NumberedPayload.self, from: []) { _ in silence.fulfill() }
        SocketPayloadDecoder.decode(NumberedPayload.self, from: [42]) { _ in silence.fulfill() }
        SocketPayloadDecoder.decode(NumberedPayload.self, from: [["other": 1]]) { _ in silence.fulfill() }
        await fulfillment(of: [silence], timeout: 0.5)
    }
}
