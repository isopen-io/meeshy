## Parité cross-platform : certifier la RÈGLE ne suffit pas — vérifier les MAPPINGS d'entrée (2026-07-12)
En livrant retry-on-failure sur web/iOS/Android, j'avais certifié que les 3 `CallRetryPolicy`
encodaient une règle byte-identique (failed/connectionLost → retryable). Vrai mais insuffisant :
la même règle nourrie par des MAPPINGS d'entrée différents produit un comportement différent.
Android `CallSignalMapper.endedEvent` collapsait toute fin distante non-`missed` en `Remote`
(non-retryable), tandis qu'iOS/web mappaient `failed`/`connectionLost` serveur vers du retryable
→ divergence reachable côté appelant. **Règle : après avoir prouvé qu'une décision partagée est
identique, tracer TOUS les chemins qui alimentent son entrée sur chaque plateforme (décodage
socket, détection locale, valeurs par défaut) et vérifier qu'ils produisent des entrées
équivalentes. La parité d'une fonction pure est vide si ses arguments divergent en amont.**
