# Iteration 51 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 50 (« Source unique des initiales (string) — F26c-a », mergée dans `main` :
PR #1156 / `5b3abb6a`). Le canonique string-based `apps/web/utils/initials.ts` →
`getInitials(name, fallback='?')` existe désormais (17 tests verts), et les **7**
réimplémentations locales string-based (familles A1–A7) y délèguent.

La continuité iter 50 désigne explicitement **iter 51 = F26c-b** : unifier la **famille B**
(`getUserInitials(user)`) en dérivant les initiales du **nom résolu** via le canonique
`getInitials`, supprimer le doublon silencieux B2, et réécrire les attentes de la suite
`avatar-utils` (changement de sémantique mot-unique / username / 3-mots). Scout iter 51
relancé pour confirmer que la cible reste la plus nette.

## Baseline runner (parité CI)
- `bun install` OK (le postinstall `@prisma/engines` échoue sur ce runner — réseau ; sans
  impact sur le jest web qui ne touche pas Prisma).
- Web jest ciblé vert : `avatar-utils.test.ts` + `initials.test.ts` → **53/53**.
- Gates CI bloquantes : `shared` + `agent` (le job `test` met `web`/`gateway` en
  `continue-on-error`). Le lot iter 51 est **web-only** → non bloquant, mais on vise jest vert.

## Cartographie — famille B `getUserInitials(user)` (cluster SSOT retenu)

Aucun canonique **user-object** ne dérive du nom résolu. Quatre familles d'initiales
« objet utilisateur » divergent :

| # | Emplacement | Mot unique | Ordre de priorité | 3-mots | Fallback | Testé |
|---|-------------|:----------:|-------------------|--------|----------|:-----:|
| B1 | `lib/avatar-utils.ts:9` (**canonique de fait**, 36 tests) | **1 car.** | `firstName+lastName` > `firstName` > `lastName` > `displayName` > `username` | 1er+**2e** | `'??'` | ✅ |
| B2 | `utils/user.ts:32` (**doublon silencieux non testé**, 3 importeurs) | **2 car.** | `firstName+lastName` > `displayName` > `username` | 1er+**dernier** | `'??'` | ❌ |
| B3 | `app/search/SearchPageContent.tsx:226` (local) | 2 car. (`slice(0,2)`) | dérive de `getUserDisplayName(user)` local | tous | — | ❌ |
| B4 | `app/signup/affiliate/[token]/page.tsx:68` (closure) | 2 car. | `firstName[0]+lastName[0]` > `username[0..2]` | n/a | `''` | ❌ |

### Divergences vérifiées (sources de bug)
1. **Mot unique** : B1 → 1 car. (`John` → `J`) ; B2/B3/B4 → 2 car. (`John` → `JO`). Le
   canonique iter 50 a tranché : **2 car.** (état de l'art Telegram/Discord/Slack).
2. **Ordre de priorité** : B1 met `firstName+lastName` **avant** `displayName` ; le canonique
   `getUserDisplayName` (iter 49) met `displayName` **en premier**. Conséquence : pour un
   utilisateur ayant à la fois `displayName` et `firstName/lastName`, **les initiales B1 ne
   correspondent pas au nom affiché**. Violation directe du principe « Single Source of Truth /
   cohérence » : l'avatar doit porter les initiales **du nom qu'on affiche**.
3. **3-mots** : B1 → 1er+2e (`John Michael Doe` → `JM`) ; canonique → 1er+dernier (`JD`).
4. **B2 diverge de B1 sur le mot unique** sans test pour le garder honnête.

### Importeurs (churn maîtrisé, avatars visuels uniquement)
- B1 : `conversation-participants-drawer`, `user-selector`, `MentionAutocomplete`,
  `participant-helpers`, + `getMessageInitials` interne.
- B2 : `invite-user-modal`, `user-settings`, `app/u/page` (3 importeurs à rediriger).

## Décision iter 51 — lot « Source unique des initiales (objet) — F26c-b »

Décision produit (état de l'art, cohérence avec iter 49/50) :

> **`getUserInitials(user)` dérive du nom résolu canonique :**
> `getInitials(getUserDisplayName(user, ''), '??')`.
>
> - Une seule règle de découpe (le canonique string iter 50) ;
> - une seule règle de résolution de nom (le canonique iter 49 : `displayName` >
>   `firstName+lastName` > `username`) ;
> - **les initiales correspondent toujours au nom affiché** ;
> - fallback `'??'` (signature inchangée, null-safe).

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Réécrire `lib/avatar-utils.ts` `getUserInitials` → `getInitials(resolveDisplayName(user,''),'??')` ; réécrire les attentes de `avatar-utils.test.ts` (mot-unique 2 car., displayName-first, 3-mots 1er+dernier) | SSOT objet ; initiales = nom affiché |
| B | Supprimer le doublon B2 (`utils/user.ts` `getUserInitials`) ; rediriger ses 3 importeurs vers `@/lib/avatar-utils` | Dédup ; comportement unifié |
| C | Converger B3 (`SearchPageContent`) et B4 (`affiliate/[token]`) sur `getUserInitials` importé | Dédup ; suppression closures locales |

### Churn visible assumé (déterministe, documenté)
- **Mot unique 1→2 car.** : `firstName` seul `John` → `JO` (était `J`) ; `username` seul
  `johndoe123` → `JO` (était `J`). Plus informatif, conforme au canonique.
- **Priorité displayName-first** : un utilisateur avec `displayName="Johnny D"` +
  `firstName/lastName="John Doe"` → `JD` (depuis `Johnny D`, coïncide), mais
  `displayName="Johnny"` seul mot l'emporte désormais → `JO`. L'avatar matche le nom affiché.
- **3-mots** : `John Michael Doe` → `JD` (était `JM`).
- Cas commun `firstName+lastName` « John Doe » → `JD` : **inchangé**.
- `getMessageInitials` hérite mécaniquement de la nouvelle sémantique (sender-only initiales).

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-c | Famille C : widgets dashboard (preview titre non word-aware) + `Avatar` (1 lettre) | FAIBLE | Intention distincte (preview/mono-lettre) ; décision produit séparée |
| F26b | `getUserDisplayName` divergents (`utils/user.ts` name-first, locaux `SearchPageContent`/`affiliate`/`MemberSelectionStep`) | MOYEN | Ordres/fallbacks distincts ; décision produit |
| F25b | Validateurs téléphone (regex simple vs libphonenumber) | MOYEN | Contrats incompatibles ; façade à concevoir |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain estimé global
Source unique des **initiales d'avatar (objet utilisateur)** : B1 (canonique), B2 (doublon
supprimé), B3, B4 délèguent tous au même pipeline `getInitials(getUserDisplayName(user,''),'??')`.
Les initiales **correspondent enfin au nom affiché** (cohérence SSOT), sont **unifiées,
crash-safe et 2-car. pour les noms à un mot** partout. Une seule règle de découpe + une seule
règle de résolution de nom dans tout le produit web.
