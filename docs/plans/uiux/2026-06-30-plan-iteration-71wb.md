# Plan — Itération 71wb (web)

**Surface** : `components/conversations/conversation-item/message-formatting.tsx` (aperçu dernier message)
**Classe** : parité dark-mode — couleurs catégorielles `text-*-500` sans variante `dark:`

## Étapes
1. [x] Audit : 7 icônes de type de pièce jointe (`📷🎥🎵📄📝💻📎`) en `text-*-500` sans `dark:`.
2. [x] TDD RED : nouveau `__tests__/message-formatting.test.tsx` (7 cas via `formatLastMessage`).
3. [x] GREEN : ajout `dark:text-*-400` à chacune des 7 icônes (1 fichier, 7 lignes).
4. [x] Vérifs : suite dédiée 7/7 ; sweep `components/conversations` 543/543 (2 échecs pré-existants hors scope).
5. [x] Docs : analyse 71wb + ce plan + MAJ `branch-tracking.md` (pointeur + History).
6. [ ] Commit + push branche `claude/practical-fermat-kajcer` + PR + CI vert → merge `main`.

## Garde-fous
- **Orthogonal** aux PR en vol (a11y clavier #1100/#1111/#1110/#1106/#1093/#1092/#1091 ; i18n #1108 ;
  motion #862). Axe distinct (dark-mode token), surface disjointe.
- **Light mode inchangé** : on n'ajoute QUE des variantes `dark:` ; aucune nuance claire touchée.
- Pas de migration `--gp-*` : ces couleurs sont **catégorielles/décoratives** (type de média), sans
  équivalent token sémantique ; la variante `dark:-400` est la convention déjà en place dans le frère
  `ExpandableMessageText`.
- Numérotée **71wb** pour éviter la collision avec le `71w` a11y badges (#1100).
