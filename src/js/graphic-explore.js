import * as noUiSlider from 'nouislider';
import Rank from './rank';
import Tracker from './utils/tracker';

let full = true;
let ready = false;

const body = d3.select('body');
const graphic = d3.select('.graphic__explore');
const chart = d3.select('.explore__chart');
const svg = chart.select('svg');

const COLORS = [
	'#dbcdbd',
	'#e8b8a0',
	'#f2a385',
	'#f88d69',
	'#fc764f',
	'#fe5c34',
	'#ff3814'
].reverse();
const MARGIN = 20;
const FONT_SIZE = 12;
const TABLE_WIDTH = 160;
let width = 0;
let height = 0;
let viewportHeight = 0;
let chartSize = 0;
let maxTableRows = 0;

let breweryData = null;
let cityData = null;

let rawUserRank = null;
let userRank = null;

const balance = { quality: 80, quantity: 20 };

const cityScale = {
	quality: d3.scaleLinear(),
	quantity: d3.scaleLinear(),
	rank: d3.scaleLinear(),
	fill: d3.scaleQuantile()
};
const voronoi = d3.voronoi();

function getTranslation(transform) {
	const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	g.setAttributeNS(null, 'transform', transform);
	const matrix = g.transform.baseVal.consolidate().matrix;
	return [matrix.e, matrix.f];
}

function updateBrewList({ breweryNames, rank }) {
	const tableBrews = svg.select('.table__brews');
	const brews = tableBrews.selectAll('.brew').data(breweryNames);

	brews.exit().remove();

	const brewsEnter = brews
		.enter()
		.append('g')
		.attr('class', 'brew');

	brewsEnter.append('text').style('font-size', FONT_SIZE);

	const brewsMerge = brewsEnter.merge(brews);

	brewsMerge.attr(
		'transform',
		(d, i) => `translate(0, ${(i + 1) * FONT_SIZE * 1.5})`
	);

	brewsMerge.select('text').text(d => d);

	// grab the current rank to find position (rank * size)
	// update position
	const y = rank * FONT_SIZE * 1.5;

	tableBrews.classed('is-visible', full);
	tableBrews
		.transition()
		.ease(d3.easeLinear)
		.duration(100)
		.attr('transform', `translate(${TABLE_WIDTH + FONT_SIZE * 0.5}, ${y})`);
}

function handleRowEnter({ breweryNames, rank, index }) {
	svg
		.selectAll('.row')
		.classed('is-connected', false)
		.transition()
		.duration(100)
		.attr('transform', d => `translate(0, ${d.rank * FONT_SIZE * 1.5})`);

	const sel = svg.select(`.row-${index}`);
	const tableBrews = svg.select('.table__brews');

	if (sel.empty()) {
		tableBrews.classed('is-visible', false);
	} else {
		const off = -FONT_SIZE;
		sel
			.classed('is-connected', true)
			.transition()
			.attr('transform', d => `translate(${off}, ${d.rank * FONT_SIZE * 1.5})`);
		updateBrewList({ breweryNames, rank });
	}
}

function handleRowExit({ index }) {
	const sel = svg.select(`.row-${index}`);
	const tableBrews = svg.select('.table__brews');

	sel
		.classed('is-connected', false)
		.transition()
		.attr('transform', d => `translate(0, ${d.rank * FONT_SIZE * 1.5})`);

	tableBrews.classed('is-visible', false);
}

