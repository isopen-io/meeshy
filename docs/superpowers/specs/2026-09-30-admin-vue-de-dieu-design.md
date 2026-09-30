# La vue de dieu de l'administration — spécification de conception

> Chantier #8876 · milestone #101 « L'administration vit dans la v2, réécrite sur son design system » · 2026-09-30
> Application : `apps/web` (Vite + Preact + Capacitor), passerelle `services/gateway`, catalogues générés `packages/shared/api/endpoints`.
> Ce document est un BROUILLON DE CONCEPTION tracké : l'état de chaque tâche vit dans son issue GitHub, jamais ici.
> **AMENDEMENT du 2026-09-30 (directive porteur, `apps/web/decisions.md` D-159) : l'administration est servie en QUATRE langues — français, anglais, espagnol, portugais, « c'est tout ».** Partout où ce document écrit « sept langues », lire « quatre » ; une langue d'interface hors de ces quatre (allemand, italien, arabe) lit l'administration en anglais — textes et formats —, `lang="en" dir="ltr"` à la racine. Les fragments et catalogues `de`, `it`, `ar` n'existent plus et ne s'écrivent plus.

## 0. Cadre

### 0.1 La directive (porteur, 2026-09-30, mot pour mot)

« Met à jour jusqu'à merger dans main, la partie admin doit avoir une réorganisation professionnelle plus fraîche et complétude avec un alignement de design UI partout. Dans ces premières versions actuellement, seul un utilisateur, le créateur, est administrateur : il faut remonter les méta data, remonter les statistiques, remonter pour chaque entité les éléments utiles à sa compréhension. Il faut qu'il ait la vue de dieu pour mieux manager la plateforme, activer et contrôler toutes les entités ! »
« Il faut afficher les vrais noms, nommer les éléments, prendre les éléments et donner l'interprétation des méta données etc. »
« Ton workflow DOIT absolument compléter tout le développement et utiliser les plus simples modèles au mieux. »

### 0.2 Ce que la vue de dieu veut dire, en règles vérifiables

