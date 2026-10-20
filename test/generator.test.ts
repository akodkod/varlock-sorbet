import { describe, expect, test } from 'vite-plus/test'
import { generateSorbetEnv } from '../src/generator'
import { resolveOptions } from '../src/options'
import { propertyName } from '../src/naming'
import { example, field, representative } from './fixtures'

describe('options and names', () => {
  test('defaults and empty prefixes', () => {
    expect(resolveOptions()).toMatchObject({ structName: 'EnvSchema' })
    expect(resolveOptions({ prefixesToRemove: [] }).prefixesToRemove).toEqual([])
    expect(propertyName('public_REAL_ENV', resolveOptions().prefixesToRemove)).toBe('real_env')
    expect(propertyName('NUXT_PUBLIC_URL', resolveOptions().prefixesToRemove)).toBe('url')
    expect(propertyName('PUBLIC_VITE_URL', resolveOptions().prefixesToRemove)).toBe('vite_url')
    expect(propertyName('VITE_URL', [])).toBe('vite_url')
  })
  test('CSV, longest prefix and lowercase properties', () => {
    const opts = resolveOptions({ prefixesToRemove: ' APP_, app_public_, APP_ ' })
    expect(propertyName('app_PUBLIC_API_URL', opts.prefixesToRemove)).toBe('api_url')
  })
  test.each([
    { structName: 'env' },
    { structName: 'X::Y' },
    { structName: 'ENV' },
    { prefixesToRemove: [false] },
  ])('rejects %j', (opts) => {
    expect(() => resolveOptions(opts)).toThrow()
  })
  test('rejects property and class collisions', () => {
    expect(() => generateSorbetEnv([field('FOO'), field('PUBLIC_FOO')])).toThrow(/FOO.*PUBLIC_FOO/)
    expect(() => generateSorbetEnv([field('CLASS')])).toThrow(/reserved/)
    expect(() => generateSorbetEnv([field('123')])).toThrow(/invalid/)
    expect(() => generateSorbetEnv([field('APP-NAME')])).toThrow(/invalid/)
    expect(() =>
      generateSorbetEnv([field('A_B', { enum: ['a'] }), field('A__B', { enum: ['b'] })]),
    ).toThrow(/Enum class AB collides/)
    expect(() => generateSorbetEnv([field('FOO', { enum: ['a-b', 'a_b'] })])).toThrow(
      /member AB collides/,
    )
  })
})

test('example golden output', async () => {
  await expect(generateSorbetEnv([example])).toMatchFileSnapshot('./golden/example.rb')
})

test('reference schema golden output', async () => {
  await expect(generateSorbetEnv(representative)).toMatchFileSnapshot('./golden/representative.rb')
})

test('custom names, recursive types and docs', () => {
  const f = field('CUSTOM', { arrayOf: { recordOf: { values: { enum: ['yes', 'no'] } } } }, false)
  f.docs.description = 'Line one\rLine two\n#{danger}'
  const source = generateSorbetEnv([f], { structName: 'SettingsSchema' })
  expect(source).toContain('class CustomItemValue < T::Enum')
  expect(source).toContain('T.nilable(T::Array[T::Hash[::String, CustomItemValue]])')
  expect(source).toContain('class SettingsSchema < T::Struct')
  expect(source).toContain('  # Line two\n  # #{danger}')
})

test('Ruby literals escape interpolation and preserve strings', () => {
  const source = generateSorbetEnv([
    field('VALUE', { enum: ['#{raise "boom"}', 'a\\b', 'hello\nworld'] }),
  ])
  expect(source).toContain('\\#{raise')
  expect(source).toContain('a\\\\b')
})

test.each(['RealEnv', 'App::RealEnv', '::App::RealEnv'])(
  'uses existing enum class %s verbatim',
  (sorbetType) => {
    const source = generateSorbetEnv([
      { ...example, sorbetType },
      { ...field('OPTIONAL_ENV', { enum: ['local'] }, false), sorbetType },
    ])
    expect(source).toContain(`const :real_env, ${sorbetType}`)
    expect(source).toContain(`const :optional_env, T.nilable(${sorbetType})`)
    expect(source).not.toContain('< T::Enum')
  },
)

test.each(['', 'realEnv', 'App::', 'App; exit', 'T.any(A, B)'])(
  'rejects invalid sorbetType %s',
  (sorbetType) => {
    expect(() => generateSorbetEnv([{ ...example, sorbetType }])).toThrow(/Ruby class name/)
  },
)

test('rejects sorbetType on non-enum fields', () => {
  expect(() => generateSorbetEnv([{ ...field('NAME'), sorbetType: 'App::Name' }])).toThrow(
    /only supported on enum fields/,
  )
})
