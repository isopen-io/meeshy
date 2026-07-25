# Iteration 198 — `UserMediaSection.formatSize` : dernière copie divergente **active** du formatage de taille de fichier, plafonnée à MB (un fichier ≥ 1 Go affiche « 2048.0 MB » au lieu de « 2 GB ») → convergence sur le SSOT `formatFileSize`

## Protocole (démarrage)
`main` @ `5c0c0452` (derniers merges : #2288 android/network OkHttp RefreshAuthenticator ;
#2281 web/users délègue display-name/initials/last-seen aux SSOT — itération 196 ;
présence-format — itération 197). Branche `claude/brave-archimedes-bibxop`
réinitialisée sur `origin/main`. Ce cycle prend **198**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances installées via `bun install` ;
`packages/shared` construit (`dist`) car le jest web mappe `@meeshy/shared/(.*)`
→ `packages/shared/dist/$1`. (Prisma non généré dans ce conteneur — download
engine bloqué par le proxy ; sans impact : le correctif est **web-only** et ne
touche aucun type Prisma.)

PRs ouvertes au démarrage : #2282/#2276/#2275 (swarms iOS a11y VoiceOver) —
toutes gérées par d'autres swarms, **non touchées** (aucune ne concerne la
surface TypeScript de cette itération).

Sélection : **Priorité 1 — cible explicitement mise en file par l'itération
197.** Le plan 197 (`Future improvements`) nommait exactement cette cible :
> - `apps/web/components/admin/user-detail/UserMediaSection.tsx:formatSize` :
>   réimplémente le formatage de taille de fichier, plafonné à **MB** (un fichier
>   ≥ 1 Go rend « 2048.0 MB » au lieu de « 2 GB ») ; SSOT existant
>   `packages/shared/types/attachment.ts:formatFileSize`.

Cette itération ferme la **même classe de défaut** (réimplémentation locale
divergente d'un SSOT existant) que les itérations 190-197, appliquée au
formatage octets → chaîne lisible.

## Current state

Le formatage d'une taille de fichier (octets → « 2 GB », « 200 KB »…) possède un
SSOT unique dans tout le monorepo — `packages/shared/types/attachment.ts:776`
→ `formatFileSize(bytes, { decimals? })` — déjà adopté par **10+** consommateurs
web (`FileAttachment`, `ImageLightbox`, `AttachmentDetails`, `VideoLightbox`,
`PDFLightboxSimple`, `MessageComposer`, `attachmentService`, `tusUploadService`…).

Un dernier consommateur **actif** le réimplémente localement et en a divergé :

### `UserMediaSection.formatSize` (l.41, avant correctif)
```ts
function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;   // <-- plafonné à MB
}
```
Rendu sur le badge de taille (overlay 10px) de chaque vignette média dans le
panneau admin « médias de l'utilisateur ».

## Problems identified

1. **Plafond MB — bug utilisateur réel.** Tout fichier ≥ 1 Go affiche une valeur
   en MB géante et illisible : un média de 2 Go rend **« 2048.0 MB »** au lieu de
   « 2 GB » ; 5 To rendrait « 5242880.0 MB ». Les vidéos et audios longs
   dépassent régulièrement le gigaoctet.
2. **Divergence de précision / trailing zeros.** `.toFixed(1)` fige un zéro
   décimal parasite (« 2.0 MB ») là où le reste de l'app affiche « 2 MB » (le
   SSOT retire les zéros de fin via `parseFloat`).
3. **Incohérence inter-écrans.** Un même fichier de 2 Go s'affiche « 2 GB » dans
   la lightbox de pièce jointe (SSOT) mais « 2048.0 MB » dans le panneau admin —
   deux formats pour la même donnée.
4. **Dette : 11ᵉ copie d'une logique déjà centralisée.**

## Root causes

