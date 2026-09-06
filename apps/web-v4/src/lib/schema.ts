/**
 * Le schema clair/sombre — UNE source, deux lecteurs (le script inline de
 * index.html au demarrage, ce module ensuite).
 *
 * La table de jetons fait tout le travail de couleur : basculer le schema, ici,
 * revient a poser une CLASSE. Aucun composant n'a a connaitre le schema courant
 * pour se peindre juste — c'est la raison pour laquelle ce POC n'ecrit presque
 * aucune variante `light:`.
 */
export type Schema = 'clair' | 'sombre';

const CLE = 'meeshy.schema';

export function schemaCourant(): Schema {
  return document.documentElement.classList.contains('light') ? 'clair' : 'sombre';
}

export function poseSchema(schema: Schema): void {
  const clair = schema === 'clair';
  document.documentElement.classList.toggle('light', clair);
  document.documentElement.classList.toggle('dark', !clair);
  try {
    localStorage.setItem(CLE, schema);
  } catch {
    /* Stockage refuse : le schema tient pour la session, sans se souvenir. */
  }
}

/**
 * Suit la preference SYSTEME tant que l'utilisateur n'a rien choisi lui-meme.
 * Rend la fonction de desabonnement.
 */
export function suitLeSysteme(): () => void {
  const requete = window.matchMedia('(prefers-color-scheme: light)');
  const surChangement = (e: MediaQueryListEvent) => {
    let choisi: string | null = null;
    try {
      choisi = localStorage.getItem(CLE);
    } catch {
      choisi = null;
    }
    if (choisi === null) poseSchema(e.matches ? 'clair' : 'sombre');
  };
  requete.addEventListener('change', surChangement);
  return () => requete.removeEventListener('change', surChangement);
}
