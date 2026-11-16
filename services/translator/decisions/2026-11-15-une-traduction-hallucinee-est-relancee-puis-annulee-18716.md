## 2026-11-15 : Une traduction hallucinée est relancée sur des profils plus stricts, puis annulée avec trace (#18716)

**Statut** : Accepté

**Contexte** : NLLB-200 a appris sur Europarl et des textes religieux. Sur une source courte ou hors de son domaine, le décodage glouton rend volontiers une phrase sans rapport, par exemple « The Commission has also adopted a proposal for a regulation on the implementation of the common agricultural policy. » pour « ok merci à toi ». Les gardes existantes ne la voient pas : le budget de jetons (#9309) la laisse passer (elle tient dans 2,5 × la source + 10 pour une source moyenne), elle ne boucle pas, et elle ne perd aucun marqueur (#14327). Elle partait donc en cache pendant 30 jours, puis jusqu'au lecteur.

**Décision** :
1. **Règles** (`src/utils/translation_quality.py`, `assess_translation`). Ce sont des fonctions pures, et chaque règle a un motif nommé :
   - `empty` : rien en sortie pour une source qui a des lettres ;
   - `length_ratio` : longueur pondérée de la sortie > 3 × celle de la source + 20 (un idéogramme CJK ou un kana pèse 3, un syllabe hangûl 2, les marqueurs 🔹EMOJI_n🔹 ne comptent pas) ;
   - `boilerplate` : un concept du corpus d'entraînement (Commission, États membres, PAC, Parlement européen, « Monsieur le Président », rapporteur, Union européenne, lexique biblique), en six langues, présent en sortie et absent de la source dans toutes ses langues, sur une sortie déjà plus longue que 1,6 × la source + 10 (seule, l'empreinte condamnerait « Le Parlement européen a voté hier ») ;
   - `repetition` : un mot répété trois fois de suite, ou un trigramme présent trois fois, au-delà de ce que la source répète déjà ;
   - `wrong_script` : moins de la moitié des lettres de la sortie dans l'écriture de la langue cible, lue sur le suffixe NLLB de `LANGUAGE_MAPPINGS` (`_Cyrl`, `_Arab`, `_Jpan`…), seule source de vérité.
2. **Escalade** (`TranslatorEngine._settled`). Le glouton reste le chemin nominal, sans changement de coût. Seule une phrase signalée est relancée, seule, sur `ESCALATION_PROFILES` :
   | profil | num_beams | no_repeat_ngram_size | repetition_penalty | length_penalty | budget |
   |---|---|---|---|---|---|
   | 1 | 4 | 4 | 1,15 | — | 1,6 × source + 10 |
   | 2 | 6 | 3 | 1,3 | 0,8 (favorise le court) | 1,25 × source + 10 |
   La première sortie saine est servie, et une ligne `INFO` « Traduction relevée (#18716) » le journalise.
3. **Annulation** : l'échelle épuisée, ou un profil qui reproduit une sortie déjà rejetée (le modèle n'a rien d'autre à proposer), lève `TranslationRejectedError`, une sous-classe de `TranslationInferenceError`. Le rejet n'est donc jamais mis en cache ni assemblé, et l'appelant sert l'original (règle 1 du Prisme). Une ligne `WARNING` « Traduction annulée (#18716) » donne la paire, le modèle, les motifs et le nombre de relances, **jamais le texte**. Une empreinte SHA-256 (modèle, paire, phrase) est gardée dans une LRU de 512 entrées : la même phrase, relancée par le repli phrase à phrase de `translate_with_structure`, est rejetée sans rejouer l'échelle.

**Pourquoi `no_repeat_ngram_size` et `repetition_penalty` reviennent alors que #9309 les a rejetés** : #9309 les écartait du décodage **nominal**, parce qu'ils rendent inatteignables 5,2 % des références FLORES à n = 4. Ici, ils ne s'appliquent qu'à une phrase **déjà condamnée** : leur coût de qualité porte sur une sortie qui, sans eux, serait de toute façon annulée. Le profil 1 prend n = 4, la valeur la moins coûteuse mesurée, et seul le profil 2 descend à n = 3.

**Alternatives rejetées** :
- Le beam search pour toutes les phrases : environ 4 × le coût CPU sur le chemin nominal, pour un défaut minoritaire.
- Un score de confiance du modèle (log-probabilité moyenne) : une hallucination Europarl est justement une phrase à haute probabilité pour le modèle. Il faudra le mesurer sur le banc avant d'en faire une règle.
- Servir la sortie la « moins mauvaise » : c'est encore une traduction fausse, que la règle 1 du Prisme interdit.

**Conséquences** : le contrat ZMQ et l'API ne changent pas, et un rejet emprunte le chemin d'échec déjà existant (`_fallback_translate`, `error`). Une phrase signalée coûte au plus deux générations beam en plus, sous le budget d'inférence (45 s minimum). Ces relances ne sont pas encore mesurées par le banc nocturne (`benchmark/engines.py`) : le taux de relève et de rejet par direction, et le p95 des phrases relancées, en sont le suivi.
