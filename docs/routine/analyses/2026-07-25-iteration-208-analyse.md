# Iteration 208 — Formatage d'octets inline (KB figé) → convergence sur le SSOT `formatFileSize`

## Protocole (démarrage)
`main` @ `9098d9aa` (dernier merge : #2308 android/sharelink). Branche
`claude/brave-archimedes-cahsbi` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` (le postinstall prisma/turbo est
bloqué par le proxy — sans impact : correctif **web-only**, aucun type Prisma).
`packages/shared/dist` construit via `tsc` (le jest web mappe `@meeshy/shared/(.*)`
→ `packages/shared/dist/$1`).

PRs ouvertes au démarrage — **audit anti-doublon** :
- **#2307** (iteration 207) : gateway `MessageReadStatusService.freezeMessageStatus`
  → SSOT `mergeViewedLanguages`. Gateway-only. **Aucun chevauchement.**
- **#2305** (iteration 206) : web `auth.isUserAnonymous` + `ConversationView`
  read-tracking. **Aucun chevauchement** (fichiers auth/conversations).
- **#2275** : iOS a11y VoiceOver. Hors surface TypeScript.

Aucune PR ouverte ne touche les composants de pièces jointes/audio → zéro risque
de conflit. Cette itération prend la **cible #3 du backlog itération 205** (section
« Future improvements ») : formatage d'octets inline contournant le SSOT
`formatFileSize`.

## Sélection : **Priorité — correctness + Single Source of Truth (affichage des tailles)**

Trois sites d'affichage de taille de fichier réimplémentaient chacun une division
`/ 1024` figée sur l'unité **KB**, contournant le SSOT
`formatFileSize` de `packages/shared/types/attachment.ts`.

## Current state (avant correctif)

| Fichier | Ligne | Appel actuel | Défaut |
|---|---|---|---|
| `components/attachments/carousel/AudioFilePreview.tsx` | 135 | `{(file.size / 1024).toFixed(0)} KB` | jamais MB ; 0 décimale |
| `components/audio/AudioRecorderCard.tsx` | 500 | `{(audioBlob.size / 1024).toFixed(0)} KB` | jamais MB ; 0 décimale |
| `app/admin/messages/page.tsx` | 389 | `{(att.fileSize / 1024).toFixed(2)} KB` | jamais MB ; 2 décimales |

Le SSOT `formatFileSize(bytes, { decimals })` (défaut 2, zéros de fin retirés)
roule correctement les unités B → KB → MB → GB → TB. Il est déjà consommé par
**10 composants web**, dont le sibling direct `FilePreviewCard.tsx` **dans le
même répertoire carousel** — `AudioFilePreview` était l'unique exception locale.

## Problems identified
1. **Bug de correctness — unité figée.** Un fichier audio de 3 Mo s'affichait
   « 3072 KB » (AudioFilePreview/AudioRecorderCard) au lieu de « 3 MB ». Un
   enregistrement < 1 Ko affichait « 0 KB » (`.toFixed(0)`) au lieu de sa taille
   réelle en octets — trompeur (semble vide alors qu'il contient des données).
2. **Précision incohérente.** 0 décimale (audio) vs 2 décimales (admin) vs le
   SSOT (2, zéros retirés) → trois rendus différents pour la même intention.
3. **Duplication.** « octets → chaîne lisible » réimplémenté 3 fois au lieu de
   consommer le SSOT — exactement la classe que les itérations dates/JWT
   réduisaient. Piège de maintenance : un correctif du SSOT ne se propageait pas.

## Root causes
Helpers inline écrits localement dans des composants d'affichage avant/à côté de
l'adoption du SSOT `formatFileSize`, en supposant que la taille resterait
toujours « petite » (audio court) — hypothèse fausse dès qu'un fichier dépasse
1 Mo ou tombe sous 1 Ko.

## Business impact
- **AudioFilePreview / AudioRecorderCard** : composants du composeur de message,
  vus à chaque envoi d'un audio. « 3072 KB » / « 0 KB » nuit à la lisibilité et à
  la perception de qualité produit face aux concurrents (WhatsApp, Telegram
  affichent tous des unités roulées).
- **admin/messages** : console d'administration ; tailles brutes en KB gênent
  l'inspection des pièces jointes volumineuses (vidéos en Mo/Go).

## Technical impact
- 3 composants recâblés sur le SSOT (`+1` import, `-1` division inline chacun).
- `-3` réimplémentations d'un formatage octets → chaîne.
- Rendu unifié app-wide : unités roulées, précision cohérente (2 décimales,
  zéros de fin retirés).

## Risk assessment
**Faible.** Web-only ; aucun schéma/API/migration/clé i18n. Le SSOT conservé est
la version production correcte, déjà en usage sur 10 composants. Le seul
changement de comportement est **intentionnel** (unités roulées + octets sous
1 Ko) — précisément le correctif. Le test existant `AudioRecorderCard`
(« show audio format and size ») a été mis à jour de `/KB/i` (qui figeait le
rendu KB) vers une assertion tolérante aux unités (`B|KB|MB`), reflétant le
comportement correct.

## Proposed improvements (implémenté)
1. `AudioFilePreview.tsx` : import `formatFileSize` ; `{(file.size / 1024).toFixed(0)} KB`
   → `{formatFileSize(file.size)}`.
2. `AudioRecorderCard.tsx` : import `formatFileSize` ; idem sur `audioBlob.size`.
3. `admin/messages/page.tsx` : import `formatFileSize` ; idem sur `att.fileSize`.

## Expected benefits
- Fin du « 3072 KB » / « 0 KB » : unités roulées correctes (B/KB/MB/GB/TB).
- Précision cohérente app-wide.
- `-1` classe de duplication ; une source unique pour tout affichage de taille.

## Implementation complexity
**Triviale** — 3 imports + 3 substitutions inline, 1 assertion de test amendée,
1 nouvelle suite de test.

## Validation criteria
- Nouvelle suite `AudioFilePreview.test.tsx` : 3 tests verts, dont **3 régressions**
  (3 Mo → « 3 MB » et non « 3072 KB » ; 512 o → « 512 B » et non « 0 KB » ;
  52428 o → « 51.2 KB »). Prouvés RED avant correctif.
- `AudioRecorderCard.test.tsx` : 26/26 verts (assertion size amendée vers B/KB/MB).
- Suites attachments + audio (16 suites) : 455 verts, 3 skipped, 0 échec.
- `tsc --noEmit` : 0 erreur sur les 3 fichiers modifiés.

## Future improvements (backlog restant)
- **`getUserDisplayName` / `getUserDisplayNameOrNull`** (`utils/user-display-name.ts`)
  — corps copiés-collés ; `getUserDisplayName` peut déléguer `?? fallback`.
  **Candidat prioritaire prochaine itération.**
- **Formatage d'octets en logs** (`hooks/composer/useAttachmentUpload.ts`,
  `utils/user-analytics-collector.ts`) : divisions `/1024/1024` inline en
  `console.log`/télémétrie. Non-affichage utilisateur (moins prioritaire) mais
  candidat SSOT pour cohérence développeur.
- Backlog i18n dates/langues : couvert par les swarms précédents.
