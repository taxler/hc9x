define(function() {

	'use strict';

	var MIN_GAP = 500;

	function PiecemealDownload(url, ranges) {
		this.url = url;
		for (var i = ranges.length-2; i >= 0; i--) {
			if (isNaN(ranges[i].length)) {
				ranges.splice(i + 1, ranges.length - (i + 1));
			}
			else {
				if (ranges[i].offset <= ranges[i + 1].offset
						&& (ranges[i].offset + ranges[i].length + MIN_GAP) >= ranges[i + 1].offset) {
					if (isNaN(ranges[i + 1].length)) {
						delete ranges[i].length;
						ranges.splice(i + 1, ranges.length - (i + 1));
					}
					else {
						ranges[i].length = (ranges[i+1].offset + ranges[i+1].length) - ranges[i].offset;
						ranges.splice(i + 1, 1);
					}
				}
			}
		}
		this.ranges = ranges;
	}
	PiecemealDownload.prototype = {
		getRangeHeader: function() {
			var ranges = this.ranges;
			return 'bytes=' + ranges.map(function(range) {
				return range.offset + '-' + 
					(isNaN(range.length) ? '' : (range.offset + range.length - 1));
			}).join(',');
		},
		onPiece: function(){},
		onRawPiece: null,
		initMonolithic: function(offset) {
			this.onRawPiece = this.onRawPiece || function(piece) {
				this.onPiece(offset, piece);
				offset += piece.length;
			};
		},
		initMultipart: function(boundary) {
			var self = this;
			var lineBuf = [];
			var offset, length = 0;
			var onLine;
			var partHeaders;
			function onLine_PartBoundary(line) {
				if (!boundary) {
					if (/^--/.test(line)) {
						boundary = line.substr(2);
						partHeaders = {};
						onLine = onLine_PartHeader;
					}
					else if (line !== '') {
						self.cancel();
						throw new Error('Invalid multipart data');						
					}
				}
				else if (line === '--' + boundary) {
					partHeaders = {};
					onLine = onLine_PartHeader;
				}
				else if (line === '--' + boundary + '--') {
					// end of data
					// (not actually reached because there's no final CRLF)
				}
				else if (line !== '') { // optional CRLFs before the first part
					self.cancel();
					throw new Error('Invalid multipart data');
				}
			}
			function onLine_PartHeader(line) {
				if (line === '') {
					var range = partHeaders['content-range'];
					if (!range) {
						self.cancel();
						throw new Error('Invalid multipart data: no Content-Range part header found');
					}
					var matched = range.match(/^bytes (\d+)\-(\d+)\/(\d+)$/);
					if (!matched) {
						self.cancel();
						throw new Error('Invalid multipart Content-Range: ' + range);
					}
					offset = +matched[1];
					length = +matched[2] + 1 - offset;
					onLine = onLine_PartBoundary;
				}
				else {
					var header = line.match(/^\s*([^:\s]*)\s*:\s*(.*?)\s*$/);
					if (!header) {
						self.cancel();
						throw new Error('Invalid multipart data');
					}
					var headerName = header[1].toLowerCase();
					var headerValue = header[2];
					partHeaders[headerName] = headerValue;
				}
			}
			onLine = onLine_PartBoundary;
			this.onRawPiece = function(piece) {
				var pos = 0;
				if (length > 0) {
					var pieceLength = Math.min(length, piece.length);
					this.onPiece(offset, piece.subarray(0, pieceLength));
					offset += pieceLength;
					pos += pieceLength;
					length -= pieceLength;
				}
				while (pos < piece.length) {
					var byte = piece[pos++];
					if (byte === 10) {
						onLine(String.fromCharCode.apply(null, lineBuf));
						lineBuf.length = 0;
						var pieceLength = Math.min(length, piece.length - pos);
						if (pieceLength > 0) {
							this.onPiece(offset, piece.subarray(pos, pos + pieceLength));
							offset += pieceLength;
							pos += pieceLength;
							length -= pieceLength;
						}
					}
					else if (byte !== 13) {
						if (byte < 32 && byte !== 9) {
							this.cancel();
							throw new Error('Unexpected control character: ' + byte);
						}
						lineBuf.push(byte);
					}
				}
			};
		},
		onDone: function(){},
		startDownload: null,
		initContentHeaders: function(contentType, contentRange) {
			contentType = contentType.split(/\s*;\s*/g);
			if (/^multipart\//i.test(contentType[0])) {
				for (var i = 1; i < contentType.length; i++) {
					var param = contentType[i].match(/^\s*([^=\s]+)\s*=("(.*)"|(.*))$/);
					if (!param) {
						this.cancel();
						throw new Error('Invalid Content-Type: ' + contentType.join('; '));
					}
					if (param[1].toLowerCase() === 'boundary') {
						return this.initMultipart(param[3] || param[4]);
					}
				}
				this.cancel();
				throw new Error('Invalid Content-Type: ' + contentType);
			}
			if (!contentRange) {
				return this.initMonolithic(0);
			}
			var matched = contentRange.match(/^bytes (\d+)\-(\d+)\/(\d+)$/);
			if (!matched) {
				this.cancel();
				throw new Error('Invalid Content-Range: ' + contentRange);
			}
			this.initMonolithic(+matched[1]);
		},
		openXHR: function(forceMultipart) {
			var xhr = new XMLHttpRequest;
			xhr.open('GET', this.url, true);
			xhr.setRequestHeader('Range', this.getRangeHeader());
			var self = this;
			xhr.addEventListener('readystatechange', function() {
				if (this.readyState === 2) {
					if (forceMultipart) {
						self.initMultipart(null);
					}
					else {
						self.initContentHeaders(
							this.getResponseHeader('Content-Type'),
							this.getResponseHeader('Content-Range'));
					}
				}
			});
			xhr.addEventListener('load', function() {
				self.onDone();
				delete self.xhr;
			});
			return this.xhr = xhr;
		},
		cancel: function() {
			if ('xhr' in this) {
				this.xhr.abort();
				delete this.xhr;
			}
			else if ('reader' in this) {
				if ('cancel' in this.reader) {
					this.reader.cancel();
				}
				else {
					this.reader.abort();
				}
				delete this.reader;
			}
			this.cancelled = true;
		},
		listenToReader: function(reader) {
			var self = this;
			var pos = 0;
			reader.addEventListener('progress', function() {
				var arraybuffer = this.result;
				if (pos < arraybuffer.byteLength) {
					self.onRawPiece(new Uint8Array(arraybuffer, pos));
					pos = arraybuffer.byteLength;
				}
			});
			reader.addEventListener('load', function() {
				delete self.reader;
			});
			this.reader = reader;
		},
	};

	function tryResponseType(responseType) {
		if (!('responseType' in XMLHttpRequest.prototype)) {
			return false;
		}
		var xhr = new XMLHttpRequest;
		xhr.open('GET', '/', true);
		xhr.responseType = responseType;
		return xhr.responseType === responseType;
	}

	if ('fetch' in window && 'Response' in window && 'body' in Response.prototype) {
		PiecemealDownload.prototype.startDownload = startDownload_FetchResponseBody;
		PiecemealDownload.mode = 'chunked';
	}
	else if (tryResponseType('moz-chunked-arraybuffer')) {
		PiecemealDownload.prototype.startDownload = startDownload_MozChunked;
		PiecemealDownload.mode = 'chunked';
	}
	else if ('MSStreamReader' in window && tryResponseType('ms-stream')) {
		PiecemealDownload.prototype.startDownload = startDownload_MSStream;
		PiecemealDownload.mode = 'buffered';
	}
	else if ('overrideMimeType' in XMLHttpRequest.prototype) {
		PiecemealDownload.prototype.startDownload = startDownload_BinaryString;
		PiecemealDownload.mode = 'buffered';
	}
	else {
		PiecemealDownload.prototype.startDownload = startDownload_ManuallyChunked;
		PiecemealDownload.mode = 'simulated';
	}

	// using Streams API via fetch()
	function startDownload_FetchResponseBody() {
		var self = this;
		fetch(this.url, {headers: {Range: this.getRangeHeader()}, cache:'force-cache'})
			.then(function(response) {
				self.initContentHeaders(
					response.headers.get('Content-Type'),
					response.headers.get('Content-Range'));
				var reader = response.body.getReader();
				self.reader = reader;
				function onPiece(piece) {
					if (piece.done) {
						if (!self.cancelled) {
							self.onDone();
						}
					}
					else {
						self.onRawPiece(piece.value);
						reader.read().then(onPiece);
					}
				}
				reader.read().then(onPiece);
			});
	}

	// using Mozilla's moz-chunked-arraybuffer responseType
	function startDownload_MozChunked() {
		var xhr = this.openXHR();
		xhr.responseType = 'moz-chunked-arraybuffer';
		var self = this;
		xhr.addEventListener('progress', function() {
			self.onRawPiece(new Uint8Array(this.response));
		});
		xhr.send();
	}

	// using Microsoft's ms-stream responseType
	function startDownload_MSStream() {
		var xhr = this.openXHR();
		xhr.responseType = 'ms-stream';
		var self = this;
		xhr.addEventListener('readystatechange', function() {
			switch (this.readyState) {
				case 3: // LOADING
					var reader = new MSStreamReader;
					self.listenToReader(reader);
					reader.readAsArrayBuffer(this.response);
					break;
			}
		});
		xhr.send();
	}

	// using binary string responseText
	// TODO: limit to blocks of 1mb?
	var getStringBytes;
	function startDownload_BinaryString() {
		var xhr = this.openXHR(this.ranges.length > 1);
		xhr.overrideMimeType('text/plain; charset=ISO-8859-1');
		var pos = 0;
		var self = this;
		xhr.addEventListener('progress', function() {
			if (pos < this.responseText.length) {
				self.onRawPiece(getStringBytes(this.responseText.slice(pos)));
				pos = this.responseText.length;
			}
		});
		xhr.send();
	}

	// TextEncoder only works with UTF, not ISO-8859-1
	function getStringBytes(str) {
		var a = new Array(str.length);
		for (var i = 0; i < str.length; i++) {
			a[i] = str.charCodeAt(i);
		}
		return new Uint8Array(a);
	}

	// no true streaming available?
	// make a series of small individual downloads instead
	var MANUAL_CHUNK_SIZE = 1024 * 10;
	function startDownload_ManuallyChunked() {
		var self = this;
		var ranges = this.ranges.slice();
		function nextRange() {
			if (ranges.length === 0) {
				self.onDone();
			}
			else {
				var range = ranges.splice(0, 1)[0];
				nextChunk(range.offset, range.length);				
			}
		}
		function nextChunk(offset, length) {
			var xhr = new XMLHttpRequest;
			xhr.open('GET', self.url, true);
			xhr.responseType = 'arraybuffer';
			var chunkLength = isNaN(length) || length > MANUAL_CHUNK_SIZE ? MANUAL_CHUNK_SIZE : length;
			xhr.setRequestHeader('Range', 'bytes=' + offset + '-' + (offset + chunkLength - 1));
			xhr.addEventListener('readystatechange', function() {
				if (this.readyState === 2) {
					if (xhr.status < 200 && xhr.status > 299) {
						xhr.abort();
						throw new Error('Server returned status ' + xhr.status);
					}
					if (isNaN(length)) {
						var range = xhr.getResponseHeader('Content-Range');
						if (!range) {
							xhr.abort();
							throw new Error('Server returned no Content-Range');
						}
						var match = range.match(/\/(\d+)/);
						if (!match) {
							xhr.abort();
							throw new Error('Content-Range: ' + range);
						}
						length = +match[1] - offset;
					}
				}
			});
			xhr.addEventListener('load', function() {
				self.onPiece(offset, new Uint8Array(xhr.response));
				var responseLength = xhr.response.byteLength;
				if (responseLength === length || responseLength < MANUAL_CHUNK_SIZE) {
					nextRange();
				}
				else {
					nextChunk(
						offset + xhr.response.byteLength,
						length - xhr.response.byteLength);
				}
			});
			self.xhr = xhr;
			xhr.send();
		}
		nextRange();
	}

	return PiecemealDownload;

});
