define(function(){


'use strict';


// utility for checking if typed arrays have little-endian values
var hostSystemIsLittleEndian = (function() {
	var buffer = new ArrayBuffer(2);
	new DataView(buffer).setInt16(0, 123, true);
	return new Int16Array(buffer)[0] === 123;
})();

// base class for Red/Green/Blue/Alpha related objects
function RgbaBase() {

}
RgbaBase.prototype = {
	toJSON: null,
	pushValuesTo: null,
	getValues: function() {
		return this.pushValuesTo([]);
	},
	toPixel32Array: function() {
		return Uint32Array.from(this.getValues(), function(v) {
			return v.toPixel32();
		});
	},
	toElement: function() {
		var el = document.createElement('SCRIPT');
		el.type = Rgba.mimeType;
		el.appendChild(document.createTextNode(this.toString()));
		return el;
	},
	make16x16Canvas: function() {
		var canvas = document.createElement('CANVAS');
		canvas.width = 16;
		canvas.height = 16;
		canvas.setAttribute('style', 'image-rendering: crisp-edges; image-rendering: pixelated;');
		var ctx = canvas.getContext('2d');
		var imageData = ctx.createImageData(16, 16);
		new Uint32Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength/4).set(this.toPixel32Array());
		ctx.putImageData(imageData, 0, 0);
		return canvas;
	}
};
RgbaBase.parse = function(part) {
	var unionPos = part.indexOf('|');
	if (unionPos !== -1) {
		return new RgbaUnion(
			RgbaBase.parse(part.substr(0, unionPos)),
			RgbaBase.parse(part.substr(unionPos + 1)));
	}
	var rangeMatch = part.match(/^\s*\[\s*(\d+)\s*\:([^\-]+)\-([^\]]+)\]\s*$/);
	if (rangeMatch) {
		return new RgbaRange(
			+rangeMatch[1],
			new Rgba(rangeMatch[2]),
			new Rgba(rangeMatch[3]));
	}
	return new Rgba(part);
};

// Red/Green/Blue/Alpha class for composing color palettes and converting between forms
function Rgba(r, g, b) {
	var self = this || new Rgba;
	switch(arguments.length) {
		case 0: break;
		case 1:
			switch(typeof arguments[0]) {
				case 'string':
					self.fromNumericCSS(arguments[0]);
					break;
				case 'number':
					self.fromPixel32(arguments[0]);
					break;
			}
			break;
		case 3: case 4:
			self.fromComponents(arguments);
			break;
	}
}
Rgba.prototype = new RgbaBase;
Rgba.prototype.r = Rgba.prototype.g = Rgba.prototype.b = 0;
Rgba.prototype.a = 255;
Rgba.prototype.toJSON = function() {
	return this.toNumericCSS();
};
Rgba.prototype.toString = function() {
	return this.toNumericCSS();
};
Rgba.prototype.pushValuesTo = function(pushTo) {
	pushTo.push(this);
	return pushTo;
};
Rgba.prototype.getValues = function() {
	return [this];
};
Rgba.prototype.fromComponents = function(arg1) {
	var components = typeof arg1 === 'number' ? arguments : arg1;
	this.r = components[0];
	this.g = components[1];
	this.b = components[2];
	if (components.length === 4) {
		this.a = components[3];
	}
	return this;
};
Rgba.prototype.toComponents = function() {
	return [this.r, this.g, this.b, this.a];
};
Rgba.prototype.toNumericCSS = function() {
	var r = this.r, g = this.g, b = this.b, a = this.a;
	if (a !== 255) {
		return 'rgba(' + [r,g,b,a/255].join(', ') + ')';
	}
	if (r%0x11 + g%0x11 + b%0x11 === 0) {
		return '#' + (r/0x11).toString(16) + (g/0x11).toString(16) + (b/0x11).toString(16);
	}
	r = r.toString(16); if (r.length === 1) r = '0' + r;
	g = g.toString(16); if (g.length === 1) g = '0' + g;
	b = b.toString(16); if (b.length === 1) b = '0' + b;
	return '#' + r + g + b;
};
Rgba.prototype.fromNumericCSS = function(color) {
	var match = color.match(/^\s*#([0-9a-f]{3,6})\s*$/i);
	if (match) {
		match = match[1];
		if (match.length === 6) {
			return this.fromComponents(
				parseInt(match.substr(0, 2), 16),
				parseInt(match.substr(2, 2), 16),
				parseInt(match.substr(4, 2), 16));
		}
		else if (match.length === 3) {
			return this.fromComponents(
				parseInt(match.charAt(0), 16) * 0x11,
				parseInt(match.charAt(1), 16) * 0x11,
				parseInt(match.charAt(2), 16) * 0x11);
		}
		else {
			throw new Error('Invalid number of color digits: #' + match);
		}
	}
	match = color.match(/^\s*(rgba?)\s*\((.*)\)\s*$/);
	if (match) {
		var name = match[1], params = match[2].split(/,/g);
		if (name === 'rgb') {
			if (params.length !== 3) {
				throw new Error('Invalid number of parameters: ' + name);
			}
			params.push('1.0');
		}
		else if (params.length !== 4) {
			throw new Error('Invalid number of parameters: ' + name);			
		}
		for (var i = 0; i < 3; i++) {
			var component = params[i].match(/^\s*(\d+(\.\d+)?)(%)?\s*$/);
			if (!component) throw new Error('Invalid parameter '+(i+1)+': ' + color);
			var num = +component[1];
			if (component[3]) num = (num * 0xff) / 100;
			params[i] = Math.min(0xff, Math.max(0, num | 0));
		}
		var alpha = params[3].match(/^\s*(\d+(\.\d+)?))$/);
		if (!alpha) {
			throw new Error('Invalid parameter 4: ' + color);
		}
		params[3] = +alpha[1] * 0xff;
		this.r = params[0];
		this.g = params[1];
		this.b = params[2];
		this.a = params[3];
		return this;
	}
	throw new Error('Not a recognized numeric color encoding: ' + color);
};
if (hostSystemIsLittleEndian) {
	Rgba.prototype.toPixel32 = function() {
		return (this.r | this.g << 8 | this.b << 16 | this.a << 24) >>> 0;
	};
	Rgba.prototype.fromPixel32 = function(pixel32) {
		this.r = (pixel32 >> 24) & 0xff;
		this.g = (pixel32 >> 16) & 0xff;
		this.b = (pixel32 >> 8) & 0xff;
		this.a = pixel32 & 0xff;
	};
}
else {
	Rgba.prototype.toPixel32 = function() {
		return (this.r << 24 | this.g << 16 | this.b << 8 | this.a) >>> 0;
	};
	Rgba.prototype.fromPixel32 = function(pixel32) {
		this.r = pixel32 & 0xff;
		this.g = (pixel32 >> 8) & 0xff;
		this.b = (pixel32 >> 16) & 0xff;
		this.a = (pixel32 >> 24) & 0xff;
	};
}

