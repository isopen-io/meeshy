# Analyse — Itération 174i (2026-07-19) — `ParticipantsView`

**Scope :** iOS **exclusivement**.
**Surface :** `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`
**Piste :** VoiceOver (grouping des rangées de membres).

## Contexte

`ParticipantsView` (liste des membres d'une conversation de groupe) a déjà été
vérifiée en **69i** pour le seul bouton retour (`chevron.left` déjà labellisé
`common.back`). Ses **rangées de participants** n'ont jamais été auditées pour
VoiceOver. Typographie **déjà 100 % sémantique** (`MeeshyFont.relative(...)`
partout, 0 `.font(.system(size:))`) → **aucune migration Dynamic Type**. Strings
**déjà localisées** (`String(localized:defaultValue:)` partout) → **aucun gap
i18n**. Itération **purement VoiceOver**.

## Lacunes VoiceOver identifiées

1. **Rangée de membre non groupée.** `participantRow(_:)` rend un `HStack`
   (avatar + nom + badge rôle + `@username` + « Depuis <date> ») **sans**
   `.accessibilityElement`. VoiceOver s'arrête séparément sur chaque sous-vue :
   l'utilisateur entend « Alice », swipe → « Admin », swipe → « @alice »,
   swipe → « Depuis », swipe → « 3 mars 24 » — **5 arrêts fragmentés** au lieu
   d'un membre cohérent. Le badge de rôle et l'horodatage flottent hors contexte.

2. **Présence portée par la couleur seule.** L'état de présence (`presenceState`)
   est rendu **uniquement** par la couleur du dot de l'avatar (vert / orange /
   aucun). VoiceOver n'annonce **aucune** information de présence → viol.
   « never rely only on color to convey meaning » (HIG / WCAG 1.4.1).

3. **Glyphe d'en-tête décoratif exposé.** `person.2.fill` du `memberCountHeader`
   est lu par VoiceOver (« personne 2 fill ») alors que le compteur textuel
   adjacent (« 4 membres ») porte déjà l'information.

## Correctifs (174i)

- **Rangée** → `.accessibilityElement(children: .combine)` +
  `.accessibilityLabel(participantAccessibilityLabel(...))`. Label composé **1
  arrêt** : nom (+ « (vous) » si soi-même) → rôle (si ≠ membre) → présence →
  `@username` → « Depuis <date> », joints par `", "`. Les actions du
  `contextMenu` (promouvoir / rétrograder / retirer) restent exposées (préservées
  par `.combine`, contrairement à `.ignore`).
- **Présence** → réutilise le helper SSOT SDK `PresenceState.localizedLabel`
  (`presence.online/recent/away`, clés **existantes**, **0 clé neuve**). Annoncée
  **seulement** pour `online`/`recent`/`away` (états à dot visible) ; `offline`
  reste muet — **parité stricte** avec le visuel (offline = pas de dot, doctrine
  présence « WhatsApp »).
- **En-tête** → `person.2.fill` `.accessibilityHidden(true)` (compteur textuel
  conserve l'info).

## Non-goals

- Aucun changement de layout / police / couleur / animation.
- Aucune clé i18n neuve (réutilisation `presence.*` + clés `participants.*`
  existantes).
- Aucune modification SDK (`PresenceState.localizedLabel` déjà public).
- Aucune logique métier / réseau touchée. 0 test neuf.

## Vérification

- Build CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2).
- Aucun test n'assert sur `ParticipantsView` (grep). Changement additif a11y pur.
