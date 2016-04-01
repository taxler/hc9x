define(function() {

	"use strict";

	function findPath(bytes, startPos, pathCache) {
		if (typeof pathCache[startPos] !== 'undefined') return pathCache[startPos];
		for (var pos = startPos; pos < bytes.length; ) {
			var code = bytes[pos];
			if (code < 0x40) {
				switch(code) {
					case 0x01:
						var path = pathCache[startPos] = bytes.subarray(startPos, pos);
						path.startPos = startPos;
						path.next = 'exit';
						return path;
				}
				pos += 1;
			}
			else if (code < 0x80) {
				switch(code) {
					case 0x54:
						var path = pathCache[startPos] = bytes.subarray(startPos, pos);
						path.startPos = startPos;
						var jumpTo = pos - bytes[pos + 1];
						path.next = 'next repeat'; // jumpTo;
						findPath(bytes, jumpTo, pathCache);
						return path;
				}
				pos += 2;
			}
			else {
				switch(code) {
					case 0x93:
						var path = pathCache[startPos] = bytes.subarray(startPos, pos);
						path.startPos = startPos;
						var jumpTo = pos + bytes[pos + 1] * 0x100 + bytes[pos + 2];
						path.next = jumpTo;
						findPath(bytes, jumpTo, pathCache);
						return path;
					case 0x95:
						var path = pathCache[startPos] = bytes.subarray(startPos, pos);
						path.startPos = startPos;
						var jumpFalse = pos + bytes[pos + 1] * 0x100 + bytes[pos + 2];
						var jumpTrue = pos + 3;
						path.next = 'conditional';
						path.nextFalse = jumpFalse;
						path.nextTrue = jumpTrue;
						findPath(bytes, jumpFalse, pathCache);
						findPath(bytes, jumpTrue, pathCache);
						return path;
				}
				pos += 3;
			}
		}
		var path = bytes.subarray(startPos);
		path.startPos = startPos;
		path.next = 'exit';
		return path;
	}

	function fromBytecodeMV93(bytes, argumentNames, localVarNames, externalNames, constants, funcName) {
		var pathsByPos = {};
		findPath(bytes, 0, pathsByPos);
		var paths = Object.keys(pathsByPos).sort(function(a, b){ return a - b; });
		for (var i = 0; i < paths.length; i++) {
			var path = pathsByPos[paths[i]];
			if ((i + 1) < paths.length) {
				var myStart = path.startPos, nextStart = pathsByPos[paths[i + 1]].startPos;
				var myEnd = myStart + path.length;
				if (myEnd > nextStart) {
					var oldPath = path;
					path = path.subarray(0, nextStart - myStart);
					path.startPos = myStart;
					if ('startLoop' in oldPath) path.startLoop = oldPath.startLoop;
					if ('endLoop' in oldPath) path.endLoop = oldPath.endLoop;
					path.next = nextStart;
					pathsByPos[myStart] = path;
				}
			}
			if (typeof path.next === 'number' && path.next < (path.startPos + path.length)) {
				var startLoop = pathsByPos[path.next];
				startLoop.startLoop = true;
				pathsByPos[startLoop.nextFalse].endLoop = true;
			}
		}
		function toLingo(pos, endPos) {
			var bytes = pathsByPos[pos];
			var endOffset = bytes.length;
			if (!isNaN(endPos)) endOffset = Math.min(endOffset, endPos - pos);
			var steps = [];
			var stack = [];
			function step(name) {
				if (Array.isArray(arguments[0])) {
					steps.push(arguments[0]);
				}
				else {
					steps.push(Array.prototype.slice.apply(arguments));
				}
			}
			function expr(v) {
				stack.push(v);
			}
			function op(name, count) {
				if (isNaN(count)) count = 2;
				if (count > stack.length) {
					throw new Error('stack underflow');
				}
				stack.push([name].concat(stack.splice(stack.length - count, count)));
			}
			function global(n) {
				if (typeof bytes.globals === 'undefined') {
					bytes.globals = {};
				}
				var name = externalNames[n];
				bytes.globals[name] = true;
				return name;
			}
			function topcode() {
				if (stack.length === 0) {
					throw new Error('stack underflow');
				}
				var tc = stack.pop();
				if (isNaN(tc)) {
					throw new Error('invalid topcode on stack');
				}
				return +tc;
			}
			function slice() {
				if (stack.length < 9) {
					throw new Error('stack underflow');
				}
				var values = stack.splice(stack.length - 9, 9);
				var unit;
				var sliceStart, sliceStop;
				if (values[0] !== '0') {
					unit = 'char';
					sliceStart = values[0];
					sliceStop = values[1];
				}
				else if (values[2] !== '0') {
					unit = 'word';
					sliceStart = values[2];
					sliceStop = values[3];
				}
				else if (values[4] !== '0') {
					unit = 'item';
					sliceStart = values[4];
					sliceStop = values[5];
				}
				else if (values[6] !== '0') {
					unit = 'line';
					sliceStart = values[6];
					sliceStop = values[7];
				}
				else {
					throw new Error('invalid text slice');
				}
				return ['text slice', values[8], unit, sliceStart].concat(sliceStop === '0' ? [] : [sliceStop]);
			}
			function menuitem() {
				if (stack.length < 2) {
					throw new Error('stack underflow');
				}
				var menu_id = stack.pop();
				var item_id = stack.pop();
				return ['menuitem', menu_id, item_id];
			}
			function property(code, arg, id) {
				switch((arg << 8) | id) {
					case 0x0000: return ['the','floatprecision'];
					case 0x0001: return ['the','mousedownscript'];
					case 0x0002: return ['the','mouseupscript'];
					case 0x0003: return ['the','keydownscript'];
					case 0x0004: return ['the','keyupscript'];
					case 0x0005: return ['the','timeoutscript'];
					case 0x0006: return ['the','short time'];
					case 0x0007: return ['the','abbreviated time'];
					case 0x0008: return ['the','long time'];
					case 0x0009: return ['the','short date'];
					case 0x000A: return ['the','abbreviated date'];
					case 0x000B: return ['the','long date'];
					case 0x000C: return ['text slice', stack.pop(), 'char', 'the last'];
					case 0x000D: return ['text slice', stack.pop(), 'word', 'the last'];
					case 0x000E: return ['text slice', stack.pop(), 'item', 'the last'];
					case 0x000F: return ['text slice', stack.pop(), 'line', 'the last'];
					case 0x0101: return ['the number', 'chars', stack.pop()];
					case 0x0102: return ['the number', 'words', stack.pop()];
					case 0x0103: return ['the number', 'items', stack.pop()];
					case 0x0104: return ['the number', 'lines', stack.pop()];
					case 0x0201: return ['the','name',            op('menu',1)];
					case 0x0202: return ['the number','menuitems',op('menu',1)];
					case 0x0301: return ['the','name',            menuitem()];
					case 0x0302: return ['the','checkmark',       menuitem()];
					case 0x0303: return ['the','enabled',         menuitem()];
					case 0x0304: return ['the','script',          menuitem()];
					case 0x0401: return ['the','volume',          op('sound',1)];
					case 0x0601: return ['the','type',            op('sprite',1)];
					case 0x0602: return ['the','backcolor',       op('sprite',1)];
					case 0x0603: return ['the','bottom',          op('sprite',1)];
					case 0x0604: return ['the','castnum',         op('sprite',1)];
					case 0x0605: return ['the','constraint',      op('sprite',1)];
					case 0x0606: return ['the','cursor',          op('sprite',1)];
					case 0x0607: return ['the','forecolor',       op('sprite',1)];
					case 0x0608: return ['the','height',          op('sprite',1)];
					case 0x060A: return ['the','ink',             op('sprite',1)];
					case 0x060B: return ['the','left',            op('sprite',1)];
					case 0x060C: return ['the','linesize',        op('sprite',1)];
					case 0x060D: return ['the','loch',            op('sprite',1)];
					case 0x060E: return ['the','locv',            op('sprite',1)];
					case 0x060F: return ['the','movierate',       op('sprite',1)];
					case 0x0610: return ['the','movietime',       op('sprite',1)];
					case 0x0612: return ['the','puppet',          op('sprite',1)];
					case 0x0613: return ['the','right',           op('sprite',1)];
					case 0x0614: return ['the','starttime',       op('sprite',1)];
					case 0x0615: return ['the','stoptime',        op('sprite',1)];
					case 0x0616: return ['the','stretch',         op('sprite',1)];
					case 0x0617: return ['the','top',             op('sprite',1)];
					case 0x0618: return ['the','trails',          op('sprite',1)];
					case 0x0619: return ['the','visible',         op('sprite',1)];
					case 0x061A: return ['the','volume',          op('sprite',1)];
					case 0x061B: return ['the','width',           op('sprite',1)];
					case 0x061D: return ['the','scriptnum',       op('sprite',1)];
					case 0x061E: return ['the','moveablesprite',  op('sprite',1)];
					case 0x0620: return ['the','scorecolor',      op('sprite',1)];
					case 0x0701: return ['the','beepon'];
					case 0x0702: return ['the','buttonstyle'];
					case 0x0703: return ['the','centerstage'];
					case 0x0704: return ['the','checkboxaccess'];
					case 0x0705: return ['the','checkboxtype'];
					case 0x0706: return ['the','colordepth'];
					case 0x0708: return ['the','exitlock'];
					case 0x0709: return ['the','fixstagesize'];
					case 0x0713: return ['the','timeoutlapsed'];
					case 0x0717: return ['the','selend'];
					case 0x0718: return ['the','selstart'];
					case 0x0719: return ['the','soundenabled'];
					case 0x071A: return ['the','soundlevel'];
					case 0x071B: return ['the','stagecolor'];
					case 0x071D: return ['the','stilldown'];
					case 0x071E: return ['the','timeoutkeydown'];
					case 0x071F: return ['the','timeoutlength'];
					case 0x0720: return ['the','timeoutmouse'];
					case 0x0721: return ['the','timeoutplay'];
					case 0x0722: return ['the','timer'];
					case 0x0801: return ['the','perframehook'];
					case 0x0802: return ['the number', 'castmembers'];
					case 0x0803: return ['the number', 'menus'];
					case 0x0901: return ['the','name',       op('cast', 1)];
					case 0x0902: return ['the','text',       op('cast', 1)];
					case 0x0908: return ['the','picture',    op('cast', 1)];
					case 0x090A: return ['the','number',     op('cast', 1)];
					case 0x090B: return ['the','size',       op('cast', 1)];
					case 0x0911: return ['the','forecolor',  op('cast', 1)];
					case 0x0912: return ['the','backcolor',  op('cast', 1)];
					case 0x0C03: return ['the','textStyle',  op('field', 1)];
					case 0x0C04: return ['the','textFont',   op('field', 1)];
					case 0x0C05: return ['the','textheight', op('field', 1)];
					case 0x0C06: return ['the','textAlign',  op('field', 1)];
					case 0x0C07: return ['the','textSize',   op('field', 1)];
					case 0x0D10: return ['the','sound',      op('cast', 1)];
				}
				throw new Error(
					'Unknown bytecode: 0x' + code.toString(16)
					+ ' 0x' + arg.toString(16)
					+ ' [0x' + id.toString(16) + ']');
			}
			for (var pos = 0; pos < endOffset; ) {
				var code = bytes[pos];
				var offset, arg;
				if (code >= 0x80) {
					offset = 3;
					arg = bytes[pos + 1] * 0x100 + bytes[pos + 2];
				}
				else if (code >= 0x40) {
					offset = 2;
					arg = bytes[pos + 1];
				}
				else {
					offset = 1;
				}
				switch(code) {
					case 0x03: expr('0');               break;
					case 0x04: op('*');                 break;
					case 0x05: op('+');                 break;
					case 0x06: op('-');                 break;
					case 0x07: op('/');                 break;
					case 0x08: op('mod');               break;
					case 0x09: op('-', 1);              break;
					case 0x0A: op('&');                 break;
					case 0x0B: op('&&');                break;
					case 0x0C: op('<');                 break;
					case 0x0D: op('<=');                break;
					case 0x0E: op('<>');                break;
					case 0x0F: op('=');                 break;
					case 0x10: op('>');                 break;
					case 0x11: op('>=');                break;
					case 0x12: op('and');               break;
					case 0x13: op('or');                break;
					case 0x14: op('not', 1);            break;
					case 0x15: op('contains');          break;
					case 0x16: op('starts');            break;
					case 0x17: expr(slice());           break;
					case 0x18: step('hilite', slice()); break;
					case 0x19: op('intersects');        break;
					case 0x1A: op('within');            break;
					case 0x1B: op('field', 1);          break;
					case 0x1C: throw new Error('TODO: support tell'); break;
					case 0x1D: throw new Error('TODO: support tell'); break;
					case 0x1E:
						// init list (for garbage collection...?)
						if (stack.length === 0) {
							throw new Error('stack underflow');
						}
						var list = stack[stack.length - 1];
						if (!Array.isArray(list)) {
							throw new Error('invalid list initialization');
						}
						list.splice(0, 0, '[');
						break;
					case 0x1F:
						if (stack.length === 0) {
							throw new Error('stack underflow');
						}
						var list = stack[stack.length-1];
						if (!Array.isArray(list) || (list.length%2 !== 0)) {
							throw new Error('invalid associative list');
						}
						for (var i = list.length-2; i >= 1; i--) {
							list.splice(i, 2, [':'].concat(list.slice(i, i+2)));
						}
						list.splce(0, 0, '[');
						break;
					case 0x41: case 0x81:
						expr('' + arg);
						break;
					case 0x42: case 0x43: case 0x82: case 0x83:
						if (arg > stack.length) {
							throw new Error('stack underflow');
						}
						list = stack.splice(stack.length - arg, arg);
						if ((code & 0x0f) === 0x02) {
							list.forStep = true;
						}
						expr(list);
						break;
					case 0x44:
						expr(constants[arg / 6]);
						break;
					case 0x45:
						expr('#' + externalNames[arg].toLowerCase());
						break;
					case 0x46:
						expr(global(arg));
						break;
					case 0x49:
						expr(global(arg));
						break;
					case 0x4B:
						expr(argumentNames[arg / 6]);
						break;
					case 0x4C:
						expr(localVarNames[arg / 6]);
						break;
					case 0x4F:
						step('set', global(arg), stack.pop());
						break;
					case 0x52:
						step('set', localVarNames[arg / 6], stack.pop());
						break;
					case 0x56: case 0x57: case 0x63: // 63: in tell block
						if (stack.length === 0) {
							throw new Error('stack underflow');
						}
						var callArgs = stack.pop();
						var call = [externalNames[arg]].concat(callArgs);
						if (callArgs.forStep) {
							step(call);
						}
						else {
							expr(call);
						}
						break;
					case 0x58:
						if (stack.length < 2) {
							throw new Error('stack underflow');
						}
						var methodTarget = stack.pop();
						var argList = stack.pop();
						if (typeof methodTarget === 'string' && /^\d+$/.test(methodTarget)) {
							switch (arg) {
								case 0x05: methodTarget = localVarNames[+methodTarget / 6]; break;
								case 0x01: methodTarget = argumentNames[+methodTarget / 6]; break;
								default: throw new Error('Unsupported method dispatch mode: 0x' + arg.toString(16));
							}
						}
						if (argList.forStep) {
							step([methodTarget].concat(argList));
						}
						else {
							expr([methodTarget].concat(argList));
						}
						break;
					case 0x59:
					case 0x5B:
						throw new Exception("more research needed");
					case 0x5C:
						expr(property(code, arg, topcode()));
						break;
					case 0x5D:
						var id = topcode();
						var newValue = stack.pop();
						step('set', expr(code, arg, id), newValue);
						break;
					case 0x5F:
						expr(['the', externalNames[arg]]);
						break;
					case 0x60:
						step(['set', ['the', externalNames[arg]], stack.pop()]);
						break;
					case 0x61:
						expr(['the', externalNames[arg], stack.pop()]);
						break;
					case 0x62:
						var newValue = stack.pop();
						step(['set', ['the', externalNames[arg], stack.pop()], newValue]);
						break;
					case 0x64:
						step(['stack push', -(1 + arg)]);
						stack.push(stack[stack.length - (1 + arg)]);
						break;
					case 0x65:
						step(['stack pop', arg]);
						stack.splice(stack.length - arg, arg);
						break;
					case 0x66:
						stack.pop(); // empty list?
						expr(['the', externalNames[arg]]);
						break;
					default: throw new Error('Unknown bytecode: 0x' + code.toString(16));
				}
				pos += offset;
			}
			if (bytes.next === 'exit' || bytes.next === 'next repeat') {
				steps.push([bytes.next]);
			}
			else if (bytes.next === 'conditional') {
				if (stack.length !== 1) {
					if (stack.length === 0) {
						throw new Error('no stack value for conditional');
					}
					throw new Error('extra stack: ' + JSON.stringify(stack.slice(0, stack.length-1)));
				}
				if (bytes.startLoop) {
					var repeat_while = ['repeat while', stack.pop()].concat(toLingo(bytes.nextTrue, bytes.nextFalse));
					var last = repeat_while[repeat_while.length-1];
					if (repeat_while.length > 2 && last.length === 1 && last[0] === 'next repeat') {
						repeat_while.pop();
					}
					steps.push(repeat_while);
					var after = toLingo(bytes.nextFalse, endPos);
					steps = steps.concat(after);
					steps.next = after.next;
				}
				else {
					var nextTrue = toLingo(bytes.nextTrue, bytes.nextFalse);
					if (typeof nextTrue.next !== 'number' || nextTrue.next >= bytes.nextFalse) {
						steps.push(['if', stack.pop(), nextTrue]);
						var nextFalse = toLingo(bytes.nextFalse, endPos);
						steps = steps.concat(nextFalse);
						steps.next = nextFalse.next;
					}
					else {
						var nextFalse = toLingo(bytes.nextFalse, nextTrue.next);
						steps.push(['if', stack.pop(), nextTrue, 'else', nextFalse]);
						var after = toLingo(nextTrue.next, endPos);
						steps = steps.concat(after);
						steps.next = after.next;
					}
				}
			}
			else {
				if (stack.length !== 0) {
					throw new Error('extra stack: ' + JSON.stringify(stack));
				}
				if (pathsByPos[bytes.next].endLoop) {
					steps.push(['exit repeat']);
				}
				else if (steps.next < (pos + endOffset)) {
					var nextBit = toLingo(bytes.next);
					steps = steps.concat(nextBit);
					if (typeof nextBit.next !== 'undefined') {
						steps.next = nextBit.next;
					}
				}
				else {
					steps.next = bytes.next;
				}
			}
			return steps;
		}
		var syntax = toLingo(0);
		if (syntax.length > 0) {
			var last = syntax[syntax.length-1];
			if (last.length === 1 && last[0] === 'exit') {
				syntax.pop();
			}
		}
		return [['on', argumentNames.length === 0 ? funcName : [funcName].concat(argumentNames)].concat(syntax)];
	}

	return fromBytecodeMV93;
	
});
