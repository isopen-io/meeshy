import type { ContentPage } from './type';

/**
 * « FAQ » — la seconde adresse que l'app PUBLIÉE ouvre (#7287).
 *
 * `SupportView.swift:65` vise `https://meeshy.me/faq`, juste sous « Centre
 * d'aide ». Même contrainte : le lien est dans le binaire distribué.
 *
 * ORIENTÉE QUESTION, là où `/help` est orientée GESTE — voir le doc-comment de
 * `help.ts` pour la raison. Chaque section porte des CARTES dont le titre est
 * la question et le corps la réponse : c'est la forme que le rendu partagé sait
 * déjà donner à une paire, sans ajouter un sixième genre de bloc au type somme.
 *
 * LES RÉPONSES ENGAGENT. Ce document est public et lu par des gens qui ont un
 * problème : une réponse approximative sur le chiffrement ou sur la suppression
 * d'un compte coûte plus cher que pas de réponse du tout. Ce qui est écrit ici
 * est ce que le produit FAIT — pas ce qu'il prévoit de faire.
 *
 * FRANÇAIS SEUL, comme ses six voisines (suivi ouvert pour les six autres
 * langues).
 */
export const PAGE_FAQ: ContentPage = {
  title: 'Questions fréquentes',
  hero: 'Les questions qui reviennent le plus souvent, avec des réponses courtes.',
  description:
    'Questions fréquentes sur Meeshy : traduction automatique, langues, messages vocaux, confidentialité, compte et facturation.',
  sections: [
    {
      title: 'La traduction',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Dois-je activer la traduction ?',
              body: "Non. Elle est active par défaut et s'applique à tout : messages, transcriptions de vocaux, publications. Vous n'avez qu'à indiquer dans quelle langue vous voulez lire.",
            },
            {
              title: 'Qui traduit mes messages ?',
              body: 'Nos propres serveurs, avec nos modèles. Vos messages ne sont pas envoyés à un service de traduction tiers — c’est la raison pour laquelle nous ne nous appuyons pas sur une API externe.',
            },
            {
              title: 'La traduction est-elle parfaite ?',
              body: "Non, aucune ne l'est. Elle est bonne sur les échanges courants et se trompe parfois sur l'ironie, l'argot ou un terme très spécialisé. L'original reste accessible d'un appui long, et c'est lui qui fait foi.",
            },
            {
              title: 'Puis-je voir le message original ?',
              body: 'Oui, par un appui long sur le message. Vous pouvez aussi afficher une autre langue parmi celles qui sont disponibles.',
            },
          ],
        },
      ],
    },
    {
      title: 'Les langues',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Combien de langues sont prises en charge ?',
              body: '76 langues, dont un grand nombre de langues africaines, asiatiques et autochtones que les services grand public ignorent.',
            },
            {
              title: "Pourquoi l'app n'est-elle pas dans la langue de mon téléphone ?",
              body: "Parce que vos réglages Meeshy priment sur ceux de l'appareil. Un francophone qui a un téléphone en anglais continue de lire en français. La langue de l'appareil n'intervient que si aucune de vos langues n'est disponible.",
            },
            {
              title: 'Puis-je lire dans une langue et écrire dans une autre ?',
              body: "Oui. Écrivez dans la langue qui vous vient ; Meeshy la détecte et traduit pour chaque lecteur dans SA langue. Vous n'avez jamais à choisir la langue du destinataire.",
            },
            {
              title: 'Et dans un groupe où chacun parle une langue différente ?',
              body: "C'est le cas nominal : chaque membre lit le même message dans sa propre langue. Rien de particulier à régler.",
            },
          ],
        },
      ],
    },
    {
      title: 'Les messages vocaux',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Un vocal est-il traduit lui aussi ?',
              body: "Oui, et deux fois : il est transcrit puis la transcription est traduite, et une piste audio est générée dans votre langue. Vous pouvez donc le LIRE ou l'ÉCOUTER dans votre langue.",
            },
            {
              title: 'Puis-je entendre la voix originale ?',
              body: 'Oui. Le bouton de langue sous le vocal bascule entre la piste traduite et l’enregistrement original.',
            },
            {
              title: 'Pourquoi la transcription met-elle quelques secondes ?',
              body: "Les trois étapes sont calculées à l'arrivée du message. Le vocal original, lui, est écoutable immédiatement — vous n'attendez jamais pour l'entendre.",
            },
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
              title: 'Mes conversations sont-elles chiffrées ?',
              body: 'Les conversations privées sont chiffrées de bout en bout.',
            },
            {
              title: 'Vendez-vous mes données ?',
              body: 'Non. Nous ne vendons ni ne cédons vos données, et nous ne les utilisons pas pour de la publicité ciblée. Le détail figure dans notre politique de confidentialité.',
            },
            {
              title: "Qu'est-ce qu'un message à vue unique ?",
              body: "Un message qui n'est consultable qu'une fois. Son contenu n'apparaît pas non plus dans les notifications — ni le texte, ni l'image, ni la transcription d'un vocal.",
            },
            {
              title: 'Comment bloquer ou signaler quelqu’un ?',
              body: "Depuis sa fiche, ou par un appui long sur l'un de ses messages. Le blocage prend effet immédiatement et la personne n'en est pas informée.",
            },
          ],
        },
      ],
    },
    {
      title: 'Le compte',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Meeshy est-il payant ?',
              body: "L'application et la traduction sont gratuites à l'usage. Aucune carte bancaire n'est demandée pour créer un compte.",
            },
            {
              title: 'Puis-je utiliser Meeshy sans créer de compte ?',
              body: "Oui, sur invitation : un lien de partage ouvre une conversation sans compte. Les autres écrans — le fil, les communautés, vos réglages — en demandent un.",
            },
            {
              title: "J'ai oublié mon mot de passe.",
              body: "Depuis l'écran de connexion, « Mot de passe oublié » envoie un lien à votre adresse e-mail. Vous pouvez aussi vous connecter directement par un lien magique, sans mot de passe.",
            },
            {
              title: 'Comment récupérer une copie de mes données ?',
              body: 'Réglages › Exporter mes données. Nous vous envoyons une archive de ce que votre compte contient.',
            },
            {
              title: 'Comment supprimer mon compte ?',
              body: 'Réglages › Supprimer le compte. La suppression est définitive : exportez vos données avant si vous voulez en garder une trace.',
            },
          ],
        },
      ],
    },
    {
      title: 'Votre question n’est pas là ?',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Écrivez-nous. Précisez votre appareil et la version de l'application (Réglages › À propos) : c'est ce qui nous fait gagner un aller-retour.",
          ],
        },
        {
          kind: 'encadre',
          rows: [{ text: 'support@meeshy.me', href: 'mailto:support@meeshy.me' }],
        },
      ],
    },
  ],
  run: {
    title: 'Pour aller plus loin',
    links: [
      { label: "Centre d'aide", href: '/help' },
      { label: 'Nous contacter', href: '/contact' },
      { label: 'Confidentialité', href: '/privacy' },
    ],
  },
};
