# Cycle 54-bis — la carte du Prisme suit le message que la ligne décrit (web)

## La piste

- [x] La leçon 212 (cycle 53) laisse une question mécanique : *quels sont TOUS
      les écrivains de ce que la ligne AFFICHE ?* — posée ici au reste du fichier

## Le constat

- [x] La ligne compose son texte de DEUX moitiés qui ne vivent pas au même
      endroit : `conversation.lastMessage` (objet) et la carte du Prisme
      (`lastMessageTranslations` / `lastMessageOriginalLanguage`, scalaires au
      niveau conversation)
- [x] `resolveLastMessagePreview` PRÉFÈRE la carte au contenu brut — c'est elle
      qui gagne à l'écran
- [x] **Six** écrivains locaux réécrivaient l'objet, **zéro** ne touchait la
      carte : `message:new`, sa branche `fetched`, `message:edited`,
      `message:deleted`, `link:message:new`, et `use-conversations-v2` — un
      SECOND écouteur du même `message:new` sur le MÊME cache
- [x] Cinq ont un `conversation:updated` jumeau qui rattrape — mélange
      transitoire
- [x] **`link:message:new` n'en a pas, délibérément** (`broadcastLinkMessage` :
      « the clients already applied it » — vrai de l'objet, faux de la carte) ⇒
      ligne DURABLEMENT fausse sur les conversations de lien partagé
- [x] Le cycle 52 avait conclu l'inverse (« l'atomicité vient du modèle ») — vrai
      de l'objet, et la carte n'est pas dans l'objet

## Correctif

- [x] `withPreviewMessage({ conversation, message, textChanged? })` — geste
      unique, pur, exporté ; les six écrivains y passent
- [x] **L'identité décide, jamais le contenu** : même id ⇒ la carte reste vraie
- [x] `textChanged` déclaré par l'écrivain — une édition garde l'id et périme les
      traductions côté serveur, l'identité ne peut pas le dire
- [x] Carte périmée ⇒ `lastMessageOriginalLanguage` réaligné sur le message
      installé (règle #3 du Prisme : la langue d'origine concourt à son RANG)
- [x] **Périmer, pas recomposer** : dériver la carte de `message.translations`
      dupliquerait dans le client les 4 exclusions serveur + le plafond de 300
- [x] Ne touche ni `lastMessageAt` ni `updatedAt` — les 6 appelants n'en font pas
      le même usage
- [x] Témoin de SOURCE sur `use-conversations-v2.ts` : deux écouteurs sans ordre
      garanti ⇒ la règle d'identité n'est sûre que si TOUS y passent

## Gates

- [x] Suite web COMPLÈTE : 581 suites, 12 445 témoins verts, 21 ignorés, 0 échec
- [x] 16 témoins neufs — 10 sur le geste pur, 2 de source, 4 d'intégration,
      posés sur la sortie de `resolveLastMessagePreview`, pas sur le champ brut
- [x] **Preuve par mutation dans les deux sens** : neutraliser le correctif tue
      10 témoins, le sur-doser en tue 2 (la borne)
- [x] `tsc --noEmit` — aucune erreur sur les 2 fichiers touchés (le dépôt en
      porte 1234 par ailleurs, préexistantes, comparées fichier par fichier)
- [x] `prisma generate` + `packages/shared` reconstruit avant la campagne
- [x] `main` refusionné à la main avant push
- [x] CHANGELOG racine + journal cycle 54 + leçon 215

## Revue

Voir `tasks/realtime-sync-audit-2026-08-17-cycle54-bis.md` — le tableau des six
écrivains, pourquoi le chemin des liens partagés était le seul sans filet, et
les quatre pistes du cycle 55.
