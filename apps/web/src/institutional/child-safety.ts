import type { ContentPage } from './type';

/**
 * « Normes de sécurité des enfants » (#9923) — la page publique que Google Play
 * exige d'une application sociale ou de messagerie (règlement « Child Safety
 * Standards ») : l'interdiction des abus et de l'exploitation sexuels
 * d'enfants, le signalement dans l'application, le traitement d'un
 * signalement, la conformité aux lois et un contact désigné.
 *
 * CHAQUE GESTE DÉCRIT EXISTE. « Signaler » est offert sur un message
 * (appui long, « Plus… », puis la fiche du message : `message-detail-sheet.tsx`
 * et `use-message-report.ts` — sauf la vue unique, `reportOffered`), sur la
 * fiche d'un compte (`profile-peek-sheet.tsx`, `user-profile.tsx`), sur une
 * publication (`publication-menu-panel.tsx`) et sur un commentaire
 * (`comment-row-menu.tsx`) ; les motifs sont ceux de `REPORT_REASONS`, et
 * aucun n'est propre aux enfants — d'où « Contenu inapproprié ». Les suites
 * données (retrait, suspension, fermeture) sont les `actionTaken` de la
 * modération (`routes/admin/reports.ts`). Aucune détection automatique n'est
 * promise : il n'en existe pas.
 *
 * L'ÂGE est celui des conditions (`terms.ts`, « Âge Minimum »), mot pour mot
 * sur la règle : 13 ans, Meeshy Global en écriture à 18 ans.
 *
 * PAS DE VUE DE MEE. Les sept autres pages accueillent le lecteur par une
 * mascotte ; celle-ci parle d'abus sur des enfants, et un sticker animé y
 * serait déplacé. `mee` est facultatif dans le type pour ce genre de page.
 */
