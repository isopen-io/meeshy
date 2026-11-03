package me.meeshy.sdk.model.game.photo

import java.text.BreakIterator
import java.text.Normalizer
import java.util.Locale
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.PhotoStepEmblem

/**
 * LA PLAQUE D'AUTEUR (#10816) — miroir de `GamePhotoAuthorPlate.swift` (iOS) et de
 * `apps/web/src/lib/game-photo/author-plate.ts` : la MÊME table. Le cadre d'un succès, d'un rang ou d'une fin de
 * mission grave le PSEUDO de son auteur ; tout est une donnée tirée de l'étape, jamais un dessin par cas.
 */
public enum class PlateFamily { Achievement, Rank, Mission }

public enum class PlateFinish { Engrave, Emboss, Scratch;
    /** Le nom du fini dans le document Lottie (clé iOS `rawValue`). */
    public val key: String get() = name.lowercase(Locale.ROOT)
}

/** Les matières du jeu, plus l'indigo de la plaque neutre (un succès dont la rareté n'est pas servie). */
public enum class PlateMetal {
    Copper,
    Bronze,
    Silver,
    Gold,
    Platinum,
    Obsidian,
    Prism,
    Indigo,
}

public data class PlateStyle(val family: PlateFamily, val finish: PlateFinish, val metal: PlateMetal)

/** Ce qu'une plaque grave : un succès (rareté visible ou non servie), un rang, une fin de mission. */
public sealed interface PlateSubject {
    public data class Achievement(val rarity: AchievementRarity?) : PlateSubject
    public data class Rank(val rank: GloryRank) : PlateSubject
    public data object Mission : PlateSubject

    public companion object {
        /** Le sujet d'un emblème d'étape : seul un rang se grave ; les autres étapes n'ont pas de plaque. */
        public fun of(emblem: PhotoStepEmblem): PlateSubject? = when (emblem) {
            is PhotoStepEmblem.Rank -> Rank(emblem.rank)
            else -> null
        }
    }
}

/** L'auteur d'une photo : son pseudo public et, s'il en a une, sa photo de profil. */
public data class PhotoAuthor(val handle: String, val avatar: String?)

public data class AuthorPlate(
    val style: PlateStyle,
    /** « @atabeth », normalisé NFC et coupé à 16 graphèmes. */
    val name: String,
    val monogram: String,
    val avatar: String?,
) {
    val family: PlateFamily get() = style.family
    val finish: PlateFinish get() = style.finish
    val metal: PlateMetal get() = style.metal
}

public object GamePhotoAuthorPlate {

    /** Au-delà, le pseudo se coupe : la plaque garde une taille de lettre lisible plutôt que de rétrécir. */
    public const val MAX_HANDLE_GRAPHEMES: Int = 16

    public fun style(subject: PlateSubject): PlateStyle = when (subject) {
        is PlateSubject.Achievement -> {
            val (finish, metal) = subject.rarity?.let(::rarityPlate) ?: (PlateFinish.Engrave to PlateMetal.Indigo)
            PlateStyle(PlateFamily.Achievement, finish, metal)
        }
        is PlateSubject.Rank -> PlateStyle(PlateFamily.Rank, PlateFinish.Emboss, metal(subject.rank))
        PlateSubject.Mission -> PlateStyle(PlateFamily.Mission, PlateFinish.Scratch, PlateMetal.Obsidian)
    }

    private fun rarityPlate(rarity: AchievementRarity): Pair<PlateFinish, PlateMetal> = when (rarity) {
        AchievementRarity.Common -> PlateFinish.Engrave to PlateMetal.Bronze
        AchievementRarity.Rare -> PlateFinish.Engrave to PlateMetal.Silver
        AchievementRarity.Epic -> PlateFinish.Emboss to PlateMetal.Platinum
        AchievementRarity.Legendary -> PlateFinish.Emboss to PlateMetal.Gold
        AchievementRarity.Mythic -> PlateFinish.Emboss to PlateMetal.Prism
    }

    /** La matière de l'écu du rang : cuivre, bronze, argent, or, platine, obsidienne, prisme. */
    public fun metal(rank: GloryRank): PlateMetal = when (rank) {
        GloryRank.Murmure, GloryRank.Echo -> PlateMetal.Copper
        GloryRank.Voix, GloryRank.Conteur -> PlateMetal.Bronze
        GloryRank.Passeur, GloryRank.Polyglotte -> PlateMetal.Silver
        GloryRank.Ambassadeur, GloryRank.Orateur -> PlateMetal.Gold
        GloryRank.Oracle -> PlateMetal.Platinum
        GloryRank.Legende -> PlateMetal.Obsidian
        GloryRank.Mythe -> PlateMetal.Prism
    }

    private fun graphemes(text: String): List<String> {
        val iterator = BreakIterator.getCharacterInstance(Locale.ROOT).apply { setText(text) }
        val out = ArrayList<String>()
        var start = iterator.first()
        var end = iterator.next()
        while (end != BreakIterator.DONE) {
            out += text.substring(start, end)
            start = end
            end = iterator.next()
        }
        return out
    }

    private fun bareHandle(handle: String): String =
        Normalizer.normalize(handle.trim(), Normalizer.Form.NFC).dropWhile { it == '@' }

    /** `@pseudo`, normalisé NFC, coupé à 16 graphèmes dont « … ». */
    public fun engravedHandle(handle: String): String {
        val units = graphemes(bareHandle(handle))
        val kept = if (units.size > MAX_HANDLE_GRAPHEMES) {
            units.take(MAX_HANDLE_GRAPHEMES - 1).joinToString("") + "…"
        } else {
            units.joinToString("")
        }
        return "@$kept"
    }

    /** Les deux premières lettres ou chiffres du pseudo, en capitales. */
    public fun monogram(handle: String): String =
        graphemes(bareHandle(handle))
            .filter { unit -> unit.codePointAt(0).let { Character.isLetter(it) || Character.isDigit(it) } }
            .take(2).joinToString("").uppercase(Locale.ROOT)

    public fun plate(subject: PlateSubject?, author: PhotoAuthor?): AuthorPlate? {
        if (subject == null || author == null || bareHandle(author.handle).isEmpty()) return null
        return AuthorPlate(
            style = style(subject),
            name = engravedHandle(author.handle),
            monogram = monogram(author.handle),
            avatar = author.avatar,
        )
    }

    /** L'auteur, depuis le compte : un compte inscrit a un pseudo public ; un invité, non. Le nom d'affichage n'entre jamais. */
    public fun author(username: String?, isAnonymous: Boolean, avatar: String?): PhotoAuthor? {
        if (isAnonymous || username == null || bareHandle(username).isEmpty()) return null
        val picture = avatar?.trim()?.takeIf { it.isNotEmpty() }
        return PhotoAuthor(username, picture)
    }
}
