import { printErrors } from '../utils/errorPrinter';
import { ParsingContext } from './ParsingContext';
import { PositionCapableError } from './NodeError';
import { indent } from '../utils/astPrinter';

export function failWithErrors(phaseName: string, pc: ParsingContext, debug = false) {
  if (!pc.messageCollector.hasErrors()) return;

  if (pc && pc.messageCollector.errors.length) {
    pc.system.write(printErrors(pc) + '\n');
  }

  throw Object.assign(
    new Error(
      `${phaseName} failed. ${pc.messageCollector.errors.length} errors found:\n` +
        indent(
          pc.messageCollector.errors
            .map(($: Error, $$) => {
              let msg = $ instanceof PositionCapableError ? '' + $.message : $.toString() + '\n';

              if (debug && $.stack) {
                msg = msg + '\n' + $.stack;
              }

              return indent(msg, '    ').replace(/^\s+(.*)/m, ($$ + 1).toString() + ')  $1');
            })
            .join('\n')
        )
    ),
    { phase: pc }
  );
}
