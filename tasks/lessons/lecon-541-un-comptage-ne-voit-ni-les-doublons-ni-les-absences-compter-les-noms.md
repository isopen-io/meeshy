## Leçon 541 — Un COMPTAGE ne voit ni les doublons ni les absences : compter les noms DISTINCTS

**2026-09-06, résolution de conflit sur `v3-nouveau-lien-depuis-le-fil.spec.ts` (merge `5bc2447960`).**

En résolvant le conflit de #5350 j'ai vérifié ma fusion, et je l'ai vérifiée
sérieusement : **128/128 accolades appariées, 6 `describe`, 14 `test`**. Les
trois comptes étaient JUSTES. Le fichier compilait, les tests s'exécutaient.

Il portait pourtant **deux `describe` de même nom**, verbatim identiques
— « les rendus que le rapport regarde », aux lignes 331 et 410. Playwright
refuse alors de DÉMARRER :

```
Error: duplicate test title "les rendus que le rapport regarde › captures 390×844 — …"
       first declared in visual/v3-nouveau-lien-depuis-le-fil.spec.ts:332
```

Conséquence hors de proportion avec la cause : le gate `A11y web-v3` est devenu
rouge sur `dev` **et sur toute PR qui en hérite**. Trois PR ouvertes (#5359,
#5363, #5365) y échouaient simultanément, dont une sur les routes voice du
gateway — **dont l'échec n'avait aucun rapport avec son contenu**. Le temps que
trois sessions pouvaient perdre à diagnostiquer trois faux problèmes est le vrai
coût.

> **Un total est aveugle à l'identité de ses termes.** « 6 describes » est vrai
> qu'ils portent six noms ou trois noms doublés. La vérification qui l'attrape
> ne coûte pas plus cher — elle change seulement d'unité :
> `grep -o "describe('[^']*'" f | sort | uniq -c | sort -rn`. Compter les noms
> DISTINCTS, jamais les occurrences.

Le motif est plus large que les tests. Toute fusion qui réapplique un diff
contre un blob qui a bougé peut dupliquer un bloc VERBATIM : la duplication ne
casse ni la syntaxe, ni le typage, ni les accolades — les trois choses qu'on
pense à vérifier. Elle ne se voit qu'en cherchant des NOMS répétés.

### Le corollaire, tombé le même jour : une repro qui passe des deux côtés ne prouve rien

Sur le second gate rouge du même lot (`Chaînes web-v3`), j'ai écrit un correctif
plausible, puis reproduit en local : **4/4 verts**. J'ai failli l'annoncer
comme corrigé. Le témoin SANS le correctif rend **4/4 verts aussi** — puis
22/22 sur la suite entière. La repro locale tourne en 1,3 min là où le runner
met 3,7 min : la course ne s'y joue jamais.

> **Un vert obtenu des deux côtés du diff ne mesure pas le diff — il mesure la
> machine.** Avant d'annoncer une correction sur un défaut de TIMING, exiger le
> témoin qui ÉCHOUE sans elle. Sans lui, on ne sait pas si l'on a corrigé
> quelque chose ou seulement couru plus vite. Et le dire dans le fichier : le
> doc-comment du correctif porte ce qui est MESURÉ (les échecs CI, leur motif)
> et ce qui ne l'est PAS (le chemin exact de la fuite d'état).

C'est la forme jumelle de la leçon 540 (« une vérification qui confirme
l'hypothèse au lieu de l'éprouver ») avec une différence utile : ici la
vérification n'était pas complaisante, elle était **hors de portée du
phénomène**. Une repro trop rapide et un filtre trop étroit rendent le même
silence — le vert par omission.

### Troisième volet, même journée : deux correctifs concurrents d'un doublon s'ADDITIONNENT

Le doublon ci-dessus a été corrigé **deux fois, en parallèle, par deux
sessions** — et chacune a retiré un bloc DIFFÉRENT :

```
aa302f076b (#5362, mergée)  retire le PREMIER (milieu de fichier)
d637aa4a0b (point d'étape)  retire celui de FIN
```

Somme : **plus aucun bloc**. Le témoin des captures 390×844 clair/sombre a
disparu du dépôt. Git n'a signalé aucun conflit — deux suppressions de blocs
distincts se fusionnent proprement.

**Et le gate est passé VERT.** C'est ce qui rend ce défaut dangereux : le
symptôme visé (le doublon) avait bien disparu, donc `A11y web-v3` ne rougissait
plus. **Un témoin absent ne peut pas échouer** — la suppression de trop se
présentait exactement comme la réussite du correctif. Le fichier serait parti
amputé sur `main` sans une relecture de dernière minute.

> **Un merge SANS CONFLIT de deux suppressions concurrentes n'est pas une
> réconciliation : c'est une addition.** Vérifier la disparition du SYMPTÔME
> (« plus de doublon », « le merge est passé ») ne dit rien de l'ÉTAT FINAL.
> Compter ce qui doit RESTER, jamais constater ce qui a disparu.

Corollaire de pilotage, appris en le payant : **fermer une PR redondante ne
défait pas son diff.** J'avais fermé #5367 comme doublon de #5362 en croyant le
sujet clos ; son correctif vivait déjà dans un WIP en vol chez une autre
session. Une PR fermée retire une INTENTION du tableau, pas un changement d'un
arbre de travail.

C'est la forme collective de la leçon ci-dessus : là, un comptage était aveugle
aux noms de ses termes ; ici, il est aveugle au fait qu'une autre main corrige
le même défaut au même moment. Dans un arbre partagé par plusieurs sessions, la
question « ai-je corrigé ce défaut ? » est incomplète — la bonne est
**« combien de fois ce défaut a-t-il été corrigé, et que reste-t-il ? »**.
