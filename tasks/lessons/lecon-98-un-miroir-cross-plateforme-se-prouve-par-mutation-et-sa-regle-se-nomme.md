## Leçon 98 — un miroir cross-plateforme se prouve par mutation, et sa règle se nomme des DEUX côtés (2026-08-11, routine messaging, cycle 75)

Le `_seq` du SyncEngine existait sur iOS et nulle part ailleurs. Le porter au web n'était pas
« réécrire la même chose en TypeScript » : c'était décider ce qui, dans la règle, est du contrat et
ce qui est de la plateforme.

1. **Un défaut de rattrapage coûte ce que coûte la politique de fraîcheur de la plateforme.** Le même
   event manqué se rattrape tout seul sur un client qui relit périodiquement, et ne se rattrape
   JAMAIS sur un client en `staleTime: Infinity`. Avant de chiffrer l'impact d'un trou temps réel,
   lire la politique de cache du consommateur — c'est elle qui transforme « en retard » en
   « perdu pour la session ».
2. **Une couverture qui ressemble à la bonne n'est pas la bonne : vérifier sur QUEL signal elle
   écoute.** `refetchOnReconnect: 'always'` était déjà posé globalement et semblait fermer la
   fenêtre de coupure. Il écoute le `onlineManager` — la transition réseau du NAVIGATEUR. Un
   redémarrage gateway, un drop de load balancer, un échec d'upgrade de transport ne bougent pas
   `navigator.onLine` : la socket tombe, le navigateur se croit en ligne, rien ne se déclenche.
   **Deux mécanismes nommés « reconnect » peuvent observer deux mondes disjoints.**
3. **La variante plausible-mais-fausse d'un correctif de synchro, c'est presque toujours de RÉINITIALISER
   trop tôt.** Purger le curseur de séquence sur l'event `disconnect` de la socket paraît hygiénique
   et détruit exactement la preuve que la reconnexion doit révéler : le premier `_seq` d'après la
   coupure est ce qui MESURE le trou. Le curseur ne se purge que sur un changement d'IDENTITÉ
   (token, logout) — le seul moment où sa valeur cesse d'avoir un sens. Écrire ce mutant en test
   avant de coder : ici il n'a fait tomber qu'UN témoin, et sans ce témoin le correctif serait
   passé vert en ne détectant plus rien après la première coupure.
4. **Un compteur GLOBAL par utilisateur impose un lockstep émission/observation.** `_seq` n'est pas
   par event : un client qui n'observe qu'un sous-ensemble des events estampillés voit un trou à
   chaque event non observé. Porter l'observation d'UN seul event n'est correct que parce que
   l'émetteur est unique — fait à vérifier, pas à supposer. La note qui protège la suite ne va pas
   dans le client qu'on vient d'écrire : elle va chez l'ÉMETTEUR, seul endroit que touchera
   forcément celui qui étendra la couverture.
5. **Un jumeau qui ne se nomme que dans un sens n'est pas un jumeau.** Le fichier web pointait le
   Swift ; le Swift ne pointait rien. Celui qui fait évoluer la règle ouvre le fichier de SA
   plateforme — la référence doit exister aux deux extrémités, sinon elle ne sert que ceux qui
   n'en ont pas besoin.
6. **Établir la portée par balayage de TOUTES les surfaces voisines, avant de conclure.** Trois
   surfaces web pouvaient porter le même défaut ; les messages avaient déjà leur rattrapage sur le
   front `false → true` du socket, les notifications non (corrigé), la liste de conversations non
   plus (documentée en tête du cycle suivant). Sans ce balayage, le rapport aurait annoncé « le web
   n'a pas de rattrapage », ce qui est faux, au lieu de nommer la seule surface restante.
