## Leçon 293 — Un identifiant de lot n'est pas un nom (2026-08-26)

**Contexte.** Le pilotage GitHub (11 milestones, 86 issues) a d'abord été créé en
recopiant les identifiants internes des trackers : « Composer v2 — Vague A ·
gateway P1 », « T2.1 — … », « Lot 0 — … », « RC-4 », « L1-02 (ii) ». Le porteur a
corrigé aussitôt : *les milestones doivent avoir des noms sémantiques clairs, idem
pour les tâches, jalons et phases — pas A, B, C.*

> **Un code (vague, lot, T2.1, RC-4) est une clé de JOINTURE entre documents, jamais
> un titre.** Il ne dit rien à qui n'a pas lu le plan qui l'a frappé, et un
> tableau de pilotage est lu précisément par ceux qui ne l'ont pas lu. Le titre
> énonce le RÉSULTAT attendu (« Une story ne peut plus partir deux fois »,
> « Android émet les scènes v3 ») ; le code vit dans le corps, en « référence
> interne », pour que la traçabilité vers `tasks/` et la planche survive.

Deux corollaires :

- **La règle vaut pour ce qu'on ÉCRIRA** : phases d'une roadmap, jalons, noms de
  vagues. « Vague A → B → C » est une séquence, pas trois noms ; la séquence se
  dit par l'ordre des milestones et leurs dépendances, pas par une lettre.
- **Renommer après coup coûte moins que ça n'en a l'air** (61 titres en une
  passe scriptée, codes conservés dans les corps) — mais le premier jet aurait dû
  être sémantique : le tracker interne parle en codes parce qu'il est écrit par
  ceux qui les connaissent ; le tableau public ne l'est pas.
