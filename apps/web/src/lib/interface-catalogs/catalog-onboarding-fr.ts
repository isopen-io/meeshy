/**
 * LE CATALOGUE DE L'ACCUEIL POST-INSCRIPTION, FRANÇAIS (#7729) — la SOURCE des
 * clés `onboarding.*`. Textes : `docs/marketing/campagne-2026-09/
 * onboarding-parcours.md` § 2. Les six autres langues portent exactement ces
 * clés (`satisfies OnboardingCatalog`, `i18n-onboarding-catalog.test.ts`).
 *
 * Les huit gabarits de salut portent `{name}`, parfois `{languages}`, et UN
 * trou personnel `[[…]]` que le composeur sélectionne (`journey.ts §
 * greetingDraft`). Aucun ne nomme une marque, une œuvre ou une personne réelle.
 */
const fr = {
  'onboarding.title': 'Bienvenue sur Meeshy',
  'onboarding.skipAll': 'Passer tout',
  'onboarding.later': 'Plus tard',
  'onboarding.continue': 'Continuer',
  'onboarding.progress': 'Étape {current} sur {total}',
  'onboarding.offline': 'Dispo quand tu es en ligne',
  'onboarding.points.gauge': '{points} / {target} pts pour ton niveau 1',
  'onboarding.points.level': 'Niveau 1 atteint !',
  'onboarding.points.gained': '+{points}',
  'onboarding.points.announce': 'Tu gagnes {points} points.',

  'onboarding.languages.title': 'Ta langue, ton monde',
  'onboarding.languages.body': 'Ici, chacun écrit dans sa langue. Toi, tu lis tout dans la tienne.',
  'onboarding.languages.demo.from': 'Hola, ¿qué tal?',
  'onboarding.languages.demo.fromCode': 'es',
  'onboarding.languages.demo.to': 'Salut, ça va ?',
  'onboarding.languages.primary': 'Ta langue principale',
  'onboarding.languages.secondary': 'Une deuxième langue ? (facultatif)',
  'onboarding.languages.change': 'Changer',
  'onboarding.languages.pick': 'Choisis ta langue principale',
  'onboarding.languages.confirm': 'C’est ma langue',
  'onboarding.languages.failed': 'Ta langue n’a pas été enregistrée. Réessaie.',

  'onboarding.global.title': 'Dis salut au monde',
  'onboarding.global.body': 'Meeshy Global, c’est le salon où tout le monde traîne. Balance un salut, sans pression.',
  'onboarding.global.field': 'Ton salut, modifiable',
  'onboarding.global.shuffle': 'Autre idée',
  'onboarding.global.send': 'Envoyer',
  'onboarding.global.sending': 'Envoi…',
  'onboarding.global.sent': 'Salut envoyé !',
  'onboarding.global.failed': 'Ton salut n’est pas parti. Réessaie.',
  'onboarding.global.unavailable': 'Meeshy Global n’est pas joignable pour l’instant.',
  'onboarding.global.badge': 'Badge « Premier message »',
  'onboarding.global.streak': 'Série : 1 jour 🔥',
  'onboarding.global.reward': '+14 pts à l’envoi',
  'onboarding.global.template.1': 'Salut tout le monde ! Moi c’est {name}, je parle {languages}. Qui vit près de [[la mer]] ici ?',
  'onboarding.global.template.2': 'Hello ! {name} ici 👋 En ce moment j’écoute [[du rap]] en boucle. Et vous ?',
  'onboarding.global.template.3': 'Coucou ! Je m’appelle {name}. Mon plat préféré : [[les pâtes]]. Le vôtre ?',
  'onboarding.global.template.4': 'Salut ! {name}, je viens d’arriver. Je cherche des gens qui aiment [[le foot]] !',
  'onboarding.global.template.5': 'Hey ! Moi c’est {name}. Mon petit bonheur du jour : [[les couchers de soleil]].',
  'onboarding.global.template.6': 'Bonjour ! {name} ici, je parle {languages}. J’aimerais apprendre [[l’espagnol]], des conseils ?',
  'onboarding.global.template.7': 'Salut le monde 🌍 Je suis {name}. Ma passion du moment : [[la photo]]. Qui partage ?',
  'onboarding.global.template.8': 'Yo ! {name} vient d’arriver. Chez moi, aujourd’hui, il fait [[grand soleil]]. Et chez vous ?',

  'onboarding.story.title': 'Montre-toi',
  'onboarding.story.body': 'Les amis se font en montrant qui tu es. Une photo, un mot : c’est une story, elle disparaît en 24 h.',
  'onboarding.story.create': 'Créer ma story',
  'onboarding.story.audience.public': 'Visible par tout le monde. Tu pourras changer avant de publier.',
  'onboarding.story.audience.friends': 'Visible par tes amis. Tu pourras changer avant de publier.',
  'onboarding.story.reward': '+10 pts à la publication',
  'onboarding.story.done': 'Story publiée !',

  'onboarding.friends.title': 'Trouve ta bande',
  'onboarding.friends.body': 'Ajoute 3 personnes qui te ressemblent. Quand elles acceptent, vous gagnez +7 tous les deux.',
  'onboarding.friends.add': 'Ajouter',
  'onboarding.friends.addNamed': 'Ajouter {name}',
  'onboarding.friends.added': 'Envoyée',
  'onboarding.friends.speaks': 'Parle {languages}',
  'onboarding.friends.reward': '+7 chacun quand elle accepte',
  'onboarding.friends.count': '{count} / 3 demandes',
  'onboarding.friends.empty': 'Personne à te proposer pour l’instant. L’onglet Découvrir t’en montrera bientôt.',
  'onboarding.friends.failed': 'La demande n’est pas partie. Réessaie.',

  'onboarding.notifications.title': 'On te prévient quand ça bouge',
  'onboarding.notifications.body': 'Quelqu’un va te répondre. Tu veux le savoir tout de suite ?',
  'onboarding.notifications.yes': 'Oui, préviens-moi',
  'onboarding.notifications.no': 'Pas maintenant',

  'onboarding.recap.title': 'Bien joué !',
  'onboarding.recap.calm': 'Tout est prêt. Tu pourras le faire quand tu veux.',
  'onboarding.recap.points': '{points} pts',
  'onboarding.recap.level': 'Niveau {level}',
  'onboarding.recap.streak': 'Série de {days} 🔥',
  'onboarding.recap.badges': 'Badges : {count}',
  'onboarding.recap.friends': 'Demandes en route : {count}',
  'onboarding.recap.tomorrow': 'Demain, ta série peut passer à {next}.',
  'onboarding.recap.explore': 'Continuer à explorer',
  'onboarding.recap.done': 'C’est bon pour aujourd’hui',
} as const;

export default fr;
