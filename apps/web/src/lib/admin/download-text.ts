/**
 * **ENREGISTRER UN TEXTE COMME FICHIER** (#10232) — l'export `store.app_events` se télécharge. Le texte est déjà là
 * (la passerelle le sert dans le JSON de l'export) : un `Blob` et un lien `download`, sans second appel réseau.
 * Un navigateur ou une coque qui refuse (pas d'`URL.createObjectURL`, lien bloqué) rend `false` : l'écran propose
 * alors de copier, il ne ment pas.
 */
export function downloadTextFile(name: string, text: string, mime = 'text/yaml;charset=utf-8'): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}

/** Copie dans le presse-papiers ; `false` quand il est indisponible ou refusé (contexte non sûr, permission). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
