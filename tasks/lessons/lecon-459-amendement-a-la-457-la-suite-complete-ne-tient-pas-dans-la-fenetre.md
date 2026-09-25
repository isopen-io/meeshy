## Leçon 459 (amendement à la 457) — « la suite complète ne tient pas dans la fenêtre » était FAUX : elle se DÉCOUPE

La 457 conclut qu'un run ciblé ne prouve que ce qu'il nomme, et que la parade,
quand la suite complète ne tient pas dans la fenêtre disponible, est de la faire
tourner ailleurs (la CI) et d'attendre son verdict.

La prémisse était fausse, et je l'ai portée toute la journée : « la suite SDK
prend ~31 min et se fait tuer vers 20 en tâche de fond ». C'est vrai des **deux
cibles ensemble**. Mesuré :

| moitié | témoins | durée |
|---|---|---|
| `-only-testing:MeeshyUITests` | **4 044** | **684 s** (11 min) |
| `-only-testing:MeeshySDKTests` | 680 + XCTest | ~2 min |

Chaque moitié tient LARGEMENT. Le renoncement qui m'a fait me rabattre sur des
runs ciblés — et laisser passer deux régressions pendant des heures — reposait
sur une contrainte que je n'avais jamais mesurée séparément.

> **Devant une limite qui force un compromis, mesurer la limite AVANT de
> l'accepter.** « Ça ne tient pas » est une affirmation sur un tout ; elle ne dit
> rien de ses parties. Ici, la découpe la plus évidente qui soit — une cible de
> test — suffisait, et personne (moi compris) n'avait essayé.

Et le corollaire qui rend la 457 encore vraie mais moins fataliste : la CI reste
le seul endroit qui exécute TOUT, mais elle n'est plus le seul recours. Un lot
qui touche le SDK peut se vérifier en local, en deux commandes, avant de pousser.
