// Regional data and defaults for should-cost calculations

const REGIONS = {
  USA: {
    laborRate: 28.50,
    secMachineRate: 10.0,
    secOpsMin: 0.25,
    ohRate: 0.90,
    sgaRate: 0.07,
    marginRate: 0.10,
    pkg: 0.08,
    freight: 0.04,
    duty: 0.00,
    multiplier: 1.00
  },
  Mexico: {
    laborRate: 5.80,
    secMachineRate: 6.5,
    secOpsMin: 0.30,
    ohRate: 0.60,
    sgaRate: 0.06,
    marginRate: 0.09,
    pkg: 0.07,
    freight: 0.08,
    duty: 0.00,
    multiplier: 0.615
  },
  China: {
    laborRate: 7.20,
    secMachineRate: 5.5,
    secOpsMin: 0.35,
    ohRate: 0.65,
    sgaRate: 0.07,
    marginRate: 0.08,
    pkg: 0.06,
    freight: 0.18,
    duty: 0.25,
    multiplier: 0.538
  },
  Indonesia: {
    laborRate: 2.80,
    secMachineRate: 4.0,
    secOpsMin: 0.45,
    ohRate: 0.45,
    sgaRate: 0.05,
    marginRate: 0.08,
    pkg: 0.06,
    freight: 0.22,
    duty: 0.10,
    multiplier: 0.364
  }
};

const TONNAGE_BRACKETS = [
  { maxTons: 50, baseUSA: 32, name: 'Micro' },
  { maxTons: 100, baseUSA: 42, name: 'Small' },
  { maxTons: 200, baseUSA: 52, name: 'Medium' },
  { maxTons: 400, baseUSA: 68, name: 'Large' },
  { maxTons: 700, baseUSA: 88, name: 'XL' },
  { maxTons: 1000, baseUSA: 110, name: 'XXL' },
  { maxTons: 9999, baseUSA: 140, name: 'Giga' }
];

const DEFAULTS = {
  partNumber: 'PN-0001',
  partName: 'Sample Part',
  region: 'Mexico',
  partWeightG: 85,
  runnerPct: 14,
  runnerWeightOverride: null,
  regrindRate: 0.30,
  cavities: 2,
  cycleTimeSec: 28,
  utilization: 0.85,
  scrapRate: 0.02,
  resinCostPerKg: 2.98,
  tonnage: 250,
  machineRateOverride: null,
  laborRateOverride: null,
  ohRateOverride: null,
  marginRateOverride: null,
  toolingCost: 85000,
  toolLife: 750000,
  cumulativeVolume: 0
};

const FIELD_KEYS = [
  'key', 'partNumber', 'partName', 'region', 'partWeightG', 'runnerPct',
  'runnerWeightOverride', 'regrindRate', 'cavities', 'cycleTimeSec',
  'utilization', 'scrapRate', 'resinCostPerKg', 'tonnage', 'machineRateOverride',
  'laborRateOverride', 'ohRateOverride', 'marginRateOverride', 'toolingCost',
  'toolLife', 'cumulativeVolume'
];

// Helper to get region object
function getRegion(regionName) {
  return REGIONS[regionName] || REGIONS.Mexico;
}

// Helper to find tonnage bracket
function findBracket(tonnage) {
  return TONNAGE_BRACKETS.find(b => tonnage <= b.maxTons) || TONNAGE_BRACKETS[TONNAGE_BRACKETS.length - 1];
}
