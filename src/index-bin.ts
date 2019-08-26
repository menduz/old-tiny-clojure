import * as arg from 'arg';
import { ParsingContext } from './compiler/ParsingContext';
import { dirname, basename } from 'path';
import { nodeSystem } from './support/NodeSystem';
import { LysError } from './utils/errorPrinter';
import { loadFromMD } from './utils/loadFromMD';

function mkdirRecursive(dir: string) {
  // we explicitly don't use `path.sep` to have it platform independent;
  let sep = '/';

  let segments = dir.split(sep);
  let current = '';
  let i = 0;

  while (i < segments.length) {
    current = current + sep + segments[i];
    nodeSystem.createDirectory(current);
    i++;
  }
}

export async function main(cwd: string, argv: string[]) {
  nodeSystem.cwd = cwd;
  const parsingContext = new ParsingContext(nodeSystem);
  parsingContext.paths.push(nodeSystem.resolvePath(__dirname, '../stdlib'));

  let libs: Array<(getInstance: Function) => any> = [];
  let libPaths: Array<string> = [];

  const args = arg(
    {
      '--output': String,
      '-o': '--output',
      '--no-optimize': Boolean,
      '--wast': Boolean,
      '--lib': [String],
      '--test': Boolean,
      '--debug': Boolean,
      '--run': '--test'
    },
    {
      permissive: true,
      argv
    }
  );

  args['--lib'] = args['--lib'] || [];

  const file = args._[0];

  let customAssertions: Record<string, (getInstance: Function) => void> = {};

  if (!file) {
    throw new LysError('Error: You did not specify an input file. \n\n  Usage: $ lys mainFile.lys');
  }

  if (!nodeSystem.fileExists(file)) {
    throw new LysError(`Error: File ${file} does not exist.`);
  }

  if (file.endsWith('.md')) {
    const MD = loadFromMD(parsingContext, parsingContext.system.readFile(file) as string);

    for (let path in MD.jsFiles) {
      if (path === 'assertions.js') {
        customAssertions[path] = MD.jsFiles[path];
      } else {
        libs.push(MD.jsFiles[path]);
      }
    }

    args['--test'] = true;
  }

  if (args['--test']) {
    args['--lib'].push(nodeSystem.resolvePath(__dirname, 'utils/libs/env.js'));
    args['--lib'].push(nodeSystem.resolvePath(__dirname, 'utils/libs/test.js'));
  }

  if (args['--lib'] && args['--lib'].length) {
    for (let libPath of args['--lib']) {
      const lib = nodeSystem.resolvePath(libPath);

      if (!nodeSystem.fileExists(lib)) {
        throw new LysError(`Cannot find lib: ${lib}`);
      }

      const r = require(lib);

      if (!r.default) {
        throw new LysError(`Library ${lib} has no "default" export`);
      }

      if (typeof r.default !== 'function') {
        throw new LysError(`"default" is not a function in ${lib}`);
      }

      libPaths.push(lib);
      libs.push(r.default);
    }
  }

  if (!args['--output']) {
    args['--output'] = 'build/' + basename(file, '.lys');
  }

  const outFileFullWithoutExtension = nodeSystem.resolvePath(nodeSystem.getCurrentDirectory(), args['--output']);
  const outPath = dirname(outFileFullWithoutExtension);
  mkdirRecursive(outPath);
}
