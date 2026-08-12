# Analyse — Iteration 204 : localiser le formatage de date `toLocaleDateString()` ad-hoc (cluster groups / voice / contacts)

## Contexte / continuité
Suite directe du backlog laissé par l'itération 203 (section « Future
improvements ») : ~15 sites `formatDate`/`toLocaleDateString` ad-hoc dans
`apps/web`, dont plusieurs **omettent la locale d'interface** — donc rendent la
date dans la locale par défaut du navigateur, en violation du Prisme
Linguistique (le contenu doit s'afficher dans la langue configurée par
l'utilisateur, jamais celle de l'OS/navigateur). L'itération 203 a créé le SSOT
`formatShortDateTime(date, locale)` pour les liens de tracking ; 204 étend le
SSOT avec un helper **date-seule** et couvre le cluster explicitement nommé :
`components/groups/*`, `components/settings/voice/*`, `components/contacts/*`.

## Current state
Sites date-seule sans locale d'interface (rendent dans la locale navigateur) :

| Fichier | Ligne | Appel actuel |
|---|---|---|
| `components/groups/GroupCard.tsx` | 113 | `new Date(group.createdAt).toLocaleDateString()` |
| `components/groups/groups-layout-responsive.tsx` | 469 | `new Date(group.createdAt).toLocaleDateString()` |
| `components/groups/groups-layout-responsive.tsx` | 576 | `new Date(selectedGroup.createdAt).toLocaleDateString()` |
| `components/groups/GroupDetails.tsx` | 193 | `new Date(group.createdAt).toLocaleDateString()` |
| `components/groups/ConversationsList.tsx` | 102 | `new Date(...).toLocaleDateString(locale)` (locale OK, mais format ad-hoc) |
| `components/settings/voice/VoiceProfileInfo.tsx` | 52 | `new Date(profile.expiresAt).toLocaleDateString()` |
| `components/contacts/ConversationDropdown.tsx` | 41 | `date.toLocaleDateString(undefined, { day:'2-digit', month:'2-digit', year:'numeric' })` |

Le SSOT `apps/web/utils/date-format.ts` expose déjà des formateurs localisés
(`formatRelativeDate`, `formatConversationDate`, `formatFullDate`,
`formatShortDateTime`) mais **aucun helper date-seule public**. Un helper privé
`formatShortFullDate(date, locale)` existe, alimenté par 3 appels
`toLocaleDateString` concaténés manuellement → ordre figé jour-mois-année (ex.
anglais « 5 Nov 2025 » au lieu de l'ordre natif « Nov 5, 2025 »).

## Problems identified
1. **Bug i18n (Prisme)** : 6 des 7 sites rendent la date dans la locale
   navigateur (ou `undefined`) → un francophone sur un navigateur anglais voit
   « 11/5/2025 » au lieu de « 5 nov. 2025 ».
2. **Duplication** : chaque site réimplémente le formatage date au lieu de
   consommer le SSOT — exactement la classe que 203 réduisait.
3. **Incohérence de format** : `MM/DD/YYYY` numérique (ConversationDropdown),
   `DD/MM/YYYY` ou `M/D/YYYY` (les autres selon locale navigateur) — aucun format
   app-wide unifié.
4. **Collision de nommage latente** : `ConversationDropdown` déclare une fonction
   **locale** `formatShortDate(date, t)` qui fait en réalité du bucketing
   relatif (« à l'instant », « il y a Xmin »…) — mal nommée, et bloque
   l'import du futur helper SSOT du même nom.
5. **Helper privé sous-optimal** : `formatShortFullDate` concatène 3 appels →
   ordre non natif pour certaines locales.

## Root causes
Absence historique d'un helper SSOT date-seule ; chaque composant a été écrit
avant la centralisation `date-format.ts` (203). La locale d'interface est déjà
exposée par `useI18n().locale` mais n'était pas câblée sur ces rendus.

## Business impact
Friction linguistique visible : dates affichées dans la mauvaise langue/ordre
pour tout utilisateur dont la locale navigateur diffère de sa langue Meeshy —
casse la promesse du Prisme (« le contenu s'affiche comme du contenu natif »).

## Technical impact
−7 formatages date ad-hoc ; +1 helper SSOT réutilisable ; suppression du helper
privé `formatShortFullDate` (fusionné dans le nouveau public) → ordre de date
natif correct pour toutes les locales dans `formatRelativeDate` /
`formatConversationDate` (bénéfice collatéral). Renommage clarifiant dans
`ConversationDropdown`.

## Risk assessment
**Faible.** Web-only ; aucun schéma/API/migration/clé i18n. Le format visuel
change **intentionnellement** (langue d'interface + format court natif) — c'est
le correctif. Les tests existants de `formatConversationDate` sur dates
anciennes sont agnostiques à l'ordre (`toContain('Jan')`/`toContain('janv')`) →
la refonte de `formatShortFullDate` ne les casse pas. Aucun test n'assertait le
format des 7 sites ciblés.

## Proposed improvements
1. Ajouter `formatShortDate(date, locale = 'fr')` au SSOT `date-format.ts` —
   date-seule, `{ day:'numeric', month:'short', year:'numeric' }`, un seul appel
   `toLocaleDateString` (ordre natif par locale).
2. Refactorer le privé `formatShortFullDate` pour déléguer à `formatShortDate`
   (dedup + ordre natif), ou remplacer ses 2 appelants internes directement.
3. Recâbler les 7 sites : destructurer `locale` de `useI18n` (ou le recevoir en
   prop pour `GroupDetails`), déléguer à `formatShortDate(date, locale)`.
4. `ConversationDropdown` : renommer la fonction locale `formatShortDate` →
   `formatRelativeContactTime`, lui ajouter un paramètre `locale`, et déléguer
   son fallback >7j au SSOT `formatShortDate`.

## Expected benefits
- Dates rendues dans la **langue d'interface** partout (Prisme respecté).
- Format court unifié app-wide (« 5 nov. 2025 » / « Nov 5, 2025 »).
- −7 formatages dupliqués, −1 helper privé, +1 helper SSOT testé.
- Ordre de date natif correct (bénéfice collatéral sur les dates de
  conversation anciennes).

## Implementation complexity
**Faible.** 1 helper SSOT + tests, 6 composants recâblés (import + locale),
1 fonction renommée + threadée.

## Validation criteria
- Nouveaux tests `formatShortDate` (locale en/fr distinctes, pas de composante
  heure, défaut fr, entrée string) verts.
- `__tests__/utils/date-format.test.ts` intégral vert (existants + nouveaux).
- Aucune nouvelle erreur `tsc` sur les fichiers modifiés.

## Future improvements (backlog restant)
- Sites date **avec heure** sans locale : `components/v2/PostDetail.tsx:24`,
  `components/settings/encryption-settings.tsx:183` → délégables à
  `formatShortDateTime`.
- Sites date-seule dans les **pages** (hors composants) : `app/u/[id]/page.tsx`
  (memberSince), `app/admin/moderation/page.tsx`, `components/join/JoinInfo.tsx`,
  `components/contacts/tabs/{Pending,Refused}RequestsTab.tsx` (composants
  actuellement non rendus — exports morts, à trier).
- Formatage **numérique** `toLocaleString()` non localisé (membersCount,
  messageCount) — classe distincte, à évaluer.
