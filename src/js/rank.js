const PER_CITY = 1;

const abvValues = {
	all: [0, 100],
	light: [0, 4],
	medium: [4, 7],
	heavy: [7, 100]
};

function tallyScore(breweries) {
	const total = d3.sum(breweries, d => d.beers.score);
	const reviews = d3.sum(breweries, d => d.beers.reviews);
	return total / reviews;
}

function compactCities(cities, dist, cityIndex) {
	const withIndex = cities.map(d => d);
	if (typeof cityIndex === 'number') {
		withIndex.unshift({ index: cityIndex, dist: 0 });
	}
	return withIndex.filter(c => c.dist <= dist).map(c => c.index);
}

function compactBeers(beers, abv) {
	const filtered = beers.filter(
		b => b.abv >= abvValues[abv][0] && b.abv < abvValues[abv][1]
	);
	if (filtered.length) {
		const score = d3.sum(filtered, b => b.score * b.reviews);
		const reviews = d3.sum(filtered, b => b.reviews);
		return { score, reviews };
	}
	return null;
}

function getTopBreweries(c, breweries) {
	return breweries
		.map(d => ({
			score: d.beers.score / d.beers.reviews,
			name: d.name
		}))
		.sort((a, b) => d3.descending(a.score, b.score))
		.slice(0, 5)
		.map(d => d.name);
}

function computeScore({ cityReduced, breweryReduced, nearby }) {
	const withScore = cityReduced
		.map(d => {
			const breweries = breweryReduced.filter(b => b.cities.includes(d.index));
			const count = breweries.length;
			const score = tallyScore(breweries);
			const breweryCoords = breweries.map(b => ({ lat: b.lat, lng: b.lng }));
			const breweryNames = getTopBreweries(d.city, breweries);
			return { ...d, score, count, breweryCoords, breweryNames };
		})
		.filter(d => d.count >= nearby);

	return withScore;
}

function weight({ data, balance }) {
	const extentScore = d3.extent(data, d => d.score);
	const scaleScore = d3
		.scaleLinear()
		.domain(extentScore)
		.range([0, balance.quality]);

	// linear
	const scaleCount = d3
		.scaleLinear()
		.domain(d3.extent(data, d => d.count))
		.range([0, balance.quantity]);

	const scaleGrade = d3
		.scaleQuantize()
		.domain(d3.extent(data, d => d.score))
		.range(['C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+']);

	const withWeight = data.map(d => ({
		...d,
		grade: scaleGrade(d.score),
		weighted: scaleScore(d.score) + scaleCount(d.count)
	}));

	const withRank = withWeight
		.sort(
			(a, b) =>
				d3.descending(a.weighted, b.weighted) ||
				d3.descending(a.score, b.score) ||
				d3.descending(a.count, b.count)
		)
		.map((d, i) => ({ ...d, rank: i }));

	return withRank;
}

function init({
	cityData,
	breweryData,
	dist = 20,
	abv = 'all',
	nearby = 5,
	max = 1000
}) {
	// console.time('rank')
	const breweryReduced = breweryData
		.map(brewery => ({
			...brewery,
			cities: compactCities(brewery.cities, dist, brewery.cityIndex).slice(
				0,
				PER_CITY
			),
			beers: compactBeers(brewery.beers, abv)
		}))
		.filter(d => d.beers && d.cities.length);
	const cityIndices = [];
	breweryReduced.forEach(brewery => {
		brewery.cities.forEach(c => (cityIndices[c] = true));
	});

	const cityReduced = cityData.filter(d => cityIndices[d.index]);

	const cityRanked = computeScore({ cityReduced, breweryReduced, nearby });
	// console.timeEnd('rank')
	return cityRanked.slice(0, max);
}

export default { init, weight };
