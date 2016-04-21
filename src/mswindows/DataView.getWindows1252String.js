define(function() {

	var getWindows1252String;

	if ('TextDecoder' in window) {
		var win1252Decoder = new TextDecoder('windows-1252');
		getWindows1252String = function(offset, length) {
			return win1252Decoder.decode(new Uint8Array(this.buffer, this.byteOffset + offset, length));
		};
	}
	else {
		var _0x80_0x9F = [
			0x20AC, 0xFFFD, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
				0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0xFFFD, 0x017D, 0xFFFD,
 			0xFFFD, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
				0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0xFFFD, 0x017E, 0x0178,
		];
		getWindows1252String = function(offset, length) {
			var bytes = new Uint8Array(new Uint8Array(this.buffer, this.byteOffset + offset, length));
			for (var i = 0; i < length; i++) {
				if (bytes[i] >= 0x80 && bytes[i] <= 0x9F) {
					bytes[i] = _0x80_0x9F[bytes[i] - 0x80];
				}
			}
			return String.fromCharCode.apply(null, bytes);
		};
	}

	DataView.prototype.getWindows1252String = getWindows1252String;

	return getWindows1252String;
	
});
