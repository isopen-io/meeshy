import { act, useState } from 'react';
import { describe, expect, test } from 'bun:test';

import { setupAdminKitTests } from '@/test-support/admin-harness';

import {
  AdminCheckbox,
  AdminField,
  AdminFormActions,
  AdminFormError,
  AdminFormSheet,
  AdminFormStatus,
  AdminReasonField,
  AdminSelect,
  AdminSwitch,
  AdminTextArea,
  AdminTextInput,
  motiveState,
  useArmedConfirm,
} from './form';

const { mount } = setupAdminKitTests();

const typeInto = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    (element as HTMLElement).click();
  });
};

const withOffline = async (run: () => Promise<void>) => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  try {
    await run();
  } finally {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  }
};

describe('motiveState — la seule copie de la règle du motif', () => {
  const BAN = { minLength: 3, required: true, whenSovereign: 'optional' } as const;
  const CONVERSATION = { minLength: 10, required: true, whenSovereign: 'optional' } as const;
  const PASSWORD = { minLength: 10, required: false, whenSovereign: 'hide' } as const;
  const ROLE = { minLength: 0, required: false, whenSovereign: 'optional' } as const;

  const CASES = [
    ['ban, vide', BAN, '', false, { shown: true, tooShort: true, ready: false, sent: null }],
    ['ban, trop court', BAN, ' ab ', false, { shown: true, tooShort: true, ready: false, sent: 'ab' }],
    ['ban, prêt', BAN, '  spam  ', false, { shown: true, tooShort: false, ready: true, sent: 'spam' }],
    ['ban souverain, vide : part sans motif', BAN, '', true, { shown: true, tooShort: false, ready: true, sent: null }],
    ['ban souverain, commencé : se valide encore', BAN, 'ab', true, { shown: true, tooShort: true, ready: false, sent: 'ab' }],
    ['conversation, court', CONVERSATION, 'trop peu', false, { shown: true, tooShort: true, ready: false, sent: 'trop peu' }],
    ['conversation, prêt', CONVERSATION, 'abus répétés', false, { shown: true, tooShort: false, ready: true, sent: 'abus répétés' }],
    ['mot de passe, vide : facultatif', PASSWORD, '', false, { shown: true, tooShort: false, ready: true, sent: null }],
    ['mot de passe, commencé et court', PASSWORD, 'oubli', false, { shown: true, tooShort: true, ready: false, sent: 'oubli' }],
    ['mot de passe souverain : champ masqué', PASSWORD, 'oubli', true, { shown: false, tooShort: false, ready: true, sent: null }],
    ['rôle, sans minimum', ROLE, 'a', false, { shown: true, tooShort: false, ready: true, sent: 'a' }],
    ['rôle, vide', ROLE, '   ', false, { shown: true, tooShort: false, ready: true, sent: null }],
  ] as const;

  for (const [name, regime, text, sovereign, expected] of CASES) {
    test(name, () => {
      const state = motiveState({ ...regime, text, sovereign });
      expect({ shown: state.shown, tooShort: state.tooShort, ready: state.ready, sent: state.sent }).toEqual(expected);
      expect(state.trimmed).toBe(text.trim());
    });
  }
});

