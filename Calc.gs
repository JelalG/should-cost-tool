// Resin densities (g/cm³) — server-side mirror of BASE_RESINS in scripts.html.
// Used by resolvePartWeightG_ to derive mass when partWeightG is blank but
// partVolumeCm3 + a resin blend are present.
var BASE_RESINS_DENSITY = {
  ABS: 1.04, PP: 0.91, PE_HD: 0.95, PS: 1.05, PC: 1.20,
  PA6: 1.13, PA66: 1.14, POM: 1.41, PET: 1.38, PMMA: 1.18,
  PBT: 1.31, TPU: 1.20, TPE: 0.95
};
var FILLER_DENSITY = {
  none: 0, glass: 2.55, talc: 2.75, mineral: 2.70, caco3: 2.71
};

function computeDensityBlend_(comp) {
  if (!comp) return null;
  var resins = (comp.resins || []).filter(function(r) {
    return r && r.resinId && BASE_RESINS_DENSITY[r.resinId] && r.weightPct > 0;
  });
  if (resins.length === 0) return null;
  var total = resins.reduce(function(s, r) { return s + r.weightPct; }, 0);
  if (total <= 0) return null;
  var dResin = resins.reduce(function(s, r) {
    return s + BASE_RESINS_DENSITY[r.resinId] * r.weightPct;
  }, 0) / total;
  var f = comp.filler;
  if (!f || f.type === 'none' || !(f.pct > 0)) return dResin;
  var dFiller = FILLER_DENSITY[f.type] || 0;
  if (dFiller <= 0) return dResin;
  var wF = f.pct / 100;
  var wR = 1 - wF;
  return 1 / (wR / dResin + wF / dFiller);
}

function resolvePartWeightG_(inp) {
  var explicit = inp.partWeightG;
  if (explicit !== null && explicit !== undefined && explicit !== '' && !isNaN(+explicit) && +explicit > 0) {
    return +explicit;
  }
  if (inp.partVolumeCm3 > 0) {
    var d = computeDensityBlend_(inp.resinBlend);
    if (d > 0) return inp.partVolumeCm3 * d;
  }
  return null;
}

// Cost model calculation engine - pure functions, no Spreadsheet/DOM calls.
//
// Stacking (post-2026-05 model):
//   manufacturingCost = material + machine + labor + secMachine + overhead + pkg
//   supplierPrice     = manufacturingCost × (1 + sgaRate) × (1 + marginRate)
//   landedCost        = supplierPrice + freight + (supplierPrice × dutyRate)
//
// comparisonMode='exw' returns supplierPrice (compare apples-to-apples with a
// supplier quote). 'landed' returns landedCost (Base Power's total to the dock).
// Margin and SG&A no longer compound on duty or freight — supplier doesn't
// markup tariffs or your inbound shipping.

