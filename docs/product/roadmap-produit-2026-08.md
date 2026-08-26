# Meeshy — analyse à 360° et roadmap produit

> Rédigé le 2026-08-26 sur `main` = `65c61e469f`. Chaque constat cite sa preuve (fichier:ligne, mesure, run CI). Les zones marquées **à vérifier** n'ont pas pu être mesurées dans cette passe (limite de session sur les agents d'analyse — à compléter après 13 h 30).
> Pilotage : milestones et issues GitHub (`isopen-io/meeshy`, projet « Meeshy — pilotage »). Les noms de phases et de jalons ci-dessous sont sémantiques ; les codes internes des trackers ne servent qu'en référence.

---

## 0. Lecture en une page

**Où en est Meeshy.** Un produit iOS très riche (1,48 M lignes d'app + 0,76 M de SDK, 1 589 fichiers de tests) qui part en App Store en 1.0.6 ; un web en production (v1.32.1) dont le temps réel est jugé « trop bogué » par le porteur (2 correctifs sur 7 livrés) ; un Android à 0.1.0 jamais publié mais déjà large (217 k lignes, 11 modules, 591 tests) ; un backend de 482 routes qui porte tout — messagerie, Prisme linguistique, voix clonée, stories/composer, feed/réels, communautés, appels, présence, liens tracés, agent LLM, 108 routes d'administration.

**Ce que l'analyse révèle.** Quatre écarts entre ce qui est **promis** et ce qui est **vrai** :
1. **Sécurité** — deux failles critiques (JWT irrévocable + refresh sans borne ; limitation de débit sur une seule IP derrière Traefik), des secrets dans la doc versionnée, des IDOR sur les pièces jointes.
2. **Confidentialité** — « chiffré de bout en bout, personne même pas nous » est écrit dans la politique alors qu'iOS n'a jamais chiffré un message, que le serveur stocke des clés privées et accepte du clair en mode e2ee ; effacement RGPD = soft-delete ; aucun âge minimum pour une cible 16-25.
3. **Langues** — la fiche dit « 80+ langues » ; 63 ont un modèle ; **25 langues proposées aux clients rendent du français en silence**. Latence mesurée en prod ~30 s / 500 caractères par langue, GPU jamais utilisé, aucune mesure de qualité.
4. **Croissance** — l'outillage existe (liens tracés, affiliation, digest, share links) mais aucune boucle n'est fermée : l'attribution iOS n'appelle jamais le serveur, l'e-mail d'invitation pointe vers une page 404, les posts partagés n'ont pas d'aperçu, aucun feed public, zéro capture App Store, zéro monétisation.

**La thèse de la roadmap : tenir debout et dire vrai avant de grandir.** Quatre horizons, chacun nommé par ce qu'il rend vrai :

| Horizon | Nom | Ce qui devient vrai | Fin visée |
|---|---|---|---|
| 1 | **Fiable et honnête** | L'app ne ment plus (E2E, langues, RGPD), ne fuit plus (sessions, débit, fichiers), et ses trois canaux de base marchent (temps réel web, appels, publication) | fin oct. 2026 |
| 2 | **Trois plateformes, une expérience** | Android en beta Play, composer v2 partout, iPad, web en 7 langues et partageable, traduction rapide et mesurée | fin janv. 2027 |
| 3 | **Une croissance qui se mesure** | Activation/rétention instrumentées, onboarding court, parrainage attribué, boucles virales, campagne fandom | fin avr. 2027 |
| 4 | **Confiance vérifiable et premier revenu** | E2EE réel (libsignal), Meeshy+ freemium, modération automatique, appels de groupe traduits | fin août 2027 |

---

## 1. Méthode et limites

- **Sources** : lecture du dépôt par 5 rapports d'agents (traduction texte, voix/TTS/clonage, croissance, sécurité gateway, chiffrement & conformité), 24 mesures directes (LOC, fichiers de tests, 300 derniers runs CI, marqueurs de dette, locales, Android), l'étude marketing existante (`docs/marketing/app-store-fiche-2026-08.md`), la planche P0 du composer (rév. 25), les plans du 25/08 (proximité, temps réel web, E2EE état de l'art) et la mémoire de projet.
- **Non mesuré dans cette passe (à vérifier)** : matrice de parité feature × plateforme exhaustive ; alerting et restauration de sauvegarde réellement jouée ; audit UX écran par écran ; coût mensuel d'infrastructure.
- **Mesuré sur l'ops** : Sentry référencé (43 fichiers gateway/web/iOS) et Crashlytics embarqué ; métriques Prometheus dans 4 fichiers seulement ; `logError(fastify.log)` muet sur 166 sites ; scripts de sauvegarde présents (`scripts/backup-mongodb.sh`, `backup-users-json.ts`), restauration non prouvée ; **aucun adapter Socket.IO Redis, aucun cluster** (gateway monoprocess) ; **aucun stockage objet** (médias sur volume local) ; 85 modèles Prisma, 369 handlers de route (482 déclarations avec les alias).
- **Ce que la roadmap n'est pas** : un plan d'exécution. Chaque jalon deviendra un milestone GitHub avec ses issues ; les plans détaillés existants (`docs/superpowers/plans/`) restent la maille d'exécution.

---

## 2. L'analyse à 360°

### 2.1 Produit et plateformes

| Constat | Preuve | Gravité |
|---|---|---|
| iOS est le produit de référence ; 1.0.6 (build 1800) est uploadé, non soumis | ASC PREPARE_FOR_SUBMISSION ; `apps/ios/fastlane/metadata/` 7 locales | — |
| Le temps réel web est cassé pour l'utilisateur (message qui n'arrive pas ; recharger sert l'état d'avant) | directive porteur 2026-08-25 ; plan `docs/superpowers/plans/2026-08-25-cache-temps-reel-web.md` — chaîne B corrigée (`390dbb953f`, `85e1c2ac2e`), chaîne A et consolidation (tâches 3-7) ouvertes | **Haute** |
| Android n'est pas publié : `versionName 0.1.0`, `versionCode 1`, aucun fastlane/Play, 0 test instrumenté | `apps/android/app/build.gradle.kts:17-18` ; `find apps/android -iname '*fastlane*'` → 0 | Haute (stratégique) |
| Android ne lit ni n'émet les scènes v3 : tout le parc verra une sentinelle sur une story v3 | `tasks/todo-c4-canvas-caps…md:70` ; état des lieux composer § Lot H | Haute |
| Le composer v2 iOS n'est pas encore le chemin de publication du fil (3 sites `FeedComposerSheet`, langue `fr` en dur, outils `effect:nil`) | `tasks/composer-v2-etat-des-lieux-2026-08-26.md` § P2 (12 tâches) | Moyenne |
| Publication depuis une pièce jointe : le serveur accepte un média protégé, publie en PUBLIC et en silence | idem § P1 (`POST /posts/from-attachment`) | **Haute** (confidentialité) |
| Appels : les trois paires ne sont pas validées de bout en bout ; cycle de vie avec zombies possibles ; instrumentation encore en prod | `tasks/calls-fonctionnel-todo.md` phases 1-4 | Haute |
| « À proximité » : 1 tâche sur 11 du plan de maturation livrée (le crash) ; permission, hors-ligne, états vides restent | `docs/superpowers/plans/2026-08-25-proximite-maturation.md` tâches 2-11 | Moyenne |
| L'app iOS est verrouillée en portrait sans que personne l'ait voulu ; overlays iPad dans le repère de la colonne | `OrientationManager.unlock()` : 0 appelant (mesuré) ; spec parité iPad | Moyenne |
| Un agent LLM (`services/agent`, 16 k lignes) existe avec 36 routes d'administration — désactivé en produit, doc de bugs consolidés | `parts/_routes.txt` (`admin/agent*.ts`) ; `docs/agent-bugs-consolidated.md` | À décider |

### 2.2 Prisme linguistique, traduction et voix (rapports translator)

| Constat | Preuve | Gravité |
|---|---|---|
| **Quatre listes de langues divergentes** : 63 mappées NLLB (seules traduisibles), 40 en env (morte), 77 « capacités », 83 offertes aux clients | `services/translator/src/config/settings.py:231-304`, `:115` ; `language_capabilities.py:59` ; `packages/shared/utils/languages.ts:88-1494` | **Critique** (produit) |
| **25 langues offertes n'ont aucun modèle et rendent du français en silence** (`lang_codes.get(target, 'fra_Latn')`) : ak az bas bm byv ca dua et ewo fan ka kk km ksf lo lv my ne nnh sk sl sr ta tl uz — dont 7 langues africaines mises en avant par le marketing | `translator_engine.py:402`, `:495` | **Critique** |
| Latence : README « < 200 ms » ; commentaire de prod « ~30 s / 500 chars par langue » ; budget jusqu'à 360 s | `README.md:461` vs `translation_processor.py:30-46` | Haute |
| Multi-langues **séquentiel** (jamais un forward-pass pour N cibles) ; TODO ouvert | `translation_processor.py:72-77` ; `zmq_translation_handler.py:196-219` | Haute |
| **GPU/MPS jamais utilisés** : `device == 'cuda'` comparé à `"cuda:0"` ; `device` figé à l'init | `translator_engine.py:283` ; `model_loader.py:60,107,163-196` | Haute |
| Scaling dynamique inopérant (`_scale_to` = `pass`) ; défauts de workers contradictoires (20/10 vs 3/2 vs CPU/2) | `worker_pool.py:196-204` ; `main.py:171`, `zmq_server_core.py:50` | Moyenne |
| **Aucune évaluation de qualité** (ni BLEU/chrF/COMET, ni jeu doré) ; tests ML entièrement mockés ; 30 scripts réels hors CI | grep sur `services/` ; `pytest.ini` | Haute |
| Les textes de repli (`[ML-Batch-Error] …`, `[EN] …`, `[ERROR: …]`) sont publiés **comme des traductions** et peuvent être mis en cache | `translator_engine.py:440,577` ; `translation_processor.py:365-409` | Haute |
| Cache Redis 30 j sans aucune métrique de hit ; TTL contradictoire (3600 dans settings) | `redis_service.py:352`, `:470-476` ; `settings.py:82` | Basse |
| Whisper `large-v3` int8 CPU en prod (le `distil-large-v3` des settings est mort) ; diarisation ON par défaut ; pas de plafond de durée audio | `transcription_service.py:123-135` ; Dockerfiles `ENABLE_DIARIZATION=true` | Moyenne (coût) |
| TTS généré pour **toutes** les langues cibles de la conversation ; la politique on-demand est câblée mais inopérante | `audio_message_pipeline.py:488-505` | Moyenne (coût) |
| Clonage : Chatterbox 23 langues (clonage natif), MMS 18 langues africaines sans clonage, VITS lingala ; 17 langues sans voix avec repli linguistique | `language_router.py:38-89` | — (à documenter) |
| Consentement voix bien porté par le gateway (hiérarchie, refus dur) ; rétention 60 j mineurs / 90 j ; pas de routine d'effacement RGPD dédiée côté translator | `ConsentValidationService.ts` ; `VoiceProfileService.ts:52-54` | Basse |
| Le Prisme est résolu par **4 familles × 3 clients + serveur** (aperçu, audio, posts, bannières) — une règle à tenir sur 10 sites | `CLAUDE.md` § Prisme | Dette structurelle |

### 2.3 Sécurité (rapport gateway, 12 constats)

| # | Gravité | Faiblesse | Preuve |
|---|---|---|---|
| 1 | **Critique** | JWT irrévocable (logout/reset/ban ne coupent pas REST pendant 24 h) ; `/auth/refresh` échange un JWT expiré **sans borne ni session** | `routes/auth/magic-link.ts:157,205-241` ; `middleware/auth.ts:164-370` |
| 2 | **Critique** | Rate limiting clé `request.ip` **sans `trustProxy`** derrière Traefik ⇒ un seul seau pour toute la plateforme (300/min ; 3 inscriptions / 5 min pour tous ; login bloqué par préfixe de 3 lettres) ; middleware Traefik `rate-limit` non attaché | `middleware/rate-limiter.ts:61-98` ; `docker-compose.prod.yml:327` |
| 3 | Haute | Secrets de prod dans la doc versionnée ; `JWT_SECRET` par défaut accepté en prod (7 sites) ; comptes seed `bigboss123` / `admin123` | `apps/docs/PASSWORD_RESET_GUIDE.md:181-183` ; `server.ts:84` ; `InitService.ts:132,204,347` |
| 4 | Haute | IDOR par `attachmentId` : lecture de transcriptions d'autrui, écriture de traductions, coût Whisper/TTS déclenchable | `attachments/metadata.ts:83-98` ; `attachments/translation.ts:341-372` ; `voice/translation.ts:179-370` |
| 5 | Haute | Socket authentifié une fois, sans re-vérification `exp` ni `isActive` : un compte banni garde le temps réel | `AuthHandler.ts:187-198` |
| 6 | Haute | Le magic link contourne le 2FA ; le 2FA n'existe pas sur iOS | `MagicLinkService.ts:312-321` ; grep iOS = 0 |
| 7 | Moyenne | `GET /attachments/file/*` public, sans appartenance ni expiration ; SVG servi inline (XSS stocké sur `gate.meeshy.me`) | `download.ts:311-379,403,488` |
| 8 | Moyenne | MIME déclaré par le client, extension libre, magic-bytes réservés aux anonymes, pas d'antivirus, EXIF/GPS conservés | `upload.ts:128` ; `tus-handler.ts:237,271-274` |
| 9 | Moyenne | Web sans en-têtes de sécurité (`next.config.security.js` jamais importé) ; jetons en `localStorage` + cookie non httpOnly | `next.config.ts` ; `auth-manager.service.ts:89,285` |
| 10 | Moyenne | Énumération (`check-availability`, `/users/email/:email`, `/users/phone/:phone` publics) ; aucun lockout (`failedLoginAttempts` jamais écrit) | `register.ts:242-300` ; `profile.ts:1097,1201` |
| 11 | Moyenne | Mot de passe : 6 caractères ; `zxcvbn` seulement au reset ; bcrypt 10 côté admin | `validation.ts:48` ; `user-management.service.ts:162` |
| 12 | Basse | Trivy sans `exit-code` (jamais bloquant), ni CodeQL ni gitleaks ; CORS prod retombe sur `localhost` ; `turnserver.conf` absent du dépôt | `ci.yml:974-988` ; `server.ts:376-380` |

Points forts à préserver : garde comportementale `route-auth-coverage.test.ts` (liste de trous vide), jetons de reset/magic-link hachés à usage unique, TURN HMAC éphémère avec refus de secret faible, contrôle d'appartenance systématique sur conversations/messages/posts.

### 2.4 Chiffrement, confidentialité, conformité

| Constat | Preuve | Gravité |
|---|---|---|
| **La politique promet « bout en bout, personne même pas nous »** ; le statut interne dit « NOT fully functional » ; les 7 phases Signal sont ⏳ | `apps/web/locales/fr/privacy.json:115` ; `docs/ENCRYPTION_IMPLEMENTATION_STATUS.md:1-12` ; `docs/SIGNAL_PROTOCOL_ROADMAP.md` | **Critique** (juridique/confiance) |
| Le serveur **stocke les clés privées** Signal ; iOS n'a **jamais chiffré** un message (`isEncrypted: false` aux 3 sites d'envoi) ; le gateway accepte et stocke le clair en mode `e2ee` ; le web chiffre en ECDH+AES maison sans ratchet | `schema.prisma:2495-2523` ; `ConversationViewModel.swift:2570,2717,3218` ; `MessageProcessor.ts:197-205,412` ; `e2ee-crypto.ts:5-10` | **Critique** |
| Le Prisme est structurellement incompatible avec un E2E réel (le translator lit le clair) ; le corps des notifications part en clair vers APNs/FCM | `EncryptionHelper.ts:25-60` ; `PushNotificationService.ts:517-556` | À arbitrer |
| **MongoDB de prod sans authentification** (`--noauth`), UIs Mongo et Redis publiées derrière Traefik | `docker-compose.prod.yml:59,79-154` | **Critique** (ops) |
| Effacement RGPD : promesse « 30 jours puis suppression définitive » ; code = `GRACE_PERIOD_DAYS = 90` et **soft-delete seul** (`isActive:false`), aucune purge ni anonymisation | `privacy.json:162` ; `routes/me/delete-account.ts:15,146-153` ; grep `prisma.user.delete(` = 0 | **Haute** |
| Export de données partiel (10 000 messages ; ni posts, ni médias, ni profil vocal) | `routes/me/export.ts:9-46` | Moyenne |
| **Aucun âge minimum** à l'inscription, aucune clause d'âge dans les CGU, aucun réglage protecteur par défaut — pour une cible affichée 16-25 | grep `birthDate|minAge` sur `routes/auth` = 0 ; `terms.json` | **Haute** |
| L'acceptation des CGU (case iOS) n'est ni transmise ni persistée | `OnboardingStepViews.swift:1308-1330` ; gateway grep = 0 | Moyenne |
| Modération : signalement + blocage OK ; **aucun filtre automatique** (NSFW/CSAM), pas de retour au signalant (DSA art. 16), pas de bannissement durable ni journal d'audit | `schema.prisma:1879-1922` ; grep `nsfw|csam|photodna` = 0 | Haute (UGC + mineurs) |
| Mentions légales absentes (LCEN) ; hébergement « France/UE » écrit vs scripts de déploiement `nyc1` ; sous-traitants non listés (APNs/FCM, Brevo, Firebase Analytics, HuggingFace) | `locales/fr/*.json` ; `deploy-droplet-manager.sh:20` | Moyenne |
| Découvrabilité géographique : `EXACT` est un niveau public valide | `geoDiscoverability.ts:16` | Moyenne (mineurs) |

