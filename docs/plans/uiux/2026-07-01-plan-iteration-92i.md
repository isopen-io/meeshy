# Plan Itération 92i — `AffiliateView` Dynamic Type + VoiceOver

**Date** : 2026-07-01 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `b5385f23` · **Branche** : `claude/upbeat-euler-7xguwy`

## Objectif
Rendre l'écran « Parrainage » (`AffiliateView.swift`) conforme Dynamic Type + VoiceOver, sans
changer la logique. Continuation du différé 90i/91i (grandes surfaces restantes, une par itération).

## Étapes
- [x] Resync sur `main` HEAD ; vérifier PRs ouvertes (91i `DataExportView`/#1231, 90i `NewConversationView`/#1224 + `MagicLinkView`/#1225 pris) → choisir `AffiliateView` (non pris), numéro 92i.
- [x] Migrer 16/17 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight/`.rounded` préservés).
- [x] Garder figé + `.accessibilityHidden(true)` le hero `link` 36pt de l'état vide (doctrine 74i/86i).
- [x] Ajouter `.accessibilityLabel` aux 4 boutons icône sans intitulé (create/copy/share/delete) via SSOT inline `affiliate.action.*`.
- [x] Grouper `affiliateStatCard`, bloc texte `tokenRow`, en-tête de section via `.accessibilityElement(children: .combine)` ; `.isHeader` sur l'en-tête.
- [x] Vérifier : 1 seul `.system(size:)` restant (hero 36), pas d'import manquant (précédent `AffiliateCreateView` = MeeshyFont sans `import MeeshyUI`).
- [x] Docs analyse + plan + tracking.
- [ ] Commit + push + PR ; merge dans `main` après CI verte.

## Contraintes respectées
- 1 fichier code, 0 logique, 0 test neuf, 0 clé catalogue neuve (inline defaultValue = convention du fichier).
- Accent déterministe `2ECC71` + tokens sémantiques préservés (pas de swap palette).

## Suite (93i+)
Différé Dynamic Type restant : `LocationPickerView` (17), `MemberManagementSection` (17),
`StoryViewerView+Content` (31, ⚠️ collision i18n #1174), `ConversationView+Composer` (22, lot
critique prudent). Puis Glass adoption `MessageOverlayMenu` (21, via `AdaptiveGlassContainer`).
