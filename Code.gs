// Server-side functions for Google Apps Script

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('Should Cost: Injection Mold')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Build unique key from part data
function buildSlug(inp) {
  const raw = (inp.partNumber ? inp.partNumber + '_' : '') + (inp.partName || 'part');
  return 'part:' + raw.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 80);
}

// Build spreadsheet row from input object
function buildRow(slug, inp) {
  const row = [];
  FIELD_KEYS.forEach(key => {
    if (key === 'key') {
      row.push(slug);
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
    } else if (['partWeightG', 'runnerPct', 'runnerWeightOverride', 'regrindRate', 'cavities', 'cycleTimeSec', 'utilization', 'scrapRate', 'resinCostPerKg', 'tonnage', 'machineRateOverride', 'laborRateOverride', 'ohRateOverride', 'marginRateOverride', 'toolingCost', 'toolLife', 'cumulativeVolume'].includes(key)) {
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
    const sh = ss.getSheetByName('Parts Library');
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
    const sh = ss.getSheetByName('Parts Library');
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
    const sh = ss.getSheetByName('Parts Library');
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
