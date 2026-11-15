## 2026-08-18 : Le drapeau-toggle pilote la PISTE audio — une seule loi de résolution (`AudioTrackLanguageResolver`)

**Statut**: Accepté (directive utilisateur : « lorsqu'on switch de drapeau d'audio, il faut aussi switcher l'audio et synchroniser la lecture sur les segments »)

**Contexte**: Le drapeau de version (ligne des réactions) ne changeait que le TEXTE. La lecture audio en conversation délègue toujours au parent (`onPlayRequest` → `ConversationViewModel.playAudio`), qui jouait `attachment.fileUrl` en dur : le widget pouvait afficher les segments d'une piste traduite pendant que le coordinateur jouait l'original. Le canal `activeAudioLanguage` (ThemedMessageBubble → BubbleStandardLayout → AudioMediaView) existait mais n'était alimenté par personne ; `activeAudioLanguageOverrides` (VM) n'avait aucun lecteur.

**Décision**:
1. **Une loi unique, pure, app-side** : `AudioTrackLanguageResolver.resolve(manualOverride:originalLanguage:preferredLanguages:translatedAudios:)` — bascule manuelle du drapeau d'abord (l'origine y vaut « piste originale »), sinon Prisme (l'origine gagne à SON rang). Consommée par la VUE (`AudioMediaView.resolvedPreferredTranscriptionLanguage` + onChange de l'override) ET par le MOTEUR (`ConversationViewModel.playAudio` → `effectiveAudioTrackUrl`, `setBubbleActiveDisplayLanguage` → `switchActiveAudioTrackIfNeeded` → `playVariant` si lecture active du même message).
2. **Le karaoké suit gratuitement** : `resolveDisplaySegments` (SDK) suivait déjà la langue sélectionnée ; la tenue plate complète rend désormais le bloc karaoké interactif (`AudioPlayerChromePlan.flatTranscriptionFollowsPlayback`, `.flatFocused` seulement — la tenue minimale garde sa citation tronquée).
3. **`switchToLanguage` (SDK) ne stoppe plus le moteur EXTERNE** : le stop-avant-availability-gate ne vaut que pour le player possédé ; en conversation le coordinateur vient de rejouer la bonne piste (`playVariant`), le stopper tuait la lecture qu'on venait de faire suivre.
4. **La bande interne de drapeaux du widget sort du chemin standalone** (`FocalAudioBlock` passe `footerModel: nil`) : second basculeur local jamais remonté au VM, contraire à l'arbitrage « un seul drapeau, l'exploration au menu d'appui long ». Le carrousel garde `.empty` (drapeaux = navigation par piste d'un message multi-pistes).
5. **Vocal sans traduction texte** : `BubbleContentBuilder` replie `activeLang` et `preferredLangCode` sur la langue audio préférée (`preferredAudioLangCode`, résolu en amont) — sans quoi le drapeau d'un vocal traduit restait inerte et montrait la mauvaise face.

**Alternatives rejetées**:
- *Faire remonter `currentAudioUrl` du SDK via `onPlayRequest(String)`* : change l'API publique du SDK pour tous les call sites ; la résolution VM-side donne la même vérité sans toucher les signatures.
- *Câbler la bande interne du widget au VM* : garder deux basculeurs pour la même décision, c'est la divergence assurée — l'arbitrage produit n'en garde qu'un.

**Conséquences**: une bascule pendant la fenêtre de swap de piste (<1 s, `isPlaying` transitoirement faux) peut ne pas faire suivre la lecture — un re-tap répare ; la sélection est en mémoire (non persistée), un relaunch revient au Prisme.
