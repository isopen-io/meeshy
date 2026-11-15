## Leçon 584 — Un DÉCOUPAGE éteint toute garde ancrée sur un FICHIER plutôt que sur l'unité — et l'asymétrie décide si on l'apprend

2026-09-12, #6117 / #6125-6127. `MeeshyComposerHost.swift` passait le plafond dur
de 1 200 lignes ; le découpage a déplacé `presentCamera` vers `+Intake` et
`composerStack` vers `+Surfaces`. Trois gardes ont rougi — dont
`ComposerSceneCaptureGestureTests`, qui lisait une **liste en dur de deux
fichiers** et a annoncé « le fichier lu n'est pas le meuble » : exact, et
parfaitement inutile.

Son propre doc-comment avait nommé le risque sans le refermer : « un
armement-au-montage réintroduit dans le fichier EXTRAIT n'aurait fait rougir
personne ». Elles lisent désormais `AppSourceGuard.composerHostSource()`, qui
suit le meuble ET ses extensions.

> **L'ASYMÉTRIE EST LA LEÇON, pas le rougissement.** Une garde qui cherche une
> PRÉSENCE rougit quand son ancre déménage — bruyant, mais on l'apprend le jour
> même. Une garde qui cherche une ABSENCE passe au VERT : son motif n'est plus
> dans le fichier qu'elle lit, donc elle ne trouve rien, donc elle est contente.
> Après tout découpage, ce sont les gardes d'ABSENCE qu'il faut relire — ce sont
> les seules dont le silence ne prouve rien.

Corollaire de forme : une garde s'ancre sur l'UNITÉ (le type et ses extensions),
jamais sur une liste de chemins. Un chemin est un fait d'aujourd'hui ; l'unité est
ce que la règle voulait dire. Même famille que la 560 (un lot qui RENOMME rend
anti-corrélé tout garde qui reconnaissait par le nom) : là c'est le NOM qui bouge
sous la garde, ici la POSITION dans l'arborescence.

Trouvée et corrigée par la session `v2-meeshy-c7`, qui a laissé l'allocation du
numéro à la session qui tenait `tasks/lessons.md` — précisément à cause de la 561.
