import type { PageDeContenu } from '@/app/institutionnel/document';

/**
 * « À propos » — le contenu de `apps/web/locales/fr/about.json`, mot pour mot.
 *
 * CE QUI N'A PAS SUIVI, ET POURQUOI. `cta.joinUs` est la seule clé du
 * catalogue que la page legacy ne rend PAS : elle n'a aucune destination, et un
 * intitulé sans destination est un contrôle qui ment. La rangée de suite porte
 * donc les trois liens que le legacy affiche vraiment.
 */
export const PAGE_A_PROPOS: PageDeContenu = {
  titre: 'À propos de Meeshy',
  accroche: "Le réseau social où la langue n'est plus une barrière. Communiquez, apprenez et collaborez sans frontières.",
  description: "Le réseau social où la langue n'est plus une barrière. Communiquez, apprenez et collaborez sans frontières.",
  sections: [
    {
      titre: "Qu'est-ce que Meeshy ?",
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Meeshy est bien plus qu'une simple plateforme de messagerie multilingue. C'est une révolution dans la façon dont nous communiquons à travers les langues et les cultures.",
            "Imaginez un réseau social où vous postez en français, votre ami au Japon lit en japonais, votre partenaire commercial au Nigeria lit en yoruba, et votre collègue en Allemagne lit en allemand - le tout à partir du même message original. C'est la promesse de Meeshy : un réseau où chaque contenu est automatiquement consommé dans la langue native de l'utilisateur.",
          ],
        },
        {
          genre: 'liste',
          items: [
            '🌍 Traduction en temps réel dans 100+ langues',
            '🔒 Chiffrement de bout en bout - vos conversations restent privées',
            '🎯 Traduction côté serveur pour une qualité professionnelle et une confidentialité totale',
            '🗣️ Transcription et traduction audio pour briser les barrières orales',
            '📚 Apprentissage naturel des langues en communiquant avec le monde entier',
            '🌐 Promotion active des langues minoritaires africaines, asiatiques et autochtones',
          ],
        },
      ],
    },
    {
      titre: 'Notre Mission',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Connecter l'humanité au-delà des barrières linguistiques. Nous construisons le premier véritable réseau social multilingue où la langue que vous parlez ne détermine plus avec qui vous pouvez communiquer, apprendre ou faire des affaires.",
          ],
        },
      ],
    },
    {
      titre: 'Pourquoi la Traduction Côté Serveur ?',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Beaucoup de services utilisent des API tierces comme Google Translate. Pas Meeshy. Voici pourquoi nous avons fait le choix de la traduction côté serveur :',
          ],
        },
        {
          genre: 'cartes',
          cartes: [
            {
              titre: 'Confidentialité Totale',
              corps: "Vos messages ne quittent JAMAIS nos serveurs sécurisés en Europe. Aucune donnée n'est envoyée à Google, Microsoft ou tout autre service tiers. Nous contrôlons 100% de la chaîne de traduction.",
            },
            {
              titre: 'Qualité Professionnelle',
              corps: "Nous utilisons l'état de l'art en intelligence artificielle pour des traductions naturelles qui comprennent le contexte, le ton et les nuances culturelles. Résultat : des traductions fluides et fidèles.",
            },
            {
              titre: 'Vitesse Optimale',
              corps: "Pas de latence réseau vers des API externes. La traduction s'effectue directement sur nos serveurs pour une réponse quasi-instantanée, même pour des conversations de groupe avec 50+ participants.",
            },
            {
              titre: 'Indépendance Technologique',
              corps: "Nous ne dépendons d'aucun géant de la tech. Si demain Google change ses tarifs ou politiques, nous ne sommes pas affectés. Votre service reste stable, prévisible et sous votre contrôle.",
            },
            {
              titre: 'Personnalisation Infinie',
              corps: "Héberger nos propres modèles nous permet d'ajouter des langues rares, d'améliorer la traduction de jargon technique spécifique à votre secteur, et d'adapter la traduction selon vos préférences.",
            },
          ],
        },
      ],
    },
    {
      titre: 'Apprendre des Langues en Communiquant Naturellement',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Oubliez les applications d'apprentissage traditionnelles avec leurs leçons artificielles. Avec Meeshy, vous apprenez des langues en situation réelle.",
          ],
        },
        {
          genre: 'cartes',
          cartes: [
            {
              titre: 'Immersion Authentique',
              corps: "Discutez avec des locuteurs natifs du monde entier. Chaque conversation est une opportunité d'apprendre du vocabulaire, des expressions idiomatiques et la culture associée à la langue. Commencez par lire les traductions, puis progressivement essayez de deviner le sens avant de regarder. Meeshy s'adapte à votre niveau et vous encourage à sortir de votre zone de confort linguistique.",
            },
            {
              titre: 'Voir Toutes les Versions',
              corps: "Chaque message s'affiche dans votre langue ET dans la langue originale. Meeshy permet aussi de voir les traductions vers les langues parlées par les autres utilisateurs de la même conversation. Vous comprenez immédiatement le sens tout en voyant comment chacun s'exprime réellement. C'est comme avoir un tuteur personnel 24/7.",
            },
            {
              titre: 'Voix Naturelle Préservée',
              corps: "Les traductions audio maintiennent la voix originale de l'interlocuteur. Vous entendez le message traduit dans votre langue avec l'intonation, l'émotion et la personnalité vocale de la personne qui parle. Une expérience immersive unique.",
            },
            {
              titre: 'Contexte Réel',
              corps: "Apprenez le vocabulaire qui compte vraiment : celui utilisé dans de vraies conversations sur des sujets qui vous passionnent, pas des phrases comme 'La pomme est rouge' qu'aucun natif ne dit jamais.",
            },
          ],
        },
      ],
    },
    {
      titre: 'Business Sans Frontières',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            'Dans un monde globalisé, votre capacité à communiquer efficacement en plusieurs langues détermine votre succès. Meeshy élimine cette barrière.',
          ],
        },
        {
          genre: 'cartes',
          cartes: [
            {
              titre: 'Équipes Internationales',
              corps: 'Votre développeur en Inde, votre designer au Brésil et votre manager en France collaborent en temps réel, chacun dans sa langue. Pas de malentendus, pas de frustration, pas de traducteur humain coûteux.',
            },
            {
              titre: 'Support Client Multilingue',
              corps: 'Offrez un support dans 100+ langues sans embaucher une armée de traducteurs. Un seul agent peut répondre à des clients japonais, arabes et espagnols simultanément.',
            },
            {
              titre: 'Expansion Internationale',
              corps: 'Testez de nouveaux marchés sans investissement massif en localisation. Communiquez directement avec des clients potentiels en Afrique, Asie ou Amérique Latine dès le premier jour.',
            },
            {
              titre: 'Négociations Commerciales',
              corps: 'Négociez des contrats avec des partenaires internationaux en toute confiance. Chaque partie lit et répond dans sa langue, éliminant les ambiguïtés et accélérant les décisions.',
            },
          ],
        },
      ],
    },
    {
      titre: 'Promotion de la Diversité Linguistique',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Internet est dominé par l'anglais, le mandarin et quelques langues majeures. Meeshy se bat pour que TOUTES les langues aient leur place dans le monde numérique.",
          ],
        },
        {
          genre: 'cartes',
          cartes: [
            {
              titre: 'Langues Africaines',
              corps: "Yoruba, Swahili, Zulu, Amharique, Hausa, Wolof, Lingala... L'Afrique compte plus de 2000 langues vivantes. Nous travaillons activement à les intégrer pour que les Africains puissent communiquer mondialement dans leurs langues maternelles.",
            },
            {
              titre: 'Langues Asiatiques',
              corps: "Au-delà du mandarin et du japonais, nous soutenons le tagalog, le vietnamien, le thaï, le khmer, le birman, le népalais et des dizaines d'autres langues d'Asie du Sud et du Sud-Est.",
            },
            {
              titre: 'Langues Autochtones',
              corps: "Quechua en Amérique du Sud, langues aborigènes d'Australie, langues amérindiennes d'Amérique du Nord... Ces langues méritent de survivre et de prospérer dans l'ère numérique.",
            },
            {
              titre: 'Dialectes et Variantes',
              corps: "L'arabe marocain n'est pas l'arabe égyptien. Le portugais brésilien diffère du portugais européen. Meeshy reconnaît et respecte ces nuances régionales.",
            },
          ],
        },
        {
          genre: 'accent',
          corps: "Chaque langue perdue est une vision unique du monde qui disparaît. En donnant aux locuteurs de langues minoritaires les outils pour communiquer mondialement, nous préservons la richesse culturelle de l'humanité.",
        },
      ],
    },
    {
      titre: 'Nos Valeurs Fondamentales',
      blocs: [
        {
          genre: 'cartes',
          cartes: [
            {
              titre: 'Accessibilité Universelle',
              corps: 'La communication multilingue ne doit pas être un privilège réservé aux multinationales. Meeshy est accessible à tous, partout, gratuitement ou à prix minimal.',
            },
            {
              titre: 'Innovation Permanente',
              corps: "Nous utilisons l'intelligence artificielle et les dernières avancées pour améliorer constamment la qualité de traduction.",
            },
            {
              titre: 'Confidentialité par Design',
              corps: "Chiffrement de bout en bout optionnel, traduction côté serveur sans fuite vers des tiers, données hébergées en Europe, conformité RGPD totale. Votre vie privée n'est pas négociable.",
            },
            {
              titre: 'Ouverture et Inclusivité',
              corps: 'Toutes les langues sont égales chez Meeshy. Du mandarin au wolof, du swahili au quechua, chaque langue mérite sa place dans le monde numérique.',
            },
          ],
        },
      ],
    },
    {
      titre: 'Notre Équipe',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Meeshy est construit par une équipe passionnée de développeurs, linguistes, designers et visionnaires qui partagent la même conviction : l'humanité a besoin d'un réseau sans barrière linguistique.",
            "Basée à Paris avec des contributeurs dans le monde entier, notre équipe combine expertise technique, compréhension profonde des enjeux linguistiques, et vision humaniste d'un monde plus connecté.",
          ],
        },
      ],
    },
    {
      titre: 'Rejoignez le Mouvement',
      blocs: [
        {
          genre: 'paragraphes',
          corps: [
            "Nous construisons quelque chose de plus grand qu'une application. Nous construisons l'infrastructure de communication du futur multilingue.",
          ],
        },
        {
          genre: 'accent',
          corps: 'Que vous soyez un utilisateur curieux, un développeur, un linguiste ou un investisseur, il y a une place pour vous dans cette révolution.',
        },
      ],
    },
  ],
  suite: {
    titre: 'Prêt à découvrir Meeshy ?',
    liens: [
      { libelle: 'Contactez-nous', href: '/contact' },
      { libelle: "Conditions d'utilisation", href: '/terms' },
      { libelle: 'Politique de confidentialité', href: '/privacy' },
    ],
  },
};
