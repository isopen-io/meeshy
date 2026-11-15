## Leçon 401 — Un disque plein ne se présente pas comme un disque plein

**Contexte.** Au milieu du lot son, chaque appel d'outil s'est mis à rendre
`ENOSPC: no space left on device` — non pas sur une commande, mais sur la
création du fichier de SORTIE de la commande. Plus aucun `bash` ne pouvait
s'exécuter, y compris ceux qui auraient libéré de la place. 600 Mo restaient sur
un volume de 460 Go.

**Ce qui l'avait rempli, et ce qui ne l'avait pas.** Pas le dépôt. Pas
`apps/ios/Build` (7,4 Go, partagé avec la session voisine — le supprimer aurait
détruit son arbre de build en cours). **50 Go de simulateurs**, dont 11 Go de
CACHES sur un seul appareil : `com.apple.coresymbolicationd` pesait 6,7 Go pour
l'iPhone 16 Pro. Purement régénérable.

**La séquence qui débloque, dans cet ordre :**
1. `TaskStop` sur les tâches de fond — elles écrivent, et c'est ce qui empêche
   le prochain outil de démarrer. C'est le seul geste qui ne demande pas de
   disque.
2. `rm -rf ~/Library/Developer/Xcode/DerivedData/*/Logs/Test` (les `.xcresult`
   d'un run de tests pèsent des centaines de Mo chacun).
3. `xcrun simctl delete unavailable`, puis les caches
   `.../Devices/*/data/Library/Caches/com.apple.coresymbolicationd`.
4. Ne JAMAIS toucher à `apps/ios/Build` ni supprimer un simulateur dans un arbre
   partagé : ce sont les seules choses de cette liste qui appartiennent à
   quelqu'un d'autre.

**La leçon.** Un gate qui devient rouge sans message d'échec exploitable, ou un
outil qui échoue AVANT d'avoir rien exécuté, méritent un `df -h /` avant tout
diagnostic de code. Et prévoir la place : un run de tests iOS produit un
`.xcresult` volumineux à chaque essai — une boucle de retry qui ne les supprime
pas au fur et à mesure fabrique elle-même la panne qu'elle finira par subir.
