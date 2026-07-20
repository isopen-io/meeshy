# Plan Itération 146i — `VoiceProfileManageView` (a11y VoiceOver + Dynamic Type)

**Date** : 2026-07-16
**Piste** : iOS (`i`)
**Base** : `main` HEAD `bd86317`
**Branche** : `claude/laughing-thompson-5b696g`
**Gate** : CI `iOS Tests`

## Objectif

Combler les lacunes VoiceOver de l'écran de gestion du profil vocal et harmoniser le glyphe de statut avec
Dynamic Type, sans toucher la logique ni le ViewModel.

## Étapes

1. **Sync** : reset `claude/laughing-thompson-5b696g` sur `origin/main` (HEAD `bd86317`). ✅
2. **Contention** : vérifier les PR iOS ouvertes → `get_files` sur #1961 (grosse PR « Modernize ») confirme
   0 intersection avec `VoiceProfileManageView`. ✅
3. **Édits** (1 fichier) :
   - Bouton fermeture → `.accessibilityLabel(common.close)` + commentaire doctrine 82i/87i (glyphe figé). ✅
   - Héros `person.wave.2.fill` → `.accessibilityHidden(true)` + commentaire doctrine 84i (figé). ✅
   - Glyphe de statut → `MeeshyFont.relative(28)` + `.accessibilityHidden(true)`. ✅
   - Carte de statut → `.accessibilityElement(children: .combine)`. ✅
4. **Docs** : analyse `2026-07-16-iteration-146i-voiceprofilemanageview.md` + ce plan + mise à jour
   `branch-tracking.md`. ✅
5. **Commit + push** sur la branche désignée, ouvrir la PR, s'abonner à l'activité PR.

## Non-régression

- 0 logique, 0 test neuf, 0 clé i18n neuve (`common.close` réutilisée), `import MeeshyUI` déjà présent.
- 2 `.system` restants assumés figés (close, héros) — annotés + traités VoiceOver.
- Gate final : CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2). Container Linux → pas de build local
  possible ; changements = modificateurs a11y additifs + 1 swap de token `relative` déjà utilisé verbatim
  dans le même fichier → risque de compile minimal.
