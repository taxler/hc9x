define(['hc9x/mac/DataView.getMacString'], function(_) {

	'use strict';

	function decodePalette(palette) {
		if (palette >= 1) {
			return 'cast(' + palette + ')';
		}
		switch(palette = -palette) {
			case 0: return 'mac';
			case 100: return 'windows';
			case 1: return 'rainbow';
			case 2: return 'grayscale';
			case 3: return 'pastels';
			case 4: return 'vivid';
			case 5: return 'ntsc';
			case 6: return 'metallic';
			default: return 'systemPalette(' + palette + ')';
		}
	}

	function readCASt(CASt) {
		var data = {};
		var data1 = new DataView(
			CASt.buffer,
			CASt.byteOffset + 2 + 4,
			CASt.getUint16(0, false));
		if (data1.byteLength >= 12) {
			data.t = data1.getUint16(4, false);
			data.l = data1.getUint16(6, false);
			data.b = data1.getUint16(8, false);
			data.r = data1.getUint16(10, false);
			if (data1.byteLength >= 24) {
				data.regPointY = data1.getInt16(20, false);
				data.regPointX = data1.getInt16(22, false);
				if (data1.byteLength >= 26) {
					data.bitsPerPixel = data1.getUint8(25);
					if (data1.byteLength >= 28) {
						data.palette = decodePalette(data1.getInt16(26, false));
					}
				}
			}
		}
		var data2Len = CASt.getUint32(2, false);
		if (data2Len > 0) {
			var pos = 2 + 4 + data1.byteLength;
			var data2 = new DataView(CASt.buffer, CASt.byteOffset + pos, 0x14);
			if (data2.getUint32(0, false) !== 0x14) {
				console.error('CASt data chunk is not 0x14 bytes as expected');
			}
			pos += 0x14;
			var moreData = new Array(CASt.getUint16(pos, false));
			pos += 2;
			var moreDataBase = pos + (moreData.length + 1) * 4;
			for (var i = 0; i < moreData.length; i++) {
				var offset = CASt.getUint32(pos + i * 4, false);
				var length = CASt.getUint32(pos + (i + 1) * 4, false) - offset;
				if (length > 0) {
					moreData[i] = new DataView(
						CASt.buffer,
						CASt.byteOffset + moreDataBase + offset,
						length);
				}
			}
			if (moreData[0]) {
				data.scriptText = moreData[0].getMacString(0, moreData[0].byteLength);
			}
			if (moreData[1]) {
				data.castName = moreData[1].getMacString(1, moreData[1].getUint8(0));
			}
			if (moreData[2]) {
				data.sourcePath = moreData[2].getMacString(1, moreData[2].getUint8(0));
			}
			if (moreData[3]) {
				data.sourceName = moreData[3].getMacString(1, moreData[3].getUint8(0));
			}
			if (moreData[4]) {
				data.sourceType = moreData[4].getMacString(0, moreData[4].byteLength);
			}
		}
		return data;
	}

	return readCASt;
	
});
