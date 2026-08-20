# Cinq réactions au maximum, par personne et par objet — Plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development.

**But :** une personne ne peut pas poser plus de **cinq** réactions différentes sur un même objet. La base de données, elle, n'impose aucun plafond — c'est le code qui décide.

**Décision du propriétaire, citée :**
> « D'un point de vue BD on peut poser un nombre illimité de réactions par utilisateur sur chaque objet, **mais le code doit limiter à 5 sur chaque objet permettant de réagir !** »

**Architecture :** une règle unique dans `packages/shared`, appliquée à chaque site de création. Aucune duplication du nombre 5, aucune règle réécrite par service.

## Contraintes globales

- **TDD strict.** Aucune ligne de production sans test rouge écrit d'abord, échec PROUVÉ par exécution.
- **Le plafond est déclaré une seule fois.** Cinq services l'appliqueront ; aucun ne doit porter sa propre copie du nombre, ni sa propre version de la règle.
- **Le message d'erreur est le même partout**, et il dit ce qui se passe : la personne a atteint son maximum sur cet objet. Pas un refus opaque.
- **Retirer une réaction doit libérer une place.** Un plafond qui ne se relâche jamais bloquerait définitivement.
- **Commits par chemins explicites** ; jamais `git add -A`, `git add .`, `--amend`. **Interdiction absolue de `git stash`** — worktree partagé avec plusieurs sessions actives ; pour comparer un état antérieur, `git show <sha>:<chemin>` suffit et ne touche rien.
- **Messages de commit en français**, `type(scope): sujet`, aucun trailer `Co-Authored-By`.
- **Jamais d'exécution en arrière-plan**, quel que soit l'outil.
- Pas de `any` — `unknown` avec validation si le type est réellement inconnu.
- Vérification gateway : `cd services/gateway && bun run test`. Vérification shared : `cd packages/shared && bun run test`.

---

### Task 1 : la règle, déclarée une seule fois

**Fichiers :** créer la règle dans `packages/shared` (choisis l'emplacement cohérent avec les règles voisines — regarde comment `packages/shared/utils/` est organisé avant de créer un fichier) + son test.

Elle expose le plafond et la décision « cette personne peut-elle encore réagir sur cet objet ? ». Elle est **pure** : elle reçoit un décompte, elle ne va pas le chercher.

- [ ] **Étape 1 :** tests rouges — sous le plafond ⇒ autorisé ; au plafond ⇒ refusé ; au-dessus (état incohérent déjà en base) ⇒ refusé, pas d'exception.
- [ ] **Étape 2 :** vérifier l'échec.
- [ ] **Étape 3 :** implémentation minimale.
- [ ] **Étape 4 :** vérifier le succès.
- [ ] **Étape 5 :** commit.

### Task 2 : messages et pièces jointes

**Fichiers :** `services/gateway/src/services/ReactionService.ts:165` (upsert), `services/gateway/src/services/AttachmentReactionService.ts:54` (upsert), et leurs tests.

⚠️ Les deux passent par un `upsert`. **Un `upsert` sur une réaction qui existe déjà ne crée rien** — il ne doit donc pas être refusé par le plafond, sinon reposer le même émoji deviendrait impossible une fois à cinq. Distingue la création de la mise à jour.

- [ ] **Étape 1 :** tests rouges, pour chacun des deux services — la sixième réaction est refusée, la cinquième passe, et reposer un émoji déjà présent passe même à cinq.
- [ ] **Étape 2 :** vérifier l'échec. — [ ] **Étape 3 :** implémentation. — [ ] **Étape 4 :** vérifier. — [ ] **Étape 5 :** commit.

### Task 3 : posts et commentaires

**Fichiers :** `services/gateway/src/services/PostReactionService.ts:129`, `services/gateway/src/services/CommentReactionService.ts:127`, **et `services/gateway/src/services/PostCommentService.ts:579`**, plus leurs tests.

⚠️ **Les réactions aux commentaires ont DEUX chemins de création** : `CommentReactionService` et `PostCommentService`. Une limite posée sur un seul serait contournable par l'autre. Vérifie s'il en existe un troisième avant d'écrire — `grep` sur les créations et mises à jour de chaque modèle de réaction.

- [ ] **Étape 1 :** tests rouges sur **chaque** chemin, y compris le second chemin des commentaires.
- [ ] **Étape 2 :** vérifier l'échec. — [ ] **Étape 3 :** implémentation. — [ ] **Étape 4 :** vérifier. — [ ] **Étape 5 :** commit.

### Task 4 : les stories et les statuts

**Le propriétaire les a nommés explicitement.** Or aucun modèle de réaction aux stories n'apparaît au schéma, alors que des types de notification `story_reaction` et `status_reaction` existent (`services/gateway/src/services/notifications/NotificationService.ts:760-761`).

**Commence par établir les faits** : par quel modèle une réaction à une story ou à un statut est-elle enregistrée ? Est-ce l'un des quatre déjà traités, un cinquième, ou un mécanisme sans persistance dédiée ?

- [ ] **Étape 1 :** établir le mécanisme réel et l'écrire dans le rapport.
- [ ] **Étape 2 :** si un chemin de création existe, lui appliquer la même règle, avec les mêmes tests que les tâches précédentes. S'il n'en existe pas, **dire pourquoi** — c'est une réponse acceptable, mais elle doit être argumentée, pas supposée.

---

## Revue finale

Vérifier que le nombre 5 n'apparaît qu'à un seul endroit, qu'aucun chemin de création n'échappe à la règle, et qu'une réaction retirée libère bien une place.
