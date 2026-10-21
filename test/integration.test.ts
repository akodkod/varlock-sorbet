import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vite-plus/test'

const root = process.cwd()
const cli = path.join(root, 'node_modules/varlock/bin/cli.js')
const dir = mkdtempSync(path.join(tmpdir(), 'varlock-sorbet-integration-'))
const ruby = process.env.RUBY ?? 'ruby'
const fixtureDir = path.join(root, 'test/fixtures')
const fixtureSchema = readFileSync(path.join(fixtureDir, '.env.schema'), 'utf8')
const baseSchema = fixtureSchema
  .split('\n')
  .filter((line) => !/^# @(plugin|generateSorbetEnv)\(/.test(line))
  .join('\n')

function setup(options = 'path=lib/env_schema.rb', schema = baseSchema) {
  writeFileSync(
    path.join(dir, '.env.schema'),
    `# @plugin(./plugin.cjs)\n# @generateSorbetEnv(${options})\n\n${schema}`,
  )
}
function run(...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, VARLOCK_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
  })
  expect(result.status, result.stdout + result.stderr).toBe(0)
  return result
}
beforeAll(() => {
  execFileSync(path.join(root, 'node_modules/.bin/vp'), ['pack'], { cwd: root })
  copyFileSync(path.join(root, 'dist/plugin.cjs'), path.join(dir, 'plugin.cjs'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

test('real schema regenerates the Ruby fixture and defines all supported types', () => {
  const isolatedFixture = path.join(dir, 'test/fixtures')
  mkdirSync(isolatedFixture, { recursive: true })
  mkdirSync(path.join(dir, 'dist'), { recursive: true })
  copyFileSync(path.join(root, 'dist/plugin.cjs'), path.join(dir, 'dist/plugin.cjs'))
  copyFileSync(path.join(fixtureDir, '.env.schema'), path.join(isolatedFixture, '.env.schema'))
  run('codegen', '--path', isolatedFixture)
  const generated = path.join(isolatedFixture, 'env_schema.rb')
  expect(readFileSync(generated, 'utf8')).toBe(
    readFileSync(path.join(fixtureDir, 'env_schema.rb'), 'utf8'),
  )
  execFileSync(ruby, ['-r', generated, path.join(fixtureDir, 'assert.rb')])
  execFileSync(process.env.SRB ?? 'srb', ['tc', '--no-config', generated])
})

test('native lifecycle supports custom paths, auto=false, explicit generation and unchanged files', () => {
  setup('path=custom/settings.rb, auto=false, structName=SettingsSchema')
  run('load')
  const target = path.join(dir, 'custom/settings.rb')
  expect(existsSync(target)).toBe(false)
  run('codegen')
  expect(readFileSync(target, 'utf8')).toContain('class SettingsSchema < T::Struct')
  const timestamp = statSync(target).mtimeMs
  run('codegen')
  expect(statSync(target).mtimeMs).toBe(timestamp)
})

test('native filtering and both prefix syntaxes', () => {
  for (const prefixes of ['[PUBLIC_]', '"PUBLIC_,VITE_"']) {
    setup(`path=filtered.rb, filter="#api", prefixesToRemove=${prefixes}`)
    run('codegen')
    const output = readFileSync(path.join(dir, 'filtered.rb'), 'utf8')
    expect(output).toContain('const :real_env, RealEnv')
    expect(output).not.toContain('const :enabled')
  }
})

test('automatic generation and empty prefix array', () => {
  setup('path=auto.rb, prefixesToRemove=[]')
  run('load')
  expect(readFileSync(path.join(dir, 'auto.rb'), 'utf8')).toContain(
    'const :public_real_env, PublicRealEnv',
  )
})

test('package subpath loads outside the source checkout', () => {
  const pkg = path.join(dir, 'node_modules/varlock-sorbet')
  mkdirSync(path.join(pkg, 'dist'), { recursive: true })
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dir], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, npm_config_cache: path.join(dir, 'npm-cache') },
    }),
  ) as { filename: string }[]
  execFileSync('tar', [
    '-xzf',
    path.join(dir, packed[0].filename),
    '--strip-components=1',
    '-C',
    pkg,
  ])
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ dependencies: { 'varlock-sorbet': '0.1.0' } }),
  )
  writeFileSync(
    path.join(dir, '.env.schema'),
    `# @plugin(varlock-sorbet)\n# @generateSorbetEnv(path=package.rb)\n\n${baseSchema}`,
  )
  run('codegen')
  expect(existsSync(path.join(dir, 'package.rb'))).toBe(true)
})

