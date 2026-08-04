export const en = {
	settings: {
		heading: 'Project progress',
		projectStartProperty: {
			name: 'Project start property',
			description: 'Frontmatter property containing the project start date.',
		},
		projectEndProperty: {
			name: 'Project end property',
			description: 'Frontmatter property containing the project end date.',
		},
		deriveDateRangeFromTasks: {
			name: 'Derive date range from tasks',
			description: 'Use the earliest task start and latest task due date when both are available.',
		},
		scopeProperty: {
			name: 'Scope property',
			description: 'Task property containing each task’s contribution to project scope, such as timeEstimate or points.',
		},
		scopeIsDuration: {
			name: 'Scope is a duration',
			description: 'Format scope as minutes and hours. Disable for unitless values such as story points.',
		},
		taskStartProperty: {
			name: 'Task started property',
			description: 'Task date property recording when progress began. Falls back to scheduled, completedDate, then the project start.',
		},
		inProgressStatuses: {
			name: 'In-progress statuses',
			description: 'Comma-separated status values that count toward started scope. Completed statuses are always included.',
		},
		countWeekends: {
			name: 'Count weekends',
			description: 'Let the ideal burndown decline on Saturday and Sunday.',
		},
	},
	progress: {
		title: '{projectName} Progress',
		dateRange: '{startDate} – {endDate}',
		loading: 'Loading project progress…',
		missingDates: 'Add valid project start and end dates to show project progress.',
		loadError: 'Could not load project progress.',
		metrics: {
			scope: 'Scope',
			started: 'Started',
			completed: 'Completed',
		},
		chart: {
			minutesAxis: 'Minutes',
			scopeAxis: 'Scope',
			scopeSeries: 'Scope',
			idealSeries: 'Ideal burndown',
			startedSeries: 'Started',
			completedSeries: 'Completed',
		},
		units: {
			minutes: '{value}m',
			hours: '{value}h',
		},
	},
} as const;
