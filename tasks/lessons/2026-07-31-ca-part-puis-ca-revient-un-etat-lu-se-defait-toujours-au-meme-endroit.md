## 2026-07-31 — « Ça part puis ça revient » : un état lu se défait toujours au même endroit

Trois trous distincts produisaient un unique symptôme, et **aucun** n'était dans le code
qui pose l'état lu — tous étaient dans le code qui le RELIT.

**Leçons :**
1. **Un état optimiste qui n'est pas écrit dans le cache n'existe pas.** L'état « lu » des
   notifications ne vivait que dans le tableau `@Published` de la liste ; le store GRDB
   gardait `isRead:false`. Comme `loadInitial()` lit le cache d'abord avec une fenêtre
   fraîche de 2 min, rouvrir la cloche re-servait l'instantané d'avant le marquage. Règle :
   pour toute mutation locale optimiste, se demander *quel est le prochain lecteur, et que
   verra-t-il ?* — pas seulement *l'écran courant est-il à jour ?*
2. **Une garde posée sur un chemin doit l'être sur TOUS les chemins.** `handleUnreadUpdated`
   protégeait déjà la conversation ouverte contre les broadcasts socket. Personne n'avait
   posé la même garde sur `fullSync` / `deltaSyncCore`, qui écrivent le MÊME champ dans le
   MÊME cache. Chercher systématiquement les autres écrivains d'un champ avant de conclure
   qu'il est protégé.
3. **Un enum de validation serveur est un contrat client silencieusement rompu.** iOS envoyait
   `source: "story"`, absent de l'enum → 400 à chaque slide, `impressionCount` figé à 0 sur
   toutes les stories depuis toujours. Même classe que le fix `reports` (`f408b2584`). Quand
   deux schémas listent les mêmes valeurs, en faire UNE constante partagée.
4. **Relire son propre correctif comme celui d'un autre.** Mon fix était incomplet :
   `fullSync` persiste sa 1re page avant d'avoir les suivantes, donc la 2e écriture
   confrontait les pages 2+ à un cache tronqué et reperdait leur frontière. Trouvé
   uniquement en relisant, pas par les tests — que j'avais écrits trop faibles pour le voir.
5. **Un test qui passe du premier coup n'a rien prouvé.** Mon test de non-régression passait
   AVEC ET SANS le correctif : le mock renvoyait les mêmes ids à chaque page, donc le code
   de fusion des pages 2+ n'était jamais atteint. Toujours retirer le correctif et exiger le
   rouge — un test de régression non vu rouge est un test décoratif.
