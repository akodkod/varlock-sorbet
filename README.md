# varlock-sorbet

Generate Ruby Sorbet structs and nested enums from a Varlock environment schema.

## Setup

You need Varlock 1.23+ and Ruby with `sorbet-runtime` to use the generated file. The npm package also requires Node.js 22+.

Install `varlock-sorbet` and Varlock in your JavaScript project:

```sh
npm install varlock varlock-sorbet
```

For a Ruby-only project with the Varlock standalone binary, pin the plugin to a published version with `@plugin(varlock-sorbet@1.0.0)`. To try an unreleased version, follow the local plugin example under Development.

Add the runtime dependency to your Gemfile:

```ruby
gem 'sorbet-runtime'
```

Configure the plugin in `.env.schema`:

```dotenv
# @plugin(varlock-sorbet)
# @generateSorbetEnv(path=lib/env_schema.rb)

# @tag(api, app, hq, cli) @required @type=enum(local, staging, demo, production)
PUBLIC_REAL_ENV=local

# @required @type=boolean
ENABLE_SMS_DELIVERY=false

# @required=false @type=string
SENTRY_DSN=
```

Run `varlock codegen`, or let `varlock load` / `varlock run` generate the file automatically. You must set `path`; Varlock resolves it relative to the file that declares the generator.

```ruby
require_relative "env_schema"

env_values = T.let(Varlock.load!, T::Hash[String, T.untyped])

env_values = env_values.transform_keys do |key|
  key
    .downcase
    .delete_prefix("public_")
    .delete_prefix("vite_")
    .delete_prefix("nuxt_public_")
    .delete_prefix("next_public_")
    .delete_prefix("react_app_")
end

result = EnvSchema.deserialize_from(:hash, env_values)
raise "Failed to deserialize environment variables: #{result.error}" unless result.success?

Env = T.let(result.payload, EnvSchema)

Env.real_env == EnvSchema::RealEnv::Local
```

The generated file defines the struct and its nested enums. Your application must load configuration and supply typed values: the file does not read environment variables, deserialize values, or create an `Env` constant. You can use `sorbet-schema` for deserialization, but it is optional.

## Options

| Option             | Default                                                    | Meaning                                    |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------ |
| `path`             | Required; use `lib/env_schema.rb`                          | Output file, managed by Varlock            |
| `structName`       | `EnvSchema`                                                | Ruby struct class                          |
| `prefixesToRemove` | `[PUBLIC_, VITE_, NUXT_PUBLIC_, NEXT_PUBLIC_, REACT_APP_]` | Prefixes stripped from Ruby property names |

`structName` must be a simple Ruby constant, such as `AppEnvSchema`; namespace paths are not supported. There is no `variableName`, `fileLocation`, or `enumClassPrefix` option.

```dotenv
# @generateSorbetEnv(path=lib/settings.rb, structName=SettingsSchema, prefixesToRemove=[PUBLIC_, APP_])
```

You can also pass a quoted comma-separated string: `prefixesToRemove="PUBLIC_,APP_"`. Use `prefixesToRemove=[]` to keep all prefixes. The generator matches prefixes without regard to case and removes only one leading prefix, checking the longest first. It lowercases underscore-separated environment keys for Ruby properties. If two keys produce the same property name, generation fails.

Varlock's shared `auto`, `executeWhenImported`, and `filter` options pass through unchanged:

```dotenv
# @generateSorbetEnv(path=lib/env_schema.rb, auto=false, filter="#api")
```

