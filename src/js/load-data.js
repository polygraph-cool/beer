import * as topojson from 'topojson';
import States from './states';

function findStateAbbr(str) {
	const lower = str.toLowerCase();
	const match = States.find(d => d.state.toLowerCase() === lower);
	return match ? match.abbr : '';
}

function loadUSA(cb) {
	d3.json('assets/usa.json', (err, data) => {
		if (data) {
			const justStates = data.objects.states.geometries.filter(d => d.id < 60);
			data.objects.states.geometries = justStates;
		}
		cb(err, data);
	});
}

function parseCities(cities) {
	return cities.split('|').map(city => {
		const split = city.split('-');
		return {
			index: +split[0],
			dist: +split[1]
		};
	});
}

function parseBeers(beers) {
	return beers.split('|').map(beer => {
		const split = beer.split('-');
		return {
			abv: +split[0],
			score: +split[1],
			reviews: +split[2]
		};
	});
}

function cleanName(name) {
	const max = 35;
	const split = name.split(/\(|\//);
	const first = split[0].substring(0, max);
	if (first.length > max - 3) {
		return `${first.substring(0, max - 3)}...`;
	}
	return first;
}

function cleanBrewery(d) {
	return {
		...d,
		lat: +d.lat,
		lng: +d.lng,
		year: +d.year,
		cities: parseCities(d.cities),
		beers: parseBeers(d.beers),
		cityIndex: d.cityIndex ? +d.cityIndex : null,
		name: cleanName(d.name)
	};
}

function loadBrewery(cb) {
	d3.csv(
		'assets/breweries_geocoded_with_stats.csv',
		cleanBrewery,
		(err, data) => {
			cb(err, data);
		}
	);
}

function cleanCities(d) {
	return {
		...d,
		lat: +d.lat,
		lng: +d.lng,
		population: +d.population,
		index: +d.index,
		stateAbbr: findStateAbbr(d.state)
	};
}

function loadCities(cb) {
	d3.csv('assets/cities_geocoded_40k.csv', cleanCities, (err, data) => {
		cb(err, data);
	});
}

function init() {
	return new Promise((resolve, reject) => {
		d3
			.queue()
			.defer(loadUSA)
			.defer(loadBrewery)
			.defer(loadCities)
			.awaitAll((err, result) => {
				if (err) {
					reject(err);
				} else {
					resolve(result);
				}
			});
	});
}

export default { init };
