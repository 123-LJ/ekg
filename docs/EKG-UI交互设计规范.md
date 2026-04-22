# EKG Panel UI Interaction Spec

## 1. Product intent

The panel is now a **dual-view local knowledge workspace**:

- **Overview** for metrics, experience browsing, capture queue, and project context
- **Graph View** for visual knowledge exploration

The page remains local, static, and read-mostly.

## 2. Page structure

### 2.1 Tabs

The panel contains two top-level tabs:

1. `Overview`
2. `Graph View`

### 2.2 Overview sections

- header summary
- metric cards
- recent experiences
- browser query helper
- graph summary
- top tags / techs / hot files
- pipeline summary
- capture review queue
- operator shortcut commands
- project list

### 2.3 Graph View sections

- graph canvas
- graph filter
- legend
- graph inspector

### 2.4 Global floating UI

- experience detail drawer
- drawer backdrop

## 3. Core interactions

### 3.1 Top search

Used in `Overview`.

Scope:

- recent experience cards only

Search fields:

- id
- title
- problem
- solution
- tags
- techs
- files
- concepts

Behavior:

- instant filtering
- no reload

### 3.2 Browser query helper

Used in `Overview`.

Purpose:

- lightweight in-browser search over the current exported snapshot

Behavior:

- input instantly ranks matching experiences
- result cards show summary + score hints
- clicking a result opens the detail drawer

### 3.3 Experience card

Behavior:

- click card → open detail drawer
- click “Open details” → same result

### 3.4 Detail drawer

Content:

- id / title
- status / confidence / level / type
- problem
- solution
- root cause
- files
- concepts
- tags / techs
- CLI suggestions
- related experiences

Close methods:

- close button
- backdrop
- `Esc`

### 3.5 Related experiences

Shown inside the drawer.

Relation signals:

- shared files
- shared tags
- shared techs
- shared concepts

Behavior:

- click related experience → navigate drawer to that experience

### 3.6 Graph View

Graph engine:

- Cytoscape.js

Behavior:

- click node → update graph inspector
- click experience node → open detail drawer
- selected node neighborhood is highlighted
- graph filter focuses matching nodes

### 3.7 Graph inspector

Shows:

- selected node label
- node type
- node degree
- suggested CLI query

## 4. Visual rules

### 4.1 Style baseline

- light dashboard background
- white cards
- compact information density
- graph canvas uses a softer tinted surface

### 4.2 Node color mapping

- Experience: blue
- Tag: orange
- Tech: green
- File: red
- Concept: purple

### 4.3 Status colors

- ACTIVE: green
- NEEDS_REVIEW: yellow
- STALE / ARCHIVED: red

## 5. Empty states

Required for:

- no experiences
- no query results
- no related experiences
- no pending candidates
- no projects
- no pipeline
- no graph data
- no graph node selected

## 6. Acceptance criteria

- `node scripts/ekg.js panel` generates HTML
- `Overview` and `Graph View` tabs both render
- graph canvas is present
- browser query helper returns clickable results
- detail drawer opens and closes correctly
- related experiences are navigable
- graph filter can focus matching nodes
- experience node click can open detail drawer
- panel still works without frontend build tooling
