import type { ContentPage } from './type';

/**
 * « Conditions d'utilisation » — le contenu de `apps/web/locales/fr/terms.json`,
 * mot pour mot, dans l'ordre où la page legacy le rend.
 *
 * `print` N'ENTRE PAS. Le legacy monte un bouton « Imprimer » qui appelle
 * `window.print()` : sur une page v3, qui n'embarque aucun JavaScript
 * applicatif, ce bouton serait INERTE — un contrôle qui existe sans avoir
 * d'effet, ce que la loi 4 interdit. Le geste natif du navigateur
 * (⌘P / Ctrl+P) reste disponible et fait exactement la même chose.
 *
 * `intro` MONTE EN ACCROCHE, et c'est le seul ajout. Le catalogue le porte, la
 * page legacy ne le rend nulle part — un texte écrit puis perdu. Il dit
 * exactement ce qu'une accroche doit dire, et la page en manquait une.
 */
export const PAGE_TERMS: ContentPage = {
  title: "Conditions d'Utilisation",
  hero: 'Bienvenue sur Meeshy. En utilisant notre service, vous acceptez les conditions suivantes :',
  mention: 'Dernière mise à jour : 23 août 2026',
  description: 'Bienvenue sur Meeshy. En utilisant notre service, vous acceptez les conditions suivantes :',
  sections: [
    {
      title: 'Acceptation des Conditions',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "En utilisant Meeshy, vous acceptez d'être lié par ces conditions d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser notre service.",
          ],
        },
      ],
    },
    {
      title: 'Description du Service',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Meeshy est une plateforme de messagerie avec traduction en temps réel qui permet aux utilisateurs de communiquer dans différentes langues.',
          ],
        },
      ],
    },
    {
      title: 'Compte Utilisateur',
      blocks: [
        {
          kind: 'paragraphes',
          body: ['Pour utiliser certaines fonctionnalités, vous devez créer un compte :'],
        },
        {
          kind: 'list',
          items: [
            'Maintenir la confidentialité de votre mot de passe',
            'Être responsable de toutes les activités sous votre compte',
            'Notifier immédiatement tout accès non autorisé',
            'Fournir des informations exactes et à jour',
          ],
        },
        {
          kind: 'accent',
          body: "Note : Les utilisateurs anonymes n'ont pas de clé de chiffrement personnelle. Leurs données ne peuvent donc pas être chiffrées au repos. Pour une sécurité maximale, créez un compte utilisateur.",
        },
      ],
    },
    {
      title: 'Utilisation Acceptable',
      blocks: [
        { kind: 'paragraphes', body: ['Vous acceptez de ne pas utiliser Meeshy pour :'] },
        {
          kind: 'list',
          items: [
            'Publier du contenu illégal, offensant ou nuisible',
            'Violer les droits de propriété intellectuelle',
            "Harceler, menacer ou intimider d'autres utilisateurs",
            'Diffuser du spam ou du contenu commercial non sollicité',
            "Tenter d'accéder sans autorisation aux systèmes",
          ],
        },
      ],
    },
    {
      title: 'Contenu Utilisateur',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Vous conservez la propriété de votre contenu',
            'Vous accordez à Meeshy une licence pour utiliser votre contenu dans le but de fournir le service',
            "En contrepartie, nous nous engageons à créditer l'auteur de tout contenu publié, y compris lorsqu'il est transféré ou republié, partout où son origine peut être tracée. Cet engagement est de moyens : la mention peut être absente ou incomplète si nos systèmes ne conservent pas ce lien, ou si les réglages de confidentialité des personnes concernées, y compris ceux de l'auteur, s'y opposent.",
            'Vous êtes responsable du contenu que vous publiez',
          ],
        },
      ],
    },
    {
      title: 'Limitation de Responsabilité',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Meeshy est fourni \"tel quel\" sans garanties d'aucune sorte. Nous ne sommes pas responsables des dommages résultant de l'utilisation ou de l'impossibilité d'utiliser le service.",
          ],
        },
      ],
    },
    {
      title: 'Résiliation',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Nous nous réservons le droit de suspendre ou de résilier votre compte à tout moment, avec ou sans préavis, pour violation de ces conditions.',
          ],
        },
      ],
    },
    {
      title: 'Modifications des Conditions',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Nous pouvons modifier ces conditions à tout moment. Les changements importants seront notifiés par email ou via une notification sur la plateforme.',
          ],
        },
      ],
    },
    {
      title: 'Droit Applicable',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Ces conditions sont régies par les lois françaises. Tout litige sera soumis à la juridiction exclusive des tribunaux de Paris.',
          ],
        },
      ],
    },
    {
      title: 'Contact',
      blocks: [
        {
          kind: 'paragraphes',
          body: ["Pour toute question concernant ces conditions d'utilisation, veuillez nous contacter :"],
        },
        {
          kind: 'encadre',
          rows: [
            { text: 'Email : legal@meeshy.me', href: 'mailto:legal@meeshy.me' },
            { text: 'Adresse : 12 Rue de la Paix, 75002 Paris, France' },
          ],
        },
      ],
    },
  ],
  run: {
    title: 'Liens Utiles',
    links: [
      { label: 'À propos', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Partenaires', href: '/partners' },
      { label: 'Politique de confidentialité', href: '/privacy' },
    ],
  },
};
