# Itération 132i — Analyse UI/UX iOS : `StatusBubbleController` (MoodReplyConfirmationOverlay)

**Date** : 2026-07-03
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift`
**Base** : `main` HEAD (`6de9912e`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Le fichier `StatusBubbleController.swift` (dans `Services/`) contient, en plus du contrôleur singleton,
la **View** `MoodReplyConfirmationOverlay` — le pop-up « Répondre à cette humeur ? » (titre + résumé du
mood + boutons Quitter / Répondre) présenté quand un mood est touché hors de la conversation directe de
son auteur. Surface **fraîche** : 4 `.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **0 PR
iOS ouverte** au démarrage → **0 contention**. Numéro **132i** (131i = `MessageDetailSheet` mergé #1409).

## Constat (avant 132i)

**4 `.font(.system(size:))`** — tous des **libellés texte réactifs** dans le pop-up, aucun borné par un
cadre de dimension fixe :
- titre « Répondre à cette humeur ? » (16 semibold) ;
- résumé du mood `moodSummary` (14) ;
- libellé du bouton Quitter (15 medium) ;
- libellé du bouton Répondre (15 semibold).

## Corrections appliquées (1 fichier, 0 logique)

- **4/4 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (mêmes tailles/poids) : titre
  (`relative(16, weight: .semibold)`), résumé (`relative(14)`), Quitter (`relative(15, weight: .medium)`),
  Répondre (`relative(15, weight: .semibold)`). Ces **vrais libellés texte** scalent désormais sous
  Dynamic Type.

Aucun gel : aucun de ces textes n'est borné par un cadre de dimension fixe (les boutons utilisent
`.frame(maxWidth: .infinity)` + `.padding(.vertical:)`, pas de hauteur fixe). → **`relative`, pas figé**.

Accessibilité déjà conforme → **intacte** : le pop-up porte `.accessibilityElement(children: .contain)` ;
les deux boutons sont des `Button` texte (label lisible par VoiceOver). Palette (`theme.textPrimary/
Secondary`, `MeeshyColors.brandGradient`, bordure indigo `6366F1`) déjà conforme → non touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve (les 4 chaînes sont déjà
  `String(localized:)`). `import MeeshyUI` déjà présent. Le contrôleur singleton et le `ViewModifier`
  ne sont **pas** touchés.
- Les 2 tests référençant le fichier (`StatusBubbleControllerTests`, `StatusBubbleControllerReplyTests`)
  exercent le **comportement du contrôleur** (show / dismiss / requestReply / repliesInline), **pas** la
  View ni les polices → aucune régression.

## Statut

**TERMINÉE** — `MoodReplyConfirmationOverlay` Dynamic Type soldé (4/4 libellés → `relative`, a11y déjà en
place). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StatusBubbleController` (`MoodReplyConfirmationOverlay`) — 4/4 libellés texte du pop-up de confirmation
  de réponse au mood → `MeeshyFont.relative` ; aucun gel (pas de cadre fixe) ; a11y déjà en place. **SOLDÉ 132i.**
