package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import me.meeshy.sdk.call.CallMeshPeerConfig
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.SocketIceServer
import me.meeshy.sdk.model.call.group.ActiveSpeakerDetector
import me.meeshy.sdk.model.call.group.GroupCallArrival
import me.meeshy.sdk.model.call.group.GroupCallDirectory
import me.meeshy.sdk.model.call.group.GroupCallEvidence
import me.meeshy.sdk.model.call.group.GroupCallLinkState
import me.meeshy.sdk.model.call.group.GroupCallMediaKind
import me.meeshy.sdk.model.call.group.GroupCallRoster
import me.meeshy.sdk.model.call.group.GroupCallTitle
import me.meeshy.sdk.model.call.group.GroupSignalDestination
import me.meeshy.sdk.model.call.group.GroupSignalRouting
import me.meeshy.sdk.model.call.group.named
import org.webrtc.VideoTrack

/** Ce que la scène lit du maillage : le registre, et la vidéo reçue de chaque membre du maillage. */
data class GroupCallMeshUi(
    val isActive: Boolean = false,
    val roster: GroupCallRoster = GroupCallRoster(localUserId = ""),
    val primaryUserId: String? = null,
    val isPrimaryVacated: Boolean = false,
    val videoTracks: Map<String, VideoTrack> = emptyMap(),
    /** Qui parle maintenant (#13751) : le principal et les membres du maillage, jamais moi. */
    val speakingUserIds: Set<String> = emptySet(),
    /** Le nom de l'appel une fois le siège du principal libéré (#13754, iOS `retitleIfVacated`) ; `null` avant. */
    val title: GroupCallTitle? = null,
)

/** Ce que le maillage émet : un `call:signal` adressé à UN membre. */
internal fun interface GroupMeshSignalSender {
    fun send(callId: String, to: String, from: String, signal: GroupMeshSignal)
}

/**
 * LE MAILLAGE D'UN APPEL DE GROUPE (#13740) — une connexion par membre distant AUTRE que le pair principal que la
 * connexion de l'appel négocie déjà. Miroir de iOS `GroupCallMeshCoordinator` (topologie, ordre des offres,
 * événements et charges identiques) : le membre déjà dans l'appel offre au nouveau venu à
 * `call:participant-joined` ; le nouveau venu répond aux offres qu'il reçoit ; une connexion qui échoue retire
 * son membre sans couper l'appel ; la fin de l'appel ferme tout.
 *
 * Le duo n'y entre jamais : tant qu'aucune preuve de groupe n'est vue ([GroupCallEvidence]), chaque signal va au
 * principal, exactement comme avant ce lot.
 */
