import type { ContentPage } from './type';

/**
 * « Partenaires » — le contenu de `apps/web/locales/fr/partners.json`, mot pour
 * mot, dans l'ordre où la page legacy le rend.
 *
 * `become.api` (« Documentation API ») n'entre PAS dans la rangée de suite :
 * le legacy le rend en bouton, mais la v3 ne sert aucune documentation d'API et
 * le legacy non plus — c'est un lien sans destination, donc un contrôle qui
 * ment. Il reviendra le jour où la page qu'il annonce existera.
 */
export const PAGE_PARTNERS: ContentPage = {
  title: 'Devenez Partenaire',
  hero: 'Rejoignez notre écosystème et développez votre activité avec Meeshy',
  description: 'Rejoignez notre écosystème et développez votre activité avec Meeshy',
  sections: [
    {
      title: 'Solutions Entreprise',
      blocks: [
        {
          kind: 'paragraphes',
          body: ['Des solutions sur mesure pour les grandes organisations avec des besoins spécifiques'],
        },
        {
          kind: 'list',
          items: [
            'Déploiement sur site ou cloud privé',
            'Authentification SSO (SAML, OAuth)',
            'Analytics et rapports avancés',
            'Support prioritaire 24/7',
            "Personnalisation complète de l'interface",
          ],
        },
        { kind: 'accent', body: 'Tarification personnalisée' },
      ],
    },
    {
      title: 'Solutions Éducation',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Facilitez l'apprentissage multilingue et la collaboration internationale",
          ],
        },
        {
          kind: 'list',
          items: [
            'Salles de classe virtuelles multilingues',
            "Support pour les programmes d'échange",
            "Outils d'apprentissage intégrés",
            'Gestion centralisée des comptes',
            'Intégration avec les plateformes LMS',
          ],
        },
        { kind: 'accent', body: "Tarifs préférentiels pour l'éducation" },
      ],
    },
    {
      title: 'Partenaires Technologiques',
      blocks: [
        { kind: 'paragraphes', body: ['Intégrez Meeshy dans vos solutions'] },
        {
          kind: 'list',
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
      title: 'Options de Déploiement',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Sur Site',
              body: 'Contrôle total avec un déploiement sur votre infrastructure',
              items: [
                'Sécurité maximale',
                'Conformité réglementaire',
                'Personnalisation complète',
                'Performance optimisée',
              ],
            },
            {
              title: 'Cloud',
              body: 'Déploiement rapide et évolutif sur notre infrastructure sécurisée',
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
      title: "Cas d'Usage",
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Entreprises',
              items: [
                'Réunions multilingues',
                'Support client multilingue',
                "Collaboration d'équipes internationales",
                'Formation globale',
              ],
            },
            {
              title: 'Éducation',
              items: [
                'Apprentissage des langues',
                'Programmes internationaux',
                'Recherche collaborative',
                'Échanges culturels',
              ],
            },
            {
              title: 'Communautés',
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
      title: 'Avantages Partenaires',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            { title: 'Accès Prioritaire', body: 'Accès anticipé aux nouvelles fonctionnalités' },
            { title: 'Support Prioritaire', body: 'Accès à notre équipe de support dédiée 24/7' },
            {
              title: 'Visibilité',
              body: 'Mise en avant sur notre site et dans nos communications',
            },
          ],
        },
      ],
    },
  ],
  run: {
    title: 'Devenir Partenaire',
    hero: 'Rejoignez notre programme de partenariat et développez votre activité',
    links: [{ label: 'Contactez-nous', href: '/contact' }, { label: 'En savoir plus', href: '/about' }],
  },
};
