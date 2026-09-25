## Leçon 87 — un backlog nomme un IDIOME à propager ; la question utile est « où n'apparie-t-il RIEN ? » (2026-08-10, routine messaging, cycle 59)

Le cycle 58 léguait un candidat précis : appliquer le prédicat défensif
`OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]` aux 119 lectures de `Message.deletedAt`.
Suivi tel quel, c'était 119 fichiers touchés pour **zéro défaut observable** : le cycle 58 venait de
rendre complète la discipline d'écriture qui rend ces 119 filtres exacts.

Reformulée — *sur quelle colonne le filtre naïf n'apparie-t-il RIEN aujourd'hui ?*, ce qui se réduit à
*une colonne optionnelle dont AUCUN créateur n'écrit la valeur* — la même question rend quatre sites,
dont une **porte d'accès fermée à toute une population d'utilisateurs** : `canAccessConversation`
filtrait `bannedAt: null` sur un modèle dont les neuf créateurs omettent la colonne. Les seuls
participants que cette garde laissait entrer étaient ceux qui avaient été bannis **puis débannis** —
les seuls à porter un `null` explicite. Et comme seul un contexte d'auth anonyme porte un
`participantId`, la branche concernée était celle de tous les arrivants par lien de partage.

**Leçons :**

1. **Un idiome à propager n'est pas un défaut à corriger.** Une entrée de backlog qui dit « appliquer
   X partout » décrit un GESTE, pas un symptôme. Avant de l'exécuter, la retourner en question sur
   l'état du monde : *où est-ce que l'absence de X se voit ?* Les sites nommés par le backlog étaient
   précisément ceux où ça ne se voyait pas — leur défaut venait d'être fermé par l'autre bout.
2. **La forme greppable de ce piège n'est pas le filtre, c'est le couple filtre/créateurs.** Un
   `{ champ: null }` dans un `where` n'est suspect que si l'on a vérifié que les créateurs de la ligne
   omettent le champ. La vérification est mécanique — `grep "<Model>.create"` puis lire chaque `data`
   — et elle tranche : six créateurs sur sept qui écrivent la colonne disent que le filtre marche
   presque partout ; **zéro sur neuf** disent qu'il ne marche nulle part. Le second cas coûte une
   ligne à réparer et casse une fonctionnalité entière ; c'est celui qu'il faut chercher d'abord.
3. **Écriture ou lecture : le choix se décide sur les lignes DÉJÀ en base, pas par symétrie avec le
   cycle précédent.** Le cycle 58 a réparé par l'écriture (nommer le marqueur, l'étaler chez les
   créateurs) parce que ses lignes fautives étaient rares. Transposer ce geste ici n'aurait rien
   réparé : les participants anonymes déjà enregistrés sont exactement ceux dont l'accès est cassé.
   **Une discipline d'écriture répare l'avenir ; un prédicat défensif répare le passé.** Demander
   « qui est déjà dehors ? » avant de choisir la moitié.
4. **Une garde qui paraît redondante ne l'est peut-être que sur le chemin nominal.** `bannedAt: null`
   semble recouvert par `isActive: true`, puisqu'un bannissement écrit `isActive: false` — d'où la
   tentation de simplement retirer la garde cassée. Un troisième écrivain la rend porteuse :
   `routes/me/delete-account.ts` rallume `isActive` à la restauration d'un compte sans regarder
   `bannedAt`. Avant de retirer un filtre au motif qu'un autre le recouvre, chercher **tous** les
   écrivains du champ qui recouvre, pas seulement celui qui porte le nom du geste.
5. **Un test qui compare un `where` à sa copie attendue ÉPINGLE le défaut quand celui-ci est dans le
   `where`.** Trois témoins de ce cycle affirmaient `toHaveBeenCalledWith({ where: { …, usedAt: null } })`
   ou son équivalent : ils passaient exactement parce que la clause était fausse, et ils auraient
   rougi à sa réparation. Le remède n'est pas de les supprimer mais de leur rendre leur intention en
   comportement — ici, un double qui ÉVALUE la clause contre des documents nus, où une clé absente de
   l'objet est une colonne absente du document (`__tests__/helpers/mongo-where.ts`, sur le patron de
   `notification-where.ts`). C'est la seule forme de double qui peut voir « cette clause n'apparie
   rien ».
6. **Une sonde qui VIDE l'invariant teste la direction opposée du correctif.** Vider `unsetOrNull` en
   `{}` fait tomber 8 témoins — dont le refus d'un participant banni resté actif. Ce n'est pas du
   bruit : c'est la preuve que le harnais attrape aussi un prédicat trop PERMISSIF, pas seulement un
   prédicat trop strict. Un correctif qui n'a de sonde que dans le sens « j'ai oublié une branche »
   ne dit rien de ce qui se passe si quelqu'un neutralise la garde.
7. **Réparer un mécanisme mort peut être un ACTE DESTRUCTEUR — et alors le bon cycle est celui qui
   s'abstient.** Le cinquième site trouvé, `cleanupOrphanedAttachments`, porte le même défaut à la
   ligne près. Le corriger arme un effacement irréversible de fichiers sur des données qu'aucune
   commande de ce conteneur ne peut inspecter. Le corriger « pour la cohérence du lot » aurait été le
   geste le plus coûteux du cycle. Documenter le défaut, dire pourquoi on ne le touche pas, et nommer
   le préalable (un essai à blanc contre la base) est un livrable complet — pas un aveu.
