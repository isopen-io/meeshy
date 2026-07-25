# Audit fonctionnel — Vues Settings & Profile (iOS)

> Date : 2026-07-24 · Méthode : audit statique du câblage (chaque contrôle → handler → ViewModel → service/API), vérifié par passe adversariale.
> Périmètre : 13 unités de vue (~24 écrans) atteignables depuis Settings et Profile. **237 contrôles interactifs audités.**

## ✅ Correctifs appliqués (branche `fix/settings-profile-wiring-audit`)

Les **18 défauts réels** (P0+P1+P2) ont été corrigés (TDD là où un point de test existe). Les 8 placeholders « Bientôt » et les non-défauts #15 sont exclus (décision produit).

| # | Correctif | Vérification |
|---|---|---|
| 1 | 2FA : clé manuelle affiche/copie `setup.secret` (base32) au lieu de `otpauthUrl` | compile app ✓ |
| 2 | `toggleVoicePublic` persiste via nouveau `AuthManaging.applyLocalVoicePublicChange` (currentUser + keychain) | test VM vert (RED→GREEN) |
| 3 | `DataExportData` rendu `Codable`, encode complet (profil/messages/contacts/csv) ; wrapper lossy supprimé | test SDK round-trip vert (RED→GREEN) |
| 4 | Badge gaté sur `notificationBadgeEnabled` (provider injectable) ; widget non gaté | test SDK vert (RED→GREEN) |
| 5 | Clear langue régionale : schema gateway `z.union([literal(''),…])` + handler `''→null` + iOS `changedOrNil` | vitest + jest + test iOS verts (RED→GREEN) |
| 6 | Toggle « Messages vocaux » orphelin retiré | compile app ✓ |
| 7 | ChangePassword : 400 → message localisé via `MeeshyError.server(400,_)` (branche `APIError` morte retirée) | compile app ✓ |
| 8 | Export : format JSON/CSV en choix exclusif (radio) | compile app ✓ |
| 9 | Export : toggle « Media » (sans effet) retiré | compile app ✓ |
| 10 | Voix : liste d'échantillons morte + bouton delete retirés (ajout d'échantillons conservé) | compile app ✓ |
| 11 | Wizard voix : étape âge câblée (consent→âge→`grantConsent(birthDate)`→recording ; birthDate envoyé YYYY-MM-DD) | tests VM verts (RED→GREEN) |
| 12 | `sendComment()` mort retiré de `ProfileUserPostsViewModel` | compile app ✓ |
| 13 | Bouton « Noter l'app » ajouté (StoreKit `requestReview`, ID-free) | compile app ✓ |
| 14 | `EditProfileView` documenté (langues hors périmètre) | compile app ✓ |

**Statut CI attendu** : shared 39/39 · gateway profil 82/82 + 32 extended · SDK (DataExport, NotificationCoordinator) · app `** TEST SUCCEEDED **`.
Note : le nouveau `ProfileViewSaveProfileTests.swift` est glob-inclus par `xcodegen` (CI), pas dans le pbxproj committé — vérifié vert sur projet régénéré localement.

## Résumé exécutif

| Statut | Nb | % |
|---|---|---|
| ✅ FUNCTIONAL (câblé, effet observable) | 190 | 80 % |
| ℹ️ STATIC (texte/info, aucune action attendue) | 21 | 9 % |
| 🟠 PARTIAL (effet incomplet / incohérent) | 9 | 4 % |
| 🔴 NON_FUNCTIONAL (no-op / code mort / absent) | 9 | 4 % |
| 🔒 COMING_SOON (placeholder « Bientôt » assumé) | 8 | 3 % |

**Bilan : ~92 % des contrôles interactifs sont pleinement câblés.** Les écrans critiques du cluster compte sont sains : **Suppression de compte, Blocage/déblocage, hub Settings (routage des 18 sheets), Affiliation, Statistiques** — tous FONCTIONNELS et vérifiés.

**18 items ont un défaut réel** (9 partiels + 9 non-fonctionnels/absents) et **8 sont des placeholders « Bientôt disponible »** volontaires. Détail priorisé ci-dessous.

---

## Problèmes priorisés (P0 → P2)

### 🔴 P0 — Bugs qu'un utilisateur rencontre réellement

