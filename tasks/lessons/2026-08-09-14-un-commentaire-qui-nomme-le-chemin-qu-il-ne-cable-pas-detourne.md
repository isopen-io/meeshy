## 2026-08-09 (14) — Un commentaire qui NOMME le chemin qu'il ne câble pas détourne les audits suivants

**Contexte.** Trois unités partagées (`processExplicitLinks`, `reconcileEditedMentions`,
`emitMentionCreated`) portaient, en tête de leur câblage sur
`PUT /conversations/:id/messages/:messageId`, la phrase : « transport PRIMAIRE du client iOS, qui
édite via `PUT /messages/:id` ». Le chemin **nommé** et le chemin **câblé** n'étaient pas le même
— et c'est le chemin nommé, `routes/messages.ts`, qu'iOS appelle réellement
(`MessageService.editMessage`). Il n'appelait aucune des trois unités.

**Pourquoi c'est pire qu'un commentaire simplement faux.** La leçon du 2026-08-07 (3) disait qu'une
garantie énoncée dans un commentaire n'est pas une garantie du système. Le corollaire est plus
mordant : un commentaire qui nomme précisément un chemin, avec sa route et son fichier client, se lit
comme la **preuve** que ce chemin a été audité. Il ne se contente pas de ne rien garantir — il
désarme le prochain audit, qui trouve son propre sujet déjà traité et passe. Deux cycles ont relu ces
lignes.

**Ce qui l'a rendu possible.** Deux routes portent le même verbe métier sous des chemins
quasi-homographes : `PUT /messages/:messageId` et `PUT /conversations/:id/messages/:messageId`.
Abrégées toutes deux en « la route REST d'édition », elles sont indiscernables en prose. Le raccourci
`PUT /messages/:id` désignait la première et annotait la seconde.

**Règle.**
1. Une affirmation sur QUI appelle un chemin se vérifie côté client, pas côté serveur : `grep` dans
   `apps/*` et `packages/MeeshySDK` sur l'endpoint littéral. Trente secondes.
2. Quand deux routes partagent un verbe métier, ne jamais les abréger dans un commentaire : chemin
   complet **et** fichier (`PUT /messages/:messageId` — `routes/messages.ts`). L'ambiguïté d'un
   raccourci est exactement ce qui a permis de câbler l'une en croyant câbler l'autre.
3. Corollaire pour l'audit : lorsqu'une unité partagée est introduite « pour que le prochain
   transport ne l'oublie pas », énumérer les transports EXISTANTS depuis les points d'appel de
   l'unité — pas depuis ses commentaires. Ici, `grep reconcileEditedMentions` rendait 2 sites sur 4.
