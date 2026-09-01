import type { PageDeContenu } from '@/app/institutionnel/document';

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
 */
export const PAGE_CONFIDENTIALITE: PageDeContenu = {
  titre: 'Politique de Confidentialité',
  accroche: 'Chez Meeshy, nous prenons votre vie privée au sérieux. Cette politique explique comment nous collectons, utilisons et protégeons vos informations personnelles conformément au RGPD.',
  mention: 'Dernière mise à jour : 29 janvier 2026',
  description: 'Chez Meeshy, nous prenons votre vie privée au sérieux. Cette politique explique comment nous collectons, utilisons et protégeons vos informations personnelles conformément au RGPD.',
  sections: [
    {
      titre: 'Introduction',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Chez Meeshy, nous prenons votre vie privée au sérieux. Cette politique explique comment nous collectons, utilisons et protégeons vos informations personnelles conformément au RGPD.',
          ],
        },
      ],
    },
    {
      titre: 'Informations Collectées',
      blocs: [
        {
          genre: 'cartes',
          cartes: [
            {
              titre: 'Informations de Profil',
              items: [
                "Nom, prénom et nom d'utilisateur",
                'Adresse email',
                'Numéro de téléphone (optionnel)',
                'Date de naissance (optionnel, requis pour certaines fonctionnalités)',
                'Photo de profil et bannière (optionnels)',
              ],
            },
            {
              titre: 'Préférences Linguistiques',
              items: [
                'Langue système principale',
                'Langues additionnelles (optionnel)',
                'Préférences de traduction automatique',
              ],
            },
            {
              titre: 'Sécurité de Votre Compte',
              items: [
                'Mot de passe chiffré de manière sécurisée',
                'Double authentification (si activée)',
                'Clés de chiffrement pour protéger vos conversations privées',
                'Sessions actives sur vos appareils',
                'Journal des connexions pour votre sécurité',
              ],
            },
            {
              titre: 'Informations Techniques',
              items: [
                'Adresse IP lors des connexions',
                'Localisation approximative (ville, pays)',
                "Type d'appareil et navigateur",
                'Fuseau horaire',
              ],
            },
            {
              titre: 'Données Vocales',
              items: [
                'Votre consentement pour utiliser les fonctionnalités vocales',
                'Enregistrements audio (si vous utilisez les fonctions vocales)',
                "Vérification de l'âge (pour certaines fonctionnalités)",
              ],
            },
            {
              titre: 'Messagerie et Traduction',
              items: [
                'Vos messages et leurs traductions',
                'Langues utilisées dans vos conversations',
                'Transcriptions audio (si activées)',
                'Historique de vos conversations',
              ],
            },
            {
              titre: 'Vos Préférences',
              items: [
                'Paramètres de confidentialité',
                'Paramètres audio et vidéo',
                'Préférences de notifications',
                "Paramètres d'affichage (thème, langue)",
              ],
            },
            {
              titre: 'Activité',
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
      titre: 'Utilisation de Vos Données',
      blocs: [
        {
          genre: 'cartes',
          cartes: [
            {
              titre: 'Fourniture du service',
              corps: 'Traduction en temps réel de vos messages et fonctionnement de toutes les fonctionnalités',
            },
            {
              titre: 'Amélioration',
              corps: "Développer de nouvelles fonctionnalités et améliorer l'expérience",
            },
            { titre: 'Support', corps: 'Répondre à vos questions et résoudre les problèmes' },
            { titre: 'Sécurité', corps: 'Protéger votre compte contre les abus et la fraude' },
            {
              titre: 'Communication',
              corps: 'Vous tenir informé des nouveautés et changements importants',
            },
          ],
        },
      ],
    },
    {
      titre: 'Protection de Vos Données',
      blocs: [
        {
          genre: 'cartes',
          cartes: [
            {
              titre: 'Chiffrement de Vos Conversations',
              corps: 'Meeshy propose plusieurs niveaux de protection selon vos besoins : chiffrement de bout en bout (personne, même pas nous, ne peut lire vos messages), chiffrement serveur (vos messages sont protégés sur nos serveurs), ou conversations publiques. Toutes les communications sont sécurisées pendant leur transmission sur Internet.',
            },
            {
              titre: 'Utilisateurs Sans Compte',
              corps: 'Si vous utilisez Meeshy sans créer de compte, vos messages ne peuvent bénéficier que du chiffrement serveur. Pour une protection maximale, créez un compte et activez le chiffrement de bout en bout.',
            },
            {
              titre: 'Stockage Sécurisé',
              corps: 'Vos données sont stockées sur des serveurs sécurisés en Europe avec des sauvegardes régulières. Votre mot de passe est chiffré et ne peut jamais être lu en clair. Vos clés de chiffrement privées sont protégées.',
            },
            {
              titre: 'Traitement Interne',
              corps: "Les traductions sont effectuées directement sur nos serveurs sécurisés. Aucune donnée n'est envoyée à des services tiers comme Google ou Microsoft pour la traduction. Nous contrôlons tout le processus.",
            },
            {
              titre: 'Journal de Sécurité',
              corps: 'Nous conservons un historique de tous les événements de sécurité de votre compte : connexions, changements de mot de passe, activation de la double authentification. Vous pouvez consulter cet historique à tout moment dans vos paramètres.',
            },
          ],
        },
      ],
    },
    {
      titre: 'Partage de Vos Données',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Nous ne vendons JAMAIS vos données personnelles. Nous ne partageons vos données que dans les cas suivants :',
          ],
        },
        {
          genre: 'liste',
          items: [
            'Avec les autres participants de vos conversations (vos messages et traductions)',
            'Avec votre consentement explicite (export de données, partage de profil)',
            'Pour respecter nos obligations légales (réquisitions judiciaires)',
            'Avec des partenaires techniques de confiance (hébergement de serveurs) sous contrat de confidentialité stricte',
            'En cas de fusion ou acquisition (vous serez notifié au préalable)',
          ],
        },
        {
          genre: 'accent',
          corps: "Aucune donnée n'est partagée avec des services tiers pour la traduction. Tout est fait en interne sur nos serveurs.",
        },
      ],
    },
    {
      titre: 'Vos Droits',
      blocs: [
        { genre: 'paragraphes', corps: ['Conformément au RGPD, vous avez les droits suivants :'] },
        {
          genre: 'liste',
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
          genre: 'accent',
          corps: 'Pour exercer ces droits, rendez-vous dans Paramètres > Confidentialité ou contactez-nous à privacy@meeshy.me. Nous répondrons sous 30 jours.',
        },
      ],
    },
    {
      titre: 'Conservation de Vos Données',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Nous conservons vos données tant que votre compte est actif. Si vous supprimez votre compte : (1) Période de grâce de 30 jours permettant la récupération ; (2) Après 30 jours, suppression définitive de toutes vos données personnelles ; (3) Les messages dans les conversations partagées sont anonymisés ; (4) Les journaux de sécurité sont conservés 90 jours ; (5) Les données de facturation selon les obligations légales.',
          ],
        },
        {
          genre: 'accent',
          corps: 'Les profils vocaux expirent automatiquement selon votre âge : 18-25 ans = 5 ans, 26-40 ans = 10 ans, 41-60 ans = 15 ans, 60+ ans = 20 ans.',
        },
      ],
    },
    {
      titre: 'Notifications',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Vous pouvez configurer individuellement les notifications pour les messages, appels, mentions, réactions, demandes d'ami, événements de sécurité, etc. Le mode Ne Pas Déranger vous permet de définir des plages horaires sans notifications (sauf alertes de sécurité critiques).",
          ],
        },
      ],
    },
    {
      titre: 'Cookies',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Nous utilisons uniquement des cookies essentiels pour le fonctionnement du service (authentification, sessions, préférences). Aucun cookie publicitaire ou de tracking. Vous pouvez gérer vos préférences dans votre navigateur.',
          ],
        },
      ],
    },
    {
      titre: 'Transferts Internationaux',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Vos données sont hébergées en France et dans l'Union Européenne. Si vous accédez à Meeshy depuis l'extérieur de l'UE, vos données peuvent être transférées vers l'UE avec toutes les protections RGPD.",
          ],
        },
      ],
    },
    {
      titre: 'Mises à Jour',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Nous pouvons mettre à jour cette politique. Les changements importants vous seront notifiés par email et dans l'application. La date de dernière mise à jour est indiquée en haut de cette page.",
          ],
        },
      ],
    },
    {
      titre: 'Nous Contacter',
      blocs: [
        {
          genre: 'paragraphes',
          corps: ['Pour toute question concernant vos données personnelles ou pour exercer vos droits :'],
        },
        {
          genre: 'encadre',
          lignes: [
            { texte: 'Email : privacy@meeshy.me', href: 'mailto:privacy@meeshy.me' },
            { texte: 'Adresse postale : 12 Rue de la Paix, 75002 Paris, France' },
            { texte: 'Délai de réponse : Maximum 30 jours' },
          ],
        },
        {
          genre: 'accent',
          corps: "En cas de litige, vous pouvez déposer une plainte auprès de la CNIL (Commission Nationale de l'Informatique et des Libertés) : www.cnil.fr",
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
    ],
  },
};
