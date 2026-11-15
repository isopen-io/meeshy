package me.meeshy.sdk.model.battery

import me.meeshy.sdk.model.relation.RelationLevel

/** La teinte de l'icône : rouge en critique, ambre bas, vert en charge, gris éteint. */
public enum class BatteryTone { CRITICAL, LOW, CHARGING, OFF }

/** Une autonomie estimée, en heures et minutes, telle que la fiche l'écrit. */
public data class BatteryAutonomy(val hours: Int, val minutes: Int)

/**
 * La présentation PURE de l'état de batterie d'une personne (#14147) : ce que l'en-tête, l'avatar, la fiche et la
 * SyncPill lisent. Aucune ressource ici — les clés (`battery.pill.*`) se résolvent dans la couche écran, dans les sept
 * langues.
 */
public object BatteryPresentation {
    public fun tone(state: BatteryState): BatteryTone = when {
        state.phase == BatteryPhase.OFF -> BatteryTone.OFF
        state.charging || state.phase == BatteryPhase.CHARGING -> BatteryTone.CHARGING
        state.phase == BatteryPhase.CRITICAL || state.level <= BatteryContract.CRITICAL_THRESHOLD -> BatteryTone.CRITICAL
        else -> BatteryTone.LOW
    }

    /** La part remplie du dessin, 0..1 ; un appareil éteint se dessine vide. */
    public fun fill(state: BatteryState): Float =
        if (state.phase == BatteryPhase.OFF) 0f else state.level.coerceIn(0, 100) / 100f

    /** « il y a X min », jamais négatif (horloges décalées). */
    public fun minutesAgo(state: BatteryState, nowMs: Long): Int =
        ((nowMs - state.measuredAtMillis).coerceAtLeast(0L) / 60_000L).toInt()

    /** L'autonomie estimée par le serveur ; absente quand il ne l'a pas calculée, ou quand l'appareil charge. */
    public fun autonomy(state: BatteryState): BatteryAutonomy? {
        if (state.charging || state.phase == BatteryPhase.OFF) return null
        val total = state.estimatedMinutes ?: return null
        return BatteryAutonomy(total / 60, total % 60)
    }

    /** La clé du libellé d'une annonce dans la SyncPill (`battery.pill.<genre>`). */
    public fun pillKey(kind: BatteryAnnouncementKind): String = "battery.pill.${kind.wire}"

    /** Le niveau que l'annonce porte en premier : le palier franchi pour `threshold`, sinon le niveau relevé. */
    public fun pillLevel(announcement: BatteryAnnouncement): Int? =
        if (announcement.kind == BatteryAnnouncementKind.THRESHOLD) announcement.threshold ?: announcement.level else announcement.level
}

/**
 * Qui voit quoi, côté CLIENT (la loi reste au serveur, ceci ne fait que choisir quoi PROPOSER) : la batterie se partage
 * dès Proche, le relevé à la demande n'est offert qu'à un Sang (l'équipe y est Sang par `accessLevel`).
 */
public object BatteryPersonRules {
    public fun mayShare(level: RelationLevel): Boolean = level.ordinal >= RelationLevel.CLOSE.ordinal

    public fun mayPull(level: RelationLevel): Boolean = level == RelationLevel.BLOOD

    /**
     * « Demander un relevé » se pose sur la PERSONNE (sa fiche, son profil), comme sur iOS — jamais dans les infos de
     * conversation, qui portent le détail et ce que je reçois. Il ne dépend pas d'un état servi : c'est hors épisode
     * qu'il réveille un téléphone muet.
     */
    public fun offersPull(level: RelationLevel, onPerson: Boolean): Boolean = onPerson && mayPull(level)

    /**
     * Le consentement d'un Proche est PROPOSÉ une fois, case non cochée : seulement entre Proches (un Sang le reçoit par
     * défaut), quand rien n'est encore partagé, que la proposition n'a jamais été faite et que je n'ai pas tout coupé.
     */
    public fun offersConsent(level: RelationLevel, shared: Boolean, alreadyOffered: Boolean, sharingEnabled: Boolean): Boolean =
        level == RelationLevel.CLOSE && !shared && !alreadyOffered && sharingEnabled
}
