// D3 is included by globally by default
import debounce from 'lodash.debounce';
import isMobile from './utils/is-mobile';
import graphic from './graphic';
import { select, addClass, removeClass } from './utils/dom';

const bodySel = d3.select('body');
const bodyEl = select('body');
let previousWidth = 0;

function updateExperience() {
	if (window.matchMedia('(min-width: 800px)').matches)
		addClass(bodyEl, 'is-full');
	else removeClass(bodyEl, 'is-full');
}

function resize() {
	const width = bodySel.node().offsetWidth;
	if (previousWidth !== width) {
		previousWidth = width;
		updateExperience();
		graphic.resize();
	}
}

function init() {
	// add mobile class to body tag
	bodySel.classed('is-mobile', isMobile.any());
	updateExperience();
	// setup resize event
	window.addEventListener('resize', debounce(resize, 150));
	// kick off graphic code
	graphic.init();
}

init();
