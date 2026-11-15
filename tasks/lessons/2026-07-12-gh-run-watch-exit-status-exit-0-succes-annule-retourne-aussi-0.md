## 2026-07-12 — `gh run watch --exit-status` exit 0 ≠ succès (annulé retourne aussi 0)

Annoncé une run CI « verte » sur la foi d'un `gh run watch --exit-status` sorti en 0 : la run était
en réalité CANCELLED (annulée par le push suivant via la concurrency). L'exit-status de `gh run watch`
ne distingue pas success/cancelled dans cette version de gh — seul `failure` est non-zéro.

**Règles** :
- Un verdict CI se lit dans `gh run view <id> --json status,conclusion` (conclusion == "success"),
  jamais dans l'exit code de `gh run watch` seul. Même famille que « meeshy.sh exit 0 malgré FAILED »
  et « un résultat de tests se valide sur le compte attendu ».
- Sur un main à pushes rapprochés, chaque push ANNULE la run précédente (concurrency) : le seul
  verdict significatif est celui de la DERNIÈRE run du tip — attendre qu'elle se termine avant
  d'annoncer quoi que ce soit.
