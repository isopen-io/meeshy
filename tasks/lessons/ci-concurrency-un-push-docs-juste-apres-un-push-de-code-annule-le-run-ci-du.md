## CI concurrency : un push docs juste après un push de code ANNULE le run CI du code (2026-07-12)
La CI Meeshy (workflow « CI ») a un groupe de concurrence par branche : chaque nouveau push
sur `main` annule le run en cours. En poussant un commit `docs(...)` immédiatement après un
commit `fix(...)`/`feat(...)`, j'ai annulé à répétition (5+ fois cette session) le run CI qui
validait le commit de code — verdict `cancelled`, jamais `success`. Pire : si le commit docs
ne matche pas les path-filters du job de test concerné, ce job est SKIP sur le commit docs →
le code n'obtient JAMAIS de verdict CI propre. **Règle : après un commit de code qui a besoin
de validation CI, NE PAS pousser de commit docs/lessons par-dessus tant que le run CI du code
n'est pas terminé. Grouper la doc AVEC le commit de code, OU attendre le vert avant de pousser
la doc.** Vérifier le verdict sur le job pertinent (`Test web`/`Test gateway`), pas juste sur le
run global — le run peut être `in_progress` alors que le job qui m'intéresse est déjà `success`.
