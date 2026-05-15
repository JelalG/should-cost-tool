// Server-side functions for Google Apps Script

function doGet() {
  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle('Should Cost: Injection Mold')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Inline another HTML file into a template via <?!= include('name'); ?>
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Get or create the Parts Library sheet with a header row.
// On existing sheets, extend the header row when FIELD_KEYS has grown
// (e.g. resinBlend was added later) so save/load stay aligned.
function getOrCreatePartsSheet(ss) {
  let sh = ss.getSheetByName('Parts Library');
  if (!sh) {
    sh = ss.insertSheet('Parts Library');
    sh.appendRow(FIELD_KEYS);
    sh.setFrozenRows(1);
    return sh;
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(FIELD_KEYS);
    sh.setFrozenRows(1);
    return sh;
  }
  const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const missing = FIELD_KEYS.filter(k => header.indexOf(k) === -1);
  if (missing.length > 0) {
    sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
  }
  return sh;
}

// Get or create the Resin Library sheet with a header row.
function getOrCreateResinSheet(ss) {
  let sh = ss.getSheetByName('Resin Library');
  if (!sh) {
    sh = ss.insertSheet('Resin Library');
    sh.appendRow(RESIN_LIBRARY_HEADER);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(RESIN_LIBRARY_HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Build unique key from part data
function buildSlug(inp) {
  const raw = (inp.partNumber ? inp.partNumber + '_' : '') + (inp.partName || 'part');
  return 'part:' + raw.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 80);
}

// Build spreadsheet row from input object. resinBlend is serialized to JSON so it
// fits in a single cell — every other field stays a primitive.
function buildRow(slug, inp) {
  const row = [];
  FIELD_KEYS.forEach(key => {
    if (key === 'key') {
      row.push(slug);
    } else if (key === 'resinBlend') {
      row.push(inp.resinBlend ? JSON.stringify(inp.resinBlend) : '');
    } else {
      row.push(inp[key] !== undefined ? inp[key] : '');
    }
  });
  return row;
}

// Convert spreadsheet row back to input object
function rowToInp(header, row) {
  const inp = {};
  header.forEach((key, idx) => {
    let val = row[idx];
    if (key === 'key') {
      inp.key = val;
    } else if (key === 'autoEstimate') {
      inp.autoEstimate = (val === true || val === 'true' || val === 'TRUE' || val === 1 || val === '1');
    } else if (key === 'resinBlend') {
      // Older rows predate the blend field and store '' — treat as null.
      if (val === '' || val === null || val === undefined) {
        inp.resinBlend = null;
      } else {
        try { inp.resinBlend = JSON.parse(val); }
        catch (e) { inp.resinBlend = null; }
      }
    } else if (['partWeightG', 'runnerPct', 'runnerWeightOverride', 'regrindRate', 'cavities', 'cycleTimeSec', 'utilization', 'scrapRate', 'resinCostPerKg', 'tonnage', 'machineRateOverride', 'laborRateOverride', 'ohRateOverride', 'marginRateOverride', 'toolingCost', 'toolLife', 'cumulativeVolume', 'wallThicknessMm', 'annualVolume'].includes(key)) {
      inp[key] = val === '' ? null : parseFloat(val);
    } else {
      inp[key] = val;
    }
  });
  return inp;
}

// Save part to Parts Library sheet
function savePart(partJson) {
  try {
    const inp = JSON.parse(partJson);
    const scriptProps = PropertiesService.getScriptProperties();
    const sheetId = scriptProps.getProperty('PARTS_SHEET_ID');

    if (!sheetId) {
      throw new Error('PARTS_SHEET_ID not set in Script Properties');
    }

    const ss = SpreadsheetApp.openById(sheetId);
    const sh = getOrCreatePartsSheet(ss);
    const data = sh.getDataRange().getValues();

    const slug = buildSlug(inp);
    const row = buildRow(slug, inp);

    // Find existing row by key (col 0)
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === slug) {
        rowIdx = i;
        break;
      }
    }

    if (rowIdx >= 0) {
      sh.getRange(rowIdx + 1, 1, 1, row.length).setValues([row]);
    } else {
      sh.appendRow(row);
    }

    return slug;
  } catch (e) {
    Logger.log('savePart error: ' + e.message);
    throw e;
  }
}

// Load all parts from library
function loadAllParts() {
  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const sheetId = scriptProps.getProperty('PARTS_SHEET_ID');

    if (!sheetId) {
      return JSON.stringify([]);
    }

    const ss = SpreadsheetApp.openById(sheetId);
    const sh = getOrCreatePartsSheet(ss);
    const data = sh.getDataRange().getValues();

    const [header, ...rows] = data;
    const parts = rows
      .filter(r => r[0]) // skip blank rows
      .map(r => rowToInp(header, r))
      .sort((a, b) => {
        const aNum = a.partNumber || '';
        const bNum = b.partNumber || '';
        if (aNum !== bNum) return aNum.localeCompare(bNum);
        return (a.partName || '').localeCompare(b.partName || '');
      });

    return JSON.stringify(parts);
  } catch (e) {
    Logger.log('loadAllParts error: ' + e.message);
    return JSON.stringify([]);
  }
}

// Delete part from library
function deletePart(key) {
  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const sheetId = scriptProps.getProperty('PARTS_SHEET_ID');

    if (!sheetId) {
      throw new Error('PARTS_SHEET_ID not set');
    }

    const ss = SpreadsheetApp.openById(sheetId);
    const sh = getOrCreatePartsSheet(ss);
    const data = sh.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sh.deleteRow(i + 1);
        return true;
      }
    }
    return false;
  } catch (e) {
    Logger.log('deletePart error: ' + e.message);
    throw e;
  }
}

