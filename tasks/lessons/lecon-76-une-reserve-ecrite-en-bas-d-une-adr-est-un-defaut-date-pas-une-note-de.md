## Leçon 76 — Une réserve écrite en bas d'une ADR est un défaut daté, pas une note de prudence (2026-08-10, routine messaging, cycle 55)

Les deux dernières ADR du gateway se terminaient par la même phrase, à un cycle d'intervalle : « les
`TrackingLink` visant une story détruite ne sont pas désactivés par cette passe ». Elle a été écrite
deux fois, relue deux fois, et n'a rien déclenché — parce que la rubrique qui l'accueille s'appelle
« ce que la décision n'assure PAS », et qu'une limite ASSUMÉE se lit comme une limite RÉSOLUE. Le
format transforme un défaut connu en périmètre.

Ce qui l'a rendue actionnable n'est pas une relecture plus attentive : c'est que le cycle précédent
a changé le monde autour d'elle. Tant que le balayage n'appariait aucun post, aucune story n'était
jamais détruite et la réserve ne décrivait qu'un cas de figure. Le balayage rendu effectif, la même
phrase décrit le sort de TOUTE story.

**Règle** : quand un cycle rend effectif un mécanisme qui ne l'était pas, relire les réserves que
les cycles précédents ont écrites SUR ce mécanisme — elles ont été rédigées sous l'hypothèse
implicite qu'il ne s'exécutait pas, et leur gravité vient de changer sans qu'un mot n'ait bougé.
Corollaire pratique : une réserve qui réapparaît à l'identique dans deux ADR successives n'est plus
une réserve, c'est un point de backlog qui a échoué à se faire nommer comme tel.
