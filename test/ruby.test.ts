import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, expect, test } from 'vite-plus/test'
import { generateSorbetEnv } from '../src/generator'
import { example, field, representative } from './fixtures'

const dir = mkdtempSync(path.join(tmpdir(), 'varlock-sorbet-ruby-'))
const ruby = process.env.RUBY ?? 'ruby'
const srb = process.env.SRB ?? 'srb'
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const generated = path.join(dir, 'env.rb')
test('rejects inherited Ruby method names before emitting a struct', () => {
  const names = execFileSync(
    ruby,
    [
      '-rsorbet-runtime',
      '-e',
      `Object.instance_methods.map(&:to_s).sort.each do |name|
  next unless name.match?(/\\A[a-z_][a-z0-9_]*\\z/)
  begin
    Class.new(T::Struct).const(name.to_sym, String)
  rescue ArgumentError => error
    raise unless error.message.include?("can't be used as a prop")
    puts name
  end
end`,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
  expect(names).toEqual(expect.arrayContaining(['display', 'to_s', 'instance_variable_get']))
  for (const name of names) {
    for (const key of [name.toUpperCase(), `PUBLIC_${name.toUpperCase()}`]) {
      expect(() => generateSorbetEnv([field(key)]), key).toThrow(/reserved Ruby property/)
    }
  }
})

writeFileSync(
  generated,
  generateSorbetEnv([example, field('PORT', 'int'), field('OPTIONAL', 'string', false)]),
)

test.each([undefined, '{invalid-json'])(
  'schema loads without reading environment values (%s)',
  (payload) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: 'not-an-integer',
      PUBLIC_REAL_ENV: 'invalid-enum',
    }
    delete env.__VARLOCK_ENV
    if (payload !== undefined) env.__VARLOCK_ENV = payload
    const result = spawnSync(
      ruby,
      [
        '-r',
        generated,
        '-e',
        `
raise if Object.const_defined?(:Env)
raise if defined?(Typed::Schema)
instance = EnvSchema.new(real_env: EnvSchema::RealEnv::Local, port: 3000)
raise unless instance.real_env.equal?(EnvSchema::RealEnv::Local)
raise unless instance.port == 3000 && instance.optional.nil?
raise if instance.respond_to?(:port=)
`,
      ],
      { env, encoding: 'utf8' },
    )
    expect(result.status, result.stderr).toBe(0)
  },
)

test('Ruby syntax and Sorbet static checks', () => {
  expect(execFileSync(ruby, ['-c', generated], { encoding: 'utf8' })).toContain('Syntax OK')
  const ref = path.join(dir, 'reference.rb')
  writeFileSync(ref, generateSorbetEnv(representative, { structName: 'ReferenceSchema' }))
  const result = spawnSync(srb, ['tc', '--no-config', generated, ref], { encoding: 'utf8' })
  expect(result.stdout + result.stderr).toContain('No errors!')
  expect(result.status).toBe(0)
})

test('Sorbet rejects incorrect types at a consumer call site', () => {
  const consumer = path.join(dir, 'consumer.rb')
  writeFileSync(
    consumer,
    `# typed: true
instance = EnvSchema.new(real_env: EnvSchema::RealEnv::Local, port: 3000)
T.let(instance.port, String)
T.let(instance.real_env, String)
`,
  )
  const result = spawnSync(srb, ['tc', '--no-config', generated, consumer], { encoding: 'utf8' })
  expect(result.status).not.toBe(0)
  expect(result.stdout + result.stderr).toContain('Integer')
  expect(result.stdout + result.stderr).toContain('EnvSchema::RealEnv')
})

test('escaped enum serialization round-trips without evaluating Ruby interpolation', () => {
  const escaped = path.join(dir, 'escaped.rb')
  const value = '#{raise "boom"}\\a\nline'
  writeFileSync(escaped, generateSorbetEnv([field('ESCAPED', { enum: [value] })]))
  const result = spawnSync(
    ruby,
    ['-r', escaped, '-e', 'print EnvSchema::Escaped.values.first.serialize'],
    { encoding: 'utf8' },
  )
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toBe(value)
})
