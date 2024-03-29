declare var describe: any;

import * as expect from 'expect';
import { testParseToken } from './TestHelpers';
import { ParsingContext } from '../dist/compiler/ParsingContext';
import { nodeSystem } from '../dist/support/NodeSystem';
import { Interpreter } from '../dist/runtime/Interpreter';
import { ExecutionContext } from '../dist/runtime/ExecutionContext';
import { Nodes } from '../dist/compiler/nodes';
import { failWithErrors } from '../dist/compiler/findAllErrors';

export function last<T>(x: ArrayLike<T>): T | undefined {
  return x[x.length - 1];
}

describe('Execution', () => {
  const phases = function(txt: string, fileName: string) {
    const parsingContext = new ParsingContext(nodeSystem);

    parsingContext.paths.push(nodeSystem.resolvePath(__dirname, '../stdlib'));

    const moduleName = parsingContext.getModuleFQNForFile(fileName);
    parsingContext.invalidateModule(moduleName);

    return {
      moduleName,
      document: parsingContext.getParsingPhaseForContent(moduleName, txt),
      parsingContext
    };
  };

  let testCount = 0;

  function getFileName() {
    return `tests/Execution_tests_${testCount++}.lys`;
  }

  async function toJs(atom: Nodes.Atom, ctx: any, ctx2: any): Promise<any> {
    if (atom instanceof Nodes.LiteralNode) {
      return atom.value;
    } else if (atom instanceof Nodes.Lazy) {
      return await atom.sval();
    } else if (atom instanceof Nodes.PersistentVector) {
      return Promise.all(atom.values.map(toJs));
    } else if (atom instanceof Nodes.PersistentSet) {
      return new Set(await Promise.all(atom.values.map(toJs)));
    } else if (atom instanceof Nodes.Nil) {
      return null;
    } else if (atom instanceof Nodes.Var) {
      return atom.toString();
    } else if (atom instanceof Nodes.Keyword) {
      return atom.name;
    } else if (atom instanceof Nodes.PersistentArrayMap) {
      const obj: Record<any, any> = {};
      for (let i = 0; i < atom.values.length; i += 2) {
        const key = await toJs(atom.values[i], ctx, ctx2);
        if (typeof key === 'string') {
          const value = await toJs(atom.values[i + 1], ctx, ctx2);
          obj[key] = value;
        } else {
          console.log('Key', key, 'will not be part of the object');
        }
      }
      return obj;
    }

    return { code: atom.toString() };
  }

  function test(src: string, result: (x: any) => void) {
    testParseToken(
      src,
      getFileName(),
      'Document',
      async (a, b) => {
        if (!a) throw b || new Error('error');
        const interp = new Interpreter(a.parsingContext, {});
        try {
          result(await toJs(await interp.run(a.moduleName), new ExecutionContext(interp.lib), a.parsingContext));
        } catch (e) {
          failWithErrors('execution', a.parsingContext);
          throw e;
        }
      },
      phases
    );
  }

  describe('basics', () => {
    test(`1223`, x => expect(x).toEqual([1223]));
    test(`[1 2 [3]]`, x => expect(x).toEqual([[1, 2, [3]]]));
    test(`[1 2 [3]]`, x => expect(x).toEqual([[1, 2, [3]]]));

    test(`
      (def a 1)
    `, x => expect(x).toEqual(["#'a"]));

    test(`
      (def a 1)
      a
    `, x => expect(x).toEqual(["#'a", 1]));

    test(`
      (def a 1)
      #'a
    `, x => expect(x).toEqual(["#'a", "#'a"]));

    test(`
      {}
    `, x => expect(x).toEqual([{}]));

    test(`
      {:a 1}
    `, x => expect(x).toEqual([{ a: 1 }]));

    test(`
      {"b" 2 "a" 1}
    `, x => expect(x).toEqual([{ b: 2, a: 1 }]));

    test(`
      #{:x 1 :y 2 :z 3 1 1 1 2 :z :z}
    `, x => expect(x).toEqual([new Set(['x', 1, 'y', 2, 'z', 3])]));

    test(`
      (:x {:x 1 :y 2 :z 3})
    `, x => expect(x).toEqual([1]));

    test(`
      (def x y)
      (def y z)
      (def z 12)
      x
    `, x => expect(x).toEqual(["#'x", "#'y", "#'z", 12]));

    test(`
      (def ^:private xyz 1)

      {:key     #'xyz
       :value   xyz
       :deref   @#'xyz
       :private (:private (meta #'xyz))
       :asd     (:asd (meta #'xyz))
       :meta1   (meta 1)}
    `, x => expect(x).toEqual(["#'xyz", { key: "#'xyz", value: 1, deref: 1, private: true, asd: null, meta1: null }]));
  });

  describe('quoting', () => {
    test(`
      '(def x y)
    `, x => expect(x).toEqual([{ code: '(def x y)' }]));

    test(`
      (def x 'y)
      x
    `, x => expect(x).toEqual(["#'x", { code: 'y' }]));

    test(`
      (core/quote (def x y))
    `, x => expect(x).toEqual([{ code: '(def x y)' }]));

    test(`
      (core/quote asd)
    `, x => expect(x).toEqual([{ code: 'asd' }]));
  });

  describe('functions', () => {
    test(`
      ((fn* fun1 [x] x) 1)
    `, x => expect(x).toEqual([1]));

    test(`
      ((fn* fun2 [x] 123) 1)
    `, x => expect(x).toEqual([123]));

    test(`
      (def x (fn* fun1 [y] (fn* fun2 [z] y)))
      ((x 1) 2)
    `, x => expect(x).toEqual(["#'x", 1]));

    test(`
      (def x (fn* fun1 [y] (fn* fun2 [z] z)))
      ((x 1) 2)
    `, x => expect(x).toEqual(["#'x", 2]));

    test(`
      (fn* fun1 [y] (fn* fun2 [z] z))
    `, x => expect(x).toEqual([{code: "#context-bound-fn (fn* fun1\n  [y]\n  (fn* fun2 [z] z))"}]));

    test(`
      (def x (fn* fun1 [y] (fn* fun2 [z] z)))
      (x 1)
    `, x => expect(x).toEqual(["#'x", {code: "#context-bound-fn (fn* fun2\n  [z]\n  z)"}]));

    test(`
      (def identity (fn* fun1 [x] x))
      (identity 1)
    `, x => expect(x).toEqual(["#'identity", 1]));
  });
});
