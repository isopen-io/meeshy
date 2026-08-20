# Un téléversement refusé pour jeton expiré se rejoue — Plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development.

**But :** les trois chemins de téléversement qui ne réessaient pas après un refus d'authentification détectent ce refus, rafraîchissent le jeton, et retentent **une** fois.

**Contexte.** Le serveur ne rattrape plus un jeton expiré par un jeton de session — décision du propriétaire, « une forme de connexion à la fois » (commits `39e30690d`, `c74b2eb08`, `ce49f7f29`). Les appels API ordinaires sont protégés : `api.service.ts` (web) et `APIClient.swift` (iOS) rafraîchissent et retentent déjà sur un 401. **Trois chemins contournent ces points d'entrée** et abandonnent sèchement.

**Architecture :** aucun mécanisme neuf. Chaque chemin réutilise la fonction de rafraîchissement déjà présente dans son application.

## Contraintes globales

- **TDD strict.** Aucune ligne de production sans test rouge écrit d'abord, échec PROUVÉ par exécution.
- **Retenter EXACTEMENT une fois.** Un second refus est un échec définitif. Une boucle de reprise sur un jeton irrécupérable martèlerait le serveur.
- **Ne pas réimplémenter le rafraîchissement.** Chaque application en a déjà un ; appelle-le. Une seconde implémentation divergerait, et ce dépôt en a déjà fait les frais.
- **Pour un téléversement repris, retenter ne veut pas dire recommencer.** Le protocole permet de demander l'avancement courant et de repartir de là. Un gros fichier ne doit pas repartir de zéro.
- **Commits par chemins explicites** ; jamais `git add -A`, `git add .`, `--amend`. **Interdiction absolue de `git stash`** — worktree partagé avec plusieurs sessions actives.
- **Messages de commit en français**, `type(scope): sujet`, aucun trailer `Co-Authored-By`.
- **Jamais d'exécution en arrière-plan**, quel que soit l'outil.
- Pas de `any` (web/TS).

---

### Task 1 : le composer web réessaie après un refus

**Fichiers :**
- Modifier : `apps/web/services/attachmentService.ts` (`uploadFiles`, autour de `:86-181`)
- Test : `apps/web/__tests__/services/` (crée le fichier s'il n'existe pas ; reprends les conventions d'un test de service voisin)

**Pourquoi ce chemin d'abord :** c'est le plus fréquenté — chaque image et chaque fichier envoyé dans une conversation depuis le web. Il passe par une requête `XMLHttpRequest` brute, envoie délibérément les deux en-têtes, prévoit un délai de dix minutes, et n'a aucune reprise sur refus.

- [ ] **Étape 1 : écrire les tests rouges.** Un envoi refusé pour authentification déclenche un rafraîchissement puis **une** nouvelle tentative ; un second refus échoue définitivement, sans troisième tentative ; un envoi qui réussit du premier coup ne déclenche aucun rafraîchissement ; une erreur qui n'est pas un refus d'authentification n'en déclenche pas non plus.
- [ ] **Étape 2 : vérifier l'échec** — `cd apps/web && bun run test -- attachmentService`
- [ ] **Étape 3 : implémentation minimale.** Réutilise la fonction de rafraîchissement de `apps/web/services/api.service.ts` (`refreshAuthToken`, autour de `:137-220`) ; ne la duplique pas. Reconstruis les en-têtes après rafraîchissement — un jeton neuf ne sert à rien s'il n'est pas envoyé.
- [ ] **Étape 4 : vérifier le succès**, puis les suites voisines qui consomment ce service.
- [ ] **Étape 5 : commit.**

### Task 2 : le téléversement repris du web réessaie

**Fichiers :**
- Modifier : `apps/web/services/tusUploadService.ts` (`onError`, autour de `:179-189`)
- Test : à côté du fichier de test de la Task 1, ou son propre fichier selon les conventions du dossier

**Interfaces :** consomme la même fonction de rafraîchissement que la Task 1.

- [ ] **Étape 1 : écrire les tests rouges.** Mêmes quatre cas que la Task 1, plus un cinquième, propre à ce protocole : **après rafraîchissement, la reprise repart de l'avancement déjà atteint, pas de zéro.** Vérifie ce que la bibliothèque expose pour cela avant d'écrire — ne suppose pas.
- [ ] **Étape 2 : vérifier l'échec.**
- [ ] **Étape 3 : implémentation minimale.**
- [ ] **Étape 4 : vérifier le succès.**
- [ ] **Étape 5 : commit.**

### Task 3 : le téléversement iOS réessaie

**Fichiers :**
- Modifier : `packages/MeeshySDK/Sources/MeeshySDK/.../TusUploadManager.swift` (boucle des tranches, autour de `:363-364` — le `default:` du filtrage de statut, qui traite aujourd'hui tout code hors `{200, 204, 409, 404, 410}` comme un échec sec)
- Test : suite de tests du SDK correspondante

**Interfaces :** réutilise le rafraîchissement existant côté iOS (`AuthManager.refreshSession(force:)`, ou le mécanisme qu'emploie déjà `APIClient` autour de `:569-703`) — vérifie lequel est appelable depuis ce contexte avant de choisir.

- [ ] **Étape 1 : écrire les tests rouges.** Les mêmes cas, y compris la reprise depuis l'avancement atteint. Attention : le protocole permet de **demander** l'avancement courant au serveur — c'est la voie sûre après un rafraîchissement, plutôt que de se fier à un compteur local.
- [ ] **Étape 2 : vérifier l'échec** — scheme `MeeshySDK-Package`, simulateur iPhone 16 Pro `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5` (runtime 18.2). `-only-testing` sélectionne des CLASSES.
- [ ] **Étape 3 : implémentation minimale.**
- [ ] **Étape 4 : vérifier le succès**, puis `build-for-testing` sur la cible app entière.
- [ ] **Étape 5 : commit.**

---

## Revue finale

Vérifier qu'aucun des trois chemins ne peut retenter plus d'une fois, qu'aucun ne réimplémente le rafraîchissement, et qu'un gros fichier ne repart jamais de zéro.
