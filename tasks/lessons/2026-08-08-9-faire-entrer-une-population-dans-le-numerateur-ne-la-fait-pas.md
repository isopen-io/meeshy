## 2026-08-08 (9) — Faire entrer une population dans le numérateur ne la fait pas entrer dans la diffusion qui l'annonce

Le correctif précédent a fait acquitter la remise par un participant anonyme connecté. Sa
diffusion, elle, est restée sur `if (!p.userId) continue` : l'anonyme acquittait sans jamais
apprendre que la remise avait eu lieu. Le test qui accompagnait le correctif affirmait même
« l'acquitteur anonyme n'a pas de room personnelle » — alors qu'`AuthHandler` lui en fait
rejoindre une, sous un commentaire écrit en réparant exactement ce défaut sur la pastille de
non-lus. La même boucle existait en trois copies verbatim, dont deux ne chargeaient même pas
l'identité de repli.

**Leçons :**
1. **Un correctif d'inclusion se vérifie sur la CHAÎNE entière, pas sur l'étape corrigée.**
   Filtre → écriture → diffusion : élargir le filtre et l'écriture sans élargir la diffusion
   produit un état correct en base que personne ne voit. Après avoir fait entrer une population
   dans un traitement, dérouler les étapes suivantes une par une en se demandant laquelle
   l'énumère encore par l'ancienne clé.
2. **Une assertion négative (`not.toContain`) fige une croyance, pas un comportement.** Elle
   n'échoue jamais tant que la croyance reste fausse dans le code — donc elle protège le défaut
   au lieu du contrat. Avant d'écrire `not.`, chercher le site qui produirait la chose niée :
   ici un `socket.join` documenté à trois fichiers de distance, qui contredisait l'assertion.
3. **Corriger une occurrence d'un motif dupliqué crée une asymétrie plus difficile à voir qu'un
   défaut uniforme.** La forme juste vivait depuis un cycle dans `emitUnreadCountsToRecipients`,
   à un fichier des trois copies fausses. Quand un correctif révèle un motif recopié, chercher
   les copies AVANT de refermer le cycle et les faire converger — sinon le prochain cycle
   redécouvrira le même défaut sous un autre nom.
4. **Un `select` restrictif est un révélateur d'angle mort.** `select: { userId: true }` prouve
   que l'auteur n'a pas choisi d'exclure le participant sans compte : il ne l'a pas vu. Une
   projection qui rend un cas IMPOSSIBLE à traiter est un diagnostic plus fiable que le code
   qui la consomme.
5. **Deux routines parallèles peuvent instruire le même « reste ouvert » en même temps.** Ce
   cycle a trouvé son sujet déjà mergé sur `main` à mi-parcours. Ce qui a sauvé le travail n'est
   pas le code écrit mais le diagnostic : relire ce qui venait d'atterrir a fait apparaître le
   défaut résiduel que le correctif jumeau n'avait pas vu. Règle : après un `git pull` qui
   révèle une collision, ne pas jeter — comparer, et publier la différence.
