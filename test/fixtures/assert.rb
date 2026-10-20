# typed: true
# Construct every supported type from Ruby values without environment loading.

expected = {
  real_env: EnvSchema::RealEnv::Local,
  enabled: false,
  port: 3000,
  rate: 0.5,
  app_name: 'fixture-app',
  optional: nil,
  retry_count: -2,
  metadata: {'label' => 'fixture', 'nested' => {'active' => true}, 'items' => [1, nil]},
  boolean_choice: EnvSchema::BooleanChoice::False,
  numeric_choice: EnvSchema::NumericChoice::Value2Point5,
  mixed_choice: EnvSchema::MixedChoice::Value2,
  optional_env: nil,
  optional_env_set: EnvSchema::OptionalEnvSet::Production,
  labels: ['api', 'worker'],
  counts: [1, -2, 3],
  ratios: [1, 0.5],
  switches: [true, false],
  deployments: [EnvSchema::DeploymentsItem::Local, EnvSchema::DeploymentsItem::Production],
  services: [{'name' => 'api'}, {'name' => 'worker'}],
  empty_labels: [],
  limits: {'api' => 10, 'worker' => 2},
  features: {'search' => EnvSchema::FeaturesValue::Enabled, 'export' => EnvSchema::FeaturesValue::Disabled},
  regions: {EnvSchema::RegionsKey::Us => true, EnvSchema::RegionsKey::Eu => false},
  region_metadata: {EnvSchema::RegionMetadataKey::Primary => {'label' => 'api'}, EnvSchema::RegionMetadataKey::Secondary => [1, true]},
  extra_metadata: {'label' => 'extra', 'count' => 2},
  matrix: [[1, 2], [3, 4]],
  deployment_groups: {
    'api' => [EnvSchema::DeploymentGroupsValueItem::Local, EnvSchema::DeploymentGroupsValueItem::Production],
    'worker' => [EnvSchema::DeploymentGroupsValueItem::Production],
  },
  feature_sets: [{'search' => EnvSchema::FeatureSetsItemValue::Enabled}, {'export' => EnvSchema::FeatureSetsItemValue::Disabled}],
  priorities: {'api' => {'read' => EnvSchema::PrioritiesValueValue::Low, 'write' => EnvSchema::PrioritiesValueValue::High}},
  optional_labels: nil,
  optional_flags: nil,
  optional_groups: {'api' => [EnvSchema::OptionalGroupsValueItem::Production]},
}

raise 'Fixture expectations must cover every generated property' unless EnvSchema.props.keys.sort == expected.keys.sort
instance = EnvSchema.new(**expected)
raise 'Schema must not initialize Env' if Object.const_defined?(:Env)
expected.each do |property, value|
  raise "Unexpected fixture value for #{property}" unless instance.public_send(property) == value
end