### 2.5 Croissance, acquisition, rétention (rapport growth)

| Constat | Preuve | Gravité |
|---|---|---|
| Onboarding iOS = wizard de **8 étapes** (prénom + nom obligatoires, e-mail vérifié serveur, mot de passe, langue, profil, récap) + carrousel de 5 pages | `RegistrationViewModel.swift:8-17,489-505` | Haute (activation) |
| Import de contacts existe mais **hors onboarding** ; aucune suggestion d'amis ; `profileCompletionRate` jamais calculé (0 pour tous) | `ContactSyncService.swift:83` ; `force-migration.ts:40-47` | Haute |
| Pas d'OAuth Apple/Google | grep = 0 hit fonctionnel | Moyenne |
| **Affiliation : le web attribue, iOS jamais** (`/affiliate/register` non appelé) ; pas de code de parrainage au niveau utilisateur | `AffiliateService.swift` ; schéma grep `referralCode` = 0 | Haute |
| L'e-mail d'invitation renvoie vers `meeshy.me/download` qui **n'existe pas** ; aucune attribution | `invitations.ts:55` | Haute |
| Liens tracés (`TrackingLink`, 6 caractères, UTM, 30 dimensions par clic) et liens de conversation anonymes : complets | `schema.prisma:1730-1813`, `:543-578` | Point fort |
| Universal Links / App Links opérationnels ; OG dynamique sur profil et lien de chat ; **aucun OG sur `/post/*`** — un post partagé n'a pas d'aperçu | AASA ; `apps/web/app/post/layout.tsx` | Haute |
| Aucun feed ni post consultable déconnecté (401 partout) ; pas de `/@username` ; ni `sitemap` ni `robots` ; `next-intl` désactivé (pas de `hreflang`) ; web en 4 locales vs 7 iOS | `posts/feed.ts:21-28` ; `next.config.ts:6` ; `apps/web/locales/` | Haute (SEO/acquisition) |
| Ré-engagement : un seul job (digest e-mail 18 h UTC) ; gamification déclarée (4 types) **sans producteur** ; pas de relance d'inactivité | `jobs/notification-digest.ts` ; `notification.ts:154-157` | Moyenne |
| Partage direct vers Instagram/TikTok/WhatsApp/Snapchat absent ; QR de profil absent ; watermark d'export story présent | grep = 0 ; `StoryExportWatermark.swift` | Moyenne |
| Captures et App Preview **absentes** (`fastlane/screenshots/` vide) ; aucune fiche Play | mesuré | Haute (lancement) |
| `apps/docs` = 123 fichiers Markdown bruts, non publiés | mesuré | Basse |

