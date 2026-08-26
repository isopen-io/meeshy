# Analyse — Itération 250 : le suivi #1 nommé par 249 gardait du CODE MORT

## Current state

L'itération 249 (scoring d'affinité des réels) a clos ses deux premiers suivis et
a nommé, par sévérité décroissante, le **suivi #1 pour la prochaine itération** :

> `services/gateway/src/socketio/MeeshySocketIOManager.ts:2262-2273`
> (`_findUsersForLanguage`) — le repli `user.language.toLowerCase() === lang` et
> la clé `lang` non canonicalisés ⇒ un destinataire `'en-US'` peut manquer un
> emit filtré par langue (derrière `SOCKET_LANG_FILTER`). Priorité 1 prochaine
> itération.

La méthode incriminée :

```ts
private _findUsersForLanguage(targetLanguage: string): SocketUser[] {
  const lang = targetLanguage.toLowerCase();
  const targetUsers: SocketUser[] = [];
  for (const [, user] of this.connectedUsers) {
    const matches =
      user.resolvedLanguages.includes(lang) ||
      user.language.toLowerCase() === lang;   // ← comparaison brute, bypass SSOT
    if (matches) targetUsers.push(user);
  }
  return targetUsers;
}
```

Le diagnostic de 249 sur la **forme** du code est exact : `includes(lang)` et
`=== lang` comparent des codes bruts, jamais passés par
`normalizeLanguageForDedup`. C'est la même classe de défaut que les itérations
243/246/247/248/249.

## Problems identified

En instruisant le suivi, un fait décisif que 249 n'avait pas relevé apparaît :
**`_findUsersForLanguage` n'a AUCUN appelant de production.** La seule référence
au symbole dans tout le dépôt, hors définition, est un `describe` de test qui
l'invoque par `(manager as any)._findUsersForLanguage(...)` :

```
$ git grep -n "findUsersForLanguage" -- '*.ts' | grep -v ".test."
services/gateway/src/socketio/MeeshySocketIOManager.ts:2264:  private _findUsersForLanguage(...)
```

- Aucun `this._findUsersForLanguage(` nulle part (production comme handlers).
- L'historique git ne montre **jamais** de site d'appel `this._findUsersForLanguage`.
- La méthode est `private` : elle n'est pas non plus une surface publique qu'un
  autre module pourrait atteindre.

Le vrai chemin de filtrage par langue de `message:new` (la fonctionnalité que
`SOCKET_LANG_FILTER` gouverne) ne passe PAS par cette méthode. Il passe par :

```
MessageHandler._emitMessageNewByLanguage / MeeshySocketIOManager._emitMessageNewByLanguage
  → groupSocketsByLanguage()        (socketio/utils/message-payload-filter.ts)
  → filterMessagePayloadForLanguages()
```

Et `groupSocketsByLanguage` **canonicalise déjà** chaque code — destinataire ET
langue d'origine — via `normalizeGroupLanguage()` :

```ts
function normalizeGroupLanguage(code: string): string {
  return normalizeLanguageCode(code) ?? code.trim().toLowerCase();
}
```

C'est le contrat `normalizeLanguageCode(code) ?? <sous-tag primaire lowercased>`,
soit **exactement** `normalizeLanguageForDedup` (à la seule différence des codes
HORS catalogue tagués région — `'yue-HK'` → `'yue-hk'` ici vs `'yue'` en dedup —
sans conséquence : une langue hors catalogue n'a jamais de ligne de traduction à
matcher). Un destinataire `'en-US'` est donc déjà réduit à `'en'` sur le chemin
vivant : le défaut que 249 décrit ne peut PAS se produire en production, parce
que le code qui le porte n'est jamais exécuté.

## Root causes

Deux causes distinctes, et c'est la seconde qui décide du correctif :

1. **La forme** (ce que 249 a vu) : une comparaison de codes bruts qui bypasse la
   SSOT. Réelle, mais inerte.
