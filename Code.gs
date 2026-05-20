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

// One-time setup function: point the tool at a specific pre-existing Sheet
// instead of letting auto-bootstrap create a new one. Run from the Apps
// Script editor (function dropdown → setPartsSheetIdManually → Run) when
// migrating to a known Sheet ID. The Sheet must have a 'Parts Library' tab
// (and ideally a 'Resin Library' tab); getOrCreatePartsSheet will extend
// the header row to add any missing columns.
function setPartsSheetIdManually() {
  // Update this constant when pointing the tool at a different Sheet.
  const sheetId = '15afFg0SQgLz9lOUP-bqKSmPez3Q0Vuj2Y8qb0nharYk';
  PropertiesService.getScriptProperties().setProperty('PARTS_SHEET_ID', sheetId);
  // Verify access + ensure header structure is current (adds new columns
  // like comparisonMode, secOpsMin, projectedAreaCm2 if they're missing).
  const ss = SpreadsheetApp.openById(sheetId);
  const partsSheet = getOrCreatePartsSheet(ss);
  const blendsSheet = getOrCreateResinSheet(ss);
  Logger.log('PARTS_SHEET_ID set to: ' + sheetId);
  Logger.log('Spreadsheet: ' + ss.getUrl());
  Logger.log('Parts Library: ' + Math.max(0, partsSheet.getLastRow() - 1) + ' rows.');
  Logger.log('Resin Library: ' + Math.max(0, blendsSheet.getLastRow() - 1) + ' rows.');
  return ss.getUrl();
}

// Resolve the backing spreadsheet, auto-creating it on first run so end users
// don't need to manually wire PARTS_SHEET_ID in Script Properties or share a
// pre-existing Drive file. Subsequent calls reuse the stored ID.
function getOrCreateBackingSpreadsheet() {
  const scriptProps = PropertiesService.getScriptProperties();
  let sheetId = scriptProps.getProperty('PARTS_SHEET_ID');
  if (sheetId) {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch (e) {
      // Stored ID is stale (file deleted or access revoked) — fall through and create a new one.
      Logger.log('Stored PARTS_SHEET_ID unusable, creating new sheet: ' + e.message);
    }
  }
  const ss = SpreadsheetApp.create('Should Cost — Parts Library');
  scriptProps.setProperty('PARTS_SHEET_ID', ss.getId());
  return ss;
}

// Server-owned metadata columns appended after FIELD_KEYS. Never sent by the
// client — stamped at write time so the library shows who edited what.
const META_KEYS = ['savedBy', 'savedAt'];

// Best-effort email of the user running the request. In "Execute as: Me" mode,
// this resolves to the end user's email only when they share a Workspace
// domain with the script owner; external Google accounts return ''.
function getActiveUserEmail() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

// Get or create the Parts Library sheet with a header row.
// On existing sheets, extend the header row when FIELD_KEYS or META_KEYS has
// grown (e.g. resinBlend, savedBy added later) so save/load stay aligned.
function getOrCreatePartsSheet(ss) {
  const fullHeader = [...FIELD_KEYS, ...META_KEYS];
  let sh = ss.getSheetByName('Parts Library');
  if (!sh) {
    sh = ss.insertSheet('Parts Library');
    sh.appendRow(fullHeader);
    sh.setFrozenRows(1);
    return sh;
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(fullHeader);
    sh.setFrozenRows(1);
    return sh;
  }
  const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const missing = fullHeader.filter(k => header.indexOf(k) === -1);
  if (missing.length > 0) {
    sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
  }
  return sh;
}

// Get or create the Resin Library sheet with a header row.
// Extends an existing sheet's header with savedBy/savedAt so old blends
// migrate transparently.
function getOrCreateResinSheet(ss) {
  const fullHeader = [...RESIN_LIBRARY_HEADER, ...META_KEYS];
  let sh = ss.getSheetByName('Resin Library');
  if (!sh) {
    sh = ss.insertSheet('Resin Library');
    sh.appendRow(fullHeader);
    sh.setFrozenRows(1);
    return sh;
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(fullHeader);
    sh.setFrozenRows(1);
    return sh;
  }
  const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const missing = fullHeader.filter(k => header.indexOf(k) === -1);
  if (missing.length > 0) {
    sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
  }
  return sh;
}

