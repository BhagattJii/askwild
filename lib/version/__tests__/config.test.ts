import { describe, expect, test, vi } from 'vitest'

import { parseVersionCheckConfig } from '../config'

describe('parseVersionCheckConfig', () => {
  test.each([
    {
      name: 'defaults when nothing is set',
      env: {},
      expected: {
        repo: 'miurla/hawkin',
        ttlSeconds: 86400,
        disabled: false
      }
    },
    {
      name: 'repo override',
      env: { HAWKIN_UPDATE_CHECK_REPO: 'acme/hawkin' },
      expected: {
        repo: 'acme/hawkin',
        ttlSeconds: 86400,
        disabled: false
      }
    },
    {
      name: 'ttl override',
      env: { HAWKIN_UPDATE_CHECK_TTL_SECONDS: '3600' },
      expected: {
        repo: 'miurla/hawkin',
        ttlSeconds: 3600,
        disabled: false
      }
    },
    {
      name: 'ttl below floor clamps to 300',
      env: { HAWKIN_UPDATE_CHECK_TTL_SECONDS: '10' },
      expected: {
        repo: 'miurla/hawkin',
        ttlSeconds: 300,
        disabled: false
      }
    },
    {
      name: 'ttl at the floor stays at 300',
      env: { HAWKIN_UPDATE_CHECK_TTL_SECONDS: '300' },
      expected: {
        repo: 'miurla/hawkin',
        ttlSeconds: 300,
        disabled: false
      }
    },
    {
      name: 'non-numeric ttl falls back to the default',
      env: { HAWKIN_UPDATE_CHECK_TTL_SECONDS: 'banana' },
      expected: {
        repo: 'miurla/hawkin',
        ttlSeconds: 86400,
        disabled: false
      }
    },
    {
      name: 'empty ttl falls back to the default',
      env: { HAWKIN_UPDATE_CHECK_TTL_SECONDS: '' },
      expected: {
        repo: 'miurla/hawkin',
        ttlSeconds: 86400,
        disabled: false
      }
    },
    {
      name: 'fractional ttl is truncated',
      env: { HAWKIN_UPDATE_CHECK_TTL_SECONDS: '3600.9' },
      expected: {
        repo: 'miurla/hawkin',
        ttlSeconds: 3600,
        disabled: false
      }
    },
    {
      name: 'disabled flag',
      env: { HAWKIN_UPDATE_CHECK_DISABLED: 'true' },
      expected: {
        repo: 'miurla/hawkin',
        ttlSeconds: 86400,
        disabled: true
      }
    },
    {
      name: 'disabled only matches the literal true',
      env: { HAWKIN_UPDATE_CHECK_DISABLED: 'yes' },
      expected: {
        repo: 'miurla/hawkin',
        ttlSeconds: 86400,
        disabled: false
      }
    }
  ])('$name', ({ env, expected }) => {
    expect(parseVersionCheckConfig(env)).toEqual(expected)
  })

  test('valid repo variants pass through', () => {
    expect(
      parseVersionCheckConfig({
        HAWKIN_UPDATE_CHECK_REPO: 'acme-foundation/hawkin.rs'
      }).repo
    ).toBe('acme-foundation/hawkin.rs')
  })

  test('invalid repo values fall back to the default with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalid = [
      'https://github.com/acme/hawkin',
      'acme/hawkin/',
      'acme/hawkin/extra',
      'not a repo',
      'acme'
    ]
    for (const repo of invalid) {
      expect(
        parseVersionCheckConfig({ HAWKIN_UPDATE_CHECK_REPO: repo }).repo
      ).toBe('miurla/hawkin')
    }
    expect(warnSpy).toHaveBeenCalledTimes(invalid.length)

    warnSpy.mockRestore()
  })
})
