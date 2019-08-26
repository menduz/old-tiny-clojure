import { PhaseFlags } from '../nodes';
import { ParsingContext } from '../ParsingContext';

export function analyze(moduleName: string, parsingContext: ParsingContext, _desiredPhase: PhaseFlags, _debug = false) {
  const document = parsingContext.getExistingParsingPhaseForModule(moduleName)!;
  if (document) {
    // ! while (document.analysis.nextPhase <= desiredPhase) {
    // !   const nextPhase = document.analysis.nextPhase;
    // !   // a if (PhaseFlags.Semantic === nextPhase) {
    // !   // a   executeSemanticPhase(moduleName, parsingContext);
    // !   // a } else if (PhaseFlags.NameInitialization === nextPhase) {
    // !   // a   executeNameInitializationPhase(moduleName, parsingContext);
    // !   // a } else if (PhaseFlags.Scope === nextPhase) {
    // !   // a   executeScopePhase(moduleName, parsingContext);
    // !   // a } else if (PhaseFlags.TypeInitialization === nextPhase) {
    // !   // a   executeTypeInitialization(moduleName, parsingContext);
    // !   // a } else if (PhaseFlags.TypeCheck === nextPhase) {
    // !   // a   executeTypeCheck(moduleName, parsingContext, debug);
    // !   // a }
    // !   if (document.analysis.nextPhase === nextPhase) {
    // !     throw new Error(`Error in phase ${PhaseFlags[nextPhase]}`);
    // !   }
    // ! }
  } else {
    throw new Error('Module not found ' + moduleName);
  }
}
