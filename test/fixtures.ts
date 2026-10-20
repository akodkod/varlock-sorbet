import type { CoercedType, ResolvedFieldType } from 'varlock/plugin-lib'

export function field(
  key: string,
  coerced: CoercedType = 'string',
  isRequired = true,
): ResolvedFieldType {
  return {
    key,
    coerced,
    isRequired,
    isSensitive: false,
    docs: { isDeprecated: false, docsLinks: [] },
  }
}
export const example = field('PUBLIC_REAL_ENV', {
  enum: ['local', 'staging', 'demo', 'production'],
})
export const representative = [
  example,
  field('SENTRY_DSN', 'string', false),
  field('MICROSOFT_CLIENT_ID'),
  field('MICROSOFT_CLIENT_SECRET'),
  field('ENABLE_SMS_DELIVERY', 'boolean'),
  field('SMS_DELIVERY_WHITELIST'),
  field('ENABLE_BROADCAST', 'boolean'),
  field('VERBOSE', 'boolean', false),
  field('DEV_SIMULATE_NETWORK_LAG_FOR_CONTROLLERS', 'boolean', false),
]
