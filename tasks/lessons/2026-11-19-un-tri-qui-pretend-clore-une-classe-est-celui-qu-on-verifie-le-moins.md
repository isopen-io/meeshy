## Un tri qui prétend CLORE une classe est celui qu'on vérifie le moins

*2026-11-19, cycle 185 (#19803 → #19909, #19910). Mesuré par l'audit adversarial
du lot, qui a rendu un verdict BLOQUANT sur la mesure centrale du lot.*

### Ce qui s'est passé

#19748 avait trié les 83 égalités nues de `deletedAt` du dépôt et conclu : 81 sont
exactes (76 sur `Message`, où la discipline d'écriture est complète, 5 sur une
relation vers `Message`), **il en reste deux**. Mon lot a pris ces deux-là, et s'est
présenté comme « la dernière colonne du tri : le fermer permet de fermer #19748 ».

Il en restait **cinq**. Les trois manquantes vivaient dans
`routes/me/export-sections.ts`, sur les mêmes modèles (`Post`, `PostComment`), et
elles vidaient l'export RGPD : `GET /me/export` rendait zéro post, zéro story, zéro
commentaire pour tout compte, avec `total: 0`.

Je n'ai pas vérifié le tri. Je l'ai **recopié**, et la phrase fausse qui en découlait
(« ce site est le seul du dépôt à lire cette colonne par une égalité ») s'est
retrouvée écrite à **quatre endroits** — commentaire de production, en-tête du
témoin, corps de l'issue, journal — chacun la tenant du précédent.

### La règle

**Une énumération porte DEUX affirmations, et le tri qui prétend clore la classe
rend la seconde invisible :**

| affirmation | se vérifie comment | vérifiée en pratique |
|---|---|---|
| « ces sites appliquent la règle » | on les ouvre | presque toujours |
| « ce sont les sites OÙ la règle s'applique » | on refait le balayage | presque jamais |

C'est la leçon 261 du dépôt. Ce qui est neuf ici, c'est **le moment où elle mord** :
non pas quand on écrit l'inventaire, mais quand un lot ultérieur s'appuie sur son
COMPTE pour se déclarer terminal. Un tri qui dit « il en reste deux » est une
invitation à ne plus compter — il a l'air d'avoir déjà fait le travail.

> Le dépôt a déjà la règle pour un compte (cycle 93 : « un compte est une
> AFFIRMATION, il se compte, il ne s'hérite pas »), pour un tri d'inventaire
> (cycle 86 bis) et pour un commentaire qui énonce une contrainte (cycle 94). Les
> trois disent la même chose d'un angle différent, et aucune ne m'a arrêté, parce
> que je ne lisais pas un compte comme un compte : je lisais **une classe comme
> close**.

### Ce qu'il faut faire, mécaniquement

1. **Devant un lot qui se dit « le dernier de » quelque chose, refaire le balayage
   AVANT d'écrire la première ligne.** C'est un `grep` ; le coût est nul face à celui
   de publier un faux compte dans quatre fichiers.
2. **Le balayage se refait par MODÈLE, pas par colonne.** Le tri de #19748 était juste
   sur `Message` (où une discipline d'écriture le soutient) et faux partout ailleurs.
   Un verdict qui vaut pour la population majoritaire se lit comme un verdict sur la
   colonne.
3. **Ne jamais écrire « le seul site du dépôt ».** C'est une affirmation d'exhaustivité
   qui se périme au premier fichier ajouté et qu'aucun cliquet ne garde. Si elle est
   portante, elle doit être un CLIQUET, pas une phrase.
4. **Et une phrase recopiée dans N fichiers se corrige dans les N.** L'audit a dû
   nommer les quatre sites un par un pour que la correction soit complète.

### Le corollaire qui m'a le plus coûté

J'avais aussi conclu qu'un ordre de fusion (« l'autre lot d'abord, le mien ensuite »)
refermait le risque de mon correctif. **Un ordonnancement ne referme que les
conséquences qui dépendent de l'ordre.** L'autre lot gardait l'égalité nue : mon
correctif restait l'INTERRUPTEUR du chemin, dans quel que soit l'ordre, et trois des
quatre conséquences atterrissaient avec lui seul. Je l'avais présenté comme la
réponse au risque entier ; il n'en couvrait qu'un quart, et le moins grave.

> Devant tout « il suffit de livrer dans cet ordre », demander : **qu'est-ce qui
> devient vrai à cause de l'ordre, et qu'est-ce qui devient vrai à cause de mon
> patch ?** Seul le premier ensemble est gouverné par l'ordre.

### Et la leçon de témoin, enfreinte sur le site qu'elle réparait

Ce lot dénonçait « un témoin qui recopie la clause ne vérifie que sa propre copie »
— et ne gardait son propre site que par un `readFileSync` + `toContain(...)` et un
`matchesMongoWhere` contre une clause réécrite à la main. Aucun des deux n'appelle la
fonction.

**Écrire la leçon ne protège pas de la commettre.** La règle utile n'est pas l'énoncé,
c'est la question mécanique à poser à chaque témoin : *appelle-t-il la fonction ?* Si
la réponse est non, il atteste une forme, pas un effet — quelle que soit la qualité du
commentaire au-dessus.
