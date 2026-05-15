# Contributing

## Development Setup

1. Clone the repository
2. Edit code in VS Code
3. Push to Google Apps Script: `clasp push`
4. Test in the deployed web app

## File Structure

- **Data.gs** - Do not modify unless adding new regions or tonnage brackets
- **Calc.gs** - Core cost calculation logic, test with baseline values
- **Code.gs** - Server functions for Spreadsheet I/O
- **index.html** - Web UI, must include calcSC() mirror for client-side

## Making Changes

1. Create a branch for your feature/fix
2. Edit files in VS Code
3. Test changes: `clasp push` → test in web app
4. Verify calculations against known baselines
5. Create pull request with description of changes

## Testing

Before deploying to production:
- Test baseline calculation: Mexico 250t 85g → ~$0.19xx
- Test override badges (change machine rate, labor rate, OH%)
- Test tooling amortization: set cumulativeVolume ≥ toolLife × cavities
- Test save/load/delete parts
- Test export to Google Drive

## Deployment

1. All changes must be committed and merged to main
2. `clasp push` to Apps Script
3. Update deployment in Apps Script Editor (Manage Deployments)
4. Verify web app loads and functions work

## Commit Message Format

```
[scope] Short description

- Detailed explanation if needed
- Multiple bullet points ok
```

Examples:
- `[calc] Fix scrap rate application to tooling`
- `[ui] Add override badge to machine rate input`
- `[sheets] Add error handling for missing PARTS_SHEET_ID`

## Code Style

- Keep functions small and testable
- No DOM calls in Calc.gs (calculation engine)
- No Spreadsheet calls in calculation logic
- Comment only the "why", not the "what"

## Questions?

Check the README or open an issue on GitHub.
