import { describe, it, expect } from 'vitest'
import {
  ConversationReadingModeSchema,
  ReadingModePreferenceSchema,
  type ConversationReadingMode,
  type ReadingModePreference,
} from '../../types/reading-modes'

describe('ConversationReadingModeSchema', () => {
  const validModes: ConversationReadingMode[] = ['focal', 'script', 'summary', 'river', 'bubbles']

  it.each(validModes)('accepts %s and round-trips through parse', (mode) => {
    expect(ConversationReadingModeSchema.parse(mode)).toBe(mode)
  })

  it('rejects a value outside the enumeration', () => {
    expect(() => ConversationReadingModeSchema.parse('bulles')).toThrow()
    expect(() => ConversationReadingModeSchema.parse('Focal')).toThrow()
    expect(() => ConversationReadingModeSchema.parse('')).toThrow()
    expect(() => ConversationReadingModeSchema.parse(undefined)).toThrow()
  })
})

describe('ReadingModePreferenceSchema', () => {
  const validPreferences: ReadingModePreference[] = ['auto', 'focal', 'script', 'resume', 'riviere']

  it.each(validPreferences)('accepts %s and round-trips through parse', (preference) => {
    expect(ReadingModePreferenceSchema.parse(preference)).toBe(preference)
  })

  it('rejects a value outside the enumeration', () => {
    // 'summary'/'river'/'bubbles' are ConversationReadingMode values, not preferences —
    // the preference enum uses distinct labels ('resume', 'riviere').
    expect(() => ReadingModePreferenceSchema.parse('summary')).toThrow()
    expect(() => ReadingModePreferenceSchema.parse('river')).toThrow()
    expect(() => ReadingModePreferenceSchema.parse('bubbles')).toThrow()
    expect(() => ReadingModePreferenceSchema.parse('AUTO')).toThrow()
    expect(() => ReadingModePreferenceSchema.parse(null)).toThrow()
  })
})
