## Leçon 128 — un code défensif qui « nettoie avant » est presque toujours une redondance devenue destructive (2026-08-12, routine messaging, cycle 89)

La retraduction supprimait `Message.translations[langue]` et **persistait** cette suppression avant
d'envoyer la requête ZMQ, sans rollback. Le commentaire disait « cela permet de remplacer les
traductions existantes par les nouvelles » — une justification qui était fausse au moment où elle a
été écrite : `_saveTranslationToDatabase` remplace la clé quoi qu'il s'y trouve.

1. **Vérifier l'écrivain AVAL avant de croire le nettoyeur AMONT.** La question à poser n'est pas
   « pourquoi supprime-t-on ? » mais « que se passerait-il si on ne supprimait pas ? ». Ici : rien,
   sauf sur le chemin d'échec, où la suppression est la seule chose qui reste.
2. **Un nettoyage préalable sans rollback est un pari sur le succès du réseau.** Le mode de panne
   n'est pas « l'utilisateur voit brièvement l'ancienne traduction » (bénin) mais « la traduction
   correcte n'existe plus nulle part » (définitif). Entre les deux, le choix ne se discute pas.
3. **La redondance était déjà documentée à côté** : quatre transports d'édition écrivent
   `translations: null` dans l'écriture du CONTENU, et un test du cycle 35 verrouille précisément ce
   choix (« ne réécrit pas la ligne une seconde fois pour invalider ce que la première a déjà
   vidé »). Le bloc supprimé était la seconde écriture que ce test interdisait — un étage plus bas,
   hors de sa portée.
4. **Un correctif qui RETIRE du code doit se prouver par un test d'ABSENCE d'écriture**
   (`expect(prisma.message.update).not.toHaveBeenCalled()`), pas seulement par la survie de la
   donnée : sinon un futur « nettoyage » revient sans que rien ne le dise.

---
