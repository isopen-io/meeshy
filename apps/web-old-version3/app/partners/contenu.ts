import type { PageDeContenu } from '@/app/institutionnel/document';

/**
 * « Partenaires » — le contenu de `apps/web/locales/fr/partners.json`, mot pour
 * mot, dans l'ordre où la page legacy le rend.
 *
 * `become.api` (« Documentation API ») n'entre PAS dans la rangée de suite :
 * le legacy le rend en bouton, mais la v3 ne sert aucune documentation d'API et
 * le legacy non plus — c'est un lien sans destination, donc un contrôle qui
 * ment. Il reviendra le jour où la page qu'il annonce existera.
 */
export const PAGE_PARTENAIRES: PageDeContenu = {
  titre: 'Devenez Partenaire',
  accroche: 'Rejoignez notre écosystème et développez votre activité avec Meeshy',
  description: 'Rejoignez notre écosystème et développez votre activité avec Meeshy',
  sections: [
    {
      titre: 'Solutions Entreprise',
      blocs: [
        {
          genre: 'paragraphes',
          corps: ['Des solutions sur mesure pour les grandes organisations avec des besoins spécifiques'],
        },
        {
          genre: 'liste',
          items: [
            'Déploiement sur site ou cloud privé',
            'Authentification SSO (SAML, OAuth)',
            'Analytics et rapports avancés',
            'Support prioritaire 24/7',
            "Personnalisation complète de l'interface",
          ],
        },
        { genre: 'accent', corps: 'Tarification personnalisée' },
      ],
    },
    {
      titre: 'Solutions Éducation',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Facilitez l'apprentissage multilingue et la collaboration internationale",
          ],
        },
        {
          genre: 'liste',
          items: [
            'Salles de classe virtuelles multilingues',
            "Support pour les programmes d'échange",
            "Outils d'apprentissage intégrés",
            'Gestion centralisée des comptes',
            'Intégration avec les plateformes LMS',
          ],
        },
        { genre: 'accent', corps: "Tarifs préférentiels pour l'éducation" },
      ],
    },
    {
      titre: 'Partenaires Technologiques',
      blocs: [
        { genre: 'paragraphes', corps: ['Intégrez Meeshy dans vos solutions'] },
        {
          genre: 'liste',
          items: [
            'API REST complète et documentée',
            'SDK disponibles (JavaScript, Python, Go)',
            "Webhooks pour l'intégration en temps réel",
            'Documentation technique détaillée et exemples',
          ],
        },
      ],
    },
    {
      titre: 'Options de Déploiement',
      blocs: [
        {
          genre: 'cartes',
          cartes: [
            {
              titre: 'Sur Site',
              corps: 'Contrôle total avec un déploiement sur votre infrastructure',
              items: [
                'Sécurité maximale',
                'Conformité réglementaire',
                'Personnalisation complète',
                'Performance optimisée',
              ],
            },
            {
              titre: 'Cloud',
              corps: 'Déploiement rapide et évolutif sur notre infrastructure sécurisée',
              items: [
                'Mise en place en quelques minutes',
                'Évolutivité automatique',
                'Maintenance incluse',
                'Mises à jour automatiques',
              ],
            },
          ],
        },
      ],
    },
    {
      titre: "Cas d'Usage",
      blocs: [
        {
          genre: 'cartes',
          cartes: [
            {
              titre: 'Entreprises',
              items: [
                'Réunions multilingues',
                'Support client multilingue',
                "Collaboration d'équipes internationales",
                'Formation globale',
              ],
            },
            {
              titre: 'Éducation',
              items: [
                'Apprentissage des langues',
                'Programmes internationaux',
                'Recherche collaborative',
                'Échanges culturels',
              ],
            },
            {
              titre: 'Communautés',
              items: [
                'Organisations à but non lucratif',
                'Événements internationaux',
                'Programmes de bénévolat',
                'Services de santé multilingues',
              ],
            },
          ],
        },
      ],
    },
    {
      titre: 'Avantages Partenaires',
      blocs: [
        {
          genre: 'cartes',
          cartes: [
            { titre: 'Accès Prioritaire', corps: 'Accès anticipé aux nouvelles fonctionnalités' },
            { titre: 'Support Prioritaire', corps: 'Accès à notre équipe de support dédiée 24/7' },
            {
              titre: 'Visibilité',
              corps: 'Mise en avant sur notre site et dans nos communications',
            },
          ],
        },
      ],
    },
  ],
  suite: {
    titre: 'Devenir Partenaire',
    accroche: 'Rejoignez notre programme de partenariat et développez votre activité',
    liens: [{ libelle: 'Contactez-nous', href: '/contact' }, { libelle: 'En savoir plus', href: '/about' }],
  },
};
