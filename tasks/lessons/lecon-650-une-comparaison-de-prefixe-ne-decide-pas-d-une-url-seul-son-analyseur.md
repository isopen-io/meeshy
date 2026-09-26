## Leçon 650 — une comparaison de PRÉFIXE ne décide pas d'une URL : seul son analyseur sait où elle mène

2026-09-20, #7157 (`services/gateway/src/utils/sanitize.ts`). En fermant une sanitisation inversée — `sanitizeURL(avatar) ?? avatar`, dont le repli restituait la valeur d'origine PRÉCISÉMENT quand la garde l'avait rejetée — il fallait distinguer deux raisons opposées de rendre `null` : entrée dangereuse, ou entrée qui n'est pas une URL absolue (un chemin d'API relatif, légitime). J'ai d'abord écrit la distinction en préfixe : `startsWith('/') && !startsWith('//')`.

**Trois entrées la traversent et sortent ailleurs.** Résolues contre une origine quelconque :

```
//evil.example/x    → https://evil.example/x   (protocol-relative — attrapé)
/\evil.example/x    → https://evil.example/x   (l'antislash vaut une barre)
/<TAB>/evil.example → https://evil.example/    (les blancs sont supprimés)
```

Les deux dernières commencent par **un seul** `/`. Le test de préfixe les déclare relatives. Le correctif de sécurité en contenait donc un autre, du même genre que celui qu'il fermait.

**La règle juste ne devance pas l'analyseur, elle le consulte** : résoudre le candidat contre une origine sentinelle (`.invalid`, réservé RFC 2606) et ne garder que si l'origine résolue est inchangée. Trois témoins `it.each` fixent la table, car un retour au préfixe a l'air correct — et l'est, pour le cas qu'on a en tête en l'écrivant.

> **Une chaîne qui sera interprétée par un analyseur ne se juge pas par sa FORME, mais par ce qu'elle DEVIENT une fois analysée.** La question n'est pas « à quoi ressemble cette entrée ? » mais « où mène-t-elle ? » — et la réponse s'obtient en faisant tourner l'analyseur, jamais en l'imitant. Vaut pour les URL, les chemins de fichiers, les sélecteurs, et tout ce qu'un autre programme relira.
