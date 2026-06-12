# Plan — UI/UX Iteration 42 (2026-06-12)

Base : main @ 167ef31c. Analyse : `docs/analyses/uiux/2026-06-12-iteration-42.md`.
Branche : `claude/blissful-ritchie-e672ur`.

## 1. Web — pages v2 communities/links/settings

- [x] `locales/{en,fr,es,pt}/links.json` : sous-arbre `v2` (titre, stats, badges, toasts, modale, a11y)
- [x] `locales/{en,fr,es,pt}/groups.json` : sous-arbre `v2` (pages communautés liste + détail + labels préférences)
- [x] `locales/{en,fr,es,pt}/settings.json` : clés `v2settings.theme*`, `notification*`, `notifAria*`
- [x] `app/v2/(protected)/links/page.tsx` : `useI18n('links')`, toutes chaînes → `t()`, date locale
  dynamique, aria-labels copier/régénérer/toggle
- [x] `app/v2/(protected)/communities/page.tsx` : `useI18n('groups')`, toutes chaînes → `t()`
- [x] `app/v2/(protected)/communities/[id]/page.tsx` : idem + map préférences → `t()`,
  `toLocaleDateString(locale)` dynamique
- [x] `app/v2/(protected)/settings/page.tsx` : toasts thème/notifications + 4 aria-labels → `t()`
- [x] Vérif : JSON parsés, parité 4 locales sur les namespaces touchés, `tsc --noEmit` inchangé

## 2. iOS — migration hex → tokens charte (différé iter-41)

- [x] SDK `MeeshyColors.swift` : + `errorSoft`, `errorStrong`, `successDeep` ;
  + `errorHex`, `infoHex`, `indigo400Hex`, `indigo600Hex`
- [x] `SettingsView.swift` : 38 littéraux hex → `MeeshyColors.*Hex`
- [x] `NotificationSettingsView.swift` : 40 littéraux → tokens
- [x] `DataExportView.swift` : accent `3498DB`→`infoHex` ; `FF6B6B`→error ; `2ECC71`→success ;
  tints → tokens
- [x] `ConversationView+Composer.swift` : accents dynamiques L100, bannière édition warning,
  états envoyés success/successDeep
- [x] `OnboardingView.swift` : stops sémantiques (errorSoft/errorStrong/successDeep/indigo500/
  indigo300/indigo950) ; washes de fond par page conservés (décision documentée)
- [x] Vérif : grep négatif — plus aucun hex hors charte sur les 6 surfaces (hors washes onboarding)

## 3. Android

- [x] `feature/contacts` strings.xml en+fr : `contacts_tab_{contacts,requests,discover,blocked}`
- [x] `ContactsScreen.kt` : mapping `ContactsTab` → `stringResource`
- [x] `sdk-ui` strings.xml en+fr : `avatar_fallback` ; `MeeshyAvatar.kt` l'utilise
- [x] Vérif : strings.xml parsés, parité values/values-fr

## 4. Livraison

- [x] Commit + push `claude/blissful-ritchie-e672ur`
- [ ] PR vers main, CI verte, merge (numéro tracé dans `branch-tracking.md` au merge)
- [x] Mise à jour `branch-tracking.md` (itération 42 en cours, prochaine itération 43)

## Review

- Web : 3 pages v2 (links, communities, communities/[id]) + toasts/aria settings page localisés
  en 4 locales ; parité validée par script récursif ; `tsc --noEmit` strictement identique
  avant/après (seule l'erreur TS5101 préexistante du tsconfig).
- iOS : 6 surfaces migrées vers la charte ; 3 tokens tonals + 4 constantes hex ajoutés au SDK
  (échelle Tailwind cohérente : red-300/red-500/emerald-500). Grep négatif vérifié — les seuls
  hex restants sur ces fichiers sont les washes d'ambiance onboarding (décision documentée).
- Android : onglets contacts localisés (différé 41 soldé), fallback avatar TalkBack localisé.
- Cohérence cross-frontend : surface liens désormais localisée web + iOS ; settings dans la
  charte sur les 3 fronts.