function handleVoronoiEnter(data) {
	const plot = svg.select('.g-cities-plot');
	const sel = plot.select(`.city-${data.index}`);

	plot
		.selectAll('.city')
		.classed('is-faded', true)
		.classed('is-active', false);

	sel.classed('is-active', true).raise();

	const tooltip = svg.select('.g-tooltip');
	tooltip.selectAll('.tooltip__text').text(`${data.city}, ${data.stateAbbr}`);
	tooltip.selectAll('.tooltip__quality').text(`rating: ${data.grade}`);
	tooltip.selectAll('.tooltip__quantity').text(`breweries: ${data.count}`);

	const x = cityScale.quantity(data.count);
	const y = cityScale.quality(data.score);
	const r = cityScale.rank(data.rank);
	// const off = r < 4 ? -FONT_SIZE * 3.2 - r : r + FONT_SIZE
	const translate = `translate(${x}, ${y})`;
	const rotation = `rotate(${cityScale.angle})`;
	tooltip
		.attr('transform', `${translate} ${rotation}`)
		.classed('is-visible', true);
}

function handleVoronoiExit(data) {
	const plot = svg.select('.g-cities-plot');
	const sel = plot.select(`.city-${data.index}`);

	plot.selectAll('.city').classed('is-faded', false);

	const tooltip = svg.select('.g-tooltip');
	sel.classed('is-active', false);

	tooltip.classed('is-visible', false);
}

function handleToggle() {
	const sel = d3.select(this);
	const table = sel.text() === 'Table';
	d3
		.select(this.parentNode)
		.selectAll('li')
		.classed('is-selected', false);

	sel.classed('is-selected', true);

	svg.select('.g-table').classed('is-hidden', !table);
	svg.select('.table__title').classed('is-hidden', !table);
	svg.select('.g-cities').classed('is-hidden', table);
	svg.select('.target').classed('is-hidden', table);
}

