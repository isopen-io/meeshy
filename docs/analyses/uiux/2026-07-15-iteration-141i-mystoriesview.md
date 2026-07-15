# Itération 141i — Analyse UI/UX iOS : `MyStoriesView`

**Date** : 2026-07-15
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`
**Base** : `main` HEAD (`5195bad`)
**Branche** : `claude/laughing-thompson-65518x`
**Gate** : CI `iOS Tests`

## Contexte

`MyStoriesView` est la feuille « Mes stories » présentée depuis le tray « Moi » : liste des stories
envoyées par l'utilisateur (vignette + `timeAgo` + métriques vues/réactions/commentaires), avec sélection
multiple, suppression groupée, swipe-to-delete, menu contextuel (Ouvrir / Éditer les vues / Partager /
Republier / Supprimer) et bouton de création. Surface **fraîche** : jamais balayée (aucun doc d'itération,
0 `MeeshyFont.relative`, 0 commentaire doctrine), **6 `.font(.system(size:))`**, **0 contention** (aucune
des 20 PR ouvertes ne touche ce fichier ; le peloton iOS est à 140i = `ThemedBackButton`, PR #1966).
Numéro **141i** (> 140i en vol).

## Constat (avant 141i)

**6 `.font(.system(size:))`** — aucun dans un cadre de dimension fixe, donc **tous scalables** :
- bouton de suppression groupée `Text` (15 semibold, capsule `maxWidth: .infinity`) ;
- `Text(story.timeAgo)` de la ligne (15 semibold) ;
- glyphe `ellipsis` d'indice de menu (16 semibold, `.padding(8)` — pas de `.frame` fixe) ;
- cercle de sélection `checkmark.circle.fill`/`circle` (22, déjà `accessibilityHidden`) ;
- icône de métrique `eye.fill`/`heart.fill`/`bubble.left.fill` (11) ;
- valeur de métrique `Text("\(value)")` (13 medium).

**Lacune VoiceOver** : la rangée de métriques (`HStack` icône + nombre) n'expose **aucun libellé** — VoiceOver
annonce des nombres nus « 42 », « 5 », « 3 » sans jamais dire de quoi il s'agit. Le glyphe `ellipsis`
n'est pas non plus masqué (bruit VoiceOver alors que les actions passent déjà par le `.contextMenu`).

## Corrections appliquées (1 fichier, 0 logique)

- **6/6 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (weight préservé) — **aucun gel** : aucun de
  ces libellés/glyphes n'est enfermé dans un cadre de dimension fixe (la vignette 64×64 est un composant
  frère, pas un conteneur de ces polices). Tout scale désormais sous Dynamic Type.
- **VoiceOver — lacune comblée** : chaque `metric(...)` reçoit un `label` explicite
  (`.accessibilityElement(children: .ignore)` + `.accessibilityLabel`) → VoiceOver annonce désormais
  « 42 vues », « 5 réactions », « 3 commentaires » au lieu de nombres nus. **3 clés i18n neuves** suffixées
  `.a11y` (VoiceOver-only, aucune UI visible), pattern inline `String(localized:defaultValue:)` identique au
  reste du fichier.
- **Glyphe `ellipsis`** → `.accessibilityHidden(true)` : purement décoratif (les actions de ligne sont
  exposées à VoiceOver via le rotor Actions du `.contextMenu`).

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf. `import MeeshyUI` déjà présent.
- Palette déjà tokenisée (`MeeshyColors.error`, `indigo950`, `accentColor` dérivé) → **0 swap**.
- Le cercle de sélection reste `accessibilityHidden` (état transmis par la trait `.isSelected` de la ligne,
  pattern `NewConversationView.userRow`) → inchangé.
- Aucun test ne référence `MyStoriesView` → aucune régression de test attendue.

## Statut

**TERMINÉE** — `MyStoriesView` Dynamic Type + VoiceOver soldé (6/6 polices → `relative` ; métriques
labellisées ; `ellipsis` masqué). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `MyStoriesView` — 6/6 `.font(.system(size:))` → `MeeshyFont.relative` (aucun gel, pas de cadre fixe) ;
  VoiceOver = 3 métriques labellisées (`story.mine.metric.{views,reactions,comments}.a11y`, 3 clés neuves
  `.a11y`) + `ellipsis` `.accessibilityHidden` ; cercle de sélection déjà masqué (trait `.isSelected`) ;
  palette tokenisée 0 swap ; 1 fichier, 0 logique/0 test neuf. **SOLDÉ 141i.**