### 2.6 Monétisation et coûts

- **Aucun code de monétisation** : pas de StoreKit (hors une vue de support), pas de Stripe, pas de Play Billing, aucun modèle plan/abonnement/quota/crédit dans le schéma (mesuré).
- **Coûts variables identifiés** : traduction CPU (GPU inutilisé), TTS pour toutes les langues de chaque conversation, Whisper large-v3 + diarisation par défaut, stockage média local sur volume (`gateway_uploads`) servi par nginx, TURN relais, e-mails.
- **Où un freemium s'accroche naturellement** : nombre de langues de voix clonée, minutes de TTS, taille des communautés, export sans watermark, appels de groupe, statistiques de liens tracés (déjà riches).

### 2.7 Qualité, CI, dette, process

| Mesure | Valeur | Lecture |
|---|---|---|
| Lignes de code (source) | web 504 k · iOS 1 482 k · SDK 760 k · Android 217 k · gateway 627 k · shared 309 k · translator (hors modèles) — | Base de code très large pour l'équipe |
| Fichiers de tests | gateway 907 · web 795 · shared 110 · iOS 702 · SDK 887 · Android 591 (0 instrumenté) · translator 73 · Playwright **0** · jest-axe 5 | Volume élevé, mais E2E absent et ML mocké |
| CI (300 derniers runs, 24-26/08) | CI 79 % succès (17 annulés) · iOS 75 % (42 min) · SDK 79 % · Android 95 % · fastlane 0/1 | Instable sous charge ; « rouge » souvent = annulation ou flake |
| Vélocité | **5 060 commits / 30 j**, 11 848 / 90 j ; 2 auteurs humains + Claude | Churn extrême : la revue et la cohérence sont le goulot |
| `any` en TS (hors tests) | gateway 656 · web 827 · shared 223 | Contredit la règle « no any » du CLAUDE.md |
| `try?` Swift | app 542 · SDK 363 | Erreurs avalées (règle « réduire try? ») |
| Couleurs en dur iOS (`Color(hex:)` hors Theme) | 583 sites | Contredit la règle « accentColor partout » |
| TODO/FIXME | iOS 1 854 · SDK 356 · gateway 11 · web 12 | La dette est concentrée sur iOS |
| Journal de leçons | 293 leçons, `tasks/` 274 fichiers | Mémoire de projet riche mais peu synthétisée |
| Règles miroirs à tenir sur 3 clients | présence, Prisme (4 familles), aperçu, accent, preview de notification | Chaque évolution touche 3-10 sites |