With `auto=false`, run `varlock codegen` yourself. Imported generators run only when `executeWhenImported=true`. See [Varlock code generation](https://varlock.dev/guides/code-generation/).

## Generated types

```ruby
class EnvSchema < T::Struct
  class RealEnv < T::Enum
    enums do
      Local = new("local")
      Staging = new("staging")
      Demo = new("demo")
      Production = new("production")
    end
  end

  const :real_env, RealEnv
end
```

| Varlock coerced type                         | Sorbet type                     |
| -------------------------------------------- | ------------------------------- |
| string (including string-based custom types) | `String`                        |
| int                                          | `Integer`                       |
| number                                       | `T.any(Integer, Float)`         |
| boolean                                      | `T::Boolean`                    |
| object                                       | `T::Hash[String, T.untyped]`    |
| enum                                         | Nested `T::Enum`                |
| array                                        | `T::Array[element type]`        |
| record                                       | `T::Hash[key type, value type]` |

Optional fields wrap their type in `T.nilable`. The generated Ruby does not include Varlock defaults, so your application must supply required values when constructing the struct. Set `@required=false` explicitly for optional variables if your schema uses Varlock's default required behavior.

Enum names add `Item`, `Value`, or `Key` for collection elements. Enum members preserve their serialized values, and unspecified record values use `T.untyped`.

Generation fails if properties, enum names, or member names are invalid or collide. The generator skips keys that Varlock excludes, such as internal variables. It includes field descriptions, documentation links, and deprecation notes as Ruby comments, but never writes resolved environment values into the source.

## Existing app enums

Use `@sorbetType` on an enum field to reuse an existing Ruby `T::Enum`:

```dotenv
# @required @type=enum(local, staging, demo, production) @sorbetType=App::RealEnv
PUBLIC_REAL_ENV=local
```

The generator emits `const :real_env, App::RealEnv` and does not generate a nested enum for that field. It uses the class name exactly as supplied, without adding `::`. Optional fields become `T.nilable(App::RealEnv)`.

Load the existing enum before the generated file, or make it available through your app's autoloader. Its serialized values must match the schema's enum values. `@sorbetType` accepts a static Ruby constant path and currently applies only to direct enum fields, not arrays or records. The generator does not load Ruby classes or verify their members.

## Development

Use Vite+ with pnpm, and install the Ruby test dependencies from `Gemfile`:

```sh
pnpm install
bundle install
pnpm build
pnpm test
pnpm typecheck
pnpm check
```

Make sure `ruby` and `srb` are on `PATH`, or set the `RUBY` and `SRB` executable overrides. The Ruby runtime and static-check tests are required; they fail if the tools are missing. `pnpm format` applies the configured single quotes and no semicolons to TypeScript.

`pnpm build` produces a single `dist/plugin.cjs` bundle. Varlock supplies the external `varlock/plugin-lib` module. To try it locally:

```sh
pnpm exec varlock codegen --path examples/.env.schema
ruby -r ./examples/env_schema.rb -e 'puts EnvSchema::RealEnv::Local.serialize'
```

Tests check generated-file snapshots, Ruby execution, and Sorbet static checking. They also exercise the Varlock CLI to test plugin loading, filtering, prefix syntax, custom paths, and both automatic and explicit generation.

The integration fixture is in `test/fixtures/.env.schema`, alongside its generated `env_schema.rb`. Tests copy the schema to a temporary directory and generate Ruby through the built plugin. They compare the entire output with the checked-in file, then load it in Ruby and construct every supported type explicitly. Normal test runs leave both fixtures unchanged.

After changing the schema or generator, refresh the generated fixture with:

```sh
pnpm fixtures:update
```

## Publishing

Use Node.js 22+ and a Ruby installation with the dependencies from `Gemfile.lock`.
Make sure that installation's `ruby`, `bundle`, and `srb` executables are on `PATH`.

```sh
pnpm install --frozen-lockfile
bundle install
pnpm validate
npm pack
tar -tzf varlock-sorbet-1.0.0.tgz
```

The tarball contains only `package.json`, `README.md`, `LICENSE`, and
`dist/plugin.cjs`. The integration suite tests loading the packed package through
Varlock from outside the source checkout. `npm pack` rebuilds the bundle using
`prepack`.

To release, check the version in `package.json`, sign in to the
intended npm account, and publish from the repository root:

```sh
npm login
npm publish
```

`npm publish` runs type checks, formatting/lint checks, and all tests through
`prepublishOnly`, then rebuilds the bundle. The package is published to the public npm
registry. Update the version and the versioned examples above for later releases.

## License

[MIT](LICENSE)
