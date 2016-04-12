define(['Promise', './PiecemealDownload'], function(Promise, PiecemealDownload) {
	
	'use script';

	function PiecemealDownloadManager(url) {
		this.url = url;
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
			var self = this;
			return new Promise(function(resolve, reject) {
				var dl = new PiecemealDownload(self.url, [{offset:offset, length:length}]);
				var buf = new Uint8Array(length);
				var count = 0;
				dl.onPiece = function(pieceOffset, pieceBytes) {
					if (pieceOffset >= (offset + length)) return;
					if ((pieceOffset + pieceBytes.length) <= offset) return;
					var diff = pieceOffset - offset;
					pieceBytes = pieceBytes.subarray(diff, Math.min(pieceBytes.length, diff + length));
					buf.set(pieceBytes, pieceOffset - offset);
					count += pieceBytes.length;
					if (count === length) {
						resolve(buf);
					}
				};
				dl.startDownload();
			});
		},
	};

	return PiecemealDownloadManager;

});
