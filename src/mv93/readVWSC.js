define(function() {
	
	'use strict';

	var transitionNames = [
		'none',
		'wipeRight', 'wipeLeft', 'wipeDown', 'wipeUp',
		'centerOutHorizontal', 'edgesInHorizontal',
			'centerOutVertical', 'edgesInVertical',
			'centerOutSquare', 'edgesInSquare',
		'pushLeft', 'pushRight', 'pushDown', 'pushUp',
		'revealUp', 'revealUpRight', 'revealRight', 'revealDownRight',
			'revealDown', 'revealDownLeft', 'revealLeft', 'revealUpLeft',
		'dissolvePixelsFast', 'dissolveBoxyRectangles',
			'dissolveBoxySquares', 'dissolvePatterns',
		'randomRows', 'randomColumns',
		'coverDown', 'coverDownLeft', 'coverDownRight', 'coverLeft',
			'coverRight', 'coverUp', 'coverUpLeft', 'coverUpRight',
		'venetianBlinds', 'checkerboard',
		'stripsBottomBuildLeft', 'stripsBottomBuildRight',
			'stripsLeftBuildDown', 'stripsLeftBuildUp',
			'stripsRightBuildDown', 'stripsRightBuildUp',
			'stripsTopBuildLeft', 'stripsTopBuildRight',
		'zoomOpen', 'zoomClose',
		'verticalBlinds',
		'dissolveBitsFast', 'dissolvePixels', 'dissolveBits'
	];

	function readVWSC(VWSC) {
		// TODO: are these specified in the header somewhere instead of fixed?
		var pos = 0x14;
		var recordSize = 0x14;
		var recordCount = 50;

		var data = {frames:[]};

		var stateBuffer = new Uint8Array(recordSize * recordCount);
		var stateDataView = new DataView(stateBuffer.buffer, stateBuffer.byteOffset, stateBuffer.byteLength);

		function decodeDuration(duration) {
			if (duration === 0) {
				return 'default';
			}
			if (duration >= 1 && duration <= 60) {
				return 1000 / duration;
			}
			if (duration <= -1 && duration >= -30) {
				return 250 * -duration;
			}
			if (duration == -128) {
				return 'untilUserAction';
			}
			if (duration >= -122 && duration <= -121) {
				return 'untilAfterSound(' + (-120 - duration) + ')';
			}
			return 'untilAfterVideo(' + (duration + 121) + ')';
		}

		function decodeTransition(transition) {
			return transitionNames[transition] || 'transition(' + transition + ')';
		}

		function decodeCast(cast) {
			return cast === 0 ? null : 'cast(' + cast + ')';
		}

		function decodePalette(palette) {
			if (palette === 0) return 'default';
			if (palette < 0) {
				switch(palette = 1 - palette) {
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
			return decodeCast(palette);
		}

		function decodeInk(ink) {
			switch(ink) {
				case 0x00: return 'copy';
				case 0x01: return 'transparent';
				case 0x02: return 'reverse';
				case 0x03: return 'ghost';
				case 0x04: return 'notCopy';
				case 0x05: return 'notTransparent';
				case 0x06: return 'notReverse';
				case 0x07: return 'notGhost';
				case 0x08: return 'matte';
				case 0x09: return 'mask';
				case 0x20: return 'blend';
				case 0x21: return 'addPin';
				case 0x22: return 'add';
				case 0x23: return 'subtractPin';
				case 0x25: return 'lightest';
				case 0x26: return 'subtract';
				case 0x27: return 'darkest';
				default: return 'ink('+ink+')';
			}
		}

		function makeDelta(oldBuffer, oldDataView, stateBuffer, stateDataView, startDirty, endDirty) {
			var delta = {};
			if (stateBuffer[0x4] !== oldBuffer[0x4]) {
				delta.duration = decodeDuration(stateBuffer[0x4]);
			}
			if (stateBuffer[0x5] !== 0) {
				delta.transition = decodeTransition(stateBuffer[0x5]);
			}
			var sound1 = stateDataView.getUint16(6, false);
			var sound2 = stateDataView.getUint16(8, false);
			var oldSound1 = oldDataView.getUint16(6, false);
			var oldSound2 = oldDataView.getUint16(8, false);
			if (sound1 !== oldSound1 || sound2 !== oldSound2) {
				delta.sound = {};
				if (sound1 !== oldSound1) delta.sound['1'] = decodeCast(sound1);
				if (sound2 !== oldSound2) delta.sound['2'] = decodeCast(sound2);
			}
			var scriptNum = stateDataView.getUint16(0x10, false);
			if (scriptNum !== 0) {
				delta.script = decodeCast(scriptNum);
			}
			var palette = stateDataView.getInt16(0x14, false);
			if (palette !== oldDataView.getInt16(0x14, false)) {
				delta.palette = decodePalette(palette);
			}
			for (var sprite_i = Math.max(1, Math.floor(startDirty / recordSize));
					sprite_i < Math.ceil(endDirty / recordSize);
					sprite_i++) {
				var pos = sprite_i * recordSize;
				var cast = stateDataView.getUint16(pos + 6);
				if (cast === 0) {
					if (oldDataView.getUint16(pos + 6) !== 0) {
						delta[sprite_i] = null;
					}
					continue;
				}
				var sprite = {};
				if (cast !== oldDataView.getUint16(pos + 6)) {
					sprite.cast = cast === 0 ? 'none' : cast;
				}
				var ink = stateBuffer[pos + 0x5] & 0xf;
				if (ink !== oldBuffer[pos + 0x5] & 0xf) {
					sprite.ink = decodeInk(ink);
				}
				var top = stateDataView.getInt16(pos + 8, false);
				var left = stateDataView.getInt16(pos + 10, false);
				var oldTop = oldDataView.getInt16(pos + 8, false);
				var oldLeft = oldDataView.getInt16(pos + 10, false);
				if (left !== oldLeft) sprite.l = left;
				if (top !== oldTop) sprite.t = top;

				var bottom = stateDataView.getInt16(pos + 12, false);
				var right = stateDataView.getInt16(pos + 14, false);
				var oldBottom = oldDataView.getInt16(pos + 12, false);
				var oldRight = oldDataView.getInt16(pos + 14, false);
				if (bottom !== oldBottom) sprite.b = bottom;
				if (right !== oldRight) sprite.r = right;

				/*
				var height = stateDataView.getInt16(pos + 12, false) - top;
				var width = stateDataView.getInt16(pos + 14, false) - left;
				var oldHeight = oldDataView.getInt16(pos + 12, false) - oldTop;
				var oldWidth = oldDataView.getInt16(pos + 14, false) - oldLeft;
				if (width !== oldWidth) sprite.w = width;
				if (height !== oldHeight) sprite.h = height;
				*/
				var script = stateDataView.getInt16(pos + 16, false);
				if (script !== oldDataView.getInt16(pos + 16, false)) {
					sprite.script = decodeCast(script);
				}
				if (Object.keys(sprite).length !== 0) {
					delta[sprite_i] = sprite;
				}
			}
			return delta;
		}

		while (pos < VWSC.byteLength) {
			var changesLen = VWSC.getUint16(pos, false);
			if (changesLen === 0) break;
			var endPos = pos + changesLen;
			pos += 2;
			var startDirty = stateBuffer.byteLength, endDirty = 0;
			var oldBuffer = stateBuffer;
			var oldDataView = stateDataView;
			if (pos < endPos) {
				stateBuffer = new Uint8Array(stateBuffer);
				stateDataView = new DataView(
					stateBuffer.buffer, stateBuffer.byteOffset, stateBuffer.byteLength);
				do {
					var dataLen = VWSC.getUint16(pos, false);
					var dataPos = VWSC.getUint16(pos + 2, false);
					pos += 4;
					stateBuffer.set(
						new Uint8Array(VWSC.buffer, VWSC.byteOffset + pos, dataLen),
						dataPos);
					pos += dataLen;
					startDirty = Math.min(startDirty, dataPos);
					endDirty = Math.max(endDirty, dataPos + dataLen);
				} while (pos < endPos);
			}
			data.frames.push(makeDelta(oldBuffer, oldDataView, stateBuffer, stateDataView, startDirty, endDirty));
		}
		return data;
	}

	return readVWSC;

});
