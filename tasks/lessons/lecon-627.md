## Leçon 627

**`@Published` publie sur `willSet`, valeur changée ou non — un `stop()` sur un lecteur déjà arrêté publie quand même, et s'il est atteint depuis `makeUIView`, SwiftUI abandonne ses rendus : écran VIERGE, thread principal oisif, arbre d'accessibilité complet.**

Le porteur : « le défilement du feed se fait sous fond blanc ou sombre » (#6977). Reproduit au simulateur : après un défilement rapide, le fil restait entièrement vierge pendant le geste et jusqu'à 5 s après — les cartes étaient DISPOSÉES (l'arbre d'accessibilité les donnait à leur place), pas PEINTES, et `sample` montrait un thread principal oisif. Le journal unifié, lui, comptait 258 faults « Publishing changes from within view updates » sur la même fenêtre.

La pile (`log show --backtrace`, symbolisée par `atos`) : chaque carte « scène » du fil construit son `StoryCanvasUIView` dans `makeUIView` ; l'init appelle l'all-stop préventif de `PlaybackCoordinator`, qui fait `stop()` sur tous les lecteurs enregistrés et sur `SharedAVPlayerManager.shared` ; `resetState()` et `cleanup()` ré-assignaient 4 + 9 `@Published` à des valeurs qu'ils avaient DÉJÀ. Aucun lecteur ne jouait ; tout publiait.

Trois choses à retenir :
- **Un « arrêt » idempotent doit l'être aussi pour ses observateurs.** Ré-assigner `isPlaying = false` n'est pas gratuit : c'est une publication, et une publication dans une mise à jour de vue est un comportement indéfini que SwiftUI honore en ne peignant plus. Chaque assignation d'un `@Published` se garde derrière `if valeur != nouvelle`.
- **Le débogueur ne voit pas ces faults et les fait disparaître.** Ni `_os_log_fault_impl`, ni `_os_log_impl` filtré, ni `Log.runtimeIssuesLog` n'ont tiré ; et un lldb attaché ralentit assez le processus pour que le défaut, lié au rythme du geste, ne se produise plus. Le journal unifié garde la pile de chaque fault : `log show --backtrace` + `dwarfdump --uuid` + `atos -l 0x0`.
- **Le premier correctif a fait tomber les faults de 258 à 99 — et le fil est resté vierge.** Le second publieur (`SharedAVPlayerManager`) n'apparaissait pas dans les piles du premier relevé parce qu'un fault n'est émis que pour un objet qu'une vue OBSERVE ; il est apparu dès que le premier s'est tu. Relire les piles APRÈS chaque correctif, pas seulement avant.

> Preuve : même défilement en vidéo, sans correctif (258 faults, vierge ~10 s) puis avec (0 fault, aucune image vierge). Le contrôle « sans » est ce qui a prouvé que le correctif était la cause — une rafale de `simctl screenshot` pendant le geste mesurait le vierge plus fort qu'il n'était, la vidéo ne l'altère pas.
