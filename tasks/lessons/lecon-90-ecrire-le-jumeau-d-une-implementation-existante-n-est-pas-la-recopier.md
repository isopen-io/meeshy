## Leçon 90 — écrire le JUMEAU d'une implémentation existante n'est pas la recopier : c'est la première occasion de la juger (2026-08-10, routine messaging, cycle 62)

Le cycle devait porter sur le web une règle qu'iOS appliquait depuis longtemps
(`resolvedLastMessagePreview`). Le jumeau TypeScript a été écrit en miroir strict, ses 17 témoins
traduits un par un du fichier Swift, et tout est passé du premier coup. **Le miroir était fidèle et
la règle était fausse.**

Elle disait : « si la langue d'origine appartient au prisme du lecteur, afficher l'original ». Or
un prisme est une préférence **ORDONNÉE**. Cette formulation par appartenance bat la langue
PRIMAIRE dès que la langue d'origine occupe un rang inférieur — ce que produit mécaniquement la
locale appareil, entrée en 4e priorité. Prisme `['fr','en']`, message anglais, traduction française
disponible : elle rendait « Hello ». `CLAUDE.md` disait déjà l'inverse mot pour mot, et le chemin
du CORPS des messages appliquait déjà la bonne règle en ne comparant qu'à la langue de TÊTE.

**Leçons :**

1. **Un miroir de tests hérités ne peut pas voir un défaut hérité.** Les 17 témoins traduits du
   Swift verdissaient parce qu'ils encodaient la même règle que le code — j'en avais même écrit un,
   « rend l'aperçu brut même si la langue d'origine n'est pas la PREMIÈRE du prisme », qui
   *affirmait* le défaut. Traduire une suite de tests, c'est importer sa couverture ET ses angles
   morts. Le seul témoin qui pouvait trancher était un témoin **neuf**, écrit depuis la règle
   PRODUIT et non depuis le code source.
2. **Un court-circuit par APPARTENANCE dans une préférence ORDONNÉE est un bug de rang, toujours.**
   `preferred.contains(x)` jeté avant la boucle qui parcourt `preferred` annule l'ordre pour le cas
   `x`. La forme est greppable et le diagnostic mécanique : *cet élément a-t-il un rang ? alors il
   doit concourir à son rang, pas avant la boucle.* La bonne écriture est de le tester À
   L'INTÉRIEUR de la boucle.
3. **Quand deux chemins implémentent la même règle, celui qui est le plus vieux et le plus vu est
   l'arbitre — pas celui qu'on est en train de porter.** Le corps des messages comparait à la SEULE
   langue de tête ; la ligne de liste comparait à la liste entière. Il ne s'agissait pas de choisir
   entre deux conventions défendables : le premier était d'accord avec `CLAUDE.md`, le second non.
   **Avant de porter une règle, chercher son autre implémentation dans le dépôt et les faire
   s'expliquer.**
4. **Le témoin qui a vu le défaut est celui qui n'a PAS neutralisé son environnement.** C'est le
   test de composant, dans jsdom, qui a refusé de verdir — parce que `navigator.language` y vaut
   `'en-US'` et injecte donc une 4e langue dans le prisme, reproduisant exactement la condition
   réelle (locale appareil ≠ langue in-app). Un test qui aurait figé `navigator.language` « pour
   isoler l'unité » n'aurait rien vu, et la sonde de fidélité le confirme : le défaut de règle fait
   tomber 2 témoins shared **et 2 témoins web**, ces derniers uniquement grâce à cet environnement
   non neutralisé. Neutraliser l'environnement rend le test déterministe ; ça peut aussi le rendre
   aveugle au seul cas qui compte.
5. **Un défaut de RÈGLE se répare sur toutes ses copies, dans le même cycle.** Corriger le seul
   jumeau TypeScript aurait fait afficher deux textes différents pour un même compte selon le
   client — précisément la dérive que le jumeau existait pour empêcher. iOS a été corrigé avec, et
   la règle est montée d'un cran : elle vit maintenant dans `CLAUDE.md` § « Règles critiques du
   Prisme », pas seulement dans deux commentaires de code.
6. **« Le backlog sous-estimait le défaut » est un résultat de cycle, pas une digression.** L'entrée
   annonçait « il manque le résolveur côté web ». Le balayage préalable a montré que la donnée
   n'atteignait aucune couche où un résolveur aurait pu la lire (type absent, transformer qui jette,
   rendu brut) — et c'est en câblant ces quatre couches qu'on a heurté le défaut de règle, invisible
   tant qu'aucun appelant réel ne fournissait un prisme à plus d'une entrée. Re-prouver un candidat
   de backlog contre le code réel n'est pas une formalité d'ouverture : c'est ce qui change ce que
   le cycle trouve.
