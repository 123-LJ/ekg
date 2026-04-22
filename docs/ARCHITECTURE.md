# EKG Panel Architecture

## 1. Goal

Upgrade the local EKG panel from a pure dashboard into a **dashboard + graph dual-view** experience while preserving the current low-cost architecture:

- no frontend build system
- no always-on server
- local static export remains the primary delivery model

The panel should now support:

- metric overview
- recent experience browsing
- browser-side query helper
- experience detail drawer
- related experience navigation
- knowledge graph visualization
- graph filtering and inspection

## 2. Option comparison

### Option A — Static HTML + graph library in browser
- Generate one self-contained HTML page
- Add a browser graph engine for interaction
- Lowest retrofit cost
- Best fit for current EKG phase

### Option B — Local HTTP server + API
- Better live interactivity
- Higher runtime and maintenance cost
- Not necessary yet

### Option C — SPA application
- Richest frontend architecture
- Highest cost and strongest coupling to frontend tooling
- Too heavy for current repo maturity

## 3. Chosen approach

Use **Option A**:

- keep static HTML export
- keep Node CLI as the entry
- render graph interaction in browser using **Cytoscape.js**

Why:

- best match for graph-oriented visualization
- minimal disruption to current Node CLI architecture
- no need to introduce React/Vue/Tauri right now
- allows a more product-like knowledge graph experience quickly

## 4. Retrofit boundary

### Reused modules
- `lib/model`
- `lib/graph`
- `lib/project`
- `lib/capture`
- `lib/commands`
- existing `ekg-out` output structure

### New / expanded module
- `lib/panel/index.js`

### Output
- `ekg-out/panel/index.html`

### Explicit non-goals for now
- no browser write operations
- no server-backed query execution
- no realtime sync
- no graph persistence separate from EKG runtime

## 5. Data flow

1. CLI loads runtime through the existing storage backend
2. panel module builds a view model from runtime
3. panel module derives:
   - metric summary
   - recent experiences
   - relation hints
   - graph summary
   - Cytoscape node/edge elements
4. panel module renders a static HTML file
5. browser enhances the page with:
   - tab switching
   - drawer interaction
   - browser-side query helper
   - Cytoscape graph rendering and filtering

## 6. UI scope

The current panel version includes:

- Overview tab
- Graph View tab
- Browser query helper
- Experience detail drawer
- Related experience navigation
- Graph inspector
- Graph filter
- Top tag / tech / file summary
- Pipeline summary
- Capture review queue
- Project list

## 7. Graph view design

### Node types
- Experience
- Tag
- Tech
- File
- Concept

### Edge model
- reuse current knowledge-graph adjacency from `lib/graph`

### Interaction
- click node → inspect in graph inspector
- click experience node → open detail drawer
- filter graph by keyword
- highlight selected node and neighborhood

## 8. Dependency choice

The graph layer is rendered with **Cytoscape.js** in the browser.

Current loading mode:

- CDN script inside generated HTML

This keeps the repo simple for now.

Future upgrade path if offline support becomes mandatory:

- vendor the library locally
- or copy a pinned local asset into the export directory

## 9. Next upgrade path

If this graph view proves useful, the next steps should be:

1. improve graph ranking / filtering
2. add richer node drill-down
3. add layout switching
4. add export formats such as GEXF / GraphML
5. only then evaluate a server mode or desktop shell
