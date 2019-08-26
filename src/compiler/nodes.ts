import { TokenError } from 'ebnf';
import { IPositionCapable } from './NodeError';
import { indent } from '../utils/astPrinter';

export enum PhaseFlags {
  Semantic = 0,
  NameInitialization,
  Scope,
  TypeInitialization,
  TypeCheck,
  PreCompilation,
  Compilation,
  CodeGeneration
}

export interface ISeq {
  first(): any;
  next(): Promise<ISeq>;
  more(): Promise<ISeq>;
  cons(x: any): ISeq;
}

export namespace RT {
  export function seq(coll: any) {
    if (coll instanceof Nodes.LazySeq) {
      return coll.seq();
    } else {
      throw new Error('cant seq from' + coll);
    }
  }
}

export namespace Nodes {
  export interface ASTNode {
    readonly type: string;
    readonly text: string;
    readonly start: number;
    readonly end: number;
    readonly errors: TokenError[];
    readonly moduleName: string;
    readonly children: ReadonlyArray<ASTNode>;
  }

  export abstract class Atom {
    meta?: PersistentArrayMap;

    get position(): IPositionCapable | null {
      const start = this.getMeta(START_KEYWORD) as LiteralNode<any>;
      const end = this.getMeta(END_KEYWORD) as LiteralNode<any>;
      const namespace = this.getMeta(NAMESPACE_KEYWORD) as LiteralNode<any>;

      if (!start || !end || !namespace) {
        return null;
      }

      return {
        start: start.value,
        end: end.value,
        moduleName: namespace.value
      };
    }

    /** Name of the node constructor */
    get nodeName(): string {
      return this.constructor.name;
    }

    getMeta(keyword: Keyword): Atom | null {
      if (this.meta) {
        return this.meta.getValue(keyword);
      }
      return null;
    }

    withMeta(val: Atom) {
      if (!this.meta) {
        this.meta = PersistentArrayMap.EMPTY;
      }
      if (val instanceof StringLiteral) {
        this.meta = this.meta.assoc([new Keyword('', 'tag', 'tag'), val]);
      } else if (val instanceof SymbolNode) {
        this.meta = this.meta.assoc([new Keyword('', 'tag', 'tag'), val]);
      } else if (val instanceof Keyword) {
        this.meta = this.meta.assoc([val, new BooleanLiteral(true)]);
      } else if (val instanceof PersistentArrayMap) {
        this.meta = this.meta.assoc(val.values);
      } else {
        console.error('Wtf meta', val);
      }
    }

    withLocation(astNode: ASTNode) {
      this.withMeta(
        PersistentArrayMap.fromValues([
          NAMESPACE_KEYWORD,
          new StringLiteral(astNode.moduleName),
          START_KEYWORD,
          new NumberLiteral(astNode.start),
          END_KEYWORD,
          new NumberLiteral(astNode.end)
        ])
      );
    }

    equals(_other: Atom): boolean {
      return false;
    }

    abstract toString(): string;
  }

  export class PersistentSet extends Atom {
    static EMPTY = new PersistentSet([]);

    private constructor(readonly values: ReadonlyArray<Atom>) {
      super();
    }

    static fromValues(values: ReadonlyArray<Atom>, baseValues: ReadonlyArray<Atom> = []) {
      const newValues = baseValues.slice();

      for (let x = 0; x < values.length; x++) {
        const value = values[x];

        let isPresent = false;
        for (let i = 0; i < newValues.length; i++) {
          if (newValues[i].equals(value)) {
            isPresent = true;
          }
        }

        if (!isPresent) {
          newValues.push(value);
        }
      }

      return new PersistentSet(newValues);
    }

    assoc(values: ReadonlyArray<Atom>): PersistentSet {
      return PersistentSet.fromValues(values, this.values);
    }

    getValue(fn: Keyword) {
      for (let i = 0; i < this.values.length; i++) {
        const element = this.values[i];
        if (element.equals(fn)) {
          return element;
        }
      }
      return null;
    }

    toString() {
      return `#{${this.values.join(' ')}}`;
    }
  }

  export class PersistentArrayMap extends Atom {
    static EMPTY = new PersistentArrayMap([]);

    private constructor(public readonly values: ReadonlyArray<Atom> = ([] = [])) {
      super();
    }

    static fromValues(values: ReadonlyArray<Atom>, baseValues: ReadonlyArray<Atom> = []) {
      const newValues = baseValues.slice();

      for (let x = 0; x < values.length; x += 2) {
        const keyword = values[x];
        const value = values[x + 1];

        let didUpdate = false;
        for (let i = 0; i < newValues.length; i += 2) {
          if (newValues[i].equals(keyword)) {
            didUpdate = true;
            newValues[i + 1] = value;
          }
        }

        if (!didUpdate) {
          newValues.push(keyword);
          newValues.push(value);
        }
      }

      return new PersistentArrayMap(newValues);
    }

    assoc(values: ReadonlyArray<Atom>): PersistentArrayMap {
      return PersistentArrayMap.fromValues(values, this.values);
    }

    getValue(keyword: Keyword): Atom | null {
      for (let i = 0; i < this.values.length; i += 2) {
        if (this.values[i].equals(keyword)) {
          return this.values[i + 1] || null;
        }
      }
      return null;
    }

    toString() {
      return `{${this.values.join(' ')}}`;
    }
  }

  export class PersistentVector extends Atom {
    static EMPTY = new PersistentVector([]);

    constructor(public readonly values: ReadonlyArray<Atom>) {
      super();
    }

