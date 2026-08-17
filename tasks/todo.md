# Livraison — `/chat/:sharedId` en vue courante + Lentille (Focal / Script)

Branche : `claude/shared-conversation-modes-m5kktb`
Sources : `docs/design/2026-08-15-conversation-modes-verdict.html` (vol. 3),
`docs/design/2026-08-15-focal-spec-integration.html` (vol. 4).

## Verdict retenu pour cette livraison

| Mode | Décision vol. 3 | Cette livraison |
|------|-----------------|-----------------|
| **Focal** | Garder (défaut) | ✅ livré — rangée plate, perspective au scroll, carte de focus |
| **Script** | Densité de Focal (`Aa`) | ✅ livré — même rangée, sans perspective |
| **Lentille** | 2–3 choix + appel | ✅ livré — Focal / Script / Bulles (héritage) |
| **Scène** | Garder · couche live | ⏭️ déjà couverte par la couche d'appel existante (`video-call`) |
| **Résumé Vivant** | Garder | ⏭️ hors périmètre — dépend de l'API observer `assist:*` (absente du gateway) |
| **Rivière** | Sursis | ⏭️ hors périmètre — doit gagner son procès sur prototype |

## Objectif produit

1. `meeshy.me/chat/<ID_PARTAGE>` charge la conversation partagée **dans la vue courante**
   (responsive téléphone / tablette / ordinateur), plus jamais dans une page à part.
2. Visiteur non connecté → **modale** de connexion / création de compte / rejoindre en anonyme.
   La page `/join/<linkId>` disparaît (redirection permanente) ; son contenu vit dans la modale.
3. La Lentille (Focal / Script) est disponible dans cette vue.

## Increments TDD (tous livrés)

### Gateway
- [x] G1 — RED/GREEN : `GET /links/:identifier` expose `requireAccount` + `requireBirthday`
      (déclarés côté web dans `LinkConversationData`, mais retirés par la sérialisation Fastify).
- [x] G2 — RED/GREEN : `GET /links/:identifier` — un utilisateur **authentifié non membre**
      reçoit aujourd'hui `403`. Il doit retomber sur la règle d'aperçu public
      (`isActive && allowViewHistory`) pour voir l'aperçu + la modale « Rejoindre ».

### Web — accès partagé
- [x] W1 — `useSharedConversationAccess` : résout l'identité (`member` | `anonymous` | `visitor` | erreur).
- [x] W2 — `JoinConversationModal` : reprend `LoginForm`, `RegisterForm` (avec `linkId`,
      donc l'inscription rejoint en une étape) et `AnonymousForm` (nom/prénom, pseudo +
      vérification de disponibilité, email, anniversaire selon `require*`).
      `JoinHeader` / `JoinInfo` / `JoinActions` / `JoinLoading` étaient le chrome de la
      page d'accueil : supprimés, la modale porte ce rôle.
- [x] W3 — `/chat/[id]` : membre → `ConversationLayout` (vue app complète) ;
      anonyme → surface conversation ; visiteur → aperçu + modale.
- [x] W4 — `/join/[linkId]` → redirection permanente vers `/chat/[linkId]`.
- [x] W5 — tout producteur de lien de partage émet `/chat/<linkId>`.

### Web — Lentille
- [x] L1 — `useFocalScroller` : `focusY = bas − 150`, `f = min(1, d/380)`,
      échelle `1 − 0.40f`, opacité `1 − 0.82f`, transform/opacity seulement, neutralisé par
      `prefers-reduced-motion`.
- [x] L2 — `FocalRow` : rangée plate, tête de groupe `Pseudo · HH:mm`, retrait 29, aucune bulle.
- [x] L3 — `DateSticker` (collant) + `ScrollTimePill` (auto-effacement 900 ms).
- [x] L4 — `LensSwitcher` dans le header + persistance collante par conversation.
- [x] L5 — `--conv-accent` depuis `conversationAccentPalette()` (`packages/shared`).

### Livraison
- [x] D1 — `tsc` + tests web & gateway verts, `next build` vert.
      **Lint : non exécutable** — ESLint est cassé à l'échelle du dépôt (voir Revue).
- [ ] D2 — images Docker : **non construites dans cette session**, le proxy sortant
      bloque tous les blobs Docker Hub (403). Construites par
      `.github/workflows/docker.yml` au push. Détail en Revue.
- [x] D3 — commit + push sur la branche.

## Revue

### Gateway — 2 correctifs demandés + 3 bugs trouvés en chemin

`GET /links/:identifier` était la route dont dépend toute la vue partagée. En
écrivant les tests du nouveau flux, cinq défauts sont sortis :

1. **`requireAccount` / `requireBirthday` absents du schéma de réponse.** Déclarés
   côté web dans `LinkConversationData`, mais retirés par la sérialisation
   Fastify — la modale ne pouvait pas savoir quels champs afficher.
2. **Un compte connecté non membre recevait `403`.** Être identifié donnait donc
   MOINS d'accès que la navigation privée. Il retombe maintenant sur l'aperçu
   public (`isActive && allowViewHistory`), puis la modale propose « Rejoindre ».
3. **`currentUser`, `members` et `anonymousParticipants` étaient sérialisés `{}`.**
   Déclarés `{ type: 'object' }` sans `properties`, fast-json-stringify les
   vidait. La conversation partagée arrivait au client sans savoir qui parle.
   Même famille de panne que celle documentée au-dessus de
   `linkMessageSenderSchema`.
