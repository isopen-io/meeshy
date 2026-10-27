package me.meeshy.app.onboarding

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.ZoneOffset
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.BirthDateDeclarationError
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.onboarding.ApiOnboardingState
import me.meeshy.sdk.model.onboarding.OnboardingAgeRules
import me.meeshy.sdk.model.onboarding.OnboardingAgeState
import me.meeshy.sdk.model.onboarding.OnboardingCard
import me.meeshy.sdk.model.onboarding.OnboardingContactsPhase
import me.meeshy.sdk.model.onboarding.OnboardingContactsRules
import me.meeshy.sdk.model.onboarding.OnboardingGain
import me.meeshy.sdk.model.onboarding.OnboardingGreeting
import me.meeshy.sdk.model.onboarding.OnboardingPlan
import me.meeshy.sdk.model.onboarding.OnboardingRecap
import me.meeshy.sdk.model.onboarding.OnboardingRewards
import me.meeshy.sdk.model.onboarding.OnboardingSendState
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.sdk.model.onboarding.OnboardingStepOutcome
import me.meeshy.sdk.model.onboarding.OnboardingStepRewards

/**
 * L'onboarding post-inscription (iOS `OnboardingViewModel`) : cinq cartes COURTES, passables, chacune finie par un geste
 * RÉEL qui rapporte déjà des points.
 *
 * **Le serveur déclare, ce modèle affiche.** L'éligibilité, les étapes vues, celles que l'engagement pré-coche, le régime
 * protégé et les profils suggérés viennent de `GET /me/onboarding` ; chaque carte vue repart en `PATCH`, idempotent. Ce
 * qui est décidé ICI : l'ordre d'affichage ([OnboardingPlan]) et le moment de la carte notifications.
 *
 * **Aucun gain inventé.** Un « +N » ne s'affiche qu'après l'accusé du serveur ; la demande d'ami n'affiche rien, parce
 * que rien n'est crédité avant l'acceptation. Le récapitulatif relit la progression serveur — et, s'il ne le peut pas,
 * n'affiche que ce que la session a vraiment gagné.
 *
 * **Jamais de message de perte, jamais de compte à rebours** : « Passer tout » et « Plus tard » ferment sans rien
 * retirer.
 */
