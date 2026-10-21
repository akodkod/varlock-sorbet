# varlock-sorbet

Generate Ruby Sorbet structs and nested enums from a Varlock environment schema.

## Setup

Requires Varlock 1.23+, Node.js 22+ for package development, and Ruby with `sorbet-runtime` for the generated file.

Install `varlock-sorbet` alongside Varlock in your JavaScript project's dependencies. For a Ruby-only project using the Varlock standalone binary, use an exact published version in `@plugin(varlock-sorbet@VERSION)` instead. This package has not yet been published; use the local plugin example below while developing.

Add to your Gemfile:

```ruby
gem 'sorbet-runtime'
```

Add to `.env.schema`:

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

Run `varlock codegen`, or let `varlock load` / `varlock run` generate the file automatically. Varlock requires an explicit `path`, resolved relative to the file declaring the generator.

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

The generated file only defines the struct and its nested enums. It does not read environment variables, deserialize values, or create an `Env` constant. Your application supplies typed values and decides how to load configuration. `sorbet-schema` is optional if your application chooses to use it for deserialization.

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

A quoted comma-separated string is also accepted: `prefixesToRemove="PUBLIC_,APP_"`. Use `prefixesToRemove=[]` to disable stripping. Matching is case-insensitive and removes only one leading prefix, longest first. Environment keys use underscore-separated names, which are lowercased for Ruby properties. Colliding generated property names fail generation.

Varlock's shared `auto`, `executeWhenImported`, and `filter` options pass through unchanged:

```dotenv
# @generateSorbetEnv(path=lib/env_schema.rb, auto=false, filter="#api")
```

With `auto=false`, explicitly run `varlock codegen`. Imported generators run only when `executeWhenImported=true`. See [Varlock code generation](https://varlock.dev/guides/code-generation/).

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

Optional fields wrap their type in `T.nilable`. Varlock defaults are not embedded in generated Ruby; the application must supply required values when constructing the struct. Set `@required=false` explicitly for optional variables if your schema uses Varlock's default required behavior.

Enum names add `Item`, `Value`, or `Key` for collection elements. Enum members preserve their serialized values, and unspecified record values use `T.untyped`.

Invalid or colliding properties, enum names, and member names fail generation. Keys excluded by Varlock (such as internal variables) are not generated. Field descriptions, documentation links, and deprecation notes become Ruby comments. Resolved environment values are never written into the generated source.

## Existing app enums

Use `@sorbetType` on an enum field to reuse an existing Ruby `T::Enum`:

```dotenv
# @required @type=enum(local, staging, demo, production) @sorbetType=App::RealEnv
PUBLIC_REAL_ENV=local
```

The generator emits `const :real_env, App::RealEnv` and does not generate a nested enum for that field. The class name is used exactly as supplied, without adding `::`. Optional fields become `T.nilable(App::RealEnv)`.

Load the existing enum before the generated file, or make it available through your app's autoloader. Its serialized values must match the schema's enum values. `@sorbetType` accepts a static Ruby constant path and currently applies only to direct enum fields, not arrays or records. Generation does not load Ruby classes or verify their members.

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

Ensure `ruby` and `srb` are on `PATH`; tests also accept `RUBY` and `SRB` executable overrides. The Ruby runtime and static-check tests are required and do not silently skip when tools are missing. `pnpm format` applies the configured single quotes and no semicolons to TypeScript.

`pnpm build` produces a single `dist/plugin.cjs` bundle. Varlock supplies the external `varlock/plugin-lib` module. To try it locally:

```sh
pnpm exec varlock codegen --path examples/.env.schema
ruby -r ./examples/env_schema.rb -e 'puts EnvSchema::RealEnv::Local.serialize'
```

Tests cover generated-file snapshots, Ruby execution, Sorbet static checking, and actual Varlock CLI loading, filtering, prefix syntax, custom paths, and automatic/explicit generation.

The integration fixture lives in `test/fixtures/.env.schema`, alongside its generated `env_schema.rb`. Tests copy the schema to a temporary directory, generate Ruby through the built plugin, compare the entire output with the checked-in file, and load it in Ruby to construct every supported type explicitly. Normal test runs do not rewrite either fixture.

After intentionally changing the schema or generator, refresh the generated fixture with:

```sh
pnpm fixtures:update
```
