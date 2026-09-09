import { ProgressionPage } from '@/routes/progression-page';
import { GeneratedAchievements, STREAK_TINT } from '@/routes/progression-parts';

/**
 * LA PAGE DÉDIÉE DES DÉFIS (#5843) — les paliers produits par la grammaire.
 *
 * Distincte des SUCCÈS, qui sont composés et nommés un par un : l'utilisateur
 * n'a pas à connaître cette frontière, mais elle gouverne ce qui se range où —
 * un défi se décline par paliers, un succès se décroche d'un coup.
 *
 * Le compte en haut à droite est ATTEIGNABLE, jamais déclaré : promettre des
 * paliers que le produit ne peut pas tenir est un mensonge que la loi
 * `isAttainable` refuse déjà en amont.
 */
export default function ProgressionDefisScreen() {
  return (
    <ProgressionPage
      titre="Défis"
      teinte={STREAK_TINT}
      compte={(p) => {
        const sections = p.achievementSections ?? [];
        if (sections.length === 0) return null;
        const fait = sections.reduce((n, s) => n + s.unlockedCount, 0);
        const total = sections.reduce((n, s) => n + s.attainableCount, 0);
        return `${fait} / ${total}`;
      }}
    >
      {(progress) =>
        progress.achievementSections === undefined ? (
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            Les défis ne sont pas encore mesurés sur ce compte.
          </p>
        ) : (
          <GeneratedAchievements sections={progress.achievementSections} />
        )
      }
    </ProgressionPage>
  );
}
