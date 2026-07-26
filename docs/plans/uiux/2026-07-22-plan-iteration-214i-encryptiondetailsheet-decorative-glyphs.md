# Plan Iteration-214i — ConversationEncryptionDetailSheet decorative-glyph VoiceOver hide

## Objectif

Masquer à VoiceOver les 4 SF Symbols décoratifs de
`ConversationEncryptionDetailSheet` (2 en-têtes de statut, la rangée toggle, le
bouton « Enable encryption ») pour que VoiceOver n'annonce que le texte utile.
Continuité directe de la doctrine 196i/213i.

## Base

- Branche de travail : `claude/laughing-thompson-e0cc99` (213i mergée → resync)
- Base : `main` HEAD `ffef133`
- Itération : **214i** (aucune PR ouverte au moment du choix → 0 collision).

## Étapes

1. [x] Resync `main` (213i mergée #2275).
2. [x] `list_pull_requests` → `[]` (0 PR ouverte) → 0 collision.
3. [x] Confirmer les 4 glyphes décoratifs sur `main` (l.67/113/137/193),
   0 `.accessibilityHidden`.
4. [x] Ajouter `.accessibilityHidden(true)` sur chaque `Image(systemName:)`.
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit + push `claude/laughing-thompson-e0cc99` + PR.

## Portée

1 fichier iOS, +13 lignes (9 commentaire), 0 clé i18n, 0 logique / 0 réseau /
0 layout / 0 visuel / 0 test neuf. Gate = CI `iOS Tests`.

## Non-objectifs

- Pas de regroupement `.accessibilityElement(children: .combine)` des en-têtes
  (piste 215i+, bénéfice marginal une fois les glyphes masqués).
- Pas de touche aux `LabeledContent`/`Toggle` (porteurs d'information).
