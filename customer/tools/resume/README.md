# Creatarsh Resume Studio — 100 Template Edition

A responsive resume builder prototype with a dedicated template discovery and preview page.

## Start
Open `templates.html` to browse and preview all 100 resume designs. Select a design with **Use this template** to open the editor. You can also open `index.html` directly.

## Template library
- 100 named template combinations
- 10 layout systems: ATS single-column, modern sidebar, executive editorial, compact professional, minimalist, bold header, creative portfolio, academic CV, graduate starter and technical specialist
- 10 visual themes / palettes
- Search, category filters and sorting
- Individual miniature previews and a larger selected-template preview
- Selected design carries into the editor and is remembered in this browser

## Resume editor
- Seven guided sections: contact, profile, experience, education, projects, skills and additional details
- Repeatable work, education and project entries
- Live A4 preview
- Resume health checklist
- Local job-description keyword overlap check (not an ATS score)
- Cover letter draft from user-entered information (not AI)
- Browser autosave, JSON backup and restore
- Print / Save as PDF

## Limitations
This is a frontend prototype. Data is stored in browser localStorage only. AI writing, genuine ATS parsing/scoring, DOCX export, server-side storage, authentication, subscription enforcement and manager controls are not connected. The job keyword comparison is a simple local text overlap check, not a hiring prediction. PDF uses the browser print dialog.

## Files
- `templates.html`: dedicated template selection and preview page
- `templates.js`: 100-template catalogue data
- `templates-page.js`: gallery search, filtering, preview and selection
- `templates.css`: gallery design
- `index.html`, `styles.css`, `app.js`: resume editor
- `assets/`: Creatarsh brand logo


## Project checks
Run `node tests/smoke-test.js` from this folder to validate required files, JavaScript syntax, HTML/JavaScript element references, template catalogue integrity, page load order, autosave and print safeguards.
