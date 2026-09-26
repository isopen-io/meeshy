## Leçon 91 — la donnée déjà PAYÉE et jetée est une classe de défaut, pas un accident (2026-08-10, routine messaging, cycle 64)

Le cycle 62 avait nommé `routes/conversations/search.ts` « correctif mécanique » pour le cycle
suivant. Il l'était. Mais la forme du défaut, elle, s'est révélée être une **récidive** — et le
fichier portait déjà, à trois lignes de l'endroit exact, le commentaire d'un correctif antérieur
décrivant la même faute (`metadata.location`, Lot 3 : « la donnée était payée puis perdue »).

1. **Un `include` Prisma sans `select` rapporte TOUS les scalaires ; un mapping manuel n'en garde
   que ce qu'on a tapé.** Les deux ensembles divergent en silence, et rien — ni le compilateur, ni
   le schéma de réponse, ni un test — ne signale l'écart. La requête coûte le même prix qu'avant ;
   seul le client est privé. **Chercher ce motif là où un objet est reconstruit à la main à partir
   d'un résultat Prisma : la question n'est pas « que renvoie-t-on ? » mais « que rapporte la
   requête qu'on ne renvoie pas ? ».**
2. **Le premier correctif peut créer l'incohérence que le second doit fermer — dans le même
   geste.** Poser la carte d'aperçu traduite (plafonnée à 300) à côté d'un aperçu original NON
   tronqué faisait dépendre le poids de la ligne de la langue du lecteur. Ce n'est pas un
   élargissement de périmètre : c'est la conséquence directe du correctif, et la refuser aurait
   livré une réponse incohérente avec elle-même. **Après avoir posé un champ dérivé, relire ses
   voisins immédiats : celui qui ne subit pas le même traitement devient une anomalie parce qu'on
   vient d'en poser un qui le subit.**
3. **Un mock d'objet-module qui ÉNUMÈRE ses exports est un couplage caché à la liste des imports de
   la cible.** Ajouter un import à la route a rendu `resolveUserLanguagesOrdered` `undefined` dans
   un test voisin, qui a répondu 500 sur 4 témoins — un échec dont le message ne nomme jamais la
   cause. La forme robuste existait déjà dans le dépôt (`conversation-core.test.ts`) :
   `...jest.requireActual(module)` puis surcharge du SEUL double voulu. **Ne jamais énumérer les
   exports d'un module partagé dans un `jest.mock` : doubler ce qu'on veut contrôler, laisser
   passer le reste.**
4. **La moitié client se vérifie AVANT de conclure, même quand on ne peut pas la compiler.** Le web
   n'avait rien à faire (le transformer du cycle 62 propageait déjà, et l'écran de recherche ne rend
   aucun aperçu) ; iOS s'arrêtait à un pas de l'arrivée (`toConversation` propageait, mais le
   ViewModel de recherche lisait l'aperçu brut). Les deux réponses sont sorties du même balayage —
   et sans lui, le cycle aurait reproduit à l'identique, une route plus loin, le défaut que le cycle
   62 venait de corriger. **« Non gatable ici » décide de la façon de PROUVER un changement, jamais
   de la nécessité de le chercher.**
