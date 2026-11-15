## 2026-11-08 : La navigation est une pile typée `NavigationStack(path:)` sur `Route`, et la décision « ZStack custom » de 2025-01 est remplacée (#16901)

**Contexte.** La décision `2025-01-navigation-zstack-custom-pas-navigationstack.md` dit que l'app n'utilise pas `NavigationStack` (pas de deep link, retour manuel). Le code l'a quittée depuis longtemps. Mesuré sur `dev` le 2026-11-08 :
- `RootView.swift:161` et `AdaptiveRootView.swift:554` / `:587` montent `NavigationStack(path: $router.path)` avec `.navigationDestination(for: Route.self)` ;
- `Route` (`Features/Navigation/Router.swift`) est une énumération `Hashable` d'environ 90 cas, que `DeepLinkRouter` et `RouterCommands` alimentent ;
- les présentations modales restent locales : 293 `.sheet` / `.fullScreenCover` dans l'app, et `RootView` porte encore des booléens de présentation (`showFeed`, `showMenu`, `showSharePicker`…).

Une décision qui contredit le code égare la session suivante. Elle ne doit pas rester « Acceptée ».

**Décision.**
1. **La pile est la source de vérité de la navigation poussée** : un écran qui entre dans l'historique et se quitte par le glissement du bord est un cas de `Route`, poussé via `Router`. Il ne se monte jamais dans un `ZStack` à booléen.
2. **Une intention de navigation passe par `Router` / `RouterCommands`**, jamais par `NotificationCenter`. Les émetteurs restants (`.navigateToConversation` dans `CallView+Header` et `VitrineStage`, `.openStoryComposer` dans `StoryExpiredContent` et la Vitrine) migrent quand leur fichier est touché.
3. **Les présentations modales migrent vers une valeur du `Router`**, en ajout pur : un `enum` `Identifiable` pour les feuilles et un pour les couvertures, avec un seul `.sheet(item:)` / `.fullScreenCover(item:)` à la racine. On commence par les booléens de `RootView`.
4. **La table des liens profonds ne change pas** : les cas de `Route` et les formats d'URL servis à la NSE, à l'extension de partage, aux widgets et aux Live Activities (décision du 2026-08-13) restent stables ; on n'y ajoute qu'en fin.

**Conséquences.**
- `2025-01-navigation-zstack-custom-pas-navigationstack.md` passe au statut « Remplacée » et pointe ici.
- Les points 2 et 3 sont de la dette suivie par issue, pas un chantier ouvert par cette décision.
