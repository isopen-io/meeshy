## Leçon 174 — Une capacité déclarée, câblée jusqu'au serveur, et jamais montée

`ExplodeOverlay` et `WaooOverlay` existaient, compilaient, et n'étaient montés
nulle part. Les drapeaux `explode` et `waoo` traversaient pourtant toute la
chaîne : sélection au composeur, bitfield persisté par le gateway, plan de
lecture correct côté client. Seul le dernier maillon manquait — le montage dans
l'`.overlay` du modifier.

Rien ne pouvait rougir. Le plan (`MessageEffectPlan`) était juste et testé, les
deux vues compilaient, et l'effet PARAISSAIT jouer parce que son `ViewModifier`
frère (`ExplodeEffect`, `WaooEffect`), lui, était bien monté. Un test de plan ne
voit pas un montage absent ; un test de compilation non plus.

**Le prédicat de détection.** Chercher les types qui sont *déclarés* mais dont le
nom n'apparaît à *aucun site d'appel* — pas seulement les symboles inutilisés au
sens du compilateur (une `View` publique ne déclenche aucun avertissement). Là où
une famille de composants doit être montée exhaustivement, écrire la garde en
**égalité d'ensembles** (déclarés == montés) plutôt qu'en présence individuelle :
c'est la seule forme qui attrape le membre ajouté demain et oublié.

**Corollaire de portée.** Une garde de montage doit aussi vérifier que chaque
membre est monté **derrière sa propre condition**. Brancher les quatre overlays
en dur satisferait une garde d'égalité tout en jouant les particules sur tous les
messages — le défaut inverse, et pire.
