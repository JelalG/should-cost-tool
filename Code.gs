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

// ============================================================================
// Vendor RFQ export — generates a blank-fill template the buyer team sends to
// a quoting vendor. Each selected part becomes a column; each row is a
// question (resin grade, cycle, tonnage, cost breakdown, pricing tiers,
// commercial terms). Yellow cells are for the vendor to fill; white cells
// are our spec / requirement.
// ============================================================================

// Friendly resin name for the RFQ pre-fill. Uses the saved blend name when
// available, else composes from the resin + filler composition.
function resinDisplayName_(blend) {
  if (!blend) return '';
  if (blend.name) return blend.name;
  const resins = (blend.resins || []).filter(function(r) { return r && r.resinId && r.weightPct > 0; });
  if (resins.length === 0) return '';
  const base = resins.map(function(r) { return r.resinId + ' ' + r.weightPct + '%'; }).join(', ');
  const f = blend.filler;
  if (f && f.type && f.type !== 'none' && f.pct > 0) {
    return base + ' + ' + f.type + ' ' + f.pct + '%';
  }
  return base;
}

// RFQ structure. Each section has plain-English questions designed for a
// vendor who hasn't seen our internal jargon. Pre-filled rows show our spec;
// vendor-fill rows are highlighted yellow.
//   label  — the prompt shown to the vendor
//   help   — clarifying description in column B
//   value  — function(part) returning the pre-fill value (omit for vendor-fill)
//   fill   — true → yellow background (vendor fills this cell)
//   format — Sheets number-format string for the value cells
const RFQ_SECTIONS_ = [
  {
    name: 'Part identification (pre-filled by Base Power)',
    questions: [
      { label: 'Part number',            help: 'Internal Base Power part number.',
        value: function(p) { return p.partNumber || ''; } },
      { label: 'Part name',              help: 'Descriptive name.',
        value: function(p) { return p.partName || ''; } },
      { label: 'Material specification', help: 'The resin grade we want the part molded from. You can propose an equivalent in the Material section below.',
        value: function(p) { return resinDisplayName_(p.resinBlend); } },
      { label: 'Region of manufacture',  help: 'Where we expect the part to be produced.',
        value: function(p) { return p.region || ''; } },
      { label: 'Annual volume target',   help: 'Forecasted yearly demand.',
        value: function(p) { return p.annualVolume || ''; }, format: '#,##0' },
      { label: 'Part weight (g)',        help: 'Net weight of one finished part (from CAD).',
        value: function(p) { return p.partWeightG || ''; }, format: '0.00' }
    ]
  },
  {
    name: 'Material — please confirm our spec or propose an equivalent',
    questions: [
      { label: 'Resin grade you would use',           help: 'Brand and grade (e.g. RTP 1005, LANXESS Pocan B1305). Match our spec above or propose a substitution.', fill: true },
      { label: 'Resin cost (USD per kg)',             help: 'Local market price for this resin grade, including inbound freight to your factory.', fill: true, format: '$#,##0.00' },
      { label: 'Resin lead time (weeks)',             help: 'Typical procurement lead time.', fill: true, format: '0' },
      { label: 'Colorant / masterbatch ($/kg, if any)', help: 'Per-kg cost of any color compounding required. Leave blank if natural color.', fill: true, format: '$#,##0.00' }
    ]
  },
  {
    name: 'Tooling — your proposal',
    questions: [
      { label: 'Number of cavities',         help: 'Parts produced per shot in your proposed tool.', fill: true, format: '0' },
      { label: 'Tool steel',                 help: 'e.g. P20, NAK80, S136, H13 — drives tool life and cost.', fill: true },
      { label: 'Expected tool life (shots)', help: 'Total shots before the tool needs major refurb or retirement.', fill: true, format: '#,##0' },
      { label: 'Tooling cost / NRE (USD)',   help: 'One-time cost for the mold. Indicate if shared across multiple parts (family tool).', fill: true, format: '$#,##0' },
      { label: 'Tool lead time (weeks)',     help: 'From PO acceptance to first article approval.', fill: true, format: '0' }
    ]
  },
  {
    name: 'Process — your proposal',
    questions: [
      { label: 'Press tonnage (T)',                  help: 'Clamp force of the press you would run this part on.', fill: true, format: '#,##0' },
      { label: 'Cycle time (sec per shot)',          help: 'Total seconds: mold close + fill + pack + cool + open + eject.', fill: true, format: '0.0' },
      { label: 'Machine utilization (%)',            help: 'Effective uptime (typical 80-90%).', fill: true, format: '0.0%' },
      { label: 'Runner type',                        help: 'Hot runner / cold runner / runnerless.', fill: true },
      { label: 'Runner % (cold-runner only)',        help: 'Runner weight as a percentage of part weight.', fill: true, format: '0.0%' },
      { label: 'Regrind rate (%)',                   help: 'Percentage of runner reground and reused.', fill: true, format: '0.0%' },
      { label: 'Scrap rate (%)',                     help: 'Typical reject rate at steady state.', fill: true, format: '0.0%' },
      { label: 'Secondary operations (min/part)',    help: 'Post-mold work: trim, kit, pad print, assembly. Zero if clean-shot only.', fill: true, format: '0.0' }
    ]
  },
  {
    name: 'Cost build-up — please disclose components',
    questions: [
      { label: 'Material cost ($/part)',     help: '(resin + runner − regrind) × cost-per-kg, per part.', fill: true, format: '$#,##0.0000' },
      { label: 'Machine hourly rate ($/hr)', help: 'Fully-burdened press rate (capital + utilities + maintenance + facilities).', fill: true, format: '$#,##0.00' },
      { label: 'Operators per machine',      help: 'How many machines does one operator tend?', fill: true, format: '0.0' },
      { label: 'Direct labor rate ($/hr)',   help: 'Operator wage including burden (benefits, payroll tax).', fill: true, format: '$#,##0.00' },
      { label: 'Overhead rate (%)',          help: 'Indirect costs as a percentage of direct labor.', fill: true, format: '0.0%' },
      { label: 'SG&A rate (%)',              help: 'Sales / general / administrative as a percentage of manufacturing cost.', fill: true, format: '0.0%' },
      { label: 'Margin (%)',                 help: 'Profit margin applied on top of cost.', fill: true, format: '0.0%' },
      { label: 'Packaging cost ($/part)',    help: 'Per-part packaging, labeling, and palletizing.', fill: true, format: '$#,##0.00' }
    ]
  },
  {
    name: 'Pricing tiers — your piece-price quote',
    questions: [
      { label: 'MOQ tier 1 — quantity',    help: 'Smallest order quantity you would accept.', fill: true, format: '#,##0' },
      { label: 'MOQ tier 1 — piece price', help: 'Per-piece USD price at tier 1 quantity.',   fill: true, format: '$#,##0.0000' },
      { label: 'MOQ tier 2 — quantity',                                                       fill: true, format: '#,##0' },
      { label: 'MOQ tier 2 — piece price',                                                    fill: true, format: '$#,##0.0000' },
      { label: 'MOQ tier 3 — quantity',                                                       fill: true, format: '#,##0' },
      { label: 'MOQ tier 3 — piece price',                                                    fill: true, format: '$#,##0.0000' }
    ]
  },
  {
    name: 'Commercial terms',
    questions: [
      { label: 'Quote validity (days)',     help: 'How long this quote remains valid.', fill: true, format: '0' },
      { label: 'Payment terms',             help: 'e.g. Net 30, 50% deposit + balance on shipment, T/T 30 days.', fill: true },
      { label: 'Freight terms (Incoterm)',  help: 'EXW (factory), FOB (origin port), CIF (dest. port), DDP (delivered duty paid).', fill: true },
      { label: 'Notes / assumptions',       help: 'Anything we should know — exceptions, alternative proposals, clarifications.', fill: true }
    ]
  }
];

