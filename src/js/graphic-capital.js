import * as topojson from 'topojson';
import scrollama from 'scrollama';
import Rank from './rank';
import Tracker from './utils/tracker';

let full = true;

const COLORS = [
	'#dbcdbd',
	'#e8b8a0',
	'#f2a385',
	'#f88d69',
	'#fc764f',
	'#fe5c34',
	'#ff3814'
].reverse();

const body = d3.select('body');
const chart = d3.select('.capital__chart');
const prose = d3.select('.capital__prose');
const svg = chart.select('svg');

const MARGIN = 20;
const MAX_ZOOM = 7;
const CITY_FONT_SIZE = 12;
const DOT_RADIUS = 3;

const scroller = scrollama();

let width = 0;
let height = 0;
let viewportHeight = 0;
let mobileFactor = 1;

let usaData = null;
let breweryData = null;
let cityData = null;

let statesFeature = null;
let editorialRank = null;
let customCity = { lat: 42, lng: -72 };
let bestCity = null;
// const proseScenes = []
// let enterExitScene = null

const balance = { quality: 80, quantity: 20 };

const cityScale = {
	rank: d3.scaleLinear(),
	fill: d3.scaleQuantile(),
	angle: 0
};

const projection = d3.geoAlbersUsa().scale(1);
const path = d3.geoPath();
const zoom = d3.zoom().scaleExtent([1, MAX_ZOOM]);

function createCompareString({ city, state }) {
	const a = city.toLowerCase().replace(/\W/g, '');
	const b = state.toLowerCase().replace(/\W/g, '');
	return `${a}${b}`;
}

function prefix(number) {
	const str = number.toString();
	// teen
	if (number > 10 && number < 20) return `${number}th`;
	else if (str.endsWith('1')) return `${number}st`;
	else if (str.endsWith('2')) return `${number}nd`;
	else if (str.endsWith('3')) return `${number}rd`;

	return `${number}th`;
}
// ZOOM
function handleZoom() {
	const ratio = 1 / d3.event.transform.k;
	const fontSize = ratio * CITY_FONT_SIZE;

	const map = svg.select('.g-map').attr('transform', d3.event.transform);

	map.selectAll('path').style('stroke-width', `${ratio}px`);

	map
		.selectAll('.locator-text')
		.style('font-size', `${fontSize}px`)
		.attr('x', ratio * DOT_RADIUS * 2);

	map
		.selectAll('.locator-circle')
		.attr('r', ratio * DOT_RADIUS)
		.attr('cy', ratio * -DOT_RADIUS / 2)
		.style('stroke-width', `${ratio}px`);
}

function handleZoomEnd() {}

function resetZoom(duration = 500) {
	svg
		.transition()
		.duration(duration)
		.call(zoom.transform, d3.zoomIdentity);

	chart
		.select('.map-states')
		.transition()
		.duration(duration)
		.style('opacity', 0.5);
}

function startZoom({ city, down, zoomScale }) {
	chart
		.transition()
		.duration(250)
		.style('opacity', 1);

	const [x, y] = projection([city.lng, city.lat]);
	const duration = down ? 3500 : 500;
	const ease = down ? d3.easeCubicInOut : d3.easeLinear;

	const translateX = width / 2 - zoomScale * x;
	const translateY = height / 2 - zoomScale * y;

	const zoomTransform = d3.zoomIdentity
		.translate(translateX, translateY)
		.scale(zoomScale);

	svg
		.transition()
		.duration(duration)
		.ease(ease)
		.call(zoom.transform, zoomTransform);
}

function findNearestCity(cities) {
	const index = d3.scan(cities, (a, b) => {
		const i =
			Math.abs(a.lat - customCity.lat) + Math.abs(a.lng - customCity.lng);
		const j =
			Math.abs(b.lat - customCity.lat) + Math.abs(b.lng - customCity.lng);
		return i - j;
	});

	if (index > -1) return cities[index];
	return null;
}

