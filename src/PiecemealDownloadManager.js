define(['Promise', './PiecemealDownload', './RangeSpec'], function(Promise, PiecemealDownload, RangeSpec) {
	
	'use strict';

	function RangeSpecWithBytes(offset, bytes) {
		if (bytes instanceof Uint8Array) {
			RangeSpec.call(this, offset, bytes.length);
			this.bytes = bytes;
		}
		else {
			RangeSpec.call(this, offset, bytes);
		}
	}
	(function(proto) {
		proto.constructor = RangeSpecWithBytes;
		proto.initSubrange = function(subrange) {
			RangeSpec.prototype.initSubrange.apply(this, arguments);
			subrange.bytes = this.bytes.subarray(subrange.offset - this.offset, subrange.length);
		};
		proto.compareTo = function(other) {
			return 1;
		};
		proto.priority = Infinity;
	})(RangeSpecWithBytes.prototype = new RangeSpec);

	function PiecemealDownloadManager(url) {
		this.url = url;
		this.ranges = new RangeSpec.Set();
		this.listeners = [];
	}
	PiecemealDownloadManager.prototype = {
		getBytes: function(offset, length) {
			offset = +(offset || 0);
			if (isNaN(offset) || !isFinite(offset) || offset < 0) {
				throw new TypeError('offset must be a finite number >= 0');
			}
			if (isNaN(length)) length = Infinity;
			if (length < 0) {
				throw new TypeError('length must be a number >= 0');
			}
			if (length === 0) {
				return Promise.resolve(new Uint8Array(0));
			}
			var buf = new Uint8Array(length);

			var dlRanges = new RangeSpec.Set();
			dlRanges.put(new RangeSpec(offset, length));

			var current = this.ranges.slice(offset, offset + length);
			for (var i = 0; i < current.ranges.length; i++) {
				var range = current.ranges[i];
				if (!('bytes' in range)) continue;
				buf.set(range.bytes, range.offset - offset);
				dlRanges.clear(range);
			}
			if (dlRanges.ranges.length === 0) {
				return Promise.resolve(buf);
			}
			var self = this;
			return new Promise(function(resolve, reject) {
				var dl = new PiecemealDownload(self.url, dlRanges.ranges);
				self.addListener(function(pieceOffset, pieceBytes) {
					if (pieceOffset >= (offset + length)) return;
					if ((pieceOffset + pieceBytes.length) <= offset) return;
					dlRanges.clear(new RangeSpec(pieceOffset, pieceBytes.length));
					var diff = pieceOffset - offset;
					if (diff < 0) {
						buf.set(pieceBytes.subarray(-diff));
					}
					else if (diff > 0) {
						buf.set(pieceBytes, diff);
					}
					else {
						buf.set(pieceBytes);
					}
					if (dlRanges.ranges.length === 0) {
						resolve(buf);
						return 'remove';
					}
				});
				dl.onPiece = function(pieceOffset, pieceBytes) {
					self.putBytes(pieceOffset, pieceBytes);
				};
				dl.startDownload();
			});
		},
		putBytes: function(offset, bytes) {
			var range = new RangeSpecWithBytes(offset, bytes);
			this.ranges.put(range);
			for (var i = this.listeners.length-1; i >= 0; i--) {
				if (this.listeners[i](offset, bytes) === 'remove') {
					this.listeners.splice(i, 1);
				}
			}
		},
		clearBytes: function(offset, length) {
			this.ranges.clear(new RangeSpec(offset, length));
		},
		addListener: function(listener) {
			this.listeners.push(listener);
		},
		removeListener: function(listener) {
			var i = this.listeners.indexOf(listener);
			if (i === -1) return false;
			this.listeners.splice(i, 1);
			return true;
		},
	};

	return PiecemealDownloadManager;

});
