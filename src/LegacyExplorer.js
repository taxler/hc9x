define(['Promise', './PiecemealDownloadManager'], function(Promise, PiecemealDownloadManager) {

	'use strict';

	function LegacyExplorer() {
	}
	LegacyExplorer.prototype = {
		open: function(source) {
			var self = this;
			return new Promise(function(resolve, reject) {
				var expeditions = LegacyExplorer.expeditions.slice();
				var byteSource;
				if (typeof source === 'string') {
					byteSource = new PiecemealDownloadManager(source);
				}
				else {
					byteSource = source;
				}
				function tryNextExpedition() {
					if (expeditions.length === 0) {
						return Promise.reject('No method found to handle this item');
					}
					var Expedition = expeditions.pop();
					var expedition = new Expedition(self, byteSource);
					return expedition.open().then(null, tryNextExpedition);
				}
				return tryNextExpedition().then(resolve, reject);
			});
		},
	};

	LegacyExplorer.expeditions = [];

	LegacyExplorer.registerExpedition = function(expedition) {
		LegacyExplorer.expeditions.push(expedition);
	};

	LegacyExplorer.OPEN = 'legacyexplorer_open';
	LegacyExplorer.FAILED_OPEN = 'legacyexplorer-failed-open';
	LegacyExplorer.failedOpenEvent = new Event(LegacyExplorer.FAILED_OPEN, {bubbles:true, cancelable:true});

	function ByteSourceWindow(byteSource, offset) {
		this.byteSource = byteSource;
		this.offset = offset;
	}
	ByteSourceWindow.prototype = {
		getBytes: function(offset, length) {
			return this.byteSource.getBytes(offset + this.offset, length);
		},
	};

	function displayByteLength(byteLength) {
	    if (byteLength < 1024) {
	    	return byteLength + ' bytes';
	    }
	    var displayNumber, unit;
	    if (byteLength < 1024 * 1024) {
	    	displayNumber = byteLength / 1024;
	    	unit = 'KB';
	    }
	    else if (byteLength < 1024 * 1024 * 1024) {
	    	displayNumber = byteLength / (1024 * 1024);
	    	unit = 'MB';
	    }
	    else {
	    	displayNumber = byteLength / (1024 * 1024 * 1024);
	    	unit = 'GB';
	    }
	    displayNumber = Math.floor(displayNumber * 10) + '';
	    if (displayNumber.substr(-1) === '0') {
	    	return displayNumber.substr(0, displayNumber.length - 1) + unit;
	    }
	    else {
	    	return displayNumber.substr(0, displayNumber.length - 1) + '.' + displayNumber.substr(-1) + unit;
	    }
	}

	function LegacyExplorerItem() {
	}
	LegacyExplorerItem.prototype = {
		appendTo: function(list) {
			var item = document.createElement('LI');
			var selector = document.createElement('A');
			selector.className = 'legex-display-name';
			selector.setAttribute('href', '#');
			selector.appendChild(document.createTextNode('displayName' in this ? this.displayName : this.toString()));
			item.appendChild(selector);
			if ('byteLength' in this) {
				var bytes = this.byteLength;
				item.dataset.byteLength = bytes;
				if (!isNaN(bytes) && isFinite(bytes)) {
					var bytesEl = document.createElement('SPAN');
					bytesEl.className = 'legex-byte-length';
					bytesEl.appendChild(document.createTextNode(displayByteLength(bytes)));
					item.appendChild(document.createTextNode(' '));
					item.appendChild(bytesEl);
				}
			}
			if ('timestamp' in this) {
				var d = this.timestamp;
				if (d && !isNaN(d.valueOf())) {
					var timestampEl = document.createElement('TIME');
					timestampEl.className = 'legex-timestamp';
					item.dataset.timestamp = d;
					timestampEl.datetime = d;
					var month = d.getMonth() + 1;
					month = (month < 10) ? '0' + month : month;
					var dom = d.getDate();
					dom = (dom < 10) ? '0' + dom : dom;
					var hour = d.getHours();
					hour = (hour < 10) ? '0' + hour : hour;
					var minute = d.getMinutes();
					minute = (minute < 10) ? '0' + minute : minute;
					timestampEl.appendChild(document.createTextNode(d.getFullYear() + '-' + month + '-' + dom));
					item.appendChild(document.createTextNode(' '));
					item.appendChild(timestampEl);
				}
			}
			var self = this;
			if ('expandTo' in this) {
				var childList = null;
				selector.addEventListener('click', function(e) {
					e.preventDefault();
					if (childList) {
						childList.style.display = childList.style.display === 'none' ? 'block' : 'none';
						return;
					}
					childList = document.createElement('UL');
					item.appendChild(childList);
					self.expandTo(childList);
				});
			}
			else {
				var contentEl = null;
				var defaultDisplay = 'block';
				selector.addEventListener('click', function(e) {
					e.preventDefault();
					if (contentEl !== null) {
						contentEl.style.display = contentEl.style.display === 'none' ? defaultDisplay : 'none';
						return;
					}
					self.explorer.open(new ByteSourceWindow(self.byteSource, self.byteOffset || 0))
						.then(
							function(el) {
								var event = new CustomEvent(LegacyExplorer.OPEN, {
									detail: {openedElement: el},
									bubbles: true,
									cancelable: true
								});
								if (item.dispatchEvent(event)) {
									var contentEl = document.createElement('DIV');
									defaultDisplay = el.style.display;
									contentEl.appendChild(el);
									item.appendChild(contentEl);
								}
							},
							function(reason) {
								if (item.dispatchEvent(LegacyExplorer.failedOpenEvent)) {
									console.error(reason);
								}
							});
				});
			}
			list.appendChild(item);
			return Promise.resolve(item);
		}
	};

	LegacyExplorer.Item = LegacyExplorerItem;

	return LegacyExplorer;

});
