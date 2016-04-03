define(function() {

	'use strict';

	function getRangeHeader(offset, length) {
		offset = offset || 0;
		if (isNaN(length)) {
			return 'bytes=' + offset + '-';
		}
		return 'bytes=' + offset + '-' + (offset + length - 1);
	}

	function PiecemealDownload(url, offset, length) {
		if (!isNaN(length) && length < 1) {
			throw new Error('length must be a positive number');
		}
		this.url = url;
		this.headers = {};
		this.offset = offset || 0;
		this.length = length;
	}
	PiecemealDownload.prototype = {
		onPiece: function(){},
		onDone: function(){},
		downloadPiece: null,
		start: function() {
			this.downloadPiece();
		},
		openXHR: function() {
			var xhr = new XMLHttpRequest;
			xhr.open('GET', this.url, true);
			var range = getRangeHeader(this.offset, this.length);
			if (range !== '0-') {
				xhr.setRequestHeader('Range', range);
			}
			var self = this;
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
					self.onPiece(new Uint8Array(arraybuffer, pos));
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
		PiecemealDownload.prototype.downloadPiece = downloadPiece_FetchResponseBody;
		PiecemealDownload.mode = 'chunked';
	}
	else if (tryResponseType('moz-chunked-arraybuffer')) {
		PiecemealDownload.prototype.downloadPiece = downloadPiece_MozChunked;
		PiecemealDownload.mode = 'chunked';
	}
	else if ('MSStreamReader' in window && tryResponseType('ms-stream')) {
		PiecemealDownload.prototype.downloadPiece = downloadPiece_MSStream;
		PiecemealDownload.mode = 'buffered';
	}
	else if ('overrideMimeType' in XMLHttpRequest.prototype) {
		PiecemealDownload.prototype.downloadPiece = downloadPiece_BinaryString;
		PiecemealDownload.mode = 'buffered';
	}
	else {
		PiecemealDownload.prototype.downloadPiece = downloadPiece_ManuallyChunked;
		PiecemealDownload.mode = 'simulated';
	}

	// using Streams API via fetch()
	function downloadPiece_FetchResponseBody() {
		var self = this;
		var range = getRangeHeader(this.offset, this.length);
		var headers = {};
		if (range !== '0-') {
			headers['Range'] = range;
		}
		fetch(this.url, {headers: headers, cache:'force-cache'})
			.then(function(response) {
				var reader = response.body.getReader();
				self.reader = reader;
				function onPiece(piece) {
					if (piece.done) {
						if (!self.cancelled) {
							self.onDone();
						}
					}
					else {
						self.onPiece(piece.value);
						reader.read().then(onPiece);
					}
				}
				reader.read().then(onPiece);
			});
	}

	// using Mozilla's moz-chunked-arraybuffer responseType
	function downloadPiece_MozChunked() {
		var xhr = this.openXHR();
		xhr.responseType = 'moz-chunked-arraybuffer';
		var self = this;
		xhr.addEventListener('progress', function() {
			self.onPiece(new Uint8Array(this.response));
		});
		xhr.send();
	}

	// using Microsoft's ms-stream responseType
	function downloadPiece_MSStream() {
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
	// TODO: limit to blocks of 1mb
	var getStringBytes;
	function downloadPiece_BinaryString() {
		var xhr = this.openXHR();
		xhr.overrideMimeType('text/plain; charset=ISO-8859-1');
		var pos = 0;
		var self = this;
		xhr.addEventListener('progress', function() {
			if (pos < this.responseText.length) {
				console.log('>>', pos);
				self.onPiece(getStringBytes(this.responseText.slice(pos)));
				pos = this.responseText.length;
			}
		});
		xhr.send();
	}

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
	function downloadPiece_ManuallyChunked() {
		var self = this;
		function nextChunk(offset, length) {
			var xhr = new XMLHttpRequest;
			xhr.open('GET', self.url, true);
			xhr.responseType = 'arraybuffer';
			var chunkLength = isNaN(length) || length > MANUAL_CHUNK_SIZE ? MANUAL_CHUNK_SIZE : length;
			console.log(offset, length, chunkLength);
			xhr.setRequestHeader('Range', getRangeHeader(offset, chunkLength));
			if (isNaN(length)) {
				xhr.addEventListener('readystatechange', function() {
					switch(xhr.readyState) {
						case 2: // HEADERS_RECEIVED
							if (xhr.status < 200 && xhr.status > 299) {
								xhr.abort();
								throw new Error('Server returned status ' + xhr.status);
							}
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
							break;
					}
				});
			}
			xhr.addEventListener('load', function() {
				length -= xhr.response.byteLength;
				offset += xhr.response.byteLength;
				self.onPiece(new Uint8Array(xhr.response));
				if (length === 0 || xhr.response.byteLength < MANUAL_CHUNK_SIZE) {
					self.onDone();
				}
				else {
					nextChunk(offset, length);
				}
			});
			self.xhr = xhr;
			xhr.send();
		}
		nextChunk(this.offset, this.length);
	}

	return PiecemealDownload;

});
