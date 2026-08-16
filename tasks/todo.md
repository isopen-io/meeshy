# Cycle 52 — la ligne décrivait un mélange de deux messages

## Constat

- [x] Six des onze champs du groupe d'aperçu (`lastMessageSenderName`,
      `lastMessageAttachments`, `…Count`, `…IsBlurred`, `…IsViewOnce`,
      `…ExpiresAt`) ne voyagent sur AUCUN `conversation:updated` — le serveur
      ne les LIT même pas (`PREVIEW_MESSAGE_SELECT`)
- [x] Correct tant que le payload décrit le MÊME message (édition, traduction).
      **Faux aux deux chemins où il en nomme un AUTRE** : suppression pour tous
      du dernier message, masquage personnel avec un remplaçant
- [x] Ce que la ligne rendait alors : « Windie : salut » (l'auteur du message
      SUPPRIMÉ), la vignette d'une photo effacée sous un texte neuf,
      « Vue unique » sur un message ordinaire, « Message expiré » sur un
      message vivant — **et rien ne corrigeait ensuite**
- [x] C'est LITTÉRALEMENT le paragraphe d'en-tête de `LastMessageFacet`, revenu
      par la seule porte qui ne passait pas par elle : la branche `else` du
      MÊME `if` dont la branche `if` (`bumpToTop`) avait été fermée
- [x] Troisième site trouvé par `grep lastMessageId =` :
      `recomputeLastMessagePreviewAfterDeletion` écrivait 4 champs à la main
      alors qu'il tient le message ENTIER — dont la carte de traductions, que
      le résolveur PRÉFÈRE à l'aperçu : la ligne rendait le **texte traduit du
      message supprimé**

## Correctifs

- [x] `MeeshyConversation.adoptLastMessage(id:)` — l'identité change ⇒ les onze
      champs descriptifs sont remis à neutre, l'appelant repose aussitôt ce que
      le payload porte. `lastMessageAt` délibérément dehors : c'est le RANG
- [x] **La borne fait le correctif** : no-op quand l'id ne change pas. Sans
      elle, une édition de légende dépouille la ligne de sa photo à chaque frappe
- [x] Les onze et non les six : exclure le texte et le Prisme rouvrirait le
      défaut sous sa forme subtile (régression P1-sans-P2 déjà vécue à côté)
- [x] `ConversationStore.merging` (SDK → store RAM **et** cache disque) +
      `ConversationListViewModel` (app, 2ᵉ implémentation) câblés
- [x] `recomputeLastMessagePreviewAfterDeletion` passe à
      `applyLastMessage(LastMessageFacet(message:preview:))` — la primitive
      atomique était déjà à deux mètres
- [x] Gateway inchangé — CONSTAT mesuré, pas oubli : joindre `attachments`
      coûterait la jointure sur le chemin du fan-out des TRADUCTIONS
- [x] Web NON traité — défaut réel et plus large (sa ligne rend l'objet
      `lastMessage`, que le patch ne touche pas), correctif = décision de RENDU

## Gates

- [x] Gateway : aucune source touchée ; suite `emitConversationPreviewUpdate`
      (29 témoins) relancée verte pour vérifier le contrat sur lequel s'appuie
      le correctif client
- [x] 10 témoins neufs : 3 store (dont la contre-épreuve de l'édition et
      l'arrivée du Prisme du remplaçant), 5 sur la facette (`LastMessageFacetTests`,
      fichier neuf — le SDK n'avait AUCUN témoin sur ses gestes atomiques),
      2 côté app
- [x] Swift : pas de toolchain sur cet hôte. RED raisonné, non exécuté.
      `sdk-tests.yml` joue les 8 témoins SDK ; les 2 témoins app restent le
      résidu non joué (même situation qu'aux cycles 49-51, notée au §9 du journal)
- [x] CHANGELOG + ADR `packages/MeeshySDK/decisions.md` + journal cycle 52 +
      leçon 210

## Revue

Voir `tasks/realtime-sync-audit-2026-08-16-cycle52.md` — pourquoi la branche
voisine est passée entre les mailles (elle a été écrite pour les métadonnées, le
chemin recalculé s'y est greffé plus tard), le tableau des trois sites, le
constat gateway chiffré par le chemin d'appel, l'analyse du web (piste n°1 du
cycle 53, désormais la plus grosse), et le témoin gateway écrit puis retiré
avant commit pour redondance.
