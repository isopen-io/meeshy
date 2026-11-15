## Leçon — deux fois « fini » alors que non : le commentaire disait le contraire du code (2026-08-19)

L'utilisateur a demandé deux fois si la republication de story était terminée.
La première fois j'ai répondu en décrivant ce que j'avais écrit ; l'audit qui a
suivi a trouvé trois défauts, dont deux où le code se contredisait lui-même.

1. **J'avais posé le bouton « Partager » DANS le bloc `if story.isPublic`** —
   alors que le commentaire que je venais d'écrire trois lignes plus haut
   affirmait « sans garde d'audience : elle reproduit le comportement du rail ».
   Effet réel : sur une story FRIENDS ou PRIVATE, le menu n'offrait AUCUNE des
   trois formes demandées. J'avais vérifié que l'entrée EXISTAIT, pas qu'elle
   était ATTEIGNABLE.
2. **Le gate `isPublic` des deux formes POST était vestigial** : il ne reflétait
   qu'une barrière serveur que le même chantier venait de retirer. Laisser un
   gate qui protège contre une restriction abolie, c'est laisser le code
   raconter une règle qui n'existe plus.
3. **J'ai affirmé qu'« aucune garde ne rejette ces clés mortes »** après avoir
   inspecté UN seul fichier de garde (`LocalizationCatalogGuardTests`, qui
   mesure la couverture de traduction) sur les deux qui existent. La suite
   complète a rougi sur `LocalizationConsistencyTests
   .test_everyAppCatalogIdentifierKeyIsReferencedInCode`. Une affirmation
   négative tirée d'un échantillon n'est pas une vérification.

Et une erreur de lecture par-dessus : j'ai annoncé la suite « verte (exit 0) » en
lisant le code de sortie du WRAPPER shell, pas celui de `xcodebuild`. Le vrai
résultat était 6868/1. Le motif est récurrent dans cette session : `echo "exit=$?"`
après une commande, ou `grep -c` qui rend 1 quand le compte est zéro, font passer
un échec pour un succès. **Toujours lire le compteur de tests, jamais le code de
sortie du dernier maillon.**

Le correctif de fond, pour la garde : une assertion textuelle ne distingue pas
« présent » de « présent SOUS un gate » — soit exactement le défaut n°1. Le
témoin prouve donc la CONTENANCE par accolades équilibrées (les trois formes
hors du bloc, le partage externe dedans), même patron que la leçon
`LentilleScreenNotMountedTests` du 2026-08-18. Quand ce qui compte est la
POSITION d'un appel et pas son existence, il faut une preuve de structure.

---
