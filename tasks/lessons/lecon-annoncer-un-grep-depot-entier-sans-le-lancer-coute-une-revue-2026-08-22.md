## Leçon — annoncer un grep « dépôt entier » sans le lancer coûte une revue (2026-08-22)

Itération 237i, suite. L'analyse affirmait, dans sa section « Vérification » :

> **`formatCount` n'a plus qu'une occurrence** dans tout `apps/ios` : la ligne
> de doc-comment qui explique ce qu'il a remplacé (`grep` sur le dépôt entier,
> méthode imposée par la leçon 236i).

Deux choses ne vont pas dans cette phrase, et la seconde est la vraie.

La première est visible à l'œil : « dans tout `apps/ios` » et « sur le dépôt
entier » ne peuvent pas être vrais ensemble. La seconde est que **le dépôt
n'avait pas été grepé** : la commande avait porté sur `apps/ios` seul. La revue
de merge a trouvé en trois minutes ce que la vérification annonçait avoir
couvert — le jumeau `formatCount`, copie mot pour mot, dans
`packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityListView.swift`.
Merger l'app seule aurait rendu les deux cartes communauté **incohérentes** :
« 1,5 k » d'un côté, « 1.5k » de l'autre.

L'aggravant : l'itération **citait la leçon 236i** — « un grep de fermeture part
de la CLÉ, jamais de la SURFACE » — dans le paragraphe même où elle la violait.
Citer une leçon n'est pas l'appliquer.

> **Un `grep -rn --include=*.swift .` coûte une seconde. Le restreindre à un
> sous-arbre parce qu'« évidemment le reste ne peut pas contenir ça » coûte une
> revue — et, si la revue avait laissé passer, une incohérence en production.**
> Sur ce dépôt en particulier, le réflexe `apps/ios` est faux par construction :
> `packages/MeeshySDK/Sources/MeeshyUI/` contient des VUES, donc les mêmes
> défauts d'affichage que l'app.

Effet secondaire instructif : le grep refait pour de bon a trouvé **six sites de
plus** de la même famille (`FeedPostCard`, `PostDetailReachAndVisibility`,
`ReelFeedCard`, `ReelsPlayerView`, `ConversationDashboardView` ×2). Ils ne sont
pas byte-identiques — le tableau de bord bascule à `>= 10_000` là où le feed
bascule à `>= 1_000` — donc les absorber demandait de trancher si ce seuil est
intentionnel. Ils sont documentés pour l'itération suivante plutôt qu'avalés en
passant : **la bonne réponse à « le correctif est incomplet » n'est pas toujours
« élargir la PR »**, mais elle est toujours « dire exactement ce qui reste ».

Corollaire sur la forme du correctif :

> **Quand un défaut existe des deux côtés d'une frontière de module, porter
> l'APPEL duplique la règle ; déplacer le HELPER la garde unique.** La revue
> proposait de recopier l'appel dans le fichier SDK. Un formateur sans état à
> paramètres opaques relève de la case « rule engines stateless → SDK » du
> tableau de placement : le déplacer dans `MeeshyUI` sert les deux appelants
> sans rien dupliquer, ne change aucun site d'appel (l'app importait déjà
> `MeeshyUI`), et rend même le `pbxproj` identique à `main` puisque les fichiers
> neufs vivent alors dans le package SPM.
