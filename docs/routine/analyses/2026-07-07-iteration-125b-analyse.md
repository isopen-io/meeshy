# Iteration 125 — Analyse (2026-07-07)

## Protocole (démarrage)
Routine continue d'audit/amélioration. `main` synchronisé @ `b10259ea` (fast-forward de 516 commits),
working tree propre, branche de travail `claude/brave-archimedes-auzati`.

## Revue de l'existant (constat de démarrage)
Forte activité de sessions parallèles : ~20 PRs ouvertes couvrant gateway realtime/typing/notification
delivery, calls/WebRTC, cache de traduction (PR #1613 « iter 124 »), android chat, sanitizer
prototype-pollution, reels cache, time-remaining. Pour éviter tout chevauchement, un agent d'exploration
(lecture seule) a été explicitement briefé pour **exclure** ces zones et cibler du code moins contesté
(translator Python hors segmentation, helpers shared, routes gateway non-realtime). Il a remonté une cible
neuve à haute confiance, **strictement disjointe** de toutes les PRs en vol.

## Cible : `LanguageCapabilitiesService` — filtrage des alternatives par région cassé (tautologie + variable shadowing)

### Current state
`services/translator/src/services/language_capabilities.py`

**Défaut 1 — `require_stt` (ligne ~462) : tautologie de comparaison de région**
```python
if not cap.stt_supported:
    # Find similar languages with STT
    similar_with_stt = [
        c for c, cap in self._capabilities.items()
        if cap.stt_supported and cap.region == cap.region   # <-- toujours True
    ][:5]
```
- `cap.region == cap.region` compare chaque candidat à **lui-même** → toujours `True` → le filtre région
  est **du code mort**.
- La variable de boucle `cap` **masque** (shadowing) le `cap = self.get_capability(code)` externe (la langue
  demandée), rendant impossible la comparaison voulue `candidat.region == demandée.region` sans renommage.
- Effet net : au lieu d'alternatives pertinentes par région, la méthode retourne les 5 premières langues
  STT-capables **par ordre d'insertion du dict** — c.-à-d. les langues **européennes** (`en`, `fr`, `es`, …).
  Un utilisateur d'une langue camerounaise/africaine reçoit des suggestions européennes non pertinentes.

**Défaut 2 — `require_voice_cloning` (ligne ~513) : commentaire trompeur + même shadowing**
```python
if not cap.tts_voice_cloning:
    # Find languages with voice cloning in same region   # <-- faux : aucun filtre région
    cloning_languages = [
        f"{c} ({self._capabilities[c].name})"
        for c, cap in self._capabilities.items()          # <-- shadow de cap externe
        if cap.tts_voice_cloning
    ][:10]
```
- Le commentaire promet « in same region » mais **aucun filtre région** n'existe.
- Même smell de shadowing de `cap` (latent : inoffensif aujourd'hui grâce au scope de compréhension Python 3,
  mais piège en cas de refactor).

### Root cause
Copier-coller d'un pattern de compréhension réutilisant le nom `cap` pour la variable de boucle, masquant la
capacité de la langue demandée ; sur `require_stt` la tentative de filtre région a dégénéré en auto-comparaison.

### Business / Technical impact
- **Business (faible-moyen)** : dégradation de la qualité UX des messages d'erreur de capacité linguistique —
  suggestions non pertinentes lors d'un échec STT (langue transcription non supportée). Zone à faible trafic
  (toutes les langues du set par défaut ont `stt_supported=True`) mais chemin réel dès qu'une config ajoute
  une langue STT-less.
- **Technical** : code mort (tautologie), shadowing latent, commentaire divergent du comportement (dette).

### Risk assessment
Très faible. Les `available_alternatives` sont un simple indice dans un payload d'erreur ; aucune logique
n'en dépend (vérifié : aucun caller externe ne lit le contenu/ordre — `grep` sur `require_stt` /
`require_voice_cloning` / `available_alternatives`). Changement isolé à 1 fichier source.

## Fix
- **`require_stt`** : renommer la variable de boucle (`cap` → `other`) et implémenter **même-région-préféré
  avec fallback** : `similar_with_stt = (same_region or any_stt)[:5]`. Le fallback préserve le contrat
  existant (une langue de région inconnue/vide obtient quand même des alternatives, jamais une liste vide).
- **`require_voice_cloning`** : le clonage vocal est une capacité **moteur** (Chatterbox/XTTS/VITS), pas
  géographique (le message d'erreur le dit explicitement). Interprétation retenue : le **code** est correct
  (liste toutes les langues clonables), c'est le **commentaire** qui est faux. Correction du commentaire +
  renommage de la variable masquante. **Aucun changement de comportement observable.**

## Validation
- **RED→GREEN prouvé** : nouveau test `test_stt_alternatives_prefer_same_region` échoue AVANT le fix
  (retourne `[en, fr, es, de, it]` tous Europe pour une langue africaine STT-less) et passe APRÈS
  (alternatives toutes région Africa).
- Nouveau test `test_stt_alternatives_fall_back_when_region_has_no_match` : garde-fou fallback (région
  « Atlantis » sans sibling STT → alternatives non vides).
- Nouveau test `test_no_cloning_alternatives_are_cloning_capable` : garde-fou de contrat VC (toutes les
  alternatives supportent réellement le clonage).
- Suite complète `test_32_language_capabilities.py` : **110/110** (107 existants + 3 nouveaux), 0 régression.
- `ast.parse` OK, aucun caller externe impacté.

## Future improvements (backlog)
- Envisager un tri de pertinence secondaire des alternatives STT (proximité linguistique, pas seulement
  région) si le set de langues STT-less s'étoffe.
- Auditer d'autres compréhensions du service pour d'autres shadowings du même pattern (aucun autre détecté
  ce cycle).
</content>
</invoke>