    assoc(values: ReadonlyArray<Atom>): PersistentVector {
      return new PersistentVector(this.values.concat(values));
    }

    toString() {
      return `[${this.values.join(' ')}]`;
    }
  }

  export class Var extends Atom {
    private evaluation: Promise<Atom> | null = null;

    constructor(public sym: SymbolNode, private val: () => Promise<Atom>) {
      super();
    }

    get meta() {
      return this.sym.meta;
    }
    set meta(v: PersistentArrayMap | undefined) {
      this.sym.meta = v;
    }

    async getValue(): Promise<Atom> {
      if (this.evaluation === null) {
        this.evaluation = this.val();
      }
      return this.evaluation;
    }

    toString() {
      return `#'${this.sym.fqn}`;
    }
  }

  export class List extends Atom {
    static EMPTY: List = new List([]);

    constructor(public values: Atom[]) {
      super();
    }

    toString() {
      let value = this.values.join(' ');

      if (value.length > 80) {
        value = indent(this.values.join('\n'));
      }

      return `(${value})`;
    }
  }

  export class Lazy extends Atom {
    private savedValue: Promise<any> | null = null;

    constructor(private fn: () => Promise<any>) {
      super();
    }

    sval() {
      if (this.fn) {
        this.savedValue = this.fn();
        delete this.fn;
      }
      return this.savedValue;
    }

    toString() {
      return `(${this.sval()})`;
    }
  }

  export class LazySeq extends Atom {
    private s: ISeq | null = null;
    private savedValue: any | null = null;

    constructor(private fn: () => Promise<any>) {
      super();
    }

    async sval() {
      if (this.fn) {
        this.savedValue = await this.fn();
        delete this.fn;
      }
      if (this.savedValue !== null) {
        return this.savedValue;
      }
      return this.s;
    }

    public async count() {
      let c = 0;
      for (let s = await this.seq(); s !== null; s = await s.next()) {
        ++c;
      }
      return c;
    }

    public async seq(): Promise<ISeq | null> {
      await this.sval();

      if (this.savedValue != null) {
        let ls = this.savedValue;
        this.savedValue = null;
        while (ls instanceof LazySeq) {
          ls = ls.sval();
        }
        this.s = await RT.seq(ls);
      }

      return this.s;
    }

    toString() {
      if (this.s) {
        return this.s.toString() || '(...)';
      }
      return `(...)`;
    }
  }

  export class FunctionNode extends Atom {
    constructor(public children: Atom[]) {
      super();
    }

    toString() {
      return `(fn* ${indent(this.children.join('\n'))})`;
    }
  }

  export class Comment extends Atom {
    toString() {
      return `; ...\n`;
    }
  }

  export class Nil extends Atom {
    toString() {
      return `nil`;
    }
  }

  export class SyntaxError extends Atom {
    constructor(public astNode: ASTNode) {
      super();
      console.error('Syntax error', astNode.text);
    }

    toString() {
      return `; SyntaxError: ${this.astNode.text} \n`;
    }
  }

  export class Keyword extends Atom {
    constructor(public namespace: string, public name: string, public fqn: string) {
      super();
    }

    static fromFQN(text: string): Keyword {
      if (text.startsWith(':')) {
        return Keyword.fromFQN(text.substr(1));
      }
      if (text.includes('/')) {
        const [ns, name] = text.split('/');
        return new Keyword(ns, name, text);
      }
      return new Keyword('', text, text);
    }

    equals(other: Keyword) {
      if (other instanceof Keyword) {
        return other.fqn === this.fqn;
      }
      return false;
    }

    toString() {
      return ':' + this.fqn;
    }
  }

  export class SymbolNode extends Atom {
    constructor(public ns: string, public name: string, public fqn: string) {
      super();
    }

    static fromFQN(text: string): SymbolNode {
      if (text.includes('/')) {
        const [ns, name] = text.split('/');
        return new SymbolNode(ns, name, text);
      }
      return new SymbolNode('', text, text);
    }

    toString() {
      return this.fqn;
    }
  }

  export abstract class LiteralNode<T> extends Atom {
    abstract value: T;

    toString() {
      return '' + this.value;
    }
  }

  export class StringLiteral extends LiteralNode<string> {
    constructor(public value: string) {
      super();
    }
  }

  export class RegExpLiteral extends LiteralNode<RegExp> {
    constructor(public value: RegExp) {
      super();
    }
  }

  export class NumberLiteral extends LiteralNode<number> {
    constructor(public value: number) {
      super();
    }
  }

  export class BooleanLiteral extends LiteralNode<boolean> {
    constructor(public value: boolean) {
      super();
    }
  }

  export const NAMESPACE_KEYWORD = new Keyword('', 'namespace', 'namespace');
  export const START_KEYWORD = new Keyword('', 'start', 'start');
  export const END_KEYWORD = new Keyword('', 'end', 'end');
}

export function findNodesByType<T>(
  astRoot: { children: any[] },
  type: { new (...args: any[]): T },
  list: T[] = []
): T[] {
  if (astRoot instanceof type) {
    list.push(astRoot);
  }
  astRoot.children.forEach($ => findNodesByType($, type, list));
  return list;
}

export function findNodesByTypeInChildren<T>(
  astRoot: { children: any[] },
  type: { new (...args: any[]): T },
  list: T[] = []
): T[] {
  astRoot.children.forEach($ => {
    if ($ instanceof type) {
      list.push($);
    }
  });
  return list;
}
