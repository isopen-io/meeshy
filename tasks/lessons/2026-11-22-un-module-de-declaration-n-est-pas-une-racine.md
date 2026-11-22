## Un module de DÉCLARATION n'est pas une racine (2026-11-22, #20438, cycle 221)

*Mesuré le 2026-11-22 (#20438, cycle 221), sur `apps/web/src/lib/api/me-keys.ts`,
`apps/web/src/lib/api/socket.ts` et
`apps/web/src/lib/api/socket-missed-catch-up.test.ts`.*

### Le fait

`me-keys.ts` existe pour une raison de BUNDLE : le morceau du temps réel doit
NOMMER une requête sans tirer son port, ses décodeurs ni `zod`
(`budgets.json › realtime`). Il déclare `MY_PROFILE_QUERY_KEY = ['me','profile']`,
`APP_PREFERENCES_QUERY_KEY = ['me','app-preferences']` — et
`CALL_HISTORY_QUERY_PREFIX = ['calls','history']`.

Deux sites ont lu le NOM DU FICHIER comme la racine des clés qu'il déclare : le
témoin de portée de `socket-missed-catch-up.test.ts` § « la racine `['me']` n'est
pas balayée », dont la raison écrite disait « les deux clés sont des FEUILLES
sous `['me']`, qui porte aussi le profil et le journal d'appels », et le
commentaire de production de `CATCH_UP_FAMILIES`, qui justifiait `exact: true`
par « sa racine `['me']` […] emporterait le profil et le journal d'appels ».

### Ce que ça coûtait

**Le témoin ne pouvait pas rougir.** Il observait deux clés : l'une
(`MY_PROFILE_QUERY_KEY`) est dans `CATCH_UP_FAMILIES` et DOIT être périmée ;
l'autre (`CALL_HISTORY_QUERY_PREFIX`) vit sur une AUTRE racine, donc un balayage
de `['me']` par préfixe ne l'aurait jamais touchée. La sentinelle censée
interdire ce balayage ne pouvait tomber sous aucune mutation — elle avait l'air
d'une garde et n'en était pas une.

### La règle

> **Devant une phrase de la forme « X est une feuille sous Y », ouvrir X.** Le
> fichier qui DÉCLARE une clé ne dit rien de la clé : un module de déclaration
> est nommé par la raison qui l'a créé — ici un budget de morceau — jamais par la
> forme de ce qu'il porte.

Et le corollaire de témoin, qui est la vraie leçon : **une sentinelle de PORTÉE
s'écrit sur une valeur qui serait emportée par la portée qu'elle interdit.**
Celle-ci observait une valeur hors de portée et une valeur obligatoirement
touchée : les deux verdicts possibles étaient fixés d'avance. Le remède est de
choisir une FEUILLE réellement sous la racine interdite et qu'aucun écrivain ne
nourrit (`['me','two-factor']`, `account-security.ts`), puis de prouver le rouge
en balayant la racine.

### Famille

Même forme que la leçon 261 (« une énumération porte deux affirmations, et c'est
la seconde que personne ne vérifie ») et que « un témoin qui ne peut pas tomber
n'est pas un témoin ». Ici l'affirmation non vérifiée n'est pas la complétude
d'une liste mais **l'APPARTENANCE d'une clé à la racine qu'on lui prête**.