### 2.8 UX, accessibilité, i18n

- **Langues de l'UI** : iOS 7 (ar, de, en, es, fr, it, pt-BR) · web 4 (en, es, fr, pt) · Android 4 (en, es, fr, pt). La fiche App Store promet 7 : le web et Android sont en retard de 3 langues, l'arabe (RTL) n'existe que sur iOS.
- **Accessibilité** : 117 fichiers de tests iOS touchent VoiceOver/labels ; Dynamic Type testé ; contraste du bouton d'envoi sous 3:1 sur 11/39 accents (décision ouverte) ; web : 5 fichiers jest-axe seulement.
- **Parcours** : 8 étapes d'inscription avant la première conversation ; la première traduction « vécue » (le moment de vérité du produit) n'est pas instrumentée ; `À proximité` demande la position sans dire pourquoi (tâche 4 du plan).
- **À vérifier** : audit écran par écran, performance perçue web, bande passante (le dossier `docs/bandwidth-analysis` existe).

---

## 3. La roadmap

Chaque horizon liste : **l'objectif** (ce qui devient vrai), les **jalons** (futurs milestones GitHub — noms sémantiques), les **features** et **actions** (issues), les **indicateurs** de sortie. Les jalons déjà créés le 26/08 sont notés « existant ».

### Horizon 1 — « Fiable et honnête » (septembre → fin octobre 2026)

