// Un import de feuille de style est un EFFET, pas une valeur : il n'expose rien
// à typer. Sans cette déclaration, TypeScript 6 refuse l'import à effet de bord
// (TS2882), et la v3 naît sans `ignoreBuildErrors` — son type-check est le job
// BLOQUANT de la CI, jamais le ratchet de dette de apps/web.
declare module '*.css';
