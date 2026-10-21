import os
import MeeshySDK

extension Logger {
    nonisolated static let messages = MeeshyLog.logger(.messages)
    nonisolated static let socket = MeeshyLog.logger(.socket)
    nonisolated static let e2ee = MeeshyLog.logger(.e2ee)
    nonisolated static let crash = MeeshyLog.logger(.crash)
    nonisolated static let network = MeeshyLog.logger(.network)
    nonisolated static let stories = MeeshyLog.logger(.stories)
    nonisolated static let navigation = MeeshyLog.logger(.navigation)
    nonisolated static let settings = MeeshyLog.logger(.settings)
    nonisolated static let webrtc = MeeshyLog.logger(.webrtc)
}
