// Barrel test: importing from the index exercises all re-export lines (100% line coverage).

import * as AdminHooksIndex from '@/hooks/admin';

describe('hooks/admin/index.ts barrel exports', () => {
  it('exports useAdminSettings', () => {
    expect(AdminHooksIndex.useAdminSettings).toBeDefined();
  });

  it('exports useSettingsValidation', () => {
    expect(AdminHooksIndex.useSettingsValidation).toBeDefined();
  });

  it('exports useSettingsSave', () => {
    expect(AdminHooksIndex.useSettingsSave).toBeDefined();
  });
});