function updateCity() {
	const g = svg.select('.g-cities');
	const plot = g.select('.g-cities-plot');

	let city = plot.selectAll('.city').data(userRank, d => d.index);

	const cityEnter = city
		.enter()
		.append('g')
		.attr('class', d => `city city-${d.index}`);

	cityEnter
		.append('circle')
		.attr('cx', 0)
		.attr('cy', 0)
		.attr('r', 0);

	const cityExit = city.exit();

	cityExit.remove();

	city = cityEnter.merge(city);

	city
		.select('circle')
		.attr('r', d => cityScale.rank(d.rank))
		.style('fill', d => cityScale.fill(d.rank))
		.style('stroke', d => d3.color(cityScale.fill(d.rank)).darker(0.6));

	// table data
	const table = svg.select('.g-table');
	const tableRows = table.select('.table__rows');
	const tableTitle = svg.select('.table__title');

	let row = tableRows
		.selectAll('.row')
		.data(userRank.slice(0, maxTableRows), d => d.index);

	row.each(d => (d.newbie = false));

	const rowEnter = row
		.enter()
		.append('g')
		.attr('class', d => `row row-${d.index}`)
		.attr('transform', `translate(0, ${height})`)
		.each(d => (d.newbie = true));

	rowEnter.append('text').style('font-size', FONT_SIZE);

	rowEnter
		.append('rect')
		.attr('x', 0)
		.attr('y', -FONT_SIZE * 1.25)
		.attr('height', FONT_SIZE * 1.5)
		.on('mouseenter', d => {
			if (full) {
				handleRowEnter(d);
				handleVoronoiEnter(d);
			}
		})
		.on('mouseout', d => {
			handleRowExit(d);
			handleVoronoiExit(d);
		});

	const rowExit = row.exit();

	rowExit
		.transition()
		.style('opacity', 0)
		.attr('transform', `translate(${width / 4}, ${height / 2})`)
		.remove();

	row = rowEnter.merge(row);

	const offsetChart = full
		? width * 0.5 - chartSize - MARGIN * 3
		: width * 0.5 - chartSize / 2;
	const offsetTable = full ? width * 0.5 + MARGIN * 2 : 0;

	const y1 = cityScale.quality.range()[0];
	const offsetY = chartSize - y1 + MARGIN * 3;
	const translate = `translate(${offsetChart + chartSize / 2}, ${offsetY})`;
	const rotation = `rotate(${-cityScale.angle} 0 ${y1})`;
	const transform = `${translate} ${rotation}`;

	g.attr('transform', transform);

	svg
		.select('.target')
		.attr(
			'transform',
			`translate(${offsetChart + chartSize / 2},${MARGIN * 3})`
		);

	city.attr('transform', d => {
		const x = cityScale.quantity(d.count);
		const y = cityScale.quality(d.score);
		return `translate(${x}, ${y})`;
	});

	g
		.select('.axis--x line')
		.attr('x1', 0)
		.attr('y1', 0)
		.attr('x2', cityScale.quantity.range()[1] / 1)
		.attr('y2', 0);

	g
		.select('.axis--y line')
		.attr('x1', 0)
		.attr('y1', 0)
		.attr('x2', -cityScale.quality.range()[0] / 1)
		.attr('y2', 0);

	g
		.select('.axis--y')
		.attr('transform', `translate(${-MARGIN},${y1}) rotate(90)`);

	g.select('.axis--x').attr('transform', `translate(0,${y1 + MARGIN})`);

	// const factor = full ? 0.57 : 0
	// const tableXOff = full ? width - TABLE_WIDTH - BREWS_WIDTH : 0
	table.attr('transform', `translate(${offsetTable}, ${MARGIN * 3})`);
	tableTitle.attr('transform', `translate(${offsetTable}, ${MARGIN * 3})`);
	// update table rows
	const t = d3
		.transition()
		.duration(200)
		.ease(d3.easeLinear);

	row
		.transition()
		.duration((d, i, nodes) => {
			// const multi = d.newbie ? 3 : 1
			// return 200 * multi
			const [x, y] = getTranslation(d3.select(nodes[i]).attr('transform'));
			const goal = Math.min(d.rank * FONT_SIZE * 1.5, 1000);
			return goal < FONT_SIZE ? 20 : 100 + (y - goal) * 2;
		})
		.delay(d => d.rank * 30)
		.ease(d3.easeLinear)
		.attr('transform', d => `translate(0, ${d.rank * FONT_SIZE * 1.5})`)
		.style('opacity', 1);

	row
		.select('text')
		.text(d => `${d3.format('0>2')(d.rank + 1)}. ${d.city}, ${d.stateAbbr}`)
		.style('fill', d => cityScale.fill(d.rank))
		.each(function() {
			const w = this.getBoundingClientRect().width;
			const sel = d3.select(this.parentNode);
			sel.select('rect').attr('width', w);
		});

	const path = svg
		.select('.g-voronoi')
		.selectAll('path')
		.data(voronoi.polygons(userRank));

	const pathEnter = path.enter().append('path');
	const pathMerge = path.merge(pathEnter);

	pathMerge
		.attr('d', d => (d ? `M${  d.join('L')  }Z` : null))
		.on('mouseenter', d => {
			handleVoronoiEnter(d.data);
			if (full) handleRowEnter(d.data);
		})
		.on('mouseout', d => {
			handleVoronoiExit(d.data);
			if (full) handleRowExit(d.data);
		});
}

function updateDimensions() {
	const el = graphic.select('.explore__filter');
	const h = el.node().getBoundingClientRect().height;
	viewportHeight = Math.floor(window.innerHeight - h * 1.5);
	width = chart.node().offsetWidth - MARGIN * 2;
	height = full ? viewportHeight - MARGIN * 2 : viewportHeight + h * 0.5;

	full = body.classed('is-full');
}

function resize() {
	updateDimensions();

	if (ready) {
		svg.attr('width', width + MARGIN * 2).attr('height', height + MARGIN * 2);

		svg
			.select('.g-graphic')
			.attr('transform', `translate(${MARGIN}, ${MARGIN})`);

		maxTableRows = Math.floor((height / (FONT_SIZE * 1.5) - 5) / 5) * 5;

		updateCityScale();
		updateCity();

		if (full) svg.selectAll('.is-hidden').classed('is-hidden', false);
		else {
			svg.select('.g-table').classed('is-hidden', true);
			svg.select('.table__title').classed('is-hidden', true);
			svg.select('.g-cities').classed('is-hidden', false);
			svg.select('.target').classed('is-hidden', false);
			graphic
				.selectAll('.explore__toggle li')
				.classed('is-selected', (d, i) => i === 0);
		}
	}
}

