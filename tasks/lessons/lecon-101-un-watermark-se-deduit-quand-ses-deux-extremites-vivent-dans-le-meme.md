## Leçon 101 — Un watermark se DÉDUIT quand ses deux extrémités vivent dans le même objet (2026-08-11, routine messaging, cycle 76)

iOS garde `lastSyncTimestamp` comme état persisté explicite, avec toute la machinerie qui
va avec : ne jamais régresser, ne jamais partir de l'horloge locale (R15b), purger au
changement d'identité. Porter le delta au web invitait à porter aussi le curseur. C'était
une erreur de lecture : sur iOS, le cache disque et le curseur sont deux stockages
distincts, donc le curseur DOIT être tenu. Sur le web, le cache React Query est le seul
stockage — le plus récent `updatedAt` qu'il contient EST le watermark.

La déduction n'est pas un raccourci, elle se démontre. Soit `T` le max des `updatedAt` en
cache et `F` l'instant de la lecture serveur qui les a produits : `T <= F` par
construction, et tout changement postérieur à cette lecture porte un `updatedAt > F >= T`.
`updatedSince=T` ne peut donc rien rater ; au pire il re-livre `]T, F]`, que l'upsert rend
idempotent. Et la propriété survit aux écritures socket, qui ne peuvent que faire avancer
`T`.

1. **Un état dérivable ne se stocke pas.** Toutes les propriétés qu'on aurait dû écrire,
   tester et maintenir — monotonie, purge au logout, non-régression sur event réordonné —
   sont vraies gratuitement quand la valeur est recalculée à l'appel depuis la seule
   source qui compte.
2. **Porter une règle cross-plateforme, c'est distinguer ce qui est du CONTRAT de ce qui
   est de la PLATEFORME.** Contrat : l'endpoint, la sémantique d'upsert, le refus de
   l'horloge locale, la détection de troncature. Plateforme : le curseur persisté, qui
   n'existe que parce qu'iOS a deux stockages. Copier le second aurait produit du code
   correct, testé, et inutile — la pire sorte de dette, celle qu'on n'ose plus retirer.
3. **Le corollaire protège le suivant** : un throttle qui SAUTE une exécution est sans
   conséquence ici, précisément parce que le watermark est dérivé — une exécution sautée
   n'avance rien, et la suivante couvre exactement la même fenêtre. Avec un curseur
   stocké, ce même throttle aurait demandé une preuve séparée.
