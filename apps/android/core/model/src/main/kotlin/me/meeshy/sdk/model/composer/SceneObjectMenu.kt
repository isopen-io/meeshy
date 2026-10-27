package me.meeshy.sdk.model.composer

/**
 * Le menu d'appui long d'un objet de la scène (miroir de `StoryCanvasContextAction.offered`,
 * iOS) : ce qu'un objet offre VRAIMENT. Loi 4 du composeur — une action absente, jamais
 * grisée : on ne propose pas un geste dont le résultat serait l'écran d'avant.
 */
object SceneObjectMenu {

    enum class Action {
        EDIT, TRIM, DUPLICATE, BRING_FORWARD, SEND_BACKWARD, LEAVE_SCENE,
        SET_AS_BACKGROUND, REPLACE_BACKGROUND, DELETE;

        /** La seule entrée qui DÉTRUIT : couleur d'alerte, rangée en dernier. */
        val isDestructive: Boolean get() = this == DELETE
    }

    /**
     * Ce que l'hôte sait de l'objet touché. Les capacités ([hasEditor], [canLeaveScene],
     * [canBecomeBackground]) disent l'EFFET que l'hôte a câblé, jamais le profil : le défaut ferme.
     */
    data class Subject(
        val isLocked: Boolean = false,
        val isBackground: Boolean = false,
        val sharesPlaneWithAnother: Boolean = false,
        val hasEditor: Boolean = false,
        val canLeaveScene: Boolean = false,
        val hasTrimmableSource: Boolean = false,
        val canBecomeBackground: Boolean = false,
        val sceneHasBackground: Boolean = false,
        /** La scène peut porter un objet de plus de cette famille : sinon dupliquer ne ferait rien. */
        val canDuplicate: Boolean = true,
    )

    fun offered(subject: Subject): List<Action> = with(subject) {
        val stacks = !isBackground && sharesPlaneWithAnother
        buildList {
            if (!isLocked && hasEditor) add(Action.EDIT)
            if (!isLocked && hasTrimmableSource) add(Action.TRIM)
            if (!isLocked && canDuplicate) add(Action.DUPLICATE)
            if (stacks) addAll(listOf(Action.BRING_FORWARD, Action.SEND_BACKWARD))
            if (!isLocked && canLeaveScene) add(Action.LEAVE_SCENE)
            if (!isLocked && !isBackground && canBecomeBackground) {
                add(if (sceneHasBackground) Action.REPLACE_BACKGROUND else Action.SET_AS_BACKGROUND)
            }
            if (!isLocked) add(Action.DELETE)
        }
    }
}