function getHypotenuse({ x, y }) {
	const x2 = x * x;
	const y2 = y * y;
	return Math.sqrt(x2 + y2);
}

function updateCityScale() {
	const hypotenuse = getHypotenuse({ x: balance.quantity, y: balance.quality });
	const factor = full ? 5 : 0;
	const div = full ? 2 : 1.2;
	chartSize = Math.min(width / div, height) - MARGIN * factor;
	const x = balance.quantity / hypotenuse * chartSize;
	const y = balance.quality / hypotenuse * chartSize;
	cityScale.quality.domain(d3.extent(userRank, d => d.score)).range([y, 0]);

	cityScale.quantity.domain(d3.extent(userRank, d => d.count)).range([0, x]);

	cityScale.rank.domain(d3.extent(userRank, d => d.rank)).range([16, 2]);

	cityScale.fill.domain(userRank.map(d => d.rank)).range(COLORS);

	const rad = Math.acos(balance.quantity / hypotenuse);
	cityScale.angle = 90 - rad * 180 / Math.PI;

	voronoi
		.x(d => cityScale.quantity(d.count))
		.y(d => cityScale.quality(d.score))
		.extent([[-MARGIN, -MARGIN], [x + MARGIN, y + MARGIN]]);
}

function setupChart() {
	const g = svg.append('g').attr('class', 'g-graphic');

	g.append('line').attr('class', 'connector');

	const target = g.append('g').attr('class', 'target');

	const cities = g.append('g').attr('class', 'g-cities');

	cities.append('g').attr('class', 'g-cities-plot');

	g
		.append('text')
		.attr('class', 'table__title')
		.attr('alignment-baseline', 'baseline')
		.attr('y', -FONT_SIZE * 1.75)
		.text('Best cities');

	const table = g.append('g').attr('class', 'g-table');

	const axis = cities.append('g').attr('class', 'cities-axis');

	const tooltip = cities.append('g').attr('class', 'g-tooltip');

	const anchor = 'middle';

	tooltip
		.append('text')
		.attr('class', 'tooltip__text shadow')
		.attr('text-anchor', anchor)
		.attr('alignment-baseline', 'middle');

	tooltip
		.append('text')
		.attr('class', 'tooltip__text')
		.attr('text-anchor', anchor)
		.attr('alignment-baseline', 'middle');

	tooltip
		.append('text')
		.attr('class', 'tooltip__quality shadow')
		.attr('text-anchor', anchor)
		.attr('alignment-baseline', 'middle')
		.attr('y', FONT_SIZE * 1.2);

	tooltip
		.append('text')
		.attr('class', 'tooltip__quality')
		.attr('text-anchor', anchor)
		.attr('alignment-baseline', 'middle')
		.attr('y', FONT_SIZE * 1.2);

	tooltip
		.append('text')
		.attr('class', 'tooltip__quantity shadow')
		.attr('text-anchor', anchor)
		.attr('alignment-baseline', 'middle')
		.attr('y', FONT_SIZE * 2.4);

	tooltip
		.append('text')
		.attr('class', 'tooltip__quantity')
		.attr('text-anchor', anchor)
		.attr('alignment-baseline', 'middle')
		.attr('y', FONT_SIZE * 2.4);

	cities.append('g').attr('class', 'g-voronoi');

	target
		.append('circle')
		.attr('cx', 0)
		.attr('cy', 0)
		.attr('r', 3);

	const text = target.append('text');

	text
		.append('tspan')
		.attr('text-anchor', 'middle')
		.attr('x', 0)
		.attr('y', -FONT_SIZE * 2.75)
		.text('Closer to here');

	text
		.append('tspan')
		.attr('text-anchor', 'middle')
		.attr('x', 0)
		.attr('y', -FONT_SIZE * 1.5)
		.text('the better');

	const axisX = axis.append('g').attr('class', 'axis--x');

	axisX
		.append('text')
		.html('Quantity &rarr;')
		.attr('text-anchor', 'start')
		.attr('alignment-baseline', 'hanging')
		.attr('y', FONT_SIZE / 2);

	axisX.append('line');

	const axisY = axis.append('g').attr('class', 'axis--y');

	axisY
		.append('text')
		.html('&larr; Quality')
		.attr('text-anchor', 'end')
		.attr('alignment-baseline', 'hanging')
		.attr('y', FONT_SIZE / 2);

	axisY.append('line');

	const brews = table.append('g').attr('class', 'table__brews');

	table.append('g').attr('class', 'table__rows');

	brews
		.append('text')
		.style('font-size', FONT_SIZE)
		.attr('class', 'brews__label')
		.text('Top breweries');

	brews
		.append('line')
		.attr('x1', -TABLE_WIDTH)
		.attr('y1', FONT_SIZE * 0.25)
		.attr('x2', -FONT_SIZE * 0.5)
		.attr('y2', FONT_SIZE * 0.25);

	brews
		.append('line')
		.attr('x1', -FONT_SIZE * 0.5)
		.attr('y1', -FONT_SIZE * 1.25)
		.attr('x2', -FONT_SIZE * 0.5)
		.attr('y2', FONT_SIZE * 0.25);

	brews
		.append('line')
		.attr('x1', -FONT_SIZE * 0.5)
		.attr('y1', -FONT_SIZE * 1.25)
		.attr('x2', TABLE_WIDTH * 0.67)
		.attr('y2', -FONT_SIZE * 1.25);
}

