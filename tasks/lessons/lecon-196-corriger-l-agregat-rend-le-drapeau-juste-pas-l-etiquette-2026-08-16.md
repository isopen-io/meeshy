## Leçon 196 — corriger l'agrégat rend le drapeau juste, pas l'étiquette (2026-08-16, routine appels, Vague 131)

La Vague 129 avait corrigé `useRemoteCallAlerts` pour que `remoteScreenCapturing` reste vrai tant
qu'AU MOINS UN pair capture (un `Set<string>` par participant remplaçant un scalaire
dernier-arrivé-gagne). Correctif validé, testé, mergé — le booléen ne ment plus en appel de groupe.
Et pourtant l'UI continuait d'étiqueter l'alerte avec le nom du premier participant du roster
(`.find()`), sans rapport avec le VRAI capturant : le booléen était devenu cardinalité-sûr, mais
rien en aval n'avait de quoi savoir LEQUEL des N pairs il fallait nommer, parce que le hook
n'exposait toujours que le booléen agrégé — jamais l'identité qui l'avait produit.

**Le piège** : une fois l'agrégat corrigé et ses propres tests verts, la case semble cochée — le
signal ne ment plus. Mais « ne ment plus » (vrai/faux correct) et « nommable » (on sait qui) sont
deux garanties indépendantes. Un `Set` ou un OR peut être parfaitement exact en cardinalité tout en
étant muet sur l'identité — c'est même sa nature : agréger, c'est précisément perdre le detail
qu'on vient de sommer. Corriger l'agrégat ne répare le consommateur en aval que si ce consommateur
n'a jamais eu besoin de savoir LEQUEL — l'instant où l'UI doit nommer quelqu'un («
la connexion de qui se dégrade ? », « qui capture l'écran ? »), l'agrégat seul ne suffit plus, et
rien dans les tests de la Vague 129 (qui ne vérifiaient que le booléen) ne pouvait révéler ce trou :
ils étaient verts par construction, l'identité n'étant tout simplement pas dans leur périmètre.

**Variante de la Leçon 193** (« un plafond qu'on lève réveille chaque scalaire qui présumait un seul
pair ») mais distincte : 276 est déclenchée par un CHANGEMENT DE CARDINALITÉ externe (le cap qui
saute) exposant un scalaire jamais prévu pour N ; 279 se déclenche même sans aucun changement
externe, PAR le correctif cardinalité lui-même — corriger l'agrégat pour qu'il soit vrai en N ne
garantit rien sur les consommateurs qui, eux, veulent savoir qui parmi les N.

**Règle pour la suite.** Quand un correctif transforme un scalaire par-appel en agrégat par-participant
(`Set`, `Map`, compteur), vérifier explicitement CHAQUE consommateur en aval qui affiche ou
nomme quelque chose à partir de ce signal — pas seulement ceux qui testent sa valeur booléenne. Si
un consommateur a besoin d'un nom, d'un avatar, d'un lien profond vers UN participant précis, le
hook/service doit exposer l'identité (id, ou liste ordonnée d'ids) en plus du booléen agrégé,
jamais seulement après coup quand le bug de mauvais étiquetage est signalé séparément.
