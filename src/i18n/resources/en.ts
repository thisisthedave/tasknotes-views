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
			description: 'For missing project boundaries, use the earliest task scheduled or started date and the latest task due date.',
		},
		scopeProperty: {
			name: 'Scope property',
			description: 'Task property containing each task’s contribution to project scope, such as timeEstimate or points.',
		},
		scopeIsDuration: {
			name: 'Scope is a duration',
			description: 'Format scope as minutes and hours. Disable for unitless values such as story points.',
		},
		estimateCapacityFromVelocity: {
			name: 'Estimate capacity from past velocity',
			description: 'Estimate project capacity from six weeks of recent completed task scope, weighted toward newer work.',
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
		cycles: {
			heading: 'Cycles',
			nameFormat: {
				name: 'Cycle name format',
				description: 'Moment date format for cycle paths. Use {cycle} for the annual counter, for example YYYY/YYYY-[Cycle]-{cycle}.',
			},
			template: {
				name: 'Cycle project template',
				description: 'Template note processed by Templater when it is installed. Otherwise a blank cycle note is created.',
			},
			folder: {
				name: 'Cycle project folder',
				description: 'Root folder for cycle projects. Leave empty to inherit TaskNotes’ default tasks folder.',
			},
			startDay: {
				name: 'Cycle start day',
				description: 'Weekday on which scheduled cycles begin, or the current day for an ad hoc cadence.',
			},
			duration: {
				name: 'Cycle duration',
				description: 'Number of weeks in each cycle.',
			},
			rollover: {
				name: 'Cycle task rollover',
				description: 'Automatically move eligible incomplete tasks when creating the next cycle.',
			},
			snapshotOnClose: {
				name: 'Snapshot cycle progress on close',
				description: 'Save immutable task membership and chart data before rollover changes project assignments.',
			},
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
			scopeCapacity: 'Scope / Capacity',
			scheduled: 'Scheduled',
			started: 'Started',
			completed: 'Completed',
		},
		insufficientCapacityData: 'Not enough historical data to estimate capacity.',
		capacityCalculation: '{completionCount} completions from {historyStart}–{historyEnd} produced {weeklyVelocity}/week. {projectDays} project days ÷ {daysPerWeek} days/week = {capacity} capacity.',
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
	cycles: {
		rolloverConfirm: {
			title: 'Roll over incomplete tasks?',
			description: 'Move eligible incomplete tasks from {previous} to {next}?',
			cancel: 'Cancel',
			confirm: 'Roll over',
		},
	},
} as const;
