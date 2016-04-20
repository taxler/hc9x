define(['Promise', '../LegacyExplorer'], function(Promise, LegacyExplorer) {

	'use strict';

	var CHP_DEFAULT = new Uint8Array([1, 0, 24, 0, 0, 0]);

	var PAP_DEFAULT = new Uint8Array(79);
	PAP_DEFAULT.set([61, 0, 30]);
	new DataView(PAP_DEFAULT.buffer, PAP_DEFAULT.byteOffset, PAP_DEFAULT.byteLength).setUint16(10, 240, true);

	function WRIExpedition(explorer, byteSource) {
		this.explorer = explorer;
		this.byteSource = byteSource;
		this.article = document.createElement('ARTICLE');
	}
	WRIExpedition.prototype = {
		open: function() {
			var self = this;
			return this.byteSource.getBytes(0, 14)
				.then(function(bytes) {
					var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
					switch(dv.getUint16(0, true)) {
						case 0xBE31: self.containsOLE = false; break;
						case 0xBE32: self.containsOLE = true; break;
						default: return Promise.reject('Not a Microsoft Write file');
					}
					if (dv.getUint16(2, true) !== 0
							|| dv.getUint16(4, true) !== 0xab00
							|| dv.getUint16(6, true) !== 0
							|| dv.getUint16(8, true) !== 0
							|| dv.getUint16(10, true) !== 0
							|| dv.getUint16(12, true) !== 0) {
						return Promise.reject('Not a Microsoft Write file');						
					}
					return Promise.all([self.byteSource.getBytes(14, 16), self.byteSource.getBytes(96, 2)]);
				})
				.then(function(values) {
					var bytes = values[0], bytes2 = values[1];
					var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
					self.textByteLength = dv.getUint32(0, true);
					self.firstParagraphInfoPageNumber = dv.getUint16(4, true);
					self.footnoteTablePageNumber = dv.getUint16(6, true);
					self.sectionPropertyPageNumber = dv.getUint16(8, true);
					self.sectionTablePageNumber = dv.getUint16(10, true);
					self.pageTablePageNumber = dv.getUint16(12, true);
					self.fontFaceNameTablePageNumber = dv.getUint16(14, true);
					self.pageCount = new DataView(bytes2.buffer, 0, 2).getUint16(0, true);
					if (self.firstParagraphInfoPageNumber === self.footnoteTablePageNumber) {
						delete self.firstParagraphInfoPageNumber;
					}
					else {
						self.lastParagraphInfoPageNumber = self.footnoteTablePageNumber - 1;
					}
					if (self.footnoteTablePageNumber === self.sectionPropertyPageNumber) {
						delete self.footnoteTablePageNumber;
					}
					if (self.sectionPropertyPageNumber === self.sectionTablePageNumber) {
						delete self.sectionPropertyPageNumber;
					}
					if (self.sectionTablePageNumber === self.pageTablePageNumber) {
						delete self.sectionTablePageNumber;
					}
					if (self.pageTablePageNumber === self.fontFaceNameTablePageNumber) {
						delete self.pageTablePageNumber;
					}
					if (self.fontFaceNameTablePageNumber === self.pageCount) {
						delete self.fontFaceNameTablePageNumber;
					}
					if (self.pageCount === 0) {
						return Promise.reject('Word files are not supported');
					}
					function handleParagraphInfoPage(bytes) {
						var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
						var pos = dv.getUint32(0, true);
						var promises = [];
						for (var fod_i = 0, fodCount = bytes[127]; fod_i < fodCount; fod_i++) {
							var afterPos = dv.getUint32(4 + fod_i * 6, true);
							var fpropOffset = dv.getInt16(4 + fod_i * 6 + 4, true);
							var fprop;
							if (fpropOffset !== -1) {
								fpropOffset += 4;
								fprop = new Uint8Array(PAP_DEFAULT);
								fprop.set(bytes.subarray(fpropOffset + 1, fpropOffset + 1 + bytes[fpropOffset]));
							}
							else {
								fprop = PAP_DEFAULT;
							}
							promises.push(Promise.all([Promise.resolve(fprop), self.byteSource.getBytes(pos, afterPos - pos)])
								.then(function(values) {
									var fprop = values[0], bytes = values[1];
									if ((fprop[16] & 16) !== 0) {
										// TODO: image
										return document.createElement('DIV');
									}
									else {
										var text = String.fromCharCode.apply(null, bytes);
										var justify = fprop[1] & 3;
										var paragraph = document.createElement('P');
										switch(justify) {
											case 1: paragraph.style.textAlign = 'center'; break;
											case 2: paragraph.style.textAlign = 'right'; break;
											case 3: paragraph.style.textAlign = 'justify'; break;
										}
										paragraph.appendChild(document.createTextNode(text));
										return paragraph;
									}
								}));
							pos = afterPos;
						}
						return Promise.all(promises);
					}
					var promises = [];
					if ('firstParagraphInfoPageNumber' in self) {
						for (var page = self.firstParagraphInfoPageNumber; page <= self.lastParagraphInfoPageNumber; page++) {
							promises.push(self.byteSource.getBytes(128 * page, 128).then(handleParagraphInfoPage));
						}
					}
					return Promise.all(promises)
						.then(function(parts) {
							for (var i = 0; i < parts.length; i++) {
								for (var j = 0; j < parts[i].length; j++) {
									self.article.appendChild(parts[i][j]);
								}
							}
						});
				})
				.then(function() {
					return self.article;
				});
		},
	};

	LegacyExplorer.registerExpedition(WRIExpedition);

	return WRIExpedition;

});