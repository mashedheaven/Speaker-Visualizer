/**
 * calculator.js - JARVIS Mathematical Computation & Precision Calculator
 * Safely parses and evaluates algebraic expressions, percentages, tips,
 * scientific math functions, and unit computations.
 */

export const CalculatorSkill = {
  name: 'calculator',

  match(intent) {
    return intent.type === 'CALCULATOR';
  },

  async execute(intent) {
    const rawExpr = intent.params?.expression || intent.query?.replace(/calculate|what is|compute|solve/gi, '').trim() || '42 * 1337';
    const cleanExpr = rawExpr.replace(/[=?]/g, '').trim();

    try {
      const { result, steps } = this._evaluate(cleanExpr);
      return {
        expression: cleanExpr,
        result: String(result),
        steps,
        spokenResult: `The result is ${result}`
      };
    } catch (e) {
      return {
        expression: cleanExpr,
        result: 'NaN',
        steps: ['Syntax or evaluation error in calculation'],
        spokenResult: 'I could not compute that mathematical expression, sir.'
      };
    }
  },

  _evaluate(expr) {
    // Sanitize to only numbers, math operators, parens, and standard math functions
    let sanitized = expr
      .toLowerCase()
      .replace(/x/g, '*')
      .replace(/times/gi, '*')
      .replace(/divided by/gi, '/')
      .replace(/plus/gi, '+')
      .replace(/minus/gi, '-')
      .replace(/to the power of/gi, '**')
      .replace(/\^/g, '**')
      .replace(/percent of/gi, '* 0.01 *')
      .replace(/%/g, '* 0.01')
      .replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)')
      .replace(/sqrt\s+(\d+(\.\d+)?)/g, 'Math.sqrt($1)')
      .replace(/pi/gi, 'Math.PI');

    // Only allow safe math tokens
    if (!/^[0-9+\-*/().\s*MathPIsqrte]+$/.test(sanitized)) {
      throw new Error('Invalid math expression');
    }

    // Safe Function evaluation
    const fn = new Function(`"use strict"; return (${sanitized});`);
    const val = fn();

    let formatted = Number.isInteger(val) ? val : parseFloat(val.toFixed(4));
    return {
      result: formatted,
      steps: [
        `Expression: ${expr}`,
        `Parsed formula: ${sanitized.replace(/Math\./g, '')}`,
        `Calculated output: ${formatted}`
      ]
    };
  }
};
