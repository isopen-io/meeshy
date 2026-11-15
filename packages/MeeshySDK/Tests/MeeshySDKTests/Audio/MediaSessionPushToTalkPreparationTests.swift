#if os(iOS) && DEBUG
import AVFoundation
import Foundation
import Testing
@testable import MeeshySDK

/// **Le réveil PushToTalk du talkie pose `.playAndRecord` sur la file de
/// session** (#17143, #17038). Le système n'active la session que dans cette
/// catégorie : appelée hors du fil principal (le délégué du framework), la
/// pose est faite quand l'appel rend la main ; appelée du fil principal, elle
/// se met en file sans jamais y écrire.
@MainActor
struct MediaSessionPushToTalkPreparationTests {

    private func makeSUT() -> (MediaSessionCoordinator, RecordingAudioSession) {
        let session = RecordingAudioSession()
        return (MediaSessionCoordinator.makeForTesting(session: session, leaseNotificationCenter: NotificationCenter()), session)
    }

    private static let expected = RecordingAudioSession.Call.setCategory(
        .playAndRecord, .default, [.defaultToSpeaker, .allowBluetoothHFP]
    )

    @Test func offTheMainThread_theCategoryIsSetWhenTheCallReturns() async {
        let (sut, session) = makeSUT()

        let callsWhenReturned = await Task.detached { () -> [RecordingAudioSession.Call] in
            sut.preparePushToTalkPlayAndRecord()
            return session.calls
        }.value

        #expect(callsWhenReturned == [Self.expected])
        #expect(session.writesOnMainThread == 0)
    }

    @Test func fromTheMainThread_theWriteIsQueued_neverMadeOnMain() async {
        let (sut, session) = makeSUT()
        sut.sessionQueue.suspend()

        sut.preparePushToTalkPlayAndRecord()
        let touchedBeforeReturn = session.calls

        sut.sessionQueue.resume()
        await sut.sessionSettled()
        #expect(touchedBeforeReturn.isEmpty)
        #expect(session.calls == [Self.expected])
        #expect(session.writesOnMainThread == 0)
    }

    @Test func anAlreadyPreparedSession_isNotRewritten() async {
        let (sut, session) = makeSUT()

        sut.preparePushToTalkPlayAndRecord()
        sut.preparePushToTalkPlayAndRecord()
        await sut.sessionSettled()

        #expect(session.calls == [Self.expected])
    }
}
#endif
