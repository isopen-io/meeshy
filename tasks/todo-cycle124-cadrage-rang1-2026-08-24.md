# Cycle 124 — la langue de CADRAGE d'un destinataire NOMMÉ, élue au rang 1

## Point de départ

La question que le cycle 121 a rendue obligatoire (`CLAUDE.md`, règle 3) :

> **cette règle gouverne-t-elle un autre TYPE DE CONTENU, et qui le résout ?**
> Dès qu'un contenu part vers un destinataire NOMMÉ (un push, **un e-mail, un digest**),
> c'est la passerelle qui descend son prisme.

Les cycles 121-123 ont soldé le **push**. L'énumération nommait l'e-mail et le digest —
**personne n'était allé voir.**

## Ce qui a été mesuré

`NotificationService` porte la SSOT du cadrage — `resolveRecipientPrism`, dont le
doc-comment énonce exactement la distinction :

> `lang` est la langue de **CADRAGE** : l'interface. […] C'est le rang le plus haut
> **renseigné**, ce que rend `resolveUserLanguage`.

Cette SSOT ne servait QUE les éventails de messages. **Dix-sept autres sites** du gateway
écrivent vers un destinataire NOMMÉ en lisant `user.systemLanguage` — le rang 1 — **en
direct**.

### Trois conséquences DISTINCTES, pas une

1. **Rang.** Un lecteur qui n'a renseigné que `regionalLanguage: 'es'` (ou dont seule
   la `deviceLocale` allemande est connue, rang 4) reçoit tout en anglais / français.
   **Un rang 1 vide ne fait pas tomber au rang 2 : il fait tomber au REPLI.**

2. **Normalisation.** `resolveUserLanguage` normalise (`'EN'→'en'`, `'pt-BR'→'pt'`) — les
   prefs sont persistées verbatim. Aux deux canaux de diffusion, `lang` sert de **CLÉ**
   dans `translatedSubjects` / `translatedBodies` : `'pt-BR'` ne matche aucune entrée, et
   la diffusion retombe sur la langue de l'**AUTEUR** alors qu'une traduction `pt` existe.

3. **Format de date.** `NotificationService:4431` :
   `locale = systemLanguage === 'en' ? 'en-US' : 'fr-FR'` — un binaire codé en dur.
   `MaintenanceService:663` : `toLocaleDateString('fr-FR')` en dur. Un lecteur allemand
   lisait un e-mail allemand (`notificationString` normalise, lui) **daté à la
   française**.

## Le défaut de FORME qui les a produits

Les six sites conformes répètent chacun le même passe-plat :

```ts
select: { systemLanguage: true, regionalLanguage: true, customDestinationLanguage: true, deviceLocale: true }
resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined })
```

Deux choses à ne pas rater — la **forme du `select`** et l'**option `deviceLocale`** — et
rien qui les tienne ensemble. Leçon 264 : quand le résolveur existant demande de la
cérémonie, l'issue par défaut est de la sauter.

Et l'oubli le plus coûteux est le **`select`** : une projection trop étroite rend la
descente impossible EN AVAL, **silencieusement** — le résolveur reçoit un objet dont les
rangs 2 à 4 sont `undefined` et rend un rang 1 parfaitement plausible.

## Lots

- [x] **Lot 1 — SSOT.** `services/gateway/src/utils/recipient-language.ts` :
      `RECIPIENT_LANG_SELECT` (la forme du `select`), `recipientLanguage(user, fallback)`,
      `recipientLanguages(user)`, `recipientDateLocale(user, fallback)`. La forme de la
      requête et la descente dans le MÊME module — un appelant qui importe l'un trouve
      l'autre.
- [x] **Lot 2 — les canaux NOMMÉS** (17 sites) :

| # | site | canal |
|---|---|---|
| 1 | `jobs/notification-digest.ts` | e-mail de réengagement |
| 2 | `jobs/broadcast-sender.ts` | e-mail de diffusion admin |
| 3 | `jobs/broadcast-inapp-sender.ts` | notification in-app de diffusion |
| 4-6 | `notifications/NotificationService.ts` ×3 | e-mails immédiats (connexion, sécurité, social) |
| 7 | `notifications/NotificationService.ts` | titre + horodatage `login_new_device` |
| 8 | `services/MaintenanceService.ts` | e-mail de rappel de suppression + sa date |
| 9-11 | `services/PasswordResetService.ts` ×3 | e-mails de réinitialisation / confirmation |
| 12 | `services/AuthService.ts` | e-mail de vérification (renvoi) |
| 13 | `services/MagicLinkService.ts` | e-mail de lien magique (**aucun repli** : `undefined`) |
| 14-15 | `routes/users/contact-change.ts` ×2 | e-mails de changement de contact |
| 16 | `routes/me/delete-account.ts` | e-mail de confirmation de suppression |
| 17 | `routes/invitations.ts` | e-mail d'invitation |

- [x] **Lot 3 — les deux jumeaux de la langue de socket** (`SocketUser.language`) :
      `AuthHandler` et `applyResolvedLanguagesRefresh` calculaient tous deux
      `resolvedLanguages` par la descente **et**, dans le MÊME objet littéral, écrivaient
      `language` par une seconde lecture brute de `systemLanguage`. Le second écrivait
      `null` dans un champ typé `string` (la colonne est nullable, le paramètre la
      déclarait `string`).
