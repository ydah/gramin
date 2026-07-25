import type { SourceSpan } from "@gramin/core";

interface Position {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export class SourceCursor {
  readonly #source: string;
  #offset = 0;
  #line = 1;
  #column = 1;

  constructor(source: string) {
    this.#source = source;
  }

  get done(): boolean {
    return this.#offset >= this.#source.length;
  }

  get offset(): number {
    return this.#offset;
  }

  peek(distance = 0): string {
    return this.#source[this.#offset + distance] ?? "";
  }

  startsWith(value: string): boolean {
    return this.#source.startsWith(value, this.#offset);
  }

  mark(): Position {
    return { offset: this.#offset, line: this.#line, column: this.#column };
  }

  spanFrom(start: Position): SourceSpan {
    return {
      startLine: start.line,
      startCol: start.column,
      endLine: this.#line,
      endCol: this.#column,
    };
  }

  slice(start: Position): string {
    return this.#source.slice(start.offset, this.#offset);
  }

  remaining(): string {
    return this.#source.slice(this.#offset);
  }

  advance(): string {
    const character = this.peek();
    if (!character) return "";
    this.#offset += 1;
    if (character === "\n") {
      this.#line += 1;
      this.#column = 1;
    } else {
      this.#column += 1;
    }
    return character;
  }

  advanceBy(count: number): void {
    for (let index = 0; index < count; index += 1) this.advance();
  }
}
