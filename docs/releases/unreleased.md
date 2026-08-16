# TaskNotes Views - Unreleased

<!--
Add user-facing changes below using Added, Changed, and Fixed sections.
The npm version lifecycle moves these entries into the versioned release page.
-->

## Added

- Added recurring-cycle rollover choices after a task's final cycle occurrence: keep it assigned, remove it while retaining completed occurrence history, or move it to the next cycle (creating that cycle when needed).
- Added a default-enabled **Recurring task rollover** setting beside cycle task rollover.

## Fixed

- Cycle graphs now merge completed recurring occurrence snapshots with active assignments and use immutable snapshots outside a cycle's date range without double-counting.
