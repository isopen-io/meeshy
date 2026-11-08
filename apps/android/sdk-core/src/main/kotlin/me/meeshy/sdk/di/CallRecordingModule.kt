package me.meeshy.sdk.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.call.CallRecordingCapturer
import me.meeshy.sdk.call.CallRecordingEncryptionGate
import me.meeshy.sdk.call.CallRecordingSignals
import me.meeshy.sdk.call.CallRecordingUploader
import me.meeshy.sdk.call.CallRecordingViewer
import me.meeshy.sdk.call.ConversationCallRecordingEncryptionGate
import me.meeshy.sdk.call.SessionCallRecordingViewer
import me.meeshy.sdk.call.SocketCallRecordingSignals
import me.meeshy.sdk.call.DeviceCallRecordingCapturer
import me.meeshy.sdk.call.TusCallRecordingUploader

/**
 * Les coutures du contrôleur d'enregistrement d'appel : la capture (micro + voix des autres, et l'écran en vidéo
 * quand une projection a été accordée — [me.meeshy.sdk.call.CallRecordingProjectionSource], liée par
 * `:feature:calls`) et le dépôt du fichier par TUS.
 */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class CallRecordingBindingsModule {
    @Binds abstract fun signals(impl: SocketCallRecordingSignals): CallRecordingSignals

    @Binds abstract fun viewer(impl: SessionCallRecordingViewer): CallRecordingViewer

    @Binds abstract fun encryption(impl: ConversationCallRecordingEncryptionGate): CallRecordingEncryptionGate

    @Binds abstract fun capturer(impl: DeviceCallRecordingCapturer): CallRecordingCapturer

    @Binds abstract fun uploader(impl: TusCallRecordingUploader): CallRecordingUploader
}