2. **La nature** (ce que 249 n'a pas vu) : `_findUsersForLanguage` est un
   **orphelin**. Le filtrage par langue a été bâti autour de
   `groupSocketsByLanguage` (fonction pure, testée en isolation, normalisée) ;
   cette méthode-ci est un vestige d'une approche antérieure, jamais câblée, que
   personne n'a retiré. Ses trois tests l'exercent par réflexion (`as any`) —
   ils attestent une méthode que rien n'appelle.

Le harnais du gateway est explicite sur ce cas (`services/gateway/CLAUDE.md`,
§ « Tests — un témoin qui ne peut pas tomber n'est pas un témoin ») : un témoin
sur du code que la production n'atteint jamais ne peut pas tomber sous une
régression produit — il ne garde rien, il décore.

## Business impact

Nul aujourd'hui : le chemin vivant est correct. **Le risque est un piège de
maintenance** — normaliser `_findUsersForLanguage` (le correctif littéral que
249 proposait) produirait du code mort « correct », avec trois témoins verts qui
suggèrent faussement qu'une fonctionnalité est gardée. La prochaine personne qui
lit ces tests croira que le filtrage par langue de la présence est couvert ici ;
il ne l'est pas, il l'est ailleurs. C'est précisément le coût que le harnais
nomme : un correctif qui déplace la dette au lieu de la retirer.

## Technical impact

Surface minimale : suppression d'une méthode `private` de 14 lignes + un
`describe` de 3 tests. Aucune signature publique, aucun contrat de fil, aucun
schéma, aucun import (le type `SocketUser` reste utilisé ailleurs dans le
fichier — vérifié). La couverture ne bouge que du retrait de lignes DÉJÀ
couvertes, effet global négligeable (une fonction ~11 lignes sur un dépôt de
centaines de fichiers).

## Risk assessment

Très faible. On retire du code qu'aucun chemin d'exécution n'atteint et les seuls
témoins qui l'exerçaient. Contre-preuve du chemin VIVANT : `groupSocketsByLanguage`
et ses suites (`message-payload-filter`) restent inchangées et vertes — la
fonctionnalité `SOCKET_LANG_FILTER` continue d'être gardée là où elle vit
réellement.

## Proposed improvements (implemented)

1. **Suppression** de `_findUsersForLanguage` (`MeeshySocketIOManager.ts`).
2. **Suppression** du `describe('_findUsersForLanguage', …)` (3 tests) dans
   `MeeshySocketIOManager.test.ts`.

Résolution CORRECTE du suivi #1 de 249 : le défaut de forme est réel, mais son
support est mort ; on ne canonicalise pas du code mort, on le retire — et le
chemin vivant (`groupSocketsByLanguage`) est déjà routé par la SSOT.

## Expected benefits

- Une méthode orpheline de moins, trois témoins-décoration de moins.
- Le suivi #1 de l'audit 247/249 est clos sans dette résiduelle.
- Le lecteur qui cherche le filtrage par langue est envoyé vers le seul site
  vivant (`groupSocketsByLanguage`), pas vers un leurre.

## Implementation complexity

Triviale : deux suppressions, aucune addition de production.

## Validation criteria

- `tsc --noEmit` gateway : exit 0 (fait).
- `MeeshySocketIOManager.test.ts` : 385/385 après retrait des 3 tests (fait).
- `bun run test:coverage` : suite complète verte, seuils tenus (en cours).
- Chemin vivant inchangé : suites `message-payload-filter` toujours vertes.

## Future improvements (audit 247, restant à instruire)

Les suivis #1 et #2 étaient clos par 248/249. Le suivi #1 « nouvelle numérotation »
(`_findUsersForLanguage`) est clos ici — par retrait plutôt que par correction.
Restent, par sévérité décroissante :

1. **Web (jest web, lot dédié)** : `CanvasV3Scene.tsx` (`sameLanguage` via
   `split('-')`), `BubbleMessage.tsx` (`===` brut origine + clé),
   `TranslationToggle.tsx` (`startsWith`), `use-stream-translation.ts`.
2. **Backfill base** des codes tagués (`Message.originalLanguage`, clés de
   `translations`, `Post.originalLanguage`, `ConversationShareLink.allowedLanguages`)
   — supprimerait la classe de défaut à la SOURCE (écriture). Décision produit +
   fenêtre de migration.

Leçon de méthode pour cet audit : **avant de canonicaliser un site de comparaison,
vérifier qu'il a un appelant.** Un défaut de forme sur du code mort se résout par
suppression, pas par correction — sinon on fabrique du code mort « juste » et des
témoins qui ne peuvent pas tomber.
