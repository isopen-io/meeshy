## Leçon 531 — Un instrument qui rend « 0 » partout ne mesure rien, et le prouve au palier où il devrait rendre « 1 »

Pour vérifier les trois régimes ci-dessus au simulateur, j'ai grepé le journal
sur `users/search` après chaque frappe :

- `@` → **0** ✓ (attendu)
- `@m` → **0** ✓ (attendu)
- `@me` → **0** ✗ — alors que l'écran montrait deux résultats venus du serveur

Le logger réseau de l'app ne trace que les requêtes LENTES (`Slow request:`).
Mon grep ne pouvait donc rendre autre chose que zéro, quel que soit le
comportement — les deux premiers « ✓ » ne prouvaient strictement rien.

> **Un instrument doit être vu RENDRE LE SIGNAL au moins une fois avant qu'on
> lise ses zéros.** Un test négatif qui n'a jamais été vu positif n'est pas un
> test négatif : c'est un instrument dont on ignore s'il est branché. C'est la
> forme « code de sortie lu sans son journal », déplacée du gate au terrain.

Ce qui l'a remplacé est un témoin de COMPORTEMENT, lisible sans instrument :
`@m` ne montre rien pendant que `@me` montre deux personnes. Si la recherche
partait à une lettre, `@m` en montrerait aussi — le serveur retenant « m »
dans bien plus de noms que « me ». **Quand l'instrument est douteux, mesurer
la CONSÉQUENCE plutôt que la cause.**
