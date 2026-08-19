/**
 * Machine à états du picker de transfert hybride (spec 2026-08-19, Volet A.6/D) :
 * bouton par-ligne = envoi immédiat, tap ligne = multi-sélection, une cible déjà
 * servie n'est plus sélectionnable, aucun doublon possible par construction.
 * RÈGLE JUMELLE : apps/ios/Meeshy/Features/Main/Components/ForwardPickerModel.swift
 * — toute évolution touche les deux.
 */

export type TargetState = 'idle' | 'selected' | 'sending' | 'sent' | { failed: string };

export class ForwardPickerModel {
  private states: ReadonlyMap<string, TargetState> = new Map();

  state(id: string): TargetState {
    return this.states.get(id) ?? 'idle';
  }

  selectedIds(): string[] {
    return [...this.states.entries()]
      .filter(([, state]) => state === 'selected')
      .map(([id]) => id)
      .sort();
  }

  tapRow(id: string): void {
    const current = this.state(id);
    if (current === 'selected') {
      this.setState(id, 'idle');
      return;
    }
    if (current === 'sending' || current === 'sent') return;
    // `idle` ET `{failed}` deviennent sélectionnables : une cible en échec doit
    // pouvoir rejoindre un envoi groupé (parité iOS `case .idle, .failed`).
    this.setState(id, 'selected');
  }

  beginSend(id: string): boolean {
    const current = this.state(id);
    if (current === 'sent' || current === 'sending') return false;
    this.setState(id, 'sending');
    return true;
  }

  finishSend(id: string, ok: boolean, reason?: string): void {
    if (this.state(id) !== 'sending') return;
    this.setState(id, ok ? 'sent' : { failed: reason ?? '' });
  }

  beginBatch(): string[] {
    const batch = this.selectedIds();
    batch.forEach((id) => this.setState(id, 'sending'));
    return batch;
  }

  private setState(id: string, state: TargetState): void {
    this.states = new Map([...this.states.entries(), [id, state]]);
  }
}
