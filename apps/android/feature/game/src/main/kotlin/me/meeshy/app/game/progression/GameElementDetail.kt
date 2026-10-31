package me.meeshy.app.game.progression

import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.engagement.AchievementEntry
import me.meeshy.sdk.model.game.engagement.BadgeGuide
import me.meeshy.sdk.model.game.engagement.BadgeGuideResolver
import me.meeshy.sdk.model.game.engagement.BadgeMaterialKey
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementAxisProgress
import me.meeshy.sdk.model.game.engagement.GameBadgeTiers
import me.meeshy.sdk.model.game.progression.FicheFact
import me.meeshy.sdk.model.game.progression.GameDetailFactKey
import me.meeshy.sdk.model.game.progression.ProgressionConcept

/** Ce qu'il manque à un élément verrouillé, dit avec SA cible (iOS `GameDetailText.badgeMissing`, `GameBadgeGuideText.imprint`). */
sealed interface GameElementMissing {
    /** Une médaille jamais gagnée : ce qu'il manque pour la première étoile. */
    data class FirstStar(val count: Int) : GameElementMissing

    /** Une empreinte, éteinte par une frappe : ce qu'il manque pour la rallumer. */
    data class Rekindle(val count: Int) : GameElementMissing
}

/** L'état d'un élément, que la feuille dit en toutes lettres (iOS `GameElementStatus`). */
sealed interface GameElementStatus {
    /** Obtenu, à la date SERVIE quand la passerelle en sert une. */
    data class Obtained(val reachedAt: String?) : GameElementStatus

    /** Verrouillé : ce qu'il manque et la part parcourue, quand ils se savent. */
    data class Locked(val missing: GameElementMissing?, val progress: Double?) : GameElementStatus

    /** Une donnée : ni obtenue ni verrouillée, sa valeur se dit (iOS `.value`). */
    data class Value(val value: GameText) : GameElementStatus
}

/**
 * LES PRÉCISIONS D'UN ÉLÉMENT DU JEU (miroir de `GameElementDetail`, iOS) pour les familles que la Progression Android
 * ouvre en feuille : la médaille, le défi et la ligne de donnée. Une DONNÉE sans un mot : la feuille la fait parler.
 */
sealed interface GameElementDetail {
    val id: String
    val status: GameElementStatus

    /** La fiche dont l'élément relève : sa teinte colore la jauge. */
    val concept: ProgressionConcept

    /** La jauge : la part parcourue d'un élément verrouillé ; rien pour un élément obtenu. */
    val progress: Double? get() = (status as? GameElementStatus.Locked)?.progress

    /** Un élément verrouillé se dessine désaturé : on le reconnaît, on ne l'a pas encore. */
    val lockedLook: Boolean get() = status is GameElementStatus.Locked

    /** Une médaille : son emblème (matière, allumée ou en empreinte, part parcourue) et ce que la loi partagée dit d'elle. */
    data class Badge(
        val axis: EngagementAxisKey,
        val material: BadgeMaterialKey,
        val lit: Boolean,
        val emblemProgress: Double,
        override val status: GameElementStatus,
        val guide: BadgeGuide,
        private val key: String,
    ) : GameElementDetail {
        override val id: String get() = "badge:$key"
        override val concept: ProgressionConcept get() = ProgressionConcept.Badges
    }

    /** Un palier de défi : son entrée de la grammaire (famille, palier, section, date). */
    data class Challenge(val entry: AchievementEntry, override val status: GameElementStatus) : GameElementDetail {
        override val id: String get() = "defi:${entry.key}"
        override val concept: ProgressionConcept get() = ProgressionConcept.Defis
    }

    /**
     * Une ligne « Où j'en suis » (iOS `GameElementDetails.fact`) : son libellé en titre, sa valeur pour état, et la
     * phrase de SA donnée ([key]) — ou, faute d'en avoir une, celle de son concept.
     */
    data class Fact(
        override val concept: ProgressionConcept,
        val label: GameText,
        val value: GameText,
        val key: GameDetailFactKey?,
    ) : GameElementDetail {
        override val id: String get() = "fact:${concept.name}.$label"
        override val status: GameElementStatus get() = GameElementStatus.Value(value)
    }
}

/** Une fonction pure par famille (miroir de `GameElementDetails`, iOS) : rien d'inventé, ce qui n'est pas servi ne se dit pas. */
object GameElementDetails {

    /** La médaille de l'étagère : son plus haut palier gravé, gagnée à sa date ou éteinte, ce qu'il manque pour la rallumer. */
    fun badge(entry: BadgeShelfEntry): GameElementDetail.Badge = GameElementDetail.Badge(
        axis = entry.axis,
        material = entry.material,
        lit = entry.lit,
        emblemProgress = entry.progress,
        status = if (entry.lit) {
            GameElementStatus.Obtained(entry.reachedAt)
        } else {
            GameElementStatus.Locked(GameElementMissing.Rekindle(entry.missing), entry.progress)
        },
        guide = entry.guide,
        key = "${entry.axis.wire}:${entry.threshold}",
    )

    /**
     * La médaille d'un AXE : celle de l'étagère quand l'axe a un palier gravé ; sinon la première à décrocher,
     * verrouillée, avec ce qu'il manque pour la première étoile et sa jauge.
     */
    fun badge(axis: EngagementAxisProgress): GameElementDetail.Badge {
        BadgeShelf.entryOf(axis)?.let { return badge(it) }
        val scale = axis.scale
        val target = scale.nextThreshold ?: scale.tiers.firstOrNull()?.threshold ?: 0
        return GameElementDetail.Badge(
            axis = axis.axis,
            material = GameBadgeTiers.materialOfThreshold(target) ?: BadgeMaterialKey.PRISME,
            lit = false,
            emblemProgress = scale.progress,
            status = GameElementStatus.Locked(scale.remainingToNext?.let { GameElementMissing.FirstStar(it) }, scale.progress),
            guide = BadgeGuideResolver.resolve(axis),
            key = "${axis.axis.wire}:next",
        )
    }

    /** Une ligne de donnée d'une fiche, dans SON concept : ce que son toucher ouvre. */
    fun fact(fact: FicheFact, concept: ProgressionConcept): GameElementDetail.Fact =
        GameElementDetail.Fact(concept = concept, label = fact.label, value = fact.value, key = fact.detail)

    /** Un palier de défi, obtenu à sa date ou verrouillé : la grammaire ne sert ni manque ni jauge. */
    fun challenge(entry: AchievementEntry): GameElementDetail.Challenge = GameElementDetail.Challenge(
        entry = entry,
        status = if (entry.unlocked) GameElementStatus.Obtained(entry.reachedAt) else GameElementStatus.Locked(missing = null, progress = null),
    )
}
