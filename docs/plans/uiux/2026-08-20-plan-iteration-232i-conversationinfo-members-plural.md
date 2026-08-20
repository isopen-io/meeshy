# Plan — Iteration-232i : `ConversationInfoSheet` compteur membres pluralisé

**Analyse** : `docs/analyses/uiux/2026-08-20-iteration-232i-conversationinfo-members-plural.md`
**Base** : `main` HEAD `13bedd98` · **Branche** : `claude/intelligent-noether-kana7q` (re-lancée fraîche)

## Objectif

Éliminer le motif « racine + `%@` alimenté par un ternaire `? "s" : ""` » qui
plaquait un « s » latin sur toutes les langues au-delà de 1 — italien, allemand
et arabe s'en trouvaient linguistiquement faux ou visuellement absurdes.

## Étapes

- [x] Resync sur `origin/main` HEAD `13bedd98` (post-merge 231i + follow-ups #3237/#3240) ; numéro 232i choisi strictement au-dessus du plus haut mergé (231i) ; collision essaim vérifiée (`list_pull_requests` : 0 PR iOS ouverte).
- [x] Réévaluer la piste `unit.members` du carry-over 231i : les 4 sites sont gardés par `> 2` ou par « non-directe » → impact réel mais faible et dispersé, choix repoussé.
- [x] Trouver par grep `? "s" : ""` un défaut de la MÊME famille mais à impact direct sur un libellé d'en-tête : `conversation.info.members-count` (`ConversationInfoSheet.swift:489`).
- [x] Catalogue : convertir la clé de `stringUnit` (7 locales flat `"%d membre%@"`) à `variations.plural` (2 formes en 6 locales latines/germaniques + 6 formes AR, idiome `message-detail.views.not-seen.count`).
- [x] Extraire helper pur statique `ConversationInfoSheet.membersCountLabel(_:bundle:locale:)` (idiome 231i / `PostStatAccessibility`).
- [x] Simplifier le call site : un seul argument au format, plus de `%@` — le motif fautif disparaît par construction.
- [x] Ajouter `ConversationInfoMembersCountLabelTests` — 14 tests : régression EXPLICITE des défauts IT/DE (« 4 membri », « 5 Mitglieder »), garde arabe (« aucun caractère `s` latin dans les 6 formes »), garde globale « singulier ≠ pluriel dans toutes les locales latines ».
- [x] Ajouter les 4 entrées `pbxproj` pour le fichier de test neuf (leçon 230i/231i).
- [x] Documenter analyse + plan + pointeur de tracking.
- [ ] Gate réel : CI iOS Tests.

## Non-fait, et pourquoi

- **`unit.members` dispersé** — mérite son itération dédiée (4 sites + décision helper partagé ou local).
- **Tap de ligne VoiceOver du picker de transfert** — carry-over 230i/231i, demande simulateur.
- **Reste de `ConversationInfoSheet`** (documenté « 52 polices » en héritage) — passe surface par surface, hors scope 232i.

## Empreinte

| | |
|---|---|
| Fichier production | 1 (`ConversationInfoSheet.swift`) |
| Fichier test | 1 neuf (14 assertions) |
| Catalogue | 1 clé convertie flat → `variations.plural` (7 locales) |
| Clés i18n neuves | 0 |
| Fichiers pbxproj | 1 (4 entrées ajoutées) |
| Changement visuel | IT « membros » → « membri » ; DE « Mitglieds » → « Mitglieder » ; AR « عضوs » → 6 formes correctes ; FR/EN/ES/PT-BR identique pour N ≥ 2 |
| Logique / réseau / SDK | 0 |
