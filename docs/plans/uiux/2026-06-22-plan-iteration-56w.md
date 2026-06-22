# Plan d'itération 56w — i18n dialogues confirm & flow téléphone (Web)

**Base** : `main` HEAD post-55w (#769) — `e1960c0`
**Branche** : `claude/practical-fermat-6k4qmh`

## Objectif
Solder deux surfaces FR dures du carry-over 53w (→ 56w+) : `AttachmentDeleteDialog` et `PhoneExistsModal`.

## Étapes
1. [x] `AttachmentDeleteDialog.tsx` — câbler `useI18n('attachments')`, réutiliser le bloc existant `contextMenu` (zéro nouvelle clé) + fallbacks EN.
2. [x] `auth.json` ×4 — ajouter sous-bloc `register.wizard.phoneExistsModal` (12 clés) en insertion ciblée après `recoverByPhone`.
3. [x] `PhoneExistsModal.tsx` — câbler les 3 étapes (choice/verify_code/success) ; réutiliser `phoneReset.{cancel,resendCode,success}` ; interpoler `{phone}`/`{seconds}`.
4. [x] Vérifs : JSON valide, parité 4 locales, pas de FR résiduel hors JSDoc, tests non impactés (PhoneExistsModal mocké).
5. [ ] Commit + push + CI verte + merge dans `main`.
6. [ ] Mettre à jour `branch-tracking.md` (56w mergée, base suivante) + supprimer la branche.

## Critères d'acceptation
- 4 locales à parité stricte sur les nouvelles clés.
- Diffs locale additifs uniquement.
- Aucun test cassé.

## Carry-over mis à jour
- ~~`AttachmentDeleteDialog.tsx` (~5 chaînes)~~ → SOLDÉ 56w (réutilise `attachments.contextMenu.*`).
- ~~`PhoneExistsModal.tsx` (~8 chaînes + flow SMS)~~ → SOLDÉ 56w (`auth.register.wizard.phoneExistsModal.*`).
- **Reste pour 57w+** : `ReelPlayer` + surface feed (large, i18n dédiée).