describe('AdminField et AdminTextInput — un libellé, une note, un refus, tous associés', () => {
  test('le libellé nomme le champ ; la note et le refus le décrivent ; le refus est annoncé', async () => {
    const host = await mount(
      <AdminTextInput
        id="admin-test-email"
        label="Adresse"
        value="a@b"
        type="email"
        note="Elle reçoit le lien."
        error="Adresse déjà prise"
        errorData={{ 'data-admin-test-error': '' }}
        data={{ 'data-admin-test-email': '' }}
        onValue={() => undefined}
      />,
    );
    const input = host.querySelector('input') as HTMLInputElement;
    expect(input.id).toBe('admin-test-email');
    expect(input.type).toBe('email');
    expect(input.hasAttribute('data-admin-test-email')).toBe(true);
    expect(host.querySelector('label[for="admin-test-email"]')?.textContent).toBe('Adresse');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toContain('admin-test-email-note');
    expect(described).toContain('admin-test-email-error');
    const alert = host.querySelector('#admin-test-email-error');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toBe('Adresse déjà prise');
    expect(alert?.hasAttribute('data-admin-test-error')).toBe(true);
    expect(host.querySelector('#admin-test-email-note')?.textContent).toBe('Elle reçoit le lien.');
    expect(Number.parseInt(input.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });

  test('sans refus : aucune alerte, aria-invalid absent ; la saisie remonte par onInput', async () => {
    const values: string[] = [];
    const host = await mount(<AdminTextInput id="admin-test-name" label="Nom" value="" onValue={(v) => values.push(v)} />);
    const input = host.querySelector('input') as HTMLInputElement;
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await typeInto(input, 'Awa');
    expect(values).toEqual(['Awa']);
  });

  test('AdminField enveloppe un contrôle fourni par l’appelant', async () => {
    const host = await mount(
      <AdminField id="admin-test-custom" label="Personnalisé" note="Aide">
        <input id="admin-test-custom" />
      </AdminField>,
    );
    expect(host.querySelector('label[for="admin-test-custom"]')?.textContent).toBe('Personnalisé');
    expect(host.querySelector('#admin-test-custom-note')?.textContent).toBe('Aide');
  });
});

describe('AdminTextArea', () => {
  test('libellé associé, saisie par onInput, ancre posée', async () => {
    const values: string[] = [];
    const host = await mount(
      <AdminTextArea id="admin-test-bio" label="Bio" value="" maxLength={160} data={{ 'data-admin-test-bio': '' }} onValue={(v) => values.push(v)} />,
    );
    const area = host.querySelector('textarea') as HTMLTextAreaElement;
    expect(host.querySelector('label[for="admin-test-bio"]')?.textContent).toBe('Bio');
    expect(area.maxLength).toBe(160);
    expect(area.hasAttribute('data-admin-test-bio')).toBe(true);
    await typeInto(area, 'Bonjour');
    expect(values).toEqual(['Bonjour']);
  });
});

describe('AdminSelect — la valeur servie hors liste reste choisie', () => {
  const OPTIONS = [
    { value: 'fr', label: 'Français' },
    { value: 'en', label: 'English' },
  ] as const;

  test('une valeur absente de la liste est ajoutée en tête, jamais remplacée en silence', async () => {
    const host = await mount(<AdminSelect id="admin-test-lang" label="Langue" value="wo" options={OPTIONS} onValue={() => undefined} />);
    const select = host.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('wo');
    expect([...select.options].map((option) => option.textContent)).toEqual(['WO', 'Français', 'English']);
    expect(host.querySelector('label[for="admin-test-lang"]')?.textContent).toBe('Langue');
    expect(Number.parseInt(select.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });

  test('fallbackLabel nomme la valeur absente ; sans libellé, le contrôle seul ; onChange remonte', async () => {
    const values: string[] = [];
    const host = await mount(
      <AdminSelect id="admin-test-role" value="" options={OPTIONS} fallbackLabel={() => '—'} data={{ 'data-admin-test-role': '' }} onValue={(v) => values.push(v)} />,
    );
    const select = host.querySelector('select') as HTMLSelectElement;
    expect(host.querySelector('label')).toBeNull();
    expect(select.options[0]?.textContent).toBe('—');
    expect(select.hasAttribute('data-admin-test-role')).toBe(true);
    await act(async () => {
      select.value = 'en';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(values).toEqual(['en']);
  });
});

describe('AdminSwitch — l’état se lit, la cible fait 44 px', () => {
  function Harness({ onChange }: { readonly onChange?: (next: boolean) => void }) {
    const [on, setOn] = useState(false);
    return (
      <AdminSwitch
        id="admin-test-active"
        label="Actif"
        hint="Le membre peut se connecter."
        checked={on}
        data={{ 'data-admin-test-switch': '' }}
        onToggle={(next) => {
          setOn(next);
          onChange?.(next);
        }}
      />
    );
  }

  test('role=switch, aria-checked bascule au geste, libellé et aide associés', async () => {
    const host = await mount(<Harness />);
    const button = host.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(button.id).toBe('admin-test-active');
    expect(button.hasAttribute('data-admin-test-switch')).toBe(true);
    expect(button.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('label[for="admin-test-active"]')?.textContent).toBe('Actif');
    expect(button.getAttribute('aria-describedby')).toBe('admin-test-active-hint');
    expect(Number.parseInt(button.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    expect(Number.parseInt(button.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
    await click(button);
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
  });

  test('désactivée, elle ne bascule pas ; sans libellé, le contrôle seul', async () => {
    const calls: boolean[] = [];
    const host = await mount(<AdminSwitch id="admin-test-off" checked={false} disabled onToggle={(next) => calls.push(next)} />);
    expect(host.querySelector('label')).toBeNull();
    await click(host.querySelector('[role="switch"]'));
    expect(calls).toEqual([]);
  });
});

describe('AdminCheckbox — une case NATIVE', () => {
  test('`.checked` se lit sur l’input ; le libellé l’enveloppe sur 44 px ; l’aide la décrit', async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <AdminCheckbox id="admin-test-notify" label="Prévenir le membre" hint="Par e-mail." checked={on} data={{ 'data-admin-test-notify': '' }} onToggle={setOn} />;
    }
    const host = await mount(<Harness />);
    const input = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.hasAttribute('data-admin-test-notify')).toBe(true);
    expect(input.checked).toBe(false);
    const label = input.closest('label') as HTMLLabelElement;
    expect(label.textContent).toContain('Prévenir le membre');
    expect(Number.parseInt(label.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    expect(input.getAttribute('aria-describedby')).toBe('admin-test-notify-hint');
    await click(input);
    expect((host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
  });
});

describe('AdminReasonField + AdminFormActions — un motif requis trop court bloque l’envoi', () => {
  function ReasonForm({ sovereign, onSubmit }: { readonly sovereign: boolean; readonly onSubmit: (sent: string | null) => void }) {
    const [text, setText] = useState('');
    const state = motiveState({ text, minLength: 3, required: true, sovereign, whenSovereign: 'optional' });
    return (
      <>
        <AdminReasonField
          id="admin-test-reason"
          language="fr"
          label="Motif du bannissement"
          value={text}
          minLength={3}
          required
          sovereign={sovereign}
          whenSovereign="optional"
          data={{ 'data-admin-test-reason': '' }}
          onValue={setText}
        />
        <AdminFormActions
          language="fr"
          primary={{ label: 'Bannir', tone: 'danger', disabled: !state.ready, onClick: () => onSubmit(state.sent), data: { 'data-admin-test-submit': '' } }}
          onCancel={() => undefined}
        />
      </>
    );
  }

  test('le bouton reste désactivé sous le minimum, s’active au-delà, et envoie le motif nettoyé', async () => {
    const sent: (string | null)[] = [];
    const host = await mount(<ReasonForm sovereign={false} onSubmit={(motif) => sent.push(motif)} />);
    const input = host.querySelector('input[data-admin-test-reason]') as HTMLInputElement;
    const submit = () => host.querySelector('[data-admin-test-submit]') as HTMLButtonElement;
    expect(host.querySelector('label[for="admin-test-reason"]')?.textContent).toBe('Motif du bannissement');
    expect(submit().disabled).toBe(true);
    await typeInto(input, ' ab ');
    expect(submit().disabled).toBe(true);
    const count = host.querySelector('[data-admin-motive-count]');
    expect(count?.textContent).toBe('2 sur 3 caractères minimum');
    expect(input.getAttribute('aria-describedby')).toContain(count?.id ?? 'absent');
    await typeInto(input, '  spam ');
    expect(submit().disabled).toBe(false);
    await click(submit());
    expect(sent).toEqual(['spam']);
  });

  test('souverain : le libellé dit « facultatif » et un champ vide n’empêche pas l’envoi', async () => {
    const host = await mount(<ReasonForm sovereign onSubmit={() => undefined} />);
    expect(host.querySelector('label[for="admin-test-reason"]')?.textContent).toBe('Motif (facultatif)');
    expect((host.querySelector('[data-admin-test-submit]') as HTMLButtonElement).disabled).toBe(false);
  });

  test('« masqué pour le souverain » : rien n’est rendu', async () => {
    const host = await mount(
      <AdminReasonField id="admin-test-hidden" language="fr" label="Motif" value="" minLength={10} required={false} sovereign whenSovereign="hide" onValue={() => undefined} />,
    );
    expect(host.querySelector('input')).toBeNull();
  });

  test('sans minimum, aucun compteur ; un refus explicite est annoncé', async () => {
    const host = await mount(
      <AdminReasonField
        id="admin-test-free"
        language="fr"
        label="Motif"
        value=""
        minLength={0}
        required={false}
        sovereign={false}
        whenSovereign="optional"
        error="Motif refusé"
        onValue={() => undefined}
      />,
    );
    expect(host.querySelector('[data-admin-motive-count]')).toBeNull();
    expect(host.querySelector('#admin-test-free-error')?.getAttribute('role')).toBe('alert');
  });
});

describe('AdminFormActions — un geste à la fois, jamais hors ligne', () => {
  test('Annuler porte son ancre et la langue de l’administration ; secondaires rendues', async () => {
    let cancelled = 0;
    let removed = 0;
    const host = await mount(
      <AdminFormActions
        language="fr"
        primary={{ label: 'Enregistrer', type: 'submit' }}
        secondary={[{ label: 'Retirer', tone: 'danger', onClick: () => (removed += 1), data: { 'data-admin-test-remove': '' } }]}
        onCancel={() => (cancelled += 1)}
      />,
    );
    const cancel = host.querySelector('[data-admin-form-cancel]') as HTMLButtonElement;
    expect(cancel.textContent).toBe('Annuler');
    expect(host.querySelector('[data-admin-action="cancel"]')).toBeNull();
    expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).textContent).toBe('Enregistrer');
    await click(host.querySelector('[data-admin-test-remove]'));
    await click(cancel);
    expect([removed, cancelled]).toEqual([1, 1]);
    for (const button of host.querySelectorAll('button')) expect((button as HTMLButtonElement).style.minHeight).toBe('44px');
  });

  test('pendant l’envoi : le principal se dit occupé, les autres gestes sont désactivés', async () => {
    const host = await mount(
      <AdminFormActions
        language="fr"
        primary={{ label: 'Enregistrer', busy: true, data: { 'data-admin-test-save': '' } }}
        secondary={[{ label: 'Retirer', onClick: () => undefined, data: { 'data-admin-test-remove': '' } }]}
        onCancel={() => undefined}
      />,
    );
    const save = host.querySelector('[data-admin-test-save]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.getAttribute('aria-busy')).toBe('true');
    expect((host.querySelector('[data-admin-test-remove]') as HTMLButtonElement).disabled).toBe(true);
    expect((host.querySelector('[data-admin-form-cancel]') as HTMLButtonElement).disabled).toBe(true);
  });

  test('hors ligne : les gestes sont désactivés, Annuler reste offert', async () => {
    await withOffline(async () => {
      const host = await mount(
        <AdminFormActions
          language="fr"
          primary={{ label: 'Enregistrer', data: { 'data-admin-test-save': '' } }}
          secondary={[{ label: 'Retirer', onClick: () => undefined, data: { 'data-admin-test-remove': '' } }]}
          onCancel={() => undefined}
        />,
      );
      expect((host.querySelector('[data-admin-test-save]') as HTMLButtonElement).disabled).toBe(true);
      expect((host.querySelector('[data-admin-test-remove]') as HTMLButtonElement).disabled).toBe(true);
      expect((host.querySelector('[data-admin-form-cancel]') as HTMLButtonElement).disabled).toBe(false);
      expect(host.querySelector('[data-admin-form-actions]')?.getAttribute('data-admin-form-offline')).toBe('true');
    });
  });
});

describe('AdminFormError et AdminFormStatus', () => {
  test('le refus est une alerte, avec son ancre ; vide, il ne rend rien', async () => {
    const host = await mount(
      <>
        <AdminFormError text="Refusé" data={{ 'data-admin-test-refused': 'taken' }} />
        <AdminFormError text="" />
      </>,
    );
    const alerts = host.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(1);
    expect(alerts[0]?.textContent).toBe('Refusé');
    expect(alerts[0]?.getAttribute('data-admin-test-refused')).toBe('taken');
  });

  test('l’état est monté VIDE et poli, puis porte son texte', async () => {
    function Harness() {
      const [phase, setPhase] = useState<'idle' | 'saved'>('idle');
      return (
        <>
          <AdminFormStatus phase={phase} text={phase === 'saved' ? 'Enregistré' : ''} data={{ 'data-admin-test-state': '' }} />
          <button type="button" data-go onClick={() => setPhase('saved')}>
            go
          </button>
        </>
      );
    }
    const host = await mount(<Harness />);
    const status = host.querySelector('[role="status"]') as HTMLElement;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
    expect(status.getAttribute('data-admin-form-status')).toBe('idle');
    expect(status.hasAttribute('data-admin-test-state')).toBe(true);
    await click(host.querySelector('[data-go]'));
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Enregistré');
    expect(host.querySelector('[role="status"]')?.getAttribute('data-admin-form-status')).toBe('saved');
  });
});

describe('useArmedConfirm — la confirmation en deux temps', () => {
  test('armer, puis désarmer', async () => {
    function Harness() {
      const { armed, arm, disarm } = useArmedConfirm<'save' | 'remove'>();
      return (
        <>
          <p data-armed>{armed ?? 'none'}</p>
          <button type="button" data-arm onClick={() => arm('remove')}>
            arm
          </button>
          <button type="button" data-disarm onClick={disarm}>
            disarm
          </button>
        </>
      );
    }
    const host = await mount(<Harness />);
    expect(host.querySelector('[data-armed]')?.textContent).toBe('none');
    await click(host.querySelector('[data-arm]'));
    expect(host.querySelector('[data-armed]')?.textContent).toBe('remove');
    await click(host.querySelector('[data-disarm]'));
    expect(host.querySelector('[data-armed]')?.textContent).toBe('none');
  });
});

describe('AdminFormSheet — la feuille centrée et éditable', () => {
  test('centrée, corps en div (jamais un div dans un ul), fermeture dans la langue de l’administration', async () => {
    const host = await mount(
      <AdminFormSheet language="fr" title="Créer un compte" data={{ 'data-admin-test-sheet': '' }} onClose={() => undefined}>
        <p data-child>contenu</p>
      </AdminFormSheet>,
    );
    const dialog = host.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.getAttribute('data-sheet-presentation')).toBe('centered');
    expect(dialog.querySelector('ul')).toBeNull();
    expect(dialog.querySelector('button[aria-label="Fermer"]')).not.toBeNull();
    expect(dialog.querySelector('[data-admin-test-sheet] [data-child]')).not.toBeNull();
    expect(dialog.querySelector('form')).toBeNull();
  });

  test('avec onSubmit : un form sans validation native, la soumission ne recharge rien', async () => {
    let submitted = 0;
    const host = await mount(
      <AdminFormSheet language="fr" title="Créer" data={{ 'data-admin-test-form': '' }} onClose={() => undefined} onSubmit={() => (submitted += 1)}>
        <button type="submit" data-go>
          Créer
        </button>
      </AdminFormSheet>,
    );
    const form = host.querySelector('form') as HTMLFormElement;
    expect(form.noValidate).toBe(true);
    expect(form.hasAttribute('data-admin-test-form')).toBe(true);
    const event = new Event('submit', { bubbles: true, cancelable: true });
    await act(async () => {
      form.dispatchEvent(event);
    });
    expect(submitted).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
