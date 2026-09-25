## Leçon 472 — Une feature qu'AUCUNE DONNÉE n'exerce ne se vérifie pas au simulateur

**Le fait (2026-09-03, #4926).** Le Prisme audio des readers était corrigé,
compilé, couvert par 53 témoins. La règle du dépôt exige une vérification au
simulateur avant fermeture. Elle était **impossible** :

| source | posts | médias audio |
|---|---|---|
| `GET /posts/feed?limit=100` | 20 | **0** |
| `GET /posts/feed/reels?limit=50` | 50 | **0** |

Zéro transcription, zéro piste traduite. Le chemin corrigé n'avait aucune donnée
pour être emprunté.

**Le piège n'est pas de ne pas pouvoir vérifier — c'est de croire qu'on a
vérifié.** Ouvrir l'app, voir le fil s'afficher, ne rien casser : tous les
signes d'une vérification réussie sont là, et le chemin corrigé n'a pas été
touché une seule fois. C'est le pire des verts, parce qu'il est indiscernable du
vrai.

> **Avant de vérifier une feature à l'écran, mesurer si la DONNÉE qui l'exerce
> existe.** Une requête API sur le compte de test coûte trente secondes et
> tranche. Sans elle, « vérifié au simulateur » ne veut rien dire — on a vérifié
> que l'écran s'ouvre.

**Trois conséquences, à déclarer plutôt qu'à laisser implicites :**

1. La vérification à l'écran reste DUE, et elle exige de **fabriquer** la donnée
   (publier, attendre le pipeline). C'est un travail de recette à part entière,
   pas un tap de plus.
2. La **dimension 10** (utilité — *l'a-t-on mesuré ?*) n'est pas mûre : ce lot
   livre une PARITÉ, pas une feature dont l'usage est mesuré. Le dire est plus
   honnête que de fermer sur les témoins seuls.
3. **Une mesure de fil est PERSONNALISÉE.** « 0 audio sur 70 posts atteignables
   par le compte de démo » ne dit PAS « aucun post audio n'existe ». Le sur-lire
   fabriquerait une conclusion sur la base à partir d'une vue.

Voisines : la 468 (les rouges qui ne sont pas des tests rouges), et le motif
inverse — un vert qui inclut une suite NON EXÉCUTÉE est indiscernable d'un vert
complet ; se le prouver coûte un `grep` sur `Test Case '-[Suite` (7 cas démarrés,
7 passés).
