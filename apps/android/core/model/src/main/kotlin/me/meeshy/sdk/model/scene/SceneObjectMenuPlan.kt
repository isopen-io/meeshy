package me.meeshy.sdk.model.scene

/**
 * Le menu d'appui long d'un objet de la scène (miroir de `StoryCanvasContextAction.offered`, iOS), dans son ordre
 * d'affichage. Loi 4 : une action sans effet est ABSENTE, jamais grisée. Le menu, le rail et les actions
 * d'accessibilité lisent ce même plan.
 */
public object SceneObjectMenuPlan {

    public enum class Action {
        EDIT, TRIM, DUPLICATE, BRING_FORWARD, SEND_BACKWARD, LEAVE_SCENE,
        SET_AS_BACKGROUND, REPLACE_BACKGROUND, DELETE;

        /** La seule entrée qui détruit : couleur d'alerte, rangée en dernier. */
        public val isDestructive: Boolean get() = this == DELETE
    }

    /** Ce que l'hôte sait FAIRE ; chaque capacité dit un effet câblé, et le défaut ferme. */
    public data class Capabilities(
        val hasEditor: Boolean = false,
        val canTrim: Boolean = false,
        val canDuplicate: Boolean = true,
        val canLeaveScene: Boolean = false,
        val canBecomeBackground: Boolean = false,
        val sceneHasBackground: Boolean = false,
    )

    /** Ce que l'objet EST : le résultat des prédicats partagés. */
    public data class Subject(
        val isLocked: Boolean = false,
        val isBackground: Boolean = false,
        val sharesPlaneWithAnother: Boolean = false,
        val hasTrimmableSource: Boolean = false,
    )

    public fun subject(lists: SceneLists, id: String): Subject = Subject(
        isLocked = SceneObjectPredicates.isLocked(lists, id),
        isBackground = SceneObjectPredicates.isBackground(lists, id),
        sharesPlaneWithAnother = SceneObjectPredicates.sharesPlaneWithAnother(lists, id),
        hasTrimmableSource = SceneObjectPredicates.hasTrimmableSource(lists, id),
    )

    /** Les actions d'un objet de [lists] ; un objet disparu n'a pas de menu. */
    public fun offered(lists: SceneLists, id: String, capabilities: Capabilities): List<Action> =
        if (lists.sceneObject(id) == null) emptyList() else offered(subject(lists, id), capabilities)

    public fun offered(subject: Subject, capabilities: Capabilities): List<Action> = with(subject) {
        val stacks = !isBackground && sharesPlaneWithAnother
        buildList {
            if (!isLocked && capabilities.hasEditor) add(Action.EDIT)
            if (!isLocked && capabilities.canTrim && hasTrimmableSource) add(Action.TRIM)
            if (!isLocked && capabilities.canDuplicate) add(Action.DUPLICATE)
            if (stacks) {
                add(Action.BRING_FORWARD)
                add(Action.SEND_BACKWARD)
            }
            if (!isLocked && capabilities.canLeaveScene) add(Action.LEAVE_SCENE)
            if (!isLocked && !isBackground && capabilities.canBecomeBackground) {
                add(if (capabilities.sceneHasBackground) Action.REPLACE_BACKGROUND else Action.SET_AS_BACKGROUND)
            }
            if (!isLocked) add(Action.DELETE)
        }
    }
}
