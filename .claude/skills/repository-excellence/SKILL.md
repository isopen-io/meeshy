---
name: repository-excellence
description: Boucle d'amélioration continue du monorepo Meeshy (AMSF). À utiliser pour reprendre le travail d'orchestration — relever l'état, choisir le prochain lot, le déléguer, le valider, l'intégrer — ou après une compaction ou une interruption de session.
---

# Reprendre et faire tourner la boucle

L'état ne vit pas dans la conversation. Il se reconstruit depuis trois sources, dans cet ordre de confiance : **git** (ce qui est réellement livré), **les issues GitHub** (ce qui est décidé et en cours — seule source d'ÉTAT, CLAUDE.md § Pilotage), **`.amsf/`** (le relevé daté de l'orchestrateur).

## 1. Reprendre
1. `cat .amsf/STATE.md` — phase, SHA de base, ce qui est en vol.
2. `git fetch origin && git log --oneline origin/dev -5 && git status -sb` — si `dev` a avancé, fusionner `origin/dev` dans la branche avant tout (jamais de rebase, jamais de `--ours` global).
3. `node .amsf/scripts/inventaire.mjs` — si l'inventaire a changé, mettre à jour `.amsf/INVENTORY.md`.

## 2. Choisir
`.amsf/BACKLOG.md` classe les constats par sévérité. Prendre le plus haut qui est (a) confirmé dans le code, (b) corrigeable sans décision du porteur, (c) sans branche vivante sur ses chemins. Ouvrir ou retrouver son issue AVANT d'écrire.

## 3. Déléguer
- Un projet seul → agent `ingenieur-application`, périmètre d'écriture explicite.
- Un paquet partagé ou un contrat → agent `plateforme-partagee`, en SÉQUENCE, jamais en parallèle d'un consommateur.
- Au plus quatre lots d'écriture à la fois, et quatre worktrees (hook `worktree-limit.sh`). Deux lots ne partagent jamais un fichier.

## 4. Valider et intégrer
- Skill `regression-validation`, puis revue par un agent qui n'a pas écrit le lot (`auditeur-release`, `securite-applicative`, ou `auditeur-adversarial` pour crypto, auth, migration).
- Trois tentatives de correction matériellement différentes qui échouent ⇒ arrêter, chercher la cause racine, consigner le blocage dans l'issue et passer à un lot indépendant.

## 5. Consigner
Mettre à jour `.amsf/STATE.md` et le rapport concerné dans `.amsf/reports/` avec des sorties réelles. Ne jamais écrire « fait » pour ce qui n'est pas vérifié ; les statuts sont PASS · FAIL · BLOCKED · NOT VERIFIED · NOT APPLICABLE.
