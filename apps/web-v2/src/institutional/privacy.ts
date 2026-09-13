import type { ContentPage } from './type';

/**
 * « Politique de confidentialité » — le contenu de
 * `apps/web/locales/fr/privacy.json`, mot pour mot, dans l'ordre où la page
 * legacy le rend.
 *
 * `print` n'entre pas, pour la raison donnée dans `app/terms/contenu.ts` : un
 * bouton d'impression sur une page sans JavaScript serait inerte.
 * `footer.home` non plus — le retour à l'accueil est porté par l'en-tête de
 * chrome, à la même place sur les cinq pages, et le répéter en bas dédoublerait
 * un repère.
 *
 * ET AUCUNE ACCROCHE. Le catalogue n'en porte pas — la page legacy affiche son
 * titre, sa date, puis sa section « Introduction ». Lui en fabriquer une en
 * reprenant `introduction.content` faisait lire DEUX FOIS le même paragraphe,
 * l'un sous l'autre : c'est ce que le rendu a montré, et ce que le témoin
 * « aucune page ne répète son accroche en section » interdit désormais. La
 * description `<meta>`, elle, reste alimentée par ce texte — un résumé pour un
 * robot n'est pas un doublon pour un lecteur.
 */
export const PAGE_PRIVACY: ContentPage = {
  title: 'Politique de Confidentialité',
  mention: 'Dernière mise à jour : 29 janvier 2026',
  description: 'Chez Meeshy, nous prenons votre vie privée au sérieux. Cette politique explique comment nous collectons, utilisons et protégeons vos informations personnelles conformément au RGPD.',
  sections: [
    {
      title: 'Introduction',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Chez Meeshy, nous prenons votre vie privée au sérieux. Cette politique explique comment nous collectons, utilisons et protégeons vos informations personnelles conformément au RGPD.',
          ],
        },
      ],
    },
    {
      title: 'Informations Collectées',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Informations de Profil',
              items: [
                "Nom, prénom et nom d'utilisateur",
                'Adresse email',
                'Numéro de téléphone (optionnel)',
                'Date de naissance (optionnel, requis pour certaines fonctionnalités)',
                'Photo de profil et bannière (optionnels)',
              ],
            },
            {
              title: 'Préférences Linguistiques',
              items: [
                'Langue système principale',
                'Langues additionnelles (optionnel)',
                'Préférences de traduction automatique',
              ],
            },
            {
              title: 'Sécurité de Votre Compte',
              items: [
                'Mot de passe chiffré de manière sécurisée',
                'Double authentification (si activée)',
                'Clés de chiffrement pour protéger vos conversations privées',
                'Sessions actives sur vos appareils',
                'Journal des connexions pour votre sécurité',
              ],
            },
            {
              title: 'Informations Techniques',
              items: [
                'Adresse IP lors des connexions',
                'Localisation approximative (ville, pays)',
                "Type d'appareil et navigateur",
                'Fuseau horaire',
              ],
            },
            {
              title: 'Données Vocales',
              items: [
                'Votre consentement pour utiliser les fonctionnalités vocales',
                'Enregistrements audio (si vous utilisez les fonctions vocales)',
                "Vérification de l'âge (pour certaines fonctionnalités)",
              ],
            },
            {
              title: 'Messagerie et Traduction',
              items: [
                'Vos messages et leurs traductions',
                'Langues utilisées dans vos conversations',
                'Transcriptions audio (si activées)',
                'Historique de vos conversations',
              ],
            },
            {
              title: 'Vos Préférences',
              items: [
                'Paramètres de confidentialité',
                'Paramètres audio et vidéo',
                'Préférences de notifications',
                "Paramètres d'affichage (thème, langue)",
              ],
            },
            {
              title: 'Activité',
              items: [
                'Statut en ligne et dernière activité',
                'Liste des utilisateurs bloqués',
                'Vos conversations et communautés',
                'Mentions et réactions',
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'Utilisation de Vos Données',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Fourniture du service',
              body: 'Traduction en temps réel de vos messages et fonctionnement de toutes les fonctionnalités',
            },
            {
              title: 'Amélioration',
              body: "Développer de nouvelles fonctionnalités et améliorer l'expérience",
            },
            { title: 'Support', body: 'Répondre à vos questions et résoudre les problèmes' },
            { title: 'Sécurité', body: 'Protéger votre compte contre les abus et la fraude' },
            {
              title: 'Communication',
              body: 'Vous tenir informé des nouveautés et changements importants',
            },
          ],
        },
      ],
    },
    {
      title: 'Protection de Vos Données',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Chiffrement de Vos Conversations',
              body: 'Meeshy propose plusieurs niveaux de protection selon vos besoins : chiffrement de bout en bout (personne, même pas nous, ne peut lire vos messages), chiffrement serveur (vos messages sont protégés sur nos serveurs), ou conversations publiques. Toutes les communications sont sécurisées pendant leur transmission sur Internet.',
            },
            {
              title: 'Utilisateurs Sans Compte',
              body: 'Si vous utilisez Meeshy sans créer de compte, vos messages ne peuvent bénéficier que du chiffrement serveur. Pour une protection maximale, créez un compte et activez le chiffrement de bout en bout.',
            },
            {
              title: 'Stockage Sécurisé',
              body: 'Vos données sont stockées sur des serveurs sécurisés en Europe avec des sauvegardes régulières. Votre mot de passe est chiffré et ne peut jamais être lu en clair. Vos clés de chiffrement privées sont protégées.',
            },
            {
              title: 'Traitement Interne',
              body: "Les traductions sont effectuées directement sur nos serveurs sécurisés. Aucune donnée n'est envoyée à des services tiers comme Google ou Microsoft pour la traduction. Nous contrôlons tout le processus.",
            },
            {
              title: 'Journal de Sécurité',
              body: 'Nous conservons un historique de tous les événements de sécurité de votre compte : connexions, changements de mot de passe, activation de la double authentification. Vous pouvez consulter cet historique à tout moment dans vos paramètres.',
            },
          ],
        },
      ],
    },
    {
      title: 'Partage de Vos Données',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Nous ne vendons JAMAIS vos données personnelles. Nous ne partageons vos données que dans les cas suivants :',
          ],
        },
        {
          kind: 'list',
          items: [
            'Avec les autres participants de vos conversations (vos messages et traductions)',
            'Avec votre consentement explicite (export de données, partage de profil)',
            'Pour respecter nos obligations légales (réquisitions judiciaires)',
            'Avec des partenaires techniques de confiance (hébergement de serveurs) sous contrat de confidentialité stricte',
            'En cas de fusion ou acquisition (vous serez notifié au préalable)',
          ],
        },
        {
          kind: 'accent',
          body: "Aucune donnée n'est partagée avec des services tiers pour la traduction. Tout est fait en interne sur nos serveurs.",
        },
      ],
    },
    {
      title: 'Vos Droits',
      blocks: [
        { kind: 'paragraphes', body: ['Conformément au RGPD, vous avez les droits suivants :'] },
        {
          kind: 'list',
          items: [
            'Consulter toutes vos données personnelles',
            'Corriger des informations inexactes',
            'Supprimer votre compte et toutes vos données (avec une période de grâce de 30 jours)',
            'Exporter vos données dans un format standard',
            'Vous opposer au traitement de vos données',
            'Limiter le traitement dans certains cas',
            'Retirer votre consentement à tout moment',
          ],
        },
        {
          kind: 'accent',
          body: 'Pour exercer ces droits, rendez-vous dans Paramètres > Confidentialité ou contactez-nous à privacy@meeshy.me. Nous répondrons sous 30 jours.',
        },
      ],
    },
    {
      title: 'Conservation de Vos Données',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Nous conservons vos données tant que votre compte est actif. Si vous supprimez votre compte : (1) Période de grâce de 30 jours permettant la récupération ; (2) Après 30 jours, suppression définitive de toutes vos données personnelles ; (3) Les messages dans les conversations partagées sont anonymisés ; (4) Les journaux de sécurité sont conservés 90 jours ; (5) Les données de facturation selon les obligations légales.',
          ],
        },
        {
          kind: 'accent',
          body: 'Les profils vocaux expirent automatiquement selon votre âge : 18-25 ans = 5 ans, 26-40 ans = 10 ans, 41-60 ans = 15 ans, 60+ ans = 20 ans.',
        },
      ],
    },
    {
      title: 'Notifications',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Vous pouvez configurer individuellement les notifications pour les messages, appels, mentions, réactions, demandes d'ami, événements de sécurité, etc. Le mode Ne Pas Déranger vous permet de définir des plages horaires sans notifications (sauf alertes de sécurité critiques).",
          ],
        },
      ],
    },
    {
      title: 'Cookies',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Nous utilisons uniquement des cookies essentiels pour le fonctionnement du service (authentification, sessions, préférences). Aucun cookie publicitaire ou de tracking. Vous pouvez gérer vos préférences dans votre navigateur.',
          ],
        },
      ],
    },
    {
      title: 'Transferts Internationaux',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Vos données sont hébergées en France et dans l'Union Européenne. Si vous accédez à Meeshy depuis l'extérieur de l'UE, vos données peuvent être transférées vers l'UE avec toutes les protections RGPD.",
          ],
        },
      ],
    },
    {
      title: 'Mises à Jour',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Nous pouvons mettre à jour cette politique. Les changements importants vous seront notifiés par email et dans l'application. La date de dernière mise à jour est indiquée en haut de cette page.",
          ],
        },
      ],
    },
    {
      title: 'Nous Contacter',
      blocks: [
        {
          kind: 'paragraphes',
          body: ['Pour toute question concernant vos données personnelles ou pour exercer vos droits :'],
        },
        {
          kind: 'encadre',
          rows: [
            { text: 'Email : privacy@meeshy.me', href: 'mailto:privacy@meeshy.me' },
            { text: 'Adresse postale : 12 Rue de la Paix, 75002 Paris, France' },
            { text: 'Délai de réponse : Maximum 30 jours' },
          ],
        },
        {
          kind: 'accent',
          body: "En cas de litige, vous pouvez déposer une plainte auprès de la CNIL (Commission Nationale de l'Informatique et des Libertés) : www.cnil.fr",
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
    ],
  },
};