**Objectif** : l'application ne ment plus, ne fuit plus, et ses trois canaux de base fonctionnent. Aucune croissance avant ça : chaque utilisateur acquis aujourd'hui découvrirait les défauts ci-dessus.

| Jalon | Contenu | Indicateur de sortie |
|---|---|---|
| iOS 1.0.6 — sortie App Store *(existant)* | soumission, captures 7 locales, App Preview, chaîne fastlane | 1.0.6 « Ready for Sale » ; crash-free ≥ 99,5 % (Crashlytics) |
| **Sessions et fichiers sûrs** | JWT révocable (session/`jti` vérifiée par requête, refresh borné), `trustProxy` + limiteur par utilisateur + middleware Traefik, rotation des secrets fuités + refus de boot sans secret fort, seeds via env, IDOR pièces jointes (`assertCallerCanAccess`), socket re-vérifié (`exp`, `isActive`), magic link → 2FA, URLs de fichiers signées à durée limitée, SVG en `attachment`, sniff MIME + strip EXIF | 0 critique/haute ouvert ; garde `route-auth-coverage` étendue aux IDOR |
| **Dire vrai : promesses alignées sur le code** | retirer « bout en bout » de la politique/fiche/bandeaux tant que ce n'est pas vrai ; RGPD : effacement réel (purge + anonymisation) et 30 j = 30 j ; export complet ; **âge minimum 15 ans** (France) + clause CGU + persistance de l'acceptation ; mentions légales + hébergeur réel + sous-traitants ; défaut géo = `NEIGHBORHOOD` ; claim langues = nombre réel | pages légales publiées ; test de suppression prouvant la purge ; inscription refuse < 15 ans |
| **Base de données et secrets verrouillés** | Mongo avec authentification, UIs Mongo/Redis retirées du routage public, `turnserver.conf` versionné, sauvegardes vérifiées (restauration testée) | `--noauth` absent ; restauration jouée une fois |
| **Temps réel web fiable** | plan du 25/08 tâches 3-7 (chaîne A « message qui n'arrive pas », lecture échouée ≠ « zéro message », consolidation en une source, gardes) | Playwright : envoyer/recevoir/recharger en < 1 s p95 |
| Appels audio/vidéo fonctionnels sur les trois paires *(existant)* | phases 1-4 du tracker | 3 paires validées sur device, 0 session zombie |
| Composer v2 — publication depuis une pièce jointe sécurisée *(existant — 2/3 livrées le 26/08, `60a7a6e61c`)* | garde serveur média protégé ✓, visibilité par type ✓, diffusion + mentions ✓, test de route ✓ ; reste notifications aux amis + hashtags (#3542) | test de route HTTP vert ✓ ; #3542 fermée |
| Travail existant à faire atterrir *(clos 6/6 le 26/08, `f0ad7dbe8a` beta, CI 7/7)* · CI iOS plus rapide *(existant)* | les 6 items + 10 reliquats de branches jamais mergées ont atterri (audit de 959 branches : 16 commits vivants) ; cache SPM, tests parallèles ; nettoyage de ≈ 750 branches livrées (#3728) et 179 vieilles sessions à instruire (#3729) | CI iOS < 20 min ; taux de succès CI > 90 % ; branches non mergées < 200 |
| **Voir ce qui se passe en prod** | `logError` qui écrit (166 sites), Sentry branché et vérifié (déjà référencé, à prouver par un événement reçu), Crashlytics iOS/Android, métriques translator (latence par étape, taux de hit cache, files) au-delà des 4 fichiers actuels, alerting minimal (santé, disque uploads), **restauration de sauvegarde jouée une fois** | tableau de bord de 8 métriques ; une alerte testée ; une restauration prouvée |

### Horizon 2 — « Trois plateformes, une expérience » (novembre 2026 → fin janvier 2027)

**Objectif** : la même app sur iOS, Android et web ; le Prisme tient ses promesses ; le composer v2 est le seul chemin de publication.

| Jalon | Contenu | Indicateur |
|---|---|---|
| **Android en beta fermée sur le Play Store** | scènes v3 lues et émises *(existant)* ; tests instrumentés du cœur (conversation, envoi, Prisme) ; décodeurs tolérants (`ignoreUnknownKeys`, nullables) sur tout le fil ; fastlane `supply` + fiche Play 7 langues ; Crashlytics ; Internal testing → Closed testing | 50 testeurs, crash-free ≥ 99 %, parité « cœur messagerie » |
| Composer v2 — outils, langue déclarée et bascule du fil *(existant)* puis finitions *(existant)* | 12 tâches + scène 9:16 + verrou double publication | `FeedComposerSheet` retiré ; planche P0 à 100 % |
| iPad — parité complète *(existant)* | hôte d'overlay fenêtre → orientation → surfaces → affordances | rotation + overlays corrects sur iPad |
| **Traduction : toutes les langues promises, plus vite, mesurée** | une seule liste de langues (shared = source, translator la consomme) ; les 25 langues fantômes : mappées (NLLB en a pour la plupart : `tam_Taml`, `kat_Geor`, `kaz_Cyrl`, `khm_Khmr`…) ou retirées des clients ; erreur explicite au lieu du repli `fra_Latn` ; GPU/MPS réellement utilisés ; batch multi-langues (un forward-pass pour N cibles) ; jeu doré + COMET en CI ; les textes de repli ne sont plus servis comme traductions | p95 < 3 s / langue pour 500 caractères ; 0 langue fantôme ; score COMET suivi |
| **Voix : coût maîtrisé, qualité visible** | TTS on-demand réel (politique `active`/`bounded` activée), Whisper distil ou GPU, diarisation à la demande, plafond de durée audio, langues avec/sans voix affichées à l'utilisateur | coût TTS par message actif ÷ 3 ; latence vocale p95 < 8 s |
| **Web en 7 langues, indexable et partageable** | locales de, it, ar (RTL) ; `next-intl` réactivé + `hreflang` ; `sitemap`/`robots` ; OG dynamique sur `/post/*` et `/p/*` ; page publique d'un post et d'un profil `/@username` (lecture seule) ; `/download` ; en-têtes de sécurité importés | 7 locales ; Lighthouse SEO > 90 ; aperçu riche sur WhatsApp/X |
| **Une règle, trois clients : les miroirs gardés** | tests de parité automatisés pour présence, Prisme (4 familles), aperçu, accent — golden partagé TS/Swift/Kotlin ; réduction de `any` (objectif −50 %) et de `try?` | 4 gardes de parité vertes ; `any` < 850 total |

### Horizon 3 — « Une croissance qui se mesure » (février → fin avril 2027)

**Objectif** : on sait ce que font les utilisateurs, on raccourcit le chemin vers le premier « moment de vérité » (un message compris dans une autre langue), et chaque boucle virale est fermée et attribuée.

| Jalon | Contenu | Indicateur |
|---|---|---|
| **Mesure produit : activation et rétention** | événements produit unifiés (Firebase Analytics iOS déjà embarqué → aligner web/Android, ou PostHog) : inscription, première conversation, première traduction reçue, premier vocal traduit, invitation envoyée/acceptée ; tableau D1/D7/D30 ; funnel d'onboarding | tableau de bord hebdo ; définition d'« activé » adoptée |
| **Onboarding court et amis retrouvés** | 3 étapes (pseudo, langue, contact), nom/prénom et photo différés, Sign in with Apple/Google, import de contacts dans le flux, suggestions « vous connaissez peut-être », `profileCompletionRate` calculé en direct, permission position expliquée (plan proximité tâches 4-9) | inscription → 1re conversation < 3 min ; taux d'activation +50 % |
| **Parrainage attribué et boucles virales** | attribution iOS/Android (`/affiliate/register`), code de parrainage utilisateur, `/download` intelligent, invitation e-mail attribuée, QR de profil, partage direct Instagram/TikTok/WhatsApp avec watermark, export watermarké serveur *(existant)* | K-factor mesuré ; 30 % des inscriptions attribuées |
| **Réengagement qui tient** | relance d'inactivité (J3/J7/J30) dans la langue du lecteur, streaks/badges avec un vrai producteur (ou retrait des 4 types déclarés), digest enrichi (nouveaux amis, stories manquées) | D7 +5 pts ; taux d'ouverture digest |
| **Lancement : campagne fandom et captures** | captures 7 locales + App Preview du hook vocal, landing alignée sur les claims, campagne TikTok/UGC K-pop/anime (playbook de l'étude), `apps/docs` publié ou supprimé | 1 000 installs organiques / mois |
| **« À proximité » mature** | plan de maturation tâches 2-11 (hors-ligne, états, permission), Discover staff → Discover public par communautés géolocalisées | 0 crash, 5 états tenus |

### Horizon 4 — « Confiance vérifiable et premier revenu » (mai → fin août 2027)

**Objectif** : tenir enfin la promesse de confidentialité avec une technologie éprouvée, ouvrir un revenu qui suit les coûts variables, et protéger la plateforme à l'échelle.

| Jalon | Contenu | Indicateur |
|---|---|---|
| **Chiffrement de bout en bout vérifiable (libsignal)** | plan E2EE état de l'art phases 0-4 : assainissement (retrait des clés privées serveur), gateway annuaire durci + relais opaque, iOS libsignal officiel, Android libsignal-android, web appareil lié ; **arbitrage produit** : conversations E2EE = Prisme on-device (modèle compact) ou traduction désactivée — à trancher avant la phase 2 | safety numbers vérifiables ; audit externe ; politique de confidentialité redevient vraie |
| **Meeshy+ : premier revenu** | freemium : gratuit = messagerie + traduction texte illimitée ; Meeshy+ = voix clonée dans toutes les langues, minutes TTS, communautés > N membres, export sans watermark, appels de groupe ; StoreKit 2 + Play Billing + Stripe web ; quotas côté gateway | 2 % de conversion ; revenu ≥ coût variable des payants |
| **Modération automatique et conformité DSA** | hash-matching CSAM sur uploads (PhotoDNA/Safer), NSFW sur médias publics, filtre de toxicité sur le feed public, retour au signalant, bannissement durable + journal d'audit, `abuse@` | délai de traitement < 24 h ; 100 % des signalements notifiés |
| **Appels de groupe et appels traduits** | appels de groupe iOS/web/Android ; traduction en direct des sous-titres (les briques existent : capture iOS, `call:translated-segment`) ; bannière « Reprendre l'appel » | appel à 4 stable 10 min ; sous-titres traduits < 2 s |
| **Plateforme prête pour 100 k** | le gateway est aujourd'hui **monoprocess sans adapter Redis** (mesuré) : adapter Socket.IO Redis + sticky sessions, stockage objet (S3-compatible) pour les médias (aujourd'hui volume local), translator horizontal (workers réels), test de charge mensuel | 10 k connexions simultanées en test ; p95 message < 500 ms |
| **Agent ✦ : décision** | garder (assistant de conversation multilingue, résumé vivant) ou retirer les 16 k lignes et 36 routes | décision écrite + ADR |

### Actions transversales (dès maintenant, sans jalon dédié)

1. **Définition de terminé** partout : parité 3 clients énumérée (pas « jumelles »), test de route/écran, mesure avant/après, claim marketing ≤ code.
2. **Train de release** : iOS toutes les 2 semaines (TestFlight) ; web à chaque merge vert ; Android hebdo en Internal testing dès H2.
3. **Budget de dette par cycle** : 20 % (réduction `any`/`try?`/couleurs en dur, suppression du code mort : gRPC translator, `admin/roles.ts`, dossier DMA inatteignable).
4. **Revue de sécurité trimestrielle** + CI bloquante (Trivy `exit-code`, CodeQL, gitleaks, `bun audit`).
5. **Registre des traitements et DPO** (obligation RGPD dès la collecte de données vocales/biométriques).
6. **Un seul document de vérité par règle miroir** (présence, Prisme, accent) — déjà amorcé dans `CLAUDE.md`, à porter en gardes exécutables.

---

## 4. Ce qu'on ne fera pas (et pourquoi)

- **Pas de nouvelles surfaces produit** (jeux, marketplace, paiements entre utilisateurs) avant la fin de l'horizon 2 : la surface actuelle dépasse déjà la capacité de la tenir cohérente sur trois clients.
- **Pas de campagne payante** avant la mesure produit (horizon 3) : sans activation/rétention mesurées, l'acquisition achète des désinstallations.
- **Pas d'E2EE « maison »** : le plan état de l'art impose libsignal ; toute écriture d'un AKE ou d'un ratchet maison est refusée.
- **Pas de « 200 langues »** dans aucun support tant que la liste unique n'existe pas.

## 5. Arbitrages à trancher par le porteur

| Décision | Options | Impact |
|---|---|---|
| Prisme × E2EE | (a) on-device pour les conversations E2EE ; (b) traduction coupée en E2EE (état actuel, à assumer publiquement) ; (c) E2EE réservé aux DM sans traduction | horizon 4 et discours marketing dès H1 |
| Âge minimum | 15 ans (France) vs 13 ans (COPPA) vs 16 ans | inscription H1, réglages par défaut |
| Langues fantômes | mapper (NLLB couvre ~20 des 25) vs retirer des clients | H2, claim « 80+ » |
| Runner CI auto-hébergé | machine dédiée vs runners GitHub | H1, sécurité (dépôt public) |
| Agent LLM | garder/retirer | H4 |
| Monétisation | freemium Meeshy+ vs B2B (équipes/communautés) vs les deux | H4, mais oriente l'instrumentation H3 |

## 6. Branchement sur GitHub

- Les 11 milestones du matin couvrent la majeure partie de l'horizon 1 et une part de l'horizon 2.
- **Créés le 26 août après-midi** (noms sémantiques, une échéance par horizon — 30 oct. 2026 · 30 janv. · 29 avr. · 30 août 2027 — et 108 issues) : « Sessions et fichiers sûrs », « Dire vrai : promesses alignées sur le code », « Base de données et secrets verrouillés », « Temps réel web fiable », « Voir ce qui se passe en prod », « Android en beta fermée sur le Play Store », « Traduction : toutes les langues promises, plus vite, mesurée », « Voix : coût maîtrisé, qualité visible », « Web en 7 langues, indexable et partageable », « Une règle, trois clients : les miroirs gardés », « Mesure produit : activation et rétention », « Onboarding court et amis retrouvés », « Parrainage attribué et boucles virales », « Réengagement qui tient », « Lancement : campagne fandom et captures », « À proximité mature », « Chiffrement de bout en bout vérifiable », « Meeshy+ : premier revenu », « Modération automatique et conformité DSA », « Appels de groupe et appels traduits », « Plateforme prête pour 100 k », « Agent ✦ : décision ».
- Champ « Horizon » (1-4) posé sur le projet ; reste une vue Roadmap par échéance de milestone (les vues ne se créent pas par API).

### 6.1 Mouvements du 26 août (après-midi) — audit des worktrees et branches non mergées

- 5 worktrees, 908 branches distantes et 51 locales non mergées auditées au niveau du contenu (un patch-id absent de `main` ne prouve rien après un squash) : **16 commits vivants récupérés** et mergés par `f0ad7dbe8a` (beta, CI 7/7) — le WIP « rattrapage iOS » du worktree composer, 7 cherry-picks gateway/shared, la galerie plein écran, 6 correctifs story de `fix/story-e2e-batch2` ré-implémentés, `autoTranslateEnabled` enfin écrivable + export RGPD branché.
- Milestone « Travail existant à faire atterrir sur main » **clos 6/6** ; « publication depuis une pièce jointe » 2/3 (#3540, #3541 fermées par `60a7a6e61c`, #3542 commentée pour son reste).
- **20 issues** créées depuis l'audit (#3728–#3747) : nettoyage de branches et vieilles sessions (CI & outillage), renderer unique d'ouverture story, Dynamic Type MeeshyUI, handler Siri (Appels), purge serveur des éphémères, suppression admin de lien, clonage vocal → prefs, suivis des PR fermées (aperçu sur `conversation:updated`, tuiles Android inertes, double fusion iOS, liens survivant à la clôture), crash « À proximité » A.2, purge au logout, suivis présence, rattrapage, suites story, numérotation des leçons. 5 rangées dans les nouveaux jalons ; #3742 fermée doublon de #3644–#3646.
- ≈ 750 branches distantes et 46 locales sont supprimables sans perte (listes prêtes, rien supprimé) ; 179 vieilles sessions `claude/*` restent à instruire.