4. **Aucun membre n'était jamais reconnu.** Le `select` Prisma ne projetait pas
   `isActive` (un `where: { isActive: true }` ne PROJETTE pas le champ), donc
   `member.isActive` valait `undefined` et `userType: 'member'` était
   inatteignable en production — masqué par un mock de test qui, lui, portait le
   champ.
5. **L'identité des participants anonymes était lue à plat.** Le modèle Prisma
   `Participant` ne porte ni `username` ni `firstName` ni `canSend*` : tout vit
   dans `anonymousSession.profile` et `permissions`. Le `select` est restreint à
   `profile` — `session` porte le hash de jeton, l'IP et l'empreinte appareil,
   qui ne sortent jamais d'une route consultable sans authentification (test de
   non-fuite ajouté).

### Web — un écran, trois rendus, zéro navigation

`SharedConversationExperience` remplace la paire `/chat` + `/join` qui se
renvoyait la balle par `router.push`. Trois gardes `sessionStorage` avaient été
empilées pour contenir la boucle (Safari → app iOS → Safari, sans fin) : elles
disparaissent avec la cause. `use-auth` ne redirige plus sur `/chat/*` non plus.

Deux défauts trouvés par les tests d'intégration, corrigés :
- la modale s'ouvrait **une frame après** le premier rendu (état synchronisé par
  un effet) → le visiteur voyait l'aperçu nu clignoter. Elle est maintenant
  **dérivée** de l'accès résolu.
- le chargement du lien **rebouclait** : `t` de `useI18n` change d'identité à
  chaque rendu et figurait dans les dépendances de l'effet. Le message d'erreur
  est traduit au rendu, plus au chargement.

`/chat/[id]` : **1,18 Mo → 217 ko** de First Load JS. Les trois surfaces sont
exclusives, elles sont donc chargées via `next/dynamic` — un visiteur sans compte
ne télécharge plus la vue applicative complète.

Les métadonnées riches (titre, créateur, participants, image OG générée) ont
déménagé de `/join/[linkId]/layout.tsx` vers `/chat/[id]/layout.tsx` : `/chat`
est désormais l'URL collée dans WhatsApp, elle doit porter l'aperçu.

Sept endroits fabriquaient l'URL de partage à la main → une seule source,
`buildShareLinkUrl()`. `/chat/*` ajouté à l'AASA iOS (Universal Links).

### Lentille

Les cotes ne sont pas réinventées : `styles/lentille-tokens.css`, généré depuis
`packages/shared/design/lentille-tokens.json`, existait déjà mais n'était importé
nulle part (« Wiring belongs to future work (WL-100+) »). C'était ce travail.
De même, `conversationAccentPalette()` (portage TS de `ColorGeneration.swift`)
existait sans aucun consommateur web — l'indigo était codé en dur. Il alimente
maintenant `--conv-accent`.

`FocalRow` est une **sœur** de `BubbleMessageNormalView`, pas un remplacement :
elle réutilise les mêmes hooks (`useReactionsQuery`, `useMessageInteractions`,
`useMessageDisplay`) et les mêmes enfants, avec un chrome plat. La vue à bulles
reste intacte, à un tap via la Lentille. Réaction, langue, édition, suppression
et signalement sont identiques dans toutes les lentilles.

Piège évité : la perspective ne peut PAS être écrite sur l'élément mesuré par
`tanstack-virtual`. Le rectangle mesuré rétrécirait, la courbe recalculerait une
autre échelle, et la liste tremblerait d'une frame à l'autre. D'où la séparation
ancre de géométrie (`data-focal-row`) / cible de transformation
(`data-focal-scale`), pinnée par un test.

### Vérification

| Gate | Résultat |
|------|----------|
| `jest` web | **591 suites / 12 505 tests** verts |
| Couverture web | 57,7 % lignes (seuil 42) |
| `next build` | ✅ — `/chat/[id]` à 217 ko |
| `tsc --noEmit` web | **0 erreur ajoutée** (base pré-existante de 890 inchangée) |
| `jest` gateway | **740 suites / 17 927 tests** verts (une suite tuée par l'OOM du conteneur, verte seule) |
| `tsc` gateway | ✅ `dist/src/server.js` produit |

### Non livré, et pourquoi

- **Résumé Vivant** — dépend de l'API observer `assist:*` côté gateway, qui
  n'existe pas. Le volume 4 le pose explicitement comme indépendant des PR 1-4.
- **Rivière** — en sursis par le verdict : elle doit gagner son procès sur
  prototype (« Deux non — on coupe, la Rampe hérite »).
- **Scène** — déjà couverte par la couche d'appel existante (`video-call`) ; ce
  n'est pas une lentille de lecture.
- **Images Docker** — non construites *dans cette session* : le proxy sortant
  renvoie 403 sur tous les blobs Docker Hub
  (`production.cloudfront.docker.com`), donc aucune image de base n'est
  téléchargeable ici. À la place, tout ce dont dépend le build d'image a été
  vérifié : `next build` (sortie `standalone`) et `tsc` gateway (`dist/`).
  `.github/workflows/docker.yml` construit et pousse `meeshy-web` et
  `meeshy-gateway` automatiquement — les deux chemins surveillés
  (`apps/web/**`, `services/gateway/**`) sont touchés par cette livraison.
- **ESLint** — cassé à l'échelle du dépôt (`Converting circular structure to
  JSON`, ESLint 10 contre config héritée), y compris sur des fichiers non
  touchés. Hors périmètre.
