import type { ContentPage } from './type';

/**
 * « Contact » — le contenu de `apps/web/locales/fr/contact.json`, mot pour mot.
 *
 * DEUX ÉCARTS AVEC LE LEGACY, tous deux assumés :
 *
 *   1. La deuxième carte du legacy est intitulée `t('title')` — « Contactez-nous »,
 *      c'est-à-dire le titre de la PAGE, répété en titre de section. Deux
 *      en-têtes portant le même texte donnent à un lecteur d'écran deux repères
 *      indiscernables. La section prend donc pour titre `email.label`, une
 *      chaîne du même catalogue, qui DIT ce que la section contient.
 *   2. L'adresse e-mail est un lien `mailto:`. Le legacy la rend en texte nu :
 *      la joindre y demande de la sélectionner et de la recopier — deux gestes
 *      de trop sur le chemin nominal d'une page dont c'est l'unique objet.
 *
 * `cta.collaborate` et `cta.learnMore` n'entrent pas : la page legacy ne les
 * rend pas non plus, et ils n'ont aucune destination.
 */
export const PAGE_CONTACT: ContentPage = {
  title: 'Contactez-nous',
  hero: "Nous sommes là pour vous aider. N'hésitez pas à nous contacter pour toute question ou suggestion.",
  description: "Nous sommes là pour vous aider. N'hésitez pas à nous contacter pour toute question ou suggestion.",
  sections: [
    {
      title: 'Notre Adresse',
      blocks: [
        {
          kind: 'encadre',
          rows: [
            { text: 'Meeshy Inc.' },
            { text: 'Bâtiment A, 3ème étage' },
            { text: '12 Rue de la Paix' },
            { text: '75002 Paris, France' },
          ],
        },
      ],
    },
    {
      title: 'Email',
      blocks: [
        {
          kind: 'encadre',
          rows: [{ text: 'contact@meeshy.me', href: 'mailto:contact@meeshy.me' }],
        },
      ],
    },
    {
      title: 'Disponibilité',
      blocks: [{ kind: 'paragraphes', body: ['Du lundi au vendredi, 9h00 - 18h00 (heure de Paris)'] }],
    },
    {
      title: 'Comment nous rejoindre',
      blocks: [
        {
          kind: 'cartes',
          cards: [
            {
              title: 'Train',
              items: ['RER A - Auber', 'Transilien J/L - Haussmann Saint-Lazare'],
              mention: '10 min à pied',
            },
            { title: 'Métro', items: ['Ligne 3 - Station Bourse'], mention: '5 min à pied' },
            { title: 'Bus', items: ['Lignes 20, 29, 39, 48', 'Arrêt Bourse'] },
            { title: 'Ligne U', items: ['Transilien U - La Défense'], mention: '15 min à pied' },
            { title: 'Bus Express', items: ['Bus direct Roissybus', 'Service direct depuis CDG'] },
            {
              title: 'Voiture',
              items: ['A1, sortie Porte de la Chapelle', 'Parking Bourse (payant)'],
              mention: 'Tarif : 4€/heure',
            },
          ],
        },
      ],
    },
  ],
  run: {
    title: 'Liens Utiles',
    links: [{ label: 'À propos', href: '/about' }, { label: 'Partenaires', href: '/partners' }],
  },
};
