import Locate from './utils/locate';
import LoadData from './load-data';
import GraphicCapital from './graphic-capital';
import GraphicExplore from './graphic-explore';
import GraphicTrend from './graphic-trend';

const body = d3.select('body');
const ready = { location: false, loaded: false };

function resize() {
	GraphicCapital.resize();
	GraphicExplore.resize();
	GraphicTrend.resize();
}

function checkReady() {
	if (ready.location && ready.loaded) {
		GraphicCapital.setupScroll(ready.location);
		GraphicTrend.init();
	}
}

function setIntroHeight() {
	const mobile = body.classed('is-mobile');
	if (mobile) {
		const h = window.innerHeight;
		body.select('main').style('height', `${Math.floor(h * 1.05)}px`);
		body.select('.intro').style('height', `${h}px`);
	}
}

function init() {
	setIntroHeight();
	Locate('fd4d87f605681c0959c16d9164ab6a4a', (err, resp) => {
		const data = err ? {} : resp;
		ready.location = true;
		GraphicCapital.hed(data);
		checkReady();
	});

	LoadData.init()
		.then(data => {
			ready.loaded = true;
			const [usaData, breweryData, cityData] = [...data];
			GraphicCapital.init({ usaData, breweryData, cityData });
			GraphicExplore.init({ breweryData, cityData });
			checkReady();
		})
		.catch(err => console.log(err));
}

export default { init, resize };
