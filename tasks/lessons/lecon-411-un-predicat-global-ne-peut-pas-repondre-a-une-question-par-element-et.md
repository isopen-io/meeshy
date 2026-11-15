## Leçon 411 — Un prédicat GLOBAL ne peut pas répondre à une question PAR ÉLÉMENT, et sa propre documentation le disait

**Le symptôme** (2026-09-01, story `6a9728e3…`) : la dernière story d'`atabeth` ne montre RIEN au lecteur. Sa scène v3 est `{"v":3,"scenes":[{"objects":[]}]}` — réellement vide. Deux posts `STORY` à **451 ms** d'intervalle, issus d'UNE publication : l'un peuplé, l'autre fantôme. Le bandeau montrant la plus récente, le fantôme masquait la vraie.

**La chaîne.** Publier une story crée **un post PAR slide**. Entre le composer et cette boucle, trois sites, et pas un ne demande si UNE slide vaut d'être publiée :

| site | portée |
|---|---|
| `canPublish` = `composerHasContent \|\| composerCarriesAudio` | `slides.contains { … }` — **toutes** |
| `handoffSlides` | rend **toutes** les slides |
| la boucle d'upload | **un POST par slide**, sans garde |

Une seule slide pleine rend la publication légale, et **toutes** les autres partent avec elle.

> **Un prédicat « y a-t-il DE QUOI » ne répond jamais « CELUI-CI en vaut-il la peine ».** Les deux se ressemblent au point qu'on prend l'un pour l'autre — jusqu'à ce qu'un deuxième élément existe.

**Ce qui rend ce défaut remarquable : la règle par élément était DÉJÀ ÉCRITE.** `slideHasContent` existe, sert la page blanche de l'auteur, et son doc-comment nomme la divergence mot pour mot :

> « `composerHasContent` répond "y a-t-il de quoi publier" ; la page blanche d'auteur pose l'autre question — "la slide que je REGARDE est-elle vierge" — **et les deux réponses divergent dès la 2ᵉ slide**. »

Le chemin de publication ne l'appelait jamais. **Ce n'était pas une règle manquante, c'était une règle non BRANCHÉE là où elle décide** — la même forme que la « feature non alimentée », appliquée à un prédicat.

> Quand un doc-comment décrit une divergence entre deux prédicats, chercher tout de suite **qui appelle lequel**. La phrase qui explique le piège est souvent écrite à côté du site qui y tombe.

**Le piège du correctif.** Filtrer sur `slideHasContent` SEUL supprimerait la story « fond + musique », dont l'audio est la matière narrative : `canPublish` la reconnaît par un SECOND terme que le prédicat visuel ne porte pas. Un filtre doit reprendre **les deux moitiés** du gate qu'il raffine, sinon il corrige un défaut en en créant un pire — perdre le contenu de l'auteur. D'où `slideIsWorthPublishing = slideHasContent(…) || slideCarriesAudio(…)`, et un repli qui **rend la liste d'origine si le filtre vide tout** : une publication qui ne part pas est un bouton sans effet (loi 4).

Détail : #4730. La moitié LECTEUR — que faire des stories vides déjà publiées — est une décision produit (#4731), pas une évidence technique.
