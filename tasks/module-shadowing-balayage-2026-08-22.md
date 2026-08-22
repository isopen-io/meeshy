# Balayage de l'ombrage fichier/répertoire — dépôt entier (2026-08-22)

Suite des cycles 85-bis (#3300) et 86 (#3302). Ceux-ci ont traité l'ombrage dans
`services/gateway/src/routes/`. Ce balayage étend la question au dépôt.

## Rappel de la règle

Quand `X.ts` et `X/` coexistent, un import SANS extension (`'./X'`) résout
**LOAD_AS_FILE avant LOAD_AS_DIRECTORY** : le fichier gagne, et `X/index.ts`
n'est jamais chargé — sauf si `X.ts` le ré-exporte (« coquille »).

## Résultat : 11 paires, aucune nouvelle fuite

| paire | verdict |
|---|---|
| `routes/users.ts` + `users/` | coquille ✓ |
| `routes/voice.ts` + `voice/` | coquille ✓ |
| `routes/attachments.ts` + `attachments/` | coquille ✓ |
| `routes/communities.ts` + `communities/` | **répertoire injoignable** — connu, gardé par `module-shadowing.test.ts`, consolidation ouverte |
| `web/components/auth/register-form.tsx` + `register-form/` | coquille ✓ |
| `web/services/markdown.ts` + `markdown/` | coquille ✓ |
| `web/lib/i18n.ts` + `i18n/` | pas d'`index` → répertoire d'aides, pas une alternative |
| `web/lib/utils.ts` + `utils/` | idem |
| `web/__mocks__/react-syntax-highlighter.js` + dir | idem |
| `web/components/conversations/create-link-modal.tsx` + `create-link-modal/` | **bénin par construction** (§1) |
| `packages/shared/types/validation.ts` + `validation/` | **barrel mort + collision de NOMS** (§2) |

## §1 — `create-link-modal` : bénin, et il faut savoir pourquoi

Le fichier exporte le composant (`CreateLinkModalV2`) ; le répertoire exporte
des BRIQUES (types, constantes, hooks, sous-composants) et **pas** le composant.
Tous les appelants sont corrects :

- `from './create-link-modal'` ⇒ le fichier, qui porte bien `CreateLinkModalV2` ;
- `from '.../create-link-modal/components/SelectableSquare'` ⇒ sous-chemin explicite.

Conséquence à connaître : `create-link-modal/index.ts` est **injoignable par son
chemin nu**. Quiconque écrira `import { useLinkWizard } from '@/components/conversations/create-link-modal'`
n'obtiendra pas le hook — il tombera sur le fichier, qui ne l'exporte pas.
Piège dormant, pas défaut actuel.

## §2 — `packages/shared/types/validation` : barrel mort + noms en collision

**Le barrel est mort.** `validation/index.ts` (14 lignes de ré-export
d'`admin-user.js`) n'est atteignable par AUCUN chemin : le chemin nu
`@meeshy/shared/types/validation` résout le FICHIER `validation.ts`.

**Et cinq noms existent des DEUX côtés** — `createUserValidationSchema`,
`updateUserProfileValidationSchema`, `updateEmailValidationSchema`,
`resetPasswordValidationSchema`, `formatZodErrors` — avec des définitions
**différentes**, et c'est VOULU :

- `validation.ts` — schémas self-service, stricts (`strongPasswordSchema`, `.strict()`) ;
- `validation/admin-user.ts` — schémas ADMIN, plus larges (un admin édite
  `username`, `avatar`, `banner`, `role`… qu'un utilisateur ne touche pas).

Les appelants sont désambiguïsés par le chemin, et corrects aujourd'hui :
`routes/admin/users.ts` importe le sous-chemin explicite `types/validation/admin-user`,
`AuthService.ts` et `routes/users/contact-change.ts` importent le chemin nu.

**Ce n'est donc PAS un défaut** — c'est un piège nommé. Le jour où quelqu'un
importe `createUserValidationSchema` du chemin nu en croyant tenir la variante
admin, il obtient la stricte, sans erreur de compilation : les deux existent,
les deux sont des `ZodObject`, et le refus n'arrivera qu'à l'exécution sur un
champ qu'un admin avait le droit d'écrire.

`__tests__/password-min-length-parity.test.ts` garde déjà la longueur de mot de
passe entre les deux fichiers — quelqu'un avait vu le risque. Rien ne garde le
reste.

## Suites possibles (aucune urgente, aucune faite ici)

1. **Supprimer `packages/shared/types/validation/index.ts`** — 14 lignes que
   rien ne peut atteindre. Sûr, mécanique.
2. **Désambiguïser les cinq noms** (`adminCreateUserValidationSchema`…) — plus
   sûr que le barrel, mais c'est un renommage traversant `routes/admin/` et ses
   suites : un lot à part entière, avec une décision de nommage à porter.
3. **Étendre `module-shadowing.test.ts` au dépôt ?** — NON recommandé tel quel.
   Sa règle actuelle (« toute paire est une coquille ») est juste pour
   `routes/`, où les deux côtés servent des ROUTES ; elle est fausse pour le web,
   où `create-link-modal` sépare légitimement composant et briques. Un garde
   dépôt-entier encoderait surtout « ces cas-ci sont normaux », pour un bruit
   supérieur au signal. Le garde reste borné à `routes/`, là où l'ombrage a
   réellement coûté quelque chose.

## Ce que ce balayage confirme

L'ombrage de `communities` n'était pas un motif répandu : c'est le SEUL cas du
dépôt où un répertoire injoignable porte une implémentation alternative
complète. Partout ailleurs, soit la coquille existe, soit le répertoire ne
prétend pas remplacer le fichier. La leçon du cycle 85-bis tient — mais la dette
qu'elle a révélée est bornée, et elle est désormais gardée.
