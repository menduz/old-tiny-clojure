import { Nodes } from './nodes';

export const DEBUG_TYPES = process.env.DEBUG_TYPES === '1' || process.env.DEBUG_TYPES === 'true';

export interface IPositionCapable {
  readonly start: number;
  readonly end: number;
  readonly moduleName: string;
}

export type IErrorPositionCapable = {
  readonly message: string;
  readonly node?: Nodes.Atom;
  readonly warning?: boolean;
  readonly position: IPositionCapable;
} & Error;

export function isSamePosition(lhs: IPositionCapable, rhs: IPositionCapable) {
  return lhs === rhs || (lhs.moduleName === rhs.moduleName && lhs.end === rhs.end && lhs.start === rhs.start);
}

export function isSamePositionOrInside(parent: IPositionCapable, child: IPositionCapable) {
  return (
    isSamePosition(parent, child) ||
    (parent.moduleName === child.moduleName && parent.end >= child.end && parent.start <= child.start)
  );
}

export class PositionCapableError extends Error implements IErrorPositionCapable {
  constructor(public message: string, public readonly position: IPositionCapable, public warning: boolean = false) {
    super(message);
    if (!position) {
      console.trace();
      throw new Error('position is required');
    }
  }
}

export abstract class AstNodeError extends PositionCapableError implements IErrorPositionCapable {
  constructor(public message: string, public node: Nodes.Atom, public warning: boolean = false) {
    super(message, AstNodeError.ensureNodePosition(node), warning);
  }
  private static ensureNodePosition(node: Nodes.Atom): IPositionCapable {
    if (!node) {
      throw new Error('node is required');
    }

    const p = node.position;

    if (!p) {
      return { start: 0, end: 0, moduleName: '(native)' };
    }

    return p;
  }
}

export class LysScopeError extends AstNodeError {}
export class LysTypeError extends AstNodeError {}
export class LysSemanticError extends AstNodeError {}
export class LysCompilerError extends AstNodeError {}
