import { Nodes } from '../compiler/nodes';
// a import { indent } from './astPrinter';

function privatePrint(node: Nodes.Atom): string {
  if (!node) {
    throw new Error('Trying to print a null node');
  }

  if (node instanceof Nodes.List) {
    const content = node.values.map(privatePrint).join(' ');

    return '(' + content + ')';
  }

  throw new Error(node.nodeName + ' cannot be printed');
}

export function printNode(node: Nodes.Atom): string {
  return privatePrint(node);
}