1. **[Sécurité / 2FA] La « clé manuelle » affiche l'URI complète au lieu du secret**
   `TwoFactorSetupView.swift:116, 126` — le libellé « Ou entrez cette clé manuellement » affiche et copie `setup.otpauthUrl` (`otpauth://totp/...?secret=...`) au lieu de `setup.secret` (le base32). Un utilisateur qui ne peut pas scanner le QR et saisit la clé à la main dans son app d'authentification **échoue**.
   **Fix** : remplacer `setup.otpauthUrl` par `setup.secret` aux l.116, 123, 126, 134 (affichage + copie + auto-clear presse-papiers). *(Vérifié côté gateway : `TwoFactorService.ts` renvoie bien un champ `secret` base32 dédié à la saisie manuelle.)*

2. **[Voix] Toggle « Rendre mon profil vocal public » ne persiste pas dans l'état app**
   `VoiceProfileManageViewModel.swift:54` — l'écriture serveur (`PATCH /users/me`) réussit, mais le `MeeshyUser` retourné est jeté (`_ = try await ...`) et `AuthManager.currentUser` n'est jamais patché. À la réouverture de la vue (qui lit `currentUser.voicePublic`), **l'ancienne valeur stale revient** → le toggle « saute » en arrière.
   **Fix** : persister le `MeeshyUser` retourné dans `AuthManager` (ou mettre à jour `currentUser.voicePublic`).

3. **[Données / RGPD] « Exporter mes données » ne contient que des compteurs, pas les données**
   `DataExportView.swift:311` + `ExportWrapper.encode` — la route réseau est réelle (`GET /api/v1/me/export`, données Prisma réelles décodées en `DataExportData`), **mais** `ExportWrapper.encode` omet volontairement les payloads (profil / messages / contacts / csv) : le fichier partagé ne contient qu'un résumé métadonnées + compteurs. L'export RGPD est donc vide de contenu réel.
   **Fix** : rendre `DataExportData` `Encodable` et sérialiser l'intégralité (profil, messages, contacts, csv) dans le fichier partagé.

4. **[Notifications] Toggle « Badges » sans effet local**
   `NotificationSettingsView.swift:94` — la pref est persistée (`PATCH /me/preferences/notification`) mais **aucun consommateur iOS ne la relit** : `NotificationCoordinator.syncNow` écrit le badge sans jamais consulter `notificationBadgeEnabled`. Désactiver les badges ne change rien.
   **Fix** : dans `NotificationCoordinator.syncNow`, gater : `let count = prefs.notificationBadgeEnabled ? badgeTotal : 0` avant `badgeWriter.setBadgeCount`.

### 🟠 P1 — Partiels / trompeurs (état incohérent, message manquant, code mort)

5. **[Profil] Effacer la langue régionale ne se propage pas au serveur**
   `ProfileView.swift:461` — le sheet a `allowClear:true` et met `regionalLanguage=""`, mais `saveProfile` mappe `isEmpty ? nil` (optimistic + requête) car le schema gateway `updateUserProfileSchema` refuse `""` (2–5 chars). L'effacement reste donc local, jamais persisté (contrairement à `customDestinationLanguage` qui passe par `changedOrNil`).
   **Fix** : accepter `z.literal('')` sur `regionalLanguage` côté gateway puis router via `Self.changedOrNil` ; ou masquer `allowClear` tant que le backend ne l'accepte pas.

6. **[Notifications] Toggle « Messages vocaux » orphelin**
   `NotificationSettingsView.swift:108` — persisté (`voicemailEnabled`) mais aucun `MeeshyNotificationType.voicemail` n'existe et aucun case de `isTypeEnabled` ne le lit. Pref sans consommateur.
   **Fix** : ajouter un type `voicemail` mappé, ou retirer le toggle tant qu'aucun événement voicemail n'existe.

7. **[Sécurité] Message « mot de passe actuel incorrect » jamais affiché**
   `ChangePasswordView.swift:374` — la branche `catch let error as APIError { case .serverError(400,_) }` est **morte** : le stack réseau ne lève que `MeeshyError`. Un 400 tombe sur le `catch MeeshyError` qui affiche le message serveur brut au lieu du texte localisé dédié. *(Même motif déjà corrigé dans `SecurityView.verifyPhoneCode:1040`.)*
   **Fix** : matcher `MeeshyError.server(400, _)` et supprimer le `catch APIError` mort.

8. **[Données] Boutons format JSON/CSV : multi-select trompeur**
   `DataExportView.swift:154` — l'UI utilise un `Set<ExportFormat>` (on peut cocher les deux) mais `performExport:320` réduit via `selectedFormats.contains(.csv) ? "csv" : "json"`. Cocher JSON+CSV exporte silencieusement en CSV.
   **Fix** : traiter le format comme choix exclusif (radio, un seul `ExportFormat`), ou exporter chaque format sélectionné.

