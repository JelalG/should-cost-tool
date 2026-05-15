// Cost model calculation engine - pure functions, no Spreadsheet/DOM calls

function calcSC(inp) {
  const r = getRegion(inp.region);
  const bracket = findBracket(inp.tonnage);
  const results = {};

  // Step 1: Resolve machine rate
  const machineRate = inp.machineRateOverride !== null && inp.machineRateOverride !== undefined
    ? inp.machineRateOverride
    : (bracket.baseUSA * r.multiplier);
  results._machineRate = machineRate;

  // Step 2: Material cost
  const runnerWeightG = inp.runnerWeightOverride !== null && inp.runnerWeightOverride !== undefined
    ? inp.runnerWeightOverride
    : (inp.partWeightG * inp.runnerPct / 100);
  const grossG = inp.partWeightG + (runnerWeightG * (1 - inp.regrindRate));
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
  const laborRate = inp.laborRateOverride !== null && inp.laborRateOverride !== undefined
    ? inp.laborRateOverride
    : r.laborRate;
  const directLP = laborRate / partsPerHr;
  const secLP = laborRate * (r.secOpsMin / 60);
  const laborScrap = (directLP + secLP) * inp.scrapRate;
  const laborTotal = directLP + secLP + laborScrap;

  // Step 5: Overhead, SG&A, duty, packaging
  const secMachPP = r.secMachineRate * (r.secOpsMin / 60);
  const ohRate = inp.ohRateOverride !== null && inp.ohRateOverride !== undefined
    ? (inp.ohRateOverride / 100)
    : r.ohRate;
  const ohTotal = (directLP + secLP) * ohRate;
  const pkgFreight = r.pkg + r.freight;
  const mfgSubBase = matTotal + machTotal + laborTotal + secMachPP + ohTotal + pkgFreight;
  const duty = mfgSubBase * r.duty;
  const sga = mfgSubBase * r.sgaRate;
  results.processingCostPerPart = machPP + directLP + secLP + secMachPP;
  results.scrapCostPerPart = matScrap + machScrap + laborScrap;
  results.overheadCostPerPart = ohTotal;

  // Step 6: Margin and base total
  const marginRate = inp.marginRateOverride !== null && inp.marginRateOverride !== undefined
    ? (inp.marginRateOverride / 100)
    : r.marginRate;
  const totalBeforeMargin = mfgSubBase + duty + sga;
  const profit = totalBeforeMargin * marginRate;
  const baseTotal = totalBeforeMargin + profit;
  results.profit = profit;
  results._baseTotal = baseTotal;

  // Step 7: Tooling amortization
  const toolLifeParts = inp.toolLife * inp.cavities;
  const toolPaidOff = inp.cumulativeVolume >= toolLifeParts;
  const toolAmortRaw = toolPaidOff ? 0 : inp.toolingCost / toolLifeParts;
  const toolScrap = toolAmortRaw * inp.scrapRate;
  const toolAmortPP = toolAmortRaw + toolScrap;
  results._toolAmortPP = toolAmortPP;

  // Final result
  results._totalWithTooling = baseTotal + toolAmortPP;
  results._toolPaidOff = toolPaidOff;
  results._toolLifeParts = toolLifeParts;
  results._toolPctUsed = Math.min((inp.cumulativeVolume / toolLifeParts) * 100, 100);

  return results;
}

// Editor test runner — select this in the Apps Script Run menu to exercise calcSC with DEFAULTS.
function testCalcSC() {
  const out = calcSC(DEFAULTS);
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
