import type { ContentPage } from './type';

/**
 * « Centre d'aide » — l'adresse que l'app PUBLIÉE ouvre (#7287).
 *
 * `SupportView.swift:64` vise `https://meeshy.me/help`. Ce lien est dans le
 * binaire distribué sur l'App Store : il ne se corrige pas côté iOS sans une
 * nouvelle revue, et il rendait « adresse inconnue » depuis la bascule de
 * meeshy.me sur la v2.
 *
 * CONTENU ÉCRIT POUR CE LOT, et c'est le seul des sept documents
 * institutionnels dans ce cas : les cinq autres reprennent
 * `apps/web/locales/fr/` mot pour mot, mais le legacy n'a jamais servi de page
 * d'aide — il n'y avait rien à reprendre.
 *
 * ORIENTÉ GESTE, là où `/faq` est orientée QUESTION. La séparation n'est pas
 * cosmétique : quelqu'un qui arrive de « Centre d'aide » cherche COMMENT faire
 * quelque chose, quelqu'un qui arrive de « FAQ » cherche SI quelque chose est
 * vrai. Servir le même texte aux deux adresses aurait fait rater l'un des deux.
 *
 * FRANÇAIS SEUL, comme ses six voisines — voir le suivi ouvert pour les six
 * autres langues. Une page en français vaut mieux qu'une page introuvable ;
 * elle ne vaut pas mieux qu'une page dans la langue du lecteur.
 */
