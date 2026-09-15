/**
 * LES TROIS POINTS PULSÉS DE LA FRAPPE — l'ATOME, miroir `LentilleTypingDots`
 * (`LentilleConversationRow.swift:878-905`), partagé par les DEUX surfaces qui
 * annoncent une frappe : la ligne 2 de la Lentille (`components/lens-row.tsx`)
 * et la cellule de queue du fil (`routes/thread-modes.tsx`).
 *
 * POURQUOI UN ATOME PLUTÔT QUE DEUX COPIES. iOS en a un
 * (`LentilleTypingDots`), et la revue-correction #5793 allait en écrire une
 * SECONDE en câblant la liste : trois points, une phase de 0,18 s, un diamètre
 * de 5 px recopiés — trois occasions de diverger sans qu'aucun témoin ne
 * rougisse, la forme exacte des jumelles que `CLAUDE.md` § « UNE source de
 * vérité » interdit.
 *
 * `aria-hidden` : dans la cellule de frappe du fil, le CONTENEUR porte déjà
 * le sens via `role="img"` + `aria-label` (`typing-roster-cell.tsx`, revue-
 * correction, défaut majeur 1 — le nom calculé de la cellule, pas un texte
 * voisin qui n'existe plus en tenue plate) ; dans la ligne 2 de la Lentille,
 * c'est le texte visible qui le porte. Dans les deux cas, ces points
 * n'ajoutent rien à un lecteur d'écran et se prononceraient
 * « point point point ».
 *
 * L'animation est `typingDot` (`styles/app.css`, l'UNIQUE `@keyframes` du POC)
 * — la règle 32 (`prefers-reduced-motion: reduce`, `app.css:203-211`) la coupe
 * globalement, comme iOS la désactive sous Reduce Motion.
 */
const PHASE_S = 0.18;

export function TypingDots({ color, className }: { readonly color: string; readonly className?: string }) {
  return (
    /* `className` sert l'ESPACEMENT du site d'accueil, jamais le dessin : la
       cellule du fil pose ses points dans un flex `gap-1.5` (rien à ajouter),
       la ligne 2 de la Lentille les pose dans un FLUX DE TEXTE, où aucun `gap`
       n'opère — mesuré à la capture, « Amina Diallo écrit••• » collait. */
    <span className={`inline-flex items-center gap-[3px] align-[-1px]${className === undefined ? '' : ` ${className}`}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-[5px] rounded-full"
          style={{
            backgroundColor: color,
            animation: 'typingDot 1s ease-in-out infinite',
            animationDelay: `${i * PHASE_S}s`,
          }}
        />
      ))}
    </span>
  );
}
