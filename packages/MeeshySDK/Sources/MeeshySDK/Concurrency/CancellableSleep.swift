public func cancellableSleep(for duration: Duration) async -> Bool {
    do {
        try await Task.sleep(for: duration)
        return true
    } catch {
        return false
    }
}