function calcSC(inp) {
  const r = getRegion(inp.region);
  const bracket = findBracket(inp.tonnage);
  const results = {};

  // Step 1: Resolve machine rate
  const machineRate = inp.machineRateOverride !== null && inp.machineRateOverride !== undefined
    ? inp.machineRateOverride
    : (bracket.baseUSA * r.multiplier);
  results._machineRate = machineRate;

  // Resolve part weight: explicit input wins, else derive from CAD volume × blend density.
  const effectivePartWeightG = resolvePartWeightG_(inp);
  results._effectivePartWeightG = effectivePartWeightG;

  // Step 2: Material cost
  const runnerWeightG = inp.runnerWeightOverride !== null && inp.runnerWeightOverride !== undefined
    ? inp.runnerWeightOverride
    : (effectivePartWeightG * inp.runnerPct / 100);
  const grossG = effectivePartWeightG + (runnerWeightG * (1 - inp.regrindRate));
  const grossKg = grossG / 1000;
  const resinPP = grossKg * inp.resinCostPerKg;
  const matScrap = resinPP * inp.scrapRate;
  const matTotal = resinPP + matScrap;
  results.resinCostPerPart = resinPP;

  // Step 3: Machine cost
  const partsPerHr = (3600 / inp.cycleTimeSec) * inp.utilization * inp.cavities;
  const machPP = machineRate / partsPerHr;
  const machScrap = machPP * inp.scrapRate;
  const machTotal = machPP + machScrap;

  // Step 4: Labor cost
  // - operatorsPerMachine models shop reality: one operator typically tends N
  //   molding presses in offshore shops. directLP is divided by N because the
  //   labor cost is shared across N concurrent machines.
  // - secOpsMin is part-specific (trim, kit, pad-print, etc.); defaults to 0
  //   so simple molded parts aren't charged phantom secondary ops.
  const laborRate = inp.laborRateOverride !== null && inp.laborRateOverride !== undefined
    ? inp.laborRateOverride
    : r.laborRate;
  const operatorsPerMachine = inp.operatorsPerMachineOverride !== null && inp.operatorsPerMachineOverride !== undefined
    ? Math.max(0.0001, +inp.operatorsPerMachineOverride)
    : (r.operatorsPerMachine || 1);
  const secOpsMin = inp.secOpsMin !== null && inp.secOpsMin !== undefined
    ? +inp.secOpsMin
    : r.secOpsMin;
  const directLP = (laborRate / partsPerHr) / operatorsPerMachine;
  const secLP = laborRate * (secOpsMin / 60);
  const laborScrap = (directLP + secLP) * inp.scrapRate;
  const laborTotal = directLP + secLP + laborScrap;

  // Step 5: Secondary machine + overhead + packaging
  const secMachPP = r.secMachineRate * (secOpsMin / 60);
  const ohRate = inp.ohRateOverride !== null && inp.ohRateOverride !== undefined
    ? (inp.ohRateOverride / 100)
    : r.ohRate;
  const ohTotal = (directLP + secLP) * ohRate;
  const pkg = r.pkg;
  const freight = r.freight;

  // Step 6: Manufacturing cost (everything the supplier eats before margin)
  const manufacturingCost = matTotal + machTotal + laborTotal + secMachPP + ohTotal + pkg;

  // Step 7: SG&A and margin — both apply to manufacturingCost only, NOT to
  // duty or freight. The supplier doesn't markup Section 301 tariffs or your
  // ocean shipping.
  const sgaRate = r.sgaRate;
  const marginRate = inp.marginRateOverride !== null && inp.marginRateOverride !== undefined
    ? (inp.marginRateOverride / 100)
    : r.marginRate;
  const costWithSga = manufacturingCost * (1 + sgaRate);
  const supplierPrice = costWithSga * (1 + marginRate);
  const sga = costWithSga - manufacturingCost;
  const profit = supplierPrice - costWithSga;

  // Step 8: Landed cost — buyer-side adds. Duty on the supplier's invoiced
  // price (CBP's "transaction value"), freight as a flat add.
  const duty = supplierPrice * r.duty;
  const landedCost = supplierPrice + freight + duty;

  // Step 9: Pick the result by comparison mode
  const mode = inp.comparisonMode === 'landed' ? 'landed' : 'exw';
  const baseTotal = mode === 'landed' ? landedCost : supplierPrice;

  results.processingCostPerPart = machPP + directLP + secLP + secMachPP;
  results.scrapCostPerPart = matScrap + machScrap + laborScrap;
  results.overheadCostPerPart = ohTotal;
  results.profit = profit;
  results._sga = sga;
  results._duty = duty;
  results._freight = freight;
  results._pkg = pkg;
  results._manufacturingCost = manufacturingCost;
  results._supplierPrice = supplierPrice;
  results._landedCost = landedCost;
  results._comparisonMode = mode;
  results._operatorsPerMachine = operatorsPerMachine;
  results._secOpsMin = secOpsMin;
  results._baseTotal = baseTotal;

  // Step 10: Tooling amortization (unchanged)
  const toolLifeParts = inp.toolLife * inp.cavities;
  const toolPaidOff = inp.cumulativeVolume >= toolLifeParts;
  const toolAmortRaw = toolPaidOff || !toolLifeParts ? 0 : inp.toolingCost / toolLifeParts;
  const toolScrap = toolAmortRaw * inp.scrapRate;
  const toolAmortPP = toolAmortRaw + toolScrap;
  results._toolAmortPP = toolAmortPP;

  results._totalWithTooling = baseTotal + toolAmortPP;
  results._toolPaidOff = toolPaidOff;
  results._toolLifeParts = toolLifeParts;
  results._toolPctUsed = toolLifeParts > 0 ? Math.min((inp.cumulativeVolume / toolLifeParts) * 100, 100) : 0;

  return results;
}

// Editor test runner — select this in the Apps Script Run menu to exercise calcSC with DEFAULTS.
function testCalcSC() {
  const out = calcSC(DEFAULTS);
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
