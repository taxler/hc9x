define(['Promise', '../LegacyExplorer', '../RangeSpec'], function(Promise, LegacyExplorer, RangeSpec) {

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

					self.endOfData = 128 * new DataView(bytes2.buffer, 0, 2).getUint16(0, true);

					if (self.endOfData === 0) {
						return Promise.reject('Word files are not supported');
					}

					var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);

					self.textOffset = 128;
					self.textByteLength = dv.getUint32(0, true);

					self.charInfoOffset = 128 * Math.ceil(1 + self.textByteLength / 128);
					self.paragraphInfoOffset = 128 * dv.getUint16(4, true);
					self.footnoteTableOffset = 128 * dv.getUint16(6, true);
					self.sectionPropertyOffset = 128 * dv.getUint16(8, true);
					self.sectionTableOffset = 128 * dv.getUint16(10, true);
					self.pageTableOffset = 128 * dv.getUint16(12, true);
					self.fontFaceNameTableOffset = 128 * dv.getUint16(14, true);

					self.charInfoByteLength = self.paragraphInfoOffset - self.charInfoOffset;
					self.paragraphInfoByteLength = self.footnoteTableOffset - self.paragraphInfoOffset;
					self.footnoteTableByteLength = self.sectionPropertyOffset - self.footnoteTableOffset;
					self.sectionPropertyByteLength = self.sectionTableOffset - self.sectionPropertyByteLength;
					self.sectionTableByteLength = self.pageTableOffset - self.sectionTableOffset;
					self.pageTableByteLength = self.fontFaceNameTableOffset - self.pageTableOffset;
					self.fontFaceNameTableByteLength = self.endOfData - self.fontFaceNameTableOffset;

					function getInfo(bytes, defaultInfo) {
						var results = new RangeSpec.Set();
						for (var i_page = 0, max_page = bytes.length / 128; i_page < max_page; i_page++) {
							var dv = new DataView(bytes.buffer, bytes.byteOffset + i_page * 128, 128);
							var pos = dv.getUint32(0, true) - 128;
							for (var fod_i = 0, fodCount = bytes[i_page * 128 + 127]; fod_i < fodCount; fod_i++) {
								var afterPos = dv.getUint32(4 + fod_i * 6, true) - 128;
								var fpropOffset = dv.getInt16(4 + fod_i * 6 + 4, true);
								var fprop;
								if (fpropOffset === -1) {
									fprop = defaultInfo;
								}
								else {
									fprop = new Uint8Array(defaultInfo);
									fpropOffset += i_page * 128 + 4;
									fprop.set(bytes.subarray(fpropOffset + 1, fpropOffset + 1 + bytes[fpropOffset]));
								}
								var range = new RangeSpec(pos, afterPos - pos);
								range.userdata = fprop;
								results.put(range);
								pos = afterPos;
							}
						}
						return results;
					}

					return Promise.all([
						self.byteSource.getBytes(self.textOffset, self.textByteLength),
						self.byteSource.getBytes(self.charInfoOffset, self.charInfoByteLength)
							.then(function(charInfoBytes) {
								return getInfo(charInfoBytes, CHP_DEFAULT);
							}),
						self.byteSource.getBytes(self.paragraphInfoOffset, self.paragraphInfoByteLength)
							.then(function(paragraphInfoBytes) {
								return getInfo(paragraphInfoBytes, PAP_DEFAULT);
							})
					]);
				})
				.then(function(values) {
					var textData = values[0], charInfo = values[1], paragraphInfo = values[2];
					charInfo.ranges = charInfo.ranges.filter(function(a) { return a.userdata !== CHP_DEFAULT; });
					charInfo.ranges.forEach(function(a) {
						var info = a.userdata;
						a.userdata = {};
						var styleSet = [];
						if ((info[1] & 1) !== 0) {
							styleSet.push('font-weight: bold');
						}
						if ((info[1] & 2) !== 0) {
							styleSet.push('font-style: italic');
						}
						if (info[2] !== 24) {
							styleSet.push('font-size: ' + Math.floor((info[2] * 100) / 24) + '%');
						}
						var fontCode = (info[1] >> 2) | ((info[4] & 3) << 6);
						if (info[3] & 1) {
							styleSet.push('text-decoration: underline');
						}
						a.userdata.style = styleSet.join('; ');
					});
					paragraphInfo.ranges.forEach(function(para) {
						if ((para.userdata[16] & 16) !== 0) {
							// TODO: handle images
						}
						else {
							var d = document.createElement('DIV');
							var styles = charInfo.slice(para.offset, para.offset + para.length);
							if (styles.ranges.length >= 1 && (styles.ranges.length === 1
									|| styles.ranges[0].offset !== para.offset
									|| styles.ranges[0].length !== para.length)) {
								var pos = para.offset;
								for (var i = 0; i < styles.ranges.length; i++) {
									var range = styles.ranges[i];
									if (range.offset > pos) {
										var preData = textData.subarray(pos, range.offset);
										var preText = String.fromCharCode.apply(null, preData);
										d.appendChild(document.createTextNode(preText));
									}
									var span = document.createElement('SPAN');
									span.style.cssText = range.userdata.style;
									var inData = textData.subarray(range.offset, range.offset + range.length);
									var inText = String.fromCharCode.apply(null, inData);
									span.appendChild(document.createTextNode(inText));
									d.appendChild(span);
									pos = range.offset + range.length;
								}
								if (pos < (para.offset + para.length)) {
									var postData = textData.subarray(pos, para.offset + para.length);
									var postText = String.fromCharCode.apply(null, postData);
									d.appendChild(document.createTextNode(postText));
								}
							}
							else {
								if (styles.ranges.length === 1) {
									d.style.cssText = styles.ranges[0].userdata.style;
								}
								var paraData = textData.subarray(para.offset, para.offset + para.length);
								var paraText = String.fromCharCode.apply(null, paraData);
								d.appendChild(document.createTextNode(paraText));
							}
							switch(para.userdata[1] & 3) {
								case 1: d.style.textAlign = 'center'; break;
								case 2: d.style.textAlign = 'right'; break;
								case 3: d.style.textAlign = 'justify'; break;
							}
							d.innerHTML = d.innerHTML.replace(/\n/g, '<br>');
							self.article.appendChild(d);
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