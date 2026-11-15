## 2026-08-07 (3) — Une garantie énoncée dans un commentaire n'est pas une garantie du système

La file de livraison hors ligne rejouait les éditions/suppressions faites en socket, jamais
celles faites en REST — soit le chemin PRIMAIRE d'iOS. Une seule racine, invisible dans
tout diff isolé.

**Leçons :**
1. **Un commentaire qui énonce une garantie désigne l'endroit où la CHERCHER ailleurs.**
   `_enqueueOfflineEventForParticipants` dit « without this, an edit or delete made while a
   recipient is offline is lost for them ». C'est une affirmation sur le SYSTÈME, pas sur
   la fonction : elle oblige à re-grep tous les autres écrivains du même effet. Il y en
   avait cinq, aucun ne l'appliquait. Règle : quand un commentaire justifie un appel par
   une conséquence produit, lister immédiatement les autres sites qui produisent la même
   mutation — le commentaire est un invariant, pas une note locale.
2. **La duplication ne fait pas que coûter des lignes : elle CACHE l'asymétrie.** Cinq blocs
   « emit + fanout aperçu » identiques, aucun ne citant les autres — donc rien ne signalait
   qu'un sixième canal manquait partout. Le correctif utile n'est pas la 3ᵉ ligne recopiée
   cinq fois mais le point unique qui NOMME les trois audiences. Corollaire : quand un
   commentaire existant se trompe sur le nombre de sites (« les trois transports » pour
   cinq), c'est le symptôme, pas un détail rédactionnel.
3. **La signature d'une API porte parfois la trace de l'oubli.** `enqueueOfflineMessageMutation`
   acceptait déjà `'edited'` (appelant prévu, jamais écrit) et n'avait pas `'deleted'`. Une
   union de types dont un membre n'a aucun appelant est un indice de chemin manquant, pas
   du code mort à supprimer — vérifier lequel des deux AVANT de trancher.
4. **Vérifier quel transport le client PRIMAIRE utilise réellement, pas celui qu'on suppose.**
   La lecture « le socket est le chemin d'édition primaire » (écrite dans `handleMessageEdit`)
   est vraie pour le web et fausse pour iOS (`MessageService.swift` : PUT/DELETE REST).
   Une hypothèse de transport se vérifie dans le code du client, en une grep.
5. **Remplacer un `try/catch` par un appel de helper déplace la frontière d'erreur.**
   `socketIOHandler.getManager()` vivait DANS le bloc protégé ; passé en argument, il
   s'exécutait hors protection et un `socketIOHandler` null à l'enregistrement (cas réel,
   déjà testé) transformait un succès en 500. C'est le test existant qui l'a attrapé, pas
   la relecture — extraire du code d'un try/catch impose de re-vérifier ce qui s'évaluait
   à l'intérieur.