function getAnswerText({ editorialMatch, exactMatch }) {
	if (customCity.origin === 'US') {
		if (editorialMatch && exactMatch) {
			const a = editorialMatch.rank < 10 ? 'Almost!' : 'Not quite.';
			return `<strong>${a}</strong> After`;
		} else if (exactMatch) {
			const a = exactMatch.rank < 10 ? 'Almost!' : 'Not quite.';
			return `<strong>${a}</strong> After`;
		}
		return '<strong>Nope.</strong> It doesn’t even make the list. But after';
	}

	return 'You might think our biggest city, New York City, is the best, but not quite. After';
}

function getNearbyText({ exactMatch, nearestMatch }) {
	if (exactMatch) return exactMatch.city;
	return `nearby ${nearestMatch.city}, ${nearestMatch.state}`;
}

function getRankText({ editorialMatch, nearestMatch, nearbyText }) {
	if (editorialMatch) {
		return `${nearbyText} comes in ${prefix(
			editorialMatch.rank + 1
		)} out of the 800+ biggest cities in the country.`;
	}
	return `${nearbyText} comes in ${prefix(
		nearestMatch.rank + 1
	)} out of the 800+ biggest cities in the country.`;
}

function customize() {
	const all = Rank.init({ cityData, breweryData, dist: 50, nearby: 1 });
	const allRank = Rank.weight({ data: all, balance });
	const name = createCompareString(customCity);
	const exactMatch = allRank.find(d => createCompareString(d) === name);
	const nearestMatch = exactMatch || findNearestCity(allRank);
	const editorialMatch = editorialRank.find(
		d => d.index === nearestMatch.index
	);

	if (nearestMatch.index === bestCity.index) {
		prose.select('.text--match-best').classed('is-visible', true);
		prose.select('.prose__step').remove();
	} else {
		const best = prose.select('.text--best');
		best.classed('is-visible', true);
		best.select('.place').text(`${bestCity.city}, ${bestCity.state}`);

		const local = prose.select('.text--local');
		local.classed('is-visible', true);

		const analysisText = ' analyzing over 1,600 breweries, ';
		const answerText = getAnswerText({
			editorialMatch,
			exactMatch,
			nearestMatch
		});
		const nearbyText = getNearbyText({
			editorialMatch,
			exactMatch,
			nearestMatch
		});
		const rankText = getRankText({
			editorialMatch,
			exactMatch,
			nearestMatch,
			nearbyText
		});

		const output = `
			${answerText}
			${analysisText}
			${rankText}
		`;
		local.html(output);
	}

	// make custom have nearest data
	customCity.lat = nearestMatch.lat;
	customCity.lng = nearestMatch.lng;
	customCity.city = nearestMatch.city;

	svg.select('.map-custom text').text(customCity.city);

	svg.select('.map-best text').text(bestCity.city);

	resize();
}

function updateCity(enter) {
	const container = svg.select('.cities-container');

	let city = container.selectAll('.city').data(editorialRank, d => d.index);

	const cityEnter = city
		.enter()
		.append('g')
		.attr('class', 'city')
		.attr('transform', d => {
			const [x, y] = projection([d.lng, d.lat]);
			return `translate(${x}, ${y})`;
		});

	cityEnter
		.append('circle')
		.attr('cx', 0)
		.attr('cy', 0)
		.attr('r', 0)
		.style('fill', d => cityScale.fill(d.rank))
		.style('stroke', d => d3.color(cityScale.fill(d.rank)).darker(0.6));
	// .on('mouseenter', function() {
	// 	d3.select(this.parentNode)
	// 		.raise()
	// 		.selectAll('text')
	// 		.style('opacity', 1)
	// 		.style('display', 'block')
	// })
	// .on('mouseout', function(d) {
	// 	const sel = d3.select(this.parentNode)
	// 	if (d.rank >= 10) {
	// 		sel.lower()
	// 		sel.selectAll('text').style('display', 'none')
	// 	}
	// })

	cityEnter
		.append('text')
		.attr('class', 'text--bg')
		.attr('text-anchor', 'middle')
		.attr('y', d => -cityScale.rank(d.rank) - CITY_FONT_SIZE / 4)
		.style('display', d => (d.rank < 10 ? 'block' : 'none'))
		.text(d => `#${d.rank + 1} ${d.city}`);

	cityEnter
		.append('text')
		.attr('class', 'text--fg')
		.attr('text-anchor', 'middle')
		.attr('y', d => -cityScale.rank(d.rank) - CITY_FONT_SIZE / 4)
		.style('display', d => (d.rank < 10 ? 'block' : 'none'))
		.text(d => `#${d.rank + 1} ${d.city}`);

	city = cityEnter.merge(city);

	city
		.select('circle')
		.transition()
		.duration(3000)
		.delay(d => d.rank * (enter ? 60 : 20))
		.attr('r', d => (enter ? cityScale.rank(d.rank) * mobileFactor : 0));

	city
		.selectAll('text')
		.transition()
		.duration(enter ? 3000 : 1000)
		.delay(d => d.rank * (enter ? 80 : 20))
		.style('opacity', d => (enter ? 1 : 0));

	container.transition().attr('transform', 'translate(0,0) rotate(0)');

	city.transition().attr('transform', d => {
		const [x, y] = projection([d.lng, d.lat]);
		return `translate(${x}, ${y})`;
	});
}

