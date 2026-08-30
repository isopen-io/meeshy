# Itération 286 — les statistiques de traduction temps réel du web descendent enfin le Prisme jusqu'au rang 4

Suite directe du **suivi laissé ouvert par le cycle 285** (analyse
`2026-08-30-iteration-285-web-message-translations-hook-divergent-twin`, §
« Suivi (hors périmètre) ») :

> `use-stream-translation.ts` construit `userLanguages` sans la locale appareil
> (rang 4) pour un INCRÉMENT DE STATISTIQUES uniquement (pas d'affichage) — à
> trancher au prochain passage : aligner sur la SSOT ou documenter l'écart comme
> volontaire.

Tranché : **aligner sur la SSOT**. C'est la seule issue conforme au `CLAUDE.md`
(« UNE source de vérité », « aucune jumelle divergente », § Device Locale : « JAMAIS
appeler `resolveUserLanguage` directement dans un composant — toujours passer par la
SSOT pour bénéficier de l'injection automatique » de la locale appareil).

## État actuel (avant ce lot)

`useStreamTranslation.handleTranslation` fait deux choses à la réception d'une
traduction temps réel : (1) fusionner la traduction dans le cache du message —
correct, canonicalisé — et (2) détecter si la traduction est **pertinente pour le
lecteur** afin d'incrémenter un compteur de statistiques (`incrementTranslationCount`).

L'étape (2) bâtissait la liste des langues du lecteur À LA MAIN :

```ts
const userLanguages = [
  user.systemLanguage,
  user.regionalLanguage,
  user.customDestinationLanguage
].filter(Boolean);
```

C'est le prisme du lecteur **arrêté au rang 3**. Le rang 4 — la locale appareil
(`user.deviceLocale` persistée côté serveur, ou `navigator.language`), 4e priorité du
Prisme Linguistique étendu (2026-05-26) — en est ABSENT.

## Problèmes identifiés

1. **Jumelle divergente du prisme du lecteur.** La SSOT
   `getUserLanguagePreferences(user)` (`utils/user-language-preferences.ts`, établie
   comme source unique au cycle 285) rend la liste ORDONNÉE, DÉDUPLIQUÉE et
   canonicalisée `system > regional > custom > deviceLocale`. La liste en ligne du
   hook réimplémentait les trois premiers rangs à la main, sans le quatrième et sans
   la déduplication/canonicalisation qu'apporte la SSOT.

2. **Un lecteur dont le SEUL signal de langue est la locale appareil n'est jamais
   compté.** Préférences in-app vides + `deviceLocale = 'de'` : le contenu lui est
   pourtant résolu vers `de` (le chemin de rendu passe, lui, par la SSOT), mais une
   traduction reçue vers `de` n'incrémentait aucune statistique. Le compteur
   sous-estime silencieusement l'usage réel de la traduction pour cette population.

## Cause racine

Une liste de langues de lecteur recopiée en ligne au lieu d'appeler la SSOT — le
motif exact que le `CLAUDE.md` interdit (« une table recopiée se lit comme une source
de vérité et dérive du vrai contrat en silence »). Le hook importait déjà
`normalizeLanguageForDedup` mais pas la SSOT de préférences, laissant croire que la
canonicalisation suffisait alors que le RANG manquait.

## Impact métier

Statistiques de traduction (analytics d'usage) sous-comptées pour tout lecteur piloté
par sa seule locale appareil. Dimension 10 (Utilité) du `CLAUDE.md` : « usage mesuré
(analytics) ; sinon la feature sort de la roadmap » — une mesure biaisée dessert
directement cette dimension.

## Impact technique

Aucun impact d'affichage (le rendu passait déjà par la SSOT) : le défaut était
circonscrit au compteur. Correction à surface minimale.

## Évaluation du risque

Très faible. Une seule ligne de logique remplacée par un appel à une fonction
exportée déjà consommée par une douzaine de fichiers du web. La détection ne peut que
s'ÉLARGIR (un rang de plus) — jamais compter une langue que le lecteur ne lit pas,
puisque la SSOT ne rend que les rangs réels du prisme.

## Améliorations proposées (implémentées)

- Importer `getUserLanguagePreferences` depuis `@/utils/user-language-preferences`.
- Remplacer la construction en ligne de `userLanguages` par `getUserLanguagePreferences(user)`.
- Commentaire ancrant la règle (§ Device Locale, apps/web/CLAUDE.md).

## Bénéfices attendus

Le compteur de statistiques temps réel épouse le même prisme (rangs 1→4) que le
chemin de rendu. Une jumelle divergente de moins ; une SSOT unique du prisme du
lecteur côté web pour l'affichage ET la mesure.

## Complexité d'implémentation

Triviale : un import, une substitution de trois lignes par une, un commentaire.

## Critères de validation (atteints)

- **RED prouvé** : nouveau témoin « compte une traduction pertinente pour la SEULE
  locale appareil (rang 4) » — `mockIncrement` jamais appelé sur le code d'avant
  (0 appel), tombe.
- **GREEN** : `__tests__/hooks/use-stream-translation.test.ts` — 5/5 verts (4 anciens
  + 1 neuf), les quatre témoins de canonicalisation préservés.
- `npx jest __tests__/hooks` : 120 suites / 2397 tests verts (2 skipped).
- `tsc --noEmit -p tsconfig.json` : aucune nouvelle erreur sur le fichier touché (la
  dette de types pré-existante — `z-index-validator`, `push-token.service`,
  `connection.service` — est inchangée).

## Dimensions (roadmap treize dimensions)

**11 · Maintenabilité** (mûre : une jumelle divergente du prisme du lecteur retirée,
SSOT unique pour affichage et mesure) — **10 · Utilité** (mûre : la statistique
d'usage de traduction cesse de sous-compter les lecteurs pilotés par la locale
appareil) — **13 · Complétude** (mûre : le prisme du lecteur descend au rang 4 sur ce
site de mesure comme il le fait déjà sur les sites de rendu).

## Suivi (hors périmètre)

- Toujours aucun cliquet ne garde « toute liste de langues de lecteur côté web passe
  par la SSOT `getUserLanguagePreferences` / `resolveUserPreferredLanguage` ». Un tel
  garde (interdire `[user.systemLanguage, user.regionalLanguage,
  user.customDestinationLanguage]` en ligne) attraperait la réapparition du motif ;
  seule la revue de recensement le fait aujourd'hui. Suivi de méthode inchangé depuis
  le cycle 283.