Helper écrit localement avant/à côté de l'existence du SSOT `formatFileSize`,
avec une échelle d'unités tronquée (B/KB/MB seulement) et jamais recâblé lors de
la centralisation. Classe identique aux itérations 195-197 (troncature de code
de langue, helpers d'affichage utilisateur, libellé de présence).

## Business impact

Panneau d'administration (rôles ADMIN/MODERATOR/AUDIT). Un modérateur inspectant
les médias d'un utilisateur voit des tailles fausses/illisibles pour tout
contenu volumineux → mauvaise lecture de la volumétrie de stockage d'un compte.
Faible portée (admin) mais défaut d'exactitude réel.

## Technical impact

- −7 lignes de logique dupliquée, +1 import → délégation pure au SSOT testé.
- Échelle complète B/KB/MB/GB/TB, précision cohérente avec l'app entière.
- Suppression d'un `/* istanbul ignore next */` local (la branche falsy est déjà
  gardée au site d'appel `{item.fileSize ? … : null}`).

## Risk assessment

**Faible.** Changement web-only, aucune API/schéma/migration/clé i18n. Le site
d'appel garde déjà la nullité, donc la signature `formatFileSize(bytes: number)`
(vs `number | null` local) est satisfaite sans garde supplémentaire. Le SSOT est
couvert par `packages/shared/__tests__/types/attachment.test.ts`.

## Proposed improvements

Remplacer `formatSize` local par `formatFileSize` importé de
`@meeshy/shared/types/attachment` (décimales par défaut = 2, zéros de fin
retirés — identique aux 10+ autres consommateurs web).

## Expected benefits

- « 2 GB » au lieu de « 2048.0 MB » ; « 2 MB » au lieu de « 2.0 MB ».
- Format de taille **identique** partout dans le web.
- −1 copie divergente ; dette réduite.

## Implementation complexity

**Triviale** — 1 fichier de prod (import + suppression fonction + renommage
appel), 1 fichier de test (expectation MB mise à jour + test GB ajouté).

## Validation criteria

- Nouveau test « GB size (no MB overflow) » : 2 Go → « 2 GB », pas « 2048 MB ».
- Test MB mis à jour : 2 Mo → « 2 MB » (zéros de fin retirés par le SSOT).
- Suite `UserDetailSections.test.tsx` verte (225/225).
- Aucune erreur `tsc` sur le fichier modifié (bruit pré-existant hors périmètre).

## Future improvements (audit exhaustif — mises en file pour cycles suivants)

Un audit SSOT complet de la surface TypeScript (hors iOS/Android) révèle deux
cibles de convergence plus larges, par ordre d'impact :

1. **Cartes drapeau/nom de langue — divergence 3-voies vivante sur la surface
   chat principale (impact le plus élevé).** Trois implémentations indépendantes
   de « code langue → drapeau / nom » se contredisent :
   - SSOT : `packages/shared/utils/languages.ts` (`getLanguageInfo`,
     `getLanguageName`, `getLanguageFlag`), `en → 🇬🇧`.
   - Copie A : `apps/web/utils/language-utils.ts` (`LANGUAGE_FLAGS`/`getLanguageFlag`,
     `LANGUAGE_NAMES`/`getLanguageDisplayName`), `en → 🇺🇸`, noms natifs
     (« Français »). Consommée par `ActiveUsersSection`, `use-conversation-stats`.
   - Copie B : `apps/web/components/v2/flags.ts` (`FLAG_MAP` 21 langues seulement
     + `getFlag`, `LANGUAGE_NAMES` romanisés ASCII « Francais »/« Espanol »).
     Consommée par **toute** la surface v2 : `MessageBubble`, `LanguageOrb`,
     `TranslationToggle`, media cards, `PostCard`, `PostDetail`, `StatusBar`.
   - Défauts visibles : drapeau EN 🇺🇸 vs 🇬🇧 selon l'écran ; noms accent-strippés
     dans les bulles ; **fallback globe 🌐** pour 40+ langues (el, he, bn, fa,
     am…) absentes de `FLAG_MAP`. Tests contradictoires à réconcilier
     (`languages.test.ts:123` `en→🇬🇧` vs `language-utils.test.ts:77` `en→🇺🇸`).
   - Convergence : router `getFlag`/`getLanguageName`/`getLanguageFlag`/
     `getLanguageDisplayName` sur `getLanguageInfo` (déjà normalisé via
     `normalizeLanguageCode`).

2. **« Time ago » réimplémenté localement malgré le SSOT `classifyRelativeTime`
   (`packages/shared/utils/relative-time.ts`).** Cinq copies locales subsistent :
   `v2/CommentItem.tsx:28` (`formatTimestamp`, **anglais codé en dur, jamais
   i18n**) ; `admin/agent/{AgentOverviewTab,AgentConversationsTab,
   AgentMessagesModal}.tsx` (clés `agent.overview.timeAgo.*`, phrase complète) ;
   `admin/agent/ScanLogTable.tsx:37` (clés `timeAgo.*`, style suffixe compact) —
   deux namespaces de clés incompatibles dans le **même dashboard agent**.
   Convergence : `classifyRelativeTime` + un helper de présentation i18n
   partagé (comme `AgentLiveTab` le fait déjà).

3. **Copies `formatDate` ad-hoc vs `apps/web/utils/date-format.ts`** (impact
   moyen) : ~15 sites (links modals, ranking cards, admin user-detail sections,
   `AgentMessagesModal`) inlinent leur propre jeu d'options `toLocaleDateString`,
   certains sans locale → ignorent la langue d'interface choisie. Consolidation
   plus diffuse (dates absolues, SSOT au niveau app).
