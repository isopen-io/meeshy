## 2026-08-08 (3) — Un contrôle unanime chez tous les voisins est ce qui rend son absence invisible chez le dernier

`PUT /user-preferences/conversations/:id` écrivait sa ligne à partir de deux ids
fournis par l'appelant sans vérifier ni l'un ni l'autre. Le `categoryId` non vérifié
rendait la catégorie privée d'un AUTRE utilisateur dans la réponse, et dans toutes les
lectures suivantes (même jointure `include: { category: true }`).

**Leçons :**
1. **Chercher l'écrivain qui dépareille, pas le contrôle qui manque.** Les trois routes
   de `user-deletions.ts` vérifiaient l'appartenance avec exactement le bon prédicat, le
   réordonnancement aussi, et les six routes de catégories vérifiaient la possession
   sous commentaire explicite. Un seul écrivain sur onze ne le faisait pas — et c'est
   précisément cette unanimité qui le camoufle : rien ne dépareille à la lecture d'un
   seul fichier. Règle de repérage : quand un contrôle de périmètre existe, **énumérer
   tous les écrivains de la même table** et comparer, plutôt que relire le site suspect.
2. **Un id fourni par l'appelant qui devient une clé étrangère vers une table PAR
   UTILISATEUR est une fuite jusqu'à preuve du contraire.** Le danger n'était pas
   l'écriture (la ligne écrite reste celle de l'attaquant) mais la **jointure de
   lecture** qui la suit : `include` transforme un id non vérifié en contenu d'autrui.
   Règle : pour tout champ `xxxId` accepté d'un client, demander « quelle table, scopée
   par qui, et qu'est-ce qu'on renvoie après l'avoir joint ? ».
3. **Le code d'erreur fait partie du correctif.** Répondre `403` pour une catégorie qui
   n'est pas la sienne aurait troqué une fuite de contenu contre un **oracle
   d'énumération**. `404` (ce que font déjà les six routes sœurs) ne confirme pas
   l'existence. Corollaire : la non-appartenance à une conversation, elle, est un fait
   que l'appelant connaît déjà — `403` y est correct, et c'est ce que le dépôt répond
   déjà ailleurs. Choisir le code par ce qu'il DIVULGUE, pas par confort d'uniformité.
4. **Le contrôle va où va l'invariant, pas où va la lecture.** Placer les deux gardes
   dans la route aurait reproduit exactement la configuration qui a produit le défaut :
   un contrôle correct recopié en N endroits, dont l'un finit par manquer. Elles vont
   dans `writeConversationPreferences`, avec l'incrément de `version` et la diffusion —
   la ligne n'est atteignable que par cette fonction. Même argument qu'au cycle 12.
5. **Quand un correctif fait tomber des tests, distinguer régression et harnais
   incomplet — puis compléter le harnais, jamais plier la requête.** Les 10 tests tombés
   étaient des doubles de store qui ne modélisaient pas `Participant` sur ce chemin.
   Utiliser `findMany` (que les mocks avaient déjà) au lieu de `findFirst` aurait rendu
   la suite verte en choisissant la requête d'après la forme d'un mock — la racine exacte
   que les cycles 10, 11 et 13 ont chacun documentée sous un autre déguisement.
6. **Faire porter à un test la nature de la donnée fuitée.** La catégorie d'autrui
   s'appelle `'Divorce lawyer'` dans le harnais : le RED affiche alors littéralement
   `"category":{"name":"Divorce lawyer",…}` dans le corps sérialisé. Un `'Category A'`
   aurait produit le même vert et rendu l'enjeu illisible pour le prochain lecteur.
