/**
 * calculator.js - JARVIS Mathematical Computation & Precision Calculator
 * Safely parses and evaluates algebraic expressions, percentages, tips,
 * scientific math functions, and unit computations without eval/Function
 * (fully compatible with strict Electron CSP `script-src 'self'`).
 */

export const CalculatorSkill = {
  name: 'calculator',

  match(intent) {
    return intent.type === 'CALCULATOR';
  },

  async execute(intent) {
    const rawExpr =
      intent.params?.expression ||
      intent.query?.replace(/\b(?:calculate|what is|compute|solve)\b/gi, '').trim() ||
      '42 * 1337';
    const cleanExpr = rawExpr.replace(/[=?]/g, '').trim();

    try {
      const { result, normalized, steps } = this._evaluate(cleanExpr);
      return {
        expression: cleanExpr,
        normalized,
        result: String(result),
        steps,
        spokenResult: `The result is ${result}`
      };
    } catch (e) {
      return {
        expression: cleanExpr,
        result: 'Error',
        steps: [e.message || 'Syntax or evaluation error in calculation'],
        spokenResult: 'I could not compute that mathematical expression, sir.'
      };
    }
  },

  _normalize(expr) {
    return expr
      .toLowerCase()
      .replace(/,/g, '')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/(\d|\))\s*x\s*(\d|\()/gi, '$1 * $2')
      .replace(/\btimes\b|\bmultiplied by\b/gi, '*')
      .replace(/\bdivided by\b|\bover\b/gi, '/')
      .replace(/\bplus\b/gi, '+')
      .replace(/\bminus\b/gi, '-')
      .replace(/\bmodulo\b|\bmod\b/gi, '%')
      .replace(/\bto the power of\b|\braised to\b/gi, '^')
      .replace(/\*\*/g, '^')
      .replace(/\bsquared\b/gi, '^2')
      .replace(/\bcubed\b/gi, '^3')
      .replace(/\bsquare root of\b/gi, 'sqrt')
      .replace(/\bpercent of\b/gi, '% *')
      .replace(/\bpercent\b/gi, '%')
      .replace(/\s+/g, ' ')
      .trim();
  },

  _tokenize(str) {
    const tokens = [];
    let i = 0;

    while (i < str.length) {
      const ch = str[i];
      if (ch === ' ') {
        i++;
        continue;
      }

      if (/[0-9.]/.test(ch)) {
        let num = '';
        let dots = 0;
        while (i < str.length && /[0-9.]/.test(str[i])) {
          if (str[i] === '.') dots++;
          if (dots > 1) throw new Error('Malformed number');
          num += str[i++];
        }
        const val = parseFloat(num);
        if (!Number.isFinite(val)) throw new Error('Invalid number');
        tokens.push({ type: 'num', value: val });
        continue;
      }

      if (/[a-z]/i.test(ch)) {
        let ident = '';
        while (i < str.length && /[a-z]/i.test(str[i])) {
          ident += str[i++];
        }
        if (ident === 'pi') {
          tokens.push({ type: 'num', value: Math.PI });
        } else if (ident === 'e') {
          tokens.push({ type: 'num', value: Math.E });
        } else if (['sqrt', 'abs', 'sin', 'cos', 'tan', 'log', 'ln'].includes(ident)) {
          tokens.push({ type: 'fn', value: ident });
        } else {
          throw new Error(`Unsupported symbol "${ident}"`);
        }
        continue;
      }

      if ('+-*/^%()'.includes(ch)) {
        tokens.push({ type: ch, value: ch });
        i++;
        continue;
      }

      throw new Error(`Unexpected character "${ch}"`);
    }

    return tokens;
  },

  _parseAndEval(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    const parseExpression = () => {
      let left = parseTerm();
      while (peek() && (peek().type === '+' || peek().type === '-')) {
        const op = consume().type;
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    };

    const parseTerm = () => {
      let left = parsePower();
      while (peek() && (peek().type === '*' || peek().type === '/')) {
        const op = consume().type;
        const right = parsePower();
        if (op === '*') {
          left *= right;
        } else {
          if (right === 0) throw new Error('Division by zero');
          left /= right;
        }
      }
      return left;
    };

    const parsePower = () => {
      const base = parseUnary();
      if (peek() && peek().type === '^') {
        consume();
        const exp = parsePower(); // right-associative
        return Math.pow(base, exp);
      }
      return base;
    };

    const parseUnary = () => {
      if (peek() && (peek().type === '+' || peek().type === '-')) {
        const op = consume().type;
        const val = parseUnary();
        return op === '-' ? -val : val;
      }
      return parsePostfix();
    };

    const parsePostfix = () => {
      let val = parsePrimary();
      while (peek() && peek().type === '%') {
        consume();
        // Handle binary modulo `a % b` vs postfix percent `a%` or `a% * b`
        const next = peek();
        if (next && (next.type === 'num' || next.type === 'fn' || next.type === '(')) {
          const divisor = parsePower();
          if (divisor === 0) throw new Error('Division by zero');
          val = val % divisor;
        } else {
          val = val * 0.01;
        }
      }
      return val;
    };

    const parsePrimary = () => {
      const tok = peek();
      if (!tok) throw new Error('Unexpected end of expression');

      if (tok.type === 'num') {
        consume();
        return tok.value;
      }

      if (tok.type === 'fn') {
        const fn = consume().value;
        let arg;
        if (peek() && peek().type === '(') {
          consume();
          arg = parseExpression();
          if (!peek() || peek().type !== ')') throw new Error('Missing closing parenthesis');
          consume();
        } else {
          arg = parseUnary();
        }
        switch (fn) {
          case 'sqrt':
            if (arg < 0) throw new Error('Square root of negative number');
            return Math.sqrt(arg);
          case 'abs': return Math.abs(arg);
          case 'sin': return Math.sin(arg);
          case 'cos': return Math.cos(arg);
          case 'tan': return Math.tan(arg);
          case 'log':
            if (arg <= 0) throw new Error('Logarithm domain error');
            return Math.log10(arg);
          case 'ln':
            if (arg <= 0) throw new Error('Logarithm domain error');
            return Math.log(arg);
          default: throw new Error(`Unknown function "${fn}"`);
        }
      }

      if (tok.type === '(') {
        consume();
        const val = parseExpression();
        if (!peek() || peek().type !== ')') throw new Error('Missing closing parenthesis');
        consume();
        return val;
      }

      throw new Error(`Unexpected token "${tok.value}"`);
    };

    const result = parseExpression();
    if (pos < tokens.length) {
      throw new Error(`Unexpected token "${tokens[pos].value}"`);
    }
    return result;
  },

  _evaluate(expr) {
    const normalized = this._normalize(expr);
    if (!normalized) throw new Error('Empty expression');
    const tokens = this._tokenize(normalized);
    if (tokens.length === 0) throw new Error('No expression to evaluate');

    const val = this._parseAndEval(tokens);
    if (!Number.isFinite(val)) throw new Error('Result is out of finite bounds');

    const formatted = Number.isInteger(val) ? val : parseFloat(val.toFixed(6));
    return {
      normalized,
      result: formatted,
      steps: [
        `Expression: ${expr}`,
        `Parsed formula: ${normalized}`,
        `Calculated output: ${formatted}`
      ]
    };
  }
};
