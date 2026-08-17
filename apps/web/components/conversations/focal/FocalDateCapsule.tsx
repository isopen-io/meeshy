/**
 * `FocalDateCapsule` — capsule de date sticky (WF-112).
 *
 * lentille-implementation-contract §4.3, colonne Fil, ligne « Sticker de
 * section / date » : « capsule matériau, bord 0.5, sticky top 4 ».
 *
 * ÉCART DE TOKEN documenté (rapport WF-112) : `packages/shared/design/
 * lentille-tokens.json` (source de `lentille-tokens.css`, RE-PREUVE faite —
 * §0) NE PORTE PAS de section `thread.date`/`thread.sticker` — seules
 * `thread.pill` et `thread.agent` existent côté fil (voir le fichier JSON,
 * clé `"thread"`). La cote textuelle (`10.5`/`800`/letter-spacing/padding)
 * réutilise donc `--lentille-list-sticker-*` (déjà généré, MÊME aspect
 * « capsule matériau » que la maquette liste) plutôt qu'un nouveau littéral
 * — seuls `border 0.5` et `top 4` (non couverts par un token, absents de la
 * liste des littéraux bannis par la garde R15 : `520/380/0.45/0.82/900/25/24`,
 * qui protège la LOI de perspective/activité, pas cette valeur de mise en
 * page) restent des nombres locaux à ce fichier, nommés explicitement.
 */
'use client';

const DATE_CAPSULE_BORDER_WIDTH_PX = 0.5;
const DATE_CAPSULE_STICKY_TOP_PX = 4;

export interface FocalDateCapsuleProps {
  readonly label: string;
}

export function FocalDateCapsule({ label }: FocalDateCapsuleProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="focal-date-capsule"
      className="sticky z-10 mx-auto w-fit uppercase text-muted-foreground bg-card/95 backdrop-blur-sm border border-border rounded-full"
      style={{
        top: `${DATE_CAPSULE_STICKY_TOP_PX}px`,
        borderWidth: `${DATE_CAPSULE_BORDER_WIDTH_PX}px`,
        fontSize: 'var(--lentille-list-sticker-size)',
        fontWeight: 'var(--lentille-list-sticker-weight)',
        letterSpacing: 'var(--lentille-list-sticker-letter-spacing)',
        padding: 'var(--lentille-list-sticker-padding-vertical) var(--lentille-list-sticker-padding-horizontal)',
      }}
    >
      {label}
    </div>
  );
}

export default FocalDateCapsule;