function updateDimensions() {
	viewportHeight = window.innerHeight;
	width = chart.node().offsetWidth - MARGIN * 2;
	height = viewportHeight - MARGIN * 2;

	full = body.classed('is-full');
	mobileFactor = full ? 1 : 0.5;
}

function resize() {
	updateDimensions();

	svg.attr('width', width + MARGIN * 2).attr('height', height + MARGIN * 2);

	svg.select('.g-graphic').attr('transform', `translate(${MARGIN}, ${MARGIN})`);

	projection.fitSize([width, height], statesFeature);

	path.projection(projection);

	svg.select('.state__border').attr('d', path);

	svg.select('.map-custom').attr('transform', () => {
		const [x, y] = projection([customCity.lng, customCity.lat]);
		return `translate(${x}, ${y})`;
	});

	svg.select('.map-best').attr('transform', () => {
		const [x, y] = projection([bestCity.lng, bestCity.lat]);
		return `translate(${x}, ${y})`;
	});

	if (!full) {
		d3
			.selectAll('.prose__step')
			.style('height', `${Math.floor(viewportHeight * 0.9)}px`);
		d3
			.select('.prose__step:last-child')
			.style('height', `${Math.floor(viewportHeight * 0.6)}px`);
	}

	scroller.resize();
	// // update ScrollMagic
	// proseScenes.forEach(({ el, scene }) => {
	// 	scene.duration(el.offsetHeight)
	// 	scene.refresh()
	// })

	// if (enterExitScene) {
	// 	const proseEl = d3.select('.capital__prose').node()
	// 	enterExitScene.duration(proseEl.offsetHeight - viewportHeight)
	// 	enterExitScene.refresh()
	// }
}

function setupMap() {
	statesFeature = topojson.feature(usaData, usaData.objects.states);

	const g = svg.append('g').attr('class', 'g-graphic');

	const map = g.append('g').attr('class', 'g-map');

	const states = map.append('g').attr('class', 'map-states');

	states
		.append('path')
		.datum(topojson.mesh(usaData, usaData.objects.states))
		.attr('class', 'state__border');

	const cities = map.append('g').attr('class', 'map-cities');

	cities.append('g').attr('class', 'cities-container');

	const mapCustom = map.append('g').attr('class', 'map-custom');

	mapCustom
		.append('circle')
		.attr('class', 'locator-circle')
		.attr('cx', 0)
		.attr('cy', -DOT_RADIUS / 2)
		.attr('r', DOT_RADIUS);

	mapCustom
		.append('text')
		.attr('alignment-baseline', 'middle')
		.attr('class', 'locator-text')
		.attr('y', 0)
		.attr('x', DOT_RADIUS * 2);

	const mapBest = map.append('g').attr('class', 'map-best');

	mapBest
		.append('circle')
		.attr('class', 'locator-circle')
		.attr('cx', 0)
		.attr('cy', -DOT_RADIUS / 2)
		.attr('r', DOT_RADIUS);

	mapBest
		.append('text')
		.attr('class', 'locator-text')
		.attr('alignment-baseline', 'middle')
		.attr('y', 0)
		.attr('x', DOT_RADIUS * 2);

	zoom.on('zoom', handleZoom).on('end', handleZoomEnd);
}

