define(function() {

	"use strict";

	function binopToSource(expr, binopLevel, contextLevel) {
		var source = exprToSource(expr[1], binopLevel)
			+ ' ' + expr[0] + ' '
			+ exprToSource(expr[2], binopLevel - 1);
		if (binopLevel > contextLevel) return '(' + source + ')';
		return source;
	}

	function propertyToSource(expr) {
		if (expr.length === 2) {
			return 'the ' + expr[1];
		}
		if (expr.length === 3) {
			return 'the ' + expr[1] + ' of ' + exprToSource(expr[2]);
		}
		throw new Error('Invalid syntax');
	}

	function exprToSourceTopLevel(expr) {
		return exprToSource(expr, 1000);
	}

	function unopToSource(expr) {
		var prefix = expr[0];
		if (/^[a-z]/i.test(prefix)) prefix += ' ';
		return prefix + exprToSource(expr[1], -1);
	}

	function exprToSource(expr, level) {
		if (typeof expr === 'string') {
			if (expr === '""') return 'EMPTY';
			if (expr === '"""') return 'QUOTE';
			if (expr === '"\r"') return 'RETURN';
			if (expr === '"\n"') return 'ENTER';
			return expr;
		}
		if (isNaN(level)) level = 1000;
		switch(expr[0]) {
			case 'the':
				return propertyToSource(expr);
			case 'the number':
				if (expr.length === 2) {
					return 'the number of ' + expr[1];
				}
				return 'the number of ' + expr[1] + ' in ' + exprToSource(expr[2]);
			case 'text slice':
				if (expr.length === 5) {
					return expr[2] + ' ' + exprToSource(expr[3]) + ' to ' + exprToSource(expr[4]) + ' of ' + exprToSource(expr[1]);
				}
				if (expr[3] === 'the last') {
					return 'the last ' + expr[2] + ' of ' + exprToSource(expr[1]);
				}
				return expr[2] + ' ' + exprToSource(expr[3]) + ' of ' + exprToSource(expr[1]);
			case 'intersects': case 'within':
				return binopToSource(expr, 0, level);
			case '*': case '/': case 'mod':
				return binopToSource(expr, 1, level);
			case 'not':
				return unopToSource(expr);
			case '+': case '-':
				if (expr.length === 2) {
					return unopToSource(expr);
				}
				return binopToSource(expr, 2, level);
			case '&': case '&&':
				return binopToSource(expr, 3, level);
			case '<': case '<=': case '<>': case '>': case '>=': case '=':
				return binopToSource(expr, 4, level);
			case 'and':
				return binopToSource(expr, 5, level);
			case 'or':
				return binopToSource(expr, 6, level);
			case ':':
				return exprToSource(expr[1]) + ': ' + exprToSource(expr[2]);
			case 'not':
			case 'field':
			case 'sprite':
			case 'fspriteloc':
			case 'menu':
			case 'cast':
			case 'sound':
				return expr[0] + ' ' + exprToSource(expr[1], -1);
			case '[': return '[' + expr.slice(1).map(exprToSourceTopLevel).join(', ') + ']';
			case ':': return expr[1] + ': ' + expr[2];
			default: return expr[0] + '(' + expr.slice(1).map(exprToSourceTopLevel).join(', ') + ')';
		}
	}

	function genericStatementToSource(step) {
		if (step.length === 1) return step[0];
		return step[0] + ' ' + step.slice(1).map(exprToSourceTopLevel).join(', ');		
	}

	function stepToSource(step) {
		switch(step[0]) {
			case 'macro': case 'on':
				var name, args;
				if (Array.isArray(step[1])) {
					name = step[1][0];
					args = ' ' + step[1].slice(1).join(', ');
				}
				else {
					name = step[1];
					args = '';
				}
				return step[0] + ' ' + name + args + '\n'
					+ this + '  ' + step.slice(2).map(stepToSource, this + '  ').join('\n' + this + '  ') + '\n'
					+ this + 'end ' + name + '\n';
			case 'if':
				var buf = [];
				for (var i = 1; i < step.length; i += 2) {
					if (step[i] === 'else') {
						buf.push('else\n');
					}
					else {
						buf.push((i === 1 ? 'if ' : 'else if ') + exprToSource(step[i]) + ' then\n');
					}
					buf.push(this + '  ' + step[i + 1].map(stepToSource, this + '  ').join('\n' + this + '  ') + '\n' + this);
				}
				buf.push('end if');
				return buf.join('');
			case 'set':
				return 'set ' + exprToSource(step[1]) + ' to ' + exprToSource(step[2]);
			case 'sound':
				if (step.length > 1 && typeof step[1] === 'string' && /^#/.test(step[1])) {
					if (step.length === 2) {
						return 'sound ' + step[1].substr(1);
					}
					return 'sound ' + step[1].substr(1) + ' ' + step.slice(2).map(exprToSourceTopLevel).join(', ');
				}
				return genericStatementToSource(step);
			case 'repeat while':
				return 'repeat while ' + exprToSourceTopLevel(step[1]) + '\n'
					+ this + '  ' + step.slice(2).map(stepToSource, this + '  ').join('\n' + this + '  ') + '\n'
					+ this + 'end repeat';
			case 'repeat with':
				return 'repeat with ' + step[1] + ' = ' + exprToSourceTopLevel(step[2]) + ' ' + step[3] + ' ' + exprToSourceTopLevel(step[4]) + '\n'
					+ this + '  ' + step.slice(5).map(stepToSource, this + '  ').join('\n' + this + '  ') + '\n'
					+ this + 'end repeat';
			case 'repeat in':
				return 'repeat with ' + step[1] + ' in ' + exprToSource(step[2]) + '\n'
					+ this + '  ' + step.slice(3).map(stepToSource, this + '  ').join('\n' + this + '  ') + '\n'
					+ this + 'end repeat';
			case 'put after':
				return 'put ' + exprToSource(step[2]) + ' after ' + exprToSource(step[1]);
			case 'put before':
				return 'put ' + exprToSource(step[2]) + ' before ' + exprToSource(step[1]);
			case 'go':
				if (step.length === 2) {
					if (typeof step[1] === 'string' && /^#(next|previous|loop)$/.test(step[1])) {
						return 'go ' + step[1].substr(1);
					}
					return 'go to frame ' + exprToSource(step[1]);
				}
				if (step.length === 3) {
					if (step[1] === '1') {
						return 'go to movie ' + exprToSource(step[2]);
					}
					else {
						return 'go to frame ' + exprToSource(step[1]) + ' of movie ' + exprToSource(step[2]);
					}
				}
				return genericStatementToSource(step);
			case 'repeat in':
				return 'repeat with ' + step[1] + ' in ' + exprToSource(step[2]) + '\n'
					+ this + step.slice(3).join('\n') + '\n'
					+ this + 'end repeat';
			default:
				return genericStatementToSource(step);
		}
	}
	
	function toSource(tree) {
		return tree.map(stepToSource, '').join('\n');
	}

	return toSource;

});
