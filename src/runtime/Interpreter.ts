import { ExecutionContext, NilValue } from './ExecutionContext';
import { ParsingContext } from '../compiler/ParsingContext';
import { Nodes, PhaseFlags } from '../compiler/nodes';
import { BuiltInFunction } from './Value';
import { LysSemanticError, PositionCapableError } from '../compiler/NodeError';

const builtIns: Record<string, BuiltInFunction> = {
  include: async function(_input, _context, _parsingContext) {
    return NilValue; // a  interpret(parse(`()`), context, parsingContext);
  },
  def: async function(input, context, parsingContext) {
    const sym = input.values[1];

    const value = input.values.length > 2 ? input.values[input.values.length - 1] : null;

    if (sym instanceof Nodes.SymbolNode) {
      const variable = new Nodes.Var(sym, async () =>
        value ? (await interpret(value, context, parsingContext)) || NilValue : NilValue
      );

      context.scope.set(sym.name, variable);

      return variable;
    } else {
      throw parsingContext.messageCollector.error(new LysSemanticError('Invalid symbol', sym));
    }
  },
  'core/list': async function(input, context, parsingContext) {
    const list: Nodes.Atom[] = [];

    for (let i = 0; i < input.values.length; i++) {
      list.push(await interpret(input.values[i], context, parsingContext));
    }

    return new Nodes.List(list);
  },
  'core/deref': async function(input, context, parsingContext) {
    const arg: Nodes.Atom = input.values[1];

    if (!arg) {
      throw parsingContext.messageCollector.error(new LysSemanticError(`(deref .) requires an argument`, input));
    }

    let argValue = await interpret(arg, context, parsingContext);

    if (argValue instanceof Nodes.Var) {
      return argValue.getValue();
    } else {
      throw parsingContext.messageCollector.error(
        new LysSemanticError(`(deref .): A var is required, got ${argValue}`, argValue)
      );
    }
  },
  'core/var': async function(input, context, parsingContext) {
    const symbol: Nodes.Atom = input.values[1];

    if (!symbol) {
      throw parsingContext.messageCollector.error(new LysSemanticError(`Missing symbol`, input));
    }

    if (symbol instanceof Nodes.SymbolNode) {
      const resolved = context.get(symbol);
      if (!resolved) {
        throw parsingContext.messageCollector.error(new LysSemanticError(`Cannot resolve symbol`, symbol));
      }

      if (resolved instanceof Nodes.Var) {
        return resolved;
      }

      throw parsingContext.messageCollector.error(new LysSemanticError(`Not a symbol (${resolved})`, symbol));
    } else {
      throw parsingContext.messageCollector.error(
        new LysSemanticError(`(var .): A symbol is required, got ${symbol}`, symbol)
      );
    }
  },
  meta: async function(input, context, parsingContext) {
    const arg: Nodes.Atom = input.values[1];

    if (!arg) {
      throw parsingContext.messageCollector.error(new LysSemanticError(`(meta .): Missing argument`, input));
    }

    let argValue = await interpret(arg, context, parsingContext);

    if (argValue instanceof Nodes.Var) {
      return argValue.meta || NilValue;
    }

    return NilValue;
  },
  if: async function(input, context, parsingContext) {
    if (await interpret(input.values[1], context, parsingContext)) {
      return interpret(input.values[2], context, parsingContext);
    }
    return input.values[3] ? interpret(input.values[3], context, parsingContext) : NilValue;
  },
  'core/document': async function(input, context, parsingContext) {
    let result: Nodes.Atom[] = [];

    try {
      for (let i = 1; i < input.values.length; i++) {
        result.push(await interpret(input.values[i], context, parsingContext));
      }
    } catch (e) {
      throw parsingContext.messageCollector.error(e);
    }

    return new Nodes.PersistentVector(result);
  },
  'core/quote': async function(input, _, parsingContext) {
    if (input.values.length < 1) {
      throw parsingContext.messageCollector.error(new LysSemanticError(`(core/quote .): Missing argument`, input));
    }

    return input.values[1] || NilValue;
  }
};

