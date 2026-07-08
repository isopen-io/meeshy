import { parseMessageLinks } from '@/lib/utils/link-parser';

/**
 * Prétraite un message avant le rendu markdown.
 *
 * Seule transformation appliquée : les liens courts `m+TOKEN` sont convertis en
 * liens markdown cliquables `[m+TOKEN](trackingUrl)`. Tout autre segment (texte
 * brut, URL, lien de tracking déjà complet) est conservé **tel quel** — c'est
 * `ReactMarkdown` qui le rend ensuite.
 *
 * Module pur extrait de `MarkdownMessage.tsx` (iter 126) afin d'être testable
 * directement : le composant est mocké par Jest (ESM `react-markdown`), donc la
 * logique de prétraitement doit vivre hors du chemin mocké pour être couverte.
 *
 * Les segments retournés par `parseMessageLinks` recouvrent l'intégralité de
 * l'entrée de façon contiguë ; leur concaténation reconstruit donc le message
 * d'origine, la seule différence étant l'enrobage des liens `m+TOKEN`.
 */
export const preprocessContent = (content: string): string =>
  parseMessageLinks(content)
    .map((part) =>
      part.type === 'mshy-link' && part.trackingUrl
        ? `[${part.content}](${part.trackingUrl})`
        : part.content
    )
    .join('');
