let full = true;
let ready = false;

const MIN_YEAR = 1997;
const MAX_YEAR = 2017;
const CAPITA = 100000;

const COLORS = [
	'#e8b8a0',
	'#f2a385',
	'#f88d69',
	'#fc764f',
	'#fe5c34',
	'#ff3814'
];

const body = d3.select('body');
const graphic = d3.select('.graphic__trend');
const chartAll = d3.select('.trend__chart--all');
const chartState = d3.select('.trend__chart--state');

const scaleState = {
	x: d3.scaleLinear(),
	y: d3.scaleLinear(),
	color: d3.scaleQuantize()
};
const scaleAll = { x: d3.scaleLinear(), y: d3.scaleLinear() };
const MARGIN = 20;
const FONT_SIZE = 12;
const RATIO = 1.5;
let widthState = 0;
let heightState = 0;
let widthAll = 0;
let heightAll = 0;

let dataByState = null;
let dataAll = null;
let perCapitaMax = 0;
let perCapitaMeanExtent = null;

function getPop(key, pop) {
	const m = pop.find(p => p.state.toLowerCase() === key.toLowerCase());
	return +m.population;
}

function fillEmpty(values) {
	const years = d3.range(MIN_YEAR, MAX_YEAR);
	const population = values[0].population;
	return years.map(year => {
		const match = values.find(d => d.year === year);
		if (match) return match;
		return {
			key: year.toString(),
			value: 0,
			year,
			population
		};
	});
}

function cleanData({ population, established }) {
	dataByState = established
		.map((d, i) => ({
			...d,
			population: getPop(d.key, population),
			values: d.values
				.map(v => ({
					...v,
					year: +v.key,
					population: getPop(d.key, population)
				}))
				.filter(v => v.year >= MIN_YEAR && v.year < MAX_YEAR)
		}))
		.map(d => ({
			...d,
			values: fillEmpty(d.values),
			max: d3.max(d.values, v => v.value / v.population) * CAPITA,
			mean: d3.mean(d.values, v => v.value / v.population) * CAPITA
		}))
		.filter(d => d.key !== 'Washington DC')
		.sort((a, b) => d3.descending(a.mean, b.mean));

	perCapitaMax = d3.max(dataByState, d => d.max);
	perCapitaMeanExtent = d3.extent(dataByState, d => d.mean);

	const merged = d3.merge(established.map(d => d.values));
	dataAll = d3
		.nest()
		.key(d => d.key)
		.sortKeys(d3.ascending)
		.rollup(values => d3.sum(values, v => v.value))
		.entries(merged)
		.map(d => ({
			...d,
			year: +d.key
		}))
		.filter(d => d.year >= MIN_YEAR && d.year < MAX_YEAR);
}

function loadData() {
	return new Promise((resolve, reject) => {
		d3
			.queue()
			.defer(d3.csv, 'assets/population.csv')
			.defer(d3.json, 'assets/established.json')
			.await((err, population, established) => {
				if (err) reject(err);
				else {
					cleanData({ population, established });
					resolve();
				}
			});
	});
}

function resizeState() {
	widthState = chartState.select('.state__svg').node().offsetWidth;
	heightState = Math.floor(widthState / RATIO);
	heightState = 100;
	const chartWidth = widthState - MARGIN * 2;
	const chartHeight = heightState - MARGIN * 2;

	scaleState.y.range([chartHeight, 0]);
	scaleState.x.range([0, chartWidth]);

	const area = d3
		.area()
		// .defined(d => d)
		.x(d => scaleState.x(d.year))
		.y0(d => scaleState.y(d.value / d.population * CAPITA))
		.y1(scaleState.y(0))
		.curve(d3.curveMonotoneX);

	const line = d3
		.area()
		// .defined(d => d)
		.x(d => scaleState.x(d.year))
		.y(d => scaleState.y(d.value / d.population * CAPITA))
		.curve(d3.curveMonotoneX);

	const svg = chartState.selectAll('svg');

	svg.attr('width', widthState).attr('height', heightState);

	svg
		.select('.state__area')
		.datum(d => d.values)
		.attr('d', area);

	svg
		.select('.state__line')
		.datum(d => d.values)
		.attr('d', line);

	const axisX = d3
		.axisBottom(scaleState.x)
		.tickFormat(d3.format(' '))
		.tickValues([1997, 2016]);

	svg
		.select('.axis--x')
		.call(axisX)
		.attr('transform', `translate(0, ${chartHeight})`);

	const axisY = d3
		.axisRight(scaleState.y)
		.tickSizeInner(-chartWidth)
		.tickPadding(FONT_SIZE * 0.25)
		.tickValues([0.4, 1]);

	svg
		.select('.axis--y')
		.call(axisY)
		.attr('transform', `translate(${chartWidth}, 0)`);
}

