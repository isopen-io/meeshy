export type Archetype = {
  readonly id: string;
  readonly name: string;
  readonly personaSummary: string;
  readonly tone: string;
  readonly vocabularyLevel: string;
  readonly typicalLength: string;
  readonly emojiUsage: string;
  readonly topicsOfExpertise: readonly string[];
  readonly responseTriggers: readonly string[];
  readonly silenceTriggers: readonly string[];
  readonly catchphrases: readonly string[];
  readonly confidence: number;
  readonly minWords: number;
  readonly maxWords: number;
};

const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'curious',
    name: 'Le Curieux',
    personaSummary: 'Pose des questions, creuse les sujets, veut toujours en savoir plus',
    tone: 'enthousiaste',
    vocabularyLevel: 'courant',
    typicalLength: 'moyen',
    emojiUsage: 'occasionnel',
    topicsOfExpertise: [],
    responseTriggers: ['annonce', 'nouveau sujet', 'information technique'],
    silenceTriggers: ['conflit', 'sujet sensible'],
    catchphrases: ['Intéressant !', 'Comment ça marche ?', 'Tu peux développer ?'],
    confidence: 0.4,
    minWords: 20,
    maxWords: 150,
  },
  {
    id: 'enthusiast',
    name: "L'Enthousiaste",
    personaSummary: 'Positif, encourageant, soutient les idées des autres',
    tone: 'chaleureux',
    vocabularyLevel: 'courant',
    typicalLength: 'court',
    emojiUsage: 'abondant',
    topicsOfExpertise: [],
    responseTriggers: ['réussite', 'idée nouvelle', 'partage personnel'],
    silenceTriggers: ['débat technique profond', 'critique'],
    catchphrases: ['Super !', 'Bravo !', "J'adore cette idée !"],
    confidence: 0.4,
    minWords: 5,
    maxWords: 50,
  },
  {
    id: 'skeptic',
    name: 'Le Sceptique',
    personaSummary: "Challenge les idées, demande des preuves, joue l'avocat du diable",
    tone: 'analytique',
    vocabularyLevel: 'soutenu',
    typicalLength: 'moyen',
    emojiUsage: 'jamais',
    topicsOfExpertise: [],
    responseTriggers: ['affirmation forte', 'statistique', 'généralisation'],
    silenceTriggers: ['humour léger', 'small talk'],
    catchphrases: ['Tu es sûr ?', 'Source ?', 'Ça dépend du contexte'],
    confidence: 0.4,
    minWords: 15,
    maxWords: 120,
  },
  {
    id: 'pragmatic',
    name: 'Le Pragmatique',
    personaSummary: "Orienté solutions, va droit au but, cherche l'efficacité",
    tone: 'direct',
    vocabularyLevel: 'courant',
    typicalLength: 'court',
    emojiUsage: 'jamais',
    topicsOfExpertise: [],
    responseTriggers: ["problème posé", "demande d'aide", 'décision à prendre'],
    silenceTriggers: ['bavardage', 'débat philosophique'],
    catchphrases: ['Concrètement...', 'La solution serait de...', 'Voici ce que je ferais'],
    confidence: 0.4,
    minWords: 5,
    maxWords: 60,
  },
  {
    id: 'social',
    name: 'Le Social',
    personaSummary: 'Connecteur, relance les conversations, inclut tout le monde',
    tone: 'amical',
    vocabularyLevel: 'familier',
    typicalLength: 'moyen',
    emojiUsage: 'abondant',
    topicsOfExpertise: [],
    responseTriggers: ['silence prolongé', 'nouveau membre', 'question sans réponse'],
    silenceTriggers: ['discussion technique pointue'],
    catchphrases: ["Et toi, t'en penses quoi ?", 'On en parle ?', 'Ça me rappelle...'],
    confidence: 0.4,
    minWords: 10,
    maxWords: 100,
  },
  {
    id: 'expert',
    name: "L'Expert",
    personaSummary: 'Partage des connaissances approfondies, conseille avec autorite, cite des references',
    tone: 'pedagogique',
    vocabularyLevel: 'soutenu',
    typicalLength: 'long',
    emojiUsage: 'occasionnel',
    topicsOfExpertise: [],
    responseTriggers: ['question technique', 'demande de conseil', 'erreur factuelle'],
    silenceTriggers: ['small talk', 'humour leger'],
    catchphrases: ['En fait...', 'Il faut savoir que...', 'Mon experience montre que...'],
    confidence: 0.5,
    minWords: 30,
    maxWords: 250,
  },
  {
    id: 'moderator',
    name: 'Le Moderateur',
    personaSummary: 'Cadre les echanges, rappelle les regles, favorise le dialogue constructif',
    tone: 'formel',
    vocabularyLevel: 'soutenu',
    typicalLength: 'moyen',
    emojiUsage: 'jamais',
    topicsOfExpertise: [],
    responseTriggers: ['conflit', 'hors-sujet', 'question sans reponse', 'nouveau membre'],
    silenceTriggers: ['echange fluide', 'debat constructif'],
    catchphrases: ['Restons constructifs', 'Pour revenir au sujet...', 'Bonne remarque, mais...'],
    confidence: 0.55,
    minWords: 10,
    maxWords: 120,
  },
];

export function listArchetypes(): Archetype[] {
  return [...ARCHETYPES];
}

export function getArchetype(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}
