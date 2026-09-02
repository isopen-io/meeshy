/**
 * LA COPIE DE LA STORY — ce que l'écran DIT, hors de ce qu'il compose.
 *
 * Même règle que `lib/contenu/fil.ts` : une phrase qui vit ici se relit d'un
 * coup ; une phrase enfouie dans un gabarit se corrige trois fois. Elle vit
 * sous `lib/` parce que la vue ET la porte la lisent — la porte compose le
 * refus, la vue le peint.
 *
 * `traduitDe` prend le nom NATIF de la langue (`getLanguageInfo(code)
 * .nativeName`), pas sa traduction française : la table des langues de
 * `@meeshy/shared` porte un nom anglais et un nom natif, et rien d'autre.
 * Écrire « traduit de l'anglais » comme la planche le dessine demanderait une
 * table de noms de langues EN FRANÇAIS, c'est-à-dire une seconde table
 * (§ 3.2 corollaire 2). L'écart de formulation avec `cible/story.png` est
 * ASSUMÉ ; la conformité porte sur la disposition, pas sur la déclinaison.
 */

export const STORY = {
  titre: 'Story',
  de: (auteur: string): string => `Story de ${auteur}`,
  fermer: 'Fermer',
  segments: (n: number): string => (n === 1 ? 'Cette story' : `${n} stories de cette personne`),
  segment: (rang: number, total: number): string => `Story ${rang} sur ${total}`,
  precedente: 'Story précédente',
  suivante: 'Story suivante',
  langues: 'Changer la langue',
  langue: (nom: string): string => `Lire en ${nom}`,
  traduitDe: (langue: string): string => `Traduit de ${langue}`,
  original: 'Voir l’original',
  scene: 'Contenu de la story',
  /** Une story sans texte NI média : la passerelle en sert, la vue ne fabrique rien. */
  sansContenu: 'Cette story ne porte aucun texte.',
  repondreA: (auteur: string): string => `Répondre à ${auteur}…`,
  repondre: 'Votre réponse',
  envoyer: 'Envoyer la réponse',
  aimer: 'J’aime cette story',
  repondu: 'Votre réponse a été envoyée.',
  refuse: 'Votre réponse n’est pas partie.',
  vide: 'Écrivez votre réponse avant de l’envoyer.',
  indisponible: {
    titre: 'Story indisponible',
    corps:
      'Cette story n’existe plus, ou elle ne vous est pas ouverte. Les stories restent visibles 24 h après leur publication.',
    action: 'Retour à l’accueil',
  },
  invitation: {
    titre: 'Cette story vous attend',
    corps:
      'Meeshy ne sert le contenu d’une story qu’aux personnes connectées. Entrez avec votre compte : vous reviendrez ici automatiquement.',
    seConnecter: 'Se connecter',
    creerUnCompte: 'Créer un compte',
    note: 'Le lien est gardé de côté : vous reviendrez sur cette story après connexion.',
  },
} as const;

/** Le plafond de `CreateCommentSchema.content` (`services/gateway/src/routes/posts/types.ts:406`). */
export const LONGUEUR_MAX_DE_LA_REPONSE = 2000;
