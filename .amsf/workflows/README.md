# Workflows

La source est `.claude/workflows/` et `.github/workflows/`. Le déroulé d'une passe :

1. Découverte en lecture seule : `INVENTORY.md`, `DEPENDENCY-GRAPH.md`.
2. Référence : `baselines/<date>.md`, rouges préexistants notés à part.
3. Constats : une issue par constat, dans un milestone, indexée dans `BACKLOG.md`.
4. Lots : une branche poussée tôt par issue, témoin rouge puis vert, `dev` fusionnée avant la PR.
5. Revue indépendante : `auditeur-release`, plus `auditeur-adversarial` pour la cryptographie, l'authentification et les migrations.
6. Statut : `RELEASE-STATUS.md`, `STATE.md`, rapport daté dans `reports/`.