export const PAGE_CHILD_SAFETY: ContentPage = {
  title: 'Normes de sécurité des enfants',
  hero: "Meeshy interdit toute forme d'abus et d'exploitation sexuels d'enfants. Voici nos règles, comment nous signaler un contenu ou un comportement, et ce que nous en faisons.",
  mention: 'Dernière mise à jour : 22 octobre 2026',
  description:
    "Les normes de Meeshy contre les abus et l’exploitation sexuels d’enfants (CSAE) : ce qui est interdit, comment signaler dans l'application ou par e-mail, ce que nous faisons d'un signalement, et notre contact désigné.",
  sections: [
    {
      title: 'Tolérance zéro',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Meeshy interdit tout contenu et tout comportement qui sexualise, exploite ou met en danger un enfant — les abus et l’exploitation sexuels d’enfants, désignés en anglais par le sigle CSAE. Cette règle vaut partout sur Meeshy : conversations privées et de groupe, conversations chiffrées de bout en bout ou non, communautés, Meeshy Global, publications, stories, commentaires et profils.",
            'Sont notamment interdits :',
          ],
        },
        {
          kind: 'list',
          items: [
            "Tout contenu d'abus sexuel sur un enfant (CSAM), qu'il soit photographié, filmé, dessiné, retouché ou généré par ordinateur ou par intelligence artificielle",
            "Le fait de demander, d'échanger, de partager ou de promouvoir de tels contenus, ou des liens qui y mènent",
            "La sollicitation d'un mineur à des fins sexuelles, y compris le pédopiégeage (« grooming ») : gagner la confiance d'un enfant pour l'amener à un échange sexuel ou à une rencontre",
            "La sextorsion : obtenir ou menacer de diffuser des images intimes d'un mineur",
            "Toute sexualisation d'un mineur, y compris dans un commentaire, un nom ou un profil",
            "La traite ou l'exploitation commerciale d'enfants",
          ],
        },
        {
          kind: 'accent',
          body: "Toute infraction entraîne la fermeture du compte et le signalement aux autorités compétentes.",
        },
      ],
    },
    {
      title: 'Âge minimum',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Meeshy est réservé aux personnes de 13 ans et plus. Meeshy Global, l'espace ouvert à tous, n'est ouvert en écriture qu'à partir de 18 ans : de 13 à 17 ans, on peut y lire les messages sans pouvoir y écrire.",
            "Si vous pensez qu'un enfant de moins de 13 ans utilise Meeshy, signalez son compte : nous le fermons.",
          ],
        },
      ],
    },
    {
      title: "Signaler dans l'application",
      blocks: [
        {
          kind: 'list',
          items: [
            'Un message : appui long sur le message, « Plus… », puis « Signaler ».',
            "Un compte : depuis la fiche de la personne, « Signaler ».",
            'Une publication ou un commentaire : depuis son menu, « Signaler ».',
          ],
        },
        {
          kind: 'paragraphes',
          body: [
            "Choisissez le motif « Contenu inapproprié ». Notre équipe de modération reçoit le signalement. Vous pouvez aussi bloquer la personne : le blocage est immédiat.",
            "Un message à vue unique ne peut pas être signalé depuis l'application : écrivez-nous à l'adresse ci-dessous.",
          ],
        },
        {
          kind: 'accent',
          body: "Ne partagez pas, ne transférez pas et n'enregistrez pas le contenu, même pour le signaler : le diffuser est lui-même une infraction. Décrivez-le et dites où il se trouve.",
        },
      ],
    },
    {
      title: 'Signaler par e-mail',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Vous n'avez pas besoin d'un compte. Indiquez le nom d'utilisateur concerné, la conversation, la communauté ou la publication, et la date. Ne joignez ni l'image ni la vidéo.",
          ],
        },
        {
          kind: 'encadre',
          rows: [{ text: 'safety@meeshy.me', href: 'mailto:safety@meeshy.me' }],
        },
      ],
    },
    {
      title: "Ce que nous faisons d'un signalement",
      blocks: [
        {
          kind: 'list',
          items: [
            'Il est examiné par notre équipe de modération.',
            'Le contenu en cause est retiré.',
            'Le compte qui l’a publié est suspendu ou fermé définitivement.',
            "Nous conservons les éléments nécessaires à l'enquête, dans les limites et pour la durée prévues par la loi.",
            "Nous le signalons aux autorités compétentes : en France, à la plateforme Pharos du ministère de l'Intérieur ; au NCMEC (National Center for Missing & Exploited Children) lorsque le cas relève de sa compétence ; et à la police ou à la gendarmerie lorsqu'un enfant est en danger.",
            'Nous répondons aux réquisitions des autorités judiciaires.',
          ],
        },
      ],
    },
    {
      title: 'Un enfant en danger immédiat',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Appelez d'abord les secours : le 17 ou le 112 en France, ou le numéro d'urgence de votre pays. Puis signalez le compte ou le contenu à Meeshy.",
          ],
        },
        {
          kind: 'encadre',
          rows: [
            { text: '119 — Allô Enfance en Danger (France, gratuit, 24 h/24)', href: 'tel:119' },
            { text: 'Pharos — internet-signalement.gouv.fr', href: 'https://www.internet-signalement.gouv.fr' },
            { text: 'NCMEC CyberTipline — report.cybertip.org', href: 'https://report.cybertip.org' },
          ],
        },
      ],
    },
    {
      title: 'Conformité',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Meeshy respecte les lois applicables en matière de protection de l’enfance et de lutte contre les contenus pédocriminels, dont l'obligation de signaler ces contenus aux autorités compétentes. Ces normes complètent nos conditions d'utilisation, qui les rendent opposables à chaque utilisateur.",
          ],
        },
      ],
    },
    {
      title: 'Contact désigné',
      blocks: [
        {
          kind: 'paragraphes',
          body: [
            "Notre contact pour la sécurité des enfants répond aux utilisateurs, aux autorités et aux organisations de protection de l'enfance sur ces normes et leur application :",
          ],
        },
        {
          kind: 'encadre',
          rows: [
            { text: 'Email : safety@meeshy.me', href: 'mailto:safety@meeshy.me' },
            { text: 'Adresse postale : 12 Rue de la Paix, 75002 Paris, France' },
          ],
        },
      ],
    },
  ],
  run: {
    title: 'Liens Utiles',
    links: [
      { label: "Conditions d'utilisation", href: '/terms' },
      { label: 'Politique de confidentialité', href: '/privacy' },
      { label: "Centre d'aide", href: '/help' },
      { label: 'Contact', href: '/contact' },
    ],
  },
};
