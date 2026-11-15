# Itération 288 — `GET /admin/languages/stats` replie `usersByLanguage` sur des codes canoniques

Suite directe de l'itération 287 (`PostService.audienceLanguages`), dont la
section « Améliorations futures » nommait explicitement les agrégateurs de
`systemLanguage` **verbatim** restants — `admin/languages.ts` groupBy en tête —
comme prochain passage, « nature différente : requête Prisma, pas cœur pur ».

## État actuel (avant ce lot)

`GET /api/admin/languages/stats` (`services/gateway/src/routes/admin/languages.ts`)
compte les utilisateurs par langue préférée ainsi :

```ts
const usersByLanguage = await fastify.prisma.user.groupBy({
  by: ['systemLanguage'],
  where: { systemLanguage: { not: null } },
  _count: { id: true }
});

const usersLanguageMap = usersByLanguage.reduce((acc, item) => {
  if (item.systemLanguage) {
    acc[item.systemLanguage] = item._count.id;   // clé VERBATIM
  }
  return acc;
}, {} as Record<string, number>);
```

Le résultat (`usersByLanguage` dans la réponse) alimente le graphe « Utilisateurs
par langue préférée » du tableau de bord admin.

## Problème identifié

`systemLanguage` est **persisté verbatim** — `z.string().optional()`, aucune
normalisation à l'écriture (fait établi et mesuré à l'itération 287 ;
`normalizeInAppLanguage`, `packages/shared/utils/conversation-helpers.ts`). Les
valeurs BCP-47 région-taguées ou en casse mixte produites par le web
(`Accept-Language` → `'en-US'`, `'pt-BR'`) et iOS (`Locale.current.identifier` →
`'fr_FR'`, `'FR'`) coexistent donc en base avec les formes canoniques 2-lettres.

`Prisma.user.groupBy({ by: ['systemLanguage'] })` groupe sur la valeur **brute**.
Trois lignes `'fr'`, `'fr-FR'`, `'FR'` produisent **trois buckets distincts**, que
le `reduce` recopie tels quels dans `usersLanguageMap` :

```
{ "fr": 100, "fr-FR": 5, "FR": 2 }      au lieu de      { "fr": 107 }
```

Conséquences, toutes mesurées par témoin RED :

1. **La langue dominante est sous-comptée.** Le graphe montre `fr: 100` alors que
   107 utilisateurs ont le français en langue principale — un écart qui grossit
   avec la part d'utilisateurs iOS/web arrivés avec une locale complète.
2. **Le graphe est pollué de variantes.** `'fr-FR'` et `'FR'` apparaissent comme
   des langues séparées à côté de `'fr'` : trois entrées de légende pour une seule
   langue réelle, illisible.
3. **Divergence silencieuse avec le reste du répertoire.** Aperçu de liste,
   bannière, `recipient-language`, `PostService.audienceLanguages`,
   `PostFeedService.getViewerLanguages`, `anonymous.ts` `spokenLanguages` passent
   tous par la SSOT `normalizeLanguageForDedup` ; cet agrégat admin en divergeait.

## Cause racine

Le `reduce` clé sur `item.systemLanguage` **brut**, sans passer par la SSOT de
canonicalisation-avec-dedup `normalizeLanguageForDedup`
(`packages/shared/utils/language-normalize.ts`), dont le doc-comment nomme
exactement ce cas — « employé partout où des codes verbatim … sont agrégés en une
liste ou dédupliqués ; un `.toLowerCase()` brut compterait `'en'` et `'en-US'`
comme deux langues distinctes ».

**Décision d'architecture respectée : canonicalisation en LECTURE, pas en
écriture.** La campagne (cycles 118→287) a explicitement choisi de laisser
`systemLanguage` verbatim en base et de canonicaliser chez chaque consommateur
(itération 287 : « aucune normalisation à l'écriture »). Ce lot suit cette
décision — replier au moment de l'agrégation — plutôt que d'introduire une
normalisation à l'écriture avec migration des lignes existantes (surface bien plus
large, hors de ce passage).

## Impact métier

Un tableau de bord d'analytics admin FAUX : la répartition des utilisateurs par
langue — donnée qui oriente les priorités de traduction et de localisation
produit — sous-compte les langues majeures et se fragmente en variantes
régionales. Dimension 10 (Utilité : une mesure fausse ne mesure rien) et 13
(Complétude) du `CLAUDE.md`.

## Impact technique

Surface minimale : un `reduce` dont la clé passe par `normalizeLanguageForDedup`,
en SOMMANT les buckets qui replient sur le même code canonique (au lieu d'écraser).
Un import ajouté. Aucun schéma, aucune requête Prisma modifiée (le groupBy reste
sur `systemLanguage`, le repli se fait sur son résultat), aucune frontière réseau
touchée.

## Évaluation du risque

Très faible. `normalizeLanguageForDedup` est déterministe et déjà consommée par une
dizaine de sites gateway. La détection ne peut que CONVERGER (des variantes
s'effondrent sur leur langue et leurs comptes s'additionnent) — jamais séparer une
langue réelle ni inventer un bucket. Le repli est idempotent sur des codes déjà
canoniques : une base sans variante rend exactement le même résultat qu'avant.

## Améliorations proposées (implémentées)

- `usersLanguageMap` clé chaque bucket par `normalizeLanguageForDedup(systemLanguage)`
  et **additionne** les comptes des buckets qui replient sur le même code.
- Témoins ajoutés (`languages-extra.test.ts`) : repli de `fr`/`fr-FR`/`FR` en un
  seul `{ fr: 107 }` ; idempotence sur des codes déjà canoniques ; forme mixte
  `fr_FR` (séparateur `_`) repliée aussi.

## Critères de validation

- RED prouvé : le témoin de repli échoue contre l'implémentation verbatim
  (`{ fr: 100, 'fr-FR': 5, FR: 2 }` attendu `{ fr: 107 }`).
- GREEN : suite `languages-extra` + `languages-routes` vertes.
- Gateway `tsc --noEmit` : EXIT=0.

## Suivi (prochain passage)

`admin/broadcasts.ts` reste à instruire : `where.systemLanguage = { in: targeting.languages }`
(ligne 276) filtre en base sur des valeurs verbatim — canonicaliser le filtre ne
suffit PAS puisque les lignes stockées sont elles-mêmes verbatim ; le ciblage
raterait un utilisateur `'fr-FR'` visé par `['fr']`. Sa correction est de nature
différente (élargir le `in` à toutes les variantes connues d'un code canonique, ou
matcher côté application) — à traiter comme une issue propre, hors de ce lot pur.
Le groupBy de rapport de `broadcasts.ts` (ligne 316) a la même fragmentation que
celui corrigé ici et peut être replié au même passage suivant.
