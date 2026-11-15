public struct WaiterTicket: Hashable, Sendable {
    fileprivate let rawValue: Int
}

public struct WaiterTable<Value: Sendable, Waiter: Sendable>: Sendable {
    private enum Entry {
        case enrolled
        case attached(Waiter)
        case settled(Value)
    }

    private var entries: [WaiterTicket: Entry] = [:]
    private var nextRawValue = 0

    public init() {}

    public var liveCount: Int {
        entries.values.filter(Self.isLive).count
    }

    public mutating func enroll() -> WaiterTicket {
        let ticket = WaiterTicket(rawValue: nextRawValue)
        nextRawValue += 1
        entries[ticket] = .enrolled
        return ticket
    }

    public mutating func attach(_ ticket: WaiterTicket, _ waiter: Waiter) -> Value? {
        switch entries[ticket] {
        case .enrolled:
            entries[ticket] = .attached(waiter)
            return nil
        case .settled(let value):
            entries[ticket] = nil
            return value
        case .attached, .none:
            return nil
        }
    }

    public mutating func cancel(_ ticket: WaiterTicket, with value: Value) -> Waiter? {
        switch entries[ticket] {
        case .enrolled:
            entries[ticket] = .settled(value)
            return nil
        case .attached(let waiter):
            entries[ticket] = nil
            return waiter
        case .settled, .none:
            return nil
        }
    }

    public mutating func resolveAll(with value: Value) -> [Waiter] {
        let liveTickets = entries.filter { Self.isLive($0.value) }.map(\.key).sorted { $0.rawValue < $1.rawValue }
        return liveTickets.compactMap { settle($0, with: value) }
    }

    public mutating func resolveLatest(with value: Value) -> (handed: Bool, waiter: Waiter?) {
        let latest = entries.filter { Self.isLive($0.value) }.map(\.key).max { $0.rawValue < $1.rawValue }
        guard let ticket = latest else { return (false, nil) }
        return (true, settle(ticket, with: value))
    }

    private mutating func settle(_ ticket: WaiterTicket, with value: Value) -> Waiter? {
        guard case .attached(let waiter) = entries[ticket] else {
            entries[ticket] = .settled(value)
            return nil
        }
        entries[ticket] = nil
        return waiter
    }

    private static func isLive(_ entry: Entry) -> Bool {
        switch entry {
        case .enrolled, .attached: return true
        case .settled: return false
        }
    }
}

public typealias ContinuationTable<Value: Sendable> = WaiterTable<Value, CheckedContinuation<Value, Never>>
