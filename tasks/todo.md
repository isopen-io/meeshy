# Vérification visuelle E2E — Settings & Préférences (Meeshy-iOS26) — 2026-07-24

> Suite dynamique de l'audit statique `tasks/audit-settings-profile-ios-2026-07-24.md` (18 correctifs appliqués, non commités).
> Simulateur : Meeshy-iOS26 `C295B364-8CA6-4214-BC52-E411A97EBFE2` (booted) · Backend : gate.meeshy.me (gateway local éteint) · Compte test : `apps/ios/fastlane/.env`.

## Plan

- [ ] 1. Rebuild de l'app avec les 18 correctifs (le build installé sur Meeshy-iOS26 date du 18/07, AVANT les correctifs)
- [ ] 2. Installation sur Meeshy-iOS26 (`simctl install` — préserve la session/keychain) + lancement + vérif état connecté
- [ ] 3. Workflow multi-agents `settings-e2e-visual-audit` :
  - [ ] Phase Verify — 13 unités de feature vérifiées SÉQUENTIELLEMENT (simulateur = ressource exclusive), 1 agent sonnet par unité : navigation visuelle réelle (screenshots lus), exercice de chaque contrôle, vérification de l'IMPACT SÉMANTIQUE (persistance sortie/retour + kill/relaunch, contre-vérification API si pertinent)
  - [ ] Phase Fix — chaque défaut trouvé = petit problème isolé confié au modèle le moins cher capable (haiku pour tiny/small, sonnet pour medium), groupé par fichier, séquentiel (pas de conflits)
  - [ ] Phase Rebuild — rebuild + réinstallation + relance
  - [ ] Phase Reverify — re-vérification visuelle des seules unités corrigées
- [ ] 4. Rapport final + mise à jour du fichier d'audit

## Unités vérifiées (ordre d'exécution)

| # | Unité | Points sémantiques clés (dont correctifs à re-prouver visuellement) |
|---|---|---|
| 1 | settings-hub | pickers thème/langue à effet immédiat, ouverture des sheets, logout PRÉSENT (non tapé) |
| 2 | notifications | persistance toggles, Badges persiste (#4), « Messages vocaux » ABSENT (#6) |
| 3 | privacy | toggles actifs persistent, placeholders « Bientôt » grisés non interactifs |
| 4 | media-storage | JSON/CSV exclusifs (#8), toggle Media ABSENT (#9), export aboutit (#3), clear cache |
| 5 | security | 2FA clé manuelle = base32 sans otpauth:// (#1), msg « mdp actuel incorrect » localisé (#7), sessions actives |
| 6 | account-danger | BlockedUsers OK, DeleteAccount : garde présente, JAMAIS confirmé |
| 7 | affiliate | stats + création + copie lien |
| 8 | user-stats | données réelles chargent |
| 9 | profile | clear langue régionale persiste après kill/relaunch (#5), posts chargent |
| 10 | edit-profile | save bio/displayName persiste (kill/relaunch), valeurs remises ensuite |
| 11 | voice-manage | toggle public persiste à la réouverture (#2), liste échantillons ABSENTE (#10) |
| 12 | voice-wizard | consent → étape ÂGE → recording (#11), annulation propre |
| 13 | legal-info | « Noter l'app » PRÉSENT (#13), liens OK |

## Règles de sécurité (agents)

- JAMAIS confirmer suppression de compte, JAMAIS changer réellement le mot de passe, JAMAIS activer le 2FA jusqu'au bout, JAMAIS se déconnecter sans re-login.
- Toute préférence modifiée est REMISE à sa valeur initiale après vérification.
- Toujours `--udid C295B364-8CA6-4214-BC52-E411A97EBFE2` (2 simulateurs bootés).

## Review

(à compléter en fin de run)
