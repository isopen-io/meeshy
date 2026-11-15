import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';

/**
 * UN CHROME CHARGÉ À LA DEMANDE QUI NE VIENT PAS NE PEINT RIEN — et ne fige rien.
 *
 * `lazy()` garde le rejet de son `import()` et le LÈVE à chaque rendu. Hors ligne, c'est le cas nominal d'un chunk
 * cherché tard (armé au repos, au premier besoin) : sans frontière, l'erreur remonte jusqu'à la racine. Preact y
 * abandonne toute sa file de rendu — les composants qui y attendaient restent marqués « à repeindre » et ne se
 * repeignent plus jamais (le fil ne montre ni la bulle « Non envoyé » ni le champ vidé, mesuré sur
 * `check-thread-states.mjs`) ; React, lui, démonte la racine entière.
 *
 * Réservé au chrome OPTIONNEL de la coquille (`fallback={null}` déjà) : son absence se tait, comme son attente.
 */
type State = { readonly failed: boolean };

class ChunkFailureBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[optional-chunk]', error, info.componentStack ?? '');
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export function OptionalChunk({ children }: { readonly children: ReactNode }) {
  return (
    <ChunkFailureBoundary>
      <Suspense fallback={null}>{children}</Suspense>
    </ChunkFailureBoundary>
  );
}
