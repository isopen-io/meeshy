---
'@meeshy/web': patch
---

La langue auto d'un audio se re-dérive quand la traduction arrive après le montage.

La sélection automatique de langue ne s'évaluait qu'au montage du composant. Or le cas courant est
l'inverse : l'audio est rendu d'abord, ses traductions arrivent ensuite par socket — le pipeline
transcription → traduction → TTS n'est jamais instantané. La piste restait donc dans la langue
d'origine alors qu'une traduction vers la langue préférée venait d'atterrir, et seul un remontage
du composant la faisait apparaître. Le Prisme Linguistique était rompu précisément là où il compte :
sur le contenu reçu en temps réel.

La résolution est extraite en fonction pure `resolveAutoLanguage`, et un effet la ré-applique quand
`translatedAudios` change. Un `useRef` mémorise le choix explicite de la personne — un tap sur une
pastille de langue — pour que la re-dérivation ne l'écrase jamais : l'automatisme ne reprend la main
que tant que personne n'a tranché.
