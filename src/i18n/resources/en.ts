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
			description: 'Task date property recording when progress began.',
		},
		taskScheduledProperty: {
			name: 'Task scheduled property',
			description: 'Task date property recording when work is planned to start.',
		},
		inProgressStatuses: {
			name: 'In-progress statuses',
			description: 'Comma-separated status values that count toward started scope. Completed statuses are always included.',
		},
		countWeekends: {
			name: 'Count weekends',
			description: 'Target completion expects task progress on Saturday and Sunday.',
		},
	},
	progress: {
		title: '{projectName} Progress',
		dateRange: '{startDate} – {endDate}',
		loading: 'Loading project progress…',
		missingDates: 'Add valid date values to the “{startProperty}” and “{endProperty}” frontmatter properties on this project note to show project progress.',
		loadError: 'Could not load project progress.',
		metrics: {
			scope: 'Scope',
			scheduled: 'Scheduled',
			started: 'Started',
			completed: 'Completed',
		},
		chart: {
			minutesAxis: 'Minutes',
			scopeAxis: 'Scope',
			scopeSeries: 'Scope',
			startedSeries: 'Started',
			completedSeries: 'Completed',
			targetSeries: 'Target',
			scheduledSeries: 'Scheduled',
		},
		units: {
			minutes: '{value}m',
			hours: '{value}h',
		},
	},
} as const;
