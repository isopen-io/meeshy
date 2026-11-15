## Leçon 403 — Une garde MORTE est pire qu'une garde absente : l'absence se cherche, la présence rassure

**Contexte (2026-09-01, #4714).** En allant implémenter #4055 (« la légende d'un
média voyage jusqu'au serveur »), la mesure a rendu l'inverse de ce que l'issue
annonçait : la chaîne serveur était déjà complète. Mais `applyMediaText` — le
corps que `applyMediaAlt` et `applyMediaCaption` partagent — écrivait le texte
**verbatim** en base. Deux champs fournis par l'utilisateur, persistés sans
assainissement, servis ensuite à tous les lecteurs.

Le voisin immédiat, `content`, est assaini à **trois** sites de la même route.
L'écart n'était pas une doctrine : c'était un trou.

**Ce qui rend ce défaut particulier.** La garde EXISTAIT. `sanitizeMediaCaptions`
vivait dans `routes/posts/core.ts:177`, son doc-comment citait l'issue, elle
appelait le bon sanitiseur — et **aucune ligne du dépôt ne l'appelait, elle**.

> Une garde écrite puis jamais câblée ne se signale nulle part. Elle compile,
> elle se relit bien, et elle donne à qui la croise l'impression que le champ
> est gardé.

C'est la forme la plus coûteuse : quelqu'un cherchant « la légende est-elle
assainie ? » trouve la fonction, lit son corps, et conclut oui. TypeScript ne
l'attrape pas (fonction de module, hors portée de `noUnusedLocals`) et aucun
témoin ne peut tomber — elle n'est sur le chemin de rien.

**Le témoin qui l'attrape** n'interroge pas l'existence de la garde mais l'état
de la DONNÉE au bout : « qu'est-ce qui arrive en base ? ». C'est la même bascule
que la leçon 261 (un témoin de rang s'écrit sur un rang autre que le premier) et
que le cycle 122 du Prisme (« qui AFFICHE ce que le résolveur élit ? »).

**Deux corollaires de placement, tirés du correctif :**

- **L'assainissement est allé au point de passage OBLIGÉ avant la base**
  (`applyMediaText`), pas à la route comme `content`. La raison vient du défaut
  lui-même : deux routes écrivent ces colonnes (`createPost`, `updatePost`), et
  la troisième qu'on ajoutera repartirait sans garde. Une garde posée à la
  frontière de confiance se duplique à chaque entrée ; posée au dernier maillon
  avant l'écriture, il n'y a rien à oublier.
- **La jumelle morte est SUPPRIMÉE, pas rebranchée.** Elle ne couvrait que
  `caption` et aurait laissé `alt` sans garde pour exactement la même question —
  une seconde règle destinée à diverger, le motif que la fusion du même jour
  (`StoryAudioIdentity`) venait de payer.

**Réflexe.** Devant une fonction de garde, ne pas se demander seulement « fait-elle
la bonne chose ? » mais **« qui l'appelle ? »** — un `grep` de son nom, et si la
seule occurrence est sa déclaration, la garde n'existe pas.
