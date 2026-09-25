## Leçon 585 — Un gate qui ÉCRIT un état qui survit au run se sabote avec un tour de retard

2026-09-12, #6138. `ExplicitPluralLabelTests` (5 assertions) attendait le repli
anglais du catalogue et recevait du français, **sans qu'une ligne ait changé**.

La cause n'est pas dans le code : l'app écrit sa surcharge de langue dans SON
domaine de préférences — `me.meeshy.app.plist` → `AppleLanguages = ["fr"]`,
`meeshy.ui.language = "fr"` — et ce fichier SURVIT au run. Or la **phase 3 du
gate**, dont la raison d'être est « laisser l'app connectée », la pose elle-même.
Le gate est donc **vert au premier passage sur un appareil neuf, rouge à partir du
second**. L'appareil, lui, est bien en `en-US` : ce n'est pas l'environnement
qu'on croit interroger.

> **La question à poser à un gate n'est pas seulement « que lit-il ? » mais
> « qu'ÉCRIT-il, et où cela survit-il ? »** Un gate qui laisse un état derrière
> lui ne mesure plus son sujet : il mesure la trace de son passage précédent.

COROLLAIRE DE DIAGNOSTIC, et c'est lui qui fait gagner l'heure : **devant un rouge
qu'aucun diff n'explique, chercher ce que le run PRÉCÉDENT a laissé derrière lui
avant de chercher dans le code.** Un `git log` sur les fichiers concernés ne
rendra jamais rien, par construction — l'état fautif n'est pas versionné.

C'est le PENDANT, sur l'état PERSISTANT, de ce que la 583 dit du TEMPS : là un
témoin lisait avant que la peinture n'arrive, ici il lit après qu'un run a écrit.
Les deux mesurent autre chose que leur sujet, et aucune des deux ne se voit dans
un diff. La formule vaut pour les deux : **un témoin ne mesure son sujet que si
l'on sait ce qui le précède et ce qui l'entoure.**

Distinction utile pour ne pas confondre avec la 560 : là, un lot déplaçait le NOM
sous une garde ; ici, c'est le gate lui-même qui fabrique la condition de son
propre échec. Le premier est un accident de refactor, le second un défaut de
conception du dispositif.

Trouvée par la session `v2-meeshy-c7`, qui a laissé l'allocation du numéro à la
session tenant `tasks/lessons.md` — son propre fichier s'arrêtant à 574, y écrire
une 580 aurait rejoué exactement la 561.
