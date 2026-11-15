## Leçon 519 — Un état OPTIMISTE qui n'est pas l'état CONFIRMÉ n'est pas de l'optimisme : c'est un aperçu qui ment

Trouvé à la revue de #4933 (`/links`, fermer un lien), en trois défauts qui ont la même racine — **le
module COMPOSAIT du balisage que le serveur compose déjà**.

- **La pastille « Fermé », créée en JavaScript, n'atterrissait pas où le serveur la pose.**
  `marqueFerme` faisait `document.createElement('span')` et l'appendait dans `.dit` ; `dedans()` la
  sert en FRÈRE de `.dit`. Or `.lien .dit` est un `flex-direction:column` : la même pastille y
  tombait sur une TROISIÈME ligne, pleine largeur, au lieu du bout de rangée. La ligne SAUTAIT donc
  au retour de la passerelle — l'optimisme se VOYAIT, ce qui est exactement ce qu'il existe pour
  éviter. Aucun témoin ne pouvait l'attraper : les deux balisages étaient chacun corrects, seule
  leur DIFFÉRENCE était le défaut.
- **La région `role="alert"` était insérée avec son texte.** Une région d'alerte doit exister dans le
  document AVANT qu'on n'y écrive ; celle qu'un script crée et insère d'un bloc n'est annoncée par
  aucun lecteur d'écran de façon fiable. Le patron existait à dix lignes de là, dans le MÊME module
  (`.avis-feuille`, servie muette, que `disLaFeuille` remplit) — il n'a pas été suivi pour le carnet.
- **Le focus tombait sur `<body>` à chaque geste.** Le `<details>` retiré à l'optimiste PORTAIT le
  bouton qu'on venait d'actionner ; la ligne rétablie par `replaceWith(clone)` détruisait le nœud
  focalisé. Sur le chemin NOMINAL, pas seulement au refus.

> **La règle : un module de participation DÉVOILE des fentes servies, il ne compose pas de
> balisage.** Le serveur sert la pastille `hidden`, la région d'alerte `hidden` ; le module pose
> `.hidden = false` et écrit du TEXTE. Un seul site de balisage, donc aucune divergence possible —
> et la question à poser à tout correctif optimiste est **« l'état que je peins est-il, au pixel,
> celui que le rechargement remettra ? »**, qui ne se répond qu'en REGARDANT la capture.

Corollaire mesuré : la fente est aussi plus LÉGÈRE — le module est passé de 1 989 à 1 782 o gzip en
perdant `createElement`, `poseLAlerteServie` et `poseUneAlerteLocale`.
