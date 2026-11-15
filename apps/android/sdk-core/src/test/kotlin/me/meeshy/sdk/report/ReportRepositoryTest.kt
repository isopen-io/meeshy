package me.meeshy.sdk.report

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.report.CreateReportRequest
import me.meeshy.sdk.model.report.ReportAck
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ReportApi
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * [ReportRepository] gates on an active session, projects the report through the pure builder, and
 * delivers it online. No session (or a blank id) is inert — no network call, `null` returned — so
 * the ViewModel can surface the right state instead of firing a guaranteed `401`.
 */
class ReportRepositoryTest {

    private fun repo(session: SessionRepository, api: ReportApi) =
        ReportRepository(reportApi = api, sessionRepository = session)

    private fun sessionWith(userId: String?): SessionRepository {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns userId
        return session
    }

    @Test
    fun `reportUser delivers the built request and returns success`() = runTest {
        val api = mockk<ReportApi>()
        val captured = slot<CreateReportRequest>()
        coEvery { api.create(capture(captured)) } returns ApiResponse(success = true, data = ReportAck(id = "r1"))

        val result = repo(sessionWith("me"), api).reportUser("u9", ReportReason.HARASSMENT, "  was abusive  ")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(captured.captured.reportedType).isEqualTo("user")
        assertThat(captured.captured.reportedEntityId).isEqualTo("u9")
        assertThat(captured.captured.reportType).isEqualTo("harassment")
        assertThat(captured.captured.reason).isEqualTo("was abusive")
    }

