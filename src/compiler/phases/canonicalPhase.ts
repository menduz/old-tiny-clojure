import { Nodes } from '../nodes';
import { PositionCapableError } from '../NodeError';
import { walkPreOrder } from '../walker';
import { TokenError, IToken } from 'ebnf';
import { parser } from '../../grammar';
import { ParsingContext } from '../ParsingContext';

/// --- PARSING PHASE ---

const process = walkPreOrder((token: IToken, parsingContext: ParsingContext) => {
  if (token.errors && token.errors.length) {
    token.errors.forEach(($: TokenError) => {
      if ($) {
        parsingContext.messageCollector.error(new PositionCapableError($.message, token as any));
      }
    });
  }
});

const setModuleName = (moduleName: string) =>
  walkPreOrder((token: any) => {
    token.moduleName = moduleName;
  });

const parsingCache = new Map<string /** hash */, IToken>();

function DJB2(input: string) {
  let hash = 5381;

  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) + hash + input.charCodeAt(i);
  }

  return hash;
}

function getParsingTree(moduleName: string, content: string, parsingContext: ParsingContext) {
  const hash = moduleName + '+' + content.length.toString(16) + '_' + DJB2(content).toString(16);

  let ret = parsingCache.get(hash);

  if (!ret) {
    ret = parser.getAST(content, 'Document');
    parsingCache.set(hash, ret);
    setModuleName(moduleName)(ret as any, parsingContext);
  }

  return (ret as any) as Nodes.ASTNode;
}

/// --- CANONICAL ---

const visitor = {
  Document(astNode: Nodes.ASTNode) {
    return new Nodes.List(
      [new Nodes.SymbolNode('core', 'document', 'core/document')].concat(astNode.children.map(visit))
    );
  },
  List(astNode: Nodes.ASTNode) {
    return new Nodes.List(astNode.children.map(visit));
  },
  Vector(astNode: Nodes.ASTNode) {
    return new Nodes.PersistentVector(astNode.children.map(visit));
  },
  Map(astNode: Nodes.ASTNode) {
    return Nodes.PersistentArrayMap.fromValues(astNode.children.map(visit));
  },
  Set(astNode: Nodes.ASTNode) {
    return Nodes.PersistentSet.fromValues(astNode.children.map(visit));
  },
  Lambda(astNode: Nodes.ASTNode) {
    // TODO implement reader macro
    return new Nodes.List(astNode.children.map(visit));
  },
  Quote(astNode: Nodes.ASTNode) {
    return new Nodes.List([new Nodes.SymbolNode('core', 'quote', 'core/quote')].concat(astNode.children.map(visit)));
  },
  Backtick(astNode: Nodes.ASTNode) {
    return new Nodes.List(astNode.children.map(visit));
  },
  Tag(astNode: Nodes.ASTNode) {
    const symbol = visit(astNode.children[astNode.children.length - 1]) as Nodes.SymbolNode;

    const metadata = visit(astNode.children[0]); // this can only be string, keyword, symbol or map

    symbol.withMeta(metadata);

    return symbol;
  },
  VarQuote(astNode: Nodes.ASTNode) {
    return new Nodes.List([new Nodes.SymbolNode('core', 'var', 'core/var')].concat(astNode.children.map(visit)));
  },
  Deref(astNode: Nodes.ASTNode) {
    return new Nodes.List([new Nodes.SymbolNode('core', 'deref', 'core/deref')].concat(astNode.children.map(visit)));
  },
  Discard() {
    return null;
  },
  Dispatch(astNode: Nodes.ASTNode) {
    return new Nodes.List(astNode.children.map(visit));
  },
  Regex(astNode: Nodes.ASTNode) {
    return new Nodes.RegExpLiteral(new RegExp(astNode.children[0].text));
  },
  UnquoteSplicing(astNode: Nodes.ASTNode) {
    return new Nodes.List(
      [new Nodes.SymbolNode('core', 'unquote-splicing', 'core/unquote-splicing')].concat(astNode.children.map(visit))
    );
  },
  Unquote(astNode: Nodes.ASTNode) {
    return new Nodes.List(
      [new Nodes.SymbolNode('core', 'unquote', 'core/unquote')].concat(astNode.children.map(visit))
    );
  },

  // NominalAtoms
  ParamName(astNode: Nodes.ASTNode) {
    return Nodes.SymbolNode.fromFQN(astNode.text);
  },
  Comment() {
    return new Nodes.Comment();
  },
  Symbol(astNode: Nodes.ASTNode) {
    return Nodes.SymbolNode.fromFQN(astNode.text);
  },
  Keyword(astNode: Nodes.ASTNode) {
    return Nodes.Keyword.fromFQN(astNode.text);
  },
  PostfixNumber(x: Nodes.ASTNode) {
    const literal = visit(x.children[0]) as Nodes.NumberLiteral;
    // ¡ literal.suffixReference = visit(x.children[1]);
    return literal;
  },
  Number(x: Nodes.ASTNode) {
    return new Nodes.NumberLiteral(parseFloat(x.text));
  },
  NegNumber(x: Nodes.ASTNode) {
    return new Nodes.NumberLiteral(parseFloat(x.text));
  },
  HexLiteral(x: Nodes.ASTNode) {
    return new Nodes.NumberLiteral(parseInt(x.text, 16));
  },
  String(x: Nodes.ASTNode) {
    const ret = new Nodes.StringLiteral(x.text);
    ret.value = JSON.parse(x.text.replace(/\n/gm, '\\n'));
    return ret;
  },
  SyntaxError(x: Nodes.ASTNode) {
    return new Nodes.SyntaxError(x);
  }
};

function visit<T extends Nodes.Atom>(astNode: Nodes.ASTNode): T & any {
  if (!astNode) {
    console.trace();
    throw new Error('astNode is null');
  }
  if ((visitor as any)[astNode.type]) {
    const atom: T = (visitor as any)[astNode.type](astNode);
    atom.withLocation(astNode);
    return atom;
  } else {
    throw new PositionCapableError(`Visitor not implemented for ${astNode.type}`, astNode);
  }
}

export function getAST(moduleName: string, content: string, parsingContext: ParsingContext) {
  const parsingTree = getParsingTree(moduleName, content, parsingContext);

  if (!parsingTree) {
    throw new Error('parsing phase did not run or failed');
  }

  process(parsingTree as any, parsingContext);

  try {
    let document = visit(parsingTree);
    document.withMeta(
      Nodes.PersistentArrayMap.fromValues([Nodes.Keyword.fromFQN('content'), new Nodes.StringLiteral(content)])
    );

    parsingContext.modulesInContext.set(moduleName, document);

    return document;
  } catch (e) {
    if (e instanceof PositionCapableError) {
      let document = new Nodes.SyntaxError(parsingTree);

      document.withLocation(parsingTree);
      document.withMeta(
        Nodes.PersistentArrayMap.fromValues([Nodes.Keyword.fromFQN('content'), new Nodes.StringLiteral(content)])
      );

      parsingContext.modulesInContext.set(moduleName, document);

      parsingContext.messageCollector.error(e);

      return document;
    }
    throw e;
  }
}
