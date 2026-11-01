package me.meeshy.app.chat

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockedListRepository
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.share.ShareCard
import me.meeshy.sdk.model.share.ShareCardKind
import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import me.meeshy.sdk.model.PostShareTarget
import me.meeshy.sdk.post.PostShareLinkService
import me.meeshy.sdk.session.SessionRepository
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import kotlinx.coroutines.delay
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AppShareSheetViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val me = MeeshyUser(id = "me", username = "me")
    private val storyCard = ShareSubject.Card(
        ShareCard(ShareCardKind.STORY, "s1", "Story de Léa", "https://meeshy.me/s/1", "Story de Léa : https://meeshy.me/s/1"),
    )

    private fun group(id: String, title: String, encryptionMode: String? = null) =
        ApiConversation(id = id, type = "group", title = title, encryptionMode = encryptionMode)

    private fun direct(id: String, peer: String, name: String) = ApiConversation(
        id = id, type = "direct", title = name,
        participants = listOf(ApiParticipant(id = "p-me", userId = "me"), ApiParticipant(id = "p-$peer", userId = peer, displayName = name)),
    )

    private class Harness(
        val vm: AppShareSheetViewModel,
        val messages: MessageRepository,
        val conversations: ConversationRepository,
        val mediaQueue: MediaUploadQueue,
        val blocks: BlockCache,
        val online: MutableStateFlow<Boolean>,
        val links: PostShareLinkService,
    )

    private fun harness(
        currentUser: MeeshyUser? = me,
        sessionResolved: Boolean = true,
        list: List<ApiConversation> = listOf(group("c1", "Équipe"), direct("d1", "u1", "Léa")),
        friends: List<FriendRequestUser> = listOf(FriendRequestUser(id = "u9", username = "marc", displayName = "Marc")),
        resolution: DirectConversationResolution? = null,
        stream: kotlinx.coroutines.flow.Flow<CacheResult<List<ApiConversation>>> = flowOf(CacheResult.Fresh(list, ageMillis = 0)),
        outOfThread: OutOfThreadSendGate = OutOfThreadSendGate { OutOfThreadAdmission.SEND },
        trackedLink: String? = null,
    ): Harness {
        val links = mockk<PostShareLinkService>()
        coEvery { links.resolve(any(), any()) } returns
            if (trackedLink != null) PostShareTarget(trackedLink, tracked = true) else PostShareTarget("https://meeshy.me/feeds/post/x", tracked = false)
        val conversationRepo = mockk<ConversationRepository>(relaxed = true)
        every { conversationRepo.conversationsStream(any(), any()) } returns stream
        if (resolution != null) coEvery { conversationRepo.directConversationWith(any(), any()) } returns resolution
        val messages = mockk<MessageRepository>(relaxed = true)
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(currentUser)
        every { session.hasResolvedStoredSession } returns MutableStateFlow(sessionResolved)
        val mediaQueue = mockk<MediaUploadQueue>(relaxed = true)
        coEvery { mediaQueue.enqueue(any(), any(), any()) } returns "upload-cmid"
        val friendRepo = mockk<FriendListRepository>(relaxed = true)
        coEvery { friendRepo.cachedSnapshot() } returns friends
        val blockedRepo = mockk<BlockedListRepository>(relaxed = true)
        coEvery { blockedRepo.cachedSnapshot() } returns null
        val blocks = BlockCache()
        val online = MutableStateFlow(true)
        val network = mockk<NetworkMonitor>(relaxed = true)
        every { network.isOnline } returns online
        val vm = AppShareSheetViewModel(conversationRepo, messages, session, mockk<WorkManager>(relaxed = true), mediaQueue, friendRepo, blockedRepo, blocks, network, outOfThread, links)
        return Harness(vm, messages, conversationRepo, mediaQueue, blocks, online, links)
    }

    private fun Harness.model() = vm.model(vm.state.value)

    @Test
    fun the_sheet_paints_recents_first_then_conversations_and_friends_without_a_conversation() = runTest(dispatcher) {
        val h = harness()
        h.vm.bind(storyCard)
        advanceUntilIdle()

        val sections = h.model().sections
        assertThat(sections.recents.map { it.id }).containsExactly("conv:c1", "conv:d1").inOrder()
        assertThat(sections.people.map { it.id }).containsExactly("user:u9")
    }

    @Test
    fun typing_hides_recents_and_a_blocked_friend_is_never_offered() = runTest(dispatcher) {
        val h = harness(friends = listOf(FriendRequestUser(id = "u9", username = "marc"), FriendRequestUser(id = "u8", username = "mara")))
        h.blocks.setBlocked("u8", true)
        h.vm.bind(storyCard)
        advanceUntilIdle()

        h.vm.onQueryChange("mar")
        val sections = h.model().sections
        assertThat(sections.recents).isEmpty()
        assertThat(sections.people.map { it.id }).containsExactly("user:u9")
    }

    @Test
    fun a_card_leaves_as_its_composed_text_in_two_gestures_and_the_first_served_names_the_confirmation() = runTest(dispatcher) {
        val h = harness()
        h.vm.bind(storyCard)
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.recents.first())
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 1) {
            h.messages.sendOptimistic(conversationId = "c1", content = "Story de Léa : https://meeshy.me/s/1", originalLanguage = any(), sender = me, forwardedFromId = null, forwardedFromConversationId = null, effects = any())
        }
        assertThat(h.model().deliveries["conv:c1"]).isEqualTo(ShareDelivery.Sent)
        assertThat(h.model().firstServed?.conversationId).isEqualTo("c1")
    }

    @Test
    fun a_public_story_leaves_with_the_senders_tracked_link_minted_once_when_the_sheet_opens() = runTest(dispatcher) {
        val h = harness(trackedLink = "https://meeshy.me/l/tok")
        val publicStory = ShareSubject.Card(storyCard.card.copy(isPublicStory = true))
        h.vm.bind(publicStory)
        advanceUntilIdle()

        assertThat(h.model().contentLines).containsExactly("Story de Léa : https://meeshy.me/l/tok")
        h.vm.toggle(h.model().sections.recents.first())
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 1) { h.links.resolve("s1", "meeshy") }
        coVerify(exactly = 1) {
            h.messages.sendOptimistic(conversationId = "c1", content = "Story de Léa : https://meeshy.me/l/tok", originalLanguage = any(), sender = me, forwardedFromId = null, forwardedFromConversationId = null, effects = any())
        }
    }

    @Test
    fun a_friends_story_never_mints_a_link_that_opens_without_an_account() = runTest(dispatcher) {
        val h = harness(trackedLink = "https://meeshy.me/l/tok")
        h.vm.bind(storyCard)
        advanceUntilIdle()

        assertThat(h.model().contentLines).containsExactly("Story de Léa : https://meeshy.me/s/1")
        coVerify(exactly = 0) { h.links.resolve(any(), any()) }
    }

    @Test
    fun one_piece_leaves_alone_naming_only_that_piece_and_never_a_sealed_one() = runTest(dispatcher) {
        val photo = { id: String, sealed: Boolean? -> ApiMessageAttachment(id = id, mimeType = "image/jpeg", isEncrypted = sealed) }
        val carrier = ApiMessage(
            id = "m1", conversationId = "src", content = "le texte", originalLanguage = "fr",
            attachments = listOf(photo("a", null), photo("b", null)),
        )
        val h = harness()
        h.vm.bind(ShareSubject.Piece(carrier, "b", "src"))
        advanceUntilIdle()
        h.vm.toggle(h.model().sections.recents.first())
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 1) {
            h.messages.sendOptimistic(
                conversationId = "c1", content = "", originalLanguage = any(), sender = me, forwardedFromId = "m1",
                forwardedFromConversationId = "src", effects = any(), forwardedAttachmentIds = listOf("b"),
            )
        }

        val sealed = harness()
        sealed.vm.bind(ShareSubject.Piece(carrier.copy(attachments = listOf(photo("a", true))), "a", "src"))
        advanceUntilIdle()
        sealed.vm.toggle(sealed.model().sections.recents.first())
        sealed.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { sealed.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun a_second_tap_on_send_never_sends_the_same_copy_twice() = runTest(dispatcher) {
        val h = harness()
        h.vm.bind(storyCard)
        advanceUntilIdle()
        h.vm.toggle(h.model().sections.recents.first())

        h.vm.send()
        h.vm.send()
        advanceUntilIdle()
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 1) { h.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun a_friend_without_conversation_gets_the_direct_created_at_send_and_the_message_goes_there() = runTest(dispatcher) {
        val created = direct("new-direct", "u9", "Marc")
        val h = harness(resolution = DirectConversationResolution.Created(created))
        h.vm.bind(ShareSubject.Link("https://meeshy.me/p/1"))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.people.single())
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 1) { h.messages.sendOptimistic(conversationId = "new-direct", content = "https://meeshy.me/p/1", originalLanguage = any(), sender = me, forwardedFromId = null, forwardedFromConversationId = null, effects = any()) }
        assertThat(h.model().firstServed?.conversationId).isEqualTo("new-direct")
        assertThat(h.model().firstServed?.recipient?.title).isEqualTo("Marc")
    }

    @Test
    fun a_direct_that_is_end_to_end_encrypted_receives_nothing_in_clear() = runTest(dispatcher) {
        val sealed = direct("sealed", "u9", "Marc").copy(encryptionMode = "e2ee")
        val h = harness(resolution = DirectConversationResolution.Found(sealed, fromCache = true))
        h.vm.bind(ShareSubject.Text("secret"))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.people.single())
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(h.model().deliveries["user:u9"]).isEqualTo(ShareDelivery.Failed(ShareFailure.SEALED_DESTINATION))
    }

    @Test
    fun a_person_who_cannot_be_reached_offline_fails_on_their_own_row_only() = runTest(dispatcher) {
        val h = harness(resolution = DirectConversationResolution.Failed(ApiError("offline"), offline = true))
        h.vm.bind(ShareSubject.Text("coucou"))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.people.single())
        h.vm.toggle(h.model().sections.recents.first())
        h.vm.send()
        advanceUntilIdle()

        assertThat(h.model().deliveries["user:u9"]).isEqualTo(ShareDelivery.Failed(ShareFailure.UNREACHABLE))
        assertThat(h.model().deliveries["conv:c1"]).isEqualTo(ShareDelivery.Sent)
    }

    @Test
    fun a_destination_that_became_end_to_end_before_send_receives_nothing() = runTest(dispatcher) {
        val stream = MutableStateFlow<CacheResult<List<ApiConversation>>>(CacheResult.Fresh(listOf(group("c1", "Équipe")), ageMillis = 0))
        val h = harness(stream = stream)
        h.vm.bind(ShareSubject.Text("hello"))
        advanceUntilIdle()
        h.vm.toggle(h.model().sections.recents.first())

        stream.value = CacheResult.Fresh(listOf(group("c1", "Équipe", "e2ee")), ageMillis = 0)
        advanceUntilIdle()
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(h.model().deliveries["conv:c1"]).isEqualTo(ShareDelivery.Failed(ShareFailure.SEALED_DESTINATION))
    }

    @Test
    fun without_a_signed_in_user_nothing_is_sent() = runTest(dispatcher) {
        val h = harness(currentUser = null)
        h.vm.bind(ShareSubject.Text("hello"))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.recents.firstOrNull() ?: return@runTest)
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun a_cold_share_waits_for_the_session_and_never_says_sign_in_by_mistake() = runTest(dispatcher) {
        val loading = harness(currentUser = null, sessionResolved = false)
        loading.vm.bind(ShareSubject.Text("x"))
        advanceUntilIdle()
        assertThat(loading.model().isSessionLoading).isTrue()
        assertThat(loading.model().isSignedOut).isFalse()

        val signedOut = harness(currentUser = null, sessionResolved = true)
        signedOut.vm.bind(ShareSubject.Text("x"))
        advanceUntilIdle()
        assertThat(signedOut.model().isSignedOut).isTrue()
    }

    @Test
    fun the_offline_banner_follows_the_network() = runTest(dispatcher) {
        val h = harness()
        h.vm.bind(storyCard)
        advanceUntilIdle()
        assertThat(h.model().isOffline).isFalse()

        h.online.value = false
        advanceUntilIdle()
        assertThat(h.model().isOffline).isTrue()
    }

    @Test
    fun files_from_another_app_leave_one_message_each_with_the_received_text_on_the_first_to_every_recipient() = runTest(dispatcher) {
        val h = harness()
        h.vm.bindIncoming("regarde", listOf(file("a.png", "image/png"), file("b.pdf", "application/pdf")))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.recents[0])
        h.vm.toggle(h.model().sections.recents[1])
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 4) { h.mediaQueue.enqueue(any<MediaUploadItem>(), any(), any()) }
        coVerify(exactly = 1) { h.messages.sendOptimistic(conversationId = "c1", content = "regarde", originalLanguage = any(), sender = me, messageType = "image", attachmentUploadCmids = any(), attachments = any()) }
        coVerify(exactly = 1) { h.messages.sendOptimistic(conversationId = "d1", content = "regarde", originalLanguage = any(), sender = me, messageType = "image", attachmentUploadCmids = any(), attachments = any()) }
        coVerify(exactly = 1) { h.messages.sendOptimistic(conversationId = "c1", content = "", originalLanguage = any(), sender = me, messageType = "file", attachmentUploadCmids = any(), attachments = any()) }
        assertThat(h.model().deliveries.values).containsExactly(ShareDelivery.Sent, ShareDelivery.Sent)
    }

    @Test
    fun a_mixed_selection_of_photo_video_and_document_leaves_one_typed_message_each_and_the_document_stays_a_file() = runTest(dispatcher) {
        val h = harness()
        h.vm.bindIncoming(null, listOf(file("a.jpg", "image/jpeg"), file("b.mp4", "video/mp4"), file("contrat.pdf", "application/pdf"), file("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.recents[0])
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 1) { h.messages.sendOptimistic(conversationId = "c1", content = any(), originalLanguage = any(), sender = me, messageType = "image", attachmentUploadCmids = any(), attachments = any()) }
        coVerify(exactly = 1) { h.messages.sendOptimistic(conversationId = "c1", content = any(), originalLanguage = any(), sender = me, messageType = "video", attachmentUploadCmids = any(), attachments = any()) }
        coVerify(exactly = 2) { h.messages.sendOptimistic(conversationId = "c1", content = any(), originalLanguage = any(), sender = me, messageType = "file", attachmentUploadCmids = any(), attachments = match { it.single().mimeType in setOf("application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document") && it.single().fileName?.contains('.') == true }) }
        assertThat(h.model().deliveries.values).containsExactly(ShareDelivery.Sent)
    }

    @Test
    fun a_document_in_the_selection_keeps_the_studio_offer_away_but_photos_and_videos_keep_it() {
        assertThat(studioCanEdit(listOf(file("a.jpg", "image/jpeg"), file("b.mp4", "video/mp4")))).isTrue()
        assertThat(studioCanEdit(listOf(file("a.jpg", "image/jpeg"), file("c.pdf", "application/pdf")))).isFalse()
        assertThat(studioCanEdit(listOf(file("c.pdf", "application/pdf")))).isFalse()
        assertThat(studioCanEdit(emptyList())).isFalse()
    }

    @Test
    fun what_an_incoming_share_left_behind_is_said_in_the_sheet_and_forgotten_when_it_closes() = runTest(dispatcher) {
        val h = harness()
        h.vm.bindIncoming(null, listOf(file("a.pdf", "application/pdf")), notices = listOf("enorme.mov dépasse 50 Mo"))
        advanceUntilIdle()

        assertThat(h.model().notices).containsExactly("enorme.mov dépasse 50 Mo")

        h.vm.reset()
        assertThat(h.vm.state.value.notices).isEmpty()
    }

    @Test
    fun an_incoming_share_with_nothing_cannot_be_sent() = runTest(dispatcher) {
        val h = harness()
        h.vm.bindIncoming(null, emptyList())
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.recents.first())
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun resetting_forgets_the_subject_so_the_next_door_starts_clean() = runTest(dispatcher) {
        val h = harness()
        h.vm.bind(storyCard)
        advanceUntilIdle()
        h.vm.toggle(h.model().sections.recents.first())

        h.vm.reset()

        assertThat(h.vm.state.value.subject).isNull()
        assertThat(h.vm.state.value.sheet.selection).isEmpty()
    }

    @Test
    fun a_person_blocked_after_being_selected_receives_nothing_and_no_direct_is_created() = runTest(dispatcher) {
        val h = harness(resolution = DirectConversationResolution.Created(direct("new-direct", "u9", "Marc")))
        h.vm.bind(ShareSubject.Text("coucou"))
        advanceUntilIdle()
        h.vm.toggle(h.model().sections.people.single())

        h.blocks.setBlocked("u9", true)
        advanceUntilIdle()
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.conversations.directConversationWith(any(), any()) }
        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(h.vm.state.value.sheet.selection).isEmpty()
    }

    @Test
    fun an_existing_direct_whose_peer_is_blocked_after_selection_receives_nothing() = runTest(dispatcher) {
        val h = harness()
        h.vm.bind(ShareSubject.Text("coucou"))
        advanceUntilIdle()
        h.vm.toggle(h.model().sections.recents.single { it.conversationId == "d1" })

        h.blocks.setBlocked("u1", true)
        advanceUntilIdle()
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun a_peer_blocked_while_their_direct_is_being_resolved_receives_nothing() = runTest(dispatcher) {
        val h = harness()
        coEvery { h.conversations.directConversationWith(any(), any()) } coAnswers {
            h.blocks.setBlocked("u9", true)
            DirectConversationResolution.Found(direct("d9", "u9", "Marc"), fromCache = true)
        }
        h.vm.bind(ShareSubject.Text("coucou"))
        advanceUntilIdle()
        h.vm.toggle(h.model().sections.people.single())

        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(h.model().deliveries["user:u9"]).isInstanceOf(ShareDelivery.Failed::class.java)
    }

    @Test
    fun closing_the_sheet_right_after_send_still_delivers_every_recipient_and_frees_the_received_copy_afterwards() = runTest(dispatcher) {
        val h = harness()
        coEvery { h.conversations.directConversationWith(any(), any()) } coAnswers {
            delay(5_000)
            DirectConversationResolution.Created(direct("new-direct", "u9", "Marc"))
        }
        val store = ViewModelStore()
        val vm = ViewModelProvider(store, object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = h.vm as T
        })[AppShareSheetViewModel::class.java]
        val copy = intakeCopy()
        val existedAtEnqueue = mutableListOf<Boolean>()
        coEvery { h.mediaQueue.enqueue(any(), any(), any()) } coAnswers {
            existedAtEnqueue += copy.exists()
            "upload-cmid"
        }
        vm.bindIncoming("regarde", listOf(MediaUploadItem.onDisk(copy, "a.png", "image/png")))
        advanceUntilIdle()
        vm.toggle(vm.model(vm.state.value).sections.recents.first())
        vm.toggle(vm.model(vm.state.value).sections.people.single())

        vm.send()
        store.clear()
        advanceUntilIdle()

        coVerify(exactly = 1) { h.messages.sendOptimistic(conversationId = "c1", content = "regarde", originalLanguage = any(), sender = me, messageType = "image", attachmentUploadCmids = any(), attachments = any()) }
        coVerify(exactly = 1) { h.messages.sendOptimistic(conversationId = "new-direct", content = "regarde", originalLanguage = any(), sender = me, messageType = "image", attachmentUploadCmids = any(), attachments = any()) }
        assertThat(existedAtEnqueue).containsExactly(true, true)
        assertThat(copy.exists()).isFalse()
    }

    // ── #13820 — le mode de la destination est relu avant toute mise en file ──

    @Test
    fun a_conversation_the_cache_still_calls_server_but_the_server_serves_end_to_end_receives_nothing() = runTest(dispatcher) {
        val gated = mutableListOf<String>()
        val h = harness(outOfThread = OutOfThreadSendGate { id -> gated += id; if (id == "c1") OutOfThreadAdmission.END_TO_END else OutOfThreadAdmission.SEND })
        h.vm.bind(ShareSubject.Text("secret"))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.recents[0])
        h.vm.toggle(h.model().sections.recents[1])
        h.vm.send()
        advanceUntilIdle()

        assertThat(gated).containsExactly("c1", "d1").inOrder()
        coVerify(exactly = 0) { h.messages.sendOptimistic(conversationId = "c1", content = any(), originalLanguage = any(), sender = any(), forwardedFromId = any(), forwardedFromConversationId = any(), effects = any()) }
        coVerify(exactly = 1) { h.messages.sendOptimistic(conversationId = "d1", content = "secret", originalLanguage = any(), sender = me, forwardedFromId = null, forwardedFromConversationId = null, effects = any()) }
        assertThat(h.model().deliveries["conv:c1"]).isEqualTo(ShareDelivery.Failed(ShareFailure.SEALED_DESTINATION))
        assertThat(h.model().deliveries["conv:d1"]).isEqualTo(ShareDelivery.Sent)
    }

    @Test
    fun the_modes_of_every_recipient_are_read_together_within_the_bound_of_a_single_gesture() = runTest(dispatcher) {
        val h = harness(outOfThread = OutOfThreadSendGate { delay(2_000); OutOfThreadAdmission.SEND })
        h.vm.bind(ShareSubject.Text("secret"))
        advanceUntilIdle()
        val started = testScheduler.currentTime

        h.vm.toggle(h.model().sections.recents[0])
        h.vm.toggle(h.model().sections.recents[1])
        h.vm.send()
        advanceUntilIdle()

        assertThat(testScheduler.currentTime - started).isAtMost(2_000)
        assertThat(h.model().deliveries["conv:c1"]).isEqualTo(ShareDelivery.Sent)
        assertThat(h.model().deliveries["conv:d1"]).isEqualTo(ShareDelivery.Sent)
    }

    @Test
    fun files_shared_to_a_conversation_turned_end_to_end_are_never_queued_for_upload() = runTest(dispatcher) {
        val h = harness(outOfThread = OutOfThreadSendGate { OutOfThreadAdmission.END_TO_END })
        h.vm.bindIncoming("regarde", listOf(file("a.png", "image/png")))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.recents[0])
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.mediaQueue.enqueue(any<MediaUploadItem>(), any(), any()) }
        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(h.model().deliveries["conv:c1"]).isEqualTo(ShareDelivery.Failed(ShareFailure.SEALED_DESTINATION))
    }

    @Test
    fun a_conversation_the_gateway_no_longer_serves_receives_nothing() = runTest(dispatcher) {
        val h = harness(outOfThread = OutOfThreadSendGate { OutOfThreadAdmission.UNREACHABLE })
        h.vm.bindIncoming(null, listOf(file("a.png", "image/png")))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.recents[0])
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.mediaQueue.enqueue(any<MediaUploadItem>(), any(), any()) }
        assertThat(h.model().deliveries["conv:c1"]).isEqualTo(ShareDelivery.Failed(ShareFailure.UNREACHABLE))
    }

    @Test
    fun a_mode_that_cannot_be_read_now_queues_the_share_until_it_is_known_and_says_it_waits() = runTest(dispatcher) {
        val h = harness(outOfThread = OutOfThreadSendGate { OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN })
        h.vm.bindIncoming("regarde", listOf(file("a.png", "image/png")))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.recents[0])
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 1) { h.mediaQueue.enqueue(any<MediaUploadItem>(), any(), "c1") }
        coVerify(exactly = 1) { h.messages.sendOptimistic(conversationId = "c1", content = "regarde", originalLanguage = any(), sender = me, messageType = "image", attachmentUploadCmids = any(), attachments = any()) }
        assertThat(h.model().deliveries["conv:c1"]).isEqualTo(ShareDelivery.Queued)
    }

    @Test
    fun the_direct_found_for_a_person_is_read_again_before_anything_is_queued() = runTest(dispatcher) {
        val gated = mutableListOf<String>()
        val h = harness(
            resolution = DirectConversationResolution.Found(direct("d-cached", "u9", "Marc"), fromCache = true),
            outOfThread = OutOfThreadSendGate { id -> gated += id; OutOfThreadAdmission.END_TO_END },
        )
        h.vm.bind(ShareSubject.Text("secret"))
        advanceUntilIdle()

        h.vm.toggle(h.model().sections.people.single())
        h.vm.send()
        advanceUntilIdle()

        assertThat(gated).containsExactly("d-cached")
        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(h.model().deliveries["user:u9"]).isEqualTo(ShareDelivery.Failed(ShareFailure.SEALED_DESTINATION))
    }

    private fun intakeCopy(): File {
        val dir = File(kotlin.io.path.createTempDirectory("share").toFile(), "media-intake").apply { mkdirs(); deleteOnExit() }
        return File(dir, "copy").apply { writeText("x"); deleteOnExit() }
    }

    private fun file(name: String, mime: String): MediaUploadItem =
        MediaUploadItem.onDisk(File.createTempFile("shared", ".bin").apply { writeText("x"); deleteOnExit() }, name, mime)
}