// Build unique key from part data
function buildSlug(inp) {
  const raw = (inp.partNumber ? inp.partNumber + '_' : '') + (inp.partName || 'part');
  return 'part:' + raw.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 80);
}

// Build spreadsheet row from input object. resinBlend is serialized to JSON so it
// fits in a single cell — every other field stays a primitive. The row is built
// to match the sheet's actual header order so meta columns (savedBy/savedAt)
// land in their real positions even after schema migrations.
function buildRow(header, slug, inp, meta) {
  return header.map(key => {
    if (key === 'key') return slug;
    if (key === 'resinBlend') return inp.resinBlend ? JSON.stringify(inp.resinBlend) : '';
    if (key === 'savedBy') return meta.savedBy;
    if (key === 'savedAt') return meta.savedAt;
    return inp[key] !== undefined && inp[key] !== null ? inp[key] : '';
  });
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
    } else if (['partVolumeCm3', 'partWeightG', 'runnerPct', 'runnerWeightOverride', 'regrindRate', 'cavities', 'cycleTimeSec', 'utilization', 'scrapRate', 'resinCostPerKg', 'tonnage', 'machineRateOverride', 'laborRateOverride', 'ohRateOverride', 'marginRateOverride', 'toolingCost', 'toolLife', 'cumulativeVolume', 'wallThicknessMm', 'annualVolume', 'secOpsMin', 'operatorsPerMachineOverride', 'projectedAreaCm2', 'projAreaClampCoeff'].includes(key)) {
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
    const ss = getOrCreateBackingSpreadsheet();
    const sh = getOrCreatePartsSheet(ss);
    const data = sh.getDataRange().getValues();
    const header = data[0];

    const slug = buildSlug(inp);
    const meta = { savedBy: getActiveUserEmail(), savedAt: new Date().toISOString() };
    const row = buildRow(header, slug, inp, meta);

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
    const ss = getOrCreateBackingSpreadsheet();
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
    const ss = getOrCreateBackingSpreadsheet();
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
    const ss = getOrCreateBackingSpreadsheet();
    const sh = getOrCreateResinSheet(ss);
    const data = sh.getDataRange().getValues();
    const header = data[0];

    const slug = buildBlendSlug(inp.name);
    const filler = inp.filler || { type: 'none', pct: 0 };
    const nowIso = new Date().toISOString();
    const email = getActiveUserEmail();
    const cells = {
      key: slug,
      name: inp.name || '',
      resinsJson: JSON.stringify(inp.resins || []),
      fillerType: filler.type || 'none',
      fillerPct: filler.pct || 0,
      kOverride: inp.kOverride !== null && inp.kOverride !== undefined ? inp.kOverride : '',
      updatedAt: nowIso,
      savedBy: email,
      savedAt: nowIso
    };
    const row = header.map(col => cells[col] !== undefined ? cells[col] : '');

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
    const ss = getOrCreateBackingSpreadsheet();
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
        const savedByCol = idx('savedBy');
        const savedAtCol = idx('savedAt');
        return {
          key: r[idx('key')],
          name: r[idx('name')],
          resins: resins,
          filler: { type: r[idx('fillerType')] || 'none', pct: parseFloat(r[idx('fillerPct')]) || 0 },
          kOverride: (kRaw === '' || kRaw === null || kRaw === undefined) ? null : parseFloat(kRaw),
          savedBy: savedByCol >= 0 ? (r[savedByCol] || '') : '',
          savedAt: savedAtCol >= 0 ? (r[savedAtCol] || '') : ''
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
    const ss = getOrCreateBackingSpreadsheet();
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
    const today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');

    // Build filename
    const first = parts[0];
    const name = 'should_cost_' + (first.partNumber ? first.partNumber + '_' : '') +
                 first.partName.replace(/\s+/g, '_') + '_' + today;

    // Create sheet. Move to EXPORT_FOLDER_ID when set; otherwise leave it in
    // the owner's My Drive root so exports work without any setup.
    const ss = SpreadsheetApp.create(name);
    if (folderId) {
      try {
        const folder = DriveApp.getFolderById(folderId);
        const file = DriveApp.getFileById(ss.getId());
        folder.addFile(file);
        DriveApp.getRootFolder().removeFile(file);
      } catch (e) {
        Logger.log('EXPORT_FOLDER_ID unusable, leaving export in My Drive: ' + e.message);
      }
    }

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
