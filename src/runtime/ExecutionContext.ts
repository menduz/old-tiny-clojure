import { Nodes } from '../compiler/nodes';

export const NilValue = new Nodes.Nil();
export const NilVar: Nodes.Var = new Nodes.Var(Nodes.SymbolNode.fromFQN('core/nil'), async () => NilValue);

export class ExecutionContext {
  constructor(public scope: Map<string, Nodes.Var>, public parent?: ExecutionContext) {}

  get(identifier: Nodes.SymbolNode): Nodes.Var | null {
    if (this.scope.has(identifier.fqn)) {
      return this.scope.get(identifier.fqn) || NilVar;
    } else if (this.parent) {
      return this.parent.get(identifier);
    }
    return null;
  }

  has(identifier: Nodes.SymbolNode): boolean {
    if (this.scope.has(identifier.fqn)) {
      return true;
    } else if (this.parent) {
      return this.parent.has(identifier);
    }
    return false;
  }
}