export const PAGE_HELP: ContentPage = {
  title: "Centre d'aide",
  hero: "Comment faire ce que vous cherchez à faire — dans l'ordre où l'on s'y heurte quand on découvre Meeshy.",
  description:
    "Le centre d'aide de Meeshy : premiers pas, traduction automatique, messages vocaux, confidentialité et gestion du compte.",
  sections: [
    {
      title: 'Premiers pas',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Meeshy traduit ce que vous recevez dans la langue que vous avez choisie, et traduit ce que vous écrivez pour ceux qui vous lisent. Trois réglages suffisent pour que tout le reste fonctionne sans y penser.",
          ],
        },
        {
          kind: 'cartes',
          cards: [
            {
              title: '1. Choisir sa langue principale',
              body: "Réglages › Langues. C'est la langue dans laquelle vous LISEZ tout : messages, transcriptions de vocaux, publications. Elle prime sur la langue de votre téléphone.",
            },
            {
              title: '2. Ajouter une langue secondaire',
              body: "Facultatif, et utile si vous lisez deux langues. Quand une traduction manque dans votre langue principale, Meeshy sert la secondaire avant de revenir à l'original.",
            },
            {
              title: '3. Retrouver ses contacts',
              body: "Découvrir vous propose des personnes à rejoindre. Vous pouvez aussi inviter quelqu'un par un lien de partage, sans qu'il ait à créer un compte pour entrer dans la conversation.",
            },
          ],
        },
      ],
    },
    {
      title: 'Lire et écrire dans sa langue',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Vous n'avez rien à déclencher : chaque message arrive déjà traduit. La traduction se fait sur nos serveurs, pas chez un tiers, et elle est calculée à la réception — c'est pourquoi elle est là avant que vous ouvriez la conversation.",
          ],
        },
        {
          kind: 'list',
          items: [
            "Une petite icône de traduction signale un message qui a été traduit — elle ne s'affiche que là où c'est le cas.",
            "Appui long sur un message pour voir l'ORIGINAL, dans la langue de celui qui l'a écrit.",
            "Depuis l'original, vous pouvez aussi afficher une autre langue disponible.",
            "Si aucune traduction n'existe vers votre langue, c'est en général que le message y est DÉJÀ écrit.",
          ],
        },
        {
          kind: 'accent',
          body: "Écrivez toujours dans VOTRE langue. C'est la traduction qui s'adapte à chaque lecteur, jamais l'inverse — personne n'a à faire l'effort de deviner la langue des autres.",
        },
      ],
    },
    {
      title: 'Les messages vocaux',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Un vocal envoyé sur Meeshy traverse trois étapes automatiquement : il est transcrit, la transcription est traduite, puis une piste audio est générée dans la langue du destinataire.',
          ],
        },
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Enregistrer',
              body: "Maintenez le bouton micro dans la zone de saisie. Relâchez pour envoyer, glissez pour annuler.",
            },
            {
              title: 'Lire sans écouter',
              body: "La transcription s'affiche sous le vocal, dans votre langue. Utile en réunion, dans les transports, ou quand le son n'est pas une option.",
            },
            {
              title: 'Écouter dans sa langue',
              body: "Quand la piste traduite est prête, c'est elle qui est jouée. Le bouton de langue sous le vocal permet de revenir à la voix originale.",
            },
          ],
        },
        {
          kind: 'paragraphes',
          body: [
            "Les trois étapes prennent quelques secondes. Le vocal est écoutable dans sa version originale immédiatement — vous n'attendez jamais la traduction pour l'entendre.",
          ],
        },
      ],
    },
    {
      title: 'Conversations, groupes et communautés',
      blocks: [
        {
          kind: 'list',
          items: [
            'Une conversation directe se crée depuis Découvrir ou depuis la fiche de quelqu’un.',
            "Un groupe réunit plusieurs personnes ; chacune y lit dans SA langue, ce qui rend les groupes multilingues aussi simples que les autres.",
            "Un lien de partage ouvre une conversation à quelqu'un qui n'a pas de compte. Vous gardez la main : le lien peut être désactivé à tout moment depuis Mes liens.",
            'Une communauté regroupe plusieurs conversations autour d’un sujet ou d’une organisation.',
          ],
        },
      ],
    },
    {
      title: 'Confidentialité et sécurité',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Chiffrement de bout en bout',
              body: 'Les conversations privées sont chiffrées. Les traductions sont calculées sur nos serveurs, jamais envoyées à un service tiers.',
            },
            {
              title: 'Message éphémère',
              body: "Il disparaît après le délai que vous fixez, chez vous comme chez le destinataire.",
            },
            {
              title: 'Vue unique',
              body: "Ouvert une fois, il n'est plus consultable. Son contenu n'apparaît pas non plus dans les notifications.",
            },
            {
              title: 'Bloquer et signaler',
              body: "Depuis la fiche d'une personne ou l'appui long sur un message. Un blocage est immédiat et ne prévient pas la personne bloquée.",
            },
          ],
        },
      ],
    },
    {
      title: 'Votre compte',
      blocks: [
        {
          kind: 'list',
          items: [
            'Modifier votre profil, votre photo et vos langues : Réglages › Profil.',
            'Choisir ce qui vous notifie, et par quel canal : Réglages › Notifications.',
            'Obtenir une copie de vos données : Réglages › Exporter mes données.',
            'Supprimer votre compte et tout ce qu’il contient : Réglages › Supprimer le compte.',
          ],
        },
        {
          kind: 'accent',
          body: "La suppression est définitive et ne se rattrape pas. Exportez vos données avant, si vous voulez en garder une trace.",
        },
      ],
    },
    {
      title: 'Toujours bloqué ?',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Écrivez-nous en décrivant ce que vous avez tenté et ce qui s'est produit. Précisez votre appareil et la version de l'application (Réglages › À propos) : c'est ce qui nous fait gagner un aller-retour.",
          ],
        },
        {
          kind: 'encadre',
          rows: [
            { text: 'support@meeshy.me', href: 'mailto:support@meeshy.me' },
            { text: 'Du lundi au vendredi, 9h00 - 18h00 (heure de Paris)' },
          ],
        },
      ],
    },
  ],
  run: {
    title: 'Pour aller plus loin',
    links: [
      { label: 'FAQ', href: '/faq' },
      { label: 'Nous contacter', href: '/contact' },
      { label: 'Confidentialité', href: '/privacy' },
    ],
  },
};
