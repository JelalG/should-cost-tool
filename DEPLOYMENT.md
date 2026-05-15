# DEPLOYMENT GUIDE - NEXT STEPS

All code is ready in VS Code. To deploy to Google Apps Script today, follow these steps:

## Step 1: Create Google Apps Script Project (5 min)

1. Go to [script.google.com](https://script.google.com)
2. Click **New Project**
3. Name it: `Should_Cost_Injection_Mold`
4. Click **Project Settings** (gear icon)
5. Copy the **Script ID** under "IDs"
6. Open `.clasp.json` in VS Code and replace `YOUR_SCRIPT_ID_HERE` with the Script ID
7. Save the file

Example `.clasp.json`:
```json
{
  "scriptId": "1abc2def3ghi4jkl5mno6pqr7stu8vwx",
  "rootDir": "."
}
```

## Step 2: Create Parts Library Google Sheet (5 min)

1. Go to [sheets.google.com](https://sheets.google.com)
2. Click **New → Google Sheet**
3. Name it: `Should_Cost_Parts_Library`
4. Open the sheet, right-click the **Sheet1** tab at bottom
5. Rename to: `Parts Library`
6. In cell **A1**, paste this header row:
   ```
   key	partNumber	partName	region	partWeightG	runnerPct	runnerWeightOverride	regrindRate	cavities	cycleTimeSec	utilization	scrapRate	resinCostPerKg	tonnage	machineRateOverride	laborRateOverride	ohRateOverride	marginRateOverride	toolingCost	toolLife	cumulativeVolume
   ```
   (Tab-separated values — paste as-is)

7. Copy the Sheet URL from the address bar
8. Extract the Spreadsheet ID (long string between `/d/` and `/edit`):
   - URL: `https://docs.google.com/spreadsheets/d/1abc2def3ghi4jkl/edit`
   - ID: `1abc2def3ghi4jkl`

## Step 3: Set Script Properties (5 min)

1. Go back to [script.google.com](https://script.google.com) and open **Should_Cost_Injection_Mold**
2. Click **Project Settings** (gear icon)
3. Scroll down to **Script Properties**
4. Click **Add script property**
5. Add two properties:
   - **Property**: `PARTS_SHEET_ID` → **Value**: [your Spreadsheet ID from Step 2]
   - **Property**: `EXPORT_FOLDER_ID` → **Value**: [ID of a Drive folder you own where exported cost sheets should land. Create the folder first in Drive and copy the ID from its URL.]

## Step 4: Authenticate clasp (2 min)

Open terminal in VS Code and run:
```bash
npm install -g @google/clasp
clasp login
```

This opens a browser to grant permission. Click **Allow** and return to terminal.

## Step 5: Push Code to Google Apps Script (2 min)

In the terminal, run:
```bash
clasp push
```

You should see:
```
Pushed 5 files.
- appsscript.json
- Code.gs
- Calc.gs
- Data.gs
- index.html
```

## Step 6: Deploy as Web App (3 min)

1. Go back to [script.google.com](https://script.google.com)
2. Click **Deploy** (top right)
3. Click **New Deployment** (+ icon)
4. **Type**: Select **Web app**
5. **Execute as**: **User accessing the web app** (matches `executeAs: USER_ACCESSING` in appsscript.json)
6. **Who has access**: **Anyone within [your Workspace domain]** (matches `access: DOMAIN` in appsscript.json — keeps the tool internal to your org)
7. Click **Deploy**
8. Copy the **Deployment URL** (looks like `https://script.google.com/macros/d/...`)
9. Share this URL with your team

## Step 7: Test the Web App (10 min)

1. Open the Deployment URL in a browser
2. Test these scenarios:

**Test 1: Baseline Calculation**
- Enter defaults or reset: Region=Mexico, Tonnage=250, Part Weight=85g
- Expected output: ~**$0.1970/pc** (shown in top left card "TOTAL SHOULD COST")
- ✓ If you see ~$0.1970, calculations are correct

**Test 2: Save a Part**
- Enter part number (e.g., "PN-001") and name (e.g., "Test Part")
- Click **Save Part to Library**
- See toast message "Part saved!"
- Part appears in "Saved Parts Library" list on left
- ✓ Refresh page — part still there (persisted to Sheets)

**Test 3: Override a Value**
- Change "Machine Rate Override" to 50
- Input border turns amber, badge shows "override: $50.00/hr"
- Cost recalculates instantly
- ✓ Real-time updates work

**Test 4: Tooling Amortization**
- Change "Cumulative Volume" to 750000 (set toolLife)
- Change "Cavities" to 2 (toolLife * cavities = 750k * 2 = 1.5M)
- So cumulative=750k < 1.5M, tooling still applies
- Now change Cumulative to 1500000
- Tooling amortization drops to $0/pc, bar turns red "Tool fully amortized"
- ✓ Tooling logic works

**Test 5: Export to Drive**
- Save a couple parts
- Check the checkboxes next to parts
- Click **Export Selected**
- A new Google Sheet is created and opened
- Sheet shows all parts with cost breakdown columns
- ✓ Export works

## Step 8: Troubleshooting

- **Saved Parts list is empty after refresh** — `PARTS_SHEET_ID` is unset or points to a sheet without a "Parts Library" tab. Check Project Settings → Script Properties.
- **Export button errors** — `EXPORT_FOLDER_ID` is unset or points to a folder you don't own. The script writes with `drive.file` scope, so it can only place files in folders you have access to.
- **Total cost shows NaN** — A numeric input was cleared. Reset defaults or re-enter the field.
- **"App not found" / access denied** — Web app is set to `DOMAIN` access; confirm the user opening the URL is signed in with a Workspace account in your domain.
- **Server logs** — Run `clasp logs` locally, or open Executions in the Apps Script editor. Logger.log lines from `savePart` / `loadAllParts` / `deletePart` / `exportPartsToSheet` surface errors there.

## Step 9: Update GitHub Issues (5 min)

Go to [github.com/JelalG/should-cost-tool/issues](https://github.com/JelalG/should-cost-tool/issues)

Close the issues as you verify them:
- Issue #1 (Setup) → Mark as completed once `clasp push` works
- Issue #2 (Calculations) → Close after baseline test passes
- Issue #3 (Sheets Integration) → Close after save/load/export verified end-to-end
- Issue #4 (UI Testing) → Close after all web app tests pass
- Issue #5 (Production) → Leave open until everything is verified

Comment on each issue with: "✓ Verified and working"

## Done! 🎉

Your should-cost-tool is now live and shareable. Share the Web App URL from Step 6 with your team.

**To update the tool in the future:**
1. Edit files in VS Code
2. Run `clasp push`
3. In Apps Script: **Manage Deployments** → click pencil on web app → **Deploy**

---

**Questions?**
- Check README.md for architecture & details
- Check CONTRIBUTING.md for development workflow
- Open an issue on GitHub if something breaks
