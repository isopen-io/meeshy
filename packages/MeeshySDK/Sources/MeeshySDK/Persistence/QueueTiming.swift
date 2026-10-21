enum QueueTiming {
    static let reconnectSettle: Duration = .seconds(2)
    static let drainSettle: Duration = .milliseconds(200)
    static let rebindPoll: Duration = .milliseconds(50)
}
