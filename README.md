# Should Cost: Injection Mold Calculator

A real-time injection molding should-cost calculator built with Google Apps Script and deployed from VS Code.

## Features

- **Real-time cost calculations** for injection molded parts across 4 regions (USA, Mexico, China, Indonesia)
- **Automatic machine rate resolution** from tonnage brackets with regional multipliers
- **Cost breakdown**: Material (resin), Machine, Labor, Overhead, SG&A, Duty, Margin, Tooling
- **Parts library**: Save/load/delete parts with persistent storage in Google Sheets
- **Export to Drive**: Generate formatted cost analysis sheets and save to Google Drive
- **Override controls**: Set custom machine rates, labor rates, overhead %, and margins
- **Tooling amortization**: Automatic zero-out when tool life is exceeded
- **Scrap uplift**: Applied independently across all cost layers

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Google account with Drive access
- VS Code (optional but recommended)

### Setup

1. **Clone and install**:
   ```bash
   npm install -g @google/clasp
   clasp login
   ```

2. **Create Google Apps Script project**:
   - Go to [script.google.com](https://script.google.com)
   - Create new project, name it "Should_Cost_Injection_Mold"
   - Copy Script ID from Project Settings
   - Replace `YOUR_SCRIPT_ID_HERE` in `.clasp.json`

3. **Create Parts Library Spreadsheet**:
   - Create new Google Sheet named "Should_Cost_Parts_Library"
   - Add sheet tab "Parts Library" with header row:
     ```
     key | partNumber | partName | region | partWeightG | runnerPct | runnerWeightOverride | regrindRate | cavities | cycleTimeSec | utilization | scrapRate | resinCostPerKg | tonnage | machineRateOverride | laborRateOverride | ohRateOverride | marginRateOverride | toolingCost | toolLife | cumulativeVolume
     ```
   - Get Spreadsheet ID from URL
   - Get Drive folder ID for exports folder

4. **Set Script Properties**:
   - In Apps Script Editor: Project Settings → Script Properties
   - Add:
     - `PARTS_SHEET_ID`: [your spreadsheet ID]
     - `EXPORT_FOLDER_ID`: [your exports folder ID]

5. **Deploy**:
   ```bash
   clasp push
   ```
   - In Apps Script Editor: Deploy → New Deployment → Web App
   - Execute as: User accessing the web app (matches `executeAs: USER_ACCESSING` in appsscript.json)
   - Who has access: Anyone within your Google Workspace domain (matches `access: DOMAIN` in appsscript.json)
   - Copy Web App URL and share with team

## Development Workflow

### Local Development (VS Code)

Edit files in VS Code:
- `Data.gs` - Regional data and defaults
- `Calc.gs` - Cost calculation engine
- `Code.gs` - Server-side functions
- `index.html` - Web UI

### Push to Google Apps Script

```bash
clasp push
```

### View Server Logs

```bash
clasp logs
```

### Update Web App

After pushing:
1. Go to Apps Script Editor
2. Manage Deployments
3. Click edit pencil on existing deployment
4. Deploy new version (no URL change needed)

## Architecture

- **Calc.gs**: Pure cost calculation function (no Sheets/DOM calls)
- **Data.gs**: Regional data, tonnage brackets, defaults
- **Code.gs**: Server functions for Sheets I/O, web app serving
- **index.html**: Single-page UI with inline CSS/JS, mirrors Calc logic client-side

## Server Function Contract

Client (index.html) calls these via `google.script.run`:

- `savePart(partJson: string) -> string` — Upserts a row in the "Parts Library" tab keyed by `buildSlug(partNumber, partName)`. Returns the slug.
- `loadAllParts() -> string` — Returns JSON-stringified array of part inputs, sorted by partNumber then partName. Returns `"[]"` if `PARTS_SHEET_ID` unset.
- `deletePart(key: string) -> boolean` — Deletes the row whose first cell matches `key`. Returns true if a row was removed.
- `exportPartsToSheet(partsJson: string) -> string` — Creates a new Sheet in `EXPORT_FOLDER_ID` with one column per part and a fixed set of output rows. Returns the new spreadsheet URL.

Both Sheet operations require the Script Properties `PARTS_SHEET_ID` and `EXPORT_FOLDER_ID`. Required OAuth scopes (appsscript.json): `spreadsheets`, `drive.file`, `script.external_request`.

## Keeping calc in sync

`index.html` contains an inline copy of `REGIONS`, `TONNAGE_BRACKETS`, and `calcSC` (roughly the second half of the inline script block) used for instant client-side recalc. Any change to `Data.gs` or `Calc.gs` MUST be mirrored there or the UI will silently disagree with the server.

## Cost Calculation

The tool calculates should-cost in 7 steps (see `Calc.gs`):

1. **Machine Rate** — Tonnage bracket base $/hr × regional multiplier (or override)
2. **Material** — (Part weight + runner weight × (1 - regrind rate)) × resin $/kg
3. **Machine** — Hourly rate / parts per hour (cavities × utilization × 3600 / cycle)
4. **Labor** — Direct labor + secondary-ops labor (laborRate × secOpsMin / 60)
5. **Overhead, secondary machine, packaging, freight, duty, SG&A** — OH on labor, plus regional pkg + freight + duty + SG&A applied to the manufacturing subtotal
6. **Margin** — Applied to (mfg subtotal + duty + SG&A) to produce base total
7. **Tooling** — `toolingCost / (toolLife × cavities)`, zeroed when `cumulativeVolume` meets or exceeds `toolLife × cavities`

Scrap rate is applied independently to material, machine, labor, and tooling layers.

## Test Baseline

**Expected output**: Mexico region, 250 tonnage, 85g part → ~**$0.19xx/pc**

Input values:
- Region: Mexico
- Tonnage: 250
- Part Weight: 85g
- Runner %: 14
- Regrind Rate: 0.30
- Cavities: 2
- Cycle Time: 28 sec
- Utilization: 0.85
- Scrap Rate: 0.02
- Resin: $2.98/kg
- Tooling: $85,000
- Tool Life: 750,000 shots
- Cumulative: 0

## Regional Data

Labor rates, overhead, SG&A, margin, packaging, freight, and duty are defined per region in `Data.gs`. Machine rate is resolved from a tonnage bracket (`Data.gs > TONNAGE_BRACKETS`) then multiplied by the region's multiplier.

| Region    | Labor $/hr | Machine multiplier | OH % | SG&A % | Margin % | Duty % |
|-----------|------------|--------------------|------|--------|----------|--------|
| USA       | $28.50     | 1.000              | 90%  | 7%     | 10%      | 0%     |
| Mexico    | $5.80      | 0.615              | 60%  | 6%     | 9%       | 0%     |
| China     | $7.20      | 0.538              | 65%  | 7%     | 8%       | 25%    |
| Indonesia | $2.80      | 0.364              | 45%  | 5%     | 8%       | 10%    |

Tonnage brackets (USA base $/hr, multiplied by region multiplier): Micro ≤50t $32, Small ≤100t $42, Medium ≤200t $52, Large ≤400t $68, XL ≤700t $88, XXL ≤1000t $110, Giga >1000t $140.

## GitHub Issues

Track development with issues:
- `setup` - Environment setup
- `calculations` - Cost formula verification
- `sheets-integration` - Parts library & export
- `deployment` - GAS deployment & testing
- `documentation` - User guide & reference

## Support

For issues or questions, check the issues log on GitHub or review the handoff document.

---

**Last Updated**: May 2026  
**Version**: 1.0.0  
**Platform**: Google Apps Script (V8 Runtime)