function setupSlider() {
	const slider = graphic.select('.explore__slider');

	noUiSlider.create(slider.node(), {
		start: 20,
		connect: [true, false],
		step: 1,
		range: { min: 0, max: 100 }
	});

	slider.node().noUiSlider.on('update', function slide() {
		balance.quantity = +this.get();
		balance.quality = 100 - balance.quantity;
		userRank = Rank.weight({ data: rawUserRank, balance }).slice(0, 100);
		graphic.select('.result__quality').text(`${balance.quality}%`);
		graphic.select('.result__quantity').text(`${balance.quantity}%`);
		updateCityScale();
		updateCity();
		if (full) handleRowExit({ index: userRank[0].index });
		handleVoronoiExit(rawUserRank[0]);
	});
}

function setupDropdowns() {
	const select = graphic.selectAll('select');
	select.on('change', () => {
		const params = {};
		select.each(function() {
			const col = d3.select(this).attr('data-col');
			const val = this.value;
			params[col] = val;
		});
		const { nearby, dist, abv } = params;
		rawUserRank = Rank.init({ cityData, breweryData, nearby, dist, abv });
		// TODO get previous balance
		userRank = Rank.weight({ data: rawUserRank, balance }).slice(0, 100);
		updateCityScale();
		updateCity();
		Tracker.send({ category: 'explore', action: 'filter', once: true });
	});
}

function setupToggle() {
	graphic.selectAll('.explore__toggle li').on('click', handleToggle);
}

function instructions() {
	if (full) handleRowEnter(userRank[0]);
	handleVoronoiEnter(userRank[0]);
}

function setup() {
	updateDimensions();
	setupChart();
	setupSlider();
	setupDropdowns();
	setupToggle();
	ready = true;
	resize();
	updateCityScale();
	updateCity();
	instructions();
}

function init(data) {
	breweryData = data.breweryData;
	cityData = data.cityData;
	rawUserRank = Rank.init({ cityData, breweryData, max: 50 });
	userRank = Rank.weight({ data: rawUserRank, balance });
	setup();
}

export default { init, resize };
