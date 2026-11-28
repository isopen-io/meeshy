# Déroulé d'un lot

1. **Relever** — `git fetch`, `STATE.md`, inventaire ; issues ouvertes du domaine.
2. **Cadrer** — une issue (contexte, preuve, critère de fin), périmètre d'écriture, consommateurs (`inventaire.mjs --affected`, `DEPENDENCY-GRAPH.md`).
3. **Réserver** — pousser un témoin rouge ou un squelette dans le quart d'heure.
4. **Écrire** — TDD, plus petit changement ; un paquet partagé passe par `plateforme-partagee`.
5. **Valider** — skill `regression-validation` sur l'arbre qui contient `dev`.
6. **Relire** — un agent qui n'a pas écrit : `auditeur-release` ; `securite-applicative` ou `auditeur-adversarial` si le lot est sensible.
7. **Livrer** — commit `Closes #n`, PR si le porteur la demande, preuve dans l'issue.
8. **Consigner** — `STATE.md`, rapport concerné, issues pour ce qui reste.

Parallèle : des lots sur des projets sans fichier commun. Séquentiel : tout ce qui touche un contrat ou `packages/shared`. Trois corrections différentes qui échouent ⇒ arrêter et chercher la cause.