function exportRFQTemplate(partsJson) {
  try {
    const parts = JSON.parse(partsJson);
    if (!parts || parts.length === 0) throw new Error('Select at least one part to include in the RFQ.');

    const scriptProps = PropertiesService.getScriptProperties();
    const folderId = scriptProps.getProperty('EXPORT_FOLDER_ID');
    const today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
    const filename = 'RFQ_Vendor_Template_' + parts.length + '_part' + (parts.length === 1 ? '' : 's') + '_' + today;

    const ss = SpreadsheetApp.create(filename);
    if (folderId) {
      try {
        const folder = DriveApp.getFolderById(folderId);
        const file = DriveApp.getFileById(ss.getId());
        folder.addFile(file);
        DriveApp.getRootFolder().removeFile(file);
      } catch (e) {
        Logger.log('EXPORT_FOLDER_ID unusable, leaving in My Drive: ' + e.message);
      }
    }

    const sheet = ss.getActiveSheet();
    sheet.setName('Vendor RFQ');
    sheet.clear();
    sheet.setHiddenGridlines(true);

    // Brand colors
    const C_HEADER_BG   = '#1E4D2B';  // Base Power green
    const C_HEADER_FG   = '#FFFFFF';
    const C_SUBTITLE_FG = '#D6F0B4';
    const C_SECTION_BG  = '#D6F0B4';
    const C_SECTION_FG  = '#1E4D2B';
    const C_FILL_BG     = '#FFF6D9';  // soft yellow — vendor fills here
    const C_HELP_FG     = '#666666';
    const C_BORDER      = '#DDDDDD';

    const lastCol = 2 + parts.length;
    let row = 1;

    // Title
    sheet.getRange(row, 1, 1, lastCol).merge()
      .setValue('Should Cost RFQ — Vendor Response')
      .setBackground(C_HEADER_BG).setFontColor(C_HEADER_FG)
      .setFontSize(18).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(row++, 44);

    // Subtitle
    sheet.getRange(row, 1, 1, lastCol).merge()
      .setValue('Generated ' + Utilities.formatDate(new Date(), 'America/Chicago', 'MMMM d, yyyy') + ' · ' + parts.length + ' part' + (parts.length === 1 ? '' : 's') + ' included')
      .setBackground(C_HEADER_BG).setFontColor(C_SUBTITLE_FG)
      .setFontSize(11).setHorizontalAlignment('center');
    sheet.setRowHeight(row++, 22);

    // Vendor information section (vendor fills five fields up top)
    sheet.getRange(row, 1, 1, lastCol).merge()
      .setValue('VENDOR INFORMATION')
      .setBackground(C_SECTION_BG).setFontColor(C_SECTION_FG)
      .setFontWeight('bold').setFontSize(11)
      .setHorizontalAlignment('left').setVerticalAlignment('middle');
    sheet.setRowHeight(row++, 26);

    ['Vendor company name', 'Contact name', 'Contact email', 'Quote reference / RFQ #', 'Quote date'].forEach(function(label) {
      sheet.getRange(row, 1).setValue(label).setFontWeight('bold').setVerticalAlignment('middle');
      sheet.getRange(row, 2, 1, lastCol - 1).merge()
        .setBackground(C_FILL_BG)
        .setBorder(true, true, true, true, false, false, C_BORDER, SpreadsheetApp.BorderStyle.SOLID);
      sheet.setRowHeight(row++, 22);
    });

    // Spacer
    sheet.setRowHeight(row++, 12);

    // Instructions
    sheet.getRange(row, 1, 1, lastCol).merge()
      .setValue('Highlighted cells are for you to fill. Pre-filled cells (white) show our part spec and requirements. If you propose any deviations — different resin grade, different tooling approach, family vs. dedicated tools — please note them in the Notes / assumptions row at the bottom of each part column.')
      .setFontStyle('italic').setFontColor(C_HELP_FG)
      .setFontSize(11).setWrap(true)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(row++, 48);

    // Spacer
    sheet.setRowHeight(row++, 10);

    // Column header row
    sheet.getRange(row, 1).setValue('Item');
    sheet.getRange(row, 2).setValue('Description');
    parts.forEach(function(p, i) {
      const head = (p.partNumber || 'Part ' + (i + 1)) + (p.partName ? '\n' + p.partName : '');
      sheet.getRange(row, 3 + i).setValue(head);
    });
    sheet.getRange(row, 1, 1, lastCol)
      .setBackground(C_HEADER_BG).setFontColor(C_HEADER_FG).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
    sheet.setRowHeight(row, 44);
    sheet.setFrozenRows(row);
    row++;

    // Per-section question rows
    RFQ_SECTIONS_.forEach(function(section) {
      sheet.getRange(row, 1, 1, lastCol).merge()
        .setValue(section.name)
        .setBackground(C_SECTION_BG).setFontColor(C_SECTION_FG)
        .setFontWeight('bold').setFontSize(11)
        .setHorizontalAlignment('left').setVerticalAlignment('middle');
      sheet.setRowHeight(row++, 28);

      section.questions.forEach(function(q) {
        sheet.getRange(row, 1).setValue(q.label)
          .setFontWeight('bold').setVerticalAlignment('middle').setWrap(true);
        sheet.getRange(row, 2).setValue(q.help || '')
          .setFontColor(C_HELP_FG).setFontStyle('italic').setFontSize(10)
          .setWrap(true).setVerticalAlignment('middle');
        parts.forEach(function(p, i) {
          const cell = sheet.getRange(row, 3 + i);
          if (q.value) {
            try {
              const v = q.value(p);
              if (v !== undefined && v !== null && v !== '') cell.setValue(v);
            } catch (e) {}
          }
          cell.setBackground(q.fill ? C_FILL_BG : '#FFFFFF');
          if (q.format) cell.setNumberFormat(q.format);
          cell.setHorizontalAlignment('center').setVerticalAlignment('middle');
          cell.setBorder(true, true, true, true, false, false, C_BORDER, SpreadsheetApp.BorderStyle.SOLID);
        });
        sheet.setRowHeight(row++, 26);
      });

      // Blank row between sections
      sheet.setRowHeight(row++, 10);
    });

    // Column widths
    sheet.setColumnWidth(1, 240);
    sheet.setColumnWidth(2, 360);
    parts.forEach(function(p, i) { sheet.setColumnWidth(3 + i, 180); });
    // Note: frozen columns aren't compatible with the row-spanning merges
    // we use for the title / section headers / instructions block (Sheets
    // errors if a merged range straddles the freeze boundary). Frozen
    // ROWS still apply, so the part-name header row stays visible while
    // scrolling through the question rows. For exports with many parts,
    // user can manually freeze cols via View → Freeze in the Sheet.

    return ss.getUrl();
  } catch (e) {
    Logger.log('exportRFQTemplate error: ' + e.message);
    throw e;
  }
}
