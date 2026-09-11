import type { ContentPage } from './type';

/**
 * « À propos » — le contenu de `apps/web/locales/fr/about.json`, mot pour mot.
 *
 * CE QUI N'A PAS SUIVI, ET POURQUOI. `cta.joinUs` est la seule clé du
 * catalogue que la page legacy ne rend PAS : elle n'a aucune destination, et un
 * intitulé sans destination est un contrôle qui ment. La rangée de suite porte
 * donc les trois liens que le legacy affiche vraiment.
 */
export const PAGE_ABOUT: ContentPage = {
  title: 'À propos de Meeshy',
  hero: "Le réseau social où la langue n'est plus une barrière. Communiquez, apprenez et collaborez sans frontières.",
  description: "Le réseau social où la langue n'est plus une barrière. Communiquez, apprenez et collaborez sans frontières.",
  sections: [
    {
      title: "Qu'est-ce que Meeshy ?",
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Meeshy est bien plus qu'une simple plateforme de messagerie multilingue. C'est une révolution dans la façon dont nous communiquons à travers les langues et les cultures.",
            "Imaginez un réseau social où vous postez en français, votre ami au Japon lit en japonais, votre partenaire commercial au Nigeria lit en yoruba, et votre collègue en Allemagne lit en allemand - le tout à partir du même message original. C'est la promesse de Meeshy : un réseau où chaque contenu est automatiquement consommé dans la langue native de l'utilisateur.",
          ],
        },
        {
          kind: 'list',
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
      title: 'Notre Mission',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Connecter l'humanité au-delà des barrières linguistiques. Nous construisons le premier véritable réseau social multilingue où la langue que vous parlez ne détermine plus avec qui vous pouvez communiquer, apprendre ou faire des affaires.",
          ],
        },
      ],
    },
    {
      title: 'Pourquoi la Traduction Côté Serveur ?',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Beaucoup de services utilisent des API tierces comme Google Translate. Pas Meeshy. Voici pourquoi nous avons fait le choix de la traduction côté serveur :',
          ],
        },
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Confidentialité Totale',
              body: "Vos messages ne quittent JAMAIS nos serveurs sécurisés en Europe. Aucune donnée n'est envoyée à Google, Microsoft ou tout autre service tiers. Nous contrôlons 100% de la chaîne de traduction.",
            },
            {
              title: 'Qualité Professionnelle',
              body: "Nous utilisons l'état de l'art en intelligence artificielle pour des traductions naturelles qui comprennent le contexte, le ton et les nuances culturelles. Résultat : des traductions fluides et fidèles.",
            },
            {
              title: 'Vitesse Optimale',
              body: "Pas de latence réseau vers des API externes. La traduction s'effectue directement sur nos serveurs pour une réponse quasi-instantanée, même pour des conversations de groupe avec 50+ participants.",
            },
            {
              title: 'Indépendance Technologique',
              body: "Nous ne dépendons d'aucun géant de la tech. Si demain Google change ses tarifs ou politiques, nous ne sommes pas affectés. Votre service reste stable, prévisible et sous votre contrôle.",
            },
            {
              title: 'Personnalisation Infinie',
              body: "Héberger nos propres modèles nous permet d'ajouter des langues rares, d'améliorer la traduction de jargon technique spécifique à votre secteur, et d'adapter la traduction selon vos préférences.",
            },
          ],
        },
      ],
    },
    {
      title: 'Apprendre des Langues en Communiquant Naturellement',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Oubliez les applications d'apprentissage traditionnelles avec leurs leçons artificielles. Avec Meeshy, vous apprenez des langues en situation réelle.",
          ],
        },
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Immersion Authentique',
              body: "Discutez avec des locuteurs natifs du monde entier. Chaque conversation est une opportunité d'apprendre du vocabulaire, des expressions idiomatiques et la culture associée à la langue. Commencez par lire les traductions, puis progressivement essayez de deviner le sens avant de regarder. Meeshy s'adapte à votre niveau et vous encourage à sortir de votre zone de confort linguistique.",
            },
            {
              title: 'Voir Toutes les Versions',
              body: "Chaque message s'affiche dans votre langue ET dans la langue originale. Meeshy permet aussi de voir les traductions vers les langues parlées par les autres utilisateurs de la même conversation. Vous comprenez immédiatement le sens tout en voyant comment chacun s'exprime réellement. C'est comme avoir un tuteur personnel 24/7.",
            },
            {
              title: 'Voix Naturelle Préservée',
              body: "Les traductions audio maintiennent la voix originale de l'interlocuteur. Vous entendez le message traduit dans votre langue avec l'intonation, l'émotion et la personnalité vocale de la personne qui parle. Une expérience immersive unique.",
            },
            {
              title: 'Contexte Réel',
              body: "Apprenez le vocabulaire qui compte vraiment : celui utilisé dans de vraies conversations sur des sujets qui vous passionnent, pas des phrases comme 'La pomme est rouge' qu'aucun natif ne dit jamais.",
            },
          ],
        },
      ],
    },
    {
      title: 'Business Sans Frontières',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            'Dans un monde globalisé, votre capacité à communiquer efficacement en plusieurs langues détermine votre succès. Meeshy élimine cette barrière.',
          ],
        },
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Équipes Internationales',
              body: 'Votre développeur en Inde, votre designer au Brésil et votre manager en France collaborent en temps réel, chacun dans sa langue. Pas de malentendus, pas de frustration, pas de traducteur humain coûteux.',
            },
            {
              title: 'Support Client Multilingue',
              body: 'Offrez un support dans 100+ langues sans embaucher une armée de traducteurs. Un seul agent peut répondre à des clients japonais, arabes et espagnols simultanément.',
            },
            {
              title: 'Expansion Internationale',
              body: 'Testez de nouveaux marchés sans investissement massif en localisation. Communiquez directement avec des clients potentiels en Afrique, Asie ou Amérique Latine dès le premier jour.',
            },
            {
              title: 'Négociations Commerciales',
              body: 'Négociez des contrats avec des partenaires internationaux en toute confiance. Chaque partie lit et répond dans sa langue, éliminant les ambiguïtés et accélérant les décisions.',
            },
          ],
        },
      ],
    },
    {
      title: 'Promotion de la Diversité Linguistique',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Internet est dominé par l'anglais, le mandarin et quelques langues majeures. Meeshy se bat pour que TOUTES les langues aient leur place dans le monde numérique.",
          ],
        },
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Langues Africaines',
              body: "Yoruba, Swahili, Zulu, Amharique, Hausa, Wolof, Lingala... L'Afrique compte plus de 2000 langues vivantes. Nous travaillons activement à les intégrer pour que les Africains puissent communiquer mondialement dans leurs langues maternelles.",
            },
            {
              title: 'Langues Asiatiques',
              body: "Au-delà du mandarin et du japonais, nous soutenons le tagalog, le vietnamien, le thaï, le khmer, le birman, le népalais et des dizaines d'autres langues d'Asie du Sud et du Sud-Est.",
            },
            {
              title: 'Langues Autochtones',
              body: "Quechua en Amérique du Sud, langues aborigènes d'Australie, langues amérindiennes d'Amérique du Nord... Ces langues méritent de survivre et de prospérer dans l'ère numérique.",
            },
            {
              title: 'Dialectes et Variantes',
              body: "L'arabe marocain n'est pas l'arabe égyptien. Le portugais brésilien diffère du portugais européen. Meeshy reconnaît et respecte ces nuances régionales.",
            },
          ],
        },
        {
          kind: 'accent',
          body: "Chaque langue perdue est une vision unique du monde qui disparaît. En donnant aux locuteurs de langues minoritaires les outils pour communiquer mondialement, nous préservons la richesse culturelle de l'humanité.",
        },
      ],
    },
    {
      title: 'Nos Valeurs Fondamentales',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Accessibilité Universelle',
              body: 'La communication multilingue ne doit pas être un privilège réservé aux multinationales. Meeshy est accessible à tous, partout, gratuitement ou à prix minimal.',
            },
            {
              title: 'Innovation Permanente',
              body: "Nous utilisons l'intelligence artificielle et les dernières avancées pour améliorer constamment la qualité de traduction.",
            },
            {
              title: 'Confidentialité par Design',
              body: "Chiffrement de bout en bout optionnel, traduction côté serveur sans fuite vers des tiers, données hébergées en Europe, conformité RGPD totale. Votre vie privée n'est pas négociable.",
            },
            {
              title: 'Ouverture et Inclusivité',
              body: 'Toutes les langues sont égales chez Meeshy. Du mandarin au wolof, du swahili au quechua, chaque langue mérite sa place dans le monde numérique.',
            },
          ],
        },
      ],
    },
    {
      title: 'Notre Équipe',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Meeshy est construit par une équipe passionnée de développeurs, linguistes, designers et visionnaires qui partagent la même conviction : l'humanité a besoin d'un réseau sans barrière linguistique.",
            "Basée à Paris avec des contributeurs dans le monde entier, notre équipe combine expertise technique, compréhension profonde des enjeux linguistiques, et vision humaniste d'un monde plus connecté.",
          ],
        },
      ],
    },
    {
      title: 'Rejoignez le Mouvement',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Nous construisons quelque chose de plus grand qu'une application. Nous construisons l'infrastructure de communication du futur multilingue.",
          ],
        },
        {
          kind: 'accent',
          body: 'Que vous soyez un utilisateur curieux, un développeur, un linguiste ou un investisseur, il y a une place pour vous dans cette révolution.',
        },
      ],
    },
  ],
  run: {
    title: 'Prêt à découvrir Meeshy ?',
    links: [
      { label: 'Contactez-nous', href: '/contact' },
      { label: "Conditions d'utilisation", href: '/terms' },
      { label: 'Politique de confidentialité', href: '/privacy' },
    ],
  },
};