| # | Règle | Témoin |
|---|---|---|
| R1 | **Vrais noms partout.** Une personne = `displayName` (+ `@username`, avatar) ; une conversation = son titre, ou le nom de ses membres pour une conversation privée ; une communauté = son nom ; un lien = son nom ; une publication = son auteur + un extrait. Un ObjectId n'est JAMAIS un libellé principal : il n'apparaît que dans une ligne « Identifiant technique » copiable. | `expectNoRawIdentifiers(host)` (§ 2.11) dans chaque témoin d'écran |
| R2 | **Métadonnées interprétées.** Chaque champ a un libellé traduit et une valeur humaine : énumération nommée, langue NOMMÉE (`Intl.DisplayNames` dans la langue d'interface), date absolue + relative, comptes/durées/octets/pourcentages formatés, booléens dits en mots, une phrase d'explication quand le sens n'est pas évident. Jamais `true`/`false`, jamais une énumération brute, jamais un ISO brut. | tests de la bibliothèque § 3 ; `expectNoRawIdentifiers` refuse aussi l'ISO brut |
| R3 | **Chaque entité se comprend et se contrôle depuis sa fiche** : identité, chiffres, métadonnées interprétées, entités liées nommées et cliquables, et les gestes de contrôle que la passerelle sert (activer, désactiver, supprimer, résoudre, envoyer, révéler…). | un témoin par geste : appel, confirmation, effet visible |
| R4 | **Chaque liste** : recherche, tri et filtres là où la passerelle les sert, pagination, et chaque ligne ouvre sa fiche. Une capacité que la passerelle ne sert pas n'est pas dessinée (loi 4). | `liste-ouvre-sa-fiche.test.ts`, témoins de liste |
| R5 | **États dessinés** : squelette, vide (absolu et filtré), erreur avec « Réessayer », refus, hors ligne. Cache-first en mémoire (TanStack), jamais de spinner sur des données en cache. | témoins d'états |
| R6 | **Accès fail-closed par permission servie** (`GET /me/permissions`), jamais par la session ; aujourd'hui seul le créateur (BIGBOSS) est administrateur, et il voit tout — mais le code ne le suppose jamais. | `sections.test.ts`, `use-admin-reach.test.ts` |
| R7 | **Rien d'administratif sur le disque** : ni service worker (déjà), ni cache TanStack persisté (corrigé par la fondation, § 7.2). | `query-client.test.ts`, `check-sw-api-cache` |
| R8 | **Un seul langage visuel** : le kit § 2 et lui seul ; aucune couleur en hexadécimal, jetons `--color-ios-*`/`--ios-*` uniquement ; clair et sombre par jetons ; propriétés logiques (RTL) ; 375 px à pleine largeur ; cibles 44 px ; focus visible. | revue + `check-utilities` + témoins |
| R9 | **Sept langues** pour toute chaîne neuve (fr source). | `i18n-admin-catalog.test.ts`, `admin-catalog-fragments.test.ts` |

### 0.3 Ce qui existe et que ce chantier garde

- Deux espaces `/admin/*` et `/adm/*` (D-76) servant les MÊMES modules d'écran ; l'espace se lit dans `useRoute().key`.
- La garde : `adminIdentityQueryOptions(apiDeps)` → `visibleAdminSections(permissions, role)`. Refus unique qui ne dit pas pourquoi.
- Le cadre `AdminScreenFrame` (menu latéral ≥ `md`, tiroir < `md`), les listes à état dans l'adresse (`list-state.ts`, `useAdminListState`), les clients d'API champ par champ (`ApiResult`, `pageServie`, `resultatServi`).
- La lecture souveraine d'une conversation (motif écrit ≥ 10 caractères) : seul chemin vers le CONTENU d'un message. `GET /admin/messages` et `GET /admin/translations` (#6919) ne sont JAMAIS consommés.
- La loi de visibilité de la présence, la lecture souveraine, la révélation souveraine d'un lien : inchangées.

---

## 1. Architecture d'information

### 1.1 Sept groupes

Le menu latéral et le hub rangent les sections en groupes titrés. Un groupe dont aucune section n'est visible n'est pas rendu.

| Ordre | id de groupe | Libellé (fr) | Clé | Sections |
|---|---|---|---|---|
| 1 | `overview` | Vue d'ensemble | `admin.group.overview` | Tableau de bord |
| 2 | `people` | Personnes | `admin.group.people` | Comptes · Anonymes · Demandes de contact |
| 3 | `exchanges` | Échanges | `admin.group.exchanges` | Conversations · Communautés · Liens de partage |
| 4 | `content` | Contenus | `admin.group.content` | Publications (publications, stories, reels, statuts) |
| 5 | `moderation` | Modération | `admin.group.moderation` | Signalements · Journal d'audit |
| 6 | `growth` | Croissance | `admin.group.growth` | Statistiques · Classement · Liens de suivi · Diffusions |
| 7 | `platform` | Plateforme | `admin.group.platform` | Supervision · Langues et traductions · Agent · Réglages |

Raisons des affinages par rapport à la proposition d'origine :
- **Les « invitations » servies sont des DEMANDES D'AMITIÉ** (`FriendRequest`), pas des invitations par e-mail : elles vont dans *Personnes*, sous leur vrai nom « Demandes de contact ».
- **Les liens de partage ouvrent une conversation** (garde `canManageConversations`, gestes de fermeture qui révoquent des invités) : ils vont dans *Échanges*.
- **Les statistiques de messages** deviennent un onglet de *Statistiques* : il n'existe aucun navigateur de contenus (#6919).
- **Langues et traductions** mesure la santé du Prisme (paires, précision) : *Plateforme*.
- **Pas de section « Sessions » ni « Bannissements »** : la passerelle ne les sert que par membre ; elles vivent dans la fiche membre (onglet Sécurité). Une vue globale est une issue de suivi (§ 8).

### 1.2 Le registre des sections

Chaque ligne est une entrée de `ADMIN_SECTIONS` (`apps/web/src/lib/admin/sections.ts`). `ready` : `true` pour les sections déjà servies ; pour les treize neuves, lu depuis `lib/admin/ready/<fichier>.ts` (§ 1.5). Les motifs de fiche ont trois segments, les listes deux : aucune ambiguïté d'ordre dans `route-table.tsx`.

| id | Groupe | Clé de libellé (fr) | Glyphe (phosphor) | Permission servie | Rang admin | Liste `/admin` · `/adm` | Fiche `/admin` · `/adm` (param) | Motifs | Écrans | Lot |
|---|---|---|---|---|---|---|---|---|---|---|
| `dashboard` | overview | `admin.nav.dashboard` Tableau de bord | `squares-four` | `canAccessAdmin` | — | `admin` · `adm` | — | `/admin`, `/adm` | `routes/admin.tsx` (hub) + `routes/admin-dashboard.tsx` (panneau) | fondation + dashboard |
| `users` | people | `admin.nav.users` Comptes | `users` | `canManageUsers` | — | `adminUsers` · `admUsers` | `adminUser` · `admUser` (`user`) | `/admin/users`, `/admin/users/$user` | `admin-users.tsx`, `admin-user.tsx` | personnes |
| `anonymous` | people | `admin.nav.anonymous` Anonymes | `detective` | `canManageUsers` | — | `adminAnonymous` · `admAnonymous` | `adminAnonymousOne` · `admAnonymousOne` (`participant`) | `/admin/anonymous`, `/admin/anonymous/$participant` | `admin-anonymous.tsx`, `admin-anonymous-one.tsx` | personnes |
| `invitations` | people | `admin.nav.invitations` Demandes de contact | `handshake` | `canManageUsers` | — | `adminInvitations` · `admInvitations` | `adminInvitation` · `admInvitation` (`invitation`) | `/admin/invitations`, `/admin/invitations/$invitation` | `admin-invitations.tsx`, `admin-invitation.tsx` | liens |
| `conversations` | exchanges | `admin.nav.conversations` Conversations | `chats` | `canManageConversations` | **oui** | `adminConversations` · `admConversations` | `adminConversation` · `admConversation` (`conversation`) | `/admin/conversations`, `/admin/conversations/$conversation` | `admin-conversations.tsx`, `admin-conversation.tsx` | conversations-agent |
| `communities` | exchanges | `admin.nav.communities` Communautés | `users-three` | `canManageGroups` | — | `adminCommunities` · `admCommunities` | `adminCommunity` · `admCommunity` (`community`) | `/admin/communities`, `/admin/communities/$community` | `admin-communities.tsx`, `admin-community.tsx` | contenus |
| `shareLinks` | exchanges | `admin.nav.shareLinks` Liens de partage | `link-simple` | `canManageConversations` | — | `adminShareLinks` · `admShareLinks` | `adminShareLink` · `admShareLink` (`link`) | `/admin/share-links`, `/admin/share-links/$link` | `admin-share-links.tsx`, `admin-share-link.tsx` | liens |
| `posts` | content | `admin.nav.posts` Publications | `newspaper` | `canModerateContent` | — | `adminPosts` · `admPosts` | `adminPost` · `admPost` (`post`) | `/admin/posts`, `/admin/posts/$post` | `admin-posts.tsx`, `admin-post.tsx` | contenus |
| `reports` | moderation | `admin.nav.reports` Signalements | `flag` | `canModerateContent` | — | `adminReports` · `admReports` | `adminReport` · `admReport` (`report`) | `/admin/reports`, `/admin/reports/$report` | `admin-reports.tsx`, `admin-report.tsx` | moderation |
| `audit` | moderation | `admin.nav.audit` Journal d'audit | `scroll` | `canViewAuditLogs` | — | `adminAudit` · `admAudit` | — (fiche en feuille) | `/admin/audit` | `admin-audit.tsx` | audit-reglages |
| `analytics` | growth | `admin.nav.analytics` Statistiques | `chart-line` | `canViewAnalytics` | — | `adminAnalytics` · `admAnalytics` | — (`?tab=`) | `/admin/analytics` | `admin-analytics.tsx` | statistiques |
| `ranking` | growth | `admin.nav.ranking` Classement | `trophy` | `canViewAnalytics` | — | `adminRanking` · `admRanking` | — (lignes → fiches) | `/admin/ranking` | `admin-ranking.tsx` | classement-supervision |
| `trackingLinks` | growth | `admin.nav.trackingLinks` Liens de suivi | `target` | `canViewAnalytics` | — | `adminTrackingLinks` · `admTrackingLinks` | `adminTrackingLink` · `admTrackingLink` (`link`) | `/admin/tracking-links`, `/admin/tracking-links/$link` | `admin-tracking-links.tsx`, `admin-tracking-link.tsx` | liens |
| `broadcasts` | growth | `admin.nav.broadcasts` Diffusions | `megaphone` | `canManageNotifications` | — | `adminBroadcasts` · `admBroadcasts` | `adminBroadcast` · `admBroadcast` (`broadcast`) | `/admin/broadcasts`, `/admin/broadcasts/$broadcast` | `admin-broadcasts.tsx`, `admin-broadcast.tsx` | diffusions |
| `monitoring` | platform | `admin.nav.monitoring` Supervision | `heartbeat` | `canViewAnalytics` | **oui** | `adminMonitoring` · `admMonitoring` | — (`?tab=`) | `/admin/monitoring` | `admin-monitoring.tsx` | classement-supervision |
| `languages` | platform | `admin.nav.languages` Langues et traductions | `translate` | `canViewAnalytics` | — | `adminLanguages` · `admLanguages` | — | `/admin/languages` | `admin-languages.tsx` | statistiques |
| `agent` | platform | `admin.nav.agent` Agent | `robot` | `canManageAgent` | — | `adminAgent` · `admAgent` | — | `/admin/agent` | `admin-agent.tsx` | conversations-agent |
| `settings` | platform | `admin.nav.settings` Réglages | `gear` | `canAccessAdmin` | — | `adminSettings` · `admSettings` | — | `/admin/settings` | `admin-settings.tsx` | audit-reglages |

Tous les écrans vivent dans `apps/web/src/routes/`. `admin.nav.moderation` disparaît (le groupe « Modération » a sa clé `admin.group.moderation`, la section s'appelle « Signalements »). Chaque section a aussi `admin.nav.<id>.hint` : une ligne qui dit ce qu'on y fait (hub).

### 1.3 Une section porte la capacité de ce qu'elle OUVRE (décision #6843)

La décision tranchée pour #6843 est l'**option C, complétée par A à l'intérieur de chaque écran** :
- chaque section est une tuile dont la permission est celle de la route qu'elle ouvre (Signalements → `canModerateContent`, exactement la garde des dix routes de `reports.ts`) ; les statistiques de messages quittent la modération pour *Statistiques* ; les publications ont leur propre section (garde `canModerateContent`) ; les liens de partage vont dans *Échanges* (garde `canManageConversations`) ;
- à l'intérieur d'un écran, **tout bloc dont la route exige une capacité de plus se masque** si le lecteur ne la porte pas (ex. la révélation d'un lien n'est offerte qu'au rang souverain ; la file de modération du tableau de bord n'est rendue qu'avec `canModerateContent`). La table bloc → capacité est écrite dans la section de chaque écran (§ 4, § 5) et testée ;
- la passerelle demande parfois une permission NON servie (`canViewUsers`, `canCreateUsers`, `canManageCommunities`) : la section choisit une clé servie AU MOINS aussi stricte (`canManageUsers`, `canManageGroups`) ; un 403 malgré tout se rend comme un refus (état « refusé »), jamais comme une panne.

Écarts assumés (seuil plus haut que la route, jamais plus bas) : *Statistiques* et *Langues* sous `canViewAnalytics` alors que leurs routes demandent `canAccessAdmin` (un MODERATOR ne les voit pas) ; *Réglages* sous `canAccessAdmin` (ex-`canManageTranslations`, qui ne gardait rien).

### 1.4 Les entités, leurs fiches, et la règle des vrais noms

`apps/web/src/lib/admin/admin-routes.ts` porte LA table (fondation) d'où dérivent `EN_ADM`, la surbrillance du menu, le retour de chaque écran, les paires de `liste-ouvre-sa-fiche.test.ts` et les liens d'entité :

| Genre d'entité (`AdminEntityKind`) | Section | Fiche (param) | Libellé (`lib/admin/interpret/labels.ts`) |
|---|---|---|---|
| `user` | users | `adminUser`/`admUser` (`user`) | `displayName` → « Prénom Nom » → `@username` → « Compte sans nom » |
| `anonymous` | anonymous | `adminAnonymousOne`/`admAnonymousOne` (`participant`) | `displayName` → « Invité sans nom » |
| `invitation` | invitations | `adminInvitation`/`admInvitation` (`invitation`) | « {expéditeur} → {destinataire} » |
| `conversation` | conversations | `adminConversation`/`admConversation` (`conversation`) | titre → privée : « Awa et Jean » (participants servis) → groupe sans titre : « Awa, Jean et 3 autres » → « Conversation sans titre » |
| `community` | communities | `adminCommunity`/`admCommunity` (`community`) | nom |
| `shareLink` | shareLinks | `adminShareLink`/`admShareLink` (`link`) | nom → « Lien sans nom » (JAMAIS l'identifiant ni le `linkId`, qui sont des secrets d'entrée) |
| `trackingLink` | trackingLinks | `adminTrackingLink`/`admTrackingLink` (`link`) | nom → campagne → « Lien de suivi sans nom » |
| `post` | posts | `adminPost`/`admPost` (`post`) | « {type} de {auteur} » + extrait ≤ 80 caractères |
| `report` | reports | `adminReport`/`admReport` (`report`) | « Signalement · {motif} » |
| `broadcast` | broadcasts | `adminBroadcast`/`admBroadcast` (`broadcast`) | nom |
| `message` | — (pas de fiche) | lien vers la fiche de SA conversation | « Message de {auteur} · {date} » (jamais son contenu hors lecture souveraine) |

Un lien d'entité (`AdminEntityLink`, § 2.7) n'est rendu cliquable QUE si le lecteur peut ouvrir la section cible (`reach.opens(section)`), sinon c'est une étiquette. Il reste toujours dans l'espace courant.

### 1.5 Sections en préparation : drapeau de disponibilité et écran d'attente

Pour que les lots travaillent en parallèle sans jamais éditer un fichier partagé, la fondation déclare TOUTES les routes d'avance, chacune pointant vers un écran d'attente (`AdminStubScreen`) que le lot remplace. Loi 4 tenue par construction :
- `lib/admin/ready/<fichier>.ts` exporte `export const READY: boolean = false;` pour chacune des treize sections neuves (`invitations`, `communities`, `share-links`, `posts`, `reports`, `audit`, `analytics`, `ranking`, `tracking-links`, `broadcasts`, `monitoring`, `languages`, `settings`) ; `sections.ts` les importe (quelques octets, aucun écran tiré dans le socle) ;
- `visibleAdminSections` n'offre une section que si `ready === true` : ni menu, ni tuile, ni lien d'entité ne mènent à un écran d'attente, qui n'est joignable qu'en tapant son adresse (et dit « Cette section arrive ») ;
- `lib/admin/section-readiness.test.ts` (fondation) garde la cohérence : `READY === true` ⇔ aucun des écrans de la section ne contient `AdminStubScreen`. Un lot bascule son drapeau DANS LE COMMIT qui remplace ses écrans ; il ne peut ni l'oublier ni l'avancer.
- À l'intégration finale, plus aucun écran n'importe `AdminStubScreen` : l'intégrateur supprime le composant et remplace les drapeaux par `ready: true` dans le registre.

---

## 2. Le kit d'administration

### 2.1 Langage visuel — un back-office frais, dérivé d'iOS

| Élément | Règle |
|---|---|
| Fond de page | celui de l'application (`var(--color-bg)`) ; aucune carte n'y est posée sans bord |
| Carte | `backgroundColor: var(--color-ios-surface)`, bord `1px solid var(--color-edge)`, `rounded-card`, padding `p-4` (≥ `md` : `p-5`) ; pas d'ombre portée ; la matière de verre reste réservée à la fiche membre existante |
| Titres | page : `text-screen font-bold` ; section : `text-title font-semibold` ; libellé de carte / de métadonnée : `text-caption` en `var(--color-ios-ink-2)` ; valeur : `text-body` en `var(--color-ios-ink)` ; chiffre clé : `text-screen font-bold tabular-nums` |
| Espacement | pile de page `gap-6` ; grille de cartes `gap-3 md:gap-4` ; contenu pleine largeur (pas de `max-width`), mais les fiches posent une colonne principale + une colonne latérale ≥ `lg` (`lg:grid-cols-[minmax(0,1fr)_20rem]`) |
| Tons (`AdminTone`) | `neutral` (fond `color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)`, texte ink-2) · `brand` (`--color-ios-brand`) · `success` (`--color-success`) · `warning` (`--color-warning`) · `danger` (`--color-danger`) · `info` (`--ios-info`). Fond = `color-mix(... 14%, transparent)` du ton, texte = le ton ; **jamais la couleur seule** : un badge porte toujours son mot (et souvent un glyphe) |
| Glyphes | Phosphor « regular » par un JEU D'ÉCRAN généré `components/glyphs-admin.ts` (`scripts/extract-glyphs.mjs`, jamais recopié à la main, jamais dans le socle). Plus aucun emoji dans le menu |
| Focus | `focus-visible:outline-2 focus-visible:outline-offset-2` + `outlineColor: var(--color-ios-brand)` sur tout élément actif |
| Cibles | 44 px minimum (`minHeight: 44` ou `min-h-11`) ; rangées de tableau 52 px |
| Densité | tableaux sans zèbre ; survol de rangée `color-mix(in srgb, var(--color-ios-ink-3) 6%, transparent)` ; séparateurs `var(--color-edge)` |
| Mouvement | transitions de couleur ≤ 150 ms, coupées par `prefers-reduced-motion` (déjà global) |
| Couleurs | jetons seulement. Aucun hexadécimal dans le TSX, y compris en repli (`var(--color-success, #34D399)` interdit) ; la présence passe par `Avatar presence=` |
| RTL | propriétés logiques (`ps-`/`pe-`/`ms-`/`me-`/`text-start`/`text-end`/`insetInlineStart`), chevrons `rtl:-scale-x-100` ; l'axe du temps des graphiques reste gauche → droite (`dir="ltr"` sur le `<svg>`), leurs légendes et libellés suivent le sens du document |
| 375 px | menu en tiroir, gouttière 16 px, tableaux rendus en CARTES sous `md`, barre de filtres en `flex-wrap`, actions d'en-tête qui passent sous le titre |

### 2.2 Fichiers du kit (fondation — aucun lot ne les édite)

| Fichier | Exporte |
|---|---|
| `apps/web/src/components/glyphs-admin.ts` (GÉNÉRÉ) | `ADMIN_GLYPHS`, `type AdminGlyphName` |
| `apps/web/src/components/admin/admin-glyph.tsx` | `AdminGlyph` |
| `apps/web/src/components/admin/page-header.tsx` | `AdminPageHeader`, `type AdminCrumb` |
| `apps/web/src/components/admin/stat-card.tsx` | `AdminStatCard`, `AdminStatGrid`, `type AdminDelta` |
| `apps/web/src/components/admin/charts/chart-scale.ts` | fonctions pures d'échelle et de tracé |
| `apps/web/src/components/admin/charts/chart-card.tsx` | `AdminChartCard`, `AdminChartTable`, `ADMIN_SERIES_TOKENS` |
| `apps/web/src/components/admin/charts/sparkline.tsx` | `AdminSparkline` |
| `apps/web/src/components/admin/charts/bar-chart.tsx` | `AdminBarChart` |
| `apps/web/src/components/admin/charts/share-chart.tsx` | `AdminShareChart` |
| `apps/web/src/components/admin/charts/timeline-chart.tsx` | `AdminTimelineChart` |
| `apps/web/src/components/admin/entity-list.tsx` | `AdminEntityList`, `type AdminColumn` |
| `apps/web/src/components/admin/list-toolbar.tsx` | `AdminListToolbar`, `AdminFilterChips` |
| `apps/web/src/components/admin/fiche.tsx` | `AdminFiche`, `AdminIdentityHeader`, `AdminStatStrip`, `AdminFicheSection` |
| `apps/web/src/components/admin/meta.tsx` | `AdminMetaPanel`, `AdminMetaRow`, `AdminTechnicalId`, `AdminMomentText` |
| `apps/web/src/components/admin/entity-chip.tsx` | `AdminEntityChip`, `AdminEntityLink`, `AdminLink` |
| `apps/web/src/components/admin/badges.tsx` | `AdminBadge`, `AdminInterpretedBadge`, `AdminRoleBadge`, `AdminLanguageBadge` |
| `apps/web/src/components/admin/confirm-sheet.tsx` | `AdminConfirmSheet` |
| `apps/web/src/components/admin/states.tsx` | `AdminEmptyState`, `AdminErrorState`, `AdminDeniedInline`, `AdminOfflineNotice`, `AdminInlineNotice` |
| `apps/web/src/components/admin/tabs.tsx` | `AdminTabs` |
| `apps/web/src/components/admin/section-screen.tsx` | `AdminSectionScreen` |
| `apps/web/src/components/admin/section-directory.tsx` | `AdminSectionDirectory` (tuiles groupées du hub) |
| `apps/web/src/components/admin/stub-screen.tsx` | `AdminStubScreen` (supprimé à l'intégration) |
| `apps/web/src/lib/admin/admin-routes.ts` | table des paires, `AdminSectionId`, `AdminEntityKind`, `AdminTarget`, `adminListRoute`, `adminFicheRoute`, `adminBackOf` |
| `apps/web/src/lib/admin/use-admin-reach.ts` | `useAdminReach`, `type AdminReach` |
| `apps/web/src/lib/admin/use-admin-list.ts` | `useAdminList`, `type AdminListController` |
| `apps/web/src/lib/admin/use-admin-action.ts` | `useAdminAction` |
| `apps/web/src/lib/admin/period.ts` | `ADMIN_PERIODS`, `periodStart` |
| `apps/web/src/lib/api/admin-page.ts` | `type AdminPage`, `adminPageOf` |
| `apps/web/src/lib/admin/interpret/*.ts` | bibliothèque d'interprétation § 3 |
| `apps/web/src/test-support/admin-assertions.ts` | `expectNoRawIdentifiers`, `adminIdentityFixture` |

`admin-parts.tsx`, `admin-table.tsx`, `admin-shell.tsx` restent et continuent d'exporter leurs pièces (écrans existants intacts) ; `AdminLine`/`AdminSection` restent pour les écrans non migrés ; les lots personnes et conversations-agent migrent leurs écrans vers le kit.

### 2.3 Signatures (TypeScript strict, `type` pour les données, props en objets)

```ts
// page-header.tsx
export type AdminCrumb = { readonly label: string; readonly target?: AdminTarget };
export function AdminPageHeader(p: {
  readonly language: InterfaceLanguage;
  readonly title: string;                 // <h1 data-admin-page-title>
  readonly subtitle?: string;             // une phrase : ce que montre l'écran / la période
  readonly crumbs?: readonly AdminCrumb[];// <nav aria-label={admin.kit.breadcrumb}><ol> : Groupe › Section › Entité
  readonly badges?: ReactNode;            // état de l'entité à côté du titre
  readonly actions?: ReactNode;           // gestes principaux, à droite (sous le titre < md)
}): JSX.Element;

// stat-card.tsx
export type AdminDelta = {
  readonly ratio: number;                 // (courant - précédent) / précédent ; 0.12 = +12 %
  readonly period: string;                // libellé traduit : « vs 7 jours précédents »
  readonly goodWhen: 'up' | 'down' | 'neutral';
};
export function AdminStatCard(p: {
  readonly language: InterfaceLanguage;
  readonly label: string;
  readonly value: string;                 // DÉJÀ formaté par § 3
  readonly caption?: string;              // « dont 12 en 24 h », « sur 1 204 »
  readonly delta?: AdminDelta | null;     // flèche + signe + mot, ton selon goodWhen ; jamais la couleur seule
  readonly trend?: readonly number[];     // sparkline décorative + résumé textuel
  readonly target?: AdminTarget;          // toute la carte devient un lien 44 px vers la liste filtrée
  readonly anchor: string;                // data-admin-stat={anchor}
  readonly state?: 'ready' | 'loading' | 'error';
  readonly onRetry?: () => void;
}): JSX.Element;
export function AdminStatGrid(p: { readonly children: ReactNode; readonly columns?: 2 | 3 | 4 }): JSX.Element; // 1 col < sm, 2 ≥ sm, `columns` ≥ lg

// fiche.tsx
export function AdminFiche(p: { readonly header: ReactNode; readonly stats?: ReactNode; readonly aside?: ReactNode; readonly children: ReactNode; readonly kind: AdminEntityKind }): JSX.Element; // data-admin-fiche={kind}
export function AdminIdentityHeader(p: {
  readonly language: InterfaceLanguage;
  readonly title: string;                 // le VRAI nom
  readonly secondary?: string;            // @username, identifiant public, type
  readonly avatar?: { readonly initials: string; readonly color: string; readonly src?: string | null; readonly presence?: UserPresenceStatus };
  readonly glyph?: AdminGlyphName;        // quand l'entité n'a pas d'avatar (lien, signalement, diffusion)
  readonly badges?: ReactNode;
  readonly actions?: ReactNode;
}): JSX.Element;
export function AdminStatStrip(p: { readonly items: readonly { readonly id: string; readonly label: string; readonly value: string; readonly target?: AdminTarget }[] }): JSX.Element;
export function AdminFicheSection(p: { readonly id: string; readonly title: string; readonly actions?: ReactNode; readonly children: ReactNode }): JSX.Element; // <section aria-labelledby>

// meta.tsx
export function AdminMetaPanel(p: { readonly title: string; readonly children: ReactNode }): JSX.Element; // <section><h2/><dl/>
export function AdminMetaRow(p: {
  readonly label: string;
  readonly value: ReactNode;              // texte interprété, badge, lien d'entité, AdminMomentText
  readonly explain?: string | null;       // une phrase sous la valeur (text-caption ink-3)
  readonly anchor?: string;               // data-admin-meta={anchor}
}): JSX.Element;                          // la valeur REVIENT à la ligne (break-words), jamais tronquée
export function AdminTechnicalId(p: { readonly language: InterfaceLanguage; readonly id: string; readonly label?: string; readonly onAnnounce?: (message: string) => void }): JSX.Element;
// ligne « Identifiant technique », id en font-mono dans [data-admin-technical-id], bouton « Copier » (copyPlainText) qui annonce « Identifiant copié » / « Copie impossible »
export function AdminMomentText(p: { readonly moment: AdminMoment | null; readonly variant?: 'relative' | 'absolute' | 'both' }): JSX.Element;
// <time dateTime={iso} title={absolu}>… ; null → « — » ; 'both' = « 30 sept. 2026, 14:03 · il y a 3 min »

// entity-chip.tsx
export type AdminEntityRef = {
  readonly kind: AdminEntityKind;
  readonly id: string;
  readonly label: string;                 // déjà résolu par § 3 (personLabel, conversationLabel…)
  readonly secondary?: string | null;
  readonly avatarUrl?: string | null;
  readonly presence?: UserPresenceStatus;
  readonly deleted?: boolean;             // barré + « supprimé »
};
export function AdminEntityChip(p: { readonly language: InterfaceLanguage; readonly entity: AdminEntityRef; readonly size?: 'sm' | 'md' }): JSX.Element;
// avatar/glyphe + label + secondaire ; LIEN vers la fiche dans l'espace courant si reach.opens(section), sinon étiquette
export function AdminEntityLink(p: { readonly entity: AdminEntityRef; readonly children?: ReactNode; readonly className?: string }): JSX.Element;
export function AdminLink(p: { readonly target: AdminTarget; readonly children: ReactNode; readonly className?: string; readonly style?: CSSProperties; readonly anchor?: string; readonly ariaLabel?: string }): JSX.Element;
// switch EXHAUSTIF sur la clé de route → <Link to params search>, aucune assertion de type

// badges.tsx
export function AdminBadge(p: { readonly tone: AdminTone; readonly children: string; readonly glyph?: AdminGlyphName; readonly anchor?: string }): JSX.Element;
export function AdminInterpretedBadge(p: { readonly value: Interpreted }): JSX.Element; // title = explain ; data-admin-raw = code brut (ancre de test, jamais visible)
export function AdminRoleBadge(p: { readonly language: InterfaceLanguage; readonly role: string | null }): JSX.Element;
export function AdminLanguageBadge(p: { readonly language: InterfaceLanguage; readonly code: string | null }): JSX.Element; // nom de langue, jamais « ES »

// confirm-sheet.tsx — tout geste destructif ou sensible passe par elle
export function AdminConfirmSheet(p: {
  readonly language: InterfaceLanguage;
  readonly title: string;
  readonly body: string;                  // ce qui va se passer, en une ou deux phrases (effets de bord compris)
  readonly confirmLabel: string;          // le verbe exact : « Fermer le lien », jamais « OK »
  readonly tone: 'danger' | 'primary';
  readonly motive?: { readonly label: string; readonly minLength: number; readonly required: boolean };
  readonly busy: boolean;
  readonly error?: string | null;
  readonly onConfirm: (motive: string | null) => void;
  readonly onCancel: () => void;
}): JSX.Element;                          // Sheet presentation="centered", focus sur le champ motif ou sur Annuler

// states.tsx
export function AdminEmptyState(p: { readonly title: string; readonly hint?: string; readonly glyph?: AdminGlyphName; readonly action?: ReactNode }): JSX.Element;
export function AdminErrorState(p: { readonly language: InterfaceLanguage; readonly message?: string; readonly onRetry: () => void }): JSX.Element; // « Réessayer » 44 px
export function AdminDeniedInline(p: { readonly language: InterfaceLanguage }): JSX.Element;   // un bloc refusé (403) dans un écran ouvert
export function AdminOfflineNotice(p: { readonly language: InterfaceLanguage }): JSX.Element;  // useOnline() faux : données en cache affichées, gestes désactivés
export function AdminInlineNotice(p: { readonly tone: AdminTone; readonly text: string; readonly action?: ReactNode }): JSX.Element;

// tabs.tsx — onglets ARIA (role=tablist, flèches inversées en RTL, ?tab= dans l'adresse)
export function AdminTabs<T extends string>(p: { readonly label: string; readonly tabs: readonly { readonly id: T; readonly label: string; readonly count?: string }[]; readonly active: T; readonly onChange: (tab: T) => void }): JSX.Element;

// section-screen.tsx — LA garde de tout écran de section
export function AdminSectionScreen(p: {
  readonly section: AdminSectionId;
  readonly language: InterfaceLanguage;
  readonly title: string;
  readonly back?: AdminBack;              // défaut : hub de l'espace courant (liste) ; liste de la section (fiche)
  readonly actions?: ReactNode;
  readonly fills?: boolean;
  readonly children: (reach: AdminReach) => ReactNode;
}): JSX.Element;
// identité en vol → squelette ; !reach.opens(section) → AdminDenied ; sinon children(reach) dans AdminScreenFrame heading="content"

// section-directory.tsx
export function AdminSectionDirectory(p: { readonly language: InterfaceLanguage; readonly reach: AdminReach }): JSX.Element;
// groupes titrés, tuiles [data-admin-section={id}] : glyphe + libellé + admin.nav.<id>.hint, liens DANS l'espace courant
```

```ts
// use-admin-reach.ts — lit adminIdentityQueryOptions(apiDeps) (même clé : aucune seconde lecture de la matrice)
export type AdminReach = {
  readonly status: 'pending' | 'ready' | 'denied';
  readonly role: string | null;
  readonly permissions: AdminPermissions | null;
  readonly space: AdminSpace;
  readonly sections: readonly ServedAdminSection[];
  readonly can: (key: AdminPermissionKey) => boolean;
  readonly opens: (section: AdminSectionId) => boolean;   // visible ET prête
  readonly hasAdminRank: boolean;                        // rôle servi BIGBOSS | ADMIN
  readonly isSovereign: boolean;                         // rôle servi BIGBOSS
};
export function useAdminReach(): AdminReach;

// use-admin-list.ts — useAdminListState + useQuery, placeholderData, refetchOnWindowFocus: false
export type AdminPage<Row> = { readonly rows: readonly Row[]; readonly total: number; readonly hasMore: boolean };
export type AdminListController<Row, S extends string, F extends string, I extends string = never> = {
  readonly state: ListState<S, F, I>;
  readonly address: string;
  readonly draft: string;
  readonly setDraft: (q: string) => void;
  readonly query: UseQueryResult<AdminPage<Row>>;
  readonly sort: (key: S) => void;
  readonly filter: (key: F, value: string | null) => void;
  readonly page: (next: { readonly offset?: number; readonly limit?: number }) => void;
  readonly reset: () => void;
};
export function useAdminList<Row, S extends string, F extends string, I extends string = never>(p: {
  readonly spec: ListSpec<S, F, I>;
  readonly queryKey: (address: string) => QueryKey;
  readonly load: (state: ListState<S, F, I>, signal: AbortSignal) => Promise<ApiResult<AdminPage<Row>>>;
  readonly enabled: boolean;
  readonly staleTime?: number;            // défaut 60 s ; listes qui écrivent une trace d'audit à la lecture : 5 min
}): AdminListController<Row, S, F, I>;

// use-admin-action.ts — geste générique : instantané → optimiste → réseau → retour arrière
export function useAdminAction<Result>(p: {
  readonly language: InterfaceLanguage;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;   // useLiveAnnouncer().announce ('neutral' | 'error')
}): {
  readonly state: { readonly phase: 'idle' } | { readonly phase: 'running' } | { readonly phase: 'done'; readonly message: string } | { readonly phase: 'error'; readonly message: string };
  readonly run: (gesture: {
    readonly call: () => Promise<ApiResult<Result>>;
    readonly success: AdminPlainCatalogKey;
    readonly optimistic?: { readonly key: QueryKey; readonly apply: (before: unknown) => unknown };
    readonly invalidate?: readonly QueryKey[];
  }) => Promise<Result | null>;
  readonly reset: () => void;
};
// refus traduits : 403 → admin.kit.refused.permission ; 400 → message servi s'il est une chaîne, sinon admin.kit.refused.invalid ; 409 → admin.kit.refused.conflict ; réseau → admin.kit.refused.network

// list-state.ts — EXTENSION rétrocompatible (troisième générique par défaut `never`)
type ListSpec<S, F, I extends string = never> = { …existant…; readonly idFilters?: readonly I[] };
type ListState<S, F, I extends string = never> = { …existant…; readonly ids: Partial<Record<I, string>> };
// une valeur d'idFilter n'est acceptée que si /^[0-9a-f]{24}$/ ; sinon ignorée (liste blanche)
withIdFilter(state, key, value | null, spec)

// period.ts
export const ADMIN_PERIODS = ['24h', '7d', '30d', '90d'] as const;
export function periodStart(period: (typeof ADMIN_PERIODS)[number], now: Date): string; // ISO, à passer en createdAfter

// api/admin-page.ts — les quatre formes de pagination servies
export function adminPageOf<Row>(
  result: ApiResult<unknown>,
  decodeRow: (raw: unknown) => Row | null,           // une ligne illisible est écartée, jamais « réparée »
  shape: { readonly kind: 'top' } | { readonly kind: 'nested'; readonly key: string } | { readonly kind: 'total-only'; readonly key: string } | { readonly kind: 'page-based' },
): ApiResult<AdminPage<Row>>;
```

Conventions d'ancres (témoins et recettes) : liste `data-admin-list={section}`, rangée `data-admin-row={id}`, fiche `data-admin-fiche={kind}`, carte `data-admin-stat={id}`, graphique `data-admin-chart={id}`, geste `data-admin-action={nom}`, métadonnée `data-admin-meta={clé}`, identifiant `data-admin-technical-id`. Les ancres existantes des écrans servis (`data-admin-section`, `data-admin-nav`, `data-admin-reading-gate`, `data-admin-reason`, `data-admin-conversation-open`, `data-admin-agent-panel`…) sont un CONTRAT des recettes `check-admin-rung` et `check-admin-souverain` : aucun lot ne les renomme.

### 2.4 Graphiques SVG écrits à la main

Aucune dépendance (décision du milestone #101). Règles, héritées d'une méthode de dataviz éprouvée :

1. **Choisir la forme par le travail de la donnée** : un chiffre seul → `AdminStatCard` (pas de graphique) ; évolution dans le temps → `AdminTimelineChart` (ligne 2 px, aire à 12 % sous une série unique) ; comparaison de grandeurs → `AdminBarChart` (barres horizontales dès que les libellés sont des noms) ; parts d'un tout → `AdminShareChart` (`variant: 'bar'` par défaut, barre empilée de 12 px ; `'donut'` seulement pour ≤ 4 parts).
2. **Un seul axe.** Jamais deux échelles verticales : deux mesures d'unités différentes = deux graphiques.
3. **Couleur par la fonction** : une série = `var(--ios-indigo-500)` ; catégories = `ADMIN_SERIES_TOKENS` dans un ORDRE FIXE (`--ios-indigo-500`, `--ios-tile-location`, `--ios-tile-file`, `--ios-tile-voice`), la 5e catégorie et au-delà se replient dans « Autres » (`--ios-neutral-500`) ; la couleur suit l'ENTITÉ, jamais son rang (un filtre ne repeint pas les survivants) ; les couleurs d'état (`success`/`warning`/`danger`) sont RÉSERVÉES aux distributions d'état (qualité d'appel, sévérité) et portent toujours leur mot. La fondation vérifie par un témoin (`chart-palette.test.ts`) que chaque jeton retenu contraste ≥ 3:1 avec `--ios-surface` en clair ET en sombre (valeurs lues dans `packages/design-tokens/ios.css`) ; un jeton qui échoue est retiré de la liste.
4. **Marques fines** : barres aux extrémités de données arrondies 4 px ancrées à la ligne de base, 2 px d'écart de surface entre segments, lignes 2 px, points ≥ 8 px au survol, grille récessive (`var(--color-edge)`), aucune valeur sur chaque point : étiquettes directes sélectives (max, dernière valeur).
5. **Le texte porte les jetons de texte** (`ink`, `ink-2`), jamais la couleur de la série ; la marque colorée à côté porte l'identité.
6. **Accessibilité** : `<figure data-admin-chart>` + `<figcaption>` (titre + UNE phrase de synthèse calculée : « Pic le mardi 29 sept. : 1 240 messages ») ; le `<svg>` est `aria-hidden` ; un bouton « Voir les données » (`admin.kit.chart.showTable`) déplie `AdminChartTable` (`<table>` avec `<caption>`, en-têtes, valeurs formatées) — c'est aussi le chemin clavier et lecteur d'écran ; légende visible dès 2 séries.
7. **Survol** : infobulle au pointeur (ligne verticale + valeurs de la date survolée ; valeur de la barre survolée), cible plus large que la marque ; pas d'infobulle au clavier (le tableau en tient lieu).
8. **États** dans `AdminChartCard` : squelette de même hauteur, vide (« Aucune donnée sur la période »), erreur + Réessayer — jamais un graphique plat qui ferait croire à zéro.
9. **Mesures pures testées** dans `chart-scale.ts` : `linearScale`, `niceTicks(max, count)`, `sparkPath(values, width, height)`, `stackSegments(values)`, `arcPath(start, end, radius, thickness)`, `peakOf(points)`.

```ts
export function AdminTimelineChart(p: {
  readonly language: InterfaceLanguage; readonly id: string; readonly title: string;
  readonly series: readonly { readonly key: string; readonly label: string; readonly points: readonly { readonly x: string /* libellé déjà formaté */; readonly value: number }[] }[]; // ≤ 4
  readonly format: (value: number) => string; readonly summary: string;
}): JSX.Element;
export function AdminBarChart(p: {
  readonly language: InterfaceLanguage; readonly id: string; readonly title: string;
  readonly data: readonly { readonly key: string; readonly label: string; readonly value: number; readonly target?: AdminTarget }[];
  readonly format: (value: number) => string; readonly summary: string; readonly orientation?: 'horizontal' | 'vertical';
}): JSX.Element;
export function AdminShareChart(p: {
  readonly language: InterfaceLanguage; readonly id: string; readonly title: string;
  readonly data: readonly { readonly key: string; readonly label: string; readonly value: number }[];
  readonly format: (value: number) => string; readonly summary: string; readonly variant?: 'bar' | 'donut'; readonly statusTones?: Readonly<Record<string, AdminTone>>;
}): JSX.Element;
export function AdminSparkline(p: { readonly values: readonly number[]; readonly label: string; readonly width?: number; readonly height?: number }): JSX.Element; // role=img aria-label=label
```

### 2.5 La liste d'entités

```ts
export type AdminColumn<Row> = {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly sortKey?: string;              // doit appartenir à spec.sortKeys ; rend SortableTh (aria-sort)
  readonly primary?: true;                // UNE colonne : le NOM, qui porte le lien 44 px vers la fiche
  readonly align?: 'start' | 'end';       // 'end' pour les nombres (tabular-nums)
  readonly priority?: 1 | 2 | 3;          // 1 toujours ; 2 : dans la carte < md ; 3 : seulement ≥ lg
};
export function AdminEntityList<Row, S extends string, F extends string, I extends string = never>(p: {
  readonly language: InterfaceLanguage;
  readonly section: AdminSectionId;       // data-admin-list={section}
  readonly list: AdminListController<Row, S, F, I>;
  readonly columns: readonly AdminColumn<Row>[];
  readonly rowKey: (row: Row) => string;  // data-admin-row={clé}
  readonly rowTarget: (row: Row) => AdminTarget | null;
  readonly caption: string;               // <caption class="sr-only">
  readonly toolbar?: ReactNode;           // AdminListToolbar
  readonly empty: { readonly title: string; readonly hint?: string };
  readonly filteredEmpty: { readonly title: string };   // « Aucun résultat pour ces filtres » + Réinitialiser
  readonly pageSizes?: readonly number[];
}): JSX.Element;
export function AdminListToolbar(p: {
  readonly language: InterfaceLanguage;
  readonly search?: { readonly label: string; readonly value: string; readonly onChange: (q: string) => void };  // absent si la passerelle ne cherche pas
  readonly filters?: readonly { readonly id: string; readonly label: string; readonly value: string; readonly options: readonly AdminOption[]; readonly onChange: (v: string) => void }[];
  readonly onReset?: () => void;          // rendu seulement si un filtre ou une recherche est posé
  readonly trailing?: ReactNode;          // compteur « 1 204 comptes »
}): JSX.Element;
```

Comportement : données absentes + requête en vol → six rangées squelettes ; erreur sans données → `AdminErrorState` ; erreur AVEC données en cache → données + `AdminInlineNotice` (ton `warning`) ; `isPlaceholderData` → `tbody` à 0,6 d'opacité + `aria-busy` ; ≥ `md` : `<table>` ; < `md` : liste de cartes (colonne primaire + colonnes de priorité 2 en `dl`) ; pagination `AdminPager` (existant). Une colonne n'est triable que si la passerelle trie sur ce champ.

### 2.6 La fiche d'entité

```
AdminSectionScreen (garde, cadre, retour vers la liste de l'espace courant)
└ AdminPageHeader (fil d'Ariane Groupe › Section › Nom ; actions principales)
  AdminFiche kind=…
  ├ header : AdminIdentityHeader (avatar/glyphe, VRAI nom, secondaire, badges d'état, gestes)
  ├ stats  : AdminStatStrip (4 à 8 chiffres, chacun lien vers la liste filtrée quand elle existe)
  ├ colonne principale : AdminFicheSection × n (contenu, entités liées nommées, activité, historique)
  └ aside  : AdminMetaPanel « Métadonnées » (AdminMetaRow interprétées) + AdminTechnicalId en dernier
```

Gestes : un bouton = un effet servi ; désactivé hors ligne ; toute écriture passe par `useAdminAction` (optimiste si l'état se lit localement, sinon invalidation) ; tout geste destructif ou sensible passe par `AdminConfirmSheet` ; le résultat est annoncé (`AdminAnnouncement`, région vivante).

### 2.7 Liens d'entité et espaces

`AdminTarget = { kind: 'section'; section: AdminSectionId; search?: Record<string, string> } | { kind: 'entity'; entity: AdminEntityKind; id: string; search?: Record<string, string> }`. `AdminLink` résout la clé dans l'espace courant (`adminSpaceOf(useOptionalRoute()?.key)`), refuse (rend du texte) si `reach.opens` est faux. Les tuiles du hub et les retours passent par lui : le défaut D-76 (tuiles de `/adm` menant à `/admin`, retour `back="admin"` depuis `/adm`) disparaît.

### 2.8 Le cadre et le menu groupé (fondation)

`AdminScreenFrame`/`AdminNav` rendent les groupes : un titre de groupe `text-caption font-semibold uppercase` (`ink-3`), masqué en rail replié (remplacé par un séparateur), puis ses sections (glyphe `AdminGlyph` 18 px + libellé, entrée active teintée `brand` 12 %). `Back` devient `AdminBack = 'list' | AdminListRouteKey` (toutes les clés de liste des deux espaces), dérivé de la table § 1.4. La surbrillance (`activeAdminSectionId`) et `EN_ADM` sont dérivés de la même table : une fiche garde sa section active.

### 2.9 Le hub (fondation)

`routes/admin.tsx` : `AdminPageHeader` (titre « Administration », sous-titre = rôle servi interprété — fini « Votre rôle : BIGBOSS »), puis `<AdminDashboardPanel language deps />` importé de `routes/admin-dashboard.tsx` (lot dashboard ; la fondation y déplace les six compteurs actuels), puis `AdminSectionDirectory`. Le hub garde `data-admin-section={id}` sur chaque tuile.

### 2.10 Persistance (fondation)

`souverain.ts` gagne `estClefNonPersistable(key)` : vrai pour toute clé dont le premier segment est `'admin'` ou `ADMIN_SOUVERAIN_PREFIXE`, SAUF `['admin', 'permissions']` (la matrice du lecteur, qui rend le menu flottant instantané au démarrage à froid). `persistableQuery` l'utilise. Les données d'administration restent cache-first EN MÉMOIRE (staleTime) et ne touchent plus `localStorage['meeshy.query-cache']`. Les données très sensibles (journal d'audit, révélation, sessions, événements de sécurité) gardent en plus le préfixe souverain et `gcTime: 0`.

### 2.11 Témoins communs

`test-support/admin-assertions.ts` :
- `expectNoRawIdentifiers(host: Element)` : échoue si un nœud texte hors `[data-admin-technical-id]` contient `/\b[0-9a-f]{24}\b/`, un horodatage ISO `/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/`, `true`/`false` isolés, ou une énumération en capitales connue (`BIGBOSS`, `MODERATOR`, `DRAFT`, `SENDING`, `under_review`…).
- `adminIdentityFixture({ role, permissions? })` : la matrice des DIX clés (toutes vraies par défaut pour BIGBOSS) prête pour `appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, …)`.

---

## 3. La bibliothèque d'interprétation

### 3.1 Principes

- Fonctions PURES, `language: InterfaceLanguage` explicite, `now: Date` injecté pour tout relatif (témoins déterministes).
- Une valeur absente se dit (« — », « Non renseigné », « Jamais »… selon le sens), jamais `null`/`undefined`/`Invalid Date`.
- Une énumération inconnue rend `{ label: 'Non reconnu', tone: 'neutral', explain: null, raw }` : le code brut ne vit que dans `raw` (attribut `data-admin-raw`, jamais peint).
- Toute clé de libellé vit dans le fragment `kit` du catalogue (§ 7.2) sous `admin.value.*` et `admin.enum.*`.

### 3.2 Fonctions (fichiers sous `apps/web/src/lib/admin/interpret/`)

| Fichier | Fonction | Rend |
|---|---|---|
| `types.ts` | `type AdminTone`, `type Interpreted = { label; tone; explain: string \| null; glyph?: AdminGlyphName; raw: string }`, `type AdminMoment = { iso; absolute; relative; date }` | |
| `time.ts` | `adminMomentOf(iso, now, language)` | `AdminMoment \| null` (absolu `dateStyle: 'medium', timeStyle: 'short'`, relatif `Intl.RelativeTimeFormat` numeric auto via `classifyRelativeTime`) |
| | `adminDate(iso, language)` / `adminDayLabel('YYYY-MM-DD', language)` | « 30 sept. 2026 » / « mar. 29 sept. » (jour lu en UTC : les séries servies sont en jours UTC) |
| | `dayLabelsEndingToday(count, now, language)` | libellés des N derniers jours, par POSITION (séries servies avec des libellés fr) |
| | `hourLabel(hour, language)` / `weekdayName(index /* 0 = dimanche */, language)` | « 14 h » / « mardi » |
| | `formatDuration(value, unit: 'ms' \| 's', language)` | « 850 ms », « 12 s », « 3 min 05 s », « 2 h 05 min », « 3 j 4 h » |
| `numbers.ts` | `formatCount(n, language)` / `formatCompact(n, language)` | « 12 408 » / « 12,4 k » ; `null` → « — » |
| | `formatPercent(value, scale: 'ratio' \| 'hundred', language, digits = 0)` | normalise T5 : `ratio` 0–1, `hundred` 0–100 |
| | `formatBytes(bytes, language)` | unité auto (octet → gigaoctet), `Intl.NumberFormat` `style: 'unit'` |
| | `formatMoney(usd, language)` | `style: 'currency', currency: 'USD'` |
| | `deltaRatio(current, previous)` | `number \| null` (précédent 0 → `null`, jamais Infinity) |
| `language.ts` | `languageName(code, language)` | `Intl.DisplayNames([language], { type: 'language' })`, repli nom natif (`getLanguageInfo`), `null` → « Aucune » ; JAMAIS un code |
| | `countryName(code, language)` | `Intl.DisplayNames` `type: 'region'`, repli « Pays inconnu » |
| | `platformLabel(code, language)` | ios → « iPhone / iPad », android → « Android », web → « Navigateur », desktop… |
| `labels.ts` | `personLabel({ displayName, username, firstName, lastName }, language)`, `personSecondary(username)` → `@username`, `personInitials(label)` | règle § 1.4 |
| | `conversationLabel({ title, type, participants }, language)` | règle § 1.4 |
| | `shareLinkLabel`, `trackingLinkLabel`, `postLabel`, `reportLabel`, `invitationLabel` | règle § 1.4 |
| | `booleanPhrase(value, { yes, no, unknown? }, language)` | phrase propre au champ (« Les invités peuvent écrire » / « … ne peuvent pas écrire ») |
| `enums.ts` | les interprètes du tableau § 3.3, chacun `(code: string \| null, language) => Interpreted` | |
| | `accountStateOf({ isActive, deletedAt, deactivatedAt, lockedUntil, activeBan }, now, language)` | un seul état prioritaire : supprimé > banni > verrouillé > désactivé > actif, avec explication |
| | `shareLinkStateOf({ isActive, expiresAt, maxUses, currentUses }, now, language)` | fermé > expiré > quota atteint > actif |
| | `trackingLinkStateOf({ isActive, expiresAt }, now, language)` | désactivé > expiré > actif |

### 3.3 Énumérations (clés `admin.enum.<famille>.<code>`, valeurs fr ; `.explain` quand le sens n'est pas évident)

| Famille (interprète) | Codes → libellé fr (ton) |
|---|---|
| `role` (`interpretRole`) | BIGBOSS Créateur (brand, « Tous les droits, y compris les gestes souverains ») · ADMIN Administrateur (brand) · MODERATOR Modérateur (info) · AUDIT Auditeur (info, « Lit les journaux et les statistiques, ne modifie rien ») · ANALYST Analyste (neutral) · USER Membre (neutral) ; alias MODO→MODERATOR, CREATOR→ADMIN, MEMBER→USER |
| `accountState` | active Actif (success) · deactivated Désactivé (warning, « Ne peut plus se connecter ; ses données sont conservées ») · deleted Supprimé (danger, « Suppression douce : restaurable ») · banned Banni (danger) · locked Verrouillé (warning, « Trop de tentatives de connexion ») |
| `conversationType` | direct Conversation privée · group Groupe · public Publique · global Espace global · broadcast Canal de diffusion |
| `conversationState` | active Active (success) · archived Archivée (neutral) · closed Fermée à l'écriture (warning) |
| `participantRole` | creator Créateur · admin Administrateur · moderator Modérateur · member Membre |
| `writeRole` | everyone Tout le monde · member Membres · moderator Modérateurs et plus · admin Administrateurs et plus · creator Créateur seulement |
| `encryption` | e2ee Chiffrée de bout en bout (« Le serveur ne lit pas les messages ; pas de traduction automatique ») · server Chiffrée sur le serveur · hybrid Hybride · none Non chiffrée |
| `messageType` | text Texte · image Image · file Fichier · audio Message vocal · video Vidéo · location Position · system Message système |
| `reportStatus` | pending En attente (warning) · under_review En cours d'examen (info) · resolved Résolu (success) · rejected Rejeté (neutral) · dismissed Classé sans suite (neutral) |
| `reportType` | spam Indésirable · inappropriate Contenu inapproprié · harassment Harcèlement · violence Violence · hate_speech Discours de haine · fake_profile Faux profil · impersonation Usurpation d'identité · other Autre motif |
| `reportedEntity` | message Message · user Membre · conversation Conversation · community Communauté · post Publication · story Story · comment Commentaire · sound Son |
| `reportAction` | none Aucune action · warning_sent Avertissement envoyé · content_removed Contenu retiré · user_suspended Membre suspendu · user_banned Membre banni (explain commun : « Consigné : ce libellé ne déclenche rien par lui-même ») |
| `broadcastStatus` | DRAFT Brouillon (neutral) · TRANSLATING Traduction en cours (info) · READY Prête à l'envoi (brand) · SENDING Envoi en cours (info) · SENT Envoyée (success) · FAILED Échec (danger) |
| `postType` | POST Publication · REEL Reel · STORY Story · STATUS Statut |
| `postVisibility` | PUBLIC Publique · FRIENDS Amis · COMMUNITY Communauté · PRIVATE Moi seul · EXCEPT Amis sauf certains · ONLY Certains amis |
| `postState` | published Publiée (success) · deleted Retirée (danger) · expired Expirée (neutral, stories) |
| `invitationStatus` | pending En attente (warning) · accepted Acceptée (success) · rejected Refusée (neutral) |
| `shareLinkState` | active Actif (success) · expired Expiré (neutral) · exhausted Quota atteint (warning) · closed Fermé (danger) |
| `trackingLinkState` | active Actif · inactive Désactivé · expired Expiré |
| `trackingTarget` | POST Publication · REEL Reel · STORY Story · STATUS Statut · CONVERSATION Conversation · PROFILE Profil · EXTERNAL Site externe |
| `redirectStatus` | pending En attente de confirmation · confirmed Redirection réussie (success) · failed Redirection échouée (danger) |
| `severity` | LOW Faible · MEDIUM Moyenne (warning) · HIGH Élevée (danger) · CRITICAL Critique (danger) |
| `securityStatus` | SUCCESS Réussi · FAILED Échoué (warning) · BLOCKED Bloqué (danger) |
| `serviceStatus` | up Opérationnel (success) · down Hors service (danger) · unknown Inconnu (neutral) |
| `circuitState` | CLOSED Normal (success, « Les appels passent ») · OPEN Coupé (danger, « Les appels sont refusés le temps que le service se rétablisse ») · HALF_OPEN En essai (warning) |
| `callQuality` / `translationQuality` | excellent Excellente · good Bonne · fair Moyenne · poor Mauvaise (tons d'état) |
| `activityBucket` (par POSITION 0–3) | Très actifs · Actifs · Occasionnels · Inactifs |
| `friendStatus` (contacts de la fiche) | pending En attente · accepted Amis · rejected Refusée · blocked Bloqué |
| `presence` | online En ligne · away Absent · idle Inactif · offline Hors ligne · unknown Non communiquée (jamais « jamais actif ») |

Le vocabulaire des ACTIONS D'AUDIT et des familles propres à un écran (motifs de fin d'appel, critères de classement, catégories de préférences) appartient au lot de l'écran (§ 5), dans son propre fragment.

### 3.4 Pièges de données servies, et leur traitement unique

| Piège | Traitement |
|---|---|
| `dashboard.topLanguages`, `usersByRole`, `messagesByType` sont des bouche-trous | JAMAIS affichés ; langues et types viennent d'`analytics*`/`languagesStats` |
| `dashboard.totalInvitations` compte des `CommunityMember` | JAMAIS affiché |
| `analyticsKpis.avgSessionTime` et `peakHours` codés en dur | JAMAIS affichés ; le pic vient de `messagesTrends.peakHour` |
| Libellés fr côté serveur (`user-distribution.name`, `volume-timeline.date`, jours de `messages/trends`, `hourly-activity.hour`) | lus par POSITION/indice, re-libellés dans la langue d'interface ; couleurs `color` servies ignorées |
| Unités hétérogènes (0–1 vs 0–100) | `formatPercent(value, scale)` avec l'échelle écrite au site d'appel, testée |
| `communities._count.members` inclut les départs | le lot passerelle sert `activeMemberCount` ; à défaut « membres (départs compris) » |
| `reports` : `resolvedAt` absent pour `dismissed`, `actionTaken` ne fait rien | expliqué dans la fiche ; la durée moyenne est dite « hors dossiers classés sans suite » |
| Recherche des comptes sans `displayName` | corrigée par le lot passerelle (§ 6.8) |
| `invitations?communityId=` : colonne inexistante | filtre JAMAIS dessiné |
| `agent/configs` pagine par page | `adminPageOf(…, { kind: 'page-based' })` |
| Présence masquée ⇒ `isOnline: false`, `lastActiveAt: null` | « Non communiquée », jamais « Hors ligne depuis toujours » |

---

## 4. Le tableau de bord « vue de dieu »

`routes/admin-dashboard.tsx` exporte `AdminDashboardPanel({ language, deps = apiDeps, now? })`, monté par le hub. Chaque bloc est gardé par la capacité de SA route (masqué sinon), a son propre squelette, son erreur + Réessayer, et ne bloque jamais les autres. Chaque carte mène à sa liste FILTRÉE. Clés de requête `['admin', 'dash', …]` (non persistées).

| Zone | Bloc | Contenu interprété | Endpoint (export de `@meeshy/shared/api/endpoints/admin`) | Capacité | Cible |
|---|---|---|---|---|---|
| En ce moment | 3 cartes temps réel | En ligne maintenant · Messages dans la dernière heure · Conversations actives (1 h) ; rafraîchi toutes les 60 s tant que l'onglet est visible | `analyticsRealtime` | `canViewAnalytics` | Statistiques |
| Plateforme | 8 cartes | Comptes (+ « N nouveaux en 24 h ») · Comptes actifs (« X % des comptes ») · Participants anonymes (actifs) · Messages (+24 h) · Nouvelles conversations (24 h) · Communautés · Liens de partage actifs (« sur N ») · Administrateurs | `dashboard` (`statistics`, `recentActivity`) | `canAccessAdmin` | users, users?isActive=true, anonymous, analytics?tab=messages, conversations, communities, share-links?isActive=true, users?role=ADMIN |
| Santé de l'usage | 4 cartes taux (période 30 j) | Taux d'engagement · Croissance (delta) · Messages par compte · Taux de comptes actifs | `analyticsKpis` | `canViewAnalytics` | Statistiques |
| Tendances | Volume des messages (7 j) | courbe, libellés de jours par position | `analyticsVolumeTimeline` | `canViewAnalytics` | analytics?tab=messages |
| | Activité par tranche de 3 h | barres, 8 tranches | `analyticsHourlyActivity` | `canViewAnalytics` | analytics |
| | Engagement des comptes | parts : très actifs / actifs / occasionnels / inactifs | `analyticsUserDistribution` | `canViewAnalytics` | analytics |
| | Langues des messages | 6 langues NOMMÉES + Autres | `analyticsLanguageDistribution` (`limit=6`) | `canViewAnalytics` | languages |
| | Types de messages (7 j) | parts nommées | `analyticsMessageTypes` (`period=7d`) | `canViewAnalytics` | analytics?tab=messages |
| À traiter | File de modération | En attente · En cours d'examen · délai moyen de résolution ; 5 derniers signalements (entité nommée, motif, reçu il y a…) | `reportsStats`, `reportsRecent` (`limit=5`) | `canModerateContent` | reports?status=pending, fiche du signalement |
| | Diffusions en cours | nom, progression envoyés/destinataires | `broadcasts` (`status=SENDING`) | `canManageNotifications` | fiche de la diffusion |
| Personnes et échanges | Derniers inscrits | 5 comptes : avatar, nom, @username, inscrit il y a… (staleTime 5 min : chaque lecture de liste écrit `VIEW_USER_LIST`) | `users` (`sortBy=createdAt&sortOrder=desc&limit=5`) | `canManageUsers` | fiche membre |
| | Conversations les plus actives (7 j) | 5 conversations nommées, nombre de messages | `ranking` (`entityType=conversations&criterion=message_count&period=7d&limit=5`) | `canViewAnalytics` | fiche conversation (si rang admin) |
| | Membres les plus actifs (7 j) | 5 membres, messages envoyés | `ranking` (`entityType=users&criterion=messages_sent&period=7d&limit=5`) | `canViewAnalytics` | fiche membre |
| Système | Santé | Base de données, Redis (état + latence), connexions temps réel, coupe-circuits ouverts | `monitoring` (lot passerelle) | `canViewAnalytics` + rang admin | Supervision |
| | Agent | configurations actives, messages publiés, dernière activité | `agentStats` | `canManageAgent` | Agent |

Non dessiné, faute de donnée servie : « communautés les plus actives » (aucun classement de communautés), durée moyenne de session, heures de pointe codées en dur.

---

## 5. Les sections

Pour chaque section : liste (colonnes · filtres · tri · recherche), fiche, gestes, endpoints, capacités de bloc. Un lot peut ajouter une colonne si le champ est servi ; il n'en invente aucune.

### 5.1 Comptes, fiche membre, anonymes (lot personnes — #8005, #8004, #7920)

**Liste `/admin/users`** — `users` (V2 imbriquée `users`) : Membre (`AdminEntityChip` : avatar, nom, `@username`, présence via `Avatar presence` — plus de `#34D399`) · E-mail (tel que servi, masqué pour les rôles qui le reçoivent masqué) · Rôle (`AdminRoleBadge`) · État (`accountStateOf`) · Sécurité (icônes + mots : e-mail vérifié, téléphone vérifié, 2FA) · Inscription (relatif, absolu en titre) · Dernière activité (« Non communiquée » si masquée). Filtres : rôle, état actif, e-mail vérifié, téléphone vérifié, 2FA, période d'inscription (`createdAfter` via `periodStart`). Tri : `createdAt`, `lastActiveAt`, `username`, `email`, `firstName`, `lastName`. Recherche : nom affiché compris (§ 6.8). staleTime 5 min. Geste d'en-tête existant « Créer un compte ».

**Fiche `/admin/users/$user`** — conserve ses onglets et ses sections éditables, alignés sur le kit : `AdminIdentityHeader` (avatar, vrai nom, `@username`, rôle, état, badges vérifié/2FA), `AdminStatStrip` des chiffres (`usersByUserIdStats` : messages envoyés, conversations, publications, stories, reels, commentaires, réactions données, médias, amis, demandes reçues/envoyées, signalements faits/reçus, sessions actives, communautés), `AdminMetaPanel` interprété :
- Identité et langues : les trois rangs du Prisme NOMMÉS (`languageName`), fuseau horaire, pays d'inscription (`countryName`), complétude du profil (%) ;
- Métadonnées de compte (#8005, bloc `adminMetadata` servi par § 6.8, visible seulement s'il est servi) : langue de l'appareil, pays de l'appareil, date de naissance → âge, âge vérifié le…, consentements (profil vocal, données vocales, traitement des données, analytique, clonage vocal) chacun « Donné le … » / « Non donné », conditions acceptées (version + date), onboarding terminé le…, série en cours / record (jours), score d'engagement, solde de meesh, comptes bloqués (nombre), changement d'e-mail / de téléphone en attente (oui/non, jamais la valeur ni son jeton) ;
- Connexions (bloc sensible, servi aux seuls BIGBOSS/ADMIN) : dernière connexion (lieu, appareil interprétés), inscription (lieu, appareil), tentatives échouées, verrou jusqu'à…, dernier changement de mot de passe ; codes de secours 2FA : NOMBRE restant (§ 6.8), jamais les empreintes ;
- Compteurs de liens (`_count`) : liens de partage, liens de suivi, jetons d'affiliation, parrainages, demandes d'amitié envoyées/reçues ;
- `AdminTechnicalId`.
Onglet Préférences (#7920) : chaque clé des sept catégories sous un libellé traduit (`lib/admin/preference-labels.ts`, clés `admin.people.pref.<catégorie>.<clé>`), valeur interprétée (booléens en mots, énumérations nommées, nombres avec unité : vitesse ×, jours, octets, heures « ne pas déranger »). Témoin : chaque clé de `*_PREFERENCE_DEFAULTS` (`packages/shared/types/preferences/*`) a un libellé fr ; repli sur un libellé humanisé, jamais la clé brute.
Gestes (#8004), dans la section Sécurité, proposés seulement s'ils ont un effet, chacun confirmé :
- « Déverrouiller le compte » (seulement si `lockedUntil` est futur) → `usersByUserIdSecurity` PATCH `{ unlock: true, reason? }` ;
- « Retirer la double authentification » (seulement si armée) → même route `{ twoFactorEnabled: false, reason }` ;
- Vérifications e-mail / téléphone / âge (poser ou retirer) → `usersByUserIdVerifications` PATCH ;
- Consentements (rang souverain seulement, motif ≥ 10) → `usersByUserIdConsents` PATCH.
Bannissements : `bannedBy`/`liftedBy` NOMMÉS (§ 6.8) ; « Système » pour la levée automatique. Lien « Journal de ce membre » → `/admin/audit?subject=<id>` si `reach.opens('audit')`.

**Anonymes** — liste : Nom (chip) · Conversation (chip conversation) · Langue (NOM) · Messages · État · Présence · Arrivée · Dernière activité ; filtres état ; tri `joinedAt`, `lastActiveAt`, `displayName` ; recherche nom. Fiche : identité, conversation (chip), lien d'entrée (chip → fiche du lien de partage), permissions en phrases (« Peut envoyer des fichiers » / « Ne peut pas… », jamais `canSendFiles`), dates, identifiant technique. Aucun geste servi (kick/ban : issue de suivi).

### 5.2 Demandes de contact (lot liens)

`invitations` (V2 imbriquée `invitations`). Bandeau : `invitationsStats` (total, en attente, acceptées, refusées, 7 derniers jours, taux d'acceptation `hundred`) + `invitationsTimelineDaily` (3 séries envoyées / acceptées / refusées, jours UTC réels). Liste : Expéditeur (chip) · Destinataire (chip) · Statut · Message joint (oui/non — le texte seulement dans la fiche) · Envoyée · Mise à jour. Filtres : statut ; `senderId` (idFilter, depuis une fiche membre). Pas de recherche ni de tri (non servis). Fiche `invitationsById` : deux cartes personnes, statut, message, dates, identifiant technique. Geste unique : « Annuler la demande » (seulement `pending`) → `invitationsById` PATCH `{ status: 'rejected' }`, confirmé, audité (§ 6.10). Passer une demande à « acceptée » n'est PAS offert : la route écrit un statut brut sans créer d'amitié (décision § 9).

### 5.3 Conversations et agent (lot conversations-agent)

**Liste** `conversations` (V1) : Conversation (chip : avatar, `conversationLabel`, pile de 6 avatars de membres) · Type · Communauté (chip, § 6.6) · Membres · État (active / archivée / fermée) · Création · Dernier message (relatif). Filtres : type, état actif, période de création ; recherche (titre ou identifiant, servie). Tri `lastMessageAt`, `createdAt`.
**Fiche** `/admin/conversations/$conversation` : `conversationsByConversationId` GET (§ 6.6) → en-tête (avatar, nom, type, état, chiffrement), bandeau (membres, messages, liens de partage, agent actif oui/non), métadonnées interprétées (rôle d'écriture par défaut, canal d'annonces, mode lent en durée, traduction automatique, mode de chiffrement + explication, communauté, fermée le … par {nom}, créée, mise à jour), membres (`conversationsByConversationIdParticipants` : noms, rôles, présence, arrivée ; gestes existants « Changer le rôle » / « Retirer », motif ≥ 10), bloc « Lire la conversation » (lecture souveraine existante, ancres inchangées), feuille « Configurer » existante, pilotage de l'agent existant.
**Agent** : `AdminAgentPanel` aligné sur le kit (cartes, sections, états) ; les membres pilotés restent désignés par leur NOMBRE hors de la vue « en direct » (seule `agentConfigsByConversationIdLive` résout les noms) ; les remises à zéro non auditées ne sont PAS exposées.

### 5.4 Communautés (lot contenus)

Liste `communities` (étendue § 6.5) : Communauté (avatar, nom, identifiant public en secondaire) · Visibilité (privée/publique) · Membres actifs · Conversations · Créée par (chip) · État (active/désactivée) · Création. Filtres : visibilité, état ; recherche (nom, identifiant, description) ; tri `createdAt`, `name`.
Fiche `communitiesByCommunityId` : bannière + en-tête, bandeau (membres actifs, départs, conversations, publications), description, créateur, équipe (administrateurs et modérateurs nommés), conversations (≤ 20, chips → fiches), onglet Membres (`communitiesByCommunityIdMembers` : recherche, rôle, actif ; chip → fiche membre), métadonnées, identifiant technique. Gestes → `communitiesByCommunityId` PATCH, motif ≥ 10, confirmés : « Désactiver la communauté » (explication : retirée des listes et de la recherche, plus personne ne la rejoint ; ses conversations restent) / « Réactiver » ; « Rendre privée » / « Rendre publique ».

### 5.5 Liens de partage (lot liens)

Liste `shareLinks` (V1) : Lien (`shareLinkLabel`) · Conversation (chip) · Créé par (chip) · Utilisations (« 12 sur 50 » / « 12, sans limite ») · Invités arrivés · État (`shareLinkStateOf`) · Expire (relatif) · Création. Filtres : état actif ; recherche (nom seul, jamais le secret). Tri non servi → non dessiné.
Fiche `shareLinksById` GET (§ 6.7) : conversation, créateur, usage (utilisations, simultanés, sessions uniques), ce que peuvent les invités en PHRASES (écrire, envoyer fichiers, images, voir l'historique), exigences (compte, pseudonyme, e-mail, date de naissance), restrictions (pays et langues NOMMÉS), invités récents (chips → fiches anonymes), dates, identifiant technique. Gestes : « Fermer le lien » (`shareLinksById` DELETE, confirmé : « les invités arrivés par ce lien perdent l'accès ») ; « Rouvrir » (PATCH `{ active: true }`) ; « Révéler le secret » (rang souverain seulement, `shareLinksByIdReveal`, motif ≥ 10 ; résultat affiché UNE fois dans une feuille avec copie, jamais mis en cache — mutation seulement).

### 5.6 Publications, stories, reels, statuts (lot contenus)

Bandeau `postsStats` (période aujourd'hui / semaine / mois) : total, retirées, par type (parts nommées), auteurs les plus actifs (chips), tendances (chips de publications). Onglets de type (Toutes · Publications · Stories · Reels · Statuts = filtre `type`).
Liste `posts` (V1) : Auteur (chip) · Extrait (≤ 120 caractères ; audience restreinte PRIVATE/ONLY/EXCEPT → « Contenu à audience restreinte » dans la LISTE ; story sans texte → « Story · 2 médias ») · Type · Visibilité · Réactions · Commentaires · Vues · État (publiée / retirée / expirée) · Publiée (relatif). Filtres : type, visibilité, état (`isDeleted`), épinglée, période ; `authorId` (idFilter) ; recherche (contenu, servie). Tri non servi.
Fiche `postsByPostId` : auteur, type/visibilité/état, contenu + langue NOMMÉE + nombre de traductions, médias (vignettes, légendes), compteurs (j'aime, commentaires, partages, vues, enregistrements, repartages), communauté (chip), repartage de (chip), story : expire le…, derniers spectateurs (noms), derniers commentaires (auteur + texte), humeur. Jamais `geoPoint` ni `visibilityUserIds` (seulement « visible par N personnes »). Geste : « Retirer la publication » (`postsByPostId` DELETE, motif demandé ≥ 3, confirmé). Pas de restauration (non servie).

### 5.7 Signalements (lot modération — #6726, #6843)

Bandeau `reportsStats` : en attente, en cours d'examen, résolus, rejetés, classés, délai moyen de résolution (`formatDuration`, « hors dossiers classés sans suite »), chacun filtre la liste.
Liste `reports` (V2 imbriquée `reports`, enrichie § 6.4) : Signalé (chip de l'entité : genre + nom + propriétaire ; « supprimé » barré) · Motif (`reportType`) · Statut · Signalé par (chip, ou nom d'expéditeur anonyme) · Modérateur (chip ou « Non assigné ») · Reçu · Résolu. Filtres : statut, motif, genre d'entité, assignation (à moi / personne), période ; `reportedEntityId` (idFilter). Tri `createdAt`, `updatedAt`, `resolvedAt`. Pas de recherche (non servie).
Fiche `reportsById` : en-tête « Signalement · {motif} » + statut ; carte de l'entité signalée (chip → sa fiche ; extrait conscient de la protection : protégé → « Contenu protégé », jamais vide), signalant, raison libre, modérateur, notes, action consignée (+ explication « ne déclenche rien »), chronologie (reçu → pris en charge → résolu), autres signalements de la même entité (`reportsEntityByTypeById`, noms). Gestes (`reportsById` PATCH, audités § 6.10) : « Prendre en charge » (`reportsByIdAssign`) · « Résoudre » (feuille : action consignée + notes → `resolved`) · « Rejeter » · « Classer sans suite » · « Rouvrir » (→ `pending`) · « Supprimer le signalement » (DELETE, confirmé). Gestes qui AGISSENT : liens vers la fiche concernée (bannir un membre, retirer une publication, lire la conversation) — le signalement ne duplique aucun client d'une autre section.

### 5.8 Journal d'audit (lot audit-reglages — #6727)

Liste `auditLogs` (§ 6.2, V1, préfixe souverain, `gcTime: 0`) : Quand · Administrateur (chip) · Action (vocabulaire du lot : libellé + glyphe + ton ; lectures souveraines signalées « Lecture souveraine ») · Cible (chip nommée) · Motif (extrait). Filtres : famille d'actions (lectures souveraines, comptes, rôles, bannissements, conversations, liens, publications, diffusions, agent, signalements → listes de codes `action`), genre de cible, période ; `admin`, `subject` (idFilters, depuis une fiche membre). Tri : date (asc/desc). Détail en FEUILLE depuis la rangée (pas de route) : administrateur, sujet, cible, action expliquée, motif, changements (champ traduit, avant → après, secrets masqués), adresse IP et navigateur (seulement s'ils sont servis), identifiant technique.

### 5.9 Réglages (lot audit-reglages — #6732)

`/admin/settings`, `canAccessAdmin`. Trois blocs, chacun avec un effet :
1. **Votre accès** : rôle interprété + explication ; les dix capacités servies dites en mots (« Gérer les comptes — ouvre Comptes, Anonymes, Demandes de contact »), accordées / non accordées ; rang souverain : les gestes qu'il ouvre (révéler un lien, consentements, modèle de l'agent).
2. **Compteurs du tableau de bord** (si `canManageNotifications`) : « Recalculer maintenant » → `dashboardInvalidateCache` POST, puis invalidation de `['admin','dash']` et annonce.
3. **Espace d'administration** : « Menu latéral replié par défaut » (bascule sur `writeSidebarFolded`, commodité par navigateur).
Aucune « configuration de la plateforme » n'est dessinée : aucune ressource ne la sert (décision § 9).

### 5.10 Statistiques et langues (lot statistiques — #6728)

`/admin/analytics?tab=activity|messages|calls` :
- **Activité** : `analyticsKpis` (période 7/30/90 j ; engagement, croissance, messages par compte, comptes actifs — jamais `avgSessionTime`/`peakHours`), `analyticsRealtime`, `analyticsVolumeTimeline`, `analyticsHourlyActivity`, `analyticsUserDistribution`, `analyticsMessageTypes` (période 24 h / 7 j / 30 j).
- **Messages** : `messagesStats` (période 24 h / 7 j / 30 j / 90 j : total, supprimés, modifiés, longueur moyenne, traduits %, avec pièces jointes %, par type, par jour, 10 auteurs les plus actifs en chips → fiches), `messagesTrends` (heure et jour de pointe par INDICE, 24 barres horaires, 7 barres de jours), `messagesEngagement` (7/30 j : taux de réaction, de réponse, moyennes). Aucun contenu.
- **Appels** : `analyticsCalls` (7/30/90 j) : appels, part vidéo, taux de connexion, d'échec, temps d'établissement, durée moyenne, reconnexions, RTT, pertes, qualité (tons d'état), par plateforme (NOMMÉE), par motif de fin (libellés du lot), avis (note moyenne, distribution, problèmes signalés) ; `sampled` → « Échantillon plafonné à 5 000 appels ».
`/admin/languages` : `languagesStats` (période ; langues NOMMÉES avec messages, auteurs, part, croissance ; paires « français → anglais » avec traductions et confiance `ratio`), `languagesTimeline` (4 langues principales + Autres), `languagesTranslationAccuracy` (confiance `hundred`, qualité), comptes par langue. `translations` et `messages` ne sont JAMAIS appelés.

### 5.11 Classement (lot classement-supervision — #6730)

`ranking` : filtres entité (Membres · Conversations · Messages · Liens de suivi · Liens de partage), critère (libellés du lot, dont « Conversations de groupe créées » pour `communities_created`, qui compte des conversations et non des communautés), période (1 j → toujours), nombre (10/25/50/100). Podium des trois premiers + tableau : rang, chip de l'entité, valeur formatée, dernière activité si servie. Messages (après § 6.9) : « Message de {auteur} dans {conversation} · {date} · {type} », chip → fiche de la conversation — jamais de texte. Liens de partage : nom ou « Lien sans nom », jamais l'identifiant. Pas de tendance ↑↓ (non servie).

### 5.12 Supervision (lot classement-supervision — #6734)

`/admin/monitoring?tab=health|routes`, `canViewAnalytics` + rang admin. **Santé** (`monitoring`, § 6.3, rafraîchi toutes les 30 s tant que visible + « Actualiser ») : cartes Passerelle (en service depuis, mémoire en octets), Base de données et Redis (état + latence), Temps réel (connexions, comptes connectés, messages traités, erreurs), Traduction (demandes, réponses, erreurs, refus pour file pleine, temps moyen, taux de cache, mémoire, en service depuis), Coupe-circuits (nom, état interprété + explication, échecs, dernier échec relatif), Présence (demandes, écrêtées, taux). **Usage des routes** (`routeUsage`, portée surveillées/toutes, recherche de route) : observation depuis, fenêtre, saturation, routes surveillées (méthode + route, issue liée, compte, vue il y a…), entrées (plateforme NOMMÉE, version, compte), angles morts.

### 5.13 Liens de suivi (lot liens — #6729)

Liste `trackingLinks` (§ 6.3) : Lien (`trackingLinkLabel`, URL courte en secondaire) · Campagne / source / support · Cible (genre + chip de l'entité) · Créé par (chip) · Clics (total / uniques) · Dernier clic · État · Création. Filtres : état, genre de cible ; recherche ; tri `createdAt`, `totalClicks`, `uniqueClicks`, `lastClickedAt`.
Fiche `trackingLinksByLinkId` : destination (URL en texte + copie), URL courte (copie), UTM, cible, créateur, agrégats (clics par jour, pays NOMMÉS, appareils, navigateurs, systèmes, sources sociales, référents, redirections réussies/en attente/échouées), 20 derniers clics (pays, ville, appareil, navigateur, système, référent, quand) — jamais d'IP, d'agent utilisateur ni d'empreinte. Gestes : « Désactiver » / « Réactiver » → `trackingLinksByLinkId` PATCH, confirmé, audité.

### 5.14 Diffusions (lot diffusions — #6731)

Liste `broadcasts` (V2 imbriquée `broadcasts`, étendue § 6.8) : Nom · Objet · Statut · Destinataires · Envoyés · Échecs · Dans l'application (envoyés) · Création · Envoi. Filtre statut ; recherche (nom, objet). Action d'en-tête « Nouvelle diffusion » → feuille plein écran : nom, objet, corps, langue source (NOMMÉE), ciblage (activité : tous / actifs / inactifs depuis N jours ; langues et pays NOMMÉS, sélection multiple) → `broadcasts` POST → fiche.
Fiche `broadcastsById` : contenu dans la langue source, traductions par langue (onglets NOMMÉS) après préparation, audience interprétée en une phrase (« Comptes actifs, en français et espagnol, au Sénégal et en France »), livraison e-mail (destinataires, envoyés, échecs, barre de progression, envoyée le…, terminée le…), livraison dans l'application (envoyés, échecs, dates), personnes (créée par, envoyée par, publiée par — § 6.8), erreur si échec. Gestes selon le statut, tous confirmés : Brouillon → « Modifier » (feuille, PUT), « Traduire et préparer l'envoi » (`broadcastsByIdPreview` : traduit, passe à « Prête », affiche le nombre de destinataires par langue et par pays — effet de bord dit AVANT), « Supprimer » ; Prête → « Envoyer par e-mail à N comptes » (`broadcastsByIdSend`), « Publier dans l'application » (`broadcastsByIdSendInapp`), « Supprimer » ; Envoyée → « Publier dans l'application » si pas encore fait ; Envoi en cours → progression rafraîchie toutes les 10 s. Pas d'annulation (non servie).

---

## 6. Le lot passerelle

Une seule personne, en TDD, dans cet ordre (chaque étape = un commit vert). Règles : garde AU NIVEAU DE LA ROUTE (`onRequest`/`preHandler` avec `requirePermission`/`requireAdminRank`/`requireSovereign`), schéma de réponse FERMÉ à propriétés nommées, `sendSuccess`/`sendPaginatedSuccess`, décodage des entrées Zod/AJV, résolution des noms par lot (`user.findMany`, jamais N+1), aucun champ sensible voisin (hash, jeton, empreinte, IP hors droit).

### 6.1 Montage

Nouveau module `services/gateway/src/routes/admin/oversight.ts` (enregistre `audit-logs.ts`, `tracking-links.ts`, `communities-oversight.ts`, `monitoring.ts`), une entrée `ROUTE_TABLE` nommée `admin-oversight`, préfixe `API_PREFIX + '/admin'`, dans `routes/index.ts` ; `route-registration-table.test.ts` passe de 70 à 71 avec un commentaire daté (#8876).

### 6.2 `GET /api/v1/admin/audit-logs` → `auditLogs`

- Garde : `canViewAuditLogs` (BIGBOSS, AUDIT ; ADMIN refusé par la matrice).
- Requête : `offset`, `limit` (défaut 30, max 100), `action` (liste séparée par des virgules, chaque code `^[A-Z_]{2,64}$`), `entity` (User | Conversation | ConversationShareLink | Community | Report | Post | Broadcast | TrackingLink | AgentLlmConfig), `entityId`, `adminId`, `userId` (24 hex), `createdAfter`, `createdBefore` (ISO), `order` asc|desc.
- Réponse V1 : `{ id, action, entity, entityId, createdAt, admin: A|null, subject: A|null, target: { type, id, label: string|null, secondary: string|null }, reason: string|null, changes: [{ field, before: string|null, after: string|null }]|null, ipAddress: string|null, userAgent: string|null }` avec `A = { id, username, displayName, avatar }`.
- `metadata` JSON lu prudemment : `reason` seul. `changes` normalisé depuis ses formes connues (`{ champ: { from, to } }`, `{ before, after }`, tableau) ; valeurs primitives en chaîne ; toute clé `/password|secret|token|hash|code|key/i` → « ••• » ; `email`/`phoneNumber`/`pendingEmail`/`pendingPhoneNumber` masqués sans `canViewSensitiveData` ; illisible → `null`.
- Libellé de cible par genre, en lot : User → sujet ; Conversation → titre ; Community → nom ; ConversationShareLink → nom (jamais identifiant ni `linkId`) ; Post → nom de l'auteur + type ; Broadcast → nom ; Report → motif ; TrackingLink → nom.
- `ipAddress`/`userAgent` servis seulement avec `canViewSensitiveData`.
- Index `@@index([entity, entityId])` ajouté à `AdminAuditLog` (schema.prisma ; l'index de production se crée à la main, dit dans la PR).
- Témoins : AUDIT 200, ADMIN 403, MODERATOR 403, anonyme 401 ; noms résolus ; masquage des secrets et des coordonnées ; IP masquée pour AUDIT ; filtres traduits en `where` ; enveloppe paginée.

### 6.3 Liens de suivi et supervision sous `/admin`

- `GET /admin/tracking-links` → `trackingLinks` : garde `canAccessAdmin` + `canViewAnalytics` ; requête `offset`, `limit`, `search` (nom, jeton, URL, campagne), `isActive`, `targetType`, `createdBy`, `source`, `campaign`, `sort` createdAt|totalClicks|uniqueClicks|lastClickedAt, `order` ; V1 `{ id, token, name, campaign, source, medium, originalUrl, shortUrl, targetType, target: { type, id, label }|null, conversation: { id, title }|null, creator: A|null, totalClicks, uniqueClicks, isActive, expiresAt, lastClickedAt, createdAt }`.
- `GET /admin/tracking-links/:linkId` → `trackingLinksByLinkId` : la ligne + `stats: { confirmedClicks, clicksByDate: [{ date, count }], byCountry, byDevice, byBrowser, byOs, bySocialSource, topReferrers, byRedirectStatus }` (réutilise `TrackingLinkService.getTrackingLinkStats`) + `recentClicks` (≤ 20 : `{ id, country, city, device, browser, os, referrer, socialSource, redirectStatus, clickedAt }`) ; jamais IP, agent utilisateur, empreinte.
- `PATCH /admin/tracking-links/:linkId` : corps `{ isActive: boolean, reason?: string (3–500) }` → `{ id, isActive }` ; `withAudit` `ADMIN_TRACKING_LINK_DEACTIVATED` / `ADMIN_TRACKING_LINK_REACTIVATED`, entité `TrackingLink`.
- `GET /admin/monitoring` → `monitoring` : garde `canAccessAdmin` + `canViewAnalytics` + `requireAdminRank()` ; `{ generatedAt, gateway: { uptimeSeconds, memory: { heapUsed, heapTotal, rss } }, database: { status, latencyMs|null }, redis: { status, latencyMs|null }, realtime: { connections, connectedUsers, messagesProcessed, translationsSent, errors }, translator: { requestsSent, received, errors, poolFullRejections, avgProcessingTimeMs, cacheHitRate, memoryUsageMb, uptimeSeconds }|null, circuitBreakers: [{ name, state, failures, successes, totalRequests, lastFailureAt|null }], presenceUpdates: { totalRequests, throttledRequests, throttleRate, successfulUpdates, failedUpdates }|null }` — composé en appelant les MÊMES sources que `health/metrics`, `health/circuit-breakers`, `socketio/stats`, `status-metrics` (jamais un appel HTTP interne). Ce chemin sous `/admin` ferme l'écart du service worker (S8) sans toucher son motif.

### 6.4 Signalements enrichis (aucun chemin neuf)

`reports`, `reportsById`, `reportsRecent`, `reportsModeratorMine`, `reportsEntityByTypeById` servent en plus `reporter: A|null`, `moderator: A|null`, `reportedEntity: { type, id, label: string|null, owner: A|null, excerpt: string|null, isProtected: boolean, deleted: boolean, conversation: { id, title }|null }` résolus en lot par genre (message → auteur + extrait masqué si protégé + conversation ; user → nom ; conversation → titre ; community → nom ; post/story → auteur + extrait ; comment → auteur + extrait ; sound → titre). `excerpt` seulement pour `canModerateContent` (garde déjà posée). Filtres neufs `reportedEntityId`, `assigned=me|none`. Schéma de réponse FERMÉ. `users/:id/reported-messages` gagne `conversation: { id, title }`.

### 6.5 Communautés

- `GET /admin/communities` étendu (sélection ET schéma) : `isActive`, `deletedAt`, `banner`, `updatedAt`, `activeMemberCount`, `conversationCount` ; filtre `isActive` ; `sort` createdAt|name, `order`.
- `GET /admin/communities/:communityId` → `communitiesByCommunityId` : garde `canAccessAdmin` + `canManageCommunities` ; `{ id, identifier, name, description, avatar, banner, isPrivate, isActive, deletedAt, createdAt, updatedAt, creator: A, activeMemberCount, leftMemberCount, conversationCount, postCount, conversations: [{ id, title, identifier, type, isActive, lastMessageAt, memberCount }] (≤ 20), staff: [{ user: A, role, joinedAt }] (admin + moderator, ≤ 20) }`.
- `GET /admin/communities/:communityId/members` → `communitiesByCommunityIdMembers` : V1 `[{ id, role, joinedAt, isActive, leftAt, user: A }]`, requête `offset`, `limit`, `search` (username, displayName), `role`, `isActive`.
- `PATCH /admin/communities/:communityId` : `{ isActive?: boolean, isPrivate?: boolean, reason: string (≥ 10) }` → la fiche ; désactiver pose `deletedAt`, réactiver le remet à `null` ; `withAudit` `ADMIN_COMMUNITY_UPDATED`, entité `Community`, changements.
- **Loi 4 côté produit** : les lecteurs publics respectent `isActive` — `routes/communities/core.ts` (liste `GET /communities` : `isActive: true` ; détail : 404 pour une communauté désactivée), `routes/communities/search.ts` (`isActive: true`), adhésion refusée (404). Un témoin par lecteur. Sans cela le geste « Désactiver » serait inerte et n'est pas livré.

### 6.6 Conversations

- `GET /admin/conversations/:conversationId` (verbe neuf sur un chemin existant : aucune entrée de catalogue neuve) : mêmes gardes que la liste ; `serveConversationMetadata` + `community: { id, name, identifier }|null`, `closedBy: A|null`, `participantsPreview` (≤ 6, comme la liste), `shareLinkCount`, `agentEnabled`.
- Liste : `community: { id, name }|null`, `closedAt` ajoutés au schéma fermé ; filtre `communityId`.

### 6.7 Lien de partage

`GET /admin/share-links/:id` (verbe neuf, garde `canAccessAdmin` + `canManageConversations`) : la ligne de liste + `maxUniqueSessions`, `currentUniqueSessions`, `requireAccount`, `requireNickname`, `requireEmail`, `requireBirthday`, `allowViewHistory`, `allowedCountries`, `allowedLanguages`, `updatedAt`, `recentGuests: [{ id, displayName, avatar, joinedAt, isActive }]` (≤ 10). JAMAIS `linkId`, `identifier`, `allowedIpRanges`. La garde de distribution des clés d'entrée (`share-link-join-key-distribution-guard`) couvre la nouvelle route.

### 6.8 Noms et métadonnées manquants (aucun chemin neuf)

- `GET /admin/users/:userId` : bloc `adminMetadata` servi seulement avec `canViewSensitiveData`, énuméré champ par champ (jamais un spread) : `deviceLocale`, `deviceCountry`, `birthDate`, `ageVerifiedAt`, `voiceProfileConsentAt`, `voiceDataConsentAt`, `dataProcessingConsentAt`, `analyticsConsentAt`, `voiceCloningEnabledAt`, `termsAcceptedAt`, `termsVersion`, `onboardingCompletedAt`, `currentStreakDays`, `longestStreakDays`, `engagementScore`, `meeshBalance`, `blockedCount` (cardinal de `blockedUserIds`), `hasPendingEmail`, `hasPendingPhone` ; typé dans `packages/shared/types/user.ts` ; témoin : servi à ADMIN, absent pour MODERATOR, aucun jeton `pending*`.
- Toute ligne utilisateur : `twoFactorBackupCodes` n'est PLUS servi, remplacé par `twoFactorBackupCodesRemaining`.
- `GET /admin/users` : la recherche couvre `displayName`.
- `GET /admin/users/:userId/bans` : `bannedBy: A|null`, `liftedBy: A|null`, `liftedBySystem: boolean`.
- Diffusions : `broadcastsById` sert `createdBy`, `sentBy`, `inAppSentBy` (`A|null`) ; `broadcasts` sert en plus `sentAt`, `completedAt`, `sourceLanguage`, `targetLanguages`, `inAppSentCount`, `inAppSentAt`, accepte `search` (nom, objet) et corrige `hasMore` (`offset + rows.length < total`).

### 6.9 Classement durci

`GET /admin/ranking` : les lignes `messages` ne servent plus `content` ni `contentPreview` (même classe que #6919) ; les lignes de liens de partage ne servent plus `identifier` et `name` ne se replie plus sur l'identifiant ni sur `linkId` (`null` si absent). Témoins.

### 6.10 Traces des gestes exposés

`withAudit` sur `PATCH /admin/reports/:id` (`ADMIN_REPORT_UPDATED`, changements de statut / action / notes), `POST /admin/reports/:id/assign` (`ADMIN_REPORT_ASSIGNED`), `PATCH /admin/invitations/:id` (`ADMIN_INVITATION_STATUS_SET`).

### 6.11 Régénération et cliquets

```bash
cd services/gateway && bun run route-manifest:generate
cd packages/shared && bun run api-endpoints:generate && bun run ios-endpoints:generate && bun run build
cd packages/shared && npx prisma generate --generator client
```
- Six chemins neufs (`auditLogs`, `trackingLinks`, `trackingLinksByLinkId`, `communitiesByCommunityId`, `communitiesByCommunityIdMembers`, `monitoring`) : `scripts/check-swift-catalog-dead-entries.mjs` `BASELINE_DEAD_ENTRIES` 279 → 285 (« seul le web d'administration les appelle, comme leurs voisines AdminEndpoint »), `scripts/check-ts-catalog-dead-entries.mjs` 331 → 337 (aucun appelant web à la livraison du lot ; l'intégrateur rabaisse au fil des lots web), chacune avec une ligne datée `N -> M (#8876)`.
- Témoins à faire passer : `route-manifest-ratchet`, `admin-route-level-guard`, `route-auth-coverage`, `response-schema-closure-guard` (+ cliquet des schémas bouchons s'il bouge), `route-registration-table` (71), `no-hardcoded-role-list-guard`, `single-permissions-matrix-guard`, `share-link-join-key-distribution-guard` ; côté shared `npx vitest run api` (`endpoints-manifest-ratchet`, `ios-endpoints-generated-ratchet`, `ops-only-routes`, `build-catalog`, `endpoint-literal-audit`) ; `bash scripts/check-any-debt.sh` (plafond gateway 502, jamais plus) ; budget de taille des fichiers gateway (≤ 1000 lignes par fichier écrit à la main).

---

## 7. Le plan de lots

### 7.1 Phases

1. **Phase 1, en parallèle** : FONDATION (`apps/web` seulement) ‖ PASSERELLE (`services/gateway`, `packages/shared`, `packages/MeeshySDK` généré, cliquets racine). Aucun fichier commun.
2. **Phase 2, en parallèle** (après les deux) : les dix lots de section. Chacun possède un ensemble DISJOINT de fichiers et n'édite aucun fichier partagé.
3. **Intégration** (orchestrateur) : fusion lot par lot, rabaissement des cliquets, mesure du poids, suppression de l'écran d'attente, balayage des clés mortes, recettes navigateur, fermeture des issues, PR.

### 7.2 La fondation (fichiers partagés : elle seule les édite)

Elle livre, en TDD : la table des routes et des entités (§ 1.4), le registre groupé et les drapeaux (§ 1.2, § 1.5), toutes les routes dans les deux espaces (`route-table.tsx`, chargeurs reconnus par `admin-catalog-loading.test.ts`), `session-guard.ts` (`RouteKey` + `PRIVATE_ROUTES` + boucle du témoin), `admin-space.ts` dérivé, un écran d'attente par route neuve (fichier que le lot remplacera), le kit (§ 2), la bibliothèque d'interprétation (§ 3), le jeu de glyphes, le menu groupé et le hub (§ 2.8, § 2.9), la règle de persistance (§ 2.10), les déplacements de décodeurs (`loadAdminUsers`/`decodeAdminUsers`/clé → `lib/api/admin-users.ts` ; `loadAdminDashboard`/`decodeAdminDashboard`/clé → `lib/api/admin-dashboard.ts`), l'infrastructure des FRAGMENTS de catalogue, le plafond provisoire du poids, l'entrée D-157 de `apps/web/decisions.md`.

**Fragments de catalogue** — `apps/web/src/lib/interface-catalogs/admin/` :
- `fragment.ts` : `export type AdminCatalogFragment<F> = Readonly<Record<keyof F, string>>;`
- par fragment `<id>` et par langue : `<id>-fr.ts` (`const f = { … } as const; export default f;`) et `<id>-{en,es,pt,de,it,ar}.ts` (`… satisfies AdminCatalogFragment<typeof fr>`), créés VIDES par la fondation pour les dix lots ;
- `catalog-admin-<lang>.ts` les étale : `const fr = { …clés de base…, ...kitFr, ...dashboardFr, …, ...conversationsAgentFr } as const;` (importés statiquement par le seul catalogue de leur langue : ils restent dans son chunk `catalog-admin-<lang>-*.js`, jamais dans le socle) ;
- `admin-catalog-fragments.test.ts` : table `FRAGMENT_PREFIXES` (ci-dessous) ; pour chaque fragment et chaque langue, mêmes clés qu'en fr ; chaque clé commence par un préfixe DU fragment ; aucune clé de base ne commence par un préfixe de fragment ; aucune clé dans deux fragments.

| Fragment (lot) | Préfixes exclusifs |
|---|---|
| `kit` (fondation) | `admin.kit.`, `admin.group.`, `admin.value.`, `admin.enum.` |
| `dashboard` | `admin.dash.` |
| `statistiques` | `admin.analytics.`, `admin.lang.` |
| `moderation` | `admin.moderation.` |
| `contenus` | `admin.posts.`, `admin.community.` |
| `liens` | `admin.shareLink.`, `admin.tracking.`, `admin.invitation.` |
| `diffusions` | `admin.broadcast.` |
| `classement-supervision` | `admin.ranking.`, `admin.monitoring.` |
| `audit-reglages` | `admin.audit.`, `admin.settings.` |
| `personnes` | `admin.people.` |
| `conversations-agent` | `admin.conversation.`, `admin.agentPanel.` |

Les clés `admin.nav.*` (et `.hint`) vivent dans le catalogue de BASE, posées par la fondation. Les lots n'y suppriment rien : l'intégrateur balaie les clés mortes à la fin.

**Poids** : `budgets.json › on_demand_chunks.interface_catalogs_admin.kb` passe à une PROVISION de 180 Ko (somme des sept langues), statut « PROVISION DU CHANTIER #8876 — à remesurer et resserrer à l'intégration », source écrite (estimation : ~1 300 clés neuves × 7 langues). Aucun lot ne touche `budgets.json`.

### 7.3 Les lots de section

| id | Titre | Issues fermées | Routes | Complexité |
|---|---|---|---|---|
| `dashboard` | Le tableau de bord « vue de dieu » | — | `admin`, `adm` (panneau) | standard |
| `statistiques` | Statistiques (activité, messages, appels) et langues | #6728 | `adminAnalytics`, `admAnalytics`, `adminLanguages`, `admLanguages` | standard |
| `moderation` | Signalements et seuil de la modération | #6726, #6843 | `adminReports`, `admReports`, `adminReport`, `admReport` | délicat |
| `contenus` | Publications (stories, reels, statuts) et communautés | — | `adminPosts`, `admPosts`, `adminPost`, `admPost`, `adminCommunities`, `admCommunities`, `adminCommunity`, `admCommunity` | standard |
| `liens` | Liens de partage, liens de suivi, demandes de contact | #6729 | `adminShareLinks`, `admShareLinks`, `adminShareLink`, `admShareLink`, `adminTrackingLinks`, `admTrackingLinks`, `adminTrackingLink`, `admTrackingLink`, `adminInvitations`, `admInvitations`, `adminInvitation`, `admInvitation` | standard |
| `diffusions` | Diffusions : composer, préparer, envoyer, suivre | #6731 | `adminBroadcasts`, `admBroadcasts`, `adminBroadcast`, `admBroadcast` | délicat |
| `classement-supervision` | Classement et supervision | #6730, #6734 | `adminRanking`, `admRanking`, `adminMonitoring`, `admMonitoring` | standard |
| `audit-reglages` | Journal d'audit et réglages | #6727, #6732 | `adminAudit`, `admAudit`, `adminSettings`, `admSettings` | standard |
| `personnes` | Comptes, fiche membre complète, anonymes, sur le kit | #8005, #8004, #7920 | `adminUsers`, `admUsers`, `adminUser`, `admUser`, `adminAnonymous`, `admAnonymous`, `adminAnonymousOne`, `admAnonymousOne` | délicat |
| `conversations-agent` | Conversations (fiche) et agent, sur le kit | — | `adminConversations`, `admConversations`, `adminConversation`, `admConversation`, `adminAgent`, `admAgent` | standard |

#6844 (les sept écrans legacy sans pendant) se ferme à l'intégration, quand anonymes, communautés, demandes de contact, langues, statistiques de messages, signalements et liens de partage sont tous servis.

### 7.4 Règles communes à tout lot de section (définition de « fini »)

1. Ne JAMAIS éditer : `lib/admin/sections.ts`, `admin-space.ts`, `admin-routes.ts`, `routes/route-table.tsx`, `lib/session-guard.ts`, `routes/admin.tsx`, `admin-shell.tsx`, `admin-parts.tsx`, `admin-table.tsx`, `components/admin/**`, `components/glyphs-admin.ts`, `lib/admin/interpret/**`, `lib/admin/use-admin-*.ts`, `lib/admin/list-state.ts`, `lib/api/admin.ts`, `lib/api/admin-page.ts`, `catalog-admin-*.ts`, le fragment d'un autre lot, `budgets.json`, `decisions.md`, les cliquets racine (`scripts/check-*-catalog-dead-entries.mjs`), les recettes navigateur (sauf dérogation écrite du lot dashboard). Un manque dans le kit se contourne DANS le lot (composant local) et se signale dans le rapport ; il ne se corrige pas dans le kit.
2. TDD : un témoin rouge d'abord (`bun test` + happy-dom, gabarit du panneau à `deps` injectable, `resultatServi` pour toute pagination, `expectNoRawIdentifiers` sur chaque écran).
3. Décodeurs champ par champ, forme figée par `toEqual` ; aucun spread ; champs sensibles absents.
4. Chemins d'API par le catalogue généré seulement (`import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin'`) ; aucune ligne contenant `/api/v1/` hors tests.
5. Écran = `AdminSectionScreen` + panneau exporté `Admin<X>Panel({ language, deps = apiDeps })` ; listes par `useAdminList` + `AdminEntityList` ; fiches par `AdminFiche` ; gestes par `useAdminAction` + `AdminConfirmSheet`.
6. Toutes les chaînes dans SON fragment, sept langues, sous SES préfixes.
7. Basculer `lib/admin/ready/<section>.ts` à `true` dans le commit qui remplace l'écran d'attente.
8. Aucun `any`, aucune assertion non justifiée, données immuables, retours anticipés, fichiers ≤ 1000 lignes (plafond dur 1200) ; matchers déclarés dans `src/bun-test.d.ts` seulement.
9. Avant de rendre : `bun run type-check` (apps/web), tests ciblés du lot, `node ../../scripts/check-web-api-literals.mjs` depuis `apps/web`.
10. Commits en français (`feat(web/admin): … (#8876)`), terminés par une ligne vide puis les deux lignes de trailer de la session ; aucun nom de modèle nulle part.
11. Le rapport final dit : fichiers créés, endpoints consommés (pour le rabaissement du cliquet TS), décisions prises (l'intégrateur les porte dans `decisions.md`), manques du kit, dimensions mûres / restantes.

### 7.5 L'intégration (orchestrateur)

Après chaque fusion : `bun run type-check`, tests du lot. À la fin : `bun test` complet ; `bun run build` + `check-utilities` + `measure-weight` (plafond `interface_catalogs_admin` ramené à la mesure arrondie au Ko supérieur + 1, statut écrit) ; `check-sw-api-cache` ; `check-web-api-literals` ; cliquets TS/Swift rebaselinés avec lignes datées ; suppression de `AdminStubScreen` et des drapeaux (`ready: true` dans le registre) ; balayage des clés `admin.*` mortes dans les sept langues ; `check-admin-rung`, `check-admin-souverain`, `check-interface-language` ; entrées `decisions.md` des lots ; captures 375 px et 1440 px, clair et sombre ; fermeture des issues avec preuve ; PR.

---

## 8. Hors périmètre — à ouvrir en issues de suivi (milestone #101 ou suivant)

Appels : liste et fiche d'appels (métadonnées seules) · Statistiques de notifications (agrégats) · Vues globales des événements de sécurité et des bannissements · Sons (liste, mise en sourdine DMCA) · Restauration d'une publication retirée · Modération des commentaires · Exclusion d'un participant anonyme · Demandes de suppression de compte · Jetons de notification d'un membre · Parrainages et invitations par e-mail · Noms des membres pilotés dans les listes de l'agent · Audit des remises à zéro de l'agent et de la déconnexion forcée avant de les exposer · Découpage du catalogue d'administration par groupe si une langue dépasse 25 Ko gzip.

## 9. Décisions prises dans cette spécification

1. Sept groupes (§ 1.1), dix-huit sections ; « invitations » renommées « Demandes de contact » (ce sont des demandes d'amitié) ; statistiques de messages sous *Statistiques* ; liens de partage sous *Échanges* ; *Langues et traductions* sous *Plateforme*.
2. #6843 : option C (une tuile = la capacité de ce qu'elle ouvre) complétée par un masquage par bloc (option A) à l'intérieur des écrans.
3. Seuils : *Statistiques* et *Langues* sous `canViewAnalytics` (plus strict que leurs routes) ; *Supervision* sous `canViewAnalytics` + rang admin (unifie des gardes hétérogènes) ; *Réglages* sous `canAccessAdmin` ; communautés sous `canManageGroups` ; demandes de contact sous `canManageUsers`.
4. *Réglages* = votre accès + recalcul des compteurs + préférence du menu : aucune « configuration de plateforme » tant qu'aucune ressource ne la sert.
5. Les données d'administration ne sont plus persistées sur le disque (sauf la matrice de permissions du lecteur) ; cache-first en mémoire.
6. Les lectures de listes qui écrivent une trace (`VIEW_USER_LIST`) ont un staleTime de 5 min ; le tableau de bord en consomme une (derniers inscrits).
7. Demandes de contact : seul « Annuler la demande » est offert ; forcer « acceptée » n'est pas dessiné (la route n'en crée pas l'amitié).
8. Communautés : le geste « Désactiver » n'est livré qu'avec l'application de `isActive` par les lecteurs publics (lot passerelle).
9. Classement des messages sans texte (la passerelle retire `content`) ; liens de partage sans identifiant.
10. Journal d'audit : détail en feuille, sans route ; IP et navigateur seulement pour qui a `canViewSensitiveData`.
11. Diffusions : composition en feuille plein écran, sans route `/new` ; la « préparation » (qui traduit et passe à Prête) est dite avant d'être déclenchée.
12. Liens de suivi et supervision servis SOUS `/admin` par la passerelle plutôt que d'élargir le motif du service worker.
13. Graphiques sans dépendance, catégories ≤ 4 + « Autres », axe du temps gauche → droite y compris en arabe.
14. Un seul catalogue d'administration par langue, fragmenté par lot à la source ; plafond provisoire relevé une fois par la fondation, resserré à l'intégration.
15. Les écrans des sections neuves sont déclarés d'avance et masqués par un drapeau de disponibilité possédé par chaque lot : aucun contrôle ne mène jamais à un écran d'attente.