internal class GroupCallMesh(
    private val factory: GroupMeshPeerFactory,
    private val sender: GroupMeshSignalSender,
    /** Les noms des membres et le titre du groupe, lus une fois par appel de groupe (#13754). */
    private val names: GroupCallNameSource = GroupCallNameSource.NONE,
    /** Le niveau sonore reçu du pair principal, que la connexion de l'appel tient — iOS `primaryAudioLevel`. */
    private val primaryAudioLevel: suspend () -> Double? = { null },
    private val samplingIntervalMillis: Long = ActiveSpeakerDetector.SAMPLING_INTERVAL_MILLIS,
    private val clock: () -> Long = { System.nanoTime() / NANOS_PER_MILLI },
) {
    private val _ui = MutableStateFlow(GroupCallMeshUi())
    val ui: StateFlow<GroupCallMeshUi> = _ui.asStateFlow()

    private var scope: CoroutineScope? = null
    private var callId: String = ""
    private var conversationId: String = ""
    private var selfId: String = ""
    private var isOutgoing: Boolean = false
    private var iceServers: List<SocketIceServer> = emptyList()
    private var sendsAudio: Boolean = true
    private var sendsVideo: Boolean = false

    private var primaryUserId: String? = null
    private var isGroupCall: Boolean = false
    private var primaryVacated: Boolean = false
    private var roster = GroupCallRoster(localUserId = "")
    private val links = LinkedHashMap<String, GroupPeerLink>()
    private val knownArrivals = HashMap<String, GroupCallArrival>()
    private val servedMemberIds = HashSet<String>()
    private val departedMemberIds = HashSet<String>()
    private var directory = GroupCallDirectory.EMPTY
    private var namesJob: Job? = null
    private var detector = ActiveSpeakerDetector()
    private var speakingUserIds: Set<String> = emptySet()
    private var samplingJob: Job? = null

    val isGroup: Boolean get() = isGroupCall

    /** L'appel ouvre sa connexion : le maillage se lie à lui (et oublie le précédent). */
    fun bind(
        scope: CoroutineScope,
        callId: String,
        selfId: String,
        isOutgoing: Boolean,
        primaryUserId: String?,
        iceServers: List<SocketIceServer>,
        sendsAudio: Boolean,
        sendsVideo: Boolean,
        conversationId: String = "",
    ) {
        teardown()
        this.scope = scope
        this.callId = callId
        this.conversationId = conversationId
        this.selfId = selfId
        this.isOutgoing = isOutgoing
        this.primaryUserId = primaryUserId?.takeIf { it.isNotBlank() && it != selfId }
        this.iceServers = iceServers
        this.sendsAudio = sendsAudio
        this.sendsVideo = sendsVideo
        roster = GroupCallRoster(localUserId = selfId)
        publish()
    }

    /**
     * Un signal de l'appel arrive : `true` quand il appartient au maillage (ou à personne) et que la connexion de
     * l'appel ne doit pas le traiter. Le premier membre qui m'offre devient mon principal quand je réponds.
     */
    fun claims(envelope: CallSignalEnvelope): Boolean {
        if (scope == null || envelope.callId != callId) return false
        val signal = envelope.signal
        val from = signal.from
        if (primaryUserId == null && !isOutgoing && signal.type == OFFER && !from.isNullOrBlank() && from != selfId) {
            primaryUserId = from
            publish()
        }
        if (!isGroupCall && GroupCallEvidence.fromSignal(signal.type, from, selfId, primaryUserId)) becomeGroup()
        return when (val destination = GroupSignalRouting.destination(from, selfId, primaryUserId, isGroupCall, primaryVacated)) {
            GroupSignalDestination.Primary -> false
            GroupSignalDestination.Ignore -> true
            is GroupSignalDestination.Mesh -> {
                GroupMeshSignal.from(signal)?.let { receive(it, destination.userId) }
                true
            }
        }
    }

    /**
     * `call:participant-joined` : `true` quand l'arrivée appartient au maillage — la connexion de l'appel ne doit
     * alors ni s'adresser à elle ni lui offrir. L'appelant d'un groupe désigne son principal au premier arrivant.
     */
    fun claimsArrival(userId: String?): Boolean {
        if (scope == null || userId.isNullOrBlank() || userId == selfId) return false
        if (primaryUserId == null) {
            if (isOutgoing) {
                primaryUserId = userId
                publish()
            }
            return false
        }
        if (!isGroupCall && GroupCallEvidence.fromArrival(userId, selfId, primaryUserId)) becomeGroup()
        if (!isGroupCall) return false
        if (userId == primaryUserId && !primaryVacated) return false
        servedMemberIds += userId
        departedMemberIds -= userId
        if (userId !in roster && roster.isFull) return true
        admit(knownArrivals[userId] ?: GroupCallArrival(userId, isVideoEnabled = sendsVideo))
        publish()
        if (GroupSignalRouting.shouldOfferToArrival(userId, selfId, primaryUserId, isInCall = true, primaryVacated)) offer(userId)
        return true
    }

    /** Le nom, l'avatar et les médias d'un arrivant (`call:participant-joined`, charge complète). */
    fun onArrivalDetails(callId: String, arrival: GroupCallArrival) {
        if (callId != this.callId || arrival.userId == selfId) return
        knownArrivals[arrival.userId] = arrival
        if (arrival.userId !in roster) return
        roster = roster.admitting(arrival, isPrimary = arrival.userId == primaryUserId && !primaryVacated)
        publish()
    }

    /** `call:participant-left` : un membre du maillage s'en va, ou le principal laisse son siège à un groupe qui continue. */
    fun onParticipantLeft(callId: String, userId: String?) {
        if (callId != this.callId || userId.isNullOrBlank()) return
        servedMemberIds -= userId
        departedMemberIds += userId
        if (userId == primaryUserId && !primaryVacated) {
            primaryDidLeave()
            return
        }
        dropMember(userId)
    }

    /**
     * Le principal s'en va (`participant-left` ou `bye` in-band). S'il reste des membres, son siège se libère et
     * l'appel continue par le maillage : `true`. Sinon `false` — un duo, ou plus personne : l'appel finit comme avant.
     */
    fun primaryDidLeave(): Boolean {
        if (!isGroupCall) return false
        if (primaryVacated) return true
        val primary = primaryUserId ?: return false
        val remains = roster.members.any { it.userId != primary } || servedMemberIds.any { it != primary }
        if (!remains) return false
        primaryVacated = true
        dropMember(primary)
        return true
    }

    val isPrimaryVacated: Boolean get() = primaryVacated

    fun onMediaToggled(callId: String, userId: String?, mediaType: String, enabled: Boolean): Boolean {
        if (callId != this.callId || !isGroupCall || userId.isNullOrBlank()) return false
        val kind = GroupCallMediaKind.fromWire(mediaType) ?: return false
        roster = roster.applying(kind, enabled, userId)
        publish()
        return primaryVacated || userId != primaryUserId
    }

    fun setSendsAudio(enabled: Boolean) {
        sendsAudio = enabled
        links.values.forEach { it.setSendsAudio(enabled) }
    }

    fun setSendsVideo(enabled: Boolean) {
        sendsVideo = enabled
        links.values.forEach { it.setSendsVideo(enabled) }
    }

    fun updateIceServers(servers: List<SocketIceServer>) {
        if (servers.isEmpty()) return
        iceServers = servers
        links.values.forEach { it.updateIceServers(servers) }
    }

    /** La fin de l'appel ferme tout. */
    fun teardown() {
        samplingJob?.cancel()
        samplingJob = null
        namesJob?.cancel()
        namesJob = null
        directory = GroupCallDirectory.EMPTY
        departedMemberIds.clear()
        conversationId = ""
        detector = ActiveSpeakerDetector()
        speakingUserIds = emptySet()
        links.values.forEach { it.close() }
        links.clear()
        knownArrivals.clear()
        servedMemberIds.clear()
        scope = null
        callId = ""
        primaryUserId = null
        isGroupCall = false
        primaryVacated = false
        roster = GroupCallRoster(localUserId = selfId)
        publish()
    }

    private fun becomeGroup() {
        isGroupCall = true
        startSampling()
        readNames()
        val primary = primaryUserId ?: return
        admit(knownArrivals[primary] ?: GroupCallArrival(primary), isPrimary = true)
        roster = roster.updatingLink(GroupCallLinkState.Connected, primary)
        publish()
    }

    /** Admet un membre, nommé par l'annuaire là où son arrivée ne l'a pas fait. */
    private fun admit(arrival: GroupCallArrival, isPrimary: Boolean = false) {
        roster = roster.admitting(arrival, isPrimary).named(directory)
    }

    /**
     * Un membre découvert par son offre n'a jamais été annoncé : son nom vient de la conversation en cache, puis de
     * l'appel actif, lus UNE fois par appel (iOS `enrichNamesIfNeeded`) et réappliqués à chaque membre admis ensuite.
     * Les présents de la passerelle comptent quand le principal part, sauf ceux déjà partis.
     */
    private fun readNames() {
        val scope = scope ?: return
        if (namesJob != null) return
        val boundCall = callId
        namesJob = scope.launch {
            names.directoryFor(conversationId, boundCall).collect { read ->
                if (boundCall != callId) return@collect
                directory = read
                servedMemberIds += read.presentIds.filter { it != selfId && it !in departedMemberIds }
                roster = roster.named(read)
                publish()
            }
        }
    }

    private fun offer(userId: String) {
        links.remove(userId)?.close()
        makeLink(userId)?.offer()
    }

    private fun receive(signal: GroupMeshSignal, userId: String) {
        val existing = links[userId]
        if (existing == null && signal.kind != GroupMeshSignalKind.Offer) return
        if (existing == null) {
            if (userId !in roster && roster.isFull) return
            admit(knownArrivals[userId] ?: GroupCallArrival(userId, isVideoEnabled = sendsVideo))
            publish()
        }
        (existing ?: makeLink(userId))?.receive(signal)
    }

    private fun makeLink(userId: String): GroupPeerLink? {
        val scope = scope ?: return null
        val id = callId
        val config = CallMeshPeerConfig(iceServers, sendsAudio = sendsAudio, sendsVideo = sendsVideo)
        val link = GroupPeerLink(
            remoteUserId = userId,
            isPolite = GroupSignalRouting.isPolitePeer(selfId, userId),
            scope = scope,
            onEvent = { event -> handle(event, userId, id) },
            openPeer = { callbacks -> factory.open(config, callbacks) },
        )
        if (!link.isOpen) {
            dropMember(userId)
            return null
        }
        links[userId] = link
        return link
    }

    private fun handle(event: GroupPeerLinkEvent, userId: String, eventCallId: String) {
        if (eventCallId != callId || links[userId] == null) return
        when (event) {
            is GroupPeerLinkEvent.Signal -> sender.send(callId, to = userId, from = selfId, signal = event.signal)
            is GroupPeerLinkEvent.State -> {
                roster = roster.updatingLink(event.state, userId)
                publish()
            }
            GroupPeerLinkEvent.Failed -> dropMember(userId)
            is GroupPeerLinkEvent.RemoteVideo -> publish()
        }
    }

    private fun dropMember(userId: String) {
        links.remove(userId)?.close()
        roster = roster.removing(userId)
        detector = detector.forgetting(userId)
        speakingUserIds = detector.speakers
        publish()
    }

    /**
     * Qui parle (#13751), miroir de iOS `GroupCallMeshCoordinator.sampleAudioLevels` : toutes les 400 ms, le niveau
     * reçu du principal et de chaque lien du maillage nourrit [ActiveSpeakerDetector] ; l'écran n'est republié que si
     * l'ensemble des locuteurs change. Un relevé par lien et par intervalle, jamais par trame audio.
     */
    private fun startSampling() {
        val scope = scope ?: return
        if (samplingJob != null) return
        samplingJob = scope.launch {
            while (isActive) {
                delay(samplingIntervalMillis)
                sampleAudioLevels()
            }
        }
    }

    private suspend fun sampleAudioLevels() {
        if (!isGroupCall) return
        val boundCall = callId
        val current = links.entries.map { it.key to it.value }
        val levels = HashMap<String, Double>(current.size + 1)
        current.forEach { (userId, link) -> link.audioLevel()?.let { levels[userId] = it } }
        val primary = primaryUserId?.takeIf { !primaryVacated }
        if (primary != null) primaryAudioLevel()?.let { levels[primary] = it }
        if (boundCall != callId) return
        val present = primaryUserId?.takeIf { !primaryVacated }
        levels.keys.retainAll { it in links || it == present }
        detector = detector.recording(levels, clock())
        val speakers = detector.speakers
        if (speakers != speakingUserIds) {
            speakingUserIds = speakers
            publish()
        }
    }

    private fun publish() {
        _ui.value = GroupCallMeshUi(
            isActive = scope != null && isGroupCall,
            roster = roster,
            primaryUserId = primaryUserId,
            isPrimaryVacated = primaryVacated,
            videoTracks = links.mapNotNull { (id, link) -> link.remoteVideoTrack?.let { id to it } }.toMap(),
            speakingUserIds = speakingUserIds,
            title = if (primaryVacated) GroupCallTitle.of(roster, directory.groupTitle) else null,
        )
    }

    private companion object {
        const val OFFER = "offer"
        const val NANOS_PER_MILLI = 1_000_000L
    }
}
