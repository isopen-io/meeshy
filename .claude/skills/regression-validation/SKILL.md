---
name: regression-validation
description: Valider qu'un changement n'a rien cassé dans le monorepo Meeshy — projets touchés ET consommateurs transitifs — en rejouant builds, typage et suites contre la base enregistrée. À utiliser avant tout commit de livraison et avant d'ouvrir une PR.
---

# Valider sans régression

1. **Fusionner `dev`** dans la branche (`git fetch origin dev && git merge origin/dev`) et valider sur l'arbre FUSIONNÉ (#18654).
2. **Périmètre** : `node .amsf/scripts/inventaire.mjs --affected origin/dev` → `directs`, `transitifs`, `natifs`, `horsProjet`.
3. **Préparer l'arbre** : `bun install --ignore-scripts --no-save` ; `cd packages/shared && npx prisma generate --generator client && bun run build`. Ne jamais committer `bun.lock`.
4. **Rejouer** : `bash .amsf/scripts/baseline.sh <chemins des projets transitifs>`. Comparer aux fichiers de `.amsf/baselines/` : seuls les rouges NEUFS sont des régressions.
5. **Contrats** : si `packages/shared` ou `services/gateway/route-manifest.json` a bougé, régénérer (`api-endpoints`, `ios-endpoints`, `android-endpoints`, `translator-languages`) et exiger un `git status` propre.
6. **Natif** : iOS, Android, SDK Swift et traducteur se prouvent par leur job CI sur la PR ; citer l'identifiant du run.
7. **Diff** : relire `git diff origin/dev...HEAD` en entier avant de conclure.

Statuts : PASS · FAIL · BLOCKED · NOT VERIFIED · NOT APPLICABLE. Consigner dans `.amsf/reports/regression-report.md`.
