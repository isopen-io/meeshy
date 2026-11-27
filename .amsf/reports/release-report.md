# Release — 2026-11-27

Statuts : `../RELEASE-STATUS.md`. Statut global : **FAIL**.

Aucun artefact de release n'a été produit ni vérifié : pas de Docker dans le conteneur. Le contrôle `../scripts/check-image-resolution.mjs` établit que les images qu'on construirait aujourd'hui ne contiennent pas les versions testées (20 écarts).

Pour passer : PR #20719 fusionnée, #20730 tranchée et livrée, puis chaque porte rejouée par la CI sur le commit candidat.
