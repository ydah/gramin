# @gramin/core

Versioned TypeScript types, runtime validation, canonical serialization, and JSON Schemas
for gramin Grammar IR and feature documents.

## Installation

```sh
npm install @gramin/core
```

```ts
import {
  IR_VERSION,
  serializeCanonical,
  validateIR,
  type GrammarIR,
} from "@gramin/core";
```

JSON Schemas are available through the `@gramin/core/schema/*` export. Contract evolution
and compatibility are documented in the
[IR schema guide](https://github.com/ydah/gramin/blob/main/docs/ir-schema.md).

## License

MIT
