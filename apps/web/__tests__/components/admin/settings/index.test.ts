// Barrel test: importing from the index exercises all re-export lines (100% line coverage).

import * as SettingsIndex from '@/components/admin/settings';

describe('settings/index.ts barrel exports', () => {
  it('exports SettingField', () => {
    expect(SettingsIndex.SettingField).toBeDefined();
  });

  it('exports SettingsHeader', () => {
    expect(SettingsIndex.SettingsHeader).toBeDefined();
  });

  it('exports SettingsAlerts', () => {
    expect(SettingsIndex.SettingsAlerts).toBeDefined();
  });

  it('exports SettingsStats', () => {
    expect(SettingsIndex.SettingsStats).toBeDefined();
  });

  it('exports GeneralSettingsSection', () => {
    expect(SettingsIndex.GeneralSettingsSection).toBeDefined();
  });

  it('exports DatabaseSettingsSection', () => {
    expect(SettingsIndex.DatabaseSettingsSection).toBeDefined();
  });

  it('exports SecuritySettingsSection', () => {
    expect(SettingsIndex.SecuritySettingsSection).toBeDefined();
  });

  it('exports RateLimitingSettingsSection', () => {
    expect(SettingsIndex.RateLimitingSettingsSection).toBeDefined();
  });

  it('exports MessagesSettingsSection', () => {
    expect(SettingsIndex.MessagesSettingsSection).toBeDefined();
  });

  it('exports UploadsSettingsSection', () => {
    expect(SettingsIndex.UploadsSettingsSection).toBeDefined();
  });

  it('exports ServerSettingsSection', () => {
    expect(SettingsIndex.ServerSettingsSection).toBeDefined();
  });

  it('exports FeaturesSettingsSection', () => {
    expect(SettingsIndex.FeaturesSettingsSection).toBeDefined();
  });
});