function RgbaCollection() {
	if (arguments.length === 1) {
		if (Array.isArray(arguments[0])) {
			this.members = arguments[0];
			return;
		}
		if (typeof arguments[0] === 'string') {
			this.members = arguments[0].split(/;/g).map(parseRgbaPart);
			return;
		}
	}
	this.members = Array.prototype.slice(arguments);
}
RgbaCollection.prototype = new RgbaBase;
RgbaCollection.prototype.members = null;
RgbaCollection.prototype.pushValuesTo = function(pushTo) {
	for (var i = 0; i < this.members.length; i++) {
		this.members[i].pushValuesTo(pushTo);
	}
	return pushTo;
};
RgbaCollection.prototype.toString = function() {
	return this.members.join('; ');
};
RgbaCollection.prototype.toJSON = function() {
	return this.members;
};

function RgbaRange(count, fromRgba, toRgba) {
	this.fromRgba = fromRgba;
	this.toRgba = toRgba;
	this.count = count;
}
RgbaRange.prototype = new RgbaBase;
RgbaRange.prototype.toJSON = function() {
	return {
		'from': this.fromRgba.toJSON(),
		'to': this.toRgba.toJSON(),
		count: this.count};
};
RgbaRange.prototype.toString = function() {
	return '[' + this.count + ':' + this.fromRgba + '-' + this.toRgba + ']';
};
RgbaRange.prototype.pushValuesTo = function(pushTo) {
	var fromR = this.fromRgba.r;
	var fromG = this.fromRgba.g;
	var fromB = this.fromRgba.b;
	var fromA = this.fromRgba.a;
	var diffR = this.toRgba.r - fromR;
	var diffG = this.toRgba.g - fromG;
	var diffB = this.toRgba.b - fromB;
	var diffA = this.toRgba.a - fromA;
	var vcount = this.count - 1;
	for (var i = 0; i < this.count; i++) {
		pushTo.push(new Rgba(
			0xff & (fromR + (i * diffR) / vcount),
			0xff & (fromG + (i * diffG) / vcount),
			0xff & (fromB + (i * diffB) / vcount),
			0xff & (fromA + (i * diffA) / vcount)));
	}
	return pushTo;
};
RgbaRange.prototype.getValues = function() {
	return this.pushValuesTo([]);
};

function RgbaUnion(left, right) {
	this.left = left;
	this.right = right;
}
RgbaUnion.prototype = new RgbaBase;
RgbaUnion.prototype.left = RgbaUnion.prototype.right = null;
RgbaUnion.prototype.toJSON = function() {
	return {'union': [
		this.left.toJSON(),
		this.right.toJSON()]};
};
RgbaUnion.prototype.toString = function() {
	return this.left + ' | ' + this.right;
};
RgbaUnion.prototype.pushValuesTo = function(pushTo) {
	var left = this.left.getValues();
	var right = this.right.getValues();
	for (var i_left = 0; i_left < left.length; i_left++) {
		var l = left[i_left];
		for (var i_right = 0; i_right < right.length; i_right++) {
			var r = right[i_right];
			pushTo.push(new Rgba(
				l.r | r.r,
				l.g | r.g,
				l.b | r.b,
				l.a | r.a));
		}
	}
	return pushTo;
};
RgbaUnion.prototype.getValues = function() {
	return this.pushValuesTo([]);
};

Rgba.loadScript = function(script) {
	if (script && typeof script.text === 'string') {
		script = script.text;
	}
	var parts = script.split(/;/g).map(RgbaBase.parse);
	if (parts.length === 1) return parts[0];
	return new RgbaCollection(parts);
};

Rgba.loadFrom = function(contextElement, identifier) {
	if (typeof contextElement === 'string') contextElement = document.getElementById(contextElement);
	return Rgba.loadScript(contextElement.querySelector('#' + contextElement.id + '_palette_' + identifier));
};


// exports
Rgba.Collection = RgbaCollection;
Rgba.Range = RgbaRange;
Rgba.Union = RgbaUnion;
Rgba.mimeType = 'text/x-hc9x-palette';

return Rgba;

});
