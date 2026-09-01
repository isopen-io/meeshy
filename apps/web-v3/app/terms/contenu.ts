import type { PageDeContenu } from '@/app/institutionnel/document';

/**
 * « Conditions d'utilisation » — le contenu de `apps/web/locales/fr/terms.json`,
 * mot pour mot, dans l'ordre où la page legacy le rend.
 *
 * `print` N'ENTRE PAS. Le legacy monte un bouton « Imprimer » qui appelle
 * `window.print()` : sur une page v3, qui n'embarque aucun JavaScript
 * applicatif, ce bouton serait INERTE — un contrôle qui existe sans avoir
 * d'effet, ce que la loi 4 interdit. Le geste natif du navigateur
 * (⌘P / Ctrl+P) reste disponible et fait exactement la même chose.
 */
export const PAGE_CONDITIONS: PageDeContenu = {
  titre: "Conditions d'Utilisation",
  accroche: 'Bienvenue sur Meeshy. En utilisant notre service, vous acceptez les conditions suivantes :',
  mention: 'Dernière mise à jour : 23 août 2026',
  description: 'Bienvenue sur Meeshy. En utilisant notre service, vous acceptez les conditions suivantes :',
  sections: [
    {
      titre: 'Acceptation des Conditions',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "En utilisant Meeshy, vous acceptez d'être lié par ces conditions d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser notre service.",
          ],
        },
      ],
    },
    {
      titre: 'Description du Service',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Meeshy est une plateforme de messagerie avec traduction en temps réel qui permet aux utilisateurs de communiquer dans différentes langues.',
          ],
        },
      ],
    },
    {
      titre: 'Compte Utilisateur',
      blocs: [
        {
          genre: 'paragraphes',
          corps: ['Pour utiliser certaines fonctionnalités, vous devez créer un compte :'],
        },
        {
          genre: 'liste',
          items: [
            'Maintenir la confidentialité de votre mot de passe',
            'Être responsable de toutes les activités sous votre compte',
            'Notifier immédiatement tout accès non autorisé',
            'Fournir des informations exactes et à jour',
          ],
        },
        {
          genre: 'accent',
          corps: "Note : Les utilisateurs anonymes n'ont pas de clé de chiffrement personnelle. Leurs données ne peuvent donc pas être chiffrées au repos. Pour une sécurité maximale, créez un compte utilisateur.",
        },
      ],
    },
    {
      titre: 'Utilisation Acceptable',
      blocs: [
        { genre: 'paragraphes', corps: ['Vous acceptez de ne pas utiliser Meeshy pour :'] },
        {
          genre: 'liste',
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
      titre: 'Contenu Utilisateur',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Vous conservez la propriété de votre contenu',
            'Vous accordez à Meeshy une licence pour utiliser votre contenu dans le but de fournir le service',
            "En contrepartie, nous nous engageons à créditer l'auteur de tout contenu publié, y compris lorsqu'il est transféré ou republié, partout où son origine peut être tracée. Cet engagement est de moyens : la mention peut être absente ou incomplète si nos systèmes ne conservent pas ce lien, ou si les réglages de confidentialité des personnes concernées, y compris ceux de l'auteur, s'y opposent.",
            'Vous êtes responsable du contenu que vous publiez',
          ],
        },
      ],
    },
    {
      titre: 'Limitation de Responsabilité',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Meeshy est fourni \"tel quel\" sans garanties d'aucune sorte. Nous ne sommes pas responsables des dommages résultant de l'utilisation ou de l'impossibilité d'utiliser le service.",
          ],
        },
      ],
    },
    {
      titre: 'Résiliation',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Nous nous réservons le droit de suspendre ou de résilier votre compte à tout moment, avec ou sans préavis, pour violation de ces conditions.',
          ],
        },
      ],
    },
    {
      titre: 'Modifications des Conditions',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Nous pouvons modifier ces conditions à tout moment. Les changements importants seront notifiés par email ou via une notification sur la plateforme.',
          ],
        },
      ],
    },
    {
      titre: 'Droit Applicable',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Ces conditions sont régies par les lois françaises. Tout litige sera soumis à la juridiction exclusive des tribunaux de Paris.',
          ],
        },
      ],
    },
    {
      titre: 'Contact',
      blocs: [
        {
          genre: 'paragraphes',
          corps: ["Pour toute question concernant ces conditions d'utilisation, veuillez nous contacter :"],
        },
        {
          genre: 'encadre',
          lignes: [
            { texte: 'Email : legal@meeshy.me', href: 'mailto:legal@meeshy.me' },
            { texte: 'Adresse : 12 Rue de la Paix, 75002 Paris, France' },
          ],
        },
      ],
    },
  ],
  suite: {
    titre: 'Liens Utiles',
    liens: [
      { libelle: 'À propos', href: '/about' },
      { libelle: 'Contact', href: '/contact' },
      { libelle: 'Partenaires', href: '/partners' },
      { libelle: 'Politique de confidentialité', href: '/privacy' },
    ],
  },
};