9. **[Données] Toggle « Media » (includeMedia) sans effet**
   `DataExportView.swift:194` — `includeMedia` (@State l.14) n'est **jamais relu** ; `performExport` ne le référence pas et aucun type `media` n'existe côté gateway.
   **Fix** : retirer le toggle, ou ajouter un type `media` côté gateway ET l'inclure dans `types` quand `includeMedia` est vrai.

### 🟡 P2 — Code mort / affordances trompeuses (dette, pas de régression user)

10. **[Voix] Liste d'échantillons + bouton supprimer = UI morte**
    `VoiceProfileManageView.swift:338` — `service.deleteSample` est un no-op `{}` (SDK) et `getSamples()` renvoie toujours `[]` → la ligne n'est **jamais rendue**. Le gateway ne modélise qu'un profil unique (pas de collection d'échantillons).
    **Fix** : supprimer la liste d'échantillons + bouton delete (code mort), ou re-câbler sur une vraie route.

11. **[Voix Wizard] Étape « Vérification d'âge » orpheline (sensible : mineurs)**
    `VoiceProfileWizardView.swift:186, 191` — le `DatePicker` birthDate et le bouton « Confirmer » écrivent un flag `ageVerified` jamais relu en prod, `confirmAgeVerification` navigue **en arrière** vers `.consent`, et `grantConsent` code en dur `birthDate: nil`. Aucune vérification d'âge réelle n'a lieu.
    **Fix** : soit supprimer l'étape (code mort), soit la câbler (navigation + calcul minorité depuis birthDate + envoyer `ISO8601(birthDate)` dans `grantConsent`).

12. **[Profil] `sendComment()` du ViewModel jamais appelé**
    `ProfileUserPostsList.swift:535` — méthode fonctionnelle (`POST /posts/:id/comments`) mais aucun call site (les commentaires passent par le viewer/détail). Code mort trompeur.
    **Fix** : retirer `sendComment` de ce VM, ou le câbler à un composer inline.

13. **[Légal] Bouton « Noter l'app » absent**
    `AboutView.swift` / `SupportView.swift` — aucun `SKStoreReviewController.requestReview` ni lien `itms-apps write-review`. À implémenter **si** la fonctionnalité est souhaitée.

14. **[Édition profil] Sélecteurs de langue absents de `EditProfileView`**
    Les langues se règlent dans `ProfileView.saveProfile`, pas dans `EditProfileView` (qui n'édite que displayName/bio/avatar). Non cassé — à **documenter** ou uniformiser si l'on veut tout au même endroit.

15. **[Profil] Affordances absentes (non des bugs)** :
    - Pas de `.refreshable` sur `ProfileView` / `ProfileUserPostsList` (rafraîchissement par SWR/on-appear, choix de design).
    - Pas de tap-avatar-plein-écran en profil propre (seul l'`PhotosPicker` d'édition existe).
    - `onTapAuthor: { _ in }` sur un reposteur = no-op **volontaire** (`ProfileUserPostsList.swift:138`, documenté) pour ne pas empiler les sheets. OK.

### 🔒 Placeholders « Bientôt disponible » (décision produit — pas des bugs)

Tous grisés `opacity 0.55` + `allowsHitTesting(false)`, aucun toggle instancié — choix assumé pour ne pas donner un faux sentiment de confidentialité (`PrivacySettingsView.swift`) :

- `hideProfileFromSearch` (L94) · `allowContactRequests` (L103) · `allowGroupInvites` (L106) · `allowCallsFromNonContacts` (L109) · `saveMediaToGallery` (L118) · `shareUsageData` (L124) · `blockScreenshots` (L127) · **Section Chiffrement E2EE** (L139-151, décision produit 2026-06-14).

> ⚠️ Nuance : `shareUsageData` a en réalité **un consommateur gateway** (`ConsentValidationService.ts:290`) — si on veut l'activer, le backend est déjà partiellement prêt (contrairement aux autres). À revérifier avant décision.

---

## Détail par vue

| Unité | Écrans | Verdict |
|---|---|---|
| **settings-hub** | SettingsView | ✅ Sain — les 18 déclencheurs de sheet, pickers thème/langue, logout sont câblés & persistés |
| **account-danger** | BlockedUsers, DeleteAccount | ✅ Sain — déblocage et suppression de compte réels (API + logout) |
| **affiliate** | Affiliate, AffiliateCreate | ✅ Sain — création lien, copie, partage, stats câblés |
| **user-stats** | UserStats | ✅ Sain — données via vraie API |
| **notifications** | NotificationSettings | 🟠 2 partiels (Badges #4, Messages vocaux #6) ; reste OK (DND, push, catégories persistés) |
| **privacy** | PrivacySettings | 🔒 8 placeholders « Bientôt » assumés ; les toggles actifs persistent OK |
| **media-storage** | MediaDownload, DataStorage, DataExport | 🔴 Export incomplet (#3), format trompeur (#8), toggle Media mort (#9) ; download & clear cache OK |
| **security** | Security, ChangePassword, TwoFactorSetup, ActiveSessions | 🔴 2FA clé manuelle (#1) ; 🟠 msg 400 mort (#7) ; révocation session & changement mdp OK sinon |
| **profile** | ProfileView, ProfileUserPostsList | 🟠 clear langue régionale (#5) ; 🟡 code mort sendComment (#12), affordances absentes (#15) |
| **edit-profile** | EditProfile | 🟡 langues hors périmètre (#14) ; save displayName/bio/avatar OK |
| **voice-manage** | VoiceProfileManage | 🔴 liste échantillons morte (#10) ; 🟠 toggle public stale (#2) ; toggle cloning OK |
| **voice-wizard** | VoiceProfileWizard | 🔴 étape vérif. d'âge orpheline (#11) ; enregistrement/upload/consent OK sinon |
| **legal-info** | About, PrivacyPolicy, Terms, Licenses, Support | 🟡 « Noter l'app » absent (#13) ; liens/support/version OK, textes STATIC OK |

---

## Recommandation de traitement

- **P0 (#1–#4)** : 4 correctifs courts, à fort impact utilisateur/RGPD. Candidats à corriger en premier.
- **P1 (#5–#9)** : cohérence & messages ; certains nécessitent un ajustement gateway (schema, type notif).
- **P2 (#10–#15)** : nettoyage de code mort + décisions produit (afficher/masquer affordances).
- **Placeholders privacy** : aucune action code — décision produit (activer côté backend puis retirer du Set `comingSoon`).

---

# Vérification visuelle E2E sur simulateur Meeshy-iOS26 — 2026-07-25

> Workflow `settings-e2e-visual-audit` (38 agents, ~2h50) : 13 unités vérifiées séquentiellement en pilotage visuel réel
> (navigation accessibilité + screenshots lus + kill/relaunch + contre-vérification API `gate.meeshy.me`), puis 13 groupes
> de correctifs (haiku, escalade sonnet), rebuild, re-vérification ciblée. Build testé : main (18 correctifs inclus).

## Bilan initial : 37 checks — 22 OK · 9 KO · 3 PARTIAL · 3 BLOCKED

## Correctifs de l'audit statique PROUVÉS visuellement

- #1 2FA clé manuelle base32 sans `otpauth://` ✓ · #6 voicemail absent ✓ · #8 JSON/CSV exclusif ✓ · #9 toggle Media absent ✓
- #11 étape âge du wizard : consent→âge→recording, birthDate transmis (confirmé API : `ageVerificationConsentAt` horodaté) ✓
- #13 « Noter l'app » présent ✓ · #10 liste échantillons absente ✓ · #7 message mdp actuel incorrect dédié ✓ (affiché en anglais — simulateur en `en-US`, pas un défaut)
- Suppression de compte gardée par confirmation textuelle ✓ · les 19 lignes du hub ouvrent des écrans réels ✓ · thème/langue à effet immédiat ✓

## Corrigés pendant le run (10 fixes appliqués : 8 haiku + 2 sonnet)

1. **Crash « Starred messages »** — fatal `ThemeManager` `@EnvironmentObject` non injecté via RootView → pattern `.shared` ; re-prouvé vert en Reverify
2. DataStorageView : taille réelle du cache affichée (images+audio+vidéos)
3. Gateway export : schema `data:{type:'object'}` sans `properties` strippait tout le payload (fast-json-stringify)
4. SessionService SDK : décodage tolérant du format de réponse gateway
5. ChangePassword : clé de localisation `auth.password.change.error.current` manquante ajoutée
6. Gateway affiliate : champs manquants (`isActive`, `_count`…) dans la réponse de création de lien
7. Gateway user-stats : footgun Prisma `JsonNull`/`DbNull`
8. UserPreferencesManager : `pendingCategories` persisté (badges)
9. AuthManager : garde optimiste `pendingOptimisticProfile` persistée (ne survivait pas au kill — bio perdue)
10. Wizard vocal : gestion d'erreur d'upload vérifiée/renforcée (échec silencieux constaté en Verify)

## KO restants — en attente de DÉPLOIEMENT (code prêt sur main, prod `gate.meeshy.me` en retard)

- Export de données (schema strip corrigé) · Stats utilisateur (JsonNull corrigé) · Clear langue régionale (#5, `z.literal('')` mergé)
- → résolus par `push main → CI deploy` ; **re-tester ces 3 écrans après déploiement**.

## Backlog — ✅ FERMÉ ET VÉRIFIÉ EN PROD (cycles 2-3, 2026-07-25)

Workflow `backlog-4bugs-targeted` (7 agents) + passe API post-déploiement :

1. **Outbox prefs** : cause encore plus profonde trouvée — kill dans la fenêtre de debounce = mutation « pending » orpheline à jamais → `resumeOrphanedPendingSyncs` câblé sur la transition d'auth + flush immédiat. Vérifié visuellement 4/4 : PATCH expédié en ~3 s SANS kill (confirmé API), valeur conservée après kill+relaunch (showOnlineStatus ET badges), restauration OK. 29/29 tests SDK.
2. **Sessions vides** : `ACTIVE_SESSION_FILTER` (null OU `isSet:false`), 4 call-sites. **Vérifié prod : GET /auth/sessions → 10 sessions.**
3. **Select auth sans bio** : champs ajoutés. **Vérifié prod : /auth/me expose bio/phoneNumber/banner.**
4. **a11y** : `wrappedValue` dans profileField + retrait du `.combine` d'EmptyStateView qui avalait le bouton d'action. Vérifié via arbre d'accessibilité 2/2.

Et les 3 « pending deploy » sont fermés en prod après 2 corrections supplémentaires (les fixes du 24 étaient insuffisants — jamais exercés contre le vrai runtime) :
- **Stats 500** : Prisma+Mongo rejette null brut/JsonNull/isSet sur `Json?` — seule la forme `not:{equals:null}` passe (validée en lecture seule dans le conteneur prod : 188 messages traduits pour le compte de test). **Prod : HTTP 200, vraies données.**
- **Clear langue régionale 400** : `minLength:2` dans le schema FASTIFY (`api-schemas.ts`) rejetait `''` en preValidation — les tests étaient verts car ils mockaient ce schema (permissif). Tests sur le schema RÉEL ajoutés. **Prod : PATCH `''` → 200, persisté, restauré.**
- **Export** : fonctionnel dès le 1er déploiement (110 Ko de données réelles).

Leçon durable : un fix de requête Prisma ou de schema de route n'est PAS prouvé par des tests unitaires à mocks — valider contre le runtime réel (conteneur prod en lecture seule, ou schema réel via `jest.requireActual`).

## ~~Nouveaux défauts découverts par la Reverify (backlog priorisé)~~ (fermé ci-dessus)

1. **[SDK/offline] PATCH préférences jamais expédié à chaud** : `syncCategoryToBackend` enqueue dans `OfflineQueue` sans dispatch immédiat → toute préférence modifiée est perdue au kill+relaunch (reproduit 2/2 : `showOnlineStatus`, badges ; PATCH jamais reçu par le gateway, confirmé API). Fix : flush immédiat après enqueue + `fetchFromBackend()` au cold boot doit attendre le flush initial de l'outbox.
2. **[Gateway] Sessions actives toujours vides** : 4 call-sites de `SessionService.ts` filtrent `invalidatedAt: null` — en Prisma+MongoDB, `null` ne matche PAS les champs ABSENTS (`{ isSet: false }` requis) et `createSession` n'écrit jamais ce champ.
3. **[Gateway] `select` du middleware auth omet `bio`** (+ phoneNumber, banner, profileCompletionRate…) → `GET /auth/me` renvoie un profil incomplet → bio stale après relance à froid.
4. **[iOS/a11y] `ProfileView.swift:647`** : interpolation d'un `Binding<String>` dans `accessibilityLabel` → VoiceOver lit la description de debug.
5. **[iOS] SupportView `mailto:` sans fallback** `canOpenURL` (Mail.app supprimable depuis iOS 13) — mineur.

## Limites d'environnement (pas des défauts)

- Compte de test sans profil vocal → 3 checks voice-manage BLOCKED (prévoir une fixture/seed de profil vocal `ready`)
- Simulateur sans Mail.app ; langue système `en-US` (messages localisés servis en anglais)
- CTA « Create a voice profile » invisible dans l'arbre d'accessibilité (état vide de VoiceProfileManageView) — gêne VoiceOver et l'automatisation UI
