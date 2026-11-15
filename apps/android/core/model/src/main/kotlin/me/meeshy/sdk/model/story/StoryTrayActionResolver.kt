package me.meeshy.sdk.model.story

/** Où mène l'appui sur l'avatar « Moi » du plateau — iOS `MyStoryAvatarAction`. */
enum class MyStoryAvatarAction { ManageStories, CreateStory }

/**
 * Une seule règle pour le routage de l'appui ET pour l'annonce TalkBack (iOS `StoryTrayActionResolver`) :
 * le libellé décrit la destination réelle, les deux ne peuvent plus diverger.
 *
 * Une story ACTIVE mène à « Mes stories » ; un historique entièrement expiré aussi (sinon plus aucun chemin
 * ne mène aux stories passées) ; rien du tout mène au composeur.
 */
object StoryTrayActionResolver {
    fun avatarTap(hasMyStory: Boolean, hasAnyStory: Boolean): MyStoryAvatarAction =
        if (hasMyStory || hasAnyStory) MyStoryAvatarAction.ManageStories else MyStoryAvatarAction.CreateStory
}
