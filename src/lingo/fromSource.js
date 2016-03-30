define(function() {

	'use strict';

	var RX_LINEBREAK = /\r\n?|\n/g;
	var RX_LINE = /^((?:[^\-\xAC"\xC2\xC3\r\n]+|"[^"\r\n]*"|\-[^\-])*)([\xAC\xC2\xC3]\s*)?(?:\-\-.*)?(?:\r\n?|\n)?$/;
	var RX_TOKEN = /(#?[a-z][a-z0-9]*)|"[^"]*"|[0-9]+(\.[0-9]+)?|<[>=]?|>=?|&&?|[:=,()\[\]\+\-\/\*]/gi;
	var RX_WORD = /^[a-z][a-z0-9]*$/i;

	function expectAndRemove(array, pos, expected) {
		if (array[pos] === expected) {
			array.splice(pos, 1);
			return true;
		}
		return false;
	}

	function expectWord(array, pos) {
		return RX_WORD.test(array[pos]) ? array[pos] : false;
	}

	function isEnd(ofWhat, thing) {
		if (typeof thing === 'undefined') throw new TypeError('Invalid syntax: Expecting end ' + ofWhat);
		if (thing === 'end') return true;
		if (typeof thing === 'string') return false;
		return thing[0] === 'end' && thing.length === 2 && (thing[1] === ofWhat || true);
	}

	function doFuncWithParams(lines, linePos) {
		var tokens = lines[linePos];
		var funcName = expectWord(tokens, 1);
		if (!funcName) {
			throw new TypeError('Invalid syntax');
		}
		if (tokens.length > 2) {
			if (!expectWord(tokens, 2)) {
				throw new TypeError('Invalid syntax');
			}
			for (var pos = 3; pos < tokens.length; pos++) {
				if (!expectAndRemove(tokens, pos, ',')) {
					throw new TypeError('Invalid syntax');
				}
				if (!expectWord(tokens, pos)) {
					throw new TypeError('Invalid syntax');
				}
			}
			tokens.splice(1, tokens.length - 1, tokens.slice(1));
		}
		linePos++;
		while (linePos < lines.length) {
			if (/^(on|macro)$/.test(lines[linePos][0])) {
				break;
			}
			doLine(lines, linePos);
			if (isEnd(funcName, lines[linePos])) {
				lines.splice(linePos, 1);
				break;
			}
			tokens.push(lines.splice(linePos, 1)[0]);
		}
	}

	function doProperty(tokens, tokenPos) {
		if (tokens[tokenPos] !== 'the') throw new TypeError('Invalid syntax');
		switch(tokens[tokenPos + 1]) {
			case "number":
				if (tokens[tokenPos + 2] !== 'of') {
					tokens.splice(tokenPos, 2, ['the', 'number']);
					return;
				}
				if (tokenPos + 3 >= tokens.length) throw new TypeError('Invalid syntax');
				if (/^(castmembers|menus)$/.test(tokens[tokenPos + 3])) {
					tokens.splice(tokenPos, 4, ['the number', tokens[tokenPos + 3]]);
					return;
				}
				if (/^(chars|items|lines|words|menuitems)$/.test(tokens[tokenPos + 3])) {
					if (tokenPos + 5 >= tokens.length || !/^(in|of)$/.test(tokens[tokenPos + 4])) {
						throw new TypeError('Invalid syntax');
					}
					doUnaryExpression(tokens, tokenPos + 5);
					tokens.splice(tokenPos, 6, ['the number', tokens[tokenPos + 3], tokens[tokenPos + 5]]);
					return;
				}
				doUnaryExpression(tokens, tokenPos + 3);
				tokens.splice(tokenPos, 4, ['the', 'number', tokens[tokenPos + 3]]);
				return;
			case "long": case "abbreviated": case "abbr": case "abbrev": case "short":
				if (tokenPos + 2 >= tokens.length || !/^(date|time)$/.test(tokens[tokenPos + 2])) {
					tokens.splice(tokenPos, 2, ['the', tokens[tokenPos + 1]]);
					return;
				}
				tokens.splice(tokenPos, 3, ['the',
					tokens[tokenPos + 1].replace(/^abbr(ev)?$/, 'abbreviated')
					+ ' ' + tokens[tokenPos + 2]]);
				return;
			case "last":
				if (tokenPos + 3 >= tokens.length || !/^(char|item|line|word)$/.test(tokens[tokenPos + 2])
						|| !/^(in|of)$/.test(tokens[tokenPos + 3])) {
					tokens.splice(tokenPos, 2, ['the', 'last']);
					return;
				}
				doExpression(tokens, tokenPos + 4);
				tokens.splice(tokenPos, 5, ['text slice', tokens[tokenPos + 4], tokens[tokenPos + 2], 'the last']);
				return;
			default:
				var propName = tokens[tokenPos + 1];
				if (!RX_WORD.test(propName)) throw new TypeError('Invalid syntax');
				if (tokens[tokenPos + 2] === 'of') {
					doUnaryExpression(tokens, tokenPos + 3);
					tokens.splice(tokenPos, 4, ['the', tokens[tokenPos + 1], tokens[tokenPos + 3]]);
					return;
				}
				tokens.splice(tokenPos, 2, tokens.slice(tokenPos, tokenPos + 2));
				return;
		}
	}

	function doWordExpression(tokens, tokenPos) {
		if (!RX_WORD.test(tokens[tokenPos])) throw new TypeError('Invalid syntax');
		switch(tokens[tokenPos]) {
			case 'the':
				doProperty(tokens, tokenPos);
				return;
			case 'not':
			case 'field':
			case 'sprite':
			case 'fspriteloc':
			case 'menu':
			case 'cast':
			case 'sound':
				doUnaryExpression(tokens, tokenPos + 1);
				tokens.splice(tokenPos, 2, tokens.slice(tokenPos, tokenPos + 2));
				return;
			case 'char':
			case 'word':
			case 'item':
			case 'line':
				doUnaryExpression(tokens, tokenPos + 1);
				if (tokens[tokenPos + 2] === 'to') {
					doUnaryExpression(tokens, tokenPos + 3);
					if (tokens[tokenPos + 4] !== 'of') {
						throw new TypeError('Invalid syntax');
					}
					doUnaryExpression(tokens, tokenPos + 5);
					tokens.splice(tokenPos, 6, ['text slice',
						tokens[tokenPos + 5],
						tokens[tokenPos],
						tokens[tokenPos + 1],
						tokens[tokenPos + 3]]);
					return;
				}
				else if (tokens[tokenPos + 2] === 'of') {
					doUnaryExpression(tokens, tokenPos + 3);
					tokens.splice(tokenPos, 4, ['text slice',
						tokens[tokenPos + 3],
						tokens[tokenPos],
						tokens[tokenPos + 1]]);
					return;
				}
				else {
					throw new TypeError('Invalid syntax');					
				}
			case 'menuitem':
				doUnaryExpression(tokens, tokenPos + 1);
				if (tokens[tokenPos + 2] !== 'of') throw new TypeError('Invalid syntax');
				doUnaryExpression(tokens, tokenPos + 3);
				tokens.splice(tokenPos, 4, ['menuitem', tokens[tokenPos + 3], tokens[tokenPos + 1]]);
				return;
			case 'quote':
				tokens[tokenPos] = '"""';
				return;
			case 'enter':
				tokens[tokenPos] = '"\n"';
				return;
			case 'return':
				tokens[tokenPos] = '"\r"';
				return;
			case 'true':
				tokens[tokenPos] = '1';
				return;
			case 'false':
				tokens[tokenPos] = '0';
				return;
			default:
				if (tokens[tokenPos + 1] === '(') {
					var list = [tokens.splice(tokenPos, 1)[0]];
					doExpressionList(tokens, tokenPos, list, ')');
					return;
				}
				return;
		}
	}

	function doExpressionList(tokens, tokenPos, list, endToken) {
		var pos2 = tokenPos + 1;
		if (tokens[pos2] !== endToken) {
			doExpression(tokens, pos2);
			list.push(tokens[pos2++]);
			while (tokens[pos2] === ',') {
				doExpression(tokens, ++pos2);
				list.push(tokens[pos2++]);
			}
			if (tokens[pos2] !== endToken) {
				throw new TypeError('Invalid syntax');
			}
		}
		tokens.splice(tokenPos, 1 + pos2 - tokenPos, list);
	}

	function doUnaryExpression(tokens, tokenPos) {
		switch(tokens[tokenPos].charCodeAt(0)) {
			case 34: // "
			case 35: // #
			case 48: case 49: case 50: case 51: case 52: // 0-4
			case 53: case 54: case 55: case 56: case 57: // 5-9
				return;
			case 40: // (
				doExpression(tokens, tokenPos + 1);
				if (tokens[tokenPos + 2] !== ')') {
					throw new TypeError('Invalid syntax');
				}
				tokens.splice(tokenPos, 3, tokens[tokenPos + 1]);
				return;
			case 91: // [
				doExpressionList(tokens, tokenPos, ['['], ']');
				return;
			case 43: // +
			case 45: // -
				doUnaryExpression(tokens, tokenPos + 1);
				if (typeof tokens[tokenPos+1] === 'string'
						&& /^\d/.test(tokens[tokenPos+1])
						&& tokens[tokenPos] === '-') {
					tokens.splice(tokenPos, 2, '-' + tokens[tokenPos + 1]);
					return;
				}
				tokens.splice(tokenPos, 2, [tokens[tokenPos], tokens[tokenPos + 1]]);
				return;
			default:
				doWordExpression(tokens, tokenPos);
				return;
		}
	}

	var binOpPrecedence = [
		/^(intersects|within)$/i,
		/^([\*\/]|mod)$/i,
		/^[\-\+]$/,
		/^&{1,2}$/,
		/^(<[>=]?|>=?|=|contains|starts)$/,
		/^and$/i,
		/^or$/i,
		/^:$/i
	];

	/*
		according to DIRECTOR.HLP:

		/^(intersects|within)$/i,
		/^([\*\+\/]|mod|and|or)$/i,
		/^\-$/,
		/^&{1,2}$/,
		/^(<[>=]?|>=?|=|contains|starts)$/
	*/

	function doBinaryExpression(tokens, tokenPos, level) {
		if (level === 0) {
			doUnaryExpression(tokens, tokenPos);
		}
		else {
			doBinaryExpression(tokens, tokenPos, level - 1);
		}
		while ((tokenPos + 1) < tokens.length && binOpPrecedence[level].test(tokens[tokenPos + 1])) {
			if (level === 0) {
				doUnaryExpression(tokens, tokenPos + 2);
			}
			else {
				doBinaryExpression(tokens, tokenPos + 2, level - 1);
			}
			var binop = [
				tokens[tokenPos + 1],
				tokens[tokenPos],
				tokens[tokenPos + 2]];
			if (/^&{1,2}$/.test(binop[0])) {
				if (typeof binop[1] === 'string' && typeof binop[2] === 'string'
						&& binop[1].charAt(0) === '"' && binop[2].charAt(0) === '"') {
					binop = binop[1].slice(0, -1) + (binop[0] === '&&' ? ' ' : '') + binop[2].slice(1);
				}
			}
			tokens.splice(tokenPos, 3, binop);
		}
	}

	function doExpression(tokens, tokenPos) {
		doBinaryExpression(tokens, tokenPos, binOpPrecedence.length - 1);
	}

	function doGenericLine(lines, linePos) {
		var tokens = lines[linePos];
		if (!RX_WORD.test(tokens[0])) {
			throw new TypeError('Invalid syntax');
		}
		if (tokens.length === 1) {
			return;
		}
		var tokenPos = 1;
		if (tokens[1] === '(') {
			if (tokens[2] === ')') {
				if (tokens.length !== 3) {
					throw new TypeError('Invalid syntax');
				}
				tokens.splice(1, 2);
				return;
			}
			doExpression(tokens, 2);
			if (tokens[3] === ',') {
				tokens.splice(1, 1);
				tokenPos = 2;
				do {
					tokens.splice(tokenPos, 1);
					doExpression(tokens, tokenPos++);
				} while (tokens[tokenPos] === ',');
				if (tokenPos+1 !== tokens.length || tokens[tokenPos] !== ')') {
					throw new TypeError('Invalid syntax');
				}
				tokens.splice(tokenPos, 1);
				return;
			}
			else {
				tokens.splice(1, 3, tokens[2]);
				tokenPos = 2;
			}
		}
		else {
			doExpression(tokens, tokenPos++);
		}
		while (tokenPos < tokens.length) {
			if (!expectAndRemove(tokens, tokenPos, ',') ) {
				throw new TypeError('Invalid syntax');
			}
			doExpression(tokens, tokenPos++);
		}
	}

	function doSetLine(lines, linePos) {
		var tokens = lines[linePos];
		doExpression(tokens, 1);
		if (tokens.length === 2) {
			if (!Array.isArray(tokens[1]) || tokens[1][0] !== '=') {
				throw new TypeError("Invalid syntax");
			}
			tokens.splice(1, 1, tokens[1][1], tokens[1][2]);
		}
		else if (tokens[2] === 'to') {
			tokens.splice(2, 1);
			doExpression(tokens, 2);
			if (tokens.length !== 3) {
				throw new TypeError("Invalid syntax");
			}
		}
		else {
			throw new TypeError("Invalid syntax");
		}
	}

	function doPutLine(lines, linePos) {
		var tokens = lines[linePos];
		doExpression(tokens, 1);
		if (tokens.length === 2) {
			return;
		}
		if (!/^(into|after|before)$/.test(tokens[2])) {
			throw new TypeError('Invalid syntax');
		}
		doExpression(tokens, 3);
		if (tokens.length != 4) {
			throw new TypeError('Invalid syntax');
		}
		if (tokens[2] === 'into') {
			tokens.splice(0, 4, 'set', tokens[3], tokens[1]);
		}
		else {
			tokens.splice(0, 4, 'put ' + tokens[2], tokens[3], tokens[1]);
		}
	}

	function doIfBlock(lines, linePos) {
		var tokens = lines[linePos];
		doExpression(tokens, 1);
		if (tokens[2] !== 'then') {
			throw new TypeError('Invalid syntax');
		}
		tokens.splice(2, 1);
		if (tokens.length > 2) {
			tokens.push(tokens.splice(2, tokens.length - 2));
			doLine(tokens, tokens.length - 1);
			tokens[tokens.length-1] = [tokens[tokens.length-1]];
			if (linePos+1 < lines.length && lines[linePos+1][0] === 'else') {
				if (lines[linePos+1].length === 1) {
					throw new Error('TODO');
				}
				else {
					lines[linePos+1].splice(0, 1);
					doLine(lines, linePos + 1);
					var elseClause = lines.splice(linePos + 1, 1);
					if (elseClause.length === 1 && elseClause[0][0] === 'if') {
						tokens.push.apply(tokens, elseClause[0].slice(1));
					}
					else {
						tokens.push('else', elseClause);
					}
				}
			}
		}
		else {
			var blockStart = linePos + 1;
			for (linePos = blockStart; linePos < lines.length; linePos++) {
				if (isEnd('if', lines[linePos])) {
					lines.splice(linePos, 1);
					tokens.push(lines.splice(blockStart, linePos - blockStart));
					break;
				}
				else if (lines[linePos][0] === 'else') {
					if (lines[linePos].length === 1) {
						lines.splice(linePos, 1);
						tokens.push(lines.splice(blockStart, linePos - blockStart));
						for (linePos = blockStart; linePos < lines.length; linePos++) {
							if (isEnd('if', lines[linePos])) {
								lines.splice(linePos, 1);
								tokens.push('else', lines.splice(blockStart, linePos - blockStart));
								return;
							}
							else {
								doLine(lines, linePos);
							}
						}
					}
					else {
						tokens.push(lines.splice(blockStart, linePos - blockStart));
						linePos = blockStart;
						lines[linePos].splice(0, 1);
						doLine(lines, linePos);
						var elseClause = lines.splice(linePos, 1);
						if (elseClause.length === 1 && elseClause[0][0] === 'if') {
							tokens.push.apply(tokens, elseClause[0].slice(1));
						}
						else {
							tokens.push('else', elseClause);
						}
					}
					break;
				}
				else {
					doLine(lines, linePos);
				}
			}
		}
	}

	function doGoLine(lines, linePos) {
		var tokens = lines[linePos];
		if (tokens.length < 2) return;
		if (tokens.length === 2 && /^(loop|next|previous)$/.test(tokens[1])) {
			tokens[1] = '#' + tokens[1];
			return;
		}
		if (tokens[1] === 'to') tokens.splice(1, 1);
		if (tokens[1] === 'movie') {
			tokens[1] = '1';
			doExpression(tokens, 2);
			if (tokens.length !== 3) {
				throw new TypeError('Invalid syntax');
			}
			return;
		}
		if (tokens[1] === 'frame') tokens.splice(1, 1);
		doExpression(tokens, 1);
		if (tokens.length === 2) return;
		if (!/^(,|of)$/i.test(tokens[2])) {
			throw new TypeError('Invalid syntax');
		}
		tokens.splice(2, 1);
		if (tokens[2] === 'movie') {
			tokens.splice(2, 1);
		}
		doExpression(tokens, 2);
		if (tokens.length !== 3) {
			throw new TypeError('Invalid syntax');
		}
	}

	function doPlayLine(lines, linePos) {
		var tokens = lines[linePos];
		if (tokens.length < 2) return;
		if (tokens.length === 2 && tokens[1] === 'done') {
			lines[linePos] = ['play'];
			return;
		}
		if (tokens[1] === 'movie') {
			tokens[1] = '1';
			doExpression(tokens, 2);
			if (tokens.length !== 3) {
				throw new TypeError('Invalid syntax');
			}
			return;
		}
		if (tokens[1] === 'frame') tokens.splice(1, 1);
		doExpression(tokens, 1);
		if (tokens.length === 2) return;
		if (!/^(,|of)$/i.test(tokens[2])) {
			throw new TypeError('Invalid syntax');
		}
		tokens.splice(2, 1);
		if (tokens[2] === 'movie') {
			tokens.splice(2, 1);
		}
		doExpression(tokens, 2);
		if (tokens.length !== 3) {
			throw new TypeError('Invalid syntax');
		}
	}

	function doRepeatBlock(lines, linePos) {
		var tokens = lines[linePos];
		if (tokens[1] === 'while') {
			tokens.splice(0, 2, 'repeat while');
			doExpression(tokens, 1);
			if (tokens.length !== 2) {
				throw new TypeError('Invalid syntax');
			}
		}
		else if (tokens[1] === 'with') {
			if (tokens.length < 5) throw new TypeError('Invalid syntax');
			var counter = tokens[2];
			if (!RX_WORD.test(counter)) throw new TypeError('Invalid syntax');
			if (tokens[3] === 'in') {
				doExpression(tokens, 4);
				if (tokens.length !== 5) {
					throw new TypeError('Invalid syntax');
				} 
				lines[linePos] = tokens = ['repeat in', counter, tokens[4]];
			}
			else if (tokens[3] === '=') {
				tokens.splice(0, 4, 'repeat with', counter);
				doExpression(tokens, 2);
				if (tokens[3] === 'down') {
					if (tokens[4] !== 'to') {
						throw new TypeError('Invalid syntax');
					}
					tokens.splice(3, 2, 'down to');
				}
				else {
					if (tokens[3] !== 'to') {
						throw new TypeError('Invalid syntax');
					}
				}
				doExpression(tokens, 4);
				if (tokens.length !== 5) {
					throw new TypeError('Invalid syntax');
				}
			}
			else {
				throw new TypeError('Invalid syntax');
			}
		}
		else {
			throw new TypeError('Invalid syntax');
		}
		var blockStart = ++linePos;
		while (linePos < lines.length) {
			if (isEnd('repeat', lines[linePos])) {
				lines.splice(linePos, 1);
				break;
			}
			doLine(lines, linePos);
			tokens.push(lines.splice(linePos, 1)[0]);
		}
	}

	function doSoundLine(lines, linePos) {
		var tokens = lines[linePos];
		if (tokens.length === 1) return;
		if (!RX_WORD.test(tokens[1])) throw new TypeError('Invalid syntax');
		tokens[1] = '#' + tokens[1];
		if (tokens.length === 2) return;
		doExpression(tokens, 2);
		var pos = 3;
		while (pos < tokens.length) {
			if (tokens[pos] !== ',') throw new TypeError('Invalid syntax');
			tokens.splice(pos, 1);
			doExpression(tokens, pos++);
		}
	}

	function doWhenBlock(lines, linePos) {
		var tokens = lines[linePos];
		if (tokens.length < 3 || !/^((key|mouse)(up|down)|timeout)$/.test(tokens[1]) || tokens[2] !== 'then') {
			throw new TypeError('Invalid syntax');
		}
		if (tokens.length === 3) {
			throw new Error('TODO');
		}
		lines[linePos] = ['set', ['the', tokens[1]+'script'], ' ' + tokens.slice(3).join(' ')];
	}

	function doTellBlock(lines, linePos) {
		var tokens = lines[linePos];
		doExpression(tokens, 1);
		var tellTarget = tokens[1];
		if (tokens.length === 2) {
			linePos++;
			while (linePos < lines.length && !isEnd('tell', lines[linePos])) {
				doLine(lines, linePos);
				tokens.push(lines.splice(linePos, 1)[0]);
			}
			lines.splice(linePos, 1);
			return;
		}
		if (tokens[2] !== 'to') {
			throw new TypeError('Invalid syntax');
		}
		else {
			tokens.splice(0, 3);
			doLine(lines, linePos);
			lines[linePos] = ['tell', tellTarget, lines[linePos]];
		}
	}

	function doOpenLine(lines, linePos) {
		var tokens = lines[linePos];
		doExpression(tokens, 1);
		if (tokens.length === 2) {
			return;
		}
		if (!/^(,|with)$/.test(tokens[2])) {
			throw new TypeError('Invalid syntax');
		}
		tokens.splice(2, 1);
		doExpression(tokens, 2);
		if (tokens.length !== 3) {
			throw new TypeError('Invalid Syntax');
		}
	}

	function doLine(lines, linePos) {
		switch(lines[linePos][0]) {
			case 'on':
			case 'macro':
				doFuncWithParams(lines, linePos);
				break;
			case 'put':
				doPutLine(lines, linePos);
				break;
			case 'set':
				doSetLine(lines, linePos);
				break;
			case 'if':
				doIfBlock(lines, linePos);
				break;
			case 'go':
				doGoLine(lines, linePos);
				break;
			case 'play':
				doPlayLine(lines, linePos);
				break;
			case 'repeat':
				doRepeatBlock(lines, linePos);
				break;
			case 'when':
				doWhenBlock(lines, linePos);
				break;
			case 'sound':
				doSoundLine(lines, linePos);
				break;
			case 'tell':
				doTellBlock(lines, linePos);
				break;
			case 'open':
				doOpenLine(lines, linePos);
				break;
			case 'exit':
				if (lines[linePos].length > 1) {
					if (lines[linePos].length === 2 && lines[linePos][1] === 'repeat') {
						lines[linePos] = ['exit repeat'];
					}
					else {
						throw new TypeError('Invalid syntax');
					}
				}
				break;
			case 'next':
				if (lines[linePos].length === 2 && lines[linePos][1] === 'repeat') {
					lines[linePos] = ['next repeat'];
				}
				else {
					throw new TypeError('Invalid syntax');
				}
				break;
			default:
				doGenericLine(lines, linePos);
				break;
		}
	}

	function fromSource(source) {
		var lines = source.split(RX_LINEBREAK);
		for (var i = lines.length-1; i >= 0; i--) {
			var line = lines[i].match(RX_LINE);
			var tokens = [];
			var nonTokens = line[1].replace(RX_TOKEN, function(token, word) {
				if (word) {
					token = word.toLowerCase();
				}
				tokens.push(token);
				return '';
			});
			if (/\S/.test(nonTokens)) {
				throw new TypeError('Invalid syntax');
			}
			if (line[2]) {
				lines.splice(i, 2, tokens.concat(lines[i + 1] || []));
			}
			else if (tokens.length === 0) {
				lines.splice(i, 1);
			}
			else {
				lines[i] = tokens;
			}
		}
		for (var linePos = 0; linePos < lines.length; linePos++) {
			doLine(lines, linePos);
		}
		return lines;
	}

	return fromSource;

});