// ===== Resin Library (named blends) =====

function buildBlendSlug(name) {
  return 'blend:' + (name || 'blend').replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 80);
}

// Save a named blend. Same key (derived from name) overwrites in place.
function saveBlend(blendJson) {
  try {
    const inp = JSON.parse(blendJson);
    const scriptProps = PropertiesService.getScriptProperties();
    const sheetId = scriptProps.getProperty('PARTS_SHEET_ID');
    if (!sheetId) throw new Error('PARTS_SHEET_ID not set in Script Properties');

    const ss = SpreadsheetApp.openById(sheetId);
    const sh = getOrCreateResinSheet(ss);
    const data = sh.getDataRange().getValues();

    const slug = buildBlendSlug(inp.name);
    const filler = inp.filler || { type: 'none', pct: 0 };
    const row = [
      slug,
      inp.name || '',
      JSON.stringify(inp.resins || []),
      filler.type || 'none',
      filler.pct || 0,
      inp.kOverride !== null && inp.kOverride !== undefined ? inp.kOverride : '',
      new Date().toISOString()
    ];

    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === slug) { rowIdx = i; break; }
    }
    if (rowIdx >= 0) {
      sh.getRange(rowIdx + 1, 1, 1, row.length).setValues([row]);
    } else {
      sh.appendRow(row);
    }
    return slug;
  } catch (e) {
    Logger.log('saveBlend error: ' + e.message);
    throw e;
  }
}

// Load all named blends. Each record is hydrated to the same shape state.resinBlend uses.
function loadAllBlends() {
  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const sheetId = scriptProps.getProperty('PARTS_SHEET_ID');
    if (!sheetId) return JSON.stringify([]);

    const ss = SpreadsheetApp.openById(sheetId);
    const sh = getOrCreateResinSheet(ss);
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return JSON.stringify([]);

    const [header, ...rows] = data;
    const idx = name => header.indexOf(name);
    const blends = rows
      .filter(r => r[0])
      .map(r => {
        let resins = [];
        try { resins = JSON.parse(r[idx('resinsJson')] || '[]'); } catch (e) {}
        const kRaw = r[idx('kOverride')];
        return {
          key: r[idx('key')],
          name: r[idx('name')],
          resins: resins,
          filler: { type: r[idx('fillerType')] || 'none', pct: parseFloat(r[idx('fillerPct')]) || 0 },
          kOverride: (kRaw === '' || kRaw === null || kRaw === undefined) ? null : parseFloat(kRaw)
        };
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return JSON.stringify(blends);
  } catch (e) {
    Logger.log('loadAllBlends error: ' + e.message);
    return JSON.stringify([]);
  }
}

function deleteBlend(key) {
  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const sheetId = scriptProps.getProperty('PARTS_SHEET_ID');
    if (!sheetId) throw new Error('PARTS_SHEET_ID not set');
    const ss = SpreadsheetApp.openById(sheetId);
    const sh = getOrCreateResinSheet(ss);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) { sh.deleteRow(i + 1); return true; }
    }
    return false;
  } catch (e) {
    Logger.log('deleteBlend error: ' + e.message);
    throw e;
  }
}

// Export parts to a Google Sheet in Drive folder
function exportPartsToSheet(partsJson) {
  try {
    const parts = JSON.parse(partsJson);
    const scriptProps = PropertiesService.getScriptProperties();
    const folderId = scriptProps.getProperty('EXPORT_FOLDER_ID');

    if (!folderId) {
      throw new Error('EXPORT_FOLDER_ID not set');
    }

    const folder = DriveApp.getFolderById(folderId);
    const today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');

    // Build filename
    const first = parts[0];
    const name = 'should_cost_' + (first.partNumber ? first.partNumber + '_' : '') +
                 first.partName.replace(/\s+/g, '_') + '_' + today;

    // Create sheet
    const ss = SpreadsheetApp.create(name);
    const file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);

    const sh = ss.getActiveSheet();
    sh.setName('Should Cost Output');

    // Header row
    const headers = ['Field', ...parts.map(p => (p.partNumber ? p.partNumber + ' - ' : '') + p.partName)];
    sh.appendRow(headers);

    // Output rows
    const OUTPUT_FIELDS = [
      ['Total should cost (incl. tooling)', p => calcSC(p)._totalWithTooling.toFixed(4)],
      ['Base should cost (ex-tooling)', p => calcSC(p)._baseTotal.toFixed(4)],
      ['Tooling amortization / pc', p => calcSC(p)._toolAmortPP.toFixed(4)],
      ['Resin cost / part', p => calcSC(p).resinCostPerPart.toFixed(4)],
      ['Processing cost / part', p => calcSC(p).processingCostPerPart.toFixed(4)],
      ['Overhead cost / part', p => calcSC(p).overheadCostPerPart.toFixed(4)],
      ['Profit (CM margin) / part', p => calcSC(p).profit.toFixed(4)],
      ['Region', p => p.region],
      ['Cavities', p => p.cavities],
      ['Cycle time (s)', p => p.cycleTimeSec],
      ['Part weight (g)', p => p.partWeightG],
      ['Resin cost ($/kg)', p => p.resinCostPerKg],
      ['Tonnage', p => p.tonnage],
      ['Machine rate ($/hr)', p => calcSC(p)._machineRate.toFixed(2)],
      ['Tooling cost ($)', p => p.toolingCost],
      ['Tool life (shots)', p => p.toolLife]
    ];

    OUTPUT_FIELDS.forEach(([label, fn]) => {
      sh.appendRow([label, ...parts.map(fn)]);
    });

    return ss.getUrl();
  } catch (e) {
    Logger.log('exportPartsToSheet error: ' + e.message);
    throw e;
  }
}
