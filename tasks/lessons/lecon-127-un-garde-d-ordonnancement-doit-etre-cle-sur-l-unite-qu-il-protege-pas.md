## Leçon 127 — un garde d'ordonnancement doit être clé sur l'UNITÉ qu'il protège, pas sur son conteneur (2026-08-12, routine messaging, cycle 89)

`_isStaleTranslationResult` protégeait une vraie course (deux éditions rapprochées, réponses ZMQ
dans le désordre) avec un garde clé sur le MESSAGE. Mais l'unité que le pipeline traite, écrit et
rend, c'est le couple **(message, langue)** : une requête porte N langues, le translator les rend
une par une, `Message.translations` les range une par une, et une retraduction peut n'en viser
qu'une seule.

1. **Un garde trop large ne « protège trop » pas — il détruit.** Périmer par message faisait tomber
   des résultats parfaitement valides pour des langues qu'aucune tâche récente n'avait redemandées.
   Et un résultat jeté ici est perdu pour toujours : rien ne retente une traduction absente.
2. **Le test qui le prouve doit faire vivre DEUX tâches**, une par langue, avec des `taskId`
   distincts. Un test à une seule tâche valide indifféremment le garde large et le garde étroit —
   c'est la leçon 117 (« un double qui n'évalue pas le `where` valide les deux versions du code »)
   appliquée à un garde plutôt qu'à une requête.
3. **La même erreur de granularité se répétait un étage plus bas**, dans `ZmqTranslationClient` :
   `removePendingRequest` soldait la REQUÊTE au premier résultat, alors que ce qui se solde est une
   LANGUE. Même conteneur, même unité, même défaut — trouver l'un doit faire chercher l'autre.
4. **Écrire la clé composite, jamais la déduire.** Les deux côtés (enregistrement, lecture)
   normalisent par le SSOT `normalizeLanguageCode` : le demandeur dit `'pt-BR'`, le translator rend
   `'pt'`. Une clé composite dont les deux moitiés ne sont pas produites par la même fonction est un
   garde qui ne se déclenche jamais — ou toujours.

---
