define(['Promise', '../LegacyExplorer', '../Rgba'], function(Promise, LegacyExplorer, Rgba) {

	function BMPExpedition(explorer, byteSource) {
		this.explorer = explorer;
		this.byteSource = byteSource;
	}
	BMPExpedition.prototype = {
		open: function() {
			var self = this;
			return this.byteSource.getBytes(0, 14)
				.then(function(fileHeaderBytes) {
					self.fileType = String.fromCharCode.apply(null, fileHeaderBytes.subarray(0, 2));
					if (self.fileType !== 'BM') {
						if (/^(BA|CI|CP|IC|PT)$/.test(self.fileType)) {
							return Promise.reject('OS/2 BMPs not yet supported');
						}
						return Promise.reject('Not a recognized BMP subtype');
					}
					var dv = new DataView(fileHeaderBytes.buffer, fileHeaderBytes.byteOffset, fileHeaderBytes.byteLength);
					self.pixelDataOffset = dv.getUint32(10, true);
					return self.byteSource.getBytes(14, 4);
				})
				.then(function(bitmapHeaderLenBytes) {
					var dv = new DataView(bitmapHeaderLenBytes.buffer, bitmapHeaderLenBytes.byteOffset, bitmapHeaderLenBytes.byteLength);
					var bitmapHeaderLen = dv.getUint32(0, true);
					if ([12, 64, 40, 52, 56, 108, 124].indexOf(bitmapHeaderLen) === -1) {
						return Promise.reject('Unrecognized bitmap header size (' + bitmapHeaderLen + ' bytes)');
					}
					return self.byteSource.getBytes(14, bitmapHeaderLen);
				})
				.then(function(bitmapHeaderBytes) {
					var header = new DataView(bitmapHeaderBytes.buffer, bitmapHeaderBytes.byteOffset, bitmapHeaderBytes.byteLength);
					switch(bitmapHeaderBytes.length) {
						//case 12: return self.loadBITMAPCOREHEADER(header); break;
						case 40: return self.loadBITMAPINFOHEADER(header); break;
						default: return Promise.reject('Unsupported bitmap header');
					} 
				})
				.then(function() {
					return self.makeElement();
				});
		},
		loadBITMAPINFOHEADER: function(header) {
			this.width = header.getInt32(4, true);
			this.height = header.getInt32(8, true);
			if (this.height < 0) {
				this.height = -this.height;
				this.upsideDown = false;
			}
			else {
				this.upsideDown = true;
			}
			this.planes = header.getUint16(12, true);
			this.bitsPerPixel = header.getUint16(14, true);
			this.compression = header.getUint32(16, true);
			this.imageSize = header.getUint32(20, true);
			this.xPelsPerMeter = header.getInt32(24, true);
			this.yPelsPerMeter = header.getInt32(28, true);
			this.colorsUsed = header.getUint32(32, true);
			this.colorsImportant = header.getUint32(36, true);
			this.paletteOffset = 14 + header.byteLength;
			return this.handleBPP();
		},
		handleBPP: function() {
			if ([1, 4, 8, 16, 24, 32].indexOf(this.bitsPerPixel) === -1) {
				return Promise.reject('Unsupported bits per pixel value: ' + this.bitsPerPixel);
			}
			this.bytesPerPixel = this.bitsPerPixel / 8;
			if (this.bytesPerPixel === 3) this.bytesPerPixel = 4;
			if (this.bitsPerPixel >= 16) return Promise.resolve(this);
			var paletteCount = 0 | ((this.pixelDataOffset - this.paletteOffset) / 3);
			var self = this;
			return this.byteSource.getBytes(this.paletteOffset, paletteCount * 4)
				.then(function(paletteBytes) {
					var colors = new Array(paletteCount);
					for (var i = 0; i < paletteCount; i++) {
						colors[i] = new Rgba(
							paletteBytes[i * 4 + 2],
							paletteBytes[i * 4 + 1],
							paletteBytes[i * 4]);
					}
					self.palette = new Rgba.Collection(colors);
					return self;
				});
		},
		get stride() {
			var stride = this.width * this.bytesPerPixel;
			return (stride % 4 === 0) ? stride : stride + 4 - (stride % 4);
		},
		palette: null,
		makeElement: function() {
			var canvas = document.createElement('CANVAS');
			var w = this.width,
				h = this.height,
				stride = this.stride,
				bpp = this.bitsPerPixel,
				p = this.palette.toPixel32Array();
			canvas.width = w;
			canvas.height = h;
			var ctx = canvas.getContext('2d');
			var imageData = ctx.createImageData(w, h);
			var self = this;
			this.byteSource.getBytes(this.pixelDataOffset, stride * this.height)
				.then(function(pixelData) {
					var y_start, y_end, y_diff;
					if (self.upsideDown) {
						y_start = h-1;
						y_end = -1;
						y_diff = -1;
					}
					else {
						y_start = 0;
						y_end = h;
						y_diff = 1;
					}
					var row_base = 0;
					var rgbaData = new Uint32Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength / 4);
					for (var y = y_start; y !== y_end; y += y_diff) {
						for (var x = 0; x < w; x++) {
							var rgba;
							switch (bpp) {
								case 4:
									var pixel = pixelData[row_base + (x >> 1)];
									pixel = (x&1 === 1) ? pixel & 0xf : pixel >> 4;
									rgba = p[pixel];
									break;
								case 8:
									rgba = p[pixelData[row_base + x]];
									break;
								default: return Promise.reject('Unsupported BPP: ' + bpp);
							}
							rgbaData[y*w + x] = rgba;
						}
						row_base += stride;
					}
					ctx.putImageData(imageData, 0, 0);
				});
			return canvas;
		},
	};

	LegacyExplorer.registerExpedition(BMPExpedition);

	return BMPExpedition;

});