    @Test
    fun `reportUser surfaces a network failure`() = runTest {
        val api = mockk<ReportApi>()
        coEvery { api.create(any()) } returns ApiResponse(success = false, error = "boom")

        val result = repo(sessionWith("me"), api).reportUser("u9", ReportReason.SPAM, null)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `reportUser is inert with no active session`() = runTest {
        val api = mockk<ReportApi>(relaxed = true)

        val result = repo(sessionWith(null), api).reportUser("u9", ReportReason.SPAM, "x")

        assertThat(result).isNull()
        coVerify(exactly = 0) { api.create(any()) }
    }

    @Test
    fun `reportUser is inert with a blank session id`() = runTest {
        val api = mockk<ReportApi>(relaxed = true)

        val result = repo(sessionWith("   "), api).reportUser("u9", ReportReason.SPAM, "x")

        assertThat(result).isNull()
        coVerify(exactly = 0) { api.create(any()) }
    }

    @Test
    fun `reportUser is inert when the target id is blank`() = runTest {
        val api = mockk<ReportApi>(relaxed = true)

        val result = repo(sessionWith("me"), api).reportUser("   ", ReportReason.SPAM, "x")

        assertThat(result).isNull()
        coVerify(exactly = 0) { api.create(any()) }
    }

    @Test
    fun `reportMessage delivers a message-typed request and returns success`() = runTest {
        val api = mockk<ReportApi>()
        val captured = slot<CreateReportRequest>()
        coEvery { api.create(capture(captured)) } returns ApiResponse(success = true, data = ReportAck(id = "r2"))

        val result = repo(sessionWith("me"), api).reportMessage("m7", ReportReason.HATE_SPEECH, "  a slur  ")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(captured.captured.reportedType).isEqualTo("message")
        assertThat(captured.captured.reportedEntityId).isEqualTo("m7")
        assertThat(captured.captured.reportType).isEqualTo("hate_speech")
        assertThat(captured.captured.reason).isEqualTo("a slur")
    }

    @Test
    fun `reportMessage surfaces a network failure`() = runTest {
        val api = mockk<ReportApi>()
        coEvery { api.create(any()) } returns ApiResponse(success = false, error = "boom")

        val result = repo(sessionWith("me"), api).reportMessage("m7", ReportReason.VIOLENCE, null)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `reportMessage is inert with no active session`() = runTest {
        val api = mockk<ReportApi>(relaxed = true)

        val result = repo(sessionWith(null), api).reportMessage("m7", ReportReason.SPAM, "x")

        assertThat(result).isNull()
        coVerify(exactly = 0) { api.create(any()) }
    }

    @Test
    fun `reportMessage is inert when the message id is blank`() = runTest {
        val api = mockk<ReportApi>(relaxed = true)

        val result = repo(sessionWith("me"), api).reportMessage("   ", ReportReason.SPAM, "x")

        assertThat(result).isNull()
        coVerify(exactly = 0) { api.create(any()) }
    }

    private class RecordingEmitter : ReportSignalEmitter {
        val emitted = mutableListOf<Triple<ReportedSocialKind, String, String>>()
        override fun emitReported(kind: ReportedSocialKind, targetId: String, reasonCode: String) {
            emitted += Triple(kind, targetId, reasonCode)
        }
    }

    private fun okApi(captured: MutableList<CreateReportRequest> = mutableListOf()): ReportApi {
        val api = mockk<ReportApi>()
        coEvery { api.create(capture(captured)) } returns ApiResponse(success = true, data = ReportAck(id = "r"))
        return api
    }

    @Test
    fun `reportComment et reportConversation postent sur reports avec leur type`() = runTest {
        val sent = mutableListOf<CreateReportRequest>()
        val repo = repo(sessionWith("me"), okApi(sent))

        repo.reportComment("c1", ReportReason.HARASSMENT, "  rude ")
        repo.reportConversation("k1", ReportReason.SPAM, null)

        assertThat(sent.map { it.reportedType }).containsExactly("comment", "conversation").inOrder()
        assertThat(sent.map { it.reportedEntityId }).containsExactly("c1", "k1").inOrder()
        assertThat(sent.map { it.reportType }).containsExactly("harassment", "spam").inOrder()
        assertThat(sent.map { it.reason }).containsExactly("rude", null).inOrder()
    }

    @Test
    fun `reportComment et reportConversation sont inertes sans session ou sans identifiant`() = runTest {
        val api = mockk<ReportApi>(relaxed = true)

        assertThat(repo(sessionWith(null), api).reportComment("c1", ReportReason.SPAM, null)).isNull()
        assertThat(repo(sessionWith("me"), api).reportComment(" ", ReportReason.SPAM, null)).isNull()
        assertThat(repo(sessionWith(null), api).reportConversation("k1", ReportReason.SPAM, null)).isNull()
        assertThat(repo(sessionWith("me"), api).reportConversation("", ReportReason.SPAM, null)).isNull()
        coVerify(exactly = 0) { api.create(any()) }
    }

    @Test
    fun `un signalement abouti d un contenu social emet report_submit avec le seul code du motif`() = runTest {
        val emitter = RecordingEmitter()
        val repo = ReportRepository(okApi(), sessionWith("me"), emitter)

        repo.reportUser("u1", ReportReason.HARASSMENT, "texte libre secret")
        repo.reportPost("p1", ReportReason.SPAM, "autre texte")
        repo.reportStory("s1", ReportReason.INAPPROPRIATE, null)
        repo.reportComment("c1", ReportReason.OTHER, "encore")

        assertThat(emitter.emitted).containsExactly(
            Triple(ReportedSocialKind.PROFILE, "u1", "harassment"),
            Triple(ReportedSocialKind.POST, "p1", "spam"),
            Triple(ReportedSocialKind.STORY, "s1", "inappropriate"),
            Triple(ReportedSocialKind.COMMENT, "c1", "other"),
        ).inOrder()
        assertThat(emitter.emitted.flatMap { listOf(it.second, it.third) }.joinToString()).doesNotContain("libre")
    }

    @Test
    fun `un message ou une conversation signale n emet aucun signal`() = runTest {
        val emitter = RecordingEmitter()
        val repo = ReportRepository(okApi(), sessionWith("me"), emitter)

        repo.reportMessage("m1", ReportReason.SPAM, null)
        repo.reportConversation("k1", ReportReason.SPAM, null)

        assertThat(emitter.emitted).isEmpty()
    }

    @Test
    fun `un echec reseau n emet aucun signal`() = runTest {
        val emitter = RecordingEmitter()
        val api = mockk<ReportApi>()
        coEvery { api.create(any()) } returns ApiResponse(success = false, error = "boom")
        val repo = ReportRepository(api, sessionWith("me"), emitter)

        repo.reportUser("u1", ReportReason.SPAM, null)
        repo.reportPost("p1", ReportReason.SPAM, null)

        assertThat(emitter.emitted).isEmpty()
    }
}