@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val gateway: OnboardingGateway,
    private val texts: OnboardingTexts,
) : ViewModel() {

    private val mutableState = MutableStateFlow(OnboardingUiState())
    val state: StateFlow<OnboardingUiState> = mutableState.asStateFlow()

    /** Le délai entre deux relectures du crédit ; remplaçable par les tests. */
    internal var pause: suspend (Long) -> Unit = { delay(it) }

    /** Le jour courant, pour la date de départ du sélecteur ; remplaçable par les tests. */
    internal var today: () -> LocalDate = { LocalDate.now() }

    internal var pickTemplate: (Int) -> Int = { bound -> (0 until bound).random() }

    private var user: MeeshyUser? = null
    private var composedGreeting = ""
    private var initialLanguages: Pair<String, String?> = "" to null
    private var rewardSequence = 0
    private var isRoutingElsewhere = false
    private var isArrivalCelebrated = false
    private var awaitsRoute = false
    private var knownScore: Int? = null
    private var servedElanFactor = 1
    private var servedRewards: OnboardingStepRewards? = null

    /** Le parcours est-il en train de recouvrir l'écran ? Lu par ceux qui ne doivent pas le recouvrir. */
    val isPresented: Boolean get() = mutableState.value.isPresented

    private val isHeld: Boolean get() = isRoutingElsewhere || isArrivalCelebrated

    // region Démarrage

    /**
     * Un parcours RÉGLÉ — fini, passé, ou déclaré non éligible par le serveur — ne se redemande plus : aucun `GET` à
     * chaque lancement, pour toujours. Une panne réseau ne règle rien : la lecture sera retentée.
     */
    suspend fun start(user: MeeshyUser) {
        if (gateway.isSettled(user.id)) return
        prepare(user)
        val served = gateway.fetchState() ?: return
        if (!served.eligible || served.completedAt != null) {
            gateway.markSettled(user.id)
            return
        }
        present(served)
    }

    /** Un deep link ou un push a mené AILLEURS que la racine : le calque attend le retour. */
    fun routingChanged(isElsewhere: Boolean) {
        isRoutingElsewhere = isElsewhere
        presentIfNoLongerHeld()
    }

    /** La célébration de l'arrivée précède la première carte : le calque attend qu'elle parte. */
    fun celebrationChanged(isShowing: Boolean) {
        isArrivalCelebrated = isShowing
        presentIfNoLongerHeld()
    }

    private fun presentIfNoLongerHeld() {
        if (isHeld || !awaitsRoute) return
        awaitsRoute = false
        mutableState.update { it.copy(isPresented = true) }
    }

    private suspend fun present(served: ApiOnboardingState) {
        servedRewards = served.stepRewards
        val contacts = gateway.contactsPermission()
        val plan = OnboardingPlan.start(
            state = served,
            contactsOfferable = OnboardingContactsRules.isOfferable(contacts),
            notificationsUndetermined = gateway.notificationsUndetermined(),
        )
        mutableState.update {
            it.copy(
                plan = plan,
                suggestions = served.suggestions,
                globalConversationId = served.globalConversationId,
                storyVisibility = served.storyDefaultVisibility,
                storyNeedsEmailVerification = served.canPublishStory == false,
                contactsPhase = OnboardingContactsRules.initialPhase(contacts),
            )
        }
        if (isHeld) awaitsRoute = true else mutableState.update { it.copy(isPresented = true) }
        showNext()
        readScoreBaseline()
    }

    /** Les défauts justes, posés AVANT la lecture réseau : la langue du profil et un salut déjà personnel. */
    private fun prepare(user: MeeshyUser) {
        this.user = user
        val primary = user.systemLanguage?.takeIf { it.isNotEmpty() }
            ?: java.util.Locale.getDefault().language.takeIf { it.isNotEmpty() }
            ?: "fr"
        val secondary = user.regionalLanguage?.takeIf { it != primary }
        // Un profil SANS langue enregistrée n'a rien d'« inchangé » : la langue pré-remplie part à la confirmation.
        initialLanguages = (user.systemLanguage ?: "") to secondary
        mutableState.update {
            it.copy(
                primaryLanguage = primary,
                secondaryLanguage = secondary,
                accountEmail = user.email?.takeIf { email -> email.isNotEmpty() },
                userDisplayName = user.displayName ?: user.username,
                ageBirthDate = OnboardingAgeRules.initialDate(today()),
            )
        }
        composedGreeting = composeGreeting(primary, secondary)
        mutableState.update { it.copy(greetingDraft = composedGreeting) }
    }

    private fun composeGreeting(primary: String, secondary: String?): String {
        val owner = user ?: return ""
        val names = listOfNotNull(primary, secondary).map(texts::languageName)
        return OnboardingGreeting.compose(
            template = texts.greetingTemplate(pickTemplate(OnboardingGreeting.TEMPLATE_COUNT)),
            name = owner.displayName ?: owner.username,
            joinedLanguages = texts.join(names),
            locale = texts.locale,
        )
    }

    // endregion

    // region Navigation

    /** « Continuer » après un geste déjà enregistré. */
    suspend fun advance() = showNext()

    /** « Plus tard » : la carte est vue, passée, et rien n'est perdu. */
    suspend fun later() {
        val step = (mutableState.value.card as? OnboardingCard.Step)?.id ?: return
        showNext()
        gateway.record(step, OnboardingStepOutcome.SKIPPED)
    }

    /** « Passer tout » : visible dès la première carte, ferme sans condition. */
    suspend fun skipAll() = close()

    /** « C'est bon pour aujourd'hui » — et « Continuer à explorer », dont l'hôte ouvre ensuite Meeshy Global. */
    suspend fun finish() = close()

    private suspend fun close() {
        awaitsRoute = false
        mutableState.update { it.copy(isPresented = false, card = null) }
        user?.let { gateway.markSettled(it.id) }
        gateway.finish()
    }

    private suspend fun showNext() {
        val (plan, card) = mutableState.value.plan.next()
        mutableState.update { it.copy(plan = plan, card = card) }
        if (card == OnboardingCard.Recap) loadRecap()
    }

    private fun produce() = mutableState.update { it.copy(plan = it.plan.producing()) }

    private fun reward(points: Int) {
        rewardSequence += 1
        mutableState.update {
            it.copy(sessionPoints = it.sessionPoints + points, gain = OnboardingGain(rewardSequence, points))
        }
    }

    // endregion

    // region Carte langues

    fun selectPrimaryLanguage(code: String) {
        mutableState.update {
            it.copy(primaryLanguage = code, secondaryLanguage = it.secondaryLanguage.takeIf { second -> second != code })
        }
        refreshUntouchedGreeting()
    }

    fun toggleSecondaryLanguage(code: String) {
        if (code == mutableState.value.primaryLanguage) return
        mutableState.update { it.copy(secondaryLanguage = if (it.secondaryLanguage == code) null else code) }
        refreshUntouchedGreeting()
    }

    /** Le salut suit les langues choisies tant que personne ne l'a réécrit. */
    private fun refreshUntouchedGreeting() {
        val current = mutableState.value
        if (user == null || current.greetingDraft != composedGreeting) return
        composedGreeting = composeGreeting(current.primaryLanguage, current.secondaryLanguage)
        mutableState.update { it.copy(greetingDraft = composedGreeting) }
    }

    fun editGreeting(text: String) = mutableState.update { it.copy(greetingDraft = text) }

    suspend fun confirmLanguages() {
        if (mutableState.value.card != OnboardingCard.Step(OnboardingStepId.LANGUAGES)) return
        showNext()
        val chosen = mutableState.value.primaryLanguage to mutableState.value.secondaryLanguage
        if (chosen != initialLanguages && gateway.updateLanguages(chosen.first, chosen.second)) {
            initialLanguages = chosen
        }
        gateway.record(OnboardingStepId.LANGUAGES, OnboardingStepOutcome.DONE)
    }

    // endregion

    // region Carte « valide ton adresse »

    /** « Renvoyer le lien » — la route existante, vers l'adresse du compte. */
    suspend fun resendVerificationLink() {
        if (mutableState.value.verificationLinkState == OnboardingSendState.SENDING) return
        val email = user?.email?.takeIf { it.isNotEmpty() }
        if (email == null) {
            mutableState.update { it.copy(verificationLinkState = OnboardingSendState.FAILED) }
            return
        }
        mutableState.update { it.copy(verificationLinkState = OnboardingSendState.SENDING) }
        val sent = gateway.resendVerification(email)
        mutableState.update {
            it.copy(verificationLinkState = if (sent) OnboardingSendState.SENT else OnboardingSendState.FAILED)
        }
    }

    /**
     * Relit l'état serveur — au retour au premier plan, et tant qu'une carte attend la vérification. Une adresse vérifiée
     * ailleurs (le lien touché dans le courriel) règle la carte e-mail et rend la story publiable.
     */
    suspend fun refreshVerification() {
        val current = mutableState.value
        if (!current.isPresented && !awaitsRoute) return
        val served = gateway.fetchState() ?: return
        mutableState.update { it.copy(storyNeedsEmailVerification = served.canPublishStory == false) }
        if (served.emailVerified != true) return
        if (current.card == OnboardingCard.Step(OnboardingStepId.EMAIL)) {
            showNext()
            gateway.record(OnboardingStepId.EMAIL, OnboardingStepOutcome.DONE)
            return
        }
        if (OnboardingStepId.EMAIL !in mutableState.value.plan.queue) return
        mutableState.update { it.copy(plan = it.plan.without(OnboardingStepId.EMAIL)) }
    }

    // endregion

    // region Carte âge

    /** La roue a tourné : la date est CHOISIE, la confirmation s'ouvre. */
    fun pickBirthDate(date: LocalDate) {
        mutableState.update {
            it.copy(
                ageBirthDate = date,
                ageDatePicked = true,
                ageState = if (it.ageState == OnboardingAgeState.INVALID || it.ageState == OnboardingAgeState.FAILED) {
                    OnboardingAgeState.IDLE
                } else {
                    it.ageState
                },
            )
        }
    }

    /**
     * « Confirmer » : la passerelle écrit la date UNE fois et dit ce qu'elle ferme. Un 13-17 ans perd la carte du salut
     * dans Global, qu'il lira sans pouvoir y écrire.
     */
    suspend fun declareBirthDate() {
        val current = mutableState.value
        if (current.card != OnboardingCard.Step(OnboardingStepId.AGE) || !current.ageDatePicked) return
        if (current.ageState == OnboardingAgeState.SENDING || current.ageState == OnboardingAgeState.REFUSED) return
        mutableState.update { it.copy(ageState = OnboardingAgeState.SENDING) }
        val pickerMillis = current.ageBirthDate.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
        when (val result = gateway.declareBirthDate(pickerMillis)) {
            is OnboardingBirthDateResult.Declared -> {
                mutableState.update { it.copy(ageState = OnboardingAgeState.IDLE) }
                if (result.closesGlobal) closeGlobalGreeting()
                showNext()
                gateway.record(OnboardingStepId.AGE, OnboardingStepOutcome.DONE)
            }
            is OnboardingBirthDateResult.Refused -> ageDeclarationFailed(result.reason)
        }
    }

    private suspend fun ageDeclarationFailed(reason: BirthDateDeclarationError) {
        when (reason) {
            BirthDateDeclarationError.BELOW_MINIMUM_AGE ->
                mutableState.update { it.copy(ageState = OnboardingAgeState.REFUSED) }
            BirthDateDeclarationError.ALREADY_SET -> {
                // La date est déjà connue (autre appareil) : l'étape est faite, et l'état relu dit si Global reste ouverte.
                mutableState.update { it.copy(ageState = OnboardingAgeState.IDLE) }
                val served = gateway.fetchState()
                if (served?.viewerWriteRestriction?.closesComposer == true) closeGlobalGreeting()
                showNext()
                gateway.record(OnboardingStepId.AGE, OnboardingStepOutcome.DONE)
            }
            BirthDateDeclarationError.UNSUPPORTED -> {
                mutableState.update { it.copy(ageState = OnboardingAgeState.IDLE) }
                showNext()
            }
            BirthDateDeclarationError.INVALID_DATE ->
                mutableState.update { it.copy(ageState = OnboardingAgeState.INVALID) }
            BirthDateDeclarationError.UNAVAILABLE ->
                mutableState.update { it.copy(ageState = OnboardingAgeState.FAILED) }
        }
    }

    private fun closeGlobalGreeting() =
        mutableState.update { it.copy(plan = it.plan.without(OnboardingStepId.GLOBAL)) }

    /**
     * « J'ai compris » sous l'écran de refus : Meeshy n'est pas ouvert sous 13 ans, la session se ferme. Le parcours n'est
     * pas RÉGLÉ — rien n'a été écrit, et la passerelle refusera de nouveau.
     */
    suspend fun acknowledgeAgeRefusal() {
        if (mutableState.value.ageState != OnboardingAgeState.REFUSED) return
        awaitsRoute = false
        mutableState.update { it.copy(isPresented = false, card = null, signOutRequested = true) }
    }

    // endregion

    // region Carte salut dans Global

    suspend fun sendGreeting() {
        val current = mutableState.value
        val conversationId = current.globalConversationId ?: return
        if (current.greetingState == OnboardingSendState.SENDING || current.greetingState == OnboardingSendState.SENT) return
        val text = current.greetingDraft.trim()
        if (text.isEmpty()) return
        mutableState.update { it.copy(greetingState = OnboardingSendState.SENDING) }
        // La langue d'origine n'est DÉCLARÉE que pour le gabarit intact : un texte réécrit peut être dans n'importe
        // quelle langue, et c'est alors la détection du pipeline qui la trouve.
        val declared = if (current.greetingDraft == composedGreeting) {
            OnboardingGreeting.contentLanguage(texts.locale.toLanguageTag())
        } else {
            null
        }
        if (!gateway.sendGreeting(conversationId, text, declared)) {
            mutableState.update { it.copy(greetingState = OnboardingSendState.FAILED) }
            return
        }
        mutableState.update { it.copy(greetingState = OnboardingSendState.SENT) }
        produce()
        val points = creditedPoints(OnboardingRewards.greeting, servedRewards?.global)
        mutableState.update { it.copy(greetingReward = points) }
        reward(points)
        gateway.record(OnboardingStepId.GLOBAL, OnboardingStepOutcome.DONE)
    }

    // endregion

    // region Carte première story

    /**
     * Le composeur de story s'est refermé : la passerelle relit l'état. Une story publiée est vue par l'engagement
     * (`prefilledSteps`) — c'est le SEUL moment où elle rapporte ses points et où l'étape s'écrit `done`.
     */
    suspend fun storyComposerClosed() {
        val current = mutableState.value
        if (current.storyState == OnboardingStoryState.PUBLISHED) return
        val served = gateway.fetchState() ?: return
        mutableState.update { it.copy(storyNeedsEmailVerification = served.canPublishStory == false) }
        if (OnboardingStepId.STORY !in served.prefilledSteps) return
        mutableState.update { it.copy(storyState = OnboardingStoryState.PUBLISHED) }
        produce()
        val points = creditedPoints(OnboardingRewards.story, servedRewards?.story)
        mutableState.update { it.copy(storyReward = points) }
        reward(points)
        gateway.record(OnboardingStepId.STORY, OnboardingStepOutcome.DONE)
    }

    // endregion

    // region Carte « trouve ta bande »

    suspend fun addFriend(id: String) {
        if (id in mutableState.value.requestedProfileIds) return
        mutableState.update { it.copy(requestedProfileIds = it.requestedProfileIds + id, failedProfileId = null) }
        if (gateway.sendFriendRequest(id)) {
            produce()
            return
        }
        mutableState.update { it.copy(requestedProfileIds = it.requestedProfileIds - id, failedProfileId = id) }
    }

    /**
     * La carte des amis est à l'écran. Un accès aux contacts DÉJÀ accordé lance la recherche sans rien demander : la
     * permission a été consentie ailleurs, et proposer un bouton pour un geste acquis serait un détour.
     */
    suspend fun friendsCardAppeared() {
        val current = mutableState.value
        if (current.card != OnboardingCard.Step(OnboardingStepId.FRIENDS)) return
        if (current.contactsPhase != OnboardingContactsPhase.Offer) return
        if (!OnboardingContactsRules.searchesOnArrival(gateway.contactsPermission())) return
        findFriendsInContacts { true }
    }

    /**
     * « Retrouver mes amis » : la fenêtre système si elle n'a jamais servi ([requestAccess], posée par l'écran), puis la
     * synchronisation du Répertoire et la lecture des contacts qui ont un compte.
     */
    suspend fun findFriendsInContacts(requestAccess: suspend () -> Boolean) {
        val current = mutableState.value
        if (current.card != OnboardingCard.Step(OnboardingStepId.FRIENDS)) return
        if (current.contactsPhase != OnboardingContactsPhase.Offer && current.contactsPhase != OnboardingContactsPhase.Failed) return
        mutableState.update { it.copy(contactsPhase = OnboardingContactsPhase.Searching) }
        if (!requestAccess()) {
            contactsDeclined()
            return
        }
        val friends = gateway.findFriendsInContacts(user?.id)
        if (friends == null) {
            mutableState.update { it.copy(contactsPhase = OnboardingContactsPhase.Failed) }
            return
        }
        mutableState.update { it.copy(contactsPhase = OnboardingContactsPhase.Found(friends)) }
        // « On te prévient dès qu'un ami arrive » : la promesse appelle la carte notifications.
        produce()
    }

    /** « Plus tard » sur la proposition : les suggestions, inchangées — ou, s'il n'y en a aucune, la carte suivante. */
    suspend fun declineContacts() {
        val current = mutableState.value
        if (current.card != OnboardingCard.Step(OnboardingStepId.FRIENDS)) return
        if (current.contactsPhase != OnboardingContactsPhase.Offer) return
        contactsDeclined()
    }

    private suspend fun contactsDeclined() {
        mutableState.update { it.copy(contactsPhase = OnboardingContactsPhase.Declined) }
        if (mutableState.value.suggestions.isEmpty()) continueFromFriends()
    }

    /** Retour des Réglages : un accès rendu relance la recherche. */
    suspend fun refreshContactsAccess() {
        val current = mutableState.value
        if (current.card != OnboardingCard.Step(OnboardingStepId.FRIENDS)) return
        if (current.contactsPhase != OnboardingContactsPhase.DeniedBySystem) return
        if (!OnboardingContactsRules.searchesOnArrival(gateway.contactsPermission())) return
        mutableState.update { it.copy(contactsPhase = OnboardingContactsPhase.Offer) }
        findFriendsInContacts { true }
    }

    suspend fun continueFromFriends() {
        val current = mutableState.value
        if (current.card != OnboardingCard.Step(OnboardingStepId.FRIENDS)) return
        val outcome = if (current.requestedProfileIds.isEmpty()) OnboardingStepOutcome.SKIPPED else OnboardingStepOutcome.DONE
        showNext()
        gateway.record(OnboardingStepId.FRIENDS, outcome)
    }

    // endregion

    // region Carte notifications

    /** « Oui » : la SEULE voie qui ouvre la fenêtre système ([requestAccess], posée par l'écran). */
    suspend fun acceptNotifications(requestAccess: suspend () -> Boolean) {
        if (mutableState.value.card != OnboardingCard.Step(OnboardingStepId.NOTIFICATIONS)) return
        requestAccess()
        showNext()
        gateway.record(OnboardingStepId.NOTIFICATIONS, OnboardingStepOutcome.DONE)
    }

    // endregion

    // region Le crédit réel

    private suspend fun readScoreBaseline() {
        val current = gateway.fetchProgress() ?: return
        knownScore = current.score
        servedElanFactor = current.elanFactor
    }

    /**
     * Ce que le serveur a crédité pour un geste : l'écart entre deux lectures de la progression, élan compris. Tant que
     * le crédit n'est pas visible, l'annonce retombe sur ce que `/me/onboarding` a SERVI pour ce geste, sinon sur le
     * barème multiplié par l'élan servi — jamais le barème nu.
     */
    private suspend fun creditedPoints(weight: Int, served: Int?): Int {
        val estimate = served ?: (weight * servedElanFactor)
        val before = knownScore ?: return estimate
        repeat(CREDIT_READ_ATTEMPTS) { attempt ->
            if (attempt > 0) pause(CREDIT_READ_DELAY_MS)
            val current = gateway.fetchProgress() ?: return@repeat
            if (current.score <= before) return@repeat
            knownScore = current.score
            servedElanFactor = current.elanFactor
            return current.score - before
        }
        knownScore = before + estimate
        return estimate
    }

    // endregion

    // region Récapitulatif

    private suspend fun loadRecap() {
        val progress = gateway.fetchProgress()
        val recap = if (progress != null) {
            OnboardingRecap(
                points = progress.score,
                level = OnboardingRewards.level(progress.score),
                streakDays = progress.streakDays,
                badges = progress.badges,
            )
        } else {
            val earned = mutableState.value.sessionPoints
            OnboardingRecap(points = earned, level = OnboardingRewards.level(earned), streakDays = null, badges = null)
        }
        mutableState.update { it.copy(recap = recap) }
    }

    // endregion

    internal companion object {
        const val CREDIT_READ_ATTEMPTS = 3
        const val CREDIT_READ_DELAY_MS = 600L
    }
}