function resizeAll() {
	const line = d3
		.line()
		.x(d => scaleAll.x(d.year))
		.y(d => scaleAll.y(d.value))
		.curve(d3.curveMonotoneX);

	widthAll = chartAll.node().offsetWidth;
	heightAll = window.innerHeight * (full ? 0.8 : 0.5);
	const chartWidth = widthAll - MARGIN * 4;
	const chartHeight = heightAll - MARGIN * 2;

	scaleAll.y.range([chartHeight, 0]);

	scaleAll.x.range([0, chartWidth]);

	const svg = chartAll.selectAll('svg');

	svg.attr('width', widthAll).attr('height', heightAll);

	svg
		.select('.all__path')
		.datum(dataAll)
		.attr('d', line);

	const axisX = d3.axisBottom(scaleAll.x).tickFormat(d3.format(' '));

	svg
		.select('.axis--x')
		.call(axisX)
		.attr('transform', `translate(0, ${chartHeight})`);

	const axisY = d3
		.axisRight(scaleAll.y)
		.tickSizeInner(-chartWidth)
		.tickPadding(FONT_SIZE * 0.5);

	svg
		.select('.axis--y')
		.call(axisY)
		.attr('transform', `translate(${chartWidth}, 0)`);

	svg
		.select('.y-label')
		.attr('transform', 'rotate(90)')
		.attr('x', chartHeight / 2)
		.attr('y', -MARGIN * 1.5 - FONT_SIZE);
}

function resize() {
	full = body.classed('is-full');
	if (ready) {
		resizeState();
		resizeAll();
	}
}

function setupChartAll() {
	const svg = chartAll.append('svg');

	const axis = svg
		.append('g')
		.attr('class', 'g-axis')
		.attr('transform', `translate(${MARGIN}, ${MARGIN})`);

	const g = svg
		.append('g')
		.attr('class', 'g-graphic')
		.attr('transform', `translate(${MARGIN}, ${MARGIN})`);

	axis.append('g').attr('class', 'axis--x');

	axis
		.append('g')
		.attr('class', 'axis--y')
		.append('text')
		.attr('class', 'y-label')
		.attr('text-anchor', 'middle')
		.text('# of Breweries opened');

	g.append('path').attr('class', 'all__path');
}

function setupChartState() {
	const state = chartState.selectAll('.chart__state').data(dataByState);

	const stateEnter = state
		.enter()
		.append('div')
		.attr('class', 'chart__state');

	stateEnter
		.append('p')
		.attr('class', 'state__label')
		.text(d => d.key);

	const svg = stateEnter
		.append('div')
		.attr('class', 'state__svg')
		.append('svg');

	const axis = svg
		.append('g')
		.attr('class', 'g-axis')
		.attr('transform', `translate(${MARGIN}, ${MARGIN})`);

	const g = svg
		.append('g')
		.attr('class', 'g-graphic')
		.attr('transform', `translate(${MARGIN}, ${MARGIN})`);

	axis.append('g').attr('class', 'axis--x');

	axis.append('g').attr('class', 'axis--y');

	g
		.append('path')
		.attr('class', 'state__area')
		.style('fill', d => scaleState.color(d.mean));

	g
		.append('path')
		.attr('class', 'state__line')
		.attr('transform', 'translate(0, -1)');
	// .style('stroke', d => scaleState.color(d.max))
}

function setupScales() {
	scaleState.x.domain([MIN_YEAR, MAX_YEAR - 1]);
	scaleState.y.domain([0, perCapitaMax]);
	scaleState.color.domain(perCapitaMeanExtent).range(COLORS);

	scaleAll.x.domain([MIN_YEAR, MAX_YEAR - 1]);
	const max = d3.max(dataAll, d => d.value);
	scaleAll.y.domain([0, max]).nice();
}

function setup() {
	setupScales();
	setupChartAll();
	setupChartState();
	ready = true;
	resize();
}

function init() {
	loadData()
		.then(setup)
		.catch(err => console.log(err));
}

export default { init, resize };