function fadeEl({ el, fadeIn, down }) {
	const opacity = fadeIn ? 1 : 0;
	const factor = fadeIn ? 1 : 2;
	const duration = down ? 3000 : 500;
	const t = d3.transition().duration(duration / factor);
	svg
		.select(el)
		.transition(t)
		.style('opacity', opacity);
}

function stepChart({ step, down }) {
	switch (step) {
	case 'local':
		startZoom({ city: customCity, zoomScale: MAX_ZOOM, down });
		fadeEl({ el: '.map-custom', fadeIn: true, down });
		fadeEl({ el: '.map-best', fadeIn: false, down });
		fadeEl({ el: '.map-cities', fadeIn: false, down });
		break;
	case 'best':
		startZoom({ city: bestCity, zoomScale: MAX_ZOOM, down });
		fadeEl({ el: '.map-custom', fadeIn: false, down });
		fadeEl({ el: '.map-best', fadeIn: true, down });
		fadeEl({ el: '.map-cities', fadeIn: false, down });
		break;
	case 'explanation':
		startZoom({ city: bestCity, zoomScale: Math.floor(MAX_ZOOM / 2), down });
		fadeEl({ el: '.map-custom', fadeIn: false, down });
		fadeEl({ el: '.map-best', fadeIn: false, down });
		fadeEl({ el: '.map-cities', fadeIn: false, down });
		updateCity(false);
		break;
	case 'everywhere':
		resetZoom(2000);
		fadeEl({ el: '.map-custom', fadeIn: false, down });
		fadeEl({ el: '.map-best', fadeIn: false, down });
		fadeEl({ el: '.map-cities', fadeIn: true, down });
		fadeEl({ el: '.map-states', fadeIn: true, down });
		updateCity(true);
		break;
	case 'rank':
		resetZoom();
		updateCity(false);
		fadeEl({ el: '.map-custom', fadeIn: false, down });
		fadeEl({ el: '.map-best', fadeIn: false, down });
		fadeEl({ el: '.map-cities', fadeIn: true, down });
		fadeEl({ el: '.map-states', fadeIn: false, down });
		break;
	default:
		resetZoom();
		fadeEl({ el: '.map-custom', fadeIn: false, down });
		fadeEl({ el: '.map-best', fadeIn: false, down });
		fadeEl({ el: '.map-cities', fadeIn: false, down });
		break;
	}
}

