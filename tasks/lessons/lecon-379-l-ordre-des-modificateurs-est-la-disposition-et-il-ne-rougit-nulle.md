## Leçon 379 — L'ORDRE des modificateurs EST la disposition, et il ne rougit nulle part

**Contexte (2026-09-01, #4633).** Directive porteur : « la bande gauche d'outil
doit être placée sur le plateau hors du canvas ». Mesure dans
`ComposerSceneSurface` :

```swift
EmbeddedSceneCanvas(...)
  .overlay(alignment: .leading) { floatingRail }        // AVANT le padding ⇒ SUR la scène
  .padding(.horizontal, ComposerRailGeometry.sceneInset(railsShown: true))
  .overlay(alignment: .bottomTrailing) { trailingRail } // APRÈS ⇒ dans le couloir
```

Un overlay posé **avant** le padding a pour repère la vue nue : son `.leading`
tombe sur le bord de la scène. Posé **après**, le repère inclut les couloirs, et
il tombe sur le plateau.

La directive #4561 — « aucun rail ne se pose SUR la scène » — avait donc été
appliquée à **une moitié** de sa cible, pendant que le doc-comment de l'autre
moitié, douze lignes plus bas, affirmait « les deux rails vivent dans les
COULOIRS du plateau ».

Rien ne pouvait le signaler : les deux formes compilent, les deux montent le
rail, et **toute garde de PRÉSENCE reste verte** — le rail est bien là. La
différence ne se voit qu'au pixel, ou au doigt, quand on essaie de traîner un
objet sous la colonne et que la scène ne répond pas.

> **Quand la disposition est portée par l'ORDRE et non par une valeur, un témoin
> doit mesurer des POSITIONS dans la source, pas des occurrences.** Chercher
> « l'overlay est-il monté ? » répond à une question que personne ne se pose ;
> la vraie question est « avant ou après le modificateur qui définit son
> repère ? ».

`ComposerRailPlateauOrderTests` compare donc les index de deux fragments, et son
témoin le plus utile est le plus général : **aucun** `.overlay(alignment:` ne
doit précéder l'encastrement. Celui-là attrapera le troisième rail qu'on ajoutera
un jour, que les deux premiers ne décrivent pas.

Corollaire : ce défaut appartient à la famille du doc-comment qui énonce plus que
le code ne tient (Prisme, cycles 121-126). Ici le commentaire juste était **à
côté** du code faux, écrit dans le même geste, par la même main — la proximité
n'a rien protégé.

Voir [[reference_a_built_view_that_is_dropped_never_turns_red]],
[[reference_a_comment_asserting_more_than_the_fix_is_a_trap]].
