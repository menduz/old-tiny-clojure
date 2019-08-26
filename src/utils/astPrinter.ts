import { Nodes } from '../compiler/nodes';

export function printAST(token: Nodes.Atom, level = 0, printedNodes = new Set<Nodes.Atom>()): string {
  if (!token) return '<no token was provided>';
  if (printedNodes.has(token)) {
    return '  '.repeat(level) + `|-${token.nodeName}$- THIS NODE HAS BEEN PRINTED`;
  }
  printedNodes.add(token);
  let text = '';

  return '\n' + '  '.repeat(level) + `|-${token.nodeName}${text}`;
}

export function indent(str: string, indentation: string = '  ') {
  if (!str.replace) {
    console.trace();
  }
  return str.replace(/^(.*)$/gm, indentation + '$1').replace(/^\s+$/gm, '');
}
