/**
 * LA COPIE DE LA BANNIÈRE EN APPLICATION (#4454) — et elle est COURTE, parce
 * que presque rien n'est écrit ici.
 *
 * **LA PHRASE D'ACTION VIENT DU SERVEUR.** « X a commenté votre réel », « X
 * veut se connecter », « X a réagi 🔥 à votre story » : toutes sont composées
 * par `buildNotificationDisplay` (passerelle), dans la langue RÉSOLUE du
 * destinataire, et servies sur `notification:new` en `title` / `subtitle`. La
 * v3 n'en réécrit AUCUNE — c'est le critère de fin de l'écran, et c'est aussi
 * la seule façon d'être juste : le serveur connaît le type exact et la langue
 * du lecteur, la v3 ne connaît ni l'un ni l'autre au moment où le toast paraît.
 *
 * CE QUI EST ÉCRIT ICI, ET RIEN D'AUTRE : les littéraux de langue que les
 * conventions de `lib/notifications/banniere.ts` posent sur la loi partagée,
 * plus les deux noms accessibles du toast lui-même. La loi, elle, n'en porte
 * aucun — c'est ce qui lui permet de servir trois clients.
 *
 * AUCUN REPLI DE PHRASE, et c'est un choix assumé. Le web existant rejoue 115
 * lignes de phrases françaises pour ses lignes ANCIENNES ; les recopier ici
 * serait la troisième écriture de la loi que #4454 interdit. Sans phrase
 * servie, la v3 rend le seul nom de l'acteur — et rien du tout quand la charge
 * n'en porte pas : mieux vaut aucun toast qu'un toast qui dit « Quelqu'un ».
 */

export const BANNIERE = {
  /** Le nom accessible de la région qui annonce — jamais un titre visible. */
  region: 'Ce qui vient d’arriver',
  fermer: 'Fermer',
  /** `apercuDeMessage` — le résumé d'un message qui porte des pièces jointes. */
  photo: '📷 Photo',
  fichier: '📎 Fichier',
  /** `resumeDuMedia`, via `t` — les trois genres que la loi interroge. */
  media: {
    'attachments.photo': 'Photo',
    'attachments.video': 'Vidéo',
    'attachments.audio': 'Audio',
  },
  /**
   * LA SEULE COMPOSITION CLIENT DE TOUTE LA LOI — « X dans {groupe} ». Elle
   * reste au client parce que le nom d'un groupe peut être RENOMMÉ localement
   * par chaque membre : il n'existe que sur l'appareil, et le serveur ne peut
   * pas l'écrire.
   */
  dansLeGroupe: (qui: string, groupe: string): string => `${qui} dans « ${groupe} »`,
} as const;

/**
 * COMBIEN DE TEMPS LA BANNIÈRE RESTE. Sept secondes : assez pour lire deux
 * lignes sans se presser, assez peu pour ne pas couvrir l'écran de quelqu'un
 * qui écrit. Ce n'est PAS une mesure — aucune n'a été faite —, c'est une valeur
 * décidée, et la nommer ici plutôt que de l'enterrer dans le module est ce qui
 * permettra de la changer sur un retour d'usage.
 */
export const DUREE_DE_LA_BANNIERE_MS = 7000;
