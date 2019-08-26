export abstract class Annotation {
  get name(): string {
    return this.constructor.name;
  }
  toString() {
    return this.name;
  }
}
export type IAnnotationConstructor<T extends Annotation> = { new (...args: any[]): T };

export namespace annotations {
  export class IsTailRec extends Annotation {}
  export class Injected extends Annotation {}
  export class IsOverloaded extends Annotation {}
  export class Inline extends Annotation {}
}
