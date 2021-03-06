'use strict';

export default function(Chart) {

	Chart.defaults.global.plugins.streaming = {
		duration: 10000,
		refresh: 1000,
		delay: 0,
		frameRate: 30,
		onRefresh: null
	};

	var realTimeScale = Chart.scaleService.getScaleConstructor('realtime');

	function removeOldData(scale, lower, data, datasetIndex) {
		var i, ilen;

		for (i = 2, ilen = data.length; i < ilen; ++i) {
			if (!(scale.getPixelForValue(null, i, datasetIndex) <= lower)) {
				break;
			}
		}
		// Keep the last two data points outside the range not to affect the existing bezier curve
		data.splice(0, i - 2);
		if (typeof data[0] !== 'object') {
			return i - 2;
		}
	}

	function onRefresh(chart) {
		var streamingOpts = chart.options.plugins.streaming;
		var meta, scale, numToRemove;

		if (streamingOpts.onRefresh) {
			streamingOpts.onRefresh(chart);
		}

		// Remove old data
		chart.data.datasets.forEach(function(dataset, datasetIndex) {
			meta = chart.getDatasetMeta(datasetIndex);
			if (meta.xAxisID) {
				scale = meta.controller.getScaleForId(meta.xAxisID);
				if (scale instanceof realTimeScale) {
					numToRemove = removeOldData(scale, scale.left, dataset.data, datasetIndex);
				}
			}
			if (meta.yAxisID) {
				scale = meta.controller.getScaleForId(meta.yAxisID);
				if (scale instanceof realTimeScale) {
					numToRemove = removeOldData(scale, scale.top, dataset.data, datasetIndex);
				}
			}
		});
		if (numToRemove) {
			chart.data.labels.splice(0, numToRemove);
		}

		// Buffer any update calls so that renders do not occur
		chart._bufferedRender = true;
		chart.update();
		chart._bufferedRender = false;
		chart._bufferedRequest = null;
	}

	return {
		id: 'streaming',

		afterInit: function(chart, options) {
			chart.refreshTimerID = setInterval(function() {
				onRefresh(chart);
			}, options.refresh);
		},

		beforeUpdate: function(chart, options) {
			var chartOpts = chart.options;
			var scalesOpts = chartOpts.scales;
			var realtimeOpts;

			if (scalesOpts) {
				scalesOpts.xAxes.concat(scalesOpts.yAxes).forEach(function(scaleOpts) {
					if (scaleOpts.type === 'realtime' || scaleOpts.type === 'time') {
						realtimeOpts = scaleOpts.realtime;

						// For backwards compatibility
						if (!realtimeOpts) {
							realtimeOpts = scaleOpts.realtime = {};
						}

						// Copy plugin options to scale options
						realtimeOpts.duration = options.duration;
						realtimeOpts.refresh = options.refresh;
						realtimeOpts.delay = options.delay;
						realtimeOpts.frameRate = options.frameRate;
						realtimeOpts.onRefresh = onRefresh;

						// Keep Bézier control inside the chart
						chartOpts.elements.line.capBezierPoints = false;
					}
				});
			}
			return true;
		},

		beforeDraw: function(chart) {
			// Dispach mouse event for scroll
			var event = chart.lastMouseMoveEvent;
			if (event) {
				if (typeof MouseEvent === 'function') {
					chart.canvas.dispatchEvent(event);
				} else {
					var newEvent = document.createEvent('MouseEvents');
					newEvent.initMouseEvent(
						event.type, event.bubbles, event.cancelable, event.view, event.detail,
						event.screenX, event.screenY, event.clientX, event.clientY, event.ctrlKey,
						event.altKey, event.shiftKey, event.metaKey, event.button, event.relatedTarget
					);
					chart.canvas.dispatchEvent(newEvent);
				}
			}
			return true;
		},

		beforeEvent: function(chart, event) {
			if (event.type === 'mousemove') {
				// Save mousemove event for reuse
				chart.lastMouseMoveEvent = event.native;
			} else if (event.type === 'mouseout') {
				// Remove mousemove event
				delete chart.lastMouseMoveEvent;
			}
			return true;
		},

		destroy: function(chart) {
			var refreshTimerID = chart.refreshTimerID;

			if (refreshTimerID) {
				clearInterval(refreshTimerID);
			}
			Chart.helpers.each(chart.scales, function(scale) {
				if (scale instanceof realTimeScale) {
					scale.destroy();
				}
			});
		}
	};
}
