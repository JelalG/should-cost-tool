// Regional data and defaults for should-cost calculations

// Regional defaults. secOpsMin is a fallback only — the part-level input
// (inp.secOpsMin) takes precedence and defaults to 0 since most parts have no
// secondary ops. operatorsPerMachine reflects shop reality: USA = 1:1, Asia =
// 1 operator tending 3-5 machines, scaling direct labor accordingly.
// resinPriceFactor scales North American spec-sheet resin prices down to local
// market prices (Chinese local PBT-GF30 ≈ $2.75/kg vs RTP NA spec $4.50/kg).
//
// Multiplier note (2026 recalibration): machine rates aren't a flat multiple
// of labor cost — capital, energy, and parts are similar globally, only
// indirect labor and facilities vary regionally. Multipliers below reflect
// realistic burdened-rate ratios, not labor ratios. Sources: Plastics News
// hourly rate surveys, Mold-Making Technology cost benchmarks, ManufacturingHQ.
const REGIONS = {
  USA: {
    laborRate: 28.50,
    secMachineRate: 10.0,
    secOpsMin: 0.25,
    operatorsPerMachine: 1.0,
    ohRate: 0.90,
    sgaRate: 0.07,
    marginRate: 0.10,
    pkg: 0.08,
    freight: 0.04,
    duty: 0.00,
    multiplier: 1.00,
    resinPriceFactor: 1.00
  },
  Mexico: {
    laborRate: 5.80,
    secMachineRate: 6.5,
    secOpsMin: 0.30,
    operatorsPerMachine: 2.0,
    ohRate: 0.60,
    sgaRate: 0.06,
    marginRate: 0.09,
    pkg: 0.07,
    freight: 0.08,
    duty: 0.00,
    multiplier: 0.65,
    resinPriceFactor: 0.85
  },
  China: {
    laborRate: 7.20,
    secMachineRate: 5.5,
    secOpsMin: 0.35,
    operatorsPerMachine: 4.0,
    ohRate: 0.65,
    sgaRate: 0.07,
    marginRate: 0.08,
    pkg: 0.06,
    freight: 0.18,
    duty: 0.25,
    multiplier: 0.58,
    resinPriceFactor: 0.60
  },
  Indonesia: {
    laborRate: 2.80,
    secMachineRate: 4.0,
    secOpsMin: 0.45,
    operatorsPerMachine: 5.0,
    ohRate: 0.45,
    sgaRate: 0.05,
    marginRate: 0.08,
    pkg: 0.06,
    freight: 0.22,
    duty: 0.10,
    multiplier: 0.45,
    resinPriceFactor: 0.65
  }
};

// Machine rate brackets (2026 industry-calibrated). USA base rates reflect
// burdened hourly machine cost (capital + energy + maintenance + indirect
// labor + facilities + overhead absorption), per Plastics News surveys and
// US molder benchmarks. Granular bracket steps (50/80/100/150/200/300/...)
// match how molders actually buy presses so 230T doesn't get lumped with
// 400T machines.
const TONNAGE_BRACKETS = [
  { maxTons: 50,   baseUSA: 45,  name: '≤50T (Micro)' },
  { maxTons: 80,   baseUSA: 52,  name: '50-80T' },
  { maxTons: 100,  baseUSA: 58,  name: '80-100T (Small)' },
  { maxTons: 150,  baseUSA: 68,  name: '100-150T' },
  { maxTons: 200,  baseUSA: 75,  name: '150-200T (Medium)' },
  { maxTons: 300,  baseUSA: 88,  name: '200-300T' },
  { maxTons: 400,  baseUSA: 98,  name: '300-400T (Large)' },
  { maxTons: 500,  baseUSA: 110, name: '400-500T' },
  { maxTons: 700,  baseUSA: 125, name: '500-700T (XL)' },
  { maxTons: 1000, baseUSA: 155, name: '700-1000T (XXL)' },
  { maxTons: 1500, baseUSA: 200, name: '1000-1500T (Giga)' },
  { maxTons: 9999, baseUSA: 260, name: '1500T+ (Mega)' }
];

const DEFAULTS = {
  partNumber: 'PN-0001',
  partName: 'Sample Part',
  region: 'Mexico',
  // Part volume from CAD (cm³). When set and a resin blend is selected, the
  // calc derives partWeightG = partVolumeCm3 × blend_density. An explicit
  // partWeightG always wins. STEP import sets only partVolumeCm3 and never
  // partWeightG, because mass requires a resin assumption.
  partVolumeCm3: null,
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
  cumulativeVolume: 0,
  wallThicknessMm: null,
  annualVolume: null,
  autoEstimate: false,
  // 'exw' = ex-works comparison to supplier quote (excludes duty + freight).
  // 'landed' = total cost to Base Power's dock (includes duty + freight).
  comparisonMode: 'exw',
  // Minutes of secondary operations per part. 0 = no post-mold work (most
  // injection-molded parts). Set explicitly when trim/print/kit/assembly is
  // required. Null falls back to the regional default for legacy compatibility.
  secOpsMin: 0,
  // Operators tending one machine. Null = use regional default. Use this to
  // model "one operator runs N machines" common in offshore molding shops.
  operatorsPerMachineOverride: null,
  // Projected area in cm² (cross-section perpendicular to mold clamp). Used by
  // auto-tonnage to compute clamp force from projected area × pressure factor.
  // For high-aspect parts (lids, plates), this is the *real* tonnage driver.
  projectedAreaCm2: null,
  // Tonnage per cm² of projected area. 3.0 for glass-filled engineering resins,
  // 2.0 for unfilled commodity resins, 4.0 for high-pressure (PC, PSU, LCP).
  projAreaClampCoeff: 3.0
};

const FIELD_KEYS = [
  'key', 'partNumber', 'partName', 'region', 'partVolumeCm3', 'partWeightG', 'runnerPct',
  'runnerWeightOverride', 'regrindRate', 'cavities', 'cycleTimeSec',
  'utilization', 'scrapRate', 'resinCostPerKg', 'tonnage', 'machineRateOverride',
  'laborRateOverride', 'ohRateOverride', 'marginRateOverride', 'toolingCost',
  'toolLife', 'cumulativeVolume', 'wallThicknessMm', 'annualVolume', 'autoEstimate',
  'resinBlend', 'comparisonMode', 'secOpsMin', 'operatorsPerMachineOverride',
  'projectedAreaCm2', 'projAreaClampCoeff'
];

const RESIN_LIBRARY_HEADER = ['key', 'name', 'resinsJson', 'fillerType', 'fillerPct', 'kOverride', 'updatedAt'];

// Helper to get region object
function getRegion(regionName) {
  return REGIONS[regionName] || REGIONS.Mexico;
}

// Helper to find tonnage bracket
function findBracket(tonnage) {
  return TONNAGE_BRACKETS.find(b => tonnage <= b.maxTons) || TONNAGE_BRACKETS[TONNAGE_BRACKETS.length - 1];
}