async function interpretList(input: Nodes.List, context: ExecutionContext, parsingContext: ParsingContext) {
  if (input.values.length > 0) {
    const first = input.values[0];

    if (first instanceof Nodes.SymbolNode) {
      const varFromContext = context.get(first);

      if (varFromContext) {
        return call(await varFromContext.getValue(), input, context, parsingContext);
      }

      if (first.fqn in builtIns) {
        return builtIns[first.fqn](input, context, parsingContext);
      }

      throw parsingContext.messageCollector.error(new LysSemanticError(`Cannot resolve symbol "${first}"`, first));
    } else if (first instanceof Nodes.Keyword) {
      return call(first, input, context, parsingContext);
    }

    throw parsingContext.messageCollector.error(new LysSemanticError(`Atom "${first}" is not callable`, input));
  } else {
    return Nodes.List.EMPTY;
  }
}

async function call(fn: Nodes.Atom, input: Nodes.List, context: ExecutionContext, parsingContext: ParsingContext) {
  if (fn instanceof Nodes.FunctionNode) {
    return fn;
  }

  if (fn instanceof Nodes.Keyword) {
    if (input.values.length === 1) {
      throw parsingContext.messageCollector.error(new LysSemanticError(`Keyword selector: invalid arity`, input));
    }

    const first = await interpret(input.values[1], context, parsingContext);

    if (first instanceof Nodes.PersistentArrayMap) {
      return first.getValue(fn) || NilValue;
    } else if (first instanceof Nodes.PersistentSet) {
      return first.getValue(fn) || NilValue;
    }

    return NilValue;
  }

  throw parsingContext.messageCollector.error(
    new LysSemanticError(`${fn.nodeName} is not a function`, input.values[0])
  );
}

async function interpret(
  input: Nodes.Atom,
  context: ExecutionContext,
  parsingContext: ParsingContext
): Promise<Nodes.Atom> {
  if (!input) {
    console.warn('Lisp', 'error', context.scope);
    return NilValue;
  }

  if (input instanceof Nodes.PersistentVector) {
    const list: Nodes.Atom[] = [];

    for (let i = 0; i < input.values.length; i++) {
      list.push(await interpret(input.values[i], context, parsingContext));
    }

    return new Nodes.PersistentVector(list);
  } else if (input instanceof Nodes.PersistentArrayMap) {
    const list: Nodes.Atom[] = [];

    for (let i = 0; i < input.values.length; i++) {
      list.push(await interpret(input.values[i], context, parsingContext));
    }

    return Nodes.PersistentArrayMap.fromValues(list, input.values);
  } else if (input instanceof Nodes.PersistentSet) {
    const list: Nodes.Atom[] = [];

    for (let i = 0; i < input.values.length; i++) {
      list.push(await interpret(input.values[i], context, parsingContext));
    }

    return Nodes.PersistentSet.fromValues(list, input.values);
  } else if (input instanceof Nodes.List) {
    return interpretList(input, context, parsingContext);
  } else if (input instanceof Nodes.SymbolNode) {
    const variable = context.get(input);

    if (variable) {
      return variable.getValue();
    }

    return NilValue;
  }

  return input;
}

export class Interpreter {
  lib = new Map<string, any>();

  private evalCounter = 0;

  constructor(public parsingContext: ParsingContext, lib: Record<string, any> = {}) {
    for (let i in lib) {
      this.lib.set(i, lib[i]);
    }
  }

  async eval(input: string) {
    const moduleName = `eval_${this.evalCounter++}`;
    this.parsingContext.invalidateModule(moduleName);
    this.parsingContext.getParsingPhaseForContent(moduleName, input);

    return this.run(moduleName);
  }

  async run(moduleName: string) {
    const atom = this.parsingContext.getPhase(moduleName, PhaseFlags.Semantic, true);
    try {
      return interpret(atom, new ExecutionContext(this.lib), this.parsingContext);
    } catch (e) {
      console.error(e);
      console.dir(e);
      if (e instanceof PositionCapableError) {
        this.parsingContext.messageCollector.errors.push(e);
      }
      throw e;
    }
  }
}
