define(function() {

	'use strict';

	function RangeSpec(offset, length) {
		offset = +(offset || 0);
		if (isNaN(offset) || offset < 0 || !isFinite(offset)) {
			throw new TypeError('offset must be a finite number >= 0');
		}
		length = +length;
		if (isNaN(length)) length = Infinity;
		if (length < 0) {
			throw new TypeError('length cannot be negative');
		}
		this.offset = offset;
		this.length = length;
	}
	RangeSpec.prototype = {
		constructor: RangeSpec,
		offset: 0,
		length: Infinity,
		get afterOffset() {
			return this.offset + this.length;
		},
		getSubrange: function(offset, length) {
			offset = +(offset || 0);
			if (isNaN(offset) || offset < 0 || !isFinite(offset)) {
				throw new TypeError('offset must be a finite number >= 0');
			}
			offset = Math.min(offset, this.length);
			length = +length;
			if (isNaN(length)) length = Infinity;
			offset += this.offset;
			length = Math.min(length, this.afterOffset - offset);
			var subrange = new this.constructor(offset, length);
			this.initSubrange(subrange);
			return subrange;
		},
		toJSON: function() {
			if (isFinite(this.length)) {
				return {offset:this.offset, length:this.length};
			}
			return {offset:this.offset};
		},
		compareTo: function(otherRange) {
			// return >0 to take precedence, <0 if the other range should take precedence, or 0 if it doesn't matter
			return 1;
		},
		initSubrange: function(subrange) { },
	};

	function reduce_addLength(addTo, object) {
		return addTo + object.length;
	}

	function RangeSpecSet() {
		this.ranges = [];
	}
	RangeSpecSet.prototype = {
		get totalLength() {
			return this.ranges.reduce(reduce_addLength, 0);
		},
		getTotalLengthWhere: function(condition) {
			return this.ranges.filter(condition).reduce(reduce_addLength, 0);
		},
		slice: function(startOffset, endOffset) {
			var set = new RangeSpecSet();
			if (endOffset <= startOffset) {
				if (endOffset < startOffset) {
					console.warn('remember slice() takes two offsets, not an offset and a length');
				}
				return set;
			}
			var i = this.findIndexForOffset(startOffset);
			if (i < 0) {
				i = ~i;
				if (i === this.ranges.length) return set;
				startOffset = this.ranges[i].offset;
			}
			else {
				var range = this.ranges[i];
				var diff = startOffset - range.offset;
				if (diff > 0) {
					if (endOffset <= range.afterOffset) {
						set.put(this.ranges[i].getSubrange(diff, endOffset - (range.offset + diff)));
						return;
					}
					set.put(range.getSubrange(diff, range.length - diff));
					startOffset = range.afterOffset;
					i++;
				}
			}
			for (; i < this.ranges.length && endOffset > this.ranges[i].offset; i++) {
				var endDiff = endOffset - this.ranges[i].afterOffset;
				if (endDiff < 0) {
					set.put(this.ranges[i].getSubrange(0, endOffset - this.ranges[i].offset));
					break;
				}
				set.put(this.ranges[i]);
				if (endDiff === 0) {
					break;
				}
			}
			return set;
		},
		put: function(range) {
			if (range.length === 0) return;
			var i = this.findIndexForOffset(range.offset);
			if (i < 0) {
				i = ~i;
				if (i === this.ranges.length || range.afterOffset <= this.ranges[i].offset) {
					this.ranges.splice(i, 0, range);
					return;
				}
				if (range.compareTo(this.ranges[i]) < 0) {
					var diff = this.ranges[i].offset - range.offset;
					this.ranges.splice(i++, 0, range.getSubrange(0, diff));
					return this.put(range.getSubrange(diff + this.ranges[i].length));
				}
			}
			else {
				if (range.compareTo(this.ranges[i]) < 0) {
					return this.put(range.getSubrange(this.ranges[i].afterOffset - range.offset));
				}
				var preLength = range.offset - this.ranges[i].offset;
				if (preLength > 0) {
					this.ranges.splice(i, 1, this.ranges[i].getSubrange(0, preLength), this.ranges[i].getSubrange(preLength));
					i++;
				}
			}
			for (var j = i; ; ) {
				if (range.afterOffset < this.ranges[j].afterOffset) {
					this.ranges.splice(i, 1 + j - i, range,
						this.ranges[j].getSubrange(range.afterOffset - this.ranges[j].offset));
					return;
				}
				j++;
				if (j === this.ranges.length || range.afterOffset <= this.ranges[j].offset) {
					this.ranges.splice(i, j - i, range);
					return;
				}
			}
		},
		clear: function(range) {
			if (arguments.length === 0) {
				this.ranges.splice(0, this.ranges.length);
				return;
			}
			if (range.length === 0) return;
			var i = this.findIndexForOffset(range.offset);
			if (i < 0) {
				i = ~i;
				if (i === this.ranges.length || range.afterOffset <= this.ranges[i].offset) {
					return;
				}
			}
			else {
				var preLength = range.offset - this.ranges[i].offset;
				if (preLength > 0) {
					this.ranges.splice(i, 1, this.ranges[i].getSubrange(0, preLength), this.ranges[i].getSubrange(preLength));
					i++;
				}
			}
			for (var j = i; ; ) {
				if (range.afterOffset < this.ranges[j].afterOffset) {
					this.ranges.splice(i, 1 + j - i,
						this.ranges[j].getSubrange(range.afterOffset - this.ranges[j].offset));
					return;
				}
				j++;
				if (j === this.ranges.length || range.afterOffset <= this.ranges[j].offset) {
					this.ranges.splice(i, j - i);
					return;
				}
			}
		},
		findIndexForOffset: function(offset) {
			var ranges = this.ranges;
			var min_i = 0, max_i = ranges.length - 1;
			while (min_i <= max_i) {
				var i = ((min_i + max_i) / 2) | 0;
				if (offset < ranges[i].offset) {
					if (i === 0) return ~0;
					max_i = i - 1;
				}
				else if (offset >= ranges[i].afterOffset) {
					min_i = i + 1;
				}
				else {
					return i;
				}
			}
			return ~ranges.length;
		},
		toJSON: function() {
			return this.ranges;
		},
	};

	RangeSpec.Set = RangeSpecSet;

	function RangeSpecWithPriority(offset, length, priority) {
		RangeSpec.call(this, offset, length);
		this.priority = priority;
	}
	(function(proto) {
		proto.constructor = RangeSpecWithPriority;
		proto.compareTo = function(other) {
			return this.priority - (other.priority || (this.priority - 1));
		};
		proto.initSubrange = function(subrange) {
			subrange.priority = this.priority;
		};
		proto.toJSON = function() {
			var object = RangeSpec.prototype.toJSON.apply(this);
			object.priority = this.priority;
			return object;
		};
	})(RangeSpecWithPriority.prototype = new RangeSpec);

	RangeSpec.WithPriority = RangeSpecWithPriority;

	return RangeSpec;

});
