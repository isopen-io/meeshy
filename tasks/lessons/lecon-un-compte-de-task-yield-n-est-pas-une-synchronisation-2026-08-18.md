## Leçon — un compte de `Task.yield()` n'est pas une synchronisation (2026-08-18)

`SoundLibraryPickerModelTests` est tombée pendant qu'un build concurrent saturait
le CPU, puis a rendu 30/30 verts relancée seule. Reprendre une continuation la
rend seulement EXÉCUTABLE ; deux yields suffisaient au repos, pas sous charge.
Attendre la CONDITION, avec une échéance qui échoue en le disant.

Variante plus vicieuse dans la même suite : le test d'annulation concluait de
deux `nil` que la tâche avait été annulée — alors que « pas encore tournée »
produit les mêmes deux `nil`. Il pouvait passer au vert sans rien prouver. Quand
la conclusion est une ABSENCE, il faut un signal positif attestant que le moment
d'agir est bien passé (ici `completedPlayIds`, distinct de `playedIds`).
