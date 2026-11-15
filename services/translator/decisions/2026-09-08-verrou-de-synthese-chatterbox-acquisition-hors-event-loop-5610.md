## 2026-09-08: Verrou de synthèse Chatterbox — acquisition hors event loop (#5610)
**Statut**: Accept
**Contexte**: `meeshy-translator` est resté bloqué 7 jours en production (2026-08-31 → mesuré
2026-09-07), CPU ~0%, `/live` injoignable — alors que `/live` ne fait aucune I/O. Tous les
workers ZMQ tournent en coroutines sur le MÊME thread d'event loop (`asyncio.create_task`,
pas des process/threads séparés). `ChatterboxBackend.synthesize()` sérialise ses appels
avec `self._synthesis_lock` — un `threading.Lock()` choisi (2025-01, cf. deadlock
2026-05-28) pour rester compatible avec `run_in_executor`. Le watchdog `with_synth_watchdog`
(180s, `asyncio.wait_for`) devait border un `generate()` bloqué et laisser sortir le `with
self._synthesis_lock:` pour libérer le verrou. Mais `with lock:` appelle `lock.acquire()`
SYNCHRONE sur le thread appelant : quand une deuxième synthèse atteint cette ligne pendant
que la première est bloquée dans l'executor, son `acquire()` gèle tout le thread d'event
loop — y compris le minuteur du watchdog de la PREMIÈRE synthèse, qui a besoin de ce même
thread pour jamais expirer. Le verrou ne se libère donc jamais, et rien d'autre sur ce
thread ne peut plus tourner, même un endpoint sans I/O.
**Decision**: Remplacer `with self._synthesis_lock:` par
`await loop.run_in_executor(None, self._synthesis_lock.acquire)` suivi d'un `try/finally`
explicite (`chatterbox_backend.py`) — le blocage a lieu sur un thread de l'executor, pas sur
le thread d'event loop, qui reste réactif (watchdog compris) pendant l'attente. Le
`torchaudio.save()` qui suivait la génération, jusqu'ici hors de toute borne, est désormais
lui aussi couvert par `with_synth_watchdog` (`DEFAULT_TTS_SAVE_TIMEOUT_S`, 30s par défaut,
`TTS_SAVE_TIMEOUT_S`) — un disque bloqué doit aussi libérer le verrou. Un service `autoheal`
(image `willfarrell/autoheal`) est ajouté aux compositions dev/staging/prod : il redémarre
tout conteneur marqué `autoheal=true` passé `unhealthy`, palliant le fait que
`restart: unless-stopped` ne réagit qu'à une SORTIE de process, jamais à un healthcheck
rouge — un conteneur figé mais non sorti (le cas vécu) ne se relève jamais tout seul sans
lui.
**Alternatives rejetées**: `asyncio.Lock()` seul (ne protège pas contre l'accès concurrent
depuis un thread d'executor si `synthesize()` était un jour appelé hors du loop principal —
le commentaire d'origine documentait déjà ce risque) ; tuer le thread executor bloqué (Python
n'expose aucune API pour interrompre un thread OS en cours d'exécution C — `generate()` peut
rester un thread « fantôme » jusqu'au redémarrage du process, d'où l'autoheal en filet de
sécurité plutôt qu'une garantie de libération à 100%) ; multiprocessing pour isoler chaque
synthèse (changement d'architecture disproportionné pour ce correctif, cause racine déjà
neutralisée par le changement d'acquisition).
**Cons**: Un `generate()` réellement wedgé (bug amont chatterbox/torch, cf. répétition de
token observée dans l'incident) laisse un thread executor occupé jusqu'au redémarrage du
process — l'autoheal borne la durée totale d'indisponibilité (prochain healthcheck rouge),
il ne récupère pas la mémoire du thread fantôme sans redémarrage.
**Preuve**: `services/translator/tests/test_chatterbox_synthesis_lock_non_blocking.py` —
isole le mécanisme (acquisition via executor vs. `with lock:` synchrone) sans dépendre de
`chatterbox`/`torch`, indisponibles dans certains environnements d'exécution.
