# Frontend Verification

## Commands

- `npm run lint`
  - Passes with warnings for pre-existing unused imports and offline editing handlers.
- `npm run build`
  - Passes.
  - Vite reports large chunk warnings for existing export/chart dependencies.

## Runtime Smoke Test

Run:

```bash
VITE_OFFLINE_MODE=true npm run dev -- --host 127.0.0.1
```

Checked flows:

- Offline login opens the upload workspace.
- XLSX upload shows client validation for extension and file size.
- Offline analysis reaches the naming dialog and saves a report.
- Report detail opens with dashboard, qualitative analysis, and analytical report tabs.
- Dashboard renders five chart panels.
- Qualitative analysis shows topic evidence lines.
- Analytical report renders four required sections.
- Mobile viewport check does not produce horizontal page overflow.
