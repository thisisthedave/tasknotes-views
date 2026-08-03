import { describe, expect, it } from 'vitest';
import { createSillyCycleOption } from '../src/views/CycleProgressChart';

describe('createSillyCycleOption', () => {
	it('creates three week-long sample series', () => {
		const option = createSillyCycleOption();
		expect(option.series).toHaveLength(3);
		expect(option.xAxis).toMatchObject({
			data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
		});
	});
});
