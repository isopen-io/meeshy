## Leçon 608 — Un script de PREUVE qui lit mal rend des verts VIDES, et ce sont les plus rassurants (2026-09-14)

**Cas.** Pour prouver le flux #6424 sur staging, un script en six étapes lisait
la base par `ssh root@… "docker exec … mongosh --eval '<js>'"`. Le `<js>`
contenait des guillemets simples ; les couches shell les ont mangés ; `mongosh`
a rendu une chaîne VIDE. Le script assérait alors :

```bash
printf '%s' "$LIGNE" | grep -q '"password"' && verdict "…" ko || verdict "la colonne password est ABSENTE" ok
```

`grep -q` sur du vide est faux, donc la branche `ok` s'exécutait : **« la
colonne password est ABSENTE » passait au vert sans qu'aucune ligne n'ait été
lue.** Même chose pour « le compteur n'a jamais été écrit ». Deux preuves
inexistantes, et ce sont précisément les deux qui rassuraient le plus.

Ce que la base disait vraiment, une fois le passage par base64 mis en place :
`{"password":null,"failedLoginAttempts":{"low":0,…}}` — les faits étaient bons.
**Le produit était juste ; l'instrument mentait.**

1. **Une assertion d'ABSENCE doit d'abord prouver la PRÉSENCE de la lecture.**
   La forme opérante est en deux temps : une garde `lu()` qui échoue si la
   réponse est vide, PUIS l'assertion. Sans elle, « absent » et « pas
   interrogé » rendent le même verdict — et c'est le vert.
2. **Assérer sur la VALEUR, jamais sur l'absence d'une sous-chaîne.**
   `grep -q '"password":null'` (ce que la base DIT) plutôt que
   `! grep -q '"password"'` (ce qu'elle ne dit pas) : la première ne peut pas
   passer sur du vide.
3. **Un `<js>` qui traverse ssh + docker + sh se transporte en base64.** Trois
   couches de shell, trois occasions de perdre un guillemet ; l'encodage retire
   la question au lieu de la compter.
4. **La leçon générale, et c'est elle qui pique** : ce dépôt passe ses journées
   à traquer « la garde qui ne garde rien » chez les autres. Un outil de
   VÉRIFICATION est du code comme un autre — il mérite la question qu'on pose à
   toute garde : *que rend-il quand ce qu'il mesure n'existe pas ?* Ici,
   « vert ». Le premier réflexe devant un script de preuve tout vert est de le
   faire échouer exprès (interroger un compte inexistant) et de vérifier qu'il
   rougit.

**La même faute est revenue TROIS fois de plus dans le même fichier, chaque
fois d'un cran plus fin** — et c'est la vraie leçon, parce que corriger
l'instance ne l'a jamais empêchée de revenir :

| l'assertion verdit… | parce que |
|---|---|
| sans avoir **lu** | `grep -q` sur une chaîne vide est faux |
| sans que l'action ait **eu lieu** | six connexions refusées en 429 |
| sans que l'action ait eu lieu **assez** | quatre essais sous un seuil de cinq |
| sans que la mesure soit **possible** | zéro essai, conclusion rendue quand même |

Une seule question les attrape toutes : **cette assertion peut-elle verdir pour
un motif étranger à ce qu'elle affirme ?** Elle se pose à l'écriture, pas au
débogage. Et un harnais a besoin de TROIS verdicts, pas deux : *prouvé*,
*réfuté*, et **non mesurable** — confondre le troisième avec le premier est ce
qui produit les verts vides, le confondre avec le second accuse le produit
d'une limite d'environnement.

**Corollaire, mesuré le même jour : un harnais peut s'étrangler lui-même.** La
clé du limiteur de connexion est `ip:<ip>:<3 premiers caractères de
l'identifiant>` (`utils/rate-limiter.ts`, 5 essais / 15 min). Toutes les
adresses de test commençant par `pre`, tous les passages partageaient un seul
seau : le deuxième était étranglé par le premier, et l'échec ressemblait à un
défaut du produit. Avant d'accuser le serveur d'un 429, lire la CLÉ du
limiteur — ce qu'elle agrège dit si deux exécutions du test sont, pour lui, la
même personne.