function setupScroll() {
	const prompt = d3.select('.intro__prompt');

	prompt.classed('is-reveal', true);

	d3
		.select('main')
		.classed('is-reveal', true)
		.style('height', 'auto');

	d3.select('.pudding-footer').classed('is-reveal', true);

	customize();

	// const controller = new ScrollMagic.Controller()
	scroller
		.setup({
			step: '.prose__step',
			container: '.capital__prose',
			graphic: '.capital__chart',
			offset: 0.33
		})
		.onStepEnter(({ element, direction }) => {
			const step = d3.select(element).attr('data-step');
			const down = direction === 'down';
			stepChart({ step, down });
			// console.log('enter', step)
		})
		.onStepExit(({ element, direction }) => {
			if (window.scrollY > 0) {
				const step = d3.select(element).attr('data-step');
				const down = direction === 'down';
				// stepChart({ step, down })
				if (
					customCity.city === 'Santa Rosa' &&
					customCity.state === 'California' &&
					step === 'best' &&
					!down
				) {
					stepChart({ step: 'default', down });
				}
				if (step === 'local' && !down) stepChart({ step: 'default', down });

				if (step === 'rank') stepChart({ step, down });
				// console.log('exit', step)
			}
		})
		.onContainerEnter(({ direction }) => {
			const bottom = direction === 'up';
			if (bottom) chart.classed('is-bottom', false);
			// console.log('container enter', direction)
		})
		.onContainerExit(({ direction }) => {
			if (window.scrollY > 0) {
				const bottom = direction === 'down';
				if (bottom) {
					chart.classed('is-bottom', true);
					Tracker.send({ category: 'prose', action: 'exit', once: true });
				}
				// console.log('container exit', direction)
			}
		});

	const scrollerPrompt = scrollama();
	scrollerPrompt
		.setup({
			step: '.capital__prose',
			offset: 0.95
		})
		.onStepEnter(() => {
			prompt.classed('is-reveal', false);
			scrollerPrompt.disable();
		});
	// const promptScene = new ScrollMagic.Scene({
	// 	triggerElement: proseEl,
	// 	triggerHook: 1,
	// })

	// promptScene
	// 	.on('enter', (event) => {
	// 		prompt.classed('is-reveal', false)
	// 		promptScene.destroy()
	// 		Tracker.send({ category: 'prose', action: 'enter', once: true })
	// 	})

	// promptScene.addTo(controller)
	// d3.selectAll('.prose__step').each(function() {
	// 	const el = this
	// 	const sel = d3.select(this)
	// 	const triggerHook = 0.66

	// 	const scene = new ScrollMagic.Scene({
	// 		triggerElement: el,
	// 		duration: el.offsetHeight,
	// 		triggerHook,
	// 	})

	// 	scene.on('enter', (event) => {
	// 		const step = sel.attr('data-step')
	// 		const down = event.scrollDirection === 'FORWARD'
	// 		stepChart({ step, down })
	// 	})
	// 	.on('leave', (event) => {
	// 		const step = sel.attr('data-step')
	// 		const down = event.scrollDirection === 'FORWARD'
	// 		if (customCity.city === 'Santa Rosa' && customCity.state === 'California' && step === 'best' && !down) stepChart({ step: 'default', down })
	// 		else if (step === 'local' && !down) stepChart({ step: 'default', down })
	// 	})
	// 	.addTo(controller)
	// 	proseScenes.push({ el, scene })
	// })

	// const proseEl = d3.select('.capital__prose').node()
	// // create a scene to toggle fixed position
	// enterExitScene = new ScrollMagic.Scene({
	// 	triggerElement: proseEl,
	// 	triggerHook: 0,
	// 	duration: proseEl.offsetHeight - viewportHeight,
	// })

	// enterExitScene
	// 	.on('enter', (event) => {
	// 		const bottom = event.scrollDirection === 'REVERSE'
	// 		if (bottom) chart.classed('is-bottom', false)
	// 	})
	// 	.on('leave', (event) => {
	// 		const bottom = event.scrollDirection === 'FORWARD'
	// 		if (bottom) {
	// 			chart.classed('is-bottom', true)
	// 			Tracker.send({ category: 'prose', action: 'exit', once: true })
	// 		}
	// 	})
	// enterExitScene.addTo(controller)

	// const promptScene = new ScrollMagic.Scene({
	// 	triggerElement: proseEl,
	// 	triggerHook: 1,
	// })

	// promptScene
	// 	.on('enter', (event) => {
	// 		prompt.classed('is-reveal', false)
	// 		promptScene.destroy()
	// 		Tracker.send({ category: 'prose', action: 'enter', once: true })
	// 	})

	// promptScene.addTo(controller)
}

function updateCityScale() {
	cityScale.rank.domain(d3.extent(editorialRank, d => d.rank)).range([16, 2]);

	cityScale.fill.domain(editorialRank.map(d => d.rank)).range(COLORS);
}

function setup() {
	updateDimensions();
	setupMap();
	updateCityScale();
	resize();
}

function hed({ city, region_name, country_code, latitude, longitude }) {
	const action = city
		? `${country_code} | ${region_name} | ${city}`
		: 'unavailable';
	Tracker.send({ category: 'custom location', action, once: true });
	let text = null;
	if (country_code === 'US' && city) {
		customCity = {
			city,
			lat: latitude,
			lng: longitude,
			state: region_name,
			origin: country_code
		};
		text = `Could ${customCity.city}, ${
			customCity.state
		}, really be the microbrew capital of the US?`;
	} else {
		customCity = {
			city: 'New York',
			lat: 40,
			lng: -72,
			state: 'New York',
			origin: null
		};
		text = 'But what city is the microbrew capital of the US?';
	}

	d3
		.select('.intro__hed span')
		.text(text)
		.classed('is-visible', true);
}

function init(data) {
	usaData = data.usaData;
	breweryData = data.breweryData;
	cityData = data.cityData;

	const top50 = Rank.init({ cityData, breweryData, max: 50 });
	editorialRank = Rank.weight({ data: top50, balance }).reverse();
	bestCity = editorialRank[49];
	setup();
}

export default { init, resize, setupScroll, hed };
