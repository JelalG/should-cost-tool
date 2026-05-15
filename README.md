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
   - Execute as: User accessing the web app
   - Who has access: Anyone with Google login
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

## Cost Calculation

The tool calculates should-cost in 7 steps:

1. **Machine Rate** - Resolve from tonnage bracket + regional multiplier
2. **Material** - Resin cost (part + runner - regrind)
3. **Machine** - Hourly rate ÷ parts per hour
4. **Labor** - Direct ops + secondary ops
5. **Overhead** - Direct + secondary labor × OH rate
6. **SG&A & Margin** - Manufacturing base + duty + SG&A, apply margin
7. **Tooling** - Amortize over tool life × cavities, zero out at paid-off

Scrap rate applied independently to each layer.

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

| Region | Labor $/hr | Machine $ | OH % | SG&A % | Margin % |
|--------|-----------|-----------|------|--------|----------|
| USA | $28.50 | $32 (base) | 90% | 7% | 10% |
| Mexico | $5.80 | $32 × 0.615 | 60% | 6% | 9% |
| China | $7.20 | $32 × 0.538 | 65% | 7% | 8% |
| Indonesia | $2.80 | $32 × 0.364 | 45% | 5% | 8% |

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
