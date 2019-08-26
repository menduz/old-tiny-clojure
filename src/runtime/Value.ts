import { Nodes } from '../compiler/nodes';
import { ExecutionContext } from './ExecutionContext';
import { ParsingContext } from '../compiler/ParsingContext';

export type BuiltInFunction = (
  list: Nodes.List,
  context: ExecutionContext,
  parsingContext: ParsingContext
) => Promise<Nodes.Atom> | Nodes.Atom;
