# Iteration 203 — Tracking-link date formatting hardcoded to `en-US` → localise on the interface locale via a new SSOT helper `formatShortDateTime`

## Protocole (démarrage)
`main` @ `9f031bf3` (dernier merge : #2298 android/chat slow mode).
Branche `claude/brave-archimedes-dp2gg5` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances installées via `bun install`
(le postinstall `turbo run generate` / prisma est bloqué par le proxy — sans
impact : le correctif est **web-only**, aucun type Prisma). `packages/shared`
construit (`dist`) via `tsc` car le jest web mappe `@meeshy/shared/(.*)`
→ `packages/shared/dist/$1`.

PRs ouvertes au démarrage : #2291 (v2/flags, 199i), #2293 (agent relative-time,
200i), #2295 (Armenian SSOT, 201i), #2297 (profile language names, 202i),
#2275/#2276/#2282 (iOS a11y VoiceOver). **Aucune** ne touche la surface de cette
itération (composants `components/links/*`) → zéro risque de conflit.

Sélection : **cible #3 du backlog itération 198** — copies `formatDate` ad-hoc.
Les cibles #1 (v2/flags) et #2 (agent relative-time) sont déjà couvertes par les
PRs ouvertes ci-dessus. Cette itération prend la cible #3, mais restreinte à sa
sous-classe la plus nette et la plus impactante : le **formatage de date figé sur
`en-US`** dans la fonctionnalité de liens de tracking.

## Current state

Deux composants de la fonctionnalité « liens de tracking » réimplémentent chacun
un helper `formatDate` **identique**, figé sur la locale `'en-US'` :

### `components/links/expandable-tracking-link-card.tsx:48` (avant)
```ts
const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};
```
### `components/links/tracking-link-details-modal.tsx:60` (avant) — copie exacte

Ce helper est utilisé pour la date de création, la date d'expiration et la date
du dernier clic sur chaque carte de lien, et dans la modale de détails. Un
troisième site (`tracking-link-details-modal.tsx:295`, timeline « clicks over
time ») appelle `toLocaleDateString()` **sans locale** → locale par défaut du
moteur JS (dépend de l'environnement, pas de la langue d'interface).

Les deux composants disposent déjà de la locale d'interface via
`const { t } = useI18n('links')` — le hook expose `locale`
(= `currentInterfaceLanguage`, `use-i18n.ts:228`), simplement **non consommé**.

## Problems identified

1. **Bug i18n réel — dates toujours en anglais.** Un utilisateur francophone,
   hispanophone ou lusophone voit « Nov 5, 2025, 02:30 PM » sur ses liens de
   tracking, alors que toute l'interface est dans sa langue. Violation directe du
   **Prisme Linguistique** (« l'utilisateur consomme tout le contenu dans sa
   langue principale »).
2. **Format 12h AM/PM incohérent.** `'en-US'` rend l'heure en 12h (« 02:30 PM »)
   là où le reste de l'app affiche systématiquement du 24h (`hour12: false` dans
   `formatFullDate`/`formatTime`/`formatConversationDate`).
3. **Duplication.** Helper `formatDate` identique copié dans 2 fichiers + un 3ᵉ
   site inline sans locale — 3 variantes d'une même intention.
4. **Locale ignorée dans la timeline** (`:295`) — la locale par défaut du moteur
   n'est ni la langue d'interface ni déterministe.

## Root causes

Helpers écrits localement avant l'existence (ou sans connaissance) du SSOT
`apps/web/utils/date-format.ts`, avec une locale codée en dur. Classe identique
aux itérations 195-202 (réimplémentation locale divergente d'un SSOT existant),
appliquée ici au formatage date+heure absolu court.

## Business impact

Fonctionnalité de liens de tracking (partage/affiliation, visible par tout
utilisateur créant un lien). Dates affichées dans la mauvaise langue et au
mauvais format horaire → friction linguistique directement contraire à la
philosophie produit. Portée : toutes les cartes de liens + la modale de détails.

## Technical impact

- Nouveau helper SSOT exporté `formatShortDateTime(date, locale)` dans
  `date-format.ts`, aligné sur les conventions existantes (24h, `month: 'short'`).
- −16 lignes de logique dupliquée (2 helpers supprimés) → 2 délégations d'une
  ligne + 1 site inline recâblé sur `locale`.
- Les deux composants consomment enfin la `locale` déjà fournie par `useI18n`.

## Risk assessment

**Faible.** Changement web-only, aucune API/schéma/migration/clé i18n. Le format
visuel change **intentionnellement** (langue d'interface + 24h) — c'est
précisément le correctif. Aucun test n'assertait l'ancien format `en-US` (aucun
test ne cible ces deux composants tracking). Le SSOT est couvert par
`__tests__/utils/date-format.test.ts`.

## Proposed improvements

1. Ajouter `formatShortDateTime(date, locale = 'fr')` au SSOT `date-format.ts`
   (mêmes options que les helpers locaux, mais `hour12: false` pour la cohérence
   app-wide).
2. `expandable-tracking-link-card.tsx` : `useI18n` → destructurer `locale` ;
   `formatDate` délègue au SSOT.
3. `tracking-link-details-modal.tsx` : idem + timeline `:295` passe `locale`.

## Expected benefits

- « 5 nov. 2025, 14:30 » (fr) / « Nov 5, 2025, 14:30 » (en) au lieu de
  « Nov 5, 2025, 02:30 PM » partout.
- Format date **cohérent** avec le reste de l'app (24h, locale d'interface).
- −1 classe de duplication ; les 2 composants consomment la locale existante.

## Implementation complexity

**Triviale** — 1 helper SSOT + tests, 2 composants (import + délégation),
1 ligne inline recâblée.

## Validation criteria

- 6 nouveaux tests `formatShortDateTime` (locale en/fr distinctes, 24h sans
  AM/PM, défaut fr, entrée string) verts.
- `__tests__/utils/date-format.test.ts` : 32/32 ; `__tests__/components/links`
  vert (60/60 combiné).
- Aucune nouvelle erreur `tsc` sur les 3 fichiers modifiés (30 erreurs
  pré-existantes sur `tracking-link-details-modal.tsx` inchangées ; 0 sur
  `expandable-tracking-link-card.tsx` et `date-format.ts`).

## Future improvements (backlog restant)

- **Cible #3 (reste)** : ~15 autres sites `formatDate`/`toLocaleDateString`
  ad-hoc (admin user-detail sections, ranking cards, groups, contacts,
  settings/voice). Plusieurs omettent la locale d'interface → même bug i18n.
  Candidats non swarmés : `components/groups/*` (`GroupDetails`, `GroupCard`,
  `groups-layout-responsive` — tous `toLocaleDateString()` sans locale),
  `components/contacts/*`, `components/settings/voice/VoiceProfileInfo`.
- **Cible #1/#2** : couvertes par PRs #2291/#2293 (ne pas dupliquer).
- `apps/web/utils/language-utils.ts` (`en → 🇺🇸`) — bloqué sur décision produit
  (couvre 25 langues absentes du SSOT).
