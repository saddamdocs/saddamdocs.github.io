/**
 * Unit tests for `src/lib/channel.ts`: the channel table of PLAN 9 and the storage-name rule of
 * PLAN 5.9 rule 6.
 */

import { describe, expect, it } from 'vitest';
import { channel, channelDefinition, isChannelName, storageName } from '../../src/lib/channel.ts';

describe('channel table (PLAN 9)', () => {
  it('names, prefixes and databases match the plan', () => {
    expect(channelDefinition('stable')).toEqual({
      name: 'stable',
      appName: 'Tamanduá',
      prefix: 'tamandua-stable',
      databaseUrl: 'https://tamandua-notes-default-rtdb.europe-west1.firebasedatabase.app',
    });
    expect(channelDefinition('next')).toEqual({
      name: 'next',
      appName: 'Tamanduá (next)',
      prefix: 'tamandua-next',
      databaseUrl: 'https://tamandua-test-default-rtdb.europe-west1.firebasedatabase.app',
    });
  });

  it('the two channels share no prefix and no database', () => {
    const stable = channelDefinition('stable');
    const next = channelDefinition('next');
    expect(stable.prefix).not.toBe(next.prefix);
    expect(stable.databaseUrl).not.toBe(next.databaseUrl);
    expect(stable.prefix.startsWith(next.prefix)).toBe(false);
    expect(next.prefix.startsWith(stable.prefix)).toBe(false);
  });

  it('accepts only the two channel names', () => {
    expect(isChannelName('stable')).toBe(true);
    expect(isChannelName('next')).toBe(true);
    for (const bad of ['', 'Stable', 'dev', undefined, null, 1]) {
      expect(isChannelName(bad)).toBe(false);
    }
  });

  it('outside a Vite build, falls back to next with no emulator', () => {
    expect(channel.name).toBe('next');
    expect(channel.emulatorNamespace).toBeNull();
  });
});

describe('storageName (PLAN 5.9 rule 6)', () => {
  it('always starts with the channel prefix', () => {
    expect(storageName()).toBe('tamandua-next');
    expect(storageName('instance')).toBe('tamandua-next-instance');
  });
});
