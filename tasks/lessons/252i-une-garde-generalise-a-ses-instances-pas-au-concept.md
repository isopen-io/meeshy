## 252i — une garde généralise à ses instances, pas au concept

- **Une garde bâtie sur les instances qu'on a trouvées attrape leur
  RE-CRÉATION, jamais une variante qui résout le même problème autrement.**
  #4248 avait soldé huit copies de la puce de langue et interdit leur FORME (le
  soulignement dessiné, les clés réservées). Deux copies vivaient déjà ailleurs
  et lui échappaient : elles disaient leur état par l'OPACITÉ et par un fond de
  puce, et s'étiquetaient depuis une autre table. Quatrième fois en cinq lots
  qu'une règle juste reste bornée à la forme où on l'a écrite — **la première
  où c'est la GARDE, et non le code, qui porte la limite.** Une garde doit
  interroger le RÔLE (« qui décide quel drapeau porte un code ? », « qui nomme
  un drapeau à VoiceOver ? »), pas le dessin.
- **Une source unique doit être plus RICHE que la plus riche des copies qu'elle
  remplace, jamais leur intersection.** Le lot a failli livrer une régression
  silencieuse : la copie lisait une table de 78 langues, la source unique une de
  41. Router l'une vers l'autre rendait « WO » là où la rangée montrait 🇸🇳 —
  pour 39 langues, sans qu'aucun test ne rougisse, et seulement chez les
  locuteurs concernés. **La question à poser à toute consolidation :** *que
  savait la copie que la source ignore ?*
- **Une source unique de CONTRÔLE a deux moitiés : la VUE et le VOCABULAIRE.**
  Un site qui ne peut pas prendre la vue (ici : un bouton dans un bouton) doit
  pouvoir prendre le reste. Sans cette seconde moitié, il ré-écrit trois lignes
  d'accessibilité — et c'est exactement ainsi que les copies 9 et 10 avaient
  divergé.
- **Un compteur n'est pas une mesure tant qu'on n'a pas vérifié qu'il rate ce
  qu'il doit rater.** Quatre scanners avant un nombre publiable (102 → 20 → 13 →
  40/15/16/9) : fenêtre trop courte, fenêtre avalée par les commentaires,
  marcheur cassé sur un ternaire multi-lignes. Les trois premiers nombres
  avaient l'air publiables. Ce qui les a démasqués n'est jamais un
  raisonnement : c'est d'avoir cherché dans les résultats **un témoin dont je
  CONNAISSAIS la réponse** (un site que je savais conforme et qui ressortait
  fautif). **Toute mesure doit inclure un tel témoin.**
- **Un banc qui épingle une VALEUR documente une décision que le code ne porte
  pas.** Le balayage `grep` fait AVANT le push (leçon 251i bis, appliquée) n'a
  pas seulement évité un rouge : il a révélé que les deux tables divergent sur
  `pt` (🇵🇹 vs 🇧🇷) et qu'un banc épinglait 🇧🇷. **Devant un tel conflit, ne
  pas trancher en refactorant** : isoler la décision produit, la laisser au
  porteur, et poser dans la garde une **exemption NOMMÉE et motivée** — jamais
  une regex discrètement étroite, qui cacherait le choix au lieu de l'exposer.
- **Un attribut d'ISOLATION ne se pose pas par prudence — il se pose après avoir
  lu l'isolation de ce que la fonction APPELLE (252i bis).** J'ai marqué le
  vocabulaire de la puce `nonisolated` en me disant que la marque était « sans
  risque dans les deux cas ». Elle est légale partout, mais elle **contraint ce
  que le corps a le droit de toucher** : huit erreurs de compile, toutes au même
  endroit. `MeeshySDK/Package.swift` donne à **MeeshyUI**
  `.defaultIsolation(MainActor.self)` (SE-0466) — `LanguageDisplay`, son
  `from(code:)` et ses `flag`/`name` sont isolés ; le cœur `MeeshySDK`
  (`LanguageData`, `MeeshyUser`) ne l'est pas. Un appel MainActor → nonisolated
  est toujours licite, **jamais l'inverse**.
  > Le pire est que j'avais ANTICIPÉ le problème d'isolation — c'est pour cela
  > que j'ai posé la marque — et que la mitigation a créé la panne qu'elle
  > visait, faute d'avoir vérifié dans quel SENS elle jouait. **Une mitigation
  > posée sur une intuition non vérifiée est un pari, pas une précaution** ; le
  > fichier qui donnait la réponse (`Package.swift`, `LanguageDisplay.swift`)
  > était déjà ouvert.
