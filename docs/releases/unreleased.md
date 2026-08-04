# TaskNotes Views - Unreleased

<!--
Add user-facing changes below using Added, Changed, and Fixed sections.
The npm version lifecycle moves these entries into the versioned release page.
-->

## Added

- Added a **Create cycle** command that creates the next scheduled cycle project, opens it, and stamps its configured start and end frontmatter dates.
- Added Moment-compatible cycle path formatting with an annual `{cycle}` counter, defaulting to `YYYY/YYYY-[Cycle]-{cycle}`.
- Added cycle settings for the project folder, optional Templater template, start weekday, duration, and automatic incomplete-task rollover.
- Added support for inheriting an empty cycle project folder from TaskNotes' configured default tasks folder.
- Added optional Templater processing for new cycle notes, with blank-note creation when Templater or a template is unavailable.
- Added a **Rollover tasks** command with fuzzy previous- and next-project selectors and adjacent `-N` cycle-name suggestions.
- Added automatic destination-cycle creation when rolling tasks forward to a cycle project that does not exist yet.
- Added idempotent rollover of incomplete TaskNotes tasks that replaces only the previous cycle assignment, preserves unrelated project assignments, and excludes completed, skipped, cancelled, and archived work.
- Added a hover and keyboard-focus summary on **Scope / Capacity** showing the historical completion window, completion count, weighted weekly velocity, project workdays, and resulting capacity.

## Fixed

- Fixed already-open project notes failing to inject a progress graph when their first tasks were assigned after the note was opened, in both Live Preview and Reading view.
- Fixed the rollover project selector resolving to cancellation even after a project was chosen because Obsidian closes suggest modals before delivering their selection callback.