- [x] **Lot 4 — duplication.** `broadcast-sender` portait une COPIE du repli de
      traduction (`translated[lang] || translated[source] || original`) que
      `localizedBroadcastText` est censé porter seul. Les deux voix d'une même diffusion
      ne peuvent pas élire des langues différentes pour un même destinataire.

### Repli terminal : PRÉSERVÉ par site

`resolveUserLanguage` retombe sur `'fr'` ; plusieurs de ces sites retombent sur `'en'`.
Le correctif **ajoute la descente sans toucher au repli** : le comportement ne change QUE
lorsqu'un rang inférieur est renseigné — jamais quand rien ne l'est. Trancher `'en'` vs
`'fr'` pour un compte sans AUCUNE préférence est un arbitrage **produit**, pas un
correctif de Prisme ; le mêler ici rendrait la mesure illisible. Le repli est donc un
PARAMÈTRE de `recipientLanguage`, visible au site plutôt que caché dans un défaut partagé.

## Témoins

**28 neufs**, dont **25 mesurés ROUGE avant correctif** :

| famille | n | ce qu'ils épinglent |
|---|---|---|
| RANG | 11 | rang 2 / rang 4 servis quand les rangs supérieurs manquent |
| NORMALISATION | 5 | `'pt-BR'` atteint la traduction `'pt'`, jamais la langue de l'auteur |
| SELECT | 6 | la requête ramène les quatre colonnes — le seul défaut qu'aucun témoin de rang ne peut voir, un mock rendant ce qu'on lui dit quel que soit le `select` |
| DATE | 2 | l'horodatage suit la langue SERVIE (points allemands, jamais barres françaises) |
| ANTI-RÉGRESSION | 4 | le repli du SITE survit quand aucun rang n'est renseigné |

Les 3 non-ROUGE sont les anti-régressions : elles PASSAIENT déjà, c'est leur rôle.
Les 2 témoins de `PasswordResetService`, écrits après coup, ont été prouvés falsifiables
par mutation (retour à `user.systemLanguage || 'en'` + `select` étroit ⇒ les deux tombent).

### Le témoin qui ne pouvait pas tomber

`AuthHandler.test.ts` portait déjà un témoin de langue, dont le commentaire AFFIRME :

> systemLanguage is the highest-priority source in **resolveUserLanguage**

Le site ne l'appelait pas. **Au rang 1, la lecture directe et la descente rendent le même
verdict** — le témoin ne pouvait donc pas distinguer les deux, et son commentaire décrivait
un code qui n'existait pas. Idem pour les quatre témoins de
`resolved-languages-refresh.test.ts`, tous épinglés au rang 1.

C'est la règle du cycle 121, appliquée : **un témoin de RANG s'écrit sur un rang AUTRE que
le premier.**

## Ce qui reste, NOMMÉ (mesuré, non fait)

- **`AuthService:611`** — `language: data.systemLanguage || 'fr'`, l'e-mail de vérification
  à l'INSCRIPTION. `RegisterData` porte bien `regionalLanguage`, donc le défaut de rang y
  est réel. Mais la ligne d'à côté (`:578`) PERSISTE `systemLanguage: data.systemLanguage
  || 'fr'` : descendre le prisme pour le seul e-mail servirait de l'espagnol à un compte
  que la même transaction déclare français. **La question est de savoir si une inscription
  sans rang 1 doit hériter du rang 2 en base** — arbitrage de persistance, pas correctif de
  Prisme. Laissé ouvert délibérément.
- **`MessagingService.ensureParticipantFromMember`** — corrigé, mais **sans témoin
  propre** : chemin de migration legacy (`$runCommandRaw`), méthode privée, aucun harnais.
  Il ne tient que par le typage et par la thèse de la famille. Nommé pour que la prochaine
  passe le sache.
- **`MessageTranslationService:2402`** — `userLanguage = user?.systemLanguage || undefined`,
  indice de détection de langue pour un vocal court. Même défaut de rang et de
  normalisation (`'pt-BR'` part vers Whisper tel quel), mais la thèse est AUTRE : c'est la
  langue du **LOCUTEUR**, pas d'un destinataire nommé. À instruire dans son propre lot.
- Héritages non exerçables ici (Swift) : `prePersistMessage` (NSE, corps VIDE au démarrage
  à froid — cycle 122) ; la piste AUDIO traduite non attachée à la bannière.

## Gates

- `tsc --noEmit` (gateway) : **0 erreur**
- suite gateway complète : voir § Résultat

## Résultat

- **28 témoins neufs**, dont **25 mesurés ROUGE** avant correctif (14 sur les jobs +
  8 sur `NotificationService` + 1 sur `AuthHandler` + 3 sur le rafraîchissement de socket ;
  les 2 de `PasswordResetService` prouvés falsifiables par mutation).
- Gates : gateway **850/850 suites, 19446/19446 témoins** · `tsc --noEmit` **0 erreur**.
- **17 sites** ramenés sur la SSOT ; 1 duplication de repli de traduction supprimée.
- Suivi NOMMÉ et mesuré, non fait : `AuthService:611` (arbitrage de persistance),
  `MessageTranslationService:2402` (langue du LOCUTEUR, thèse distincte),
  `MessagingService.ensureParticipantFromMember` (corrigé sans témoin propre).