test('sorbetType references an existing app enum through the plugin lifecycle', () => {
  setup(
    'path=existing.rb',
    `# @required @type=enum(local, production) @sorbetType=App::RealEnv
PUBLIC_REAL_ENV=local
# @required=false @type=enum(local, production) @sorbetType=App::RealEnv
OPTIONAL_ENV=
`,
  )
  run('codegen')
  const target = path.join(dir, 'existing.rb')
  const source = readFileSync(target, 'utf8')
  expect(source).toContain('const :real_env, App::RealEnv')
  expect(source).toContain('const :optional_env, T.nilable(App::RealEnv)')
  expect(source).not.toContain('< T::Enum')
  const appEnum = path.join(dir, 'app_enum.rb')
  writeFileSync(
    appEnum,
    `require "sorbet-runtime"
module App
  class RealEnv < T::Enum
    enums do
      Local = new("local")
      Production = new("production")
    end
  end
end
`,
  )
  run(
    'run',
    '--inject',
    'vars',
    '--',
    ruby,
    '-r',
    appEnum,
    '-r',
    target,
    '-e',
    'instance = EnvSchema.new(real_env: App::RealEnv::Local); raise unless instance.real_env.equal?(App::RealEnv::Local) && instance.optional_env.nil?',
  )
})

test.each(['bad_name', 'App::', 'true'])('rejects invalid sorbetType decorator %s', (name) => {
  setup(
    'path=invalid.rb',
    `# @type=enum(local, production) @sorbetType=${name}
PUBLIC_REAL_ENV=local
`,
  )
  const result = spawnSync(process.execPath, [cli, 'codegen'], { cwd: dir, encoding: 'utf8' })
  expect(result.status).not.toBe(0)
  expect(result.stdout + result.stderr).toContain('@sorbetType')
})

test.each(['.env.production', '.env'])(
  'ignores sorbetType overrides from %s during code generation',
  (overrideFile) => {
    const isolated = mkdtempSync(path.join(dir, 'stable-types-'))
    writeFileSync(
      path.join(isolated, '.env.schema'),
      `# @plugin(../plugin.cjs)
# @generateSorbetEnv(path=env_schema.rb)
# @currentEnv=$SORBET_TEST_ENV

# @public
SORBET_TEST_ENV=development
# @type=enum(local, production) @sorbetType=App::RealEnv
REAL_ENV=local
# @type=enum(local, production)
OTHER_ENV=local
`,
    )
    const generate = (environment: string) => {
      const result = spawnSync(process.execPath, [cli, 'codegen'], {
        cwd: isolated,
        encoding: 'utf8',
        env: {
          ...process.env,
          SORBET_TEST_ENV: environment,
          VARLOCK_TELEMETRY_DISABLED: '1',
          NO_COLOR: '1',
        },
      })
      expect(result.status, result.stdout + result.stderr).toBe(0)
      return readFileSync(path.join(isolated, 'env_schema.rb'), 'utf8')
    }
    const baseline = generate('development')
    expect(baseline).toContain('const :real_env, App::RealEnv')
    expect(baseline).toContain('class OtherEnv < T::Enum')
    writeFileSync(
      path.join(isolated, overrideFile),
      `# @sorbetType=App::ProductionEnv
REAL_ENV=production
# @sorbetType=App::OtherEnv
OTHER_ENV=production
`,
    )
    expect(generate('production')).toBe(baseline)
    expect(generate('development')).toBe(baseline)
  },
)
